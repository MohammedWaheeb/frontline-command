package storage

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func TestRenameProfilePersistsIdentityAndUnicode(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "profiles.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { s.Close() }()
	before, token, err := s.CreateProfile(ctx, "Before")
	if err != nil {
		t.Fatal(err)
	}
	other, otherToken, err := s.CreateProfile(ctx, "قائد")
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := s.RenameProfile(ctx, before.ID, "  قائد  ")
	if err != nil || renamed.ID != before.ID || renamed.Created != before.Created || !renamed.Local || renamed.Name != other.Name {
		t.Fatal(renamed, err)
	}
	for _, name := range []string{"", " \t", "<name>", "a\x00b", "a\u200db", "123456789012345678901234567890123"} {
		if _, err = s.RenameProfile(ctx, before.ID, name); err == nil {
			t.Fatalf("accepted invalid name %q", name)
		}
	}
	if _, err = s.RenameProfile(ctx, "missing", "Valid"); !errors.Is(err, ErrNotFound) {
		t.Fatal("missing identity", err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, pair := range []struct {
		token string
		want  Profile
	}{{token, renamed}, {otherToken, other}} {
		got, err := s.Authenticate(ctx, pair.token)
		if err != nil || got != pair.want {
			t.Fatal("reopened identity/token", got, pair.want, err)
		}
	}
}
func TestRenameProfileConcurrentReadsAndWrites(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, token, err := s.CreateProfile(ctx, "Before")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 5; j++ {
				got, err := s.RenameProfile(ctx, p.ID, "After")
				if err != nil || got.ID != p.ID || got.Created != p.Created {
					t.Error(got, err)
					return
				}
				got, err = s.Authenticate(ctx, token)
				if err != nil || got.Name != "After" || got.ID != p.ID {
					t.Error(got, err)
					return
				}
			}
		}()
	}
	wg.Wait()
}
