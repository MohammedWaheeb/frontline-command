package server

import (
	"bytes"
	"context"
	"encoding/json"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// Only synthetic fixtures are marked reviewed here. Production eligibility is
// exclusively the installed hash manifest; this helper is never product code.
func installReviewedTestMap(s *Server, m content.Map) {
	s.maps[m.ID] = m
	if s.rankedMaps == nil {
		s.rankedMaps = map[string]string{}
	}
	s.rankedMaps[m.ID] = lobbyMapHash(m)
}
func lobbyFourMap() content.Map {
	m := testMap()
	m.ID = "lobby-four-fixture"
	m.Spawns = append(m.Spawns, content.Spawn{Position: content.Point{X: 8000, Y: 56000}}, content.Spawn{Position: content.Point{X: 56000, Y: 8000}})
	return m
}
func readyTestLobby(t *testing.T, s *Server, h *httptest.Server, id string, tokens ...string) {
	t.Helper()
	for _, token := range tokens {
		l := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+id, token, nil, 200))
		request(t, h, "POST", "/api/v1/lobbies/"+id+"/ready", token, map[string]any{"ready": true, "assets_ready": true, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash(), "expected_revision": l.Revision}, 200)
	}
}
func friendProfiles(t *testing.T, s *Server, a, b string) (storage.Profile, storage.Profile) {
	t.Helper()
	ctx := context.Background()
	pa, _ := s.repo.Authenticate(ctx, a)
	pb, _ := s.repo.Authenticate(ctx, b)
	if err := s.repo.SetRelation(ctx, pa.ID, pb.ID, "request"); err != nil {
		t.Fatal(err)
	}
	if err := s.repo.SetRelation(ctx, pb.ID, pa.ID, "accept"); err != nil {
		t.Fatal(err)
	}
	return pa, pb
}

func TestLobbyConfigurationColorsAIAndReadyAreAtomic(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	a, b := profile(t, h, "Host"), profile(t, h, "Guest")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"name": "Color test", "map_id": m.ID, "mode": "custom", "faction": "US", "color": 7, "team": 1, "ai": []map[string]any{{"faction": "IR", "difficulty": "normal", "team": 2}}}, 201))
	if l.Rules == nil || *l.Rules != standardLobbyRules() || l.MapHash != lobbyMapHash(m) || l.Slots[0].Color != 7 || l.Slots[1].Color == 0 || l.Slots[1].Color == 7 {
		t.Fatal("missing declared rules/map/colors", l)
	}
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "SY", "team": 2, "color": 3}, 200))
	readyTestLobby(t, s, h, l.ID, a, b)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", b, map[string]any{"difficulty": "hard"}, 403)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"faction": "SA", "color": 3, "name": "Must not apply"}, 409)
	same := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, a, nil, 200))
	if same.Slots[0].Faction != "US" || same.Name != "Color test" || !same.Slots[0].Ready || !same.Slots[2].Ready {
		t.Fatal("failed change partially mutated lobby", same)
	}
	l = responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"difficulty": "hard", "faction": "SA", "team": 3, "color": 8}, 200))
	if l.Slots[1].AI != "hard" || l.Slots[1].Faction != "SA" || l.Slots[1].Color != 8 || l.Slots[0].Ready || l.Slots[2].Ready {
		t.Fatal("AI update or ready reset wrong", l)
	}
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "easy", "faction": "random"}, 201))
	if len(l.Slots) != 4 || !content.ValidFaction(l.Slots[3].Faction) {
		t.Fatal("AI slot addition failed", l)
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "normal", "faction": "US"}, 409)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/1", a, nil, 409)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/3", b, nil, 403)
	l = responseLobby(t, request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/3", a, nil, 200))
	if len(l.Slots) != 3 {
		t.Fatal("forming kick did not remove human")
	}
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"rules": map[string]any{"ruleset": "standard-v2", "speed": 1, "starting_credits": 99999, "supply_cap": 100, "fog": true, "strategic_operations": true}}, 400)
	l = responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"name": "Declared policy", "private": true, "live_observers": true, "pause_enabled": true}, 200))
	if !l.LiveObservers || !l.Private || !l.PauseEnabled {
		t.Fatal("declared host policy not visible")
	}
	readyTestLobby(t, s, h, l.ID, a)
	started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201))
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/2", a, nil, 409)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "easy", "faction": "US"}, 409)
	s.mu.Lock()
	match := s.matches[started.MatchID]
	s.mu.Unlock()
	saved := match.call(context.Background(), matchRequest{kind: "save"})
	restored, err := sim.Restore(s.catalog, saved.data)
	if err != nil {
		t.Fatal(err)
	}
	for _, player := range restored.StateCopy().Players {
		for _, slot := range started.Slots {
			if player.ID == slot.Player && player.Color != slot.Color {
				t.Fatal("lobby color changed at match/save boundary")
			}
		}
	}
}

func TestLobbyInvitesRequireFriendshipAcceptanceAndCurrentAccess(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a, b, c := profile(t, h, "Host"), profile(t, h, "Friend"), profile(t, h, "Outsider")
	pa, _ := s.repo.Authenticate(context.Background(), a)
	pb, _ := s.repo.Authenticate(context.Background(), b)
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"name": "Invite test", "map_id": testMap().ID, "mode": "1v1", "private": true, "faction": "US"}, 201))
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", a, map[string]any{"target": pb.ID}, 403)
	friendProfiles(t, s, a, b)
	created := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", a, map[string]any{"target": pb.ID}, 201)
	var id string
	json.Unmarshal(created["id"], &id)
	duplicate := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", a, map[string]any{"target": pb.ID}, 200)
	if string(created["id"]) != string(duplicate["id"]) {
		t.Fatal("duplicate invite created repeated notification")
	}
	if len(s.lobbies[l.ID].Slots) != 1 {
		t.Fatal("inviting silently enrolled recipient")
	}
	request(t, h, "POST", "/api/v1/invites/"+id+"/accept", c, map[string]any{"faction": "IR"}, 404)
	request(t, h, "GET", "/api/v1/lobbies/"+l.ID, b, nil, 403)
	request(t, h, "POST", "/api/v1/matchmaking", b, queueBody(s), 200)
	request(t, h, "POST", "/api/v1/invites/"+id+"/accept", b, map[string]any{"faction": "IR"}, 409)
	request(t, h, "DELETE", "/api/v1/matchmaking", b, nil, 204)
	joined := responseLobby(t, request(t, h, "POST", "/api/v1/invites/"+id+"/accept", b, map[string]any{"color": 5}, 200))
	if len(joined.Slots) != 2 || joined.Slots[1].Color != 5 || !content.ValidFaction(joined.Slots[1].Faction) {
		t.Fatal("explicit acceptance failed", joined)
	}
	request(t, h, "POST", "/api/v1/invites/"+id+"/accept", b, map[string]any{}, 200)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", b, nil, 204)
	created = request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", a, map[string]any{"target": pb.ID}, 201)
	json.Unmarshal(created["id"], &id)
	if err := s.repo.SetRelation(context.Background(), pb.ID, pa.ID, "block"); err != nil {
		t.Fatal(err)
	}
	request(t, h, "POST", "/api/v1/invites/"+id+"/accept", b, map[string]any{"faction": "IR"}, 403)
	listing := request(t, h, "GET", "/api/v1/invites", b, nil, 200)
	var invites []LobbyInvite
	json.Unmarshal(listing["invites"], &invites)
	if len(invites) != 0 {
		t.Fatal("blocked invitation remained visible")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"code": s.lobbies[l.ID].Code, "faction": "IR"}, 403)
}

func TestRankedMapsRequireInstalledReviewedHashAndExposeVetoSelection(t *testing.T) {
	s, h := testServer(t)
	m := testMap()
	s.maps[m.ID] = m
	a, b := profile(t, h, "A"), profile(t, h, "B")
	request(t, h, "POST", "/api/v1/matchmaking", a, queueBody(s), 409)
	body := queueBody(s)
	body["maps"] = []string{m.ID}
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 400)
	installReviewedTestMap(s, m)
	custom := m
	custom.ID = "uploaded-only"
	data, _ := json.Marshal(custom)
	pa, _ := s.repo.Authenticate(context.Background(), a)
	if _, err := s.repo.PutMap(context.Background(), storage.MapRecord{ID: custom.ID, Owner: pa.ID, Title: custom.Title, Data: data}, 0); err != nil {
		t.Fatal(err)
	}
	body["maps"] = []string{custom.ID}
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 400)
	maps := request(t, h, "GET", "/api/v1/matchmaking/maps", a, nil, 200)
	var choices []struct {
		ID   string `json:"id"`
		Hash string `json:"hash"`
	}
	json.Unmarshal(maps["maps"], &choices)
	if len(choices) != 1 || choices[0].ID != m.ID || choices[0].Hash != lobbyMapHash(m) {
		t.Fatal("ranked list included unreviewed maps", choices)
	}
	body["maps"] = []string{m.ID}
	queued := request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	var selected []string
	json.Unmarshal(queued["maps"], &selected)
	if len(selected) != 1 || selected[0] != m.ID {
		t.Fatal("queue did not declare pre-ready veto choices")
	}
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, body, 200)
	var id string
	json.Unmarshal(matched["lobby_id"], &id)
	l := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+id, a, nil, 200))
	if !l.Rated || l.MapHash != lobbyMapHash(m) {
		t.Fatal("rated lobby lost reviewed version")
	}
	readyTestLobby(t, s, h, id, a, b)
	m.Version = "changed"
	s.mu.Lock()
	s.maps[m.ID] = m
	s.mu.Unlock()
	request(t, h, "POST", "/api/v1/lobbies/"+id+"/start", a, map[string]any{}, 409)
}

func TestRankedReviewManifestFailsClosed(t *testing.T) {
	m := testMap()
	root := t.TempDir()
	dir := filepath.Join(root, "maps")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(m)
	os.WriteFile(filepath.Join(dir, "map.json"), data, 0600)
	manifest := map[string]any{"format_version": 1, "maps": []map[string]string{{"id": m.ID, "hash": lobbyMapHash(m)}}}
	data, _ = json.Marshal(manifest)
	os.WriteFile(filepath.Join(root, "ranked-maps.json"), data, 0600)
	s, err := New(Config{DataDir: t.TempDir(), MapDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	if !s.rankedMap(m.ID) {
		t.Fatal("reviewed installed version not eligible")
	}
	s.Close()
	m.Version = "edited"
	data, _ = json.Marshal(m)
	os.WriteFile(filepath.Join(dir, "map.json"), data, 0600)
	if invalid, err := New(Config{DataDir: t.TempDir(), MapDir: dir}); err == nil {
		invalid.Close()
		t.Fatal("changed bytes silently inherited ranked approval")
	}
}

func TestLobbyOneThroughFourParticipantsAndMixedBotModes(t *testing.T) {
	for _, test := range []struct {
		name, mode string
		teams      []uint32
	}{{"solo_custom", "custom", []uint32{1}}, {"duel_bot", "1v1", []uint32{1, 2}}, {"three_ffa", "ffa", []uint32{1, 1, 1}}, {"four_ffa", "ffa", []uint32{1, 1, 1, 1}}, {"two_versus_two", "2v2", []uint32{1, 1, 2, 2}}} {
		t.Run(test.name, func(t *testing.T) {
			s, h := testServer(t)
			m := lobbyFourMap()
			s.maps[m.ID] = m
			a := profile(t, h, "Commander")
			ais := []map[string]any{}
			for i, team := range test.teams[1:] {
				ais = append(ais, map[string]any{"faction": []string{"IR", "SY", "SA"}[i], "difficulty": "normal", "team": team})
			}
			l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"name": test.name, "map_id": m.ID, "mode": test.mode, "faction": "US", "team": test.teams[0], "ai": ais}, 201))
			if len(l.Slots) != len(test.teams) {
				t.Fatal("wrong participant count")
			}
			if test.mode == "ffa" {
				seen := map[uint32]bool{}
				for _, slot := range l.Slots {
					if seen[slot.Team] {
						t.Fatal("FFA accepted an alliance")
					}
					seen[slot.Team] = true
				}
			}
			readyTestLobby(t, s, h, l.ID, a)
			l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201))
			s.mu.Lock()
			match := s.matches[l.MatchID]
			s.mu.Unlock()
			saved := match.call(context.Background(), matchRequest{kind: "save"})
			e, err := sim.Restore(s.catalog, saved.data)
			if err != nil {
				t.Fatal(err)
			}
			for e.Tick() < sim.Tick(140) {
				e.Advance()
			}
			if e.Outcome().Finished {
				t.Fatal("legal opening automatically ended", e.Outcome())
			}
			if match.replayLobby == nil || match.replayLobby.Mode != test.mode {
				t.Fatal("replay policy was not captured before actor startup")
			}
		})
	}
}

func TestScenarioAllyChangesRespectLocksAndPreserveSavedColors(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a, b := profile(t, h, "First"), profile(t, h, "Second")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{"difficulty": "hard"}, 201))
	if l.Rules != nil || l.ScenarioRules == nil || l.ScenarioRules.Resumed || l.ScenarioRules.Difficulty != "hard" || len(l.ScenarioRules.StartingCredits) != 3 || l.ScenarioRules.StartingCredits[2].Credits != 9000000 {
		t.Fatal("scenario summary did not use authoritative difficulty credits", l.ScenarioRules)
	}
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/3", a, nil, 409)
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ai", a, map[string]any{"difficulty": "easy", "color": 7}, 201))
	if len(l.Slots) != 3 || l.Slots[2].Player != 2 || l.Slots[2].Faction != "SA" {
		t.Fatal("ally addition changed scenario players", l)
	}
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"faction": "IR"}, 409)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID+"/ai/2", a, map[string]any{"difficulty": "hard"}, 200)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/slots/2", a, nil, 200)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", a, nil, 204)
	e, err := sim.NewMission(s.catalog, m, mission, "normal", 19)
	if err != nil {
		t.Fatal(err)
	}
	if err = e.ConfigurePlayerColors(map[sim.PlayerID]uint32{1: 8, 2: 7, 3: 6}); err != nil {
		t.Fatal(err)
	}
	saved, _ := e.Save()
	pa, _ := s.repo.Authenticate(context.Background(), a)
	if _, err = s.repo.PutSave(context.Background(), storage.Save{ID: "lobby-color-checkpoint", Owner: pa.ID, Name: "Colors", Data: saved}, 0); err != nil {
		t.Fatal(err)
	}
	l = responseLobby(t, request(t, h, "POST", "/api/v1/saves/lobby-color-checkpoint/coop-lobby", a, map[string]any{}, 201))
	if l.Rules != nil || l.ScenarioRules == nil || !l.ScenarioRules.Resumed || len(l.ScenarioRules.StartingCredits) != 0 {
		t.Fatal("resume lobby advertised fresh cash or exposed private saved balances")
	}
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"color": 1}, 409)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"color": 2}, 409)
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{}, 200))
	expected := map[sim.PlayerID]uint32{1: 8, 2: 7, 3: 6}
	for _, slot := range l.Slots {
		if slot.Color != expected[slot.Player] {
			t.Fatal("checkpoint color changed", slot)
		}
	}
	readyTestLobby(t, s, h, l.ID, a, b)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201)
}

func TestTwoInvitationAcceptsCannotAdmitOneProfileTwice(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a, b, c := profile(t, h, "First host"), profile(t, h, "Second host"), profile(t, h, "Invited player")
	_, pc := friendProfiles(t, s, a, c)
	friendProfiles(t, s, b, c)
	ids := []string{}
	for _, host := range []string{a, b} {
		body := lobbyBody()
		body["private"] = true
		l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, body, 201))
		result := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", host, map[string]any{"target": pc.ID}, 201)
		var id string
		json.Unmarshal(result["id"], &id)
		ids = append(ids, id)
	}
	start := make(chan struct{})
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			r := httptest.NewRequest("POST", "/api/v1/invites/"+id+"/accept", bytes.NewBufferString(`{"faction":"IR"}`))
			r.Header.Set("Authorization", "Bearer "+c)
			w := httptest.NewRecorder()
			<-start
			s.ServeHTTP(w, r)
			statuses <- w.Code
		}(id)
	}
	close(start)
	wg.Wait()
	close(statuses)
	accepted := 0
	for status := range statuses {
		if status == 200 {
			accepted++
		} else if status != 409 {
			t.Fatal("unexpected concurrent invitation status", status)
		}
	}
	if accepted != 1 {
		t.Fatal("concurrent accepts admitted multiple activities", accepted)
	}
}

func TestDefaultColorsReserveExplicitAIChoicesAndNoopKeepsReady(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a := profile(t, h, "Commander")
	body := lobbyBody()
	body["ai"] = []map[string]any{{"faction": "IR", "difficulty": "easy", "color": 1}}
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, body, 201))
	if l.Slots[0].Color != 2 || l.Slots[1].Color != 1 {
		t.Fatal("automatic color took an explicitly reserved AI color", l.Slots)
	}
	readyTestLobby(t, s, h, l.ID, a)
	l = responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{}, 200))
	if !l.Slots[0].Ready {
		t.Fatal("no-op configuration reset another loading cycle")
	}
}
