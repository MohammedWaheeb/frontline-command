package server

import (
	"context"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
	"time"
)

func scenarioFixture() (content.Map, content.Mission) {
	m := testMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: content.Point{X: 56000, Y: 8000}})
	mission := content.Mission{ID: "coop-fixture", Title: "Synthetic cooperative objective", Version: "1", MapID: m.ID, Faction: "US", Mode: "coop", DefaultBases: true,
		Players:    []content.MissionPlayer{{ID: 1, Controller: "human", Faction: "US", Name: "First", Team: 1, Credits: 6000000}, {ID: 2, Controller: "human", Faction: "SA", Name: "Second", Team: 1, Credits: 6000000}, {ID: 3, Controller: "script", Faction: "IR", Name: "Scripted opposition", Team: 2, Credits: 6000000}},
		Objectives: []content.MissionObjective{{ID: "survive", Text: "Backend timer", Condition: content.MissionCondition{Kind: "timer", Tick: 200}}},
		Triggers:   []content.MissionTrigger{{ID: "checkpoint", Condition: content.MissionCondition{Kind: "timer", Tick: 110}, Actions: []content.MissionAction{{Kind: "checkpoint", Text: "midpoint"}}}},
		Difficulty: []content.MissionDifficulty{{ID: "hard", EnemyCreditsMultiplier: 1500, WaveTimeMultiplier: 800}}}
	return m, mission
}

func TestCoopResumePreservesStateAndRejectsEditedCheckpoint(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID] = m
	s.missions[mission.ID] = mission
	a, b := profile(t, h, "A"), profile(t, h, "B")
	pa, _ := s.repo.Authenticate(context.Background(), a)
	pbProfile, _ := s.repo.Authenticate(context.Background(), b)
	engine, err := sim.NewMission(s.catalog, m, mission, "normal", 9)
	if err != nil {
		t.Fatal(err)
	}
	for engine.Tick() < 112 {
		engine.Advance()
	}
	if err = engine.Submit(2, 7, []sim.Order{{Kind: "repair_reserve", Index: 700}}); err != nil {
		t.Fatal(err)
	}
	engine.Advance()
	data, _ := engine.Save()
	if err = s.repo.PutSharedSave(context.Background(), []string{pa.ID, pbProfile.ID}, "shared-coop", "Midpoint", data); err != nil {
		t.Fatal(err)
	}
	created := request(t, h, "POST", "/api/v1/saves/shared-coop/coop-lobby", a, map[string]any{"player": 2}, 201)
	var l Lobby
	json.Unmarshal(created["lobby"], &l)
	if l.ResumeTick != 113 || l.Slots[0].Player != 2 {
		t.Fatal("resume did not select saved commander")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{}, 200)
	s.mu.Lock()
	live := s.lobbies[l.ID]
	restored, err := s.scenarioEngine(live, m, 999)
	s.mu.Unlock()
	if err != nil || restored.Hash() != engine.Hash() {
		t.Fatal("co-op resume rebuilt or changed state", err)
	}
	view, _ := restored.PlayerView(2)
	if view.Economy.LastSequence != 7 {
		t.Fatal("resume omitted next command sequence baseline")
	}
	stored, _ := s.repo.GetSave(context.Background(), pa.ID, "shared-coop")
	if _, err = s.repo.PutSave(context.Background(), stored, stored.Revision); err != nil {
		t.Fatal(err)
	}
	if _, err = s.scenarioEngine(live, m, 999); err == nil {
		t.Fatal("accepted checkpoint changed after lobby creation")
	}
}
func TestCoopMidpointSavedOutsideSimulationLoop(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	m, mission := scenarioFixture()
	a, _, _ := s.repo.CreateProfile(ctx, "A")
	b, _, _ := s.repo.CreateProfile(ctx, "B")
	engine, err := sim.NewMission(s.catalog, m, mission, "normal", 9)
	if err != nil {
		t.Fatal(err)
	}
	for engine.Tick() < 109 {
		engine.Advance()
	}
	live, err := newMatch("coop-mid", engine, []slot{{Player: 1, Profile: a.ID}, {Player: 2, Profile: b.ID}, {Player: 3, AI: true}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	defer live.close()
	for _, id := range []sim.PlayerID{1, 2} {
		p := &peer{player: id, out: make(chan []byte, 64), done: make(chan struct{})}
		if reply := live.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		save, err := s.repo.GetSave(ctx, a.ID, "coop-coop-mid-110")
		if err == nil {
			other, err := s.repo.GetSave(ctx, b.ID, save.ID)
			if err != nil || string(other.Data) != string(save.Data) {
				t.Fatal("participants received different checkpoint states")
			}
			restored, err := sim.Restore(s.catalog, save.Data)
			if err != nil || restored.StateCopy().Mission.Checkpoint != "midpoint" {
				t.Fatal("invalid midpoint", err)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("checkpoint event was not persisted")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
func TestCoopScenarioLobbyAndOpeningSharedCheckpoint(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID] = m
	s.missions[mission.ID] = mission
	a, b := profile(t, h, "Coop A"), profile(t, h, "Coop B")
	created := request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{"difficulty": "hard"}, 201)
	var l Lobby
	json.Unmarshal(created["lobby"], &l)
	if len(l.Slots) != 2 || !l.Slots[1].Script || !l.Slots[1].Ready {
		t.Fatal("scripted opponent became an unfilled human slot")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{}, 200)
	request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, b, map[string]any{"faction": "IR"}, 409)
	for _, token := range []string{a, b} {
		request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ready", token, map[string]any{"ready": true, "assets_ready": true, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash()}, 200)
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201)
	for _, token := range []string{a, b} {
		p, _ := s.repo.Authenticate(context.Background(), token)
		saves, err := s.repo.ListSaves(context.Background(), p.ID)
		if err != nil || len(saves) != 1 {
			t.Fatal("opening checkpoint not stored for both humans", err)
		}
		save, err := s.repo.GetSave(context.Background(), p.ID, saves[0].ID)
		if err != nil {
			t.Fatal(err)
		}
		engine, err := sim.Restore(s.catalog, save.Data)
		if err != nil {
			t.Fatal(err)
		}
		state := engine.StateCopy()
		if state.Mission == nil || state.Mission.Checkpoint != "opening" || state.Players[2].Controller != "script" {
			t.Fatal("invalid cooperative snapshot")
		}
		if state.Players[0].Credits != 6000000 || state.Players[1].Credits != 6000000 || state.Players[2].Credits != 9000000 {
			t.Fatal("difficulty changed allied economy")
		}
	}
	if s.missions[mission.ID].Players[0].Name != "First" {
		t.Fatal("lobby mutated installed mission content")
	}
}
func TestCoopCanReplaceSecondHumanWithOrdinaryAI(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID] = m
	s.missions[mission.ID] = mission
	a := profile(t, h, "Solo co-op")
	created := request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{"ally_ai": "normal", "difficulty": "hard"}, 201)
	var l Lobby
	json.Unmarshal(created["lobby"], &l)
	engine, err := s.scenarioEngine(&l, m, 7)
	if err != nil {
		t.Fatal(err)
	}
	state := engine.StateCopy()
	if state.Players[1].Controller != "ai" || state.Players[1].AI != "normal" || state.Players[1].Credits != 6000000 {
		t.Fatal("AI ally received enemy difficulty bonuses")
	}
	if s.missions[mission.ID].Players[1].Controller != "human" {
		t.Fatal("AI choice persisted into installed mission")
	}
}
