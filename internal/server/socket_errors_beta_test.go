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

func TestBetaSocketErrorMessages(t *testing.T) {
	cases := map[string]string{
		"unknown_player": "no player slot", "connection_closed": "before it could join",
		"invalid_match_token": "sign-in", "reconnect_expired": "window has ended",
		"player_eliminated": "eliminated", "match_closed": "no longer active",
		"connection_replaced": "Another game tab", "control_rate_exceeded": "too quickly",
		"players_disconnected": "reconnect", "waiting_for_players": "every commander",
	}
	for code, want := range cases {
		if got := socketErrorMessage(code); !strings.Contains(got, want) {
			t.Errorf("%s: got %q, want %q", code, got, want)
		}
		if code != "player_eliminated" && strings.Contains(socketErrorMessage(code), "eliminated") {
			t.Errorf("%s misleadingly claims elimination", code)
		}
	}
}

func TestBetaInvalidSocketTokenSendsSpecificProtocolError(t *testing.T) {
	s, h := testServer(t)
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 1, Players: []sim.PlayerConfig{{ID: 1, Name: "Host", Faction: "US", Team: 1}, {ID: 2, Name: "AI", Faction: "IR", Team: 2, AI: "easy"}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("beta-socket-rejection", engine, []slot{{Player: 1, Token: "correct-token"}, {Player: 2, AI: true}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(h.URL, "http")+"/api/v1/matches/"+m.id+"/socket", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	data, err := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Hello{Hello: &pb.ClientHello{Protocol: 1, Simulation: sim.Version, ContentHash: s.catalog.Hash(), MatchId: m.id, Token: "wrong-token"}}})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	_, data, err = conn.Read(ctx)
	if err != nil {
		t.Fatal("host closed without a specific refusal", err)
	}
	envelope := new(pb.Envelope)
	if err = proto.Unmarshal(data, envelope); err != nil {
		t.Fatal(err)
	}
	failure := envelope.GetError()
	if failure == nil || failure.Code != "invalid_match_token" || failure.Message != socketErrorMessage("invalid_match_token") || failure.Recoverable {
		t.Fatalf("unexpected refusal: %v", failure)
	}
}
