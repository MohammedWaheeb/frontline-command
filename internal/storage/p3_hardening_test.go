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
	if err := f.Put(ctx, "obj-2", []byte("more")); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("object quota not enforced", err)
	}
	// Replacing an existing object does not double-count its bytes.
	if err := f.Put(ctx, "obj-1", []byte("data")); err != nil {
		t.Fatal("replacement rejected", err)
	}
}
