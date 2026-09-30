package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Synthetic regression using the original AT101 power/rig/medic geometry.
// The private original checkpoint remains separate and is never edited.
func physicalStallNavigationFixture(t *testing.T) (*Engine, *Entity, []*Entity) {
	t.Helper()
	m := fixtureMap()
	m.Width, m.Height = 128, 128
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	power := e.spawn("power", 1, Vec{X: 18500, Y: 68500}, true, 500000)
	rig := e.spawn("US.rig", 1, Vec{X: 19936, Y: 70554}, true, 0)
	medic := e.spawn("US.medic", 1, Vec{X: 18248, Y: 69999}, true, 350000)
	actor := e.spawn("US.at", 1, Vec{X: 19164, Y: 69999}, true, 500000)
	e.recalculate()
	e.updateFog()
	if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
		t.Fatal("actual synthetic crowded start must be legal")
	}
	return e, actor, []*Entity{power, rig, medic}
}

func TestNavigationPhysicalStallSurvivesAcceptedGoalReplacement(t *testing.T) {
	for _, kind := range []string{"move", "attack_move"} {
		t.Run(kind, func(t *testing.T) {
			e, actor, blockers := physicalStallNavigationFixture(t)
			start := actor.Position
			positions := []Vec{blockers[0].Position, blockers[1].Position, blockers[2].Position}
			goal := Vec{X: 30500, Y: 57050}
			e.pathBudget = 12
			staticPath := e.referenceFindPath(actor, goal, false)
			if len(staticPath) == 0 || staticPath[0] != (Vec{X: 19500, Y: 70000}) || e.navigationBridgeClear(actor, staticPath[0], true) {
				t.Fatal("fixture no longer reproduces the unsafe static mobile-obstacle prefix", staticPath)
			}
			e.pathBudget = 12
			dynamicPath := e.findPath(actor, goal, true)
			if len(dynamicPath) == 0 || !e.navigationBridgeClear(actor, dynamicPath[0], true) {
				t.Fatal("fixture lacks a fully swept ordinary dynamic exit", dynamicPath)
			}
			beforeHash, beforeFacing, beforeRemainder := e.Hash(), actor.Facing, actor.MoveRemainder
			e.pathBudget = 12
			path := e.findPath(actor, goal, false)
			if len(path) == 0 || !e.navigationBridgeClear(actor, navigationStepPosition(start, path[0], 125), true) || e.pathBudget != 11 || e.Hash() != beforeHash || actor.Facing != beforeFacing || actor.MoveRemainder != beforeRemainder {
				t.Fatal("unsafe static current step did not select one charged pure dynamic retry", path, e.pathBudget)
			}
			recorder, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			var restored *Engine
			firstMove := Tick(0)
			accepted := 0
			for e.Tick() < 100 {
				replaced := e.Tick()%20 == 0
				if replaced {
					goal.Y = 57050 + int32((e.Tick()/20)%2)*2000
					order := Order{Kind: kind, Entities: []ID{actor.ID}, Position: goal}
					if err := e.Submit(1, e.player(1).LastSequence+1, []Order{order}); err != nil {
						t.Fatal(err)
					}
					if restored != nil {
						if err := restored.Submit(1, restored.player(1).LastSequence+1, []Order{order}); err != nil {
							t.Fatal(err)
						}
					}
				}
				previous := *actor
				e.Advance()
				if replaced {
					if len(e.state.Results) != 1 || !e.state.Results[0].Accepted {
						t.Fatal("ordinary replacement order rejected", e.state.Results)
					}
					accepted++
					first := Vec{}
					if len(actor.Path) > 0 {
						first = actor.Path[0]
					}
					t.Logf("accepted %s tick%d previous%v current%v first%v stationary%d failures%d nextRoute%d remainder%d", kind, e.Tick(), previous.Position, actor.Position, first, actor.StationarySince, actor.RouteFailures, actor.NextRouteAt, actor.MoveRemainder)
				}
				if !e.navigationBridgeClear(&previous, actor.Position, true) || !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
					t.Fatal("physical retry crossed an actual collider", e.Tick(), previous.Position, actor.Position)
				}
				for i, blocker := range blockers {
					if blocker.Position != positions[i] {
						t.Fatal("fixture displaced a blocker", blocker.ID)
					}
				}
				if firstMove == 0 && actor.Position != start {
					firstMove = e.Tick()
				}
				if restored != nil {
					restored.Advance()
					if restored.Hash() != e.Hash() {
						t.Fatal("safe-step/replacement restore diverged", e.Tick())
					}
				}
				if e.Tick() == 35 {
					saved, err := recorder.CaptureCheckpoint(e)
					if err != nil {
						t.Fatal(err)
					}
					restored, err = Restore(e.catalog, saved)
					if err != nil || restored.Hash() != e.Hash() {
						t.Fatal("cold checkpoint during ordinary recovery", err)
					}
				}
			}
			if firstMove != 1 || distance(start, actor.Position) < 2000 || accepted != 5 || actor.Paid != 500000 || len(actor.Orders) != 1 || actor.Orders[0].Kind != kind || actor.Orders[0].Position != goal {
				t.Fatal("accepted fresh goals erased ordinary physical recovery", firstMove, actor.Position, accepted, actor.Orders)
			}
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			for _, checkpointed := range []bool{true, false} {
				copy := *recorder
				if !checkpointed {
					copy.Checkpoints = nil
				}
				played, err := copy.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("safe-step/replacement replay diverged", checkpointed, err)
				}
			}
		})
	}
}

func TestNavigationPhysicalStallPreservesInRangeAttackMoveCombat(t *testing.T) {
	e, actor, _ := physicalStallNavigationFixture(t)
	target := e.spawn("IR.car", 2, Vec{X: 25442, Y: 69847}, true, 900000)
	e.recalculate()
	e.updateFog()
	w, ok := e.weapon(actor)
	if !ok || !e.canAttack(actor, target) || !e.canSeeEntity(actor.Owner, target) || e.edgeDistance(actor, target) < w.MinRange || e.edgeDistance(actor, target) > w.MaxRange {
		t.Fatal("combat control requires the actual legal firing ring")
	}
	initialHP := target.HP
	issue(t, e, 1, Order{Kind: "attack_move", Entities: []ID{actor.ID}, Position: Vec{X: 30500, Y: 57050}})
	// Movement precedes target acquisition. The first accepted order can take
	// its safe step; once the ordinary combat phase acquires the car, stop to fire.
	start, stationary := actor.Position, actor.StationarySince
	if actor.Target != target.ID || !e.canAttack(actor, target) || !e.canSeeEntity(actor.Owner, target) || e.edgeDistance(actor, target) < w.MinRange || e.edgeDistance(actor, target) > w.MaxRange {
		t.Fatal("ordinary acquisition did not establish valid stopped firing")
	}
	for e.Tick() < 80 {
		e.Advance()
		if actor.Position != start {
			t.Fatal("physical stall retry overrode ordinary in-range combat", e.Tick(), actor.Position)
		}
	}
	if actor.LastDealt == 0 || target.HP >= initialHP || actor.Target != target.ID || actor.StationarySince != stationary || actor.Paid != 500000 || len(actor.Orders) != 1 || actor.Orders[0].Kind != "attack_move" {
		t.Fatal("valid stopped firing or intended task changed", actor, target.HP, initialHP)
	}
}

func TestNavigationPhysicalStallCachedUnsafeStepDefersSingleIntegration(t *testing.T) {
	e, actor, _ := physicalStallNavigationFixture(t)
	start, goal := actor.Position, Vec{X: 30500, Y: 57050}
	e.assign(actor, Order{Kind: "move", Position: goal})
	e.pathBudget = 12
	actor.Path = e.referenceFindPath(actor, goal, false)
	if len(actor.Path) == 0 {
		t.Fatal("frozen legacy static path missing")
	}
	actor.PathGoal, actor.PathEnd = goal, actor.Path[len(actor.Path)-1]
	actor.PathRevision, actor.PathResolved = e.state.NavigationRevision, true
	oldFirst := actor.Path[0]
	actor.MoveRemainder = 17
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if actor.Position != start || actor.Facing != direction(oldFirst.X-start.X, oldFirst.Y-start.Y) || actor.MoveRemainder != 17 || actor.StationarySince != 0 || len(actor.Path) == 0 || actor.Path[0] == oldFirst || !actor.PathResolved || actor.PathGoal != goal || e.pathBudget != 11 {
		t.Fatal("cached-step retry committed twice or lost the bounded same-goal route", actor, e.pathBudget)
	}
	next := navigationStepPosition(start, actor.Path[0], 125)
	if !e.navigationBridgeClear(actor, next, true) {
		t.Fatal("stored current-step retry is not actually safe", next)
	}
	saved, err := recorder.CaptureCheckpoint(e)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("cold restore between rejected step and retry", err)
	}
	e.Advance()
	restored.Advance()
	if actor.Position != next || actor.StationarySince != 2 || actor.MoveRemainder != 17 || e.Hash() != restored.Hash() {
		t.Fatal("next-tick retry changed single-step integration or restore", actor.Position, next)
	}
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	for _, checkpointed := range []bool{true, false} {
		copy := *recorder
		if !checkpointed {
			copy.Checkpoints = nil
		}
		played, err := copy.Seek(e.catalog, e.Tick())
		if err != nil || played.Hash() != e.Hash() {
			t.Fatal("cached-step retry replay mismatch", checkpointed, err)
		}
	}
}

func TestNavigationPhysicalStallReportedRetrappedPositionHasUnsafeStaticStep(t *testing.T) {
	e, actor, _ := physicalStallNavigationFixture(t)
	// Read-only derived query at the root V3 synthetic final position. The
	// original actor/scene is not relocated, and the ordinary proof stays separate.
	probe := *actor
	probe.Position = Vec{X: 19478, Y: 71455}
	goal := Vec{X: 30500, Y: 57050}
	before := e.Hash()
	e.pathBudget = 12
	old := e.referenceFindPath(&probe, goal, false)
	if len(old) == 0 || !e.clear(probe.Position, e.radius(&probe), probe.ID, false, true) || e.navigationBridgeClear(&probe, navigationStepPosition(probe.Position, old[0], 125), true) {
		t.Fatal("reported legal position no longer reproduces a rejected current static step", old)
	}
	e.pathBudget = 12
	path := e.findPath(&probe, goal, false)
	if len(path) == 0 || !e.navigationBridgeClear(&probe, navigationStepPosition(probe.Position, path[0], 125), true) || e.pathBudget != 11 || before != e.Hash() {
		t.Fatal("fresh static dispatch did not recover the witnessed current-step rejection", path)
	}
}

func TestNavigationPhysicalStallPreservesStopAndHold(t *testing.T) {
	for _, kind := range []string{"stop", "hold"} {
		t.Run(kind, func(t *testing.T) {
			e, actor, _ := physicalStallNavigationFixture(t)
			start := actor.Position
			issue(t, e, 1, Order{Kind: kind, Entities: []ID{actor.ID}})
			ticks(e, 100)
			if actor.Position != start || len(actor.Orders) != 0 || len(actor.Path) != 0 || actor.StationarySince != 0 || kind == "hold" && actor.Stance != "hold" {
				t.Fatal("physical stall created unsolicited movement", kind, actor)
			}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: Vec{X: 30500, Y: 57050}})
			if actor.Position == start || len(actor.Orders) != 1 || actor.Orders[0].Kind != "move" || !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
				t.Fatal("later explicit Move did not immediately use the legal physical retry", kind, actor)
			}
		})
	}
}
