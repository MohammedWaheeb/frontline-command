package storage

import (
	"context"
	"errors"
	"sync"
	"testing"
)

func TestRatedCommitIsAtomicAndIdempotent(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "Alpha")
	b, _, _ := s.CreateProfile(ctx, "Bravo")
	result := Result{ID: "ranked-one", Payload: []byte(`{"winner":1}`), Rating: &RatingMatch{Profiles: [2]string{a.ID, b.ID}, Winner: a.ID}}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.CommitResult(ctx, result); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	ar, _ := s.GetRating(ctx, a.ID)
	br, _ := s.GetRating(ctx, b.ID)
	if ar.Rating != 1020 || br.Rating != 980 || ar.Games != 1 || ar.Wins != 1 || br.Losses != 1 || ar.PlacementRemaining != 9 {
		t.Fatal("duplicate or incorrect ratings", ar, br)
	}
	changes, err := s.RatingChanges(ctx, result.ID)
	if err != nil || len(changes) != 2 {
		t.Fatal("missing rating audit", err)
	}
	result.Rating = &RatingMatch{Profiles: [2]string{a.ID, b.ID}, Winner: b.ID}
	if _, err = s.CommitResult(ctx, result); !errors.Is(err, ErrConflict) {
		t.Fatal("conflicting rating retry", err)
	}
	result.ID = "invalid-rated"
	result.Rating.Profiles[1] = "missing-profile"
	if _, err = s.CommitResult(ctx, result); err == nil {
		t.Fatal("accepted invalid rating recipient")
	}
	if _, err = s.GetResult(ctx, result.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("result committed without atomic rating", err)
	}
}
func TestDrawAndVoidNeverMoveRating(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	result := Result{ID: "draw", Payload: []byte(`{"draw":true}`), Rating: &RatingMatch{Profiles: [2]string{a.ID, b.ID}, Draw: true}}
	if _, err := s.CommitResult(ctx, result); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{a.ID, b.ID} {
		r, _ := s.GetRating(ctx, id)
		if r.Rating != 1000 || r.Games != 1 {
			t.Fatal("draw moved rating", r)
		}
	}
	result.ID = "void-rated"
	result.Void = true
	if _, err := s.CommitResult(ctx, result); err == nil {
		t.Fatal("void result carried rating effects")
	}
	result.Rating = nil
	if _, err := s.CommitResult(ctx, result); err != nil {
		t.Fatal(err)
	}
	ar, _ := s.GetRating(ctx, a.ID)
	if ar.Games != 1 {
		t.Fatal("outage counted as a rated game")
	}
}
