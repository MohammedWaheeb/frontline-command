package server

import (
	"context"
	"frontlinecommand/pkg/sim"
	"testing"
	"time"
)

func TestSharedPauseVotesAndRankedDenial(t *testing.T) {
	c := newPauseControl(true)
	active := []sim.PlayerID{1, 2}
	if err := c.act("pause", 1, active); err != nil || c.paused {
		t.Fatal("one player paused shared match", err)
	}
	if err := c.act("pause", 3, active); err == nil {
		t.Fatal("spectator voted")
	}
	if err := c.act("pause", 2, active); err != nil || !c.paused {
		t.Fatal("unanimous pause failed", err)
	}
	if err := c.act("resume", 1, active); err != nil || c.paused || len(c.votes) != 0 {
		t.Fatal("resume failed", err)
	}
	c = newPauseControl(false)
	if err := c.act("pause", 1, active); err == nil || c.paused {
		t.Fatal("ranked pause allowed")
	}
}
func TestPauseFreezesSimulationAndDisconnectResumes(t *testing.T) {
	s, _ := testServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	// Keep countdown active so the allied fixture does not immediately win.
	m, err := newMatch("pause-test", e, []slot{{Player: 1}, {Player: 2}}, s.repo, s.objects, matchOptions{PauseEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	defer m.close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	peers := map[sim.PlayerID]*peer{}
	for _, id := range []sim.PlayerID{1, 2} {
		p := &peer{player: id, out: make(chan []byte, 128), done: make(chan struct{})}
		peers[id] = p
		if r := m.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); r.err != nil {
			t.Fatal(r.err)
		}
	}
	time.Sleep(70 * time.Millisecond)
	for _, id := range []sim.PlayerID{1, 2} {
		if r := m.call(ctx, matchRequest{kind: "control", player: id, peer: peers[id], control: "pause"}); r.err != nil {
			t.Fatal(r.err)
		}
	}
	before := m.call(ctx, matchRequest{kind: "view", player: 1}).view.Tick
	time.Sleep(220 * time.Millisecond)
	after := m.call(ctx, matchRequest{kind: "view", player: 1}).view.Tick
	if before != after {
		t.Fatal("paused engine advanced", before, after)
	}
	if r := m.call(ctx, matchRequest{kind: "orders", player: 1, peer: peers[1], sequence: 1, orders: []sim.Order{{Kind: "surrender"}}}); r.err == nil || r.err.Error() != "match_paused" {
		t.Fatal("orders accepted while paused", r.err)
	}
	if r := m.call(ctx, matchRequest{kind: "disconnect", player: 2, peer: peers[2]}); r.err != nil {
		t.Fatal(r.err)
	}
	time.Sleep(110 * time.Millisecond)
	after = m.call(ctx, matchRequest{kind: "view", player: 1}).view.Tick
	if after <= before {
		t.Fatal("disconnect retained tactical pause")
	}
	if r := m.call(ctx, matchRequest{kind: "control", player: 1, peer: peers[1], control: "pause"}); r.err == nil || r.err.Error() != "players_disconnected" {
		t.Fatal("pause allowed while ally reconnecting", r.err)
	}
}
func TestPausePlayerGoneRetainVsResume(t *testing.T) {
	active := []sim.PlayerID{1, 2}
	c := newPauseControl(true)
	for _, id := range active {
		if err := c.act("pause", id, active); err != nil {
			t.Fatal(err)
		}
	}
	if !c.paused {
		t.Fatal("unanimous pause failed")
	}
	c.playerGone(2, true)
	if !c.paused || len(c.votes) != 1 || !c.votes[1] {
		t.Fatal("co-op pause hold lost on partner drop", c.paused, c.votes)
	}
	if err := c.act("resume", 1, []sim.PlayerID{1}); err != nil || c.paused {
		t.Fatal("survivor could not resume retained pause", err)
	}
	if err := c.act("pause", 1, []sim.PlayerID{1}); err != nil || !c.paused {
		t.Fatal("survivor could not pause alone while partner in grace", err)
	}
	c.playerGone(2, false)
	if c.paused || len(c.votes) != 0 {
		t.Fatal("non-coop drop must resume and clear votes", c.paused, c.votes)
	}
}
func TestCoopDisconnectRetainsPauseAndSurvivorCanRepause(t *testing.T) {
	s, _ := testServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	mmap, mission := scenarioFixture()
	a, _, _ := s.repo.CreateProfile(ctx, "A")
	b, _, _ := s.repo.CreateProfile(ctx, "B")
	engine, err := sim.NewMission(s.catalog, mmap, mission, "normal", 9)
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("coop-pause", engine, []slot{{Player: 1, Profile: a.ID}, {Player: 2, Profile: b.ID}, {Player: 3, AI: true}}, s.repo, s.objects, matchOptions{PauseEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	defer m.close()
	peers := map[sim.PlayerID]*peer{}
	for _, id := range []sim.PlayerID{1, 2} {
		p := &peer{player: id, out: make(chan []byte, 128), done: make(chan struct{})}
		peers[id] = p
		if r := m.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); r.err != nil {
			t.Fatal(r.err)
		}
	}
	time.Sleep(70 * time.Millisecond)
	for _, id := range []sim.PlayerID{1, 2} {
		if r := m.call(ctx, matchRequest{kind: "control", player: id, peer: peers[id], control: "pause"}); r.err != nil {
			t.Fatal(r.err)
		}
	}
	tick := func() sim.Tick { return m.call(ctx, matchRequest{kind: "view", player: 1}).view.Tick }
	before := tick()
	if r := m.call(ctx, matchRequest{kind: "disconnect", player: 2, peer: peers[2]}); r.err != nil {
		t.Fatal(r.err)
	}
	time.Sleep(220 * time.Millisecond)
	if after := tick(); after != before {
		t.Fatal("co-op partner drop unpaused the match", before, after)
	}
	if r := m.call(ctx, matchRequest{kind: "control", player: 1, peer: peers[1], control: "resume"}); r.err != nil {
		t.Fatal("survivor resume failed", r.err)
	}
	time.Sleep(110 * time.Millisecond)
	if after := tick(); after <= before {
		t.Fatal("resumed co-op match did not advance", before, after)
	} else {
		before = after
	}
	if r := m.call(ctx, matchRequest{kind: "control", player: 1, peer: peers[1], control: "pause"}); r.err != nil {
		t.Fatal("survivor pause during partner grace rejected", r.err)
	}
	time.Sleep(220 * time.Millisecond)
	if after := tick(); after != before {
		t.Fatal("survivor pause did not freeze co-op match", before, after)
	}
}
func TestReconnectTimersAreTeamPrivate(t *testing.T) {
	s, _ := testServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	m := &liveMatch{engine: e, slots: []slot{{Player: 1}, {Player: 2}}}
	control := newPauseControl(true)
	now := time.Now()
	status := m.connectionStatus(1, &control, map[sim.PlayerID]*peer{}, map[sim.PlayerID]time.Time{1: now.Add(120 * time.Second), 2: now.Add(30 * time.Second)}, true, now)
	if len(status.Teammates) != 1 || status.Teammates[0].Player != 1 || status.Teammates[0].ReconnectRemainingMs != 120000 {
		t.Fatal("reconnect state leaked", status)
	}
}
