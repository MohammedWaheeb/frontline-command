package storage

import (
	"context"
	"errors"
	"testing"
)

func TestSharedCheckpointsAreAtomicAndDoNotOverwrite(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	if err := s.PutSharedSave(ctx, []string{a.ID, "missing"}, "coop-1", "Opening", []byte("snapshot")); err == nil {
		t.Fatal("invalid participant accepted")
	}
	if saves, _ := s.ListSaves(ctx, a.ID); len(saves) != 0 {
		t.Fatal("partially committed checkpoint")
	}
	for range 2 {
		if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-1", "Opening", []byte("snapshot")); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-1", "Opening", []byte("replacement")); !errors.Is(err, ErrConflict) {
		t.Fatal("checkpoint overwrote prior content")
	}
	for _, id := range []string{a.ID, b.ID} {
		v, err := s.GetSave(ctx, id, "coop-1")
		if err != nil || string(v.Data) != "snapshot" || v.Revision != 1 {
			t.Fatal("idempotent checkpoint mismatch", err)
		}
	}
}
