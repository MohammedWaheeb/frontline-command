package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

func reliabilityAuthoredMission(t *testing.T, id string) *Engine {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", id+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var header struct {
		MapID string `json:"map_id"`
	}
	if err = json.Unmarshal(data, &header); err != nil {
		t.Fatal(err)
	}
	mapData, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", header.MapID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	gameMap, err := content.DecodeMap(mapData)
	if err != nil {
		t.Fatal(err)
	}
	catalog := content.MustBase()
	definition, err := content.DecodeMission(data, catalog, gameMap)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := NewMission(catalog, gameMap, definition, "normal", 19027)
	if err != nil {
		t.Fatal(err)
	}
	engine.state.Countdown = 0
	return engine
}

func reliabilityObjective(t *testing.T, e *Engine, id string) *ObjectiveState {
	t.Helper()
	for i := range e.state.Mission.Objectives {
		if e.state.Mission.Objectives[i].ID == id {
			return &e.state.Mission.Objectives[i]
		}
	}
	t.Fatalf("missing objective %s", id)
	return nil
}

func reliabilityRestore(t *testing.T, e *Engine) *Engine {
	t.Helper()
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("mission restore changed state")
	}
	return restored
}

// These boundary regressions deliberately isolate objective state, damage and
// capture. Successful ordinary-order mission routes remain separately tested.
func TestMissionReliabilityTutorialCoverLossGate(t *testing.T) {
	for _, test := range []struct {
		name          string
		lost          int
		completeCover bool
		wantFailed    bool
	}{
		{"two-originals-remain", 2, false, false},
		{"one-original-remains-before-cover", 3, false, true},
		{"one-original-remains-after-cover", 3, true, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			e := reliabilityAuthoredMission(t, "tutorial-3-read-the-counter")
			originals := []*Entity{}
			for _, actor := range e.state.Entities {
				if actor.Tag == "starting-rifles" {
					originals = append(originals, actor)
				}
			}
			if len(originals) != 4 {
				t.Fatal("authored starting rifle group changed")
			}
			if test.completeCover {
				region := e.missionRegion("training-cover")
				for i, actor := range originals[:2] {
					actor.Position = Vec{X: (region.Min.X+region.Max.X)/2 + int32(i)*1500, Y: (region.Min.Y + region.Max.Y) / 2}
					actor.LastPosition = actor.Position
				}
				e.updateFog()
				e.updateMission()
				if !reliabilityObjective(t, e, "cover").Complete {
					t.Fatal("original squads did not complete their cover lesson")
				}
			}
			restored := reliabilityRestore(t, e)
			for _, engine := range []*Engine{e, restored} {
				for _, actor := range originals[:test.lost] {
					engine.entity(actor.ID).HP = 0
				}
				engine.Advance() // Normal cleanup records each actual destroyed tag.
			}
			failed := e.Outcome().Finished && e.Outcome().Reason == "mission_failed"
			if failed != test.wantFailed {
				t.Fatalf("cover liveness: lost=%d completed=%v outcome=%+v", test.lost, test.completeCover, e.Outcome())
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("cover loss gate diverged after opening restore")
			}
			if test.wantFailed && !reliabilityObjective(t, e, "cover-team-lost").Complete {
				t.Fatal("unwinnable cover lesson did not explain the failure")
			}
			restored = reliabilityRestore(t, e)
			ticks(e, 2)
			ticks(restored, 2)
			if e.Hash() != restored.Hash() {
				t.Fatal("cover loss result did not persist")
			}
		})
	}
}

func TestMissionReliabilityDefenseOperationalOwnership(t *testing.T) {
	for _, id := range []string{"us-04-broken-umbrella", "ir-04-hold-the-network", "sy-04-open-doors", "sa-04-intercept-window"} {
		base := reliabilityAuthoredMission(t, id)
		conditions := []content.MissionCondition{}
		walkMissionConditions(base.state.Mission.Definition, func(q content.MissionCondition) {
			if q.Kind == "tag_operational" {
				conditions = append(conditions, q)
			}
		})
		if len(conditions) == 0 {
			t.Fatalf("mission %s has no preservation conditions", id)
		}
		for _, q := range conditions {
			t.Run(id+"/"+q.Tag, func(t *testing.T) {
				e := reliabilityAuthoredMission(t, id)
				progress := newConditionProgress(q)
				if done, _ := e.missionCondition(q, &progress); !done {
					t.Fatal("owned original asset did not qualify initially")
				}
				actor := tagged(e, q.Tag)
				if actor == nil || !e.captureBuilding(2, actor) {
					t.Fatal("ordinary capture rule did not transfer preservation asset")
				}
				restored := reliabilityRestore(t, e)
				ticks(e, 201) // Conversion must finish before checking ownership.
				ticks(restored, 201)
				if e.Hash() != restored.Hash() {
					t.Fatal("captured preservation asset diverged on restore")
				}
				actor = tagged(e, q.Tag)
				if actor == nil || actor.Owner != 2 || !actor.Active(e.Tick()) {
					t.Fatal("test did not reach an active enemy-owned original asset")
				}
				progress = newConditionProgress(q)
				if done, _ := e.missionCondition(q, &progress); done {
					t.Fatal("enemy-owned original asset still fulfills player preservation")
				}
				wildcard := q
				wildcard.Owner = 0
				progress = newConditionProgress(wildcard)
				if done, _ := e.missionCondition(wildcard, &progress); !done {
					t.Fatal("explicit wildcard condition changed semantics")
				}
			})
		}
	}
}

func TestMissionReliabilityObjectiveIncompleteValidation(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*content.Mission)
		valid  bool
	}{
		{"valid-prerequisite", func(d *content.Mission) {}, true},
		{"missing-reference", func(d *content.Mission) { d.Objectives[1].Condition.Objective = "absent" }, false},
		{"self-cycle", func(d *content.Mission) { d.Objectives[1].Condition.Objective = "loss" }, false},
		{"mixed-cycle", func(d *content.Mission) {
			d.Objectives[0].Condition = content.MissionCondition{Kind: "objective_complete", Objective: "loss"}
		}, false},
		{"end-only-reference", func(d *content.Mission) {
			d.Objectives[0].Optional = true
			d.Objectives[0].AtEnd = true
			d.Objectives = append(d.Objectives, content.MissionObjective{ID: "required", Condition: content.MissionCondition{Kind: "timer", Tick: 9000}})
		}, false},
		{"trigger-reference", func(d *content.Mission) {
			d.Triggers = []content.MissionTrigger{{ID: "warning", Condition: content.MissionCondition{Kind: "objective_incomplete", Objective: "end"}, Actions: []content.MissionAction{{Kind: "warning", Text: "Lesson remains available"}}}}
		}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			d := longMission()
			d.Objectives = append(d.Objectives, content.MissionObjective{ID: "loss", Failure: true, Condition: content.MissionCondition{Kind: "objective_incomplete", Objective: "end"}})
			test.change(&d)
			err := d.Validate(content.MustBase(), fixtureMap())
			if (err == nil) != test.valid {
				t.Fatalf("objective_incomplete validation valid=%v error=%v", test.valid, err)
			}
		})
	}
}

func TestMissionReliabilityObjectiveIncompleteReadOnly(t *testing.T) {
	e := extendedMission(t, longMission(), fixtureMap())
	q := content.MissionCondition{Kind: "objective_incomplete", Objective: "end"}
	progress := newConditionProgress(q)
	hash := e.Hash()
	if done, _ := e.missionCondition(q, &progress); !done || e.Hash() != hash {
		t.Fatal("incomplete query mutated objective or returned false")
	}
	reliabilityObjective(t, e, "end").Complete = true
	hash = e.Hash()
	if done, _ := e.missionCondition(q, &progress); done || e.Hash() != hash {
		t.Fatal("completed objective remained incomplete or query mutated state")
	}
}
