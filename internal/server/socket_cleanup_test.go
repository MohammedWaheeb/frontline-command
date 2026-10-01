package server

import (
	"context"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"path/filepath"
	"testing"
	"time"
)

// Holding the actor's start reproduces a handshake waiting behind actor work
// without a host listener, scheduler race or an expensive simulation fixture.
func queuedConnectFixture(t *testing.T) *liveMatch {
	t.Helper()
	s, err := New(Config{DataDir: t.TempDir(), MapDir: filepath.Join(t.TempDir(), "no-maps")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err = s.repo.StartMatchAccess(ctx, "queued-connect", uint32(e.Tick()), save, []storage.MatchMember{}, false); err != nil {
		t.Fatal(err)
	}
	return &liveMatch{
		id: "queued-connect", engine: e, slots: []slot{{Player: 1}, {Player: 2}},
		requests: make(chan matchRequest, 8), done: make(chan struct{}), stop: make(chan struct{}),
		checkpoints: make(chan matchCheckpoint, 2), persistenceDone: make(chan struct{}),
		persistenceErrors: make(chan string, 4), repo: s.repo, objects: s.objects,
		observerDelay: 2400, started: time.Now(),
	}
}

func TestCanceledQueuedConnectDoesNotReplaceLivePeer(t *testing.T) {
	m := queuedConnectFixture(t)
	old := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	pending := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	called := make(chan matchReply, 1)
	go func() { called <- m.call(ctx, matchRequest{kind: "connect", player: 1, peer: pending}) }()
	queued := <-m.requests
	cancel()
	if reply := <-called; !errors.Is(reply.err, context.Canceled) {
		t.Fatal("handshake did not cancel while its request was queued", reply.err)
	}
	// Cancellation can reach the actor before socket teardown closes the peer.
	// That small interval must not permit a canceled request to replace a slot.
	t.Cleanup(pending.close)
	oldReply := make(chan matchReply, 1)
	m.requests <- matchRequest{kind: "connect", player: 1, peer: old, reply: oldReply}
	m.requests <- queued
	go m.persistCheckpoints()
	go m.run()
	t.Cleanup(m.close)
	if reply := <-oldReply; reply.err != nil {
		t.Fatal(reply.err)
	}
	if reply := <-queued.reply; reply.err == nil || reply.err.Error() != "connection_closed" {
		t.Fatal("canceled handshake was registered by the actor", reply.err)
	}
	select {
	case <-old.done:
		t.Fatal("canceled handshake closed the existing connection")
	default:
	}
	if len(pending.out) != 0 || pending.baseline != nil {
		t.Fatal("orphan received an authorized snapshot without a socket worker")
	}
	probe, stop := context.WithTimeout(context.Background(), time.Second)
	defer stop()
	if reply := m.call(probe, matchRequest{kind: "control", player: 1, peer: old, control: "pause"}); reply.err != nil && reply.err.Error() == "connection_replaced" {
		t.Fatal("original slot no longer owns its connection")
	}
}

func TestClosedConnectDoesNotReplaceLivePeer(t *testing.T) {
	m := queuedConnectFixture(t)
	go m.persistCheckpoints()
	go m.run()
	t.Cleanup(m.close)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	old := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: old}); reply.err != nil {
		t.Fatal(reply.err)
	}
	closed := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	closed.close()
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: closed}); reply.err == nil || reply.err.Error() != "connection_closed" {
		t.Fatal("closed transport was registered by the actor", reply.err)
	}
	select {
	case <-old.done:
		t.Fatal("closed transport replaced the existing connection")
	default:
	}
	if closed.baseline != nil || len(closed.out) != 0 {
		t.Fatal("closed transport received authorized data")
	}
	if reply := m.call(ctx, matchRequest{kind: "disconnect", player: 1, peer: closed}); reply.err != nil {
		t.Fatal(reply.err)
	}
	if reply := m.call(ctx, matchRequest{kind: "control", player: 1, peer: old, control: "pause"}); reply.err == nil || reply.err.Error() != "match_not_active" {
		t.Fatal("closed peer cleanup removed the original connection", reply.err)
	}
}

func TestValidReplacementSurvivesOldPeerCleanup(t *testing.T) {
	m := queuedConnectFixture(t)
	go m.persistCheckpoints()
	go m.run()
	t.Cleanup(m.close)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	old := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	replacement := &peer{player: 1, out: make(chan []byte, 32), done: make(chan struct{})}
	for _, p := range []*peer{old, replacement} {
		if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
	}
	select {
	case <-old.done:
	default:
		t.Fatal("valid reconnect did not close the old peer")
	}
	if replacement.baseline == nil || replacement.baseline.Player != 1 {
		t.Fatal("valid reconnect did not establish its own perspective")
	}
	for _, v := range replacement.baseline.Entities {
		if v.Owner != 0 && v.Owner != 1 {
			t.Fatal("replacement snapshot disclosed a hidden enemy", v.Id)
		}
	}
	if reply := m.call(ctx, matchRequest{kind: "disconnect", player: 1, peer: old}); reply.err != nil {
		t.Fatal(reply.err)
	}
	if reply := m.call(ctx, matchRequest{kind: "control", player: 1, peer: replacement, control: "pause"}); reply.err == nil || reply.err.Error() != "match_not_active" {
		t.Fatal("old peer cleanup removed the replacement", reply.err)
	}
}
