package storage

import (
	"context"
	"testing"
)

func TestCheckpointProvenanceFailureRollsBackJournalAndDigests(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	if err := s.StartMatchAccess(ctx, "atomic-checkpoint", 100, []byte("opening"), nil, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(serverCheckpointsSchema); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`CREATE TRIGGER reject_checkpoint BEFORE INSERT ON server_checkpoints WHEN NEW.digest='` + digest([]byte("current")) + `' BEGIN SELECT RAISE(ABORT,'blocked provenance'); END`); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckpointMatch(ctx, "atomic-checkpoint", 600, []byte("current")); err == nil {
		t.Fatal("provenance failure was hidden")
	}
	var tick uint32
	var data []byte
	if err := s.db.QueryRow(`SELECT tick,data FROM active_matches WHERE id='atomic-checkpoint'`).Scan(&tick, &data); err != nil || tick != 100 || string(data) != "opening" {
		t.Errorf("partial journal committed: tick=%d data=%q err=%v", tick, data, err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM server_checkpoints WHERE match_id='atomic-checkpoint'`).Scan(&count); err != nil || count != 0 {
		t.Errorf("partial provenance committed: count=%d err=%v", count, err)
	}
	if _, err := s.db.Exec(`DROP TRIGGER reject_checkpoint`); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckpointMatch(ctx, "atomic-checkpoint", 600, []byte("current")); err != nil {
		t.Fatal(err)
	}
	for _, value := range []struct {
		data string
		tick uint32
	}{{"opening", 100}, {"current", 600}} {
		var got uint32
		if err := s.db.QueryRow(`SELECT tick FROM server_checkpoints WHERE match_id=? AND digest=?`, "atomic-checkpoint", digest([]byte(value.data))).Scan(&got); err != nil || got != value.tick {
			t.Errorf("incorrect checkpoint provenance time: data=%s tick=%d want=%d err=%v", value.data, got, value.tick, err)
		}
	}
}

func TestStaleMissingAndFinishedCheckpointsCannotMintProvenance(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	p, _, err := s.CreateProfile(ctx, "Checkpoint participant")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.StartMatchAccess(ctx, "monotonic-checkpoint", 600, []byte("latest"), []MatchMember{{Profile: p.ID, Player: 1}}, false); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckpointMatch(ctx, "monotonic-checkpoint", 500, []byte("stale")); err != nil {
		t.Fatal(err)
	}
	if recognized, err := s.HasServerCheckpoint(ctx, p.ID, []byte("stale")); err != nil || recognized {
		t.Errorf("stale unpublished state acquired provenance: %v %v", recognized, err)
	}
	var tick uint32
	var data []byte
	if err := s.db.QueryRow(`SELECT tick,data FROM active_matches WHERE id='monotonic-checkpoint'`).Scan(&tick, &data); err != nil || tick != 600 || string(data) != "latest" {
		t.Fatal("stale checkpoint changed journal", tick, string(data), err)
	}
	if _, err := s.CommitResult(ctx, Result{ID: "monotonic-checkpoint", Payload: []byte(`{"finished":true}`)}); err != nil {
		t.Fatal(err)
	}
	if err := s.CheckpointMatch(ctx, "monotonic-checkpoint", 700, []byte("late")); err != nil {
		t.Fatal(err)
	}
	if recognized, err := s.HasServerCheckpoint(ctx, p.ID, []byte("late")); err != nil || recognized {
		t.Errorf("post-result state acquired provenance: %v %v", recognized, err)
	}
	requireNoJournal(t, s, "monotonic-checkpoint")
	if err := s.CheckpointMatch(ctx, "never-started", 1, []byte("missing")); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM server_checkpoints WHERE match_id='never-started'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("missing journal minted provenance: %d %v", count, err)
	}
}

func TestFinalVoidRetainedJournalCannotBeOverwrittenByLateCheckpoint(t *testing.T) {
	s := repository(t)
	ctx := context.Background()
	if err := s.StartMatchAccess(ctx, "retained-final-journal", 100, []byte("exact recovery state"), nil, false); err != nil {
		t.Fatal(err)
	}
	if count, err := s.RecoverInterrupted(ctx, unavailableRecoveryObjects{}); err != nil || count != 1 {
		t.Fatalf("void recovery failed: %d %v", count, err)
	}
	if err := s.CheckpointMatch(ctx, "retained-final-journal", 600, []byte("late pending checkpoint")); err != nil {
		t.Fatal(err)
	}
	var tick uint32
	var data []byte
	if err := s.db.QueryRow(`SELECT tick,data FROM active_matches WHERE id='retained-final-journal'`).Scan(&tick, &data); err != nil || tick != 100 || string(data) != "exact recovery state" {
		t.Fatalf("final void journal overwritten: tick=%d data=%q err=%v", tick, data, err)
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM server_checkpoints WHERE match_id=? AND digest=?`, "retained-final-journal", digest([]byte("late pending checkpoint"))).Scan(&count); err != nil || count != 0 {
		t.Fatalf("post-void checkpoint acquired provenance: %d %v", count, err)
	}
}
