package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func lobbyBody() map[string]any {
	return map[string]any{"name": "Admission fixture", "map_id": testMap().ID, "mode": "1v1", "faction": "US"}
}

func queueBody(s *Server) map[string]any {
	return map[string]any{"faction": "US", "latency_ms": 10, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash()}
}

func responseLobby(t *testing.T, response map[string]json.RawMessage) Lobby {
	t.Helper()
	var l Lobby
	if err := json.Unmarshal(response["lobby"], &l); err != nil || l.ID == "" {
		t.Fatal("invalid lobby response", err, response)
	}
	return l
}

func TestAdmissionAcrossLobbyQueueAndCoop(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	m, mission := scenarioFixture()
	m.ID = "scenario-admission-fixture"
	mission.MapID = m.ID
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a, b := profile(t, h, "Already waiting"), profile(t, h, "Other host")
	pa, _ := s.repo.Authenticate(context.Background(), a)
	engine, err := sim.NewMission(s.catalog, m, mission, "normal", 4)
	if err != nil {
		t.Fatal(err)
	}
	saved, _ := engine.Save()
	if _, err = s.repo.PutSave(context.Background(), storage.Save{ID: "admission-coop", Owner: pa.ID, Name: "Opening", Data: saved}, 0); err != nil {
		t.Fatal(err)
	}
	other := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", b, lobbyBody(), 201))
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 200)
	for _, endpoint := range []struct {
		path string
		body any
	}{
		{"/api/v1/lobbies", lobbyBody()},
		{"/api/v1/lobbies/" + other.ID + "/join", map[string]any{"faction": "IR"}},
		{"/api/v1/missions/" + mission.ID + "/lobby", map[string]any{}},
		{"/api/v1/saves/admission-coop/coop-lobby", map[string]any{}},
	} {
		response := request(t, h, "POST", endpoint.path, a, endpoint.body, 409)
		var code string
		_ = json.Unmarshal(response["code"], &code)
		if code != "already_queued" {
			t.Fatalf("wrong recovery code from %s: %v", endpoint.path, response)
		}
	}
	request(t, h, "DELETE", "/api/v1/matchmaking", a, nil, 204)
	request(t, h, "POST", "/api/v1/lobbies/"+other.ID+"/join", a, map[string]any{"faction": "IR"}, 200)
	request(t, h, "POST", "/api/v1/lobbies", a, lobbyBody(), 409)
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 409)
	request(t, h, "DELETE", "/api/v1/lobbies/"+other.ID+"/membership", a, nil, 204)
	request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{}, 201)
	request(t, h, "POST", "/api/v1/saves/admission-coop/coop-lobby", a, map[string]any{}, 409)
}

func TestConcurrentAdmissionOnlyReservesOneActivity(t *testing.T) {
	for attempt := 0; attempt < 5; attempt++ {
		t.Run(string(rune('A'+attempt)), func(t *testing.T) {
			s, h := testServer(t)
			installReviewedTestMap(s, testMap())
			a, b := profile(t, h, "Racing profile"), profile(t, h, "Lobby host")
			pa, _ := s.repo.Authenticate(context.Background(), a)
			other := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", b, lobbyBody(), 201))
			start := make(chan struct{})
			statuses := make(chan int, 3)
			var wg sync.WaitGroup
			for _, action := range []struct {
				path string
				body any
			}{
				{"/api/v1/lobbies", lobbyBody()},
				{"/api/v1/lobbies/" + other.ID + "/join", map[string]any{"faction": "IR"}},
				{"/api/v1/matchmaking", queueBody(s)},
			} {
				wg.Add(1)
				go func(path string, body any) {
					defer wg.Done()
					data, _ := json.Marshal(body)
					req := httptest.NewRequest("POST", path, bytes.NewReader(data))
					req.Header.Set("Authorization", "Bearer "+a)
					recorder := httptest.NewRecorder()
					<-start
					s.ServeHTTP(recorder, req)
					statuses <- recorder.Code
				}(action.path, action.body)
			}
			close(start)
			wg.Wait()
			close(statuses)
			accepted := 0
			for status := range statuses {
				if status == 200 || status == 201 {
					accepted++
				} else if status != 409 {
					t.Fatalf("unexpected admission status %d", status)
				}
			}
			if accepted != 1 {
				t.Fatalf("concurrent requests admitted %d activities", accepted)
			}
			s.mu.Lock()
			activities := 0
			if s.queue[pa.ID] != nil {
				activities++
			}
			for _, l := range s.lobbies {
				if lobbyMember(l, pa.ID) {
					activities++
				}
			}
			s.mu.Unlock()
			if activities != 1 {
				t.Fatalf("profile owns %d activities", activities)
			}
		})
	}
}

func TestRankedJoinIsIdempotentAndOutsiderCannotResetReady(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a, b, c := profile(t, h, "Queued A"), profile(t, h, "Queued B"), profile(t, h, "Outsider")
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 200)
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, queueBody(s), 200)
	var id string
	_ = json.Unmarshal(matched["lobby_id"], &id)
	for _, token := range []string{a, b} {
		request(t, h, "POST", "/api/v1/lobbies/"+id+"/join", token, map[string]any{}, 200)
		readyTestLobby(t, s, h, id, token)
	}
	request(t, h, "DELETE", "/api/v1/lobbies/"+id+"/membership", c, nil, 403)
	request(t, h, "POST", "/api/v1/lobbies/"+id+"/join", c, map[string]any{}, 403)
	l := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+id, a, nil, 200))
	if len(l.Slots) != 2 || !l.Slots[0].Ready || !l.Slots[1].Ready {
		t.Fatal("repeated join/outsider leave changed the matched lobby")
	}
}

func TestExpiredQueueDoesNotHoldProfile(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a := profile(t, h, "Stale queue")
	pa, _ := s.repo.Authenticate(context.Background(), a)
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 200)
	s.mu.Lock()
	s.queue[pa.ID].Seen = time.Now().Add(-3 * time.Minute)
	s.mu.Unlock()
	request(t, h, "POST", "/api/v1/lobbies", a, lobbyBody(), 201)
}

func TestExpiredQueueCapacityIsReclaimedBeforeAdmission(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a := profile(t, h, "Fresh queue")
	s.mu.Lock()
	s.queue = map[string]*queueEntry{}
	for i := 0; i < 128; i++ {
		s.queue[fmt.Sprint(i)] = &queueEntry{Seen: time.Now().Add(-3 * time.Minute)}
	}
	s.mu.Unlock()
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 200)
	s.mu.Lock()
	remaining := len(s.queue)
	s.mu.Unlock()
	if remaining != 1 {
		t.Fatalf("new admission left %d queue entries", remaining)
	}
}

func TestOutsiderCannotResetCustomLobbyReadiness(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a, b := profile(t, h, "Ready host"), profile(t, h, "Nonmember")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, lobbyBody(), 201))
	readyTestLobby(t, s, h, l.ID, a)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", b, nil, 403)
	l = responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, a, nil, 200))
	if len(l.Slots) != 1 || !l.Slots[0].Ready || !l.Slots[0].AssetsReady {
		t.Fatal("a nonmember invalidated the host's readiness")
	}
}

func TestCoopRematchStartsFreshAndRetainsComputerSlots(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a := profile(t, h, "Coop rematch host")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{"ally_ai": "hard", "difficulty": "hard", "pause_enabled": true}, 201))
	// The real result commit transition is covered through two WebSockets in
	// TestRatedResultFromTwoRealSockets. Here isolate the co-op cloning contract.
	completed := &liveMatch{id: "completed-coop-fixture", done: make(chan struct{})}
	completed.completed.Store(true)
	s.mu.Lock()
	old := s.lobbies[l.ID]
	old.MatchID = completed.id
	old.ResumeSave, old.ResumeOwner, old.ResumeRevision, old.ResumeTick = "old-checkpoint", old.Host, 7, 113
	s.matches[completed.id] = completed
	s.mu.Unlock()
	t.Cleanup(func() { s.mu.Lock(); delete(s.matches, completed.id); s.mu.Unlock() })
	next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/rematch", a, map[string]any{}, 201))
	if next.ScenarioID != mission.ID || next.Difficulty != "hard" || !next.PauseEnabled || len(next.Slots) != 3 || next.ResumeTick != 0 {
		t.Fatal("rematch changed scenario rules or retained checkpoint position", next)
	}
	if next.Slots[0].Ready || next.Slots[1].AI != "hard" || !next.Slots[1].Ready || !next.Slots[2].Script || !next.Slots[2].Ready {
		t.Fatal("co-op rematch lost controller ownership/readiness", next.Slots)
	}
	s.mu.Lock()
	rematch := s.lobbies[next.ID]
	if rematch.ResumeSave != "" || rematch.ResumeOwner != "" || rematch.ResumeRevision != 0 {
		t.Error("co-op rematch silently resumes a historical save")
	}
	s.mu.Unlock()
}

func TestActiveMatchCannotBeEscapedByAnotherAdmission(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a := profile(t, h, "Active commander")
	body := lobbyBody()
	body["ai"] = []aiRequest{{Faction: "IR", Difficulty: "normal", Team: 2}}
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, body, 201))
	readyTestLobby(t, s, h, l.ID, a)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201)
	request(t, h, "POST", "/api/v1/lobbies", a, lobbyBody(), 409)
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 409)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/rematch", a, map[string]any{}, 409)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", a, nil, 409)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", a, map[string]any{}, 200)
}
