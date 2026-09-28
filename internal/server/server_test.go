package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) (*Server, *httptest.Server) {
	t.Helper()
	s, err := New(Config{DataDir: t.TempDir(), MapDir: filepath.Join(t.TempDir(), "no-maps")})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(s)
	t.Cleanup(func() { httpServer.Close(); s.Close() })
	return s, httpServer
}
func request(t *testing.T, server *httptest.Server, method, path, token string, body any, status int) map[string]json.RawMessage {
	t.Helper()
	b, _ := json.Marshal(body)
	req, err := http.NewRequest(method, server.URL+path, bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != status {
		t.Fatalf("%s %s: status %d want %d: %s", method, path, resp.StatusCode, status, data)
	}
	var out map[string]json.RawMessage
	if status != 204 {
		json.Unmarshal(data, &out)
	}
	return out
}
func profile(t *testing.T, h *httptest.Server, name string) string {
	v := request(t, h, "POST", "/api/v1/profiles", "", map[string]any{"name": name}, 201)
	var token string
	json.Unmarshal(v["token"], &token)
	return token
}
func testMap() content.Map {
	m := content.Map{ID: "server-fixture", Title: "Synthetic API test", Author: "test", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64, Spawns: []content.Spawn{{Position: content.Point{X: 8000, Y: 8000}}, {Position: content.Point{X: 56000, Y: 56000}}}, Shipment: content.Point{X: 32000, Y: 32000}, Fields: []content.Field{{ID: 1, Position: content.Point{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: content.Point{X: 49000, Y: 56000}, Credits: 36000000}}}
	m.Tiles = make([]content.Tile, 4096)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}
func socket(t *testing.T, h *httptest.Server, s *Server, connection map[string]any) (*websocket.Conn, *pb.PlayerSnapshot) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(h.URL, "http") + "/api/v1/matches/" + connection["match_id"].(string) + "/socket"
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.SetReadLimit(4 << 20)
	hello := &pb.Envelope{Message: &pb.Envelope_Hello{Hello: &pb.ClientHello{Protocol: 1, Simulation: sim.Version, ContentHash: s.catalog.Hash(), Token: connection["token"].(string), MatchId: connection["match_id"].(string)}}}
	data, _ := proto.Marshal(hello)
	if err = c.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	kind, b, err := c.Read(ctx)
	if err != nil || kind != websocket.MessageBinary {
		t.Fatal("initial socket read", err)
	}
	msg := new(pb.Envelope)
	if err = proto.Unmarshal(b, msg); err != nil {
		t.Fatal(err)
	}
	if msg.GetSnapshot() == nil {
		t.Fatalf("no initial snapshot: %v", msg)
	}
	return c, msg.GetSnapshot()
}
func TestCompleteLobbyHandshakeAndFogFilteredSockets(t *testing.T) {
	s, h := testServer(t)
	host, guest := profile(t, h, "Host"), profile(t, h, "Guest")
	request(t, h, "POST", "/api/v1/maps", host, map[string]any{"map": testMap(), "expected_revision": 0}, 201)
	request(t, h, "PATCH", "/api/v1/maps/"+testMap().ID+"/publication", host, map[string]any{"published": true, "expected_revision": 1}, 200)
	created := request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"name": "LAN match", "map_id": "server-fixture", "mode": "1v1", "private": true, "faction": "US"}, 201)
	var l Lobby
	json.Unmarshal(created["lobby"], &l)
	var code string
	json.Unmarshal(created["code"], &code)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"code": "wrong", "faction": "IR"}, 403)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"code": code, "faction": "IR"}, 200)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 409)
	for _, token := range []string{host, guest} {
		readyTestLobby(t, s, h, l.ID, token)
	}
	started := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201)
	joined := request(t, h, "GET", "/api/v1/lobbies/"+l.ID, guest, nil, 200)
	var hc, gc map[string]any
	json.Unmarshal(started["connection"], &hc)
	json.Unmarshal(joined["connection"], &gc)
	if hc["token"] == gc["token"] {
		t.Fatal("slots share authorization")
	}
	a, av := socket(t, h, s, hc)
	defer a.CloseNow()
	b, bv := socket(t, h, s, gc)
	defer b.CloseNow()
	if av.Player != 1 || bv.Player != 2 {
		t.Fatal("wrong perspective")
	}
	for _, v := range av.Entities {
		if v.Owner != 1 {
			t.Fatal("hidden enemy serialized")
		}
	}
	for _, v := range bv.Entities {
		if v.Owner != 2 {
			t.Fatal("hidden host serialized")
		}
	}
	data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Orders{Orders: &pb.OrderBatch{Sequence: 1, Orders: []*pb.Order{{Kind: "move", Entities: []uint32{4}, Position: &pb.Vec{X: 16000, Y: 12000}}}}}})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := a.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	for {
		_, data, err := a.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		msg := new(pb.Envelope)
		proto.Unmarshal(data, msg)
		if result := msg.GetOrderResult(); result != nil {
			if result.Accepted {
				t.Fatal("accepted unauthorized entity")
			}
			break
		}
	}
}
func TestProtocolDeltaRemovesFoggedEntities(t *testing.T) {
	before := &pb.PlayerSnapshot{Tick: 10, Entities: []*pb.Entity{{Id: 1, Owner: 1}, {Id: 2, Owner: 2}}}
	after := &pb.PlayerSnapshot{Tick: 14, Entities: []*pb.Entity{{Id: 1, Owner: 1}}}
	d := delta(before, after)
	if len(d.RemovedEntities) != 1 || d.RemovedEntities[0] != 2 || len(d.State.Entities) != 0 {
		t.Fatalf("bad delta %v", d)
	}
	if len(after.Entities) != 1 {
		t.Fatal("delta mutated authorized source")
	}
}
func TestOriginAndMalformedRequests(t *testing.T) {
	_, h := testServer(t)
	req, _ := http.NewRequest("POST", h.URL+"/api/v1/profiles", strings.NewReader(`{"name":"evil"}`))
	req.Header.Set("Origin", "https://untrusted.example")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatal("cross-origin mutation allowed")
	}
	request(t, h, "POST", "/api/v1/profiles", "", map[string]any{"name": "X", "admin": true}, 400)
	request(t, h, "GET", "/api/v1/saves", "", nil, 401)
}
func TestProtocolViewConversion(t *testing.T) {
	v := sim.View{Metadata: sim.Metadata{Simulation: sim.Version, Protocol: 1, Seed: 42}, Player: 1, Tick: 12, Economy: sim.EconomyView{Credits: 6000000}, Entities: []sim.EntityView{{ID: 1, Type: "US.rifle", Private: &sim.EntityPrivate{HP: 300000, Orders: []sim.Order{{Kind: "move", Position: sim.Vec{X: 2000, Y: 3000}}}}}}}
	p, err := snapshot(v)
	if err != nil {
		t.Fatal(err)
	}
	if p.Economy.Credits != 6000000 || p.Entities[0].Private.Orders[0].Position.X != 2000 {
		t.Fatal(fmt.Sprint(p))
	}
	orders, err := decodeOrders(&pb.OrderBatch{Sequence: 1, Orders: []*pb.Order{{Kind: "move", Entities: []uint32{1}, Position: &pb.Vec{X: 2000, Y: 3000}}}})
	if err != nil || orders[0].Entities[0] != 1 {
		t.Fatal(err)
	}
}

func TestDebriefProtocolKeepsExactCountersAndMissionVersion(t *testing.T) {
	v := sim.View{Player: 1, Outcome: sim.Outcome{Finished: true}, Mission: &sim.MissionView{ID: "revision-check", Version: "mission-7"}, Debrief: &sim.Debrief{Players: []sim.DebriefPlayer{{Player: 1, Income: 9007199254740993, Metrics: sim.PlayerTelemetry{Player: 1, RepairSpent: 1234000, Timeline: []sim.EconomySample{{Tick: 400, Income: 9007199254740993}}}}}, Events: []sim.DebriefEvent{{Tick: 400, Kind: "checkpoint", Text: "midpoint"}}}}
	encoded, err := snapshot(v)
	if err != nil {
		t.Fatal(err)
	}
	if encoded.Mission.Version != "mission-7" || encoded.Debrief.Players[0].Income != 9007199254740993 || encoded.Debrief.Players[0].Metrics.Timeline[0].Income != 9007199254740993 || encoded.Debrief.Events[0].Text != "midpoint" {
		t.Fatal("debrief/provenance damaged in protocol conversion")
	}
}
