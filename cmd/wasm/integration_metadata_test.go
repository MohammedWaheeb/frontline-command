//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"testing"
)

func TestIntegrationMissionDifficultyAndSaveMapMetadata(t *testing.T) {
	s := newSession(t)
	defer s.Dispose()
	if _, err := s.Create(config(t, "")); err != nil {
		t.Fatal(err)
	}
	if s.Info().Difficulty != "" {
		t.Fatal("skirmish invented mission difficulty")
	}
	def := tutorialTemplate()
	input, _ := json.Marshal(CreateConfig{Map: testMap(), Mission: &def, Difficulty: "hard", Seed: 42})
	if _, err := s.Create(input); err != nil {
		t.Fatal(err)
	}
	if s.Info().Difficulty != "hard" {
		t.Fatal("mission difficulty missing", s.Info())
	}
	saved, err := s.Save()
	if err != nil || saved.MapID != testMap().ID {
		t.Fatal("save map id", saved.MapID, err)
	}
	blob, _ := json.Marshal(saved)
	var fields map[string]any
	if err = json.Unmarshal(blob, &fields); err != nil || fields["map_id"] != testMap().ID {
		t.Fatal(string(blob), err)
	}
	if _, err = s.Load(saved.Data, saved.Local); err != nil || s.Info().Difficulty != "hard" {
		t.Fatal("load difficulty", s.Info(), err)
	}
	if _, err = s.Restart(); err != nil || s.Info().Difficulty != "hard" {
		t.Fatal("restart difficulty", s.Info(), err)
	}
	replay, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.LoadReplay(replay); err != nil || s.Info().Difficulty != "hard" {
		t.Fatal("replay difficulty", s.Info(), err)
	}
	t.Log("hard difficulty preserved through create/load/restart/replay; map_id serialized")
}
