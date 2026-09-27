package storage

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestMatchAccessJournalAndResultTransactions(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "Member")
	b, _, _ := s.CreateProfile(ctx, "Outsider")
	members := []MatchMember{{Profile: a.ID, Player: 1}, {Profile: "missing-profile", Player: 2}}
	if err := s.StartMatchAccess(ctx, "atomic-match", 0, []byte("checkpoint"), members, false); err == nil {
		t.Fatal("accepted unknown profile")
	}
	for _, table := range []string{"match_access", "match_members", "active_matches"} {
		var count int
		if err := s.db.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("partial ledger in %s: %d %v", table, count, err)
		}
	}
	if err := s.StartMatchAccess(ctx, "atomic-match", 2, []byte("checkpoint"), members[:1], false); err != nil {
		t.Fatal(err)
	}
	for _, owner := range []string{a.ID, b.ID} {
		ok, err := s.MayReadReplay(ctx, "atomic-match", owner)
		if err != nil || ok != (owner == a.ID) {
			t.Fatal("private policy", owner, ok, err)
		}
	}
	result := Result{ID: "atomic-match", Payload: []byte(`{"tick":100}`), Rating: &RatingMatch{Profiles: [2]string{a.ID, "missing-profile"}, Winner: a.ID}}
	if _, err := s.CommitResult(ctx, result); err == nil {
		t.Fatal("invalid rating committed")
	}
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM active_matches WHERE id='atomic-match'`).Scan(&count)
	if count != 1 {
		t.Fatal("failed result lost recovery journal")
	}
	if _, err := s.GetResult(ctx, result.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("partial result", err)
	}
	result.Rating = nil
	if fresh, err := s.CommitResult(ctx, result); !fresh || err != nil {
		t.Fatal("result", fresh, err)
	}
	if fresh, err := s.CommitResult(ctx, result); fresh || err != nil {
		t.Fatal("retry", fresh, err)
	}
	s.db.QueryRow(`SELECT COUNT(*) FROM active_matches WHERE id='atomic-match'`).Scan(&count)
	if count != 0 {
		t.Fatal("committed result left recovery journal")
	}
	own, err := s.ListOwnResults(ctx, a.ID, 50)
	other, _ := s.ListOwnResults(ctx, b.ID, 50)
	if err != nil || len(own) != 1 || len(other) != 0 {
		t.Fatal("history ownership", own, other, err)
	}
	if _, err = s.MatchMember(ctx, result.ID, a.ID); err != nil {
		t.Fatal("result lost member", err)
	}
	if allowed, _ := s.MayReadReplay(ctx, "untrusted-legacy", a.ID); allowed {
		t.Fatal("missing ledger authorized")
	}
}

func TestAccessUpgradeBackfillsOnlyTrustedRatingParticipants(t *testing.T) {
	path := filepath.Join(t.TempDir(), "upgrade.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "A")
	b, _, _ := s.CreateProfile(ctx, "B")
	outsider, _, _ := s.CreateProfile(ctx, "C")
	if _, err = s.CommitResult(ctx, Result{ID: "legacy-rated", Payload: []byte(`{"tick":40}`), Rating: &RatingMatch{Profiles: [2]string{a.ID, b.ID}, Winner: a.ID}}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CommitResult(ctx, Result{ID: "legacy-private", Payload: []byte(`{"profiles":["` + outsider.ID + `"],"tick":40}`)}); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{`DROP TABLE report_reviews`, `DROP TABLE match_members`, `DROP TABLE match_access`, `PRAGMA user_version=5`} {
		if _, err = s.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, owner := range []string{a.ID, b.ID, outsider.ID} {
		allowed, err := s.MayReadReplay(ctx, "legacy-rated", owner)
		if err != nil || allowed != (owner != outsider.ID) {
			t.Fatal("backfill", allowed, err)
		}
		if allowed, _ = s.MayReadReplay(ctx, "legacy-private", owner); allowed {
			t.Fatal("untrusted result payload granted access")
		}
	}
	member, err := s.MatchMember(ctx, "legacy-rated", a.ID)
	if err != nil || member.Player != 0 {
		t.Fatal("legacy membership invented slot", member, err)
	}
}

func TestReportsQuotasIdempotenceOwnershipAndReviewCAS(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	a, _, _ := s.CreateProfile(ctx, "Reporter")
	b, _, _ := s.CreateProfile(ctx, "Other")
	for i := 0; i < 11; i++ {
		id := fmt.Sprintf("report-match-%d", i)
		if err := s.StartMatchAccess(ctx, id, 0, []byte("checkpoint"), []MatchMember{{a.ID, 1}}, false); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.CreateReport(ctx, b.ID, "report-match-0", "unrelated", 0); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("foreign report", err)
	}
	var wg sync.WaitGroup
	accepted := make(chan ReportRecord, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r, err := s.CreateReport(ctx, a.ID, "report-match-0", fmt.Sprintf("unique issue %d", i), uint32(i))
			if err == nil {
				accepted <- r
			} else if !errors.Is(err, ErrReportRate) {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	close(accepted)
	if len(accepted) != 5 {
		t.Fatal("concurrent match quota", len(accepted))
	}
	report := <-accepted
	retry, err := s.CreateReport(ctx, a.ID, report.MatchID, report.Reason, report.Tick)
	if err != nil || retry.ID != report.ID {
		t.Fatal("duplicate not idempotent", err)
	}
	for i := 1; i <= 5; i++ {
		if _, err = s.CreateReport(ctx, a.ID, fmt.Sprintf("report-match-%d", i), "issue context", 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.CreateReport(ctx, a.ID, "report-match-6", "hour limit", 0); !errors.Is(err, ErrReportRate) {
		t.Fatal("hourly quota", err)
	}
	// Older reports count against daily quota but not the current hour.
	if _, err = s.db.Exec(`UPDATE reports SET created=?`, time.Now().Add(-2*time.Hour).Unix()); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 40; i++ {
		if _, err = s.db.Exec(`INSERT INTO reports(id,owner,match_id,tick,reason,created) VALUES(?,?,?,?,?,?)`, fmt.Sprintf("old-%d", i), a.ID, "old-context", 0, "legacy issue", time.Now().Add(-3*time.Hour).Unix()); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.CreateReport(ctx, a.ID, "report-match-6", "daily limit", 0); !errors.Is(err, ErrReportRate) {
		t.Fatal("daily quota", err)
	}
	reviews := make(chan ReportReview, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := s.ReviewReport(ctx, report.ID, "needs_context", "Review before decision.", 0)
			if err == nil {
				reviews <- v
			} else if !errors.Is(err, ErrConflict) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	close(reviews)
	if len(reviews) != 1 {
		t.Fatal("concurrent review overwritten", len(reviews))
	}
	if _, err = s.ReviewReport(ctx, report.ID, "confirmed", "Reviewed the saved evidence.", 1); err != nil {
		t.Fatal(err)
	}
	history, err := s.ReportReviews(ctx, report.ID, 0)
	if err != nil || len(history) != 2 || history[0].Revision != 2 || history[1].Decision != "needs_context" {
		t.Fatal("append-only audit", history, err)
	}
	list, err := s.ListReports(ctx, a.ID, "reviewed", "", 100)
	if err != nil || len(list) != 1 || list[0].Decision != "confirmed" {
		t.Fatal("reviewed filter", list, err)
	}
	if _, err = s.ListReports(ctx, b.ID, "all", report.ID, 100); !errors.Is(err, ErrNotFound) {
		t.Fatal("foreign cursor exposed", err)
	}
	list, err = s.ListReports(ctx, a.ID, "pending", "", 7)
	if err != nil || len(list) != 7 {
		t.Fatal("page", err, len(list))
	}
	second, err := s.ListReports(ctx, a.ID, "pending", list[6].ID, 7)
	if err != nil || len(second) != 7 {
		t.Fatal("second page", err, len(second))
	}
	seen := map[string]bool{}
	for _, r := range append(list, second...) {
		if seen[r.ID] {
			t.Fatal("duplicate page entry")
		}
		seen[r.ID] = true
	}
}
