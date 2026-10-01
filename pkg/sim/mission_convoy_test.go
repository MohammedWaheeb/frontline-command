package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func convoyFixture(t *testing.T) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	m.Regions = []content.Region{{ID: "near", Min: Vec{X: 27000, Y: 12000}, Max: Vec{X: 32000, Y: 17000}}, {ID: "branch", Min: Vec{X: 27000, Y: 19000}, Max: Vec{X: 32000, Y: 24000}}}
	def := longMission()
	def.Mode = "coop"
	def.Players = []content.MissionPlayer{{ID: 1, Controller: "human", Faction: "US", Team: 1, Credits: 6000000}, {ID: 2, Controller: "human", Faction: "SA", Team: 1, Credits: 6000000}, {ID: 3, Controller: "script", Faction: "US", Team: 1}}
	def.Initial = []content.MissionSpawn{{Tag: "convoy-a", Type: "US.hauler", Owner: 3, Position: Vec{X: 23000, Y: 14000}, Count: 1}, {Tag: "convoy-b", Type: "US.hauler", Owner: 3, Position: Vec{X: 23000, Y: 21000}, Count: 1}, {Tag: "convoy-c", Type: "US.hauler", Owner: 3, Position: Vec{X: 23000, Y: 28000}, Count: 1}}
	def.Convoys = []content.MissionConvoy{{ID: "a", Tag: "convoy-a", Routes: [][]string{{"near"}, {"branch"}}, CountdownTicks: 60}, {ID: "b", Tag: "convoy-b", Routes: [][]string{{"near"}}, CountdownTicks: 60}, {ID: "c", Tag: "convoy-c", Routes: [][]string{{"near"}}, CountdownTicks: 60}}
	def.Triggers = []content.MissionTrigger{{ID: "start-a", Condition: content.MissionCondition{Kind: "timer", Tick: 1}, Actions: []content.MissionAction{{Kind: "start_convoy", Convoy: "a"}}}, {ID: "start-b", Condition: content.MissionCondition{Kind: "convoy_completed", Convoy: "a"}, Actions: []content.MissionAction{{Kind: "checkpoint", Text: "backend-convoy-a"}, {Kind: "start_convoy", Convoy: "b"}}}, {ID: "start-c", Condition: content.MissionCondition{Kind: "convoy_completed", Convoy: "b"}, Actions: []content.MissionAction{{Kind: "checkpoint", Text: "backend-convoy-b"}, {Kind: "start_convoy", Convoy: "c"}}}}
	def.Objectives[0].Condition = content.MissionCondition{Kind: "convoy_completed", Convoy: "c"}
	return extendedMission(t, def, m)
}
func TestMissionConvoyHoldUnanimityCountdownAndResume(t *testing.T) {
	e := convoyFixture(t)
	e.Advance()
	if !e.state.Mission.Convoys[0].Active || e.state.Mission.Convoys[1].Active {
		t.Fatal("convoys did not start sequentially")
	}
	original := tagged(e, "convoy-a").Position
	issue(t, e, 1, Order{Kind: "convoy_hold", Type: "a"})
	issue(t, e, 1, Order{Kind: "convoy_advance", Type: "a", Index: 1})
	state, _ := e.convoy("a")
	if !state.Held || len(state.Approved) != 1 {
		t.Fatal("single human bypassed hold")
	}
	issue(t, e, 2, Order{Kind: "convoy_advance", Type: "a", Index: 0})
	state, _ = e.convoy("a")
	if !state.Held || len(state.Approved) != 1 || state.Approved[0] != 2 {
		t.Fatal("conflicting route approvals were combined")
	}
	issue(t, e, 1, Order{Kind: "convoy_advance", Type: "a", Index: 0})
	state, _ = e.convoy("a")
	if state.Held || state.CountdownUntil != e.Tick()+60 || len(state.Approved) != 0 {
		t.Fatal("unanimity did not start countdown")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 59)
	ticks(restored, 59)
	if tagged(e, "convoy-a").Position != original || e.Hash() != restored.Hash() {
		t.Fatal("convoy moved before announced countdown")
	}
	ticks(e, 15)
	ticks(restored, 15)
	if tagged(e, "convoy-a").Position == original || e.Hash() != restored.Hash() {
		t.Fatal("convoy did not resume deterministically after turn")
	}
	issue(t, e, 2, Order{Kind: "convoy_hold", Type: "a"})
	stopped := tagged(e, "convoy-a").Position
	ticks(e, 10)
	if tagged(e, "convoy-a").Position != stopped {
		t.Fatal("moving convoy ignored hold")
	}
	if code := e.convoyControl(e.player(3), Order{Kind: "convoy_advance", Type: "a"}); code != "convoy_commander_required" {
		t.Fatal("script controller cast human approval")
	}
}
func TestMissionConvoysCompleteSequentiallyWithoutFreeReinforcements(t *testing.T) {
	e := convoyFixture(t)
	count := len(e.state.Entities)
	ticks(e, 110)
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 800)
	ticks(restored, 800)
	if e.Hash() != restored.Hash() || e.Outcome().Reason != "mission_complete" {
		t.Fatalf("convoys did not finish deterministic route: %+v", e.state.Mission.Convoys)
	}
	if len(e.state.Entities) != count || e.state.Mission.Checkpoint != "backend-convoy-b" {
		t.Fatal("convoy checkpoint duplicated actors or was not saved")
	}
	for _, c := range e.state.Mission.Convoys {
		if !c.Completed || c.Active {
			t.Fatal("convoy finish state wrong")
		}
	}
}
func TestMissionConvoyStateCannotSkipSequenceOrForgeVotes(t *testing.T) {
	e := convoyFixture(t)
	if e.startConvoy("b") {
		t.Fatal("second convoy skipped first")
	}
	e.Advance()
	state, _ := e.convoy("a")
	state.Held = true
	state.CountdownUntil = 0
	state.Approved = []PlayerID{3}
	if err := e.validateMissionProgress(); err == nil {
		t.Fatal("script approval accepted")
	}
	state.Approved = nil
	e.state.Mission.Convoys[1].Active = true
	if err := e.validateMissionProgress(); err == nil {
		t.Fatal("two active convoys accepted")
	}
}
func TestMissionRecoverAlliedTagPreservesDamageAndCaps(t *testing.T) {
	e := convoyFixture(t)
	actor := tagged(e, "convoy-a")
	actor.HP -= 10000
	beforeHP, beforePaid := actor.HP, actor.Paid
	if !e.recoverScenarioTag("convoy-a", 1) || actor.Owner != 1 || actor.HP != beforeHP || actor.Paid != beforePaid {
		t.Fatal("allied recovery changed identity/value/health")
	}
	if e.recoverScenarioTag("convoy-b", 2) {
		t.Fatal("recovery crossed faction equipment contract")
	}
	for i := 0; i < 7; i++ {
		e.spawn("US.hauler", 1, Vec{X: int32(2000 + i*2000), Y: 30000}, true, 0)
	}
	if e.recoverScenarioTag("convoy-b", 1) {
		t.Fatal("recovery bypassed eight-hauler cap")
	}
}
