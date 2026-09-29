package storage

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"testing"
)

func TestMapPublicationCASAndModeratedRepair(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	owner, _, _ := s.CreateProfile(ctx, "Author")
	reader, _, _ := s.CreateProfile(ctx, "Reader")
	v, err := s.PutMap(ctx, MapRecord{ID: "original", Owner: owner.ID, Title: "Original", Data: []byte(`{"version":1}`), Published: true, Removed: true, OwnerName: "Forged"}, 0)
	if err != nil || v.Published || v.Removed || v.OwnerName != "Author" || v.ContentRevision != 1 {
		t.Fatal("new map policy", v, err)
	}
	if _, err = s.CreateMapReport(ctx, reader.ID, v.ID, "Not actually public"); !errors.Is(err, ErrNotFound) {
		t.Fatal("private map report", err)
	}
	if _, err = s.PublishMap(ctx, v.ID, reader.ID, true, 1); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("foreign publication", err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.PublishMap(ctx, v.ID, owner.ID, true, 1); results <- err }()
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatal("publication CAS", success, conflicts)
	}
	report, err := s.CreateMapReport(ctx, reader.ID, v.ID, "The shared content needs review")
	if err != nil {
		t.Fatal(err)
	}
	duplicate, err := s.CreateMapReport(ctx, reader.ID, v.ID, report.Reason)
	if err != nil || duplicate.ID != report.ID {
		t.Fatal("duplicate report", duplicate, err)
	}
	v, _ = s.GetMap(ctx, v.ID)
	review, err := s.ReviewMapReport(ctx, report.ID, "removed", "Observed reported issue", 0, v.Revision)
	if err != nil || review.Revision != 1 {
		t.Fatal(review, err)
	}
	v, _ = s.GetMap(ctx, v.ID)
	if !v.Removed || v.Published {
		t.Fatal("removal not atomic", v)
	}
	if _, err = s.PublishMap(ctx, v.ID, owner.ID, true, v.Revision); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("owner bypassed removal", err)
	}
	oldRevision := v.Revision
	v.Data = []byte(`{"version":2}`)
	v.Removed = false
	v.Published = true
	v, err = s.PutMap(ctx, v, oldRevision)
	if err != nil || !v.Removed || v.Published {
		t.Fatal("edit bypassed moderation", v, err)
	}
	original, err := s.MapVersion(ctx, v.ID, report.MapRevision)
	if err != nil || !bytes.Equal(original, []byte(`{"version":1}`)) {
		t.Fatal("original evidence overwritten", string(original), err)
	}
	if _, err = s.ReviewMapReport(ctx, report.ID, "restored", "Repair checked", 1, oldRevision); !errors.Is(err, ErrConflict) {
		t.Fatal("stale map review", err)
	}
	latest, _ := s.GetMapReport(ctx, report.ID)
	if latest.Revision != 1 {
		t.Fatal("failed review partially committed", latest)
	}
	if _, err = s.ReviewMapReport(ctx, report.ID, "restored", "Repair checked", 1, v.Revision); err != nil {
		t.Fatal(err)
	}
	v, _ = s.GetMap(ctx, v.ID)
	if v.Removed || v.Published {
		t.Fatal("restore published without author action", v)
	}
	v, err = s.PublishMap(ctx, v.ID, owner.ID, true, v.Revision)
	if err != nil || !v.Published {
		t.Fatal("republish repaired content", err)
	}
	history, err := s.MapReportReviews(ctx, report.ID, 0)
	if err != nil || len(history) != 2 || history[1].Decision != "removed" {
		t.Fatal("review history", history, err)
	}
	v.Data = []byte(`{"version":3}`)
	v, err = s.PutMap(ctx, v, v.Revision)
	if err != nil || v.Published {
		t.Fatal("new revision was silently public", err)
	}
}

func TestMapReportIsolationQuotasAndReviewRollback(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	author, _, _ := s.CreateProfile(ctx, "Author")
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	v, err := s.PutMap(ctx, MapRecord{ID: "map", Owner: author.ID, Title: "Map", Data: []byte("source")}, 0)
	if err != nil {
		t.Fatal(err)
	}
	v, err = s.PublishMap(ctx, v.ID, author.ID, true, v.Revision)
	if err != nil {
		t.Fatal(err)
	}
	r, err := s.CreateMapReport(ctx, a.ID, v.ID, "A report")
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateMapReport(ctx, b.ID, v.ID, "B report")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ListMapReports(ctx, a.ID, "all", other.ID, 10); !errors.Is(err, ErrNotFound) {
		t.Fatal("foreign cursor", err)
	}
	rows, err := s.ListMapReports(ctx, a.ID, "all", "", 10)
	if err != nil || len(rows) != 1 || rows[0].ID != r.ID {
		t.Fatal("owner isolation", rows, err)
	}
	for _, reason := range []string{"Second reason", "Third reason", "Fourth reason", "Fifth reason"} {
		if _, err = s.CreateMapReport(ctx, a.ID, v.ID, reason); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.CreateMapReport(ctx, a.ID, v.ID, "Sixth reason"); !errors.Is(err, ErrReportRate) {
		t.Fatal("map quota", err)
	}
	// A review insertion failure must roll back the accompanying removal/revision.
	_, err = s.db.Exec(`CREATE TRIGGER deny_map_review BEFORE INSERT ON map_report_reviews BEGIN SELECT RAISE(ABORT,'test insertion failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.ReviewMapReport(ctx, r.ID, "removed", "Failure fixture", 0, v.Revision); err == nil {
		t.Fatal("missing simulated failure")
	}
	after, err := s.GetMap(ctx, v.ID)
	if err != nil || after.Removed || !after.Published || after.Revision != v.Revision {
		t.Fatal("partial removal survived rollback", after, err)
	}
	rows, err = s.ListMapReports(ctx, a.ID, "pending", "", 10)
	if err != nil || len(rows) != 5 {
		t.Fatal(rows, err)
	}
	own, err := s.ListOwnedMaps(ctx, a.ID)
	if err != nil || len(own) != 0 {
		t.Fatal("foreign author library", own, err)
	}
	published, err := s.ListPublishedMaps(ctx)
	if err != nil || len(published) != 1 || len(published[0].Data) != 0 {
		t.Fatal("metadata list fetched bodies", published, err)
	}
}
