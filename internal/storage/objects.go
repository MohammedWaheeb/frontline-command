package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Files struct{ Root string }

// Object-store bounds: replays/diagnostics accumulate one file per match, so
// Put enforces a generous whole-store cap instead of growing without limit.
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

// objectUsage totals stored bytes (excluding temps and the named object,
// whose replacement bytes are charged by the caller) and object count.
func (f Files) objectUsage(except string) (int64, int, error) {
	entries, err := os.ReadDir(f.Root)
	if err != nil {
		return 0, 0, err
	}
	var total int64
	count := 0
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		count++
		if e.Name() == except {
			continue
		}
		info, err := e.Info()
		if err != nil {
			return 0, 0, err
		}
		total += info.Size()
	}
	return total, count, nil
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
	f.sweepStaleTemps()
	used, count, err := f.objectUsage(id)
	if err != nil {
		return err
	}
	if _, statErr := os.Stat(filepath.Join(f.Root, id)); errors.Is(statErr, os.ErrNotExist) && count >= maxObjectCount {
		return ErrQuotaExceeded
	}
	if used+int64(len(data)) > maxObjectBytesTotal {
		return ErrQuotaExceeded
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
