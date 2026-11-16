package storage

import (
	"context"
	"database/sql/driver"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestReplacementConnectionRetainsStoragePolicy(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	profile, _, err := s.CreateProfile(ctx, "Retained account")
	if err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		conn, err := s.db.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if err := conn.Raw(func(any) error { return driver.ErrBadConn }); !errors.Is(err, driver.ErrBadConn) {
			t.Fatal("old connection was not retired", err)
		}
		conn.Close()
		for pragma, want := range map[string]int{"foreign_keys": 1, "busy_timeout": 5000, "synchronous": 2} {
			var got int
			if err := s.db.QueryRow("PRAGMA " + pragma).Scan(&got); err != nil || got != want {
				t.Errorf("replacement %d lost %s policy: got=%d want=%d err=%v", attempt, pragma, got, want, err)
			}
		}
		var mode string
		if err := s.db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
			t.Errorf("replacement changed WAL: %s %v", mode, err)
		}
		if _, err := s.PutSave(ctx, Save{Owner: "missing-owner", ID: "orphan", Data: []byte("orphan")}, 0); err == nil {
			t.Error("replacement connection accepted a save without its profile")
		}
		if _, err := s.PutSave(ctx, Save{Owner: profile.ID, ID: "valid", Data: []byte("saved")}, int64(attempt)); err != nil {
			t.Fatal("replacement could not save valid data", err)
		}
	}
	if s.db.Stats().MaxOpenConnections != 1 {
		t.Fatal("storage policy changed single-connection pool")
	}
}

func TestDatabaseLiteralPathSurvivesConnectionReplacementAndReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state ?#%+\u00e9.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	p, token, err := s.CreateProfile(ctx, "Literal path")
	if err != nil {
		s.Close()
		t.Fatal(err)
	}
	conn, err := s.db.Conn(ctx)
	if err != nil {
		s.Close()
		t.Fatal(err)
	}
	conn.Raw(func(any) error { return driver.ErrBadConn })
	conn.Close()
	if read, err := s.Authenticate(ctx, token); err != nil || read.ID != p.ID {
		s.Close()
		t.Fatalf("replacement opened a different database: %+v %v", read, err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("literal filename was not used", err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if read, err := s.Authenticate(ctx, token); err != nil || read.ID != p.ID {
		t.Fatalf("reopen lost literal-path profile: %+v %v", read, err)
	}
}

func TestMemoryDatabaseRemainsPrivateWithConnectionPolicy(t *testing.T) {
	first, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	_, token, err := first.CreateProfile(context.Background(), "Private memory")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := second.Authenticate(context.Background(), token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("independent memory databases shared data: %v", err)
	}
	for _, store := range []*SQLite{first, second} {
		var foreignKeys int
		if err := store.db.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys); err != nil || foreignKeys != 1 {
			t.Fatalf("memory store lost foreign-key policy: %d %v", foreignKeys, err)
		}
	}
}
