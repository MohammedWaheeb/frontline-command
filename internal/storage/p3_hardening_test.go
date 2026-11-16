package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSynchronousFullEnabled(t *testing.T) {
	s := repository(t)
	var mode int
	if err := s.db.QueryRow(`PRAGMA synchronous`).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != 2 { // FULL
		t.Fatalf("synchronous=%d, want FULL (2)", mode)
	}
}

func TestSaveChecksumDetectsTamper(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, err := s.CreateProfile(ctx, "Commander")
	if err != nil {
		t.Fatal(err)
	}
	v, err := s.PutSave(ctx, Save{ID: "slot-1", Owner: p.ID, Name: "Run", Data: []byte("checkpoint")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.ExecContext(ctx, "UPDATE saves SET data=? WHERE owner=? AND id=?", []byte("tampered"), p.ID, v.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetSave(ctx, p.ID, v.ID); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered save accepted", err)
	}
}

func TestSharedSaveChecksumDetectsTamper(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, err := s.CreateProfile(ctx, "Commander")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.PutSharedSave(ctx, []string{p.ID}, "coop-1", "Coop", []byte("shared")); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.ExecContext(ctx, "UPDATE saves SET data=? WHERE owner=? AND id=?", []byte("tampered"), p.ID, "coop-1"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetSave(ctx, p.ID, "coop-1"); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered shared save accepted", err)
	}
}

func TestFilesPutQuotaAndSweepsStaleTemps(t *testing.T) {
	root := t.TempDir()
	f := Files{Root: root}
	ctx := context.Background()
	stale := filepath.Join(root, ".write-stale")
	fresh := filepath.Join(root, ".write-fresh")
	if err := os.WriteFile(stale, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fresh, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-2 * objectTempMaxAge)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}
	if err := f.Put(ctx, "obj-1", []byte("data")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("stale .write-* temp not swept", err)
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("fresh .write-* temp wrongly swept", err)
	}
	defer func(v int64) { maxObjectBytesTotal = v }(maxObjectBytesTotal)
	maxObjectBytesTotal = 7 // obj-1 holds 4 bytes; another 4-byte put exceeds
	// Replacing an existing object does not double-count its bytes.
	if err := f.Put(ctx, "obj-1", []byte("data")); err != nil {
		t.Fatal("replacement rejected", err)
	}
	old = time.Now().Add(-time.Minute)
	if err := os.Chtimes(filepath.Join(root, "obj-1"), old, old); err != nil {
		t.Fatal(err)
	}
	// At the cap the oldest object makes room for the newest.
	if err := f.Put(ctx, "obj-2", []byte("more")); err != nil {
		t.Fatal("full store refused a new object", err)
	}
	if _, err := os.Stat(filepath.Join(root, "obj-1")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("oldest object not evicted", err)
	}
	if got, err := f.Get(ctx, "obj-2"); err != nil || string(got) != "more" {
		t.Fatal("new object not stored", err)
	}
	// An object larger than the whole store is still refused.
	if err := f.Put(ctx, "obj-3", []byte("too large")); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("oversized object accepted", err)
	}
	if _, err := f.Get(ctx, "obj-2"); err != nil {
		t.Fatal("oversized put evicted existing objects", err)
	}
	defer func(v int) { maxObjectCount = v }(maxObjectCount)
	maxObjectBytesTotal, maxObjectCount = 1<<20, 1
	if err := f.Put(ctx, "obj-4", []byte("x")); err != nil {
		t.Fatal("count cap refused a new object", err)
	}
	if _, err := os.Stat(filepath.Join(root, "obj-2")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("count cap did not evict the oldest object", err)
	}
}
