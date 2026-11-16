package server

import (
	"context"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// A disconnected player whose grace expired cannot rejoin the live battle,
// but must be able to collect its final cached result after the battle ends.
// This matters when a failed database leaves the final void out of history.
func TestExpiredPlayerCanRecoverFinalVoidAfterMatchFinishes(t *testing.T) {
	shortenCommitWindow(t)
	matchFinishedRetention = 2 * time.Second
	previous := reconnectGrace
	reconnectGrace = 30 * time.Millisecond
	t.Cleanup(func() { reconnectGrace = previous })
	s := commitFallbackServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: lobbyFourMap(), Seed: 1, Players: []sim.PlayerConfig{
		{ID: 1, Name: "Expired", Faction: "US", Team: 1}, {ID: 2, Name: "Second", Faction: "IR", Team: 2}, {ID: 3, Name: "Third", Faction: "SA", Team: 3},
	}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("expired-final-void", e, []slot{{Player: 1, Token: "one"}, {Player: 2, Token: "two"}, {Player: 3, Token: "three"}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.close)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	peers := map[sim.PlayerID]*peer{}
	for _, id := range []sim.PlayerID{1, 2, 3} {
		p := &peer{player: id, out: make(chan []byte, 256), done: make(chan struct{})}
		peers[id] = p
		if reply := m.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
	}
	// Drain the surviving peers; player 1 is intentionally dropped.
	_ = terminalFrames(peers[2])
	thirdFrames := terminalFrames(peers[3])
	for {
		view := m.call(ctx, matchRequest{kind: "view", player: 2}).view
		if m.barrierPassed.Load() && view.Countdown == 0 {
			break
		}
		if ctx.Err() != nil {
			t.Fatal("start countdown did not complete")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if reply := m.call(ctx, matchRequest{kind: "disconnect", player: 1, peer: peers[1]}); reply.err != nil {
		t.Fatal(reply.err)
	}
	for {
		view := m.call(ctx, matchRequest{kind: "view", player: 2}).view
		defeated := false
		for _, p := range view.Players {
			if p.ID == 1 {
				defeated = p.Defeated
			}
		}
		if defeated {
			if view.Outcome.Finished {
				t.Fatal("fixture ended before expiry control")
			}
			break
		}
		if ctx.Err() != nil {
			t.Fatal("disconnect did not expire")
		}
		time.Sleep(10 * time.Millisecond)
	}
	denied := &peer{player: 1, out: make(chan []byte, 256), done: make(chan struct{})}
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: denied}); reply.err == nil || reply.err.Error() != "reconnect_expired" {
		t.Fatalf("expired player rejoined live battle: %v", reply.err)
	}
	if err := s.repo.Close(); err != nil {
		t.Fatal(err)
	}
	if reply := m.call(ctx, matchRequest{kind: "orders", player: 2, peer: peers[2], sequence: 1, orders: []sim.Order{{Kind: "surrender"}}}); reply.err != nil {
		t.Fatal(reply.err)
	}
	first, _ := awaitVoidTerminal(t, thirdFrames)
	replacement := &peer{player: 1, out: make(chan []byte, 256), done: make(chan struct{})}
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: replacement}); reply.err != nil {
		t.Fatalf("finished match denied final-status recovery for expired participant: %v", reply.err)
	}
	var snapshot *pb.PlayerSnapshot
	var result *pb.MatchResult
	for result == nil {
		select {
		case wire := <-replacement.out:
			envelope := new(pb.Envelope)
			if err := proto.Unmarshal(wire, envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.GetSnapshot() != nil {
				snapshot = envelope.GetSnapshot()
			}
			result = envelope.GetResult()
		case <-ctx.Done():
			t.Fatal("expired participant missed cached terminal result")
		}
	}
	if snapshot == nil || snapshot.Player != 1 || !snapshot.GetOutcome().GetFinished() {
		t.Fatalf("missing final authorized perspective: %+v", snapshot)
	}
	if !proto.Equal(result, first) {
		t.Fatalf("recovered result differs: got=%+v want=%+v", result, first)
	}
	for _, entity := range snapshot.Entities {
		if entity.Owner != 0 && entity.Owner != 1 {
			t.Fatal("final recovery disclosed a foreign actor after elimination", entity.Id)
		}
	}
}
