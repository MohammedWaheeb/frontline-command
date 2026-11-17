package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
)

// seedServerCheckpoint records data the way a live match does:
// StartMatchAccess installs the members/journal and CheckpointMatch (the
// 30s/co-op writer) records the server-issued digest.
func seedServerCheckpoint(t *testing.T, s *Server, id string, tick uint32, data []byte, profiles ...string) {
	t.Helper()
	ctx := context.Background()
	members := []storage.MatchMember{}
	for i, profile := range profiles {
		members = append(members, storage.MatchMember{Profile: profile, Player: uint32(i + 1)})
	}
	if err := s.repo.StartMatchAccess(ctx, id, tick, data, members, false); err != nil {
		t.Fatal(err)
	}
	if err := s.repo.CheckpointMatch(ctx, id, tick, data); err != nil {
		t.Fatal(err)
	}
}

// A save a client fabricated locally (valid envelope/checksum, credits at the
// Restore bound) must not enter a co-op lobby. Only bytes the server itself
// checkpointed for a match the host played in may resume co-op.
func TestCoopResumeRequiresServerCheckpointProvenance(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a, b := profile(t, h, "Host"), profile(t, h, "Peer")
	ctx := context.Background()
	pa, _ := s.repo.Authenticate(ctx, a)
	pb, _ := s.repo.Authenticate(ctx, b)
	engine, err := sim.NewMission(s.catalog, m, mission, "normal", 9)
	if err != nil {
		t.Fatal(err)
	}
	for engine.Tick() < 113 {
		engine.Advance()
	}
	genuine, err := engine.Save()
	if err != nil {
		t.Fatal(err)
	}

	// Fabricated: same state with credits inflated to the Restore bound.
	// It passes Restore (solo rules), so provenance is the only barrier.
	state := engine.StateCopy()
	state.Players[0].Credits = 1000000000000
	rawState, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(rawState)
	fabricated, err := json.Marshal(map[string]any{"version": 1, "sha256": hex.EncodeToString(sum[:]), "state": json.RawMessage(rawState)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sim.Restore(s.catalog, fabricated); err != nil {
		t.Fatal("fabricated fixture must pass Restore to prove the co-op gate", err)
	}
	request(t, h, "PUT", "/api/v1/saves/fabricated-coop", a, map[string]any{"name": "Mine", "data": json.RawMessage(fabricated)}, 200)
	rejected := request(t, h, "POST", "/api/v1/saves/fabricated-coop/coop-lobby", a, map[string]any{}, 403)
	var code string
	_ = json.Unmarshal(rejected["code"], &code)
	if code != "checkpoint_not_server_issued" {
		t.Fatal("fabricated co-op resume rejected with wrong code", code, rejected)
	}

	// Server-issued: the genuine bytes went through the match checkpoint
	// flow (StartMatchAccess + 30s/co-op CheckpointMatch) and were shared.
	seedServerCheckpoint(t, s, "provenance-match", 113, genuine, pa.ID, pb.ID)
	if err := s.repo.PutSharedSave(ctx, []string{pa.ID, pb.ID}, "server-coop", "Midpoint", genuine); err != nil {
		t.Fatal(err)
	}
	created := request(t, h, "POST", "/api/v1/saves/server-coop/coop-lobby", a, map[string]any{"player": 2}, 201)
	var l Lobby
	if err := json.Unmarshal(created["lobby"], &l); err != nil || l.ResumeTick != 113 {
		t.Fatal("server-checkpointed save did not resume", err, l.ResumeTick)
	}

	// Provenance is per participant: a third profile holding an uploaded
	// copy of the genuine bytes still cannot host them.
	c := profile(t, h, "Stranger")
	request(t, h, "PUT", "/api/v1/saves/copied-coop", c, map[string]any{"name": "Copy", "data": json.RawMessage(genuine)}, 200)
	request(t, h, "POST", "/api/v1/saves/copied-coop/coop-lobby", c, map[string]any{}, 403)
}
