package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func extendedMission(t *testing.T, def content.Mission, m content.Map) *Engine {
	t.Helper()
	e, err := NewMission(content.MustBase(), m, def, "normal", 77)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}
func longMission() content.Mission {
	def := missionFixture()
	def.Triggers = nil
	def.Objectives = []content.MissionObjective{{ID: "end", Text: "Backend timer", Condition: content.MissionCondition{Kind: "timer", Tick: 10000}}}
	return def
}
func tagged(e *Engine, tag string) *Entity {
	for _, actor := range e.state.Entities {
		if actor.Tag == tag {
			return actor
		}
	}
	return nil
}
func TestMissionCompositeContinuousHoldRestore(t *testing.T) {
	def := longMission()
	def.Objectives[0].Condition = content.MissionCondition{Kind: "all", HoldTicks: 12, Children: []content.MissionCondition{{Kind: "tag_operational", Tag: "escort", Owner: 1}, {Kind: "resource_threshold", Owner: 1, Amount: 6000000}}}
	e := extendedMission(t, def, fixtureMap())
	ticks(e, 8)
	tagged(e, "escort").DisabledUntil = e.state.Tick + 2
	e.Advance()
	if e.state.Mission.Objectives[0].Condition.Holding {
		t.Fatal("interrupted condition did not reset continuous hold")
	}
	ticks(e, 5)
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 8)
	ticks(restored, 8)
	if e.Hash() != restored.Hash() || e.Outcome().Reason != "mission_complete" || e.Outcome().Tick != 22 {
		t.Fatalf("hold resume failed: %+v %+v", e.Outcome(), restored.Outcome())
	}
}
func TestMissionCompositeAtLeastAndIndependentChildTimers(t *testing.T) {
	e := extendedMission(t, longMission(), fixtureMap())
	q := content.MissionCondition{Kind: "at_least", Count: 2, Children: []content.MissionCondition{{Kind: "timer", Tick: 0, HoldTicks: 4}, {Kind: "timer", Tick: 2, HoldTicks: 4}, {Kind: "timer", Tick: 100}}}
	p := newConditionProgress(q)
	for tick := Tick(0); tick < 6; tick++ {
		e.state.Tick = tick
		if done, _ := e.missionCondition(q, &p); done {
			t.Fatal("composite completed early")
		}
	}
	e.state.Tick = 6
	if done, count := e.missionCondition(q, &p); !done || count != 2 {
		t.Fatal("per-child timer state not independent")
	}
}
func TestMissionNeutralObjectsDoNotContestRegions(t *testing.T) {
	m := fixtureMap()
	m.Regions = []content.Region{{ID: "site", Min: Vec{X: 17000, Y: 7000}, Max: Vec{X: 24000, Y: 14000}}}
	m.Objects = []content.MapObject{{ID: 8, Class: "light_prop", Position: Vec{X: 21500, Y: 11500}}}
	e := extendedMission(t, longMission(), m)
	q := content.MissionCondition{Kind: "region_held", Owner: 1, Region: "site"}
	p := newConditionProgress(q)
	if done, _ := e.missionCondition(q, &p); !done {
		t.Fatal("neutral prop contested region")
	}
	enemy := e.spawn("IR.rifle", 2, Vec{X: 20000, Y: 10000}, true, 0)
	if done, _ := e.missionCondition(q, &p); done {
		t.Fatal("enemy did not contest region")
	}
	enemy.Owner = 1
	if done, _ := e.missionCondition(q, &p); !done {
		t.Fatal("owned unit contested region")
	}
}
func TestMissionEndObjectivesDoNotLatchBeforeLossOrOverspend(t *testing.T) {
	def := longMission()
	def.Objectives[0].Condition.Tick = 20
	def.Objectives = append(def.Objectives, content.MissionObjective{ID: "preserve", Text: "Backend preservation", Optional: true, AtEnd: true, Condition: content.MissionCondition{Kind: "tag_alive", Tag: "escort"}}, content.MissionObjective{ID: "budget", Text: "Backend budget", Optional: true, AtEnd: true, Condition: content.MissionCondition{Kind: "event_value", Event: "repair_spent", Owner: 1, Amount: 100, Compare: "at_most"}})
	e := extendedMission(t, def, fixtureMap())
	e.recordMissionEvent("repair_spent", 1, tagged(e, "escort").ID, 90)
	ticks(e, 4)
	if e.state.Mission.Objectives[1].Complete || e.state.Mission.Objectives[2].Complete {
		t.Fatal("end objective completed before mission ended")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for _, engine := range []*Engine{e, restored} {
		engine.recordMissionEvent("repair_spent", 1, tagged(engine, "escort").ID, 20)
		tagged(engine, "escort").HP = 0
		ticks(engine, 20)
	}
	if e.Hash() != restored.Hash() || e.Outcome().Reason != "mission_complete" || e.state.Mission.Objectives[1].Complete || e.state.Mission.Objectives[2].Complete {
		t.Fatal("end preservation/budget restore mismatch")
	}
}
func TestMissionEventMetricsOnlyCountDeclaredOwnerTagAndType(t *testing.T) {
	def := longMission()
	def.Objectives = append(def.Objectives, content.MissionObjective{ID: "shots", Optional: true, Condition: content.MissionCondition{Kind: "event_count", Event: "weapon_fired", Owner: 1, Tag: "escort", Type: "US.rifle", Count: 2}})
	e := extendedMission(t, def, fixtureMap())
	actor := tagged(e, "escort")
	e.emit("weapon_fired", 1, actor.ID, actor.Position, "visible", 0)
	e.emit("weapon_fired", 2, actor.ID, actor.Position, "visible", 0)
	e.emit("weapon_fired", 1, 0, actor.Position, "visible", 0)
	e.emit("unit_ready", 1, actor.ID, actor.Position, "visible", 0)
	e.Advance()
	if e.state.Mission.Counters[0].Count != 1 || e.state.Mission.Objectives[1].Complete {
		t.Fatal("metric counted an unrelated event")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for _, engine := range []*Engine{e, restored} {
		engine.emit("weapon_fired", 1, actor.ID, actor.Position, "visible", 0)
		engine.Advance()
	}
	if e.Hash() != restored.Hash() || !e.state.Mission.Objectives[1].Complete {
		t.Fatal("event metric was lost or duplicated by restore")
	}
}
func TestMissionTagFieldAndStationConditions(t *testing.T) {
	m := fixtureMap()
	m.Regions = []content.Region{{ID: "site", Min: Vec{X: 17000, Y: 7000}, Max: Vec{X: 24000, Y: 14000}}}
	e := extendedMission(t, longMission(), m)
	actor := tagged(e, "escort")
	actor.Concealed = true
	e.state.Tick = 5
	e.state.Stations[0].Owner = 1
	cases := []content.MissionCondition{{Kind: "tag_owned", Owner: 1, Tag: "escort"}, {Kind: "tag_operational", Tag: "escort"}, {Kind: "tag_in_region", Tag: "escort", Region: "site"}, {Kind: "tag_stationary", Tag: "escort", Tick: 5}, {Kind: "tag_concealed", Tag: "escort"}, {Kind: "field_remaining", Field: 1, Amount: 36000000}, {Kind: "stations_owned", Owner: 1, Count: 1}, {Kind: "count_type", Owner: 1, Type: "US.tank", Compare: "at_most", Count: 0}}
	for _, q := range cases {
		p := newConditionProgress(q)
		if done, _ := e.missionCondition(q, &p); !done {
			t.Errorf("condition %s failed", q.Kind)
		}
	}
}
func TestMissionSpawnCapsAndAtomicRetry(t *testing.T) {
	def := longMission()
	def.Triggers = []content.MissionTrigger{{ID: "transaction", Condition: content.MissionCondition{Kind: "timer"}, Actions: []content.MissionAction{{Kind: "credits", Owner: 1, Amount: 1000}, {Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "rigs-a", Type: "US.rig", Owner: 1, Position: Vec{X: 30000, Y: 12000}, Count: 3}}, {Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "rigs-b", Type: "US.rig", Owner: 1, Position: Vec{X: 30000, Y: 25000}, Count: 1}}}}}
	e := extendedMission(t, def, fixtureMap())
	e.Advance()
	if e.countRole(1, "rig", true) != 1 || e.player(1).Credits != 6000000 || e.state.Mission.Triggers[0].Fired != 0 || tagged(e, "rigs-a") != nil {
		t.Fatal("blocked trigger retained partial grants/spawns")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for _, engine := range []*Engine{e, restored} {
		for _, actor := range engine.state.Entities {
			if actor.Owner == 1 && engine.role(actor) == "rig" {
				actor.HP = 0
			}
		}
		engine.Advance()
		engine.Advance()
	}
	if e.Hash() != restored.Hash() || e.countRole(1, "rig", true) != 4 || e.player(1).Credits != 6001000 || e.state.Mission.Triggers[0].Fired != 1 {
		t.Fatal("retry did not apply transaction exactly once")
	}
	for _, test := range []struct {
		name, typ string
		count     int
		want      string
	}{{"structure", "power", 59, "power"}, {"defense", "turret", 16, "turret"}, {"strategic", "strategic", 1, "strategic"}} {
		t.Run(test.name, func(t *testing.T) {
			engine := extendedMission(t, longMission(), fixtureMap())
			for i := 0; i < test.count; i++ {
				engine.spawn(test.typ, 1, Vec{X: int32(3000 + i%12*4500), Y: int32(20000 + i/12*5000)}, false, 0)
			}
			before := len(engine.state.Entities)
			if engine.spawnScenario(content.MissionSpawn{Tag: "cap", Type: test.want, Owner: 1, Position: Vec{X: 44000, Y: 46000}, Count: 1}) || len(engine.state.Entities) != before {
				t.Fatal("foundation did not reserve cap")
			}
		})
	}
}
func TestMissionSurrenderFailsBeforeScenarioGrant(t *testing.T) {
	def := longMission()
	def.Triggers = []content.MissionTrigger{{ID: "grant", Condition: content.MissionCondition{Kind: "timer", Tick: 1}, Actions: []content.MissionAction{{Kind: "credits", Owner: 1, Amount: 100000}}}}
	e := extendedMission(t, def, fixtureMap())
	issue(t, e, 1, Order{Kind: "surrender"})
	if e.Outcome().Reason != "mission_failed" || e.player(1).Credits != 6000000 || e.state.Mission.Triggers[0].Fired != 0 {
		t.Fatal("surrender allowed subsequent mission rewards")
	}
}
func TestMissionDifficultyCompositionAndEnemyTiming(t *testing.T) {
	def := longMission()
	def.Difficulty = []content.MissionDifficulty{{ID: "hard", EnemyCreditsMultiplier: 1500, WaveTimeMultiplier: 500}}
	def.Initial = append(def.Initial, content.MissionSpawn{Tag: "enemy-hard", Type: "IR.rifle", Owner: 2, Position: Vec{X: 44000, Y: 42000}, Count: 2, Difficulties: []string{"hard"}})
	def.Triggers = []content.MissionTrigger{{ID: "wave", Condition: content.MissionCondition{Kind: "timer", Tick: 20, Wave: true}, Actions: []content.MissionAction{{Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "wave", Type: "IR.rifle", Owner: 2, Position: Vec{X: 47000, Y: 35000}, Count: 1}}}}}
	e, err := NewMission(content.MustBase(), fixtureMap(), def, "hard", 1)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	ticks(e, 10)
	if e.player(1).Credits != 6000000 || e.player(2).Credits != 9000000 || tagged(e, "enemy-hard") == nil || tagged(e, "wave") == nil {
		t.Fatal("difficulty did not preserve friendly rules or select enemy wave")
	}
	normal := extendedMission(t, def, fixtureMap())
	ticks(normal, 10)
	if tagged(normal, "enemy-hard") != nil || tagged(normal, "wave") != nil {
		t.Fatal("difficulty-only composition/timing leaked")
	}
}
func TestMissionValidationRejectsCyclesAndUnboundedConditions(t *testing.T) {
	cases := map[string]func(*content.Mission){
		"nested-cycle": func(d *content.Mission) {
			d.Objectives[0].Condition = content.MissionCondition{Kind: "all", Children: []content.MissionCondition{{Kind: "objective_complete", Objective: "end"}}}
		},
		"depth": func(d *content.Mission) {
			q := content.MissionCondition{Kind: "timer"}
			for i := 0; i < 8; i++ {
				q = content.MissionCondition{Kind: "all", Children: []content.MissionCondition{q}}
			}
			d.Objectives[0].Condition = q
		},
		"width": func(d *content.Mission) {
			q := content.MissionCondition{Kind: "any"}
			for i := 0; i < 17; i++ {
				q.Children = append(q.Children, content.MissionCondition{Kind: "timer"})
			}
			d.Objectives[0].Condition = q
		},
		"objective-wave":      func(d *content.Mission) { d.Objectives[0].Condition.Wave = true },
		"friendly-difficulty": func(d *content.Mission) { d.Initial[0].Difficulties = []string{"hard"} },
		"friendly-wave": func(d *content.Mission) {
			d.Triggers = []content.MissionTrigger{{ID: "bad", Condition: content.MissionCondition{Kind: "timer", Wave: true}, Actions: []content.MissionAction{{Kind: "spawn", Spawn: &d.Initial[0]}}}}
		},
		"unknown-event": func(d *content.Mission) {
			d.Objectives[0].Condition = content.MissionCondition{Kind: "event_count", Event: "run_arbitrary_code"}
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			def := longMission()
			mutate(&def)
			if err := def.Validate(content.MustBase(), fixtureMap()); err == nil {
				t.Fatal("invalid mission accepted")
			}
		})
	}
}
func TestMissionProgressRejectsCorruptionWithoutPanics(t *testing.T) {
	def := longMission()
	def.Objectives = append(def.Objectives, content.MissionObjective{ID: "metric", Optional: true, Condition: content.MissionCondition{Kind: "event_count", Event: "unit_ready", Owner: 1, Count: 1}})
	for _, mutate := range []func(*MissionState){func(ms *MissionState) { ms.Objectives = nil }, func(ms *MissionState) { ms.Counters[0].Owner = 2 }, func(ms *MissionState) { ms.Objectives[0].Condition.Children = []ConditionProgress{{}} }, func(ms *MissionState) { ms.KnownTags = append(ms.KnownTags, "unknown") }} {
		e := extendedMission(t, def, fixtureMap())
		mutate(e.state.Mission)
		if err := e.validateMissionProgress(); err == nil {
			t.Fatal("malformed progress accepted")
		}
	}
}

func TestMissionLateBlockedPlacementRollsBackAllActions(t *testing.T) {
	m := fixtureMap()
	for y := int32(35); y <= 45; y++ {
		for x := int32(35); x <= 45; x++ {
			m.Tiles[y*m.Width+x].Terrain = "blocked"
		}
	}
	m.Tiles[40*m.Width+40].Terrain = "open"
	def := longMission()
	def.Triggers = []content.MissionTrigger{{ID: "placement", Condition: content.MissionCondition{Kind: "timer"}, Actions: []content.MissionAction{{Kind: "credits", Owner: 1, Amount: 1000}, {Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "first", Type: "US.rifle", Owner: 1, Position: Vec{X: 28000, Y: 16000}, Count: 1}}, {Kind: "spawn", Spawn: &content.MissionSpawn{Tag: "blocked", Type: "power", Owner: 1, Position: Vec{X: 40000, Y: 40000}, Count: 1}}}}}
	e := extendedMission(t, def, m)
	beforeID, beforeEvent, beforeRevision := e.state.NextID, e.state.NextEvent, e.state.NavigationRevision
	e.Advance()
	if tagged(e, "first") != nil || e.player(1).Credits != 6000000 || e.state.NextID != beforeID || e.state.NextEvent != beforeEvent || e.state.NavigationRevision != beforeRevision || len(e.state.Events) != 0 {
		t.Fatal("placement failure retained transactional state/events")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for _, engine := range []*Engine{e, restored} {
		for y := int32(35); y <= 45; y++ {
			for x := int32(35); x <= 45; x++ {
				engine.state.Map.Tiles[y*m.Width+x].Terrain = "open"
			}
		}
		ticks(engine, 2)
	}
	if e.Hash() != restored.Hash() || tagged(e, "first") == nil || tagged(e, "blocked") == nil || e.player(1).Credits != 6001000 || e.state.Mission.Triggers[0].Fired != 1 {
		t.Fatal("legal retry did not commit once after restore")
	}
}
func TestMissionRepairMetricUsesActualPaidRecovery(t *testing.T) {
	def := longMission()
	def.Initial[0].Type = "US.tank"
	def.Objectives = append(def.Objectives, content.MissionObjective{ID: "repair-budget", Optional: true, AtEnd: true, Condition: content.MissionCondition{Kind: "event_value", Event: "repair_spent", Tag: "escort", Owner: 1, Amount: 500, Compare: "at_most"}})
	e := extendedMission(t, def, fixtureMap())
	target := tagged(e, "escort")
	target.HP -= 10000
	e.spawn("US.repair", 1, Vec{X: 18000, Y: 10000}, true, 0)
	ticks(e, 10)
	if e.state.Mission.Counters[0].Value != 1000 || e.player(1).Spent != 1000 || target.HP != target.MaxHP {
		t.Fatalf("paid-repair metric differs from actual price: %+v", e.state.Mission.Counters)
	}
}
func TestMissionMissileBudgetPersistsBetweenPaidVolleyShots(t *testing.T) {
	def := longMission()
	def.Faction = "IR"
	def.Players[0].Faction = "IR"
	def.Players[1].Faction = "US"
	def.Initial[0] = content.MissionSpawn{Tag: "escort", Type: "IR.launcher", Owner: 1, Count: 1, Position: Vec{X: 20000, Y: 30000}}
	def.Objectives = append(def.Objectives, content.MissionObjective{ID: "missile-budget", Optional: true, AtEnd: true, Condition: content.MissionCondition{Kind: "event_value", Event: "missile_spent", Tag: "escort", Owner: 1, Amount: 500000, Compare: "at_most"}})
	e := extendedMission(t, def, fixtureMap())
	launcher := tagged(e, "escort")
	launcher.Deployed = true
	launcher.Charges = 2
	point := Vec{X: 40000, Y: 30000}
	e.spawn("IR.engineer", 1, Vec{X: 39000, Y: 29000}, true, 0)
	e.spawn("barracks", 2, point, true, 0)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "ability", Type: "volley", Entities: []ID{launcher.ID}, Points: []Vec{point, point}})
	ticks(e, 10)
	if e.state.Mission.Counters[0].Value != 300000 {
		t.Fatal("first volley cost not recorded")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 20)
	ticks(restored, 20)
	if e.Hash() != restored.Hash() || e.state.Mission.Counters[0].Value != 600000 {
		t.Fatal("second volley cost lost or duplicated after save")
	}
}

func TestMissionEditorPracticePreservesRulesAndMarkAcrossRestore(t *testing.T) {
	def := longMission()
	def.Objectives[0].Condition.Tick = 105
	e, err := NewPracticeMission(content.MustBase(), fixtureMap(), def, "normal", 5)
	if err != nil {
		t.Fatal(err)
	}
	if e.Metadata().Ruleset != "practice-v1" {
		t.Fatal("editor mission not marked practice")
	}
	ticks(e, 103)
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 10)
	ticks(restored, 10)
	if e.Hash() != restored.Hash() || e.Outcome().Reason != "mission_complete" || e.Metadata().Ruleset != "practice-v1" || e.Outcome().Tick != 105 {
		t.Fatal("practice mark changed scenario logic or was lost on save")
	}
}
