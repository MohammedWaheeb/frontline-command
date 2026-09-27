//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

func tutorialTemplate() content.Mission {
	def := content.Mission{ID: "faction-training", Version: "1", Title: "Faction training fixture", MapID: testMap().ID, Faction: "US", Mode: "tutorial", DefaultBases: true,
		Players:    []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Trainee", Team: 1, Credits: 6000000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Opposition", Team: 2, Credits: 6000000, Controller: "script"}},
		Objectives: []content.MissionObjective{{ID: "complete", Condition: content.MissionCondition{Kind: "timer", Tick: 900}}},
	}
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		def.TutorialVariants = append(def.TutorialVariants, content.TutorialVariant{Faction: faction, Briefing: faction + " training briefing", Initial: []content.MissionSpawn{{Tag: "lesson-squad", Owner: 1, Type: faction + ".rifle", Position: content.Point{X: 18000, Y: 8000}, Count: 1}}, Objectives: def.Objectives})
	}
	return def
}

func TestTutorialFactionSelectionSaveReplay(t *testing.T) {
	for _, faction := range []string{"", "US", "IR", "SY", "SA"} {
		t.Run("faction-"+faction, func(t *testing.T) {
			def := tutorialTemplate()
			input, _ := json.Marshal(CreateConfig{Mission: &def, TutorialFaction: faction, Map: testMap(), Seed: 99, SkipCountdown: true})
			s, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = s.Create(input); err != nil {
				t.Fatal(err)
			}
			want := faction
			if want == "" {
				want = "US"
			}
			state := s.engine.StateCopy()
			if state.Players[0].Faction != want || state.Players[1].Faction != "IR" || state.Mission.Definition.Faction != want || len(state.Mission.Definition.TutorialVariants) != 0 {
				t.Fatal("selected tutorial changed opponents or did not store its effective definition")
			}
			found := false
			for _, entity := range state.Entities {
				if entity.Tag == "lesson-squad" {
					found = entity.Type == want+".rifle"
				}
			}
			if !found {
				t.Fatal("selected faction initial force absent")
			}
			if _, err = s.Step(200); err != nil {
				t.Fatal(err)
			}
			data, err := s.engine.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := sim.Restore(s.catalog, data)
			if err != nil {
				t.Fatal(err)
			}
			if restored.Hash() != s.engine.Hash() {
				t.Fatal("tutorial save changed selected definition")
			}
			replay, err := s.ExportReplay()
			if err != nil {
				t.Fatal(err)
			}
			player, _ := NewSession()
			if _, err = player.LoadReplay(replay); err != nil {
				t.Fatal(err)
			}
			if _, err = player.SeekReplay(s.engine.Tick()); err != nil {
				t.Fatal(err)
			}
			if player.engine.Hash() != s.engine.Hash() {
				t.Fatal("selected-faction replay diverged")
			}
		})
	}
}

func TestTutorialFactionVariantValidation(t *testing.T) {
	for name, change := range map[string]func(*content.Mission){
		"missing-faction":   func(d *content.Mission) { d.TutorialVariants = d.TutorialVariants[:3] },
		"duplicate-faction": func(d *content.Mission) { d.TutorialVariants[1].Faction = "US" },
		"enemy-assets":      func(d *content.Mission) { d.TutorialVariants[0].Initial[0].Owner = 2 },
		"wrong-roster":      func(d *content.Mission) { d.TutorialVariants[0].Initial[0].Type = "IR.rifle" },
		"campaign":          func(d *content.Mission) { d.Mode = "campaign" },
		"bad-objective":     func(d *content.Mission) { d.TutorialVariants[0].Objectives = nil },
	} {
		t.Run(name, func(t *testing.T) {
			def := tutorialTemplate()
			change(&def)
			if err := def.Validate(content.MustBase(), testMap()); err == nil {
				t.Fatal("invalid faction template accepted")
			}
		})
	}
	s := newSession(t)
	before := s.engine.Hash()
	def := tutorialTemplate()
	input, _ := json.Marshal(CreateConfig{Mission: &def, TutorialFaction: "missing", Map: testMap(), Seed: 99})
	if _, err := s.Create(input); code(err) != "invalid_config" || s.engine.Hash() != before {
		t.Fatal("invalid faction replaced active session")
	}
}
