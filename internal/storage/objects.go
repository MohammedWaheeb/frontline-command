package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"
)

type Files struct{ Root string }

// Files is copied into match actors. A bounded striped gate table serializes
// quota accounting, eviction and publication for every copy of the same store.
// Physical directory identity covers relative, case and Unicode aliases.
// Unrelated identities can proceed on different stripes; waiting is cancelable.
var objectWriteGates = func() [64]chan struct{} {
	var gates [64]chan struct{}
	for i := range gates {
		gates[i] = make(chan struct{}, 1)
		gates[i] <- struct{}{}
	}
	return gates
}()

func objectWriteGate(root string) chan struct{} {
	info, err := os.Stat(root)
	if err != nil {
		return objectWriteGates[0]
	}
	// These are the stable device/inode fields used by os.SameFile on Unix,
	// including macOS. Path spelling and mutable directory times are not IDs.
	// FileInfo.Sys is platform-specific: when these fields are unavailable,
	// conservatively serialize on one stripe instead of risking an alias bypass.
	metadata := reflect.ValueOf(info.Sys())
	if metadata.Kind() == reflect.Pointer && !metadata.IsNil() {
		metadata = metadata.Elem()
	}
	if metadata.Kind() != reflect.Struct {
		return objectWriteGates[0]
	}
	device, deviceOK := objectIdentityNumber(metadata.FieldByName("Dev"))
	inode, inodeOK := objectIdentityNumber(metadata.FieldByName("Ino"))
	if !deviceOK || !inodeOK || inode == 0 {
		return objectWriteGates[0]
	}
	var hash uint32 = 2166136261
	for _, value := range [2]uint64{device, inode} {
		for shift := 0; shift < 64; shift += 8 {
			hash = (hash ^ uint32(byte(value>>shift))) * 16777619
		}
	}
	return objectWriteGates[hash%uint32(len(objectWriteGates))]
}

func objectIdentityNumber(field reflect.Value) (uint64, bool) {
	switch field.Kind() {
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return field.Uint(), true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return uint64(field.Int()), true
	default:
		return 0, false
	}
}

// Object-store bounds: replays/diagnostics accumulate one file per match, so
// Put keeps the store under a whole-store cap by evicting the oldest objects
// instead of growing without limit.
// Vars so tests can shrink them.
var (
	maxObjectBytesTotal = int64(2 << 30)
	maxObjectCount      = 10000
	objectTempMaxAge    = time.Hour
)

// sweepStaleTemps removes .write-* files orphaned by a crash mid-Put. Only
// files older than objectTempMaxAge go, so a live concurrent write is safe.
func (f Files) sweepStaleTemps() {
	entries, err := os.ReadDir(f.Root)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-objectTempMaxAge)
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), ".write-") {
			continue
		}
		if info, err := e.Info(); err == nil && info.ModTime().Before(cutoff) {
			os.Remove(filepath.Join(f.Root, e.Name()))
		}
	}
}

type storedObject struct {
	name     string
	size     int64
	modified time.Time
}

// storedObjects lists stored objects other than the named one (whose
// replacement bytes are charged by the caller), oldest first. Temps are excluded.
func (f Files) storedObjects(except string) ([]storedObject, error) {
	entries, err := os.ReadDir(f.Root)
	if err != nil {
		return nil, err
	}
	out := []storedObject{}
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") || e.Name() == except {
			continue
		}
		info, err := e.Info()
		if err != nil {
			return nil, err
		}
		out = append(out, storedObject{e.Name(), info.Size(), info.ModTime()})
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].modified.Equal(out[j].modified) {
			return out[i].modified.Before(out[j].modified)
		}
		return out[i].name < out[j].name
	})
	return out, nil
}

// Match IDs may use the full ID limit before the server adds its object suffix.
func validObjectID(id string) bool {
	if ValidID(id) {
		return true
	}
	for _, suffix := range []string{".diagnostic", ".replay"} {
		if strings.HasSuffix(id, suffix) && ValidID(strings.TrimSuffix(id, suffix)) {
			return true
		}
	}
	return false
}

func (f Files) Put(ctx context.Context, id string, data []byte) error {
	if !validObjectID(id) || len(data) > 64<<20 {
		return errors.New("invalid object")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(f.Root, 0700); err != nil {
		return err
	}
	// Stat after MkdirAll so aliases to a newly created root use the same
	// physical identity. No eviction or temporary write happens before the gate.
	gate := objectWriteGate(f.Root)
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-gate:
	}
	defer func() { gate <- struct{}{} }()
	if err := ctx.Err(); err != nil {
		return err
	}
	f.sweepStaleTemps()
	if int64(len(data)) > maxObjectBytesTotal {
		return ErrQuotaExceeded
	}
	others, err := f.storedObjects(id)
	if err != nil {
		return err
	}
	target, statErr := os.Lstat(filepath.Join(f.Root, id))
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return statErr
	}
	if statErr == nil && !target.Mode().IsRegular() {
		return errors.New("invalid object target")
	}
	adding := errors.Is(statErr, os.ErrNotExist)
	var used int64
	for _, o := range others {
		used += o.size
	}
	tmp, err := os.CreateTemp(f.Root, ".write-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	// Evict only after the replacement bytes are durably staged. A failed or
	// canceled write must not erase old history before it has anything to
	// publish. Staging is temporary and bounded by the 64 MiB object limit;
	// a physically full disk may reject it while leaving old history intact.
	// Eviction plus rename is not a multi-file transaction: hardware failures
	// during that final publication can still leave history unavailable.
	for len(others) > 0 && (used+int64(len(data)) > maxObjectBytesTotal || adding && len(others) >= maxObjectCount) {
		if err := os.Remove(filepath.Join(f.Root, others[0].name)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		used -= others[0].size
		others = others[1:]
	}
	if err = os.Rename(name, filepath.Join(f.Root, id)); err != nil {
		return err
	}
	dir, err := os.Open(f.Root)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
func (f Files) Get(ctx context.Context, id string) ([]byte, error) {
	if !validObjectID(id) {
		return nil, errors.New("invalid object ID")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b, err := os.ReadFile(filepath.Join(f.Root, id))
	if errors.Is(err, os.ErrNotExist) {
		err = ErrNotFound
	}
	return b, err
}
