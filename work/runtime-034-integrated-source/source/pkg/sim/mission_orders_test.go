package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

func taggedAttackMission() content.Mission {
	def := longMission()
	def.DefaultBases = false
	def.Initial = []content.MissionSpawn{
		{Tag: "hq", Type: "hq", Owner: 1, Position: Vec{X: 18000, Y: 18000}, Count: 1},
		{Tag: "escape-rig", Type: "US.rig", Owner: 1, Position: Vec{X: 8000, Y: 8000}, Count: 1},
		{Tag: "attackers", Type: "IR.tank", Owner: 2, Position: Vec{X: 24500, Y: 19500}, Count: 1},
	}
	def.Triggers = []content.MissionTrigger{{ID: "target-hq", Condition: content.MissionCondition{Kind: "timer", Tick: 2}, Actions: []content.MissionAction{{Kind: "credits", Owner: 1, Amount: 1234}, {Kind: "attack_tag", Owner: 2, Tag: "attackers", TargetTag: "hq"}}}}
	return def
}

func TestMissionTaggedAttackOrdinaryCombatAndRestore(t *testing.T) {
	e := extendedMission(t, taggedAttackMission(), fixtureMap())
	ticks(e, 2)
	if e.state.Mission.Triggers[0].Fired != 1 {
		t.Fatal("visible enemy target did not receive scenario order")
	}
	attacker := tagged(e, "attackers")
	if len(attacker.Orders) != 1 || attacker.Orders[0].Kind != "attack" || attacker.Orders[0].Target != tagged(e, "hq").ID {
		t.Fatal("scenario did not issue a real attack order")
	}
	before := tagged(e, "hq").HP
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 120)
	ticks(restored, 120)
	if e.Hash() != restored.Hash() || tagged(e, "hq").HP >= before || e.player(1).Credits != 6001234 {
		t.Fatal("real weapon damage or deterministic one-time grant failed")
	}
}

func TestMissionTaggedAttackWaitsWithoutVisibilityOrLegalSource(t *testing.T) {
	for _, cause := range []string{"unseen", "disabled", "captured-target", "captured-source"} {
		t.Run(cause, func(t *testing.T) {
			e := extendedMission(t, taggedAttackMission(), fixtureMap())
			attacker, target := tagged(e, "attackers"), tagged(e, "hq")
			switch cause {
			case "unseen":
				attacker.Position = Vec{X: 47000, Y: 47000}
			case "disabled":
				attacker.DisabledUntil = 100
			case "captured-target":
				target.Owner = 2
			case "captured-source":
				attacker.Owner = 1
			}
			e.recalculate()
			ticks(e, 4)
			if e.state.Mission.Triggers[0].Fired != 0 || e.player(1).Credits != 6000000 {
				t.Fatal("illegal target bypassed ordinary legality or retained partial grant")
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			for _, engine := range []*Engine{e, restored} {
				actor := tagged(engine, "attackers")
				actor.Position = Vec{X: 24500, Y: 19500}
				actor.Owner = 2
				actor.DisabledUntil = 0
				tagged(engine, "hq").Owner = 1
				engine.recalculate()
				ticks(engine, 4)
			}
			if e.Hash() != restored.Hash() || e.state.Mission.Triggers[0].Fired != 1 || e.player(1).Credits != 6001234 {
				t.Fatal("blocked tagged attack did not resume once legality returned")
			}
		})
	}
}

func TestMissionTaggedAttackValidation(t *testing.T) {
	for _, change := range []func(*content.Mission){
		func(d *content.Mission) { d.Triggers[0].Actions[1].TargetTag = "absent" },
		func(d *content.Mission) { d.Triggers[0].Actions[1].TargetTag = "attackers" },
		func(d *content.Mission) { d.Triggers[0].Actions[1].Tag = "absent" },
		func(d *content.Mission) { d.Triggers[0].Actions[1].Owner = 1 },
		func(d *content.Mission) { d.Initial[2].Type = "hq" },
		func(d *content.Mission) { d.Triggers[0].Actions[0].TargetTag = "hq" },
	} {
		def := taggedAttackMission()
		change(&def)
		if err := def.Validate(content.MustBase(), fixtureMap()); err == nil {
			t.Fatal("invalid tagged attack accepted")
		}
	}
}

func TestMissionEmergencyRigMetricRequiresPaidEmergencyCompletion(t *testing.T) {
	for _, emergency := range []bool{false, true} {
		t.Run(fmt.Sprint(emergency), func(t *testing.T) {
			def := longMission()
			def.Objectives = append(def.Objectives, content.MissionObjective{ID: "emergency", Optional: true, Condition: content.MissionCondition{Kind: "event_count", Event: "emergency_rig_ready", Owner: 1, Count: 1}})
			e := extendedMission(t, def, fixtureMap())
			baseInfrastructure(e, 1)
			var hq, factory *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && v.Type == "hq" {
					hq = v
				}
				if v.Owner == 1 && v.Type == "factory" {
					factory = v
				}
			}
			producer := hq
			if emergency {
				hq.HP = 0
				e.Advance()
				producer = factory
			}
			issue(t, e, 1, Order{Kind: "train", Type: "US.rig", Entities: []ID{producer.ID}})
			ticks(e, 100)
			if e.state.Mission.Objectives[1].Complete {
				t.Fatal("emergency lesson completed before production")
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			ticks(e, 1600)
			ticks(restored, 1600)
			if e.Hash() != restored.Hash() || e.state.Mission.Objectives[1].Complete != emergency {
				t.Fatal("emergency metric did not distinguish normal production or survive restore")
			}
			if emergency && e.player(1).Spent != 1200000 {
				t.Fatal("emergency rig did not pay its real cost", e.player(1).Spent)
			}
		})
	}
}

func TestMissionRelocatedBuildingsPreserveResourceAccess(t *testing.T) {
	e := extendedMission(t, longMission(), fixtureMap())
	for _, point := range []Vec{e.state.Fields[0].Position, e.state.Stations[0].Position, e.state.Map.Shipment} {
		if e.scenarioFootprint(point, 4, 3) {
			t.Fatal("scenario allowed resource/objective overlap")
		}
		positions, ok := e.scenarioPositions(content.MissionSpawn{Tag: "test-placement", Type: "supply", Owner: 1, Position: point, Count: 1})
		if ok {
			for _, pos := range positions {
				if code := e.resourceFootprint(pos, 4, 3); code != "ok" {
					t.Fatalf("relocation covered protected access: %s", code)
				}
			}
		}
	}
	// Equality at the outer margin remains legal, preserving ordinary placement.
	field := e.state.Fields[0].Position
	if code := e.resourceFootprint(Vec{X: field.X - 3000, Y: field.Y}, 4, 3); code != "ok" {
		t.Fatal("overextended resource exclusion", code)
	}
}
