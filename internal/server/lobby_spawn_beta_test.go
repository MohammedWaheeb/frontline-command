package server

import (
	"context"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"net/http"
	"reflect"
	"testing"
)

func spawnErrorCode(t *testing.T, response map[string]json.RawMessage, want string) {
	t.Helper()
	var got struct {
		Code string `json:"code"`
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if got.Code != want {
		t.Fatalf("code = %q, want %q", got.Code, want)
	}
}

func TestBetaLobbySpawnChoiceOwnAIValidationAndPersistence(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	original := append([]content.Spawn(nil), m.Spawns...)
	a, b, outsider := profile(t, h, "Host"), profile(t, h, "Joiner"), profile(t, h, "Outsider")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"map_id": m.ID, "mode": "custom", "faction": "US", "spawn": 4}, 201))
	if l.Slots[0].Spawn != 4 {
		t.Fatal("host spawn choice missing", l.Slots)
	}
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "IR", "spawn": 2}, 200))
	if l.Slots[1].Spawn != 2 || l.Slots[1].Team == l.Slots[0].Team {
		t.Fatal("join choice/default opponent missing", l.Slots)
	}
	readyTestLobby(t, s, h, l.ID, a, b)
	revision := l.Revision
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"spawn": 2, "faction": "SA"}, 409), "spawn_unavailable")
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"spawn": 5}, 400), "invalid_spawn")
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, outsider, map[string]any{"spawn": 3}, 403)
	same := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, a, nil, 200))
	if same.Revision != revision || same.Slots[0].Faction != "US" || !same.Slots[0].Ready || !same.Slots[1].Ready {
		t.Fatal("failed spawn change mutated lobby", same)
	}
	l = responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, b, map[string]any{"spawn": 3}, 200))
	if l.Slots[1].Spawn != 3 || l.Slots[0].Ready || l.Slots[1].Ready || l.Revision != revision+1 {
		t.Fatal("own spawn change did not reset readiness", l)
	}
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"faction": "SA", "difficulty": "normal", "spawn": 1}, 201))
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/3", b, map[string]any{"spawn": 2}, 403)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"spawn": 2}, 409)
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/3", a, map[string]any{"spawn": 3}, 409), "spawn_unavailable")
	l = responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/3", a, map[string]any{"spawn": 2}, 200))
	readyTestLobby(t, s, h, l.ID, a, b)
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201))
	s.mu.Lock()
	match := s.matches[l.MatchID]
	s.mu.Unlock()
	saved := match.call(context.Background(), matchRequest{kind: "save"})
	engine, err := sim.Restore(s.catalog, saved.data)
	if err != nil {
		t.Fatal(err)
	}
	assertStarts := func(e *sim.Engine) {
		t.Helper()
		state := e.StateCopy()
		for _, slot := range l.Slots {
			found := false
			for _, entity := range state.Entities {
				if entity.Owner == slot.Player && entity.Type == "hq" {
					if entity.Position != original[slot.Spawn-1].Position {
						t.Fatalf("player %d HQ = %v, selected spawn %d = %v", slot.Player, entity.Position, slot.Spawn, original[slot.Spawn-1].Position)
					}
					found = true
				}
			}
			if !found {
				t.Fatalf("missing HQ for player %d", slot.Player)
			}
		}
	}
	for _, player := range engine.StateCopy().Players {
		for _, slot := range l.Slots {
			if player.ID == slot.Player && player.Spawn != slot.Spawn {
				t.Fatalf("explicit start lost: %+v / %+v", player, slot)
			}
		}
	}
	assertStarts(engine)
	restarted, err := engine.Restart()
	if err != nil {
		t.Fatal(err)
	}
	assertStarts(restarted)
	replay, err := sim.NewReplay(engine)
	if err != nil {
		t.Fatal(err)
	}
	replayEngine, err := replay.Seek(s.catalog, engine.Tick())
	if err != nil {
		t.Fatal(err)
	}
	assertStarts(replayEngine)
	if !reflect.DeepEqual(s.maps[m.ID].Spawns, original) || lobbyMapHash(s.maps[m.ID]) != lobbyMapHash(m) {
		t.Fatal("spawn adapter mutated installed map or its hash")
	}
	// Exercise the same authenticated context fetch and expected-hash check as
	// online mapFor, including the actual X-Frontline-Map-Hash header.
	req, err := http.NewRequest("GET", h.URL+"/api/v1/maps/"+m.ID+"?match_id="+l.MatchID, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+a)
	response, err := h.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var actual content.Map
	if err = json.NewDecoder(response.Body).Decode(&actual); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 || response.Header.Get("X-Frontline-Map-Hash") != l.MapHash || l.MapHash != lobbyMapHash(actual) || actual.Version != l.MapVersion {
		t.Fatal("active declaration mismatches delivered match blueprint", response.StatusCode, response.Header, l.MapHash)
	}
	if !reflect.DeepEqual(actual.Spawns, original) || !reflect.DeepEqual(actual.Spawns, engine.StateCopy().Map.Spawns) {
		t.Fatal("client received different starting positions from simulation")
	}
	s.mu.Lock()
	pinned := *s.lobbies[l.ID].mapData
	s.mu.Unlock()
	if !reflect.DeepEqual(pinned.Spawns, original) {
		t.Fatal("forming map pin for rematches was mutated")
	}

}

func TestBetaLobbySpawnAutomaticAfterLeaveAndMapCapacity(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	small := testMap()
	s.maps[small.ID] = small
	a, b, c := profile(t, h, "Host"), profile(t, h, "Leaving"), profile(t, h, "New arrival")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"map_id": m.ID, "mode": "custom", "faction": "US", "spawn": 4}, 201))
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "IR"}, 200))
	if l.Slots[1].Spawn != 1 {
		t.Fatal("automatic join did not pick first free position", l.Slots)
	}
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"map_id": small.ID}, 409), "map_capacity")
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", b, nil, 204)
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", c, map[string]any{"faction": "SA"}, 200))
	if l.Slots[1].Player != 2 || l.Slots[1].Spawn != 1 {
		t.Fatal("replacement changed player ID or reused occupied spawn", l.Slots)
	}
}

func TestBetaLobbyTeamDefaultsAndExplicitChoice(t *testing.T) {
	for _, mode := range []string{"custom", "1v1", "ffa", "2v2"} {
		t.Run(mode, func(t *testing.T) {
			l := &Lobby{Mode: mode, Slots: []LobbySlot{{Player: 1, Team: 4}}}
			want := []uint32{1, 2, 3}
			if mode == "2v2" {
				want = []uint32{1, 4, 1}
			}
			for i, expected := range want {
				got := lobbyDefaultTeam(l)
				if got != expected {
					t.Fatalf("next team %d = %d, want %d", i, got, expected)
				}
				l.Slots = append(l.Slots, LobbySlot{Player: sim.PlayerID(i + 2), Team: got})
			}
		})
	}
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	a, b := profile(t, h, "Host"), profile(t, h, "Ally")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"map_id": m.ID, "mode": "custom", "faction": "US", "team": 4}, 201))
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "SA", "team": 4}, 200))
	if l.Slots[1].Faction != "SA" || l.Slots[1].Team != 4 {
		t.Fatal("explicit join faction/team lost", l.Slots)
	}
}

func TestBetaLobbySpawnPrescribedLocks(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a, b := profile(t, h, "Scenario host"), profile(t, h, "Scenario ally")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{}, 201))
	for _, slot := range l.Slots {
		if slot.Spawn != uint32(slot.Player) {
			t.Fatal("authored start changed", l.Slots)
		}
	}
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"spawn": 2}, 409), "scenario_rules_locked")
	spawnErrorCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"spawn": 2}, 409), "scenario_rules_locked")
	spawnErrorCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "easy", "spawn": 2}, 409), "scenario_rules_locked")
	spawnErrorCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "IR"}, 409), "scenario_rules_locked")
	spawnErrorCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "random", "team": 3}, 409), "scenario_rules_locked")
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "random"}, 200))
	ally := l.Slots[len(l.Slots)-1]
	if ally.Player != 2 || ally.Faction != "SA" || ally.Team != 1 || ally.Spawn != 2 {
		t.Fatal("generic Auto co-op join changed authored commander", ally)
	}
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", b, nil, 204)

	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "easy"}, 201))
	for _, slot := range l.Slots {
		if slot.Spawn != uint32(slot.Player) {
			t.Fatal("automatic authored ally changed starts", l.Slots)
		}
	}
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"spawn": 1}, 409), "scenario_rules_locked")
	// Exercise independent ranked/checkpoint guards without constructing unrelated
	// matchmaking or checkpoint persistence fixtures.
	s.mu.Lock()
	live := s.lobbies[l.ID]
	live.ScenarioID = ""
	live.ScenarioRules = nil
	live.Mode = "custom"
	live.Rated = true
	s.mu.Unlock()
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"spawn": 1}, 409), "ranked_rules_locked")
	s.mu.Lock()
	live.Rated = false
	live.ResumeSave = "synthetic-checkpoint"
	s.mu.Unlock()
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"spawn": 1}, 409), "scenario_rules_locked")
	spawnErrorCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"spawn": 1}, 409), "scenario_rules_locked")
}
