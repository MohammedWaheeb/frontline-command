package storage

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func TestSaveRecreateNeverReusesRevisionAfterReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "saves.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	p, _, err := s.CreateProfile(ctx, "Commander")
	if err != nil {
		t.Fatal(err)
	}
	old, err := s.PutSave(ctx, Save{Owner: p.ID, ID: "slot", Name: "Before", Data: []byte("old")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteSave(ctx, p.ID, "slot", old.Revision); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetSave(ctx, p.ID, "slot"); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted slot stayed visible", err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	fresh, err := s.PutSave(ctx, Save{Owner: p.ID, ID: "slot", Name: "After", Data: []byte("new")}, 0)
	if err != nil || fresh.Revision != old.Revision+1 {
		t.Fatal("revision reused", fresh.Revision, err)
	}
	if _, err = s.PutSave(ctx, old, old.Revision); !errors.Is(err, ErrConflict) {
		t.Fatal("stale overwrite", err)
	}
	if err = s.DeleteSave(ctx, p.ID, "slot", old.Revision); !errors.Is(err, ErrConflict) {
		t.Fatal("stale delete", err)
	}
	current, err := s.GetSave(ctx, p.ID, "slot")
	if err != nil || string(current.Data) != "new" {
		t.Fatal("new data lost", err)
	}
	backupPath := filepath.Join(t.TempDir(), "backup.db")
	if err = s.DeleteSave(ctx, p.ID, "slot", fresh.Revision); err != nil {
		t.Fatal(err)
	}
	if err = s.Backup(ctx, backupPath); err != nil {
		t.Fatal(err)
	}
	backup, err := Open(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	restored, err := backup.PutSave(ctx, old, 0)
	if err != nil || restored.Revision != 3 {
		t.Fatal("database backup lost tombstone", restored.Revision, err)
	}
}

func TestSharedCheckpointRecreationUsesSameSaveRevisionAllocator(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop", "Checkpoint", []byte("exact")); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSave(ctx, a.ID, "coop", 1); err != nil {
		t.Fatal(err)
	}
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop", "Checkpoint", []byte("exact")); err != nil {
		t.Fatal(err)
	}
	first, _ := s.GetSave(ctx, a.ID, "coop")
	second, _ := s.GetSave(ctx, b.ID, "coop")
	if first.Revision != 2 || second.Revision != 1 {
		t.Fatal("shared revisions", first.Revision, second.Revision)
	}
	if _, err := s.PutSave(ctx, first, 1); !errors.Is(err, ErrConflict) {
		t.Fatal("old checkpoint overwrote recreated file", err)
	}
	// A failed second participant must roll back the first participant's ledger too.
	if err := s.PutSharedSave(ctx, []string{a.ID, "missing"}, "new-coop", "Checkpoint", []byte("exact")); err == nil {
		t.Fatal("missing profile accepted")
	}
	fresh, err := s.PutSave(ctx, Save{Owner: a.ID, ID: "new-coop", Name: "Manual", Data: []byte("new")}, 0)
	if err != nil || fresh.Revision != 1 {
		t.Fatal("rolled back transaction consumed revision", fresh.Revision, err)
	}
}

func TestRevisionMigrationFromVersionFourPreservesAllCASRecords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER NOT NULL,token_hash TEXT UNIQUE NOT NULL)`,
		`INSERT INTO profiles VALUES('owner','Legacy',1,'legacy-hash')`,
		`CREATE TABLE saves(owner TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(owner,id))`,
		`INSERT INTO saves VALUES('owner','slot','Legacy save',17,1,X'00FF80')`,
		`CREATE TABLE maps(id TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,revision INTEGER NOT NULL,data BLOB NOT NULL)`,
		`INSERT INTO maps VALUES('map','owner','Legacy map',13,X'0102')`,
		`CREATE TABLE profile_settings(owner TEXT PRIMARY KEY,revision INTEGER NOT NULL,data BLOB NOT NULL)`,
		`INSERT INTO profile_settings VALUES('owner',7,'{"scale":100}')`,
		`PRAGMA user_version=4`,
	} {
		if _, err = db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	saved, err := s.GetSave(ctx, "owner", "slot")
	if err != nil || saved.Revision != 17 || string(saved.Data) != string([]byte{0, 255, 128}) {
		t.Fatal("legacy bytes lost", saved, err)
	}
	if err = s.DeleteSave(ctx, "owner", "slot", 17); err != nil {
		t.Fatal(err)
	}
	saved, err = s.PutSave(ctx, saved, 0)
	if err != nil || saved.Revision != 18 {
		t.Fatal("legacy revision reset", saved.Revision, err)
	}
	setting, err := s.PutSettings(ctx, "owner", 7, []byte(`{"scale":110}`))
	if err != nil || setting.Revision != 8 {
		t.Fatal("setting migration", setting, err)
	}
	m, err := s.GetMap(ctx, "map")
	if err != nil {
		t.Fatal(err)
	}
	if m.Published || m.Removed || m.ContentRevision != 13 || m.OwnerName != "Legacy" || string(m.Data) != string([]byte{1, 2}) {
		t.Fatal("legacy map publication or bytes changed", m)
	}
	oldMap, err := s.MapVersion(ctx, "map", 13)
	if err != nil || string(oldMap) != string([]byte{1, 2}) {
		t.Fatal("legacy immutable evidence missing", oldMap, err)
	}
	m, err = s.PutMap(ctx, m, 13)
	if err != nil || m.Revision != 14 {
		t.Fatal("map migration", m, err)
	}
	var version int
	s.db.QueryRow(`PRAGMA user_version`).Scan(&version)
	if version != 7 {
		t.Fatal("wrong schema version", version)
	}
}

func TestRevisionLedgerCoversSettingsMapsAndRejectsOverflow(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, _ := s.CreateProfile(ctx, "Commander")
	setting, err := s.PutSettings(ctx, p.ID, 0, []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	m, err := s.PutMap(ctx, MapRecord{ID: "map", Owner: p.ID, Title: "Fixture", Data: []byte("map")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	// Neither type currently has a public delete. A future deletion must retain
	// this ledger; even deletion of a live row does not reset its allocator.
	if _, err = s.db.Exec(`DELETE FROM profile_settings WHERE owner=?`, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`DELETE FROM maps WHERE id='map'`); err != nil {
		t.Fatal(err)
	}
	setting, err = s.PutSettings(ctx, p.ID, 0, []byte(`{}`))
	if err != nil || setting.Revision != 2 {
		t.Fatal("settings revision reset", setting, err)
	}
	m, err = s.PutMap(ctx, m, 0)
	if err != nil || m.Revision != 2 {
		t.Fatal("map revision reset", m, err)
	}
	saved, err := s.PutSave(ctx, Save{ID: "limit", Owner: p.ID, Name: "Retain", Data: []byte("safe")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`UPDATE record_revisions SET revision=? WHERE kind='save' AND owner=? AND id='limit'`, maxRevision, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.PutSave(ctx, saved, 1); err == nil {
		t.Fatal("overflow accepted")
	}
	saved, err = s.GetSave(ctx, p.ID, "limit")
	if err != nil || saved.Revision != 1 || string(saved.Data) != "safe" {
		t.Fatal("overflow changed record", saved, err)
	}
}

func TestConcurrentRecreateHasOneWinnerAndNoStaleABAWrite(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, _ := s.CreateProfile(ctx, "Commander")
	old, err := s.PutSave(ctx, Save{ID: "slot", Owner: p.ID, Name: "Old", Data: []byte("old")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteSave(ctx, p.ID, "slot", 1); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value, err := s.PutSave(ctx, old, 0)
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
				if value.Revision != 2 {
					t.Error("reused revision", value.Revision)
				}
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if success != 1 {
		t.Fatal("expected exactly one creator", success)
	}
	if _, err = s.PutSave(ctx, old, 1); !errors.Is(err, ErrConflict) {
		t.Fatal("stale write accepted", err)
	}
}

func TestFutureDatabaseIsRejectedWithoutDowngrade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "future.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`PRAGMA user_version=8`); err != nil {
		t.Fatal(err)
	}
	if s, err := Open(path); err == nil {
		s.Close()
		t.Fatal("future database opened")
	}
	var version int
	if err = db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil || version != 8 {
		t.Fatal("future database changed", version, err)
	}
}
