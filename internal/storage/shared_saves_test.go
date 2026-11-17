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

// PutSharedSave must enforce the same per-owner quotas as PutSave, atomically
// for every participant, while idempotent retries stay allowed at quota.
func TestSharedSaveQuotaPerOwner(t *testing.T) {
	oldCount, oldBytes := maxSavesPerOwner, maxSaveBytesPerOwner
	maxSavesPerOwner, maxSaveBytesPerOwner = 2, 12
	t.Cleanup(func() { maxSavesPerOwner, maxSaveBytesPerOwner = oldCount, oldBytes })
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-1", "One", []byte("12345")); err != nil {
		t.Fatal(err)
	}
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-2", "Two", []byte("12345")); err != nil {
		t.Fatal(err)
	}
	// Third distinct checkpoint exceeds the count quota for both owners.
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-3", "Three", []byte("1")); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("shared save exceeded count quota silently", err)
	}
	// Idempotent retry of an existing checkpoint stays allowed at quota.
	if err := s.PutSharedSave(ctx, []string{a.ID, b.ID}, "coop-1", "One", []byte("12345")); err != nil {
		t.Fatal("idempotent shared retry rejected at quota", err)
	}
	// Byte quota: a fresh owner with room for one save rejects oversized data,
	// and the rejection is atomic for the other participant.
	c, _, _ := s.CreateProfile(ctx, "C")
	d, _, _ := s.CreateProfile(ctx, "D")
	if err := s.PutSharedSave(ctx, []string{c.ID, d.ID}, "coop-big", "Big", []byte("1234567890123")); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatal("shared save exceeded byte quota silently", err)
	}
	if saves, _ := s.ListSaves(ctx, c.ID); len(saves) != 0 {
		t.Fatal("over-quota shared save partially committed")
	}
	if saves, _ := s.ListSaves(ctx, d.ID); len(saves) != 0 {
		t.Fatal("over-quota shared save partially committed for peer")
	}
}
