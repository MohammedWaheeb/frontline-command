package storage

import (
	"context"
	"database/sql"
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
func TestResultPayloadChecksumDetectsTamper(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, err := s.CreateProfile(ctx, "Alpha")
	if err != nil {
		t.Fatal(err)
	}
	b, _, err := s.CreateProfile(ctx, "Bravo")
	if err != nil {
		t.Fatal(err)
	}
	// Match access rows must exist before a result commits (FK + cleanup).
	if err := s.StartMatchAccess(ctx, "rated-1", 0, []byte("seed"), []MatchMember{{Profile: a.ID, Player: 1}, {Profile: b.ID, Player: 2}}, false); err != nil {
		t.Fatal(err)
	}
	rated := Result{ID: "rated-1", Payload: []byte(`{"winner":1}`), Rating: &RatingMatch{Profiles: [2]string{a.ID, b.ID}, Winner: a.ID}}
	if _, err := s.CommitResult(ctx, rated); err != nil {
		t.Fatal(err)
	}
	if got, err := s.GetResult(ctx, "rated-1"); err != nil || string(got.Payload) != string(rated.Payload) {
		t.Fatal("rated result readback", err)
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE results SET payload=? WHERE id=?", []byte(`{"winner":2}`), "rated-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetResult(ctx, "rated-1"); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered payload accepted by GetResult", err)
	}
	if _, err := s.ListResults(ctx, 10); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered payload accepted by ListResults", err)
	}
	if _, err := s.ListOwnResults(ctx, a.ID, 10); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered payload accepted by ListOwnResults", err)
	}
}

func TestSaveQuotaPerOwner(t *testing.T) {
	oldCount, oldBytes := maxSavesPerOwner, maxSaveBytesPerOwner
	maxSavesPerOwner, maxSaveBytesPerOwner = 2, 12
	t.Cleanup(func() { maxSavesPerOwner, maxSaveBytesPerOwner = oldCount, oldBytes })
	s := repository(t)
	ctx := context.Background()
	p, _, err := s.CreateProfile(ctx, "Saver")
	if err != nil {
		t.Fatal(err)
	}
	one, err := s.PutSave(ctx, Save{ID: "slot-1", Owner: p.ID, Data: []byte("12345")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutSave(ctx, Save{ID: "slot-2", Owner: p.ID, Data: []byte("12345")}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutSave(ctx, Save{ID: "slot-3", Owner: p.ID, Data: []byte("1")}, 0); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("third save exceeded count quota silently", err)
	}
	// Updating an existing save within the byte budget stays allowed.
	one.Data = []byte("1234567")
	if _, err := s.PutSave(ctx, one, one.Revision); err != nil {
		t.Fatal("in-quota update rejected", err)
	}
	// Growing past the byte budget is rejected.
	current, err := s.GetSave(ctx, p.ID, "slot-1")
	if err != nil {
		t.Fatal(err)
	}
	current.Data = []byte("123456789")
	if _, err := s.PutSave(ctx, current, current.Revision); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("over-budget update accepted", err)
	}
}

func TestResultIntegrityMigrationFromV8(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte(`{"legacy":true}`)
	for _, stmt := range []string{
		`CREATE TABLE results(id TEXT PRIMARY KEY,payload BLOB NOT NULL,created INTEGER NOT NULL,void INTEGER NOT NULL,checksum TEXT NOT NULL)`,
		`PRAGMA user_version=8`,
	} {
		if _, err := raw.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := raw.Exec(`INSERT INTO results(id,payload,created,void,checksum) VALUES(?,?,?,?,?)`, "legacy-1", payload, 1700000000, false, digest(payload)); err != nil {
		t.Fatal(err)
	}
	if err := raw.Close(); err != nil {
		t.Fatal(err)
	}
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var version int
	if err := s.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil || version != 9 {
		t.Fatal("legacy database not migrated", version, err)
	}
	ctx := context.Background()
	if got, err := s.GetResult(ctx, "legacy-1"); err != nil || string(got.Payload) != string(payload) {
		t.Fatal("migrated result unreadable", err)
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE results SET payload=? WHERE id=?", []byte(`{"legacy":false}`), "legacy-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetResult(ctx, "legacy-1"); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampered migrated payload accepted", err)
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
