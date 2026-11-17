package server

import (
	"context"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
	"strings"
	"testing"
	"time"
)

// Match sockets negotiate per-message deflate when the client offers it (as
// browsers do) and still serve clients that do not offer it.
func TestMatchSocketNegotiatesCompression(t *testing.T) {
	s, h := testServer(t)
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 1, Players: []sim.PlayerConfig{{ID: 1, Name: "Host", Faction: "US", Team: 1}, {ID: 2, Name: "AI", Faction: "IR", Team: 2, AI: "easy"}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("socket-compression", engine, []slot{{Player: 1, Token: "compression-token"}, {Player: 2, AI: true}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	url := "ws" + strings.TrimPrefix(h.URL, "http") + "/api/v1/matches/" + m.id + "/socket"
	for _, mode := range []websocket.CompressionMode{websocket.CompressionNoContextTakeover, websocket.CompressionDisabled} {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		conn, resp, err := websocket.Dial(ctx, url, &websocket.DialOptions{CompressionMode: mode})
		if err != nil {
			cancel()
			t.Fatal(err)
		}
		negotiated := strings.Contains(resp.Header.Get("Sec-WebSocket-Extensions"), "permessage-deflate")
		if negotiated != (mode != websocket.CompressionDisabled) {
			t.Errorf("mode %v: negotiated=%v", mode, negotiated)
		}
		hello, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Hello{Hello: &pb.ClientHello{Protocol: 1, Simulation: sim.Version, ContentHash: s.catalog.Hash(), MatchId: m.id, Token: "compression-token"}}})
		if err = conn.Write(ctx, websocket.MessageBinary, hello); err != nil {
			t.Fatal(err)
		}
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		envelope := new(pb.Envelope)
		if err = proto.Unmarshal(data, envelope); err != nil || envelope.GetSnapshot() == nil {
			t.Fatalf("mode %v: first frame is not an authenticated snapshot: %v %v", mode, err, envelope)
		}
		conn.Close(websocket.StatusNormalClosure, "")
		cancel()
	}
}
