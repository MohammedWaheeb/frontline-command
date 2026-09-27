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
	installReviewedTestMap(s, testMap())
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
	installReviewedTestMap(s, testMap())
	a, b := profile(t, h, "Alpha"), profile(t, h, "Bravo")
	body := map[string]any{"faction": "US", "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash(), "latency_ms": 1}
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	body["faction"] = "IR"
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, body, 200)
	var id string
	json.Unmarshal(matched["lobby_id"], &id)
	for _, token := range []string{a, b} {
		readyTestLobby(t, s, h, id, token)
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
	if policy := replay.LobbyInfo(); policy == nil || policy.Mode != "1v1" || !policy.Rated || !policy.Private || policy.LiveObservers || policy.PauseEnabled {
		t.Fatal("persisted replay lost declared lobby policy", policy)
	}
	restored, err := replay.Seek(s.catalog, replay.FinalTick)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Outcome().WinningTeam != 2 {
		t.Fatal("persisted replay disagrees with authoritative result")
	}
	// Result persistence releases admission immediately, while this actor and its
	// old connection tokens remain available throughout the debrief grace period.
	info := request(t, h, "POST", "/api/v1/lobbies/"+id+"/join", b, map[string]any{}, 200)
	var lobbyState string
	json.Unmarshal(info["state"], &lobbyState)
	if lobbyState != "completed" || len(info["connection"]) == 0 {
		t.Fatal("committed match was not available as a completed debrief")
	}
	finishedQueue := request(t, h, "GET", "/api/v1/matchmaking", b, nil, 200)
	var queueStatus string
	json.Unmarshal(finishedQueue["status"], &queueStatus)
	if queueStatus != "completed" {
		t.Fatal("finished matchmaking entry still reserved its player")
	}
	outsider := profile(t, h, "Outside the match")
	request(t, h, "POST", "/api/v1/lobbies/"+id+"/rematch", outsider, map[string]any{}, 403)
	rematched := request(t, h, "POST", "/api/v1/lobbies/"+id+"/rematch", b, map[string]any{}, 201)
	rematch := responseLobby(t, rematched)
	var code string
	json.Unmarshal(rematched["code"], &code)
	if rematch.Rated || rematch.PreviousMatch != result.MatchId || len(rematch.Slots) != 1 || rematch.Slots[0].Player != 2 || rematch.Slots[0].Ready || rematch.Slots[0].AssetsReady {
		t.Fatal("rematch must be an explicit fresh unranked lobby", rematch)
	}
	retried := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+id+"/rematch", b, map[string]any{}, 200))
	if retried.ID != rematch.ID {
		t.Fatal("rematch retry created a duplicate lobby")
	}
	searching := request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	json.Unmarshal(searching["status"], &queueStatus)
	if queueStatus != "searching" {
		t.Fatal("finished ranked lobby prevented a new queue attempt")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+rematch.ID+"/join", a, map[string]any{"code": code, "faction": "US"}, 409)
	request(t, h, "DELETE", "/api/v1/matchmaking", a, nil, 204)
	request(t, h, "POST", "/api/v1/lobbies/"+rematch.ID+"/join", a, map[string]any{"code": code, "faction": "US"}, 200)
	request(t, h, "POST", "/api/v1/lobbies/"+rematch.ID+"/start", b, map[string]any{}, 409)
	for _, token := range []string{a, b} {
		readyTestLobby(t, s, h, rematch.ID, token)
	}
	next := request(t, h, "POST", "/api/v1/lobbies/"+rematch.ID+"/start", b, map[string]any{}, 201)
	var nextConnection map[string]any
	json.Unmarshal(next["connection"], &nextConnection)
	if nextConnection["match_id"] == result.MatchId || nextConnection["token"] == bc["token"] {
		t.Fatal("rematch reused prior simulation or credentials")
	}
	s.mu.Lock()
	previousMatch := s.matches[result.MatchId]
	s.mu.Unlock()
	if previousMatch == nil || !previousMatch.completed.Load() {
		t.Fatal("starting another match destroyed the old debrief actor")
	}
	if view := previousMatch.call(ctx, matchRequest{kind: "view", player: 2}); view.err != nil || !view.view.Outcome.Finished {
		t.Fatal("previous debrief view was lost", view.err)
	}
}
func TestMatchingWidensSkillBeforeLatencyAndHonorsBlocks(t *testing.T) {
	s, _ := testServer(t)
	m := testMap()
	m.ID = "m"
	installReviewedTestMap(s, m)
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
