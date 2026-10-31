package server

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
)

func betaBarrierMatch(t *testing.T, wait time.Duration) (*Server, *liveMatch) {
	t.Helper()
	s, _ := testServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("beta-start-barrier", e, []slot{{Player: 1}, {Player: 2}}, s.repo, s.objects, matchOptions{startWait: wait})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.close)
	return s, m
}

func betaBarrierReason(t *testing.T, s *Server, m *liveMatch) string {
	t.Helper()
	result, err := s.repo.GetResult(context.Background(), m.id)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Void {
		t.Fatal("barrier produced a non-void result")
	}
	var payload struct {
		Reason string `json:"reason"`
		Tick   uint32 `json:"tick"`
	}
	if err := json.Unmarshal(result.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Tick != 0 {
		t.Fatalf("waiting match advanced to tick %d", payload.Tick)
	}
	return payload.Reason
}

func TestBetaStartBarrierMissingPlayersReason(t *testing.T) {
	s, m := betaBarrierMatch(t, 2*time.Second)
	remaining := m.startRemainingMs()
	if remaining == 0 || remaining > 2000 {
		t.Fatalf("remaining = %d ms, want 1..2000", remaining)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	// One connected human must neither start the simulation nor prevent expiry.
	p := &peer{player: 1, out: make(chan []byte, 128), done: make(chan struct{})}
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: p}); reply.err != nil {
		t.Fatal(reply.err)
	}
	if reply := m.call(ctx, matchRequest{kind: "view", player: 1}); reply.err != nil || reply.view.Tick != 0 {
		t.Fatal("waiting match advanced", reply.view.Tick, reply.err)
	}
	select {
	case <-m.done:
	case <-ctx.Done():
		t.Fatal("start barrier did not expire")
	}
	if got := betaBarrierReason(t, s, m); got != "players_missing" {
		t.Fatalf("void reason = %q, want players_missing", got)
	}
	if got := m.startRemainingMs(); got != 0 {
		t.Fatalf("expired remaining = %d", got)
	}
}

func TestBetaStartBarrierShutdownReason(t *testing.T) {
	s, m := betaBarrierMatch(t, 0)
	if got := m.startRemainingMs(); got == 0 || got > 120000 {
		t.Fatalf("default remaining = %d ms, want 1..120000", got)
	}
	m.close()
	if got := betaBarrierReason(t, s, m); got != "server_shutdown" {
		t.Fatalf("shutdown reason = %q, want server_shutdown", got)
	}
	if got := m.startRemainingMs(); got != 0 {
		t.Fatalf("closed remaining = %d", got)
	}
}

func TestBetaStartBarrierRemainingClearsOnStart(t *testing.T) {
	_, m := betaBarrierMatch(t, 0)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for _, id := range []sim.PlayerID{1, 2} {
		p := &peer{player: id, out: make(chan []byte, 128), done: make(chan struct{})}
		if reply := m.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
	}
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for m.startRemainingMs() != 0 {
		select {
		case <-ctx.Done():
			t.Fatal("barrier countdown remained after both humans connected")
		case <-ticker.C:
		}
	}
	if reply := m.call(ctx, matchRequest{kind: "view", player: 1}); reply.err != nil || reply.view.Tick == 0 {
		t.Fatal("barrier passed without simulation starting", reply.view.Tick, reply.err)
	}
}

func TestBetaStartBarrierDefaultDeadlineForInternalActor(t *testing.T) {
	m := queuedConnectFixture(t)
	if !m.startDeadline.IsZero() {
		t.Fatal("fixture unexpectedly supplied a deadline")
	}
	if got := m.startRemainingMs(); got == 0 || got > 120000 {
		t.Fatalf("default actor remaining = %d ms, want 1..120000", got)
	}
	if !m.startBarrierDeadline().Equal(m.started.Add(120 * time.Second)) {
		t.Fatal("default actor changed the original two-minute start window")
	}
}
