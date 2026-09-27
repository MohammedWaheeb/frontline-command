package storage

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func repository(t *testing.T) *SQLite {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func TestAccountAndSaveContracts(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, token, err := s.CreateProfile(ctx, "Commander")
	if err != nil {
		t.Fatal(err)
	}
	auth, err := s.Authenticate(ctx, token)
	if err != nil || auth.ID != p.ID {
		t.Fatal("login", err)
	}
	if _, err = s.Authenticate(ctx, "bogus"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("invalid token accepted")
	}
	v, err := s.PutSave(ctx, Save{ID: "slot-1", Owner: p.ID, Name: "Campaign", Data: []byte("checkpoint")}, 0)
	if err != nil || v.Revision != 1 {
		t.Fatal(err)
	}
	if _, err = s.PutSave(ctx, v, 0); !errors.Is(err, ErrConflict) {
		t.Fatal("stale save overwrote current")
	}
	read, err := s.GetSave(ctx, p.ID, v.ID)
	if err != nil || string(read.Data) != "checkpoint" {
		t.Fatal(err)
	}
	if _, err = s.GetSave(ctx, "another-owner", v.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("save ownership leak")
	}
	if err = s.DeleteSave(ctx, p.ID, v.ID, 0); !errors.Is(err, ErrConflict) {
		t.Fatal("stale delete")
	}
	if err = s.DeleteSave(ctx, p.ID, v.ID, 1); err != nil {
		t.Fatal(err)
	}
}
func TestResultsIdempotentConcurrent(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	var mu sync.Mutex
	commits := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fresh, err := s.CommitResult(ctx, Result{ID: "match-1", Payload: []byte(`{"winner":1}`)})
			if err != nil {
				t.Error(err)
			}
			if fresh {
				mu.Lock()
				commits++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if commits != 1 {
		t.Fatal("duplicate results committed", commits)
	}
	if _, err := s.CommitResult(ctx, Result{ID: "match-1", Payload: []byte(`{"winner":2}`)}); !errors.Is(err, ErrConflict) {
		t.Fatal("conflicting result accepted")
	}
}
func TestMapOwnershipAndBackup(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, _ := s.CreateProfile(ctx, "Mapper")
	q, _, _ := s.CreateProfile(ctx, "Other")
	v, err := s.PutMap(ctx, MapRecord{ID: "map-one", Owner: p.ID, Title: "Map", Data: []byte("data")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	v.Owner = q.ID
	if _, err = s.PutMap(ctx, v, 1); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("foreign map overwritten")
	}
	path := filepath.Join(t.TempDir(), "backup.db")
	if err = s.Backup(ctx, path); err != nil {
		t.Fatal(err)
	}
	backup, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	if _, err = backup.GetMap(ctx, "map-one"); err != nil {
		t.Fatal("backup lost map", err)
	}
}
func TestAtomicObjectsAndTraversal(t *testing.T) {
	ctx := context.Background()
	f := Files{Root: t.TempDir()}
	if err := f.Put(ctx, "replay-one", []byte("complete")); err != nil {
		t.Fatal(err)
	}
	if b, err := f.Get(ctx, "replay-one"); err != nil || string(b) != "complete" {
		t.Fatal(err)
	}
	for _, id := range []string{"../escape", "/absolute", "..", "a/b"} {
		if err := f.Put(ctx, id, []byte("x")); err == nil {
			t.Fatal("path escape accepted")
		}
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if err := f.Put(cancelled, "replay-one", []byte("partial")); err == nil {
		t.Fatal("canceled write succeeded")
	}
	if b, _ := f.Get(ctx, "replay-one"); string(b) != "complete" {
		t.Fatal("interrupted write corrupted prior object")
	}
}
