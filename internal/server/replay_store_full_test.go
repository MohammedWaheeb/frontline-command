package server

import (
	"context"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// A full replay store must not strand a finished match: the result still
// commits (so players get their outcome and the actor exits on schedule) and
// the oldest stored replays make room for the new one.
func TestFinishedMatchCommitsWhenReplayStoreIsFull(t *testing.T) {
	s, h := testServer(t)
	if err := os.MkdirAll(s.objects.Root, 0700); err != nil {
		t.Fatal(err)
	}
	// A sparse file at the whole-store cap: costs no disk, counts as full.
	filler := filepath.Join(s.objects.Root, "old-match.replay")
	if err := os.WriteFile(filler, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(filler, 2<<30); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Hour)
	os.Chtimes(filler, old, old)

	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 1, Players: []sim.PlayerConfig{{ID: 1, Name: "Host", Faction: "US", Team: 1}, {ID: 2, Name: "AI", Faction: "IR", Team: 2, AI: "easy"}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("replay-store-full", engine, []slot{{Player: 1, Token: "full-store-token"}, {Player: 2, AI: true}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.close)
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(h.URL, "http")+"/api/v1/matches/"+m.id+"/socket", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	hello, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Hello{Hello: &pb.ClientHello{Protocol: 1, Simulation: sim.Version, ContentHash: s.catalog.Hash(), MatchId: m.id, Token: "full-store-token"}}})
	if err = conn.Write(ctx, websocket.MessageBinary, hello); err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				return
			}
		}
	}()
	for m.call(ctx, matchRequest{kind: "orders", player: 1, sequence: 1, orders: []sim.Order{{Kind: "surrender"}}}).err != nil {
		if ctx.Err() != nil {
			t.Fatal("match never started")
		}
		time.Sleep(50 * time.Millisecond)
	}
	for !m.completed.Load() {
		if ctx.Err() != nil {
			t.Fatal("finished match never committed its result while the replay store was full")
		}
		time.Sleep(50 * time.Millisecond)
	}
	if _, err := s.repo.GetResult(ctx, m.id); err != nil {
		t.Fatal("result missing", err)
	}
	if _, err := os.Stat(filepath.Join(s.objects.Root, m.id+".replay")); err != nil {
		t.Fatal("new replay was not stored", err)
	}
	if _, err := os.Stat(filler); !os.IsNotExist(err) {
		t.Fatal("oldest replay was not evicted to make room", err)
	}
}
