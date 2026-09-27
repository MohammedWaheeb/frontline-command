package server

import (
	"context"
	"encoding/json"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
	"testing"
	"time"
)

func TestMatchedLobbyLocksTeamsAndRequiresReadyAssets(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a, b := profile(t, h, "A"), profile(t, h, "B")
	body := map[string]any{"faction": "US", "latency_ms": 15, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash()}
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	body["faction"] = "IR"
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, body, 200)
	var id string
	json.Unmarshal(matched["lobby_id"], &id)
	if id == "" {
		t.Fatal("compatible players not matched")
	}
	info := request(t, h, "GET", "/api/v1/lobbies/"+id, a, nil, 200)
	var lobby Lobby
	json.Unmarshal(info["lobby"], &lobby)
	if !lobby.Rated || lobby.LiveObservers || len(lobby.Slots) != 2 || lobby.Slots[0].Team == lobby.Slots[1].Team {
		t.Fatal("invalid competitive lobby")
	}
	request(t, h, "PATCH", "/api/v1/lobbies/"+id, a, map[string]any{"team": 2}, 409)
	request(t, h, "POST", "/api/v1/lobbies/"+id+"/start", a, map[string]any{}, 409)
	request(t, h, "DELETE", "/api/v1/matchmaking", a, nil, 204)
	canceled := request(t, h, "GET", "/api/v1/matchmaking", b, nil, 200)
	var status string
	json.Unmarshal(canceled["status"], &status)
	if status != "canceled" {
		t.Fatal("declined pair left a stale accepted lobby", status)
	}
}

func TestRatedResultFromTwoRealSockets(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a, b := profile(t, h, "Alpha"), profile(t, h, "Bravo")
	body := map[string]any{"faction": "US", "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash(), "latency_ms": 1}
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	body["faction"] = "IR"
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, body, 200)
	var id string
	json.Unmarshal(matched["lobby_id"], &id)
	for _, token := range []string{a, b} {
		request(t, h, "POST", "/api/v1/lobbies/"+id+"/ready", token, map[string]any{"ready": true, "assets_ready": true, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash()}, 200)
	}
	started := request(t, h, "POST", "/api/v1/lobbies/"+id+"/start", a, map[string]any{}, 201)
	joined := request(t, h, "GET", "/api/v1/lobbies/"+id, b, nil, 200)
	var ac, bc map[string]any
	json.Unmarshal(started["connection"], &ac)
	json.Unmarshal(joined["connection"], &bc)
	x, _ := socket(t, h, s, ac)
	defer x.CloseNow()
	y, _ := socket(t, h, s, bc)
	defer y.CloseNow()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for {
		_, data, err := x.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		message := new(pb.Envelope)
		if err = proto.Unmarshal(data, message); err != nil {
			t.Fatal(err)
		}
		if delta := message.GetDelta(); delta != nil && delta.State.Countdown == 0 {
			break
		}
	}
	data, _ := proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Orders{Orders: &pb.OrderBatch{Sequence: 1, Orders: []*pb.Order{{Kind: "surrender"}}}}})
	if err := x.Write(ctx, websocket.MessageBinary, data); err != nil {
		t.Fatal(err)
	}
	var result *pb.MatchResult
	for result == nil {
		_, data, err := y.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		message := new(pb.Envelope)
		if err = proto.Unmarshal(data, message); err != nil {
			t.Fatal(err)
		}
		result = message.GetResult()
	}
	if !result.Committed || result.Void || result.Outcome.WinningTeam != 2 {
		t.Fatal("invalid rated result", result)
	}
	pa, _ := s.repo.Authenticate(ctx, a)
	pbProfile, _ := s.repo.Authenticate(ctx, b)
	ar, _ := s.repo.GetRating(ctx, pa.ID)
	br, _ := s.repo.GetRating(ctx, pbProfile.ID)
	if ar.Games != 1 || br.Games != 1 || ar.Rating != 980 || br.Rating != 1020 {
		t.Fatal("socket result did not atomically update local ratings", ar, br)
	}
	replayBytes, err := s.objects.Get(ctx, result.MatchId+".replay")
	if err != nil {
		t.Fatal(err)
	}
	replay, err := sim.DecodeReplay(replayBytes)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := replay.Seek(s.catalog, replay.FinalTick)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Outcome().WinningTeam != 2 {
		t.Fatal("persisted replay disagrees with authoritative result")
	}
}
func TestMatchingWidensSkillBeforeLatencyAndHonorsBlocks(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	a, _, _ := s.repo.CreateProfile(ctx, "A")
	b, _, _ := s.repo.CreateProfile(ctx, "B")
	now := time.Now()
	x := &queueEntry{Profile: a, Faction: "US", Maps: []string{"m"}, Rating: 1000, Latency: 200, Joined: now, Seen: now}
	y := &queueEntry{Profile: b, Faction: "IR", Maps: []string{"m"}, Rating: 1250, Latency: 15, Joined: now, Seen: now}
	s.queue = map[string]*queueEntry{a.ID: x, b.ID: y}
	if err := s.matchQueued(ctx, now); err != nil {
		t.Fatal(err)
	}
	if x.LobbyID != "" {
		t.Fatal("early matching ignored rating/latency limits")
	}
	if err := s.matchQueued(ctx, now.Add(90*time.Second)); err != nil {
		t.Fatal(err)
	}
	if x.LobbyID != "" {
		t.Fatal("latency widened before two minutes")
	}
	if err := s.repo.SetRelation(ctx, a.ID, b.ID, "block"); err != nil {
		t.Fatal(err)
	}
	x.Seen = now.Add(3 * time.Minute)
	y.Seen = x.Seen
	if err := s.matchQueued(ctx, x.Seen); err != nil {
		t.Fatal(err)
	}
	if x.LobbyID != "" {
		t.Fatal("blocked opponents matched")
	}
	if err := s.repo.SetRelation(ctx, a.ID, b.ID, "unblock"); err != nil {
		t.Fatal(err)
	}
	if err := s.matchQueued(ctx, x.Seen); err != nil {
		t.Fatal(err)
	}
	if x.LobbyID == "" || x.LobbyID != y.LobbyID {
		t.Fatal("eligible waiting opponents never matched")
	}
}
