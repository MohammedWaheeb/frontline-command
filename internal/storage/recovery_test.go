package storage

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type unavailableRecoveryObjects struct{}

func (unavailableRecoveryObjects) Put(context.Context, string, []byte) error {
	return errors.New("object store unavailable")
}
func (unavailableRecoveryObjects) Get(context.Context, string) ([]byte, error) {
	return nil, errors.New("object store unavailable")
}

func seedStaleJournal(t *testing.T, s *SQLite, id string) {
	t.Helper()
	if _, err := s.db.Exec(`INSERT INTO active_matches(id,tick,data,updated) VALUES(?,12,?,0)`, id, []byte("checkpoint")); err != nil {
		t.Fatal(err)
	}
}

func requireNoJournal(t *testing.T, s *SQLite, id string) {
	t.Helper()
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM active_matches WHERE id=?`, id).Scan(&count); err != nil || count != 0 {
		t.Fatalf("active journal remains: count=%d err=%v", count, err)
	}
}

func TestResultRetryRetiresStaleJournal(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	result := Result{ID: "retry-journal", Payload: []byte(`{"finished":true}`)}
	if fresh, err := s.CommitResult(ctx, result); !fresh || err != nil {
		t.Fatalf("initial commit: fresh=%v err=%v", fresh, err)
	}
	seedStaleJournal(t, s, result.ID)
	if fresh, err := s.CommitResult(ctx, result); fresh || err != nil {
		t.Fatalf("retry: fresh=%v err=%v", fresh, err)
	}
	requireNoJournal(t, s, result.ID)
}

func TestRecoveryPreservesCompletedResultWithoutObjectStore(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	result := Result{ID: "completed-journal", Payload: []byte(`{"winner":1}`)}
	if _, err := s.CommitResult(ctx, result); err != nil {
		t.Fatal(err)
	}
	seedStaleJournal(t, s, result.ID)
	if count, err := s.RecoverInterrupted(ctx, unavailableRecoveryObjects{}); count != 1 || err != nil {
		t.Fatalf("recover completed match: count=%d err=%v", count, err)
	}
	got, err := s.GetResult(ctx, result.ID)
	if err != nil || got.Void || string(got.Payload) != string(result.Payload) {
		t.Fatalf("completed result changed: %+v err=%v", got, err)
	}
	requireNoJournal(t, s, result.ID)
	if count, err := s.RecoverInterrupted(ctx, unavailableRecoveryObjects{}); count != 0 || err != nil {
		t.Fatalf("repeat recovery: count=%d err=%v", count, err)
	}
}

func TestStartMatchRejectsCompletedLegacyID(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	if _, err := s.CommitResult(ctx, Result{ID: "legacy-result", Payload: []byte("complete")}); err != nil {
		t.Fatal(err)
	}
	if err := s.StartMatch(ctx, "legacy-result", 0, []byte("checkpoint")); !errors.Is(err, ErrConflict) {
		t.Fatalf("completed ID reused: %v", err)
	}
	requireNoJournal(t, s, "legacy-result")
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM match_access WHERE match_id='legacy-result'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed start left access record: count=%d err=%v", count, err)
	}
}

func TestRecoveryArchivesMaximumLengthMatchID(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	id := strings.Repeat("m", 80)
	checkpoint := []byte("last trustworthy checkpoint")
	if err := s.StartMatch(ctx, id, 42, checkpoint); err != nil {
		t.Fatal(err)
	}
	objects := Files{Root: t.TempDir()}
	if count, err := s.RecoverInterrupted(ctx, objects); count != 1 || err != nil {
		t.Fatalf("recovery: count=%d err=%v", count, err)
	}
	if data, err := objects.Get(ctx, id+".diagnostic"); err != nil || string(data) != string(checkpoint) {
		t.Fatalf("diagnostic lost: %q err=%v", data, err)
	}
	if result, err := s.GetResult(ctx, id); err != nil || !result.Void {
		t.Fatalf("interrupted match not voided: %+v err=%v", result, err)
	}
	requireNoJournal(t, s, id)
}

func TestObjectSuffixesPreserveIDBoundary(t *testing.T) {
	objects := Files{Root: t.TempDir()}
	ctx := context.Background()
	for _, suffix := range []string{".diagnostic", ".replay"} {
		id := strings.Repeat("m", 80) + suffix
		if err := objects.Put(ctx, id, []byte("evidence")); err != nil {
			t.Fatal(err)
		}
		if _, err := objects.Get(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{strings.Repeat("m", 81) + ".replay", "../escape.diagnostic", "/absolute.replay", strings.Repeat("m", 80) + ".other"} {
		if err := objects.Put(ctx, id, []byte("invalid")); err == nil {
			t.Fatalf("invalid object ID accepted: %q", id)
		}
		if _, err := objects.Get(ctx, id); err == nil {
			t.Fatalf("invalid object ID read: %q", id)
		}
	}
}
