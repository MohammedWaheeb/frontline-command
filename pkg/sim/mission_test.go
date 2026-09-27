package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func missionFixture() content.Mission {
	return content.Mission{ID: "backend-script-test", Version: "1", Title: "Backend mission fixture", MapID: "backend-fixture", Faction: "US", Mode: "tutorial", DefaultBases: true, Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 6000000}, {ID: 2, Faction: "IR", Name: "Opponent", Team: 2, Credits: 6000000}}, Initial: []content.MissionSpawn{{Tag: "escort", Type: "US.rifle", Owner: 1, Position: Vec{X: 18000, Y: 8000}, Count: 1}}, Objectives: []content.MissionObjective{{ID: "survive", Text: "Test timer", Condition: content.MissionCondition{Kind: "timer", Tick: 250}}, {ID: "escort_lost", Text: "Test failure", Failure: true, Condition: content.MissionCondition{Kind: "tag_destroyed", Tag: "escort"}}}, Triggers: []content.MissionTrigger{{ID: "grant", Condition: content.MissionCondition{Kind: "timer", Tick: 120}, Actions: []content.MissionAction{{Kind: "credits", Owner: 1, Amount: 100000}, {Kind: "checkpoint", Text: "midpoint"}}}, {ID: "wave", Condition: content.MissionCondition{Kind: "timer", Tick: 140}, Actions: []content.MissionAction{{Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "wave", Type: "IR.rifle", Owner: 2, Position: Vec{X: 43000, Y: 45000}, Count: 2}}}, Repeat: 2, Interval: 40}}}
}
func TestMissionCheckpointNoDuplicateRewards(t *testing.T) {
	e, err := NewMission(content.MustBase(), fixtureMap(), missionFixture(), "normal", 42)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 160)
	if e.state.Mission.Checkpoint != "midpoint" || e.player(1).Credits != 6100000 {
		t.Fatal("checkpoint/grant missing")
	}
	data, _ := e.Save()
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 100)
	ticks(restored, 100)
	if e.Hash() != restored.Hash() {
		t.Fatal("mission restore diverged")
	}
	if e.Outcome().Reason != "mission_complete" || e.Tick() != 250 {
		t.Fatalf("objective did not finish: %+v", e.Outcome())
	}
	if e.player(1).Credits != 6100000 {
		t.Fatal("grant duplicated")
	}
	count := 0
	for _, v := range e.state.Entities {
		if v.Tag == "wave" {
			count++
		}
	}
	if count != 4 {
		t.Fatalf("wave count %d", count)
	}
}
func TestMissionFailureAndScriptValidation(t *testing.T) {
	definition := missionFixture()
	e, err := NewMission(content.MustBase(), fixtureMap(), definition, "normal", 1)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 101)
	for _, v := range e.state.Entities {
		if v.Tag == "escort" {
			v.HP = 0
		}
	}
	e.Advance()
	if e.Outcome().Reason != "mission_failed" {
		t.Fatal("missing failure outcome")
	}
	definition.Triggers[0].Actions[0].Kind = "eval_javascript"
	if err = definition.Validate(content.MustBase(), fixtureMap()); err == nil {
		t.Fatal("executable/unknown trigger accepted")
	}
}
