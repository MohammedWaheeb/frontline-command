//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"strings"
	"testing"
)

func TestEditorValidationAndPreviewDoNotReplaceMatch(t *testing.T) {
	s := newSession(t)
	before, _ := s.Hash()
	advice, err := s.Affordances(1, []sim.ID{2})
	if err != nil || len(advice.Entities) != 1 || len(advice.Entities[0].Builds) == 0 {
		t.Fatal("builder advice missing", advice, err)
	}
	if _, err = s.Affordances(2, []sim.ID{4}); code(err) != "unauthorized_player" {
		t.Fatal("AI private advice exposed", err)
	}
	data, _ := json.Marshal(testMap())
	m, err := s.ValidateMap(data)
	if err != nil || m.ID != testMap().ID {
		t.Fatal("valid map rejected", err)
	}
	m.Tiles[0].Terrain = "not-a-terrain"
	data, _ = json.Marshal(m)
	if _, err := s.ValidateMap(data); code(err) != "map_invalid" {
		t.Fatal("invalid map accepted", err)
	}
	if _, err := s.ValidateMap([]byte(`{"script":"arbitrary"}`)); code(err) != "map_invalid" {
		t.Fatal(err)
	}
	preview, err := s.PreviewOrders(1, batch(t, 1, &pb.Order{Kind: "build", Entities: []uint32{2}, Type: "power", Position: &pb.Vec{X: 13000, Y: 13000}}))
	if err != nil || len(preview.Results) != 1 || !preview.Results[0].Accepted {
		t.Fatal("preview failed", preview, err)
	}
	if after, _ := s.Hash(); after != before {
		t.Fatal("editor utilities mutated live game")
	}
	saved, _ := s.Save()
	var env saveEnvelope
	json.Unmarshal(saved.Data, &env)
	invalid := resum(t, strings.Replace(string(env.State), `"US.rig"`, `"US.invalid"`, 1))
	if _, _, err := s.Inspect(invalid); code(err) != "save_invalid" {
		t.Fatal("inspection did not validate engine state", err)
	}
	if after, _ := s.Hash(); after != before {
		t.Fatal("inspection mutated live game")
	}
}

func TestEditorMissionTestKeepsPracticeVersionThroughSave(t *testing.T) {
	s, _ := NewSession()
	mission := content.Mission{ID: "editor-fixture", Version: "1", MapID: testMap().ID, Title: "Editor test", Faction: "US", Mode: "tutorial", DefaultBases: true, Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 6000000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Script", Team: 2, Credits: 6000000, Controller: "script"}}, Objectives: []content.MissionObjective{{ID: "timer", Text: "Fixture", Condition: content.MissionCondition{Kind: "timer", Tick: 300}}}}
	mapData, _ := json.Marshal(testMap())
	missionData, _ := json.Marshal(mission)
	if _, err := s.ValidateMission(mapData, missionData); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(CreateConfig{Map: testMap(), Mission: &mission, Seed: 42, Difficulty: "normal", Ruleset: "practice-v1"})
	info, err := s.Create(data)
	if err != nil || info.Metadata.Ruleset != "practice-v1" {
		t.Fatal("editor mission lost practice mark", info, err)
	}
	saved, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	if loaded, err := s.Load(saved.Data, saved.Local); err != nil || loaded.Metadata.Ruleset != "practice-v1" {
		t.Fatal("loaded editor mission lost practice mark", err)
	}
	replay, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	inspection, err := s.InspectReplay(replay)
	if err != nil || inspection.Metadata.Ruleset != "practice-v1" || s.Info().Replay {
		t.Fatal("replay inspection replaced live state", err)
	}
}

func TestTacticalSkybreakerSessionPreview(t *testing.T) {
	s := newSession(t)
	before, _ := s.Hash()
	point := &pb.Vec{X: 8000, Y: 8000}
	data := batch(t, 1, &pb.Order{Kind: "ability", Type: "strategic", Entities: []uint32{2}, Index: 2, Points: []*pb.Vec{point, point, point}})
	result, err := s.PreviewOrders(1, data)
	if err != nil || len(result.Plans) != 1 || result.Plans[0].Edge != 2 || len(result.Plans[0].Routes) != 3 {
		t.Fatal(result, err)
	}
	if _, err := s.PreviewOrders(2, data); code(err) != "unauthorized_player" {
		t.Fatal("nonlocal plan was accepted", err)
	}
	if _, err := s.PreviewCandidates(1, data); err == nil {
		t.Fatal("strategic alternative accepted")
	}
	if after, _ := s.Hash(); before != after {
		t.Fatal("route preview mutated live session")
	}
	replay, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.LoadReplay(replay); err != nil {
		t.Fatal(err)
	}
	if _, err = s.PreviewOrders(1, data); code(err) != "replay_read_only" {
		t.Fatal("replay preview accepted", err)
	}
}

func TestEditorGeometryPreviewIsIndependentOfActiveSession(t *testing.T) {
	s := newSession(t)
	before, _ := s.Hash()
	data, _ := json.Marshal(testMap())
	request := []byte(`{"kind":"path","unit_type":"US.tank","from":{"x":15500,"y":20500},"to":{"x":26500,"y":20500}}`)
	preview, err := s.PreviewEditor(data, request)
	if err != nil || preview.Reachable == nil || !*preview.Reachable || len(preview.Path) < 2 {
		t.Fatal(preview, err)
	}
	if after, _ := s.Hash(); after != before {
		t.Fatal("editor preview changed active match")
	}
	empty, _ := NewSession()
	preview, err = empty.PreviewEditor(data, request)
	if err != nil || preview.Reachable == nil || !*preview.Reachable {
		t.Fatal("editor preview requires active game", err)
	}
	for _, invalid := range [][]byte{[]byte(`{"kind":"sight","unit_type":"US.rifle","from":{"x":0,"y":0},"live_player":1}`), append(request, []byte(`{}`)...), []byte(`{"kind":"path"}`)} {
		if _, err := s.PreviewEditor(data, invalid); code(err) != "invalid_preview" {
			t.Fatal("invalid request accepted", err)
		}
	}
}
