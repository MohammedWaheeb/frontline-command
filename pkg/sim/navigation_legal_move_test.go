package sim

import (
	"reflect"
	"testing"
)

func navigationLegalMoveCheckpoint(t *testing.T, e *Engine, recorder *Replay) *Engine {
	t.Helper()
	saved, err := recorder.CaptureCheckpoint(e)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("legal Move checkpoint", err)
	}
	return restored
}

func navigationLegalMoveReplay(t *testing.T, e *Engine, recorder *Replay) {
	t.Helper()
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	checkpoint, err := recorder.Seek(e.catalog, e.Tick())
	if err != nil || checkpoint.Hash() != e.Hash() {
		t.Fatal("legal Move checkpoint replay", err)
	}
	full := *recorder
	full.Checkpoints = nil
	played, err := full.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("legal Move full replay", err)
	}
}

// The six exact goals are retained failed public Move counterexamples. This
// separate compact backend control isolates their endpoint law; it does not
// replace those paid public episodes, alter their actors or relabel their runs.
func TestNavigationLegalMoveGoal(t *testing.T) {
	cases := []struct {
		name, typ string
		goal      Vec
	}{
		{"caster", "IR.recon", Vec{X: 28000, Y: 23850}},
		{"immobile_followup", "IR.recon", Vec{X: 26999, Y: 23884}},
		{"replacement", "IR.recon", Vec{X: 27999, Y: 23884}},
		{"combat_setup", "IR.recon", Vec{X: 23970, Y: 24600}},
		{"proximity_inside", "SY.rifle", Vec{X: 30499, Y: 32334}},
		{"proximity_outside", "SY.rifle", Vec{X: 31499, Y: 32334}},
		{"infantry_cell_corner", "US.rifle", Vec{X: 22499, Y: 20499}},
		{"light_cell_corner", "US.apc", Vec{X: 22499, Y: 20499}},
		{"heavy_cell_corner", "US.hauler", Vec{X: 22499, Y: 20499}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := fixture(t)
			if tc.typ == "SY.rifle" {
				for y := int32(31); y <= 33; y++ {
					for x := int32(30); x <= 32; x++ {
						e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "cover"
					}
				}
				e.state.NavigationRevision++
			}
			rule, ok := e.catalog.Unit(tc.typ)
			if !ok {
				t.Fatal("counterexample actor rule absent", tc.typ)
			}
			actor := e.spawn(tc.typ, 1, Vec{X: tc.goal.X - 3000, Y: tc.goal.Y}, true, rule.Cost)
			e.recalculate()
			e.updateFog()
			if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) || !e.clear(tc.goal, e.radius(actor), actor.ID, false, true) {
				t.Fatal("endpoint fixture must be physically legal")
			}
			floor := Vec{X: tc.goal.X / 500 * 500, Y: tc.goal.Y / 500 * 500}
			path := e.findNavigationRoute(actor, tc.goal, false)
			if len(path) == 0 || path[len(path)-1] != floor {
				t.Fatal("unchanged grid search did not retain its original endpoint", path, floor)
			}
			e.pathBudget = 12
			before := e.Hash()
			finished := e.appendLegalMoveGoal(actor, path, tc.goal)
			if finished[len(finished)-1] != tc.goal || e.Hash() != before || e.pathBudget != 12 {
				t.Fatal("legal tail changed state, charged a search or lost the click", finished)
			}
			recorder, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: tc.goal})
			if actor.PathEnd != tc.goal || actor.PathGoal != tc.goal || len(actor.Orders) != 1 {
				t.Fatal("ordinary Move discarded its legal sub-grid goal", actor.PathEnd, actor.PathGoal, actor.Orders)
			}
			var restored *Engine
			for step := 0; step < 200 && len(actor.Orders) > 0; step++ {
				previous := *actor
				e.Advance()
				if !e.navigationBridgeClear(&previous, actor.Position, true) {
					t.Fatal("legal Move crossed a physical obstacle", e.Tick(), previous.Position, actor.Position)
				}
				if restored != nil {
					restored.Advance()
					if restored.Hash() != e.Hash() {
						t.Fatal("legal Move cold restore diverged", e.Tick())
					}
				}
				if step == 5 {
					restored = navigationLegalMoveCheckpoint(t, e, recorder)
				}
			}
			if len(actor.Orders) != 0 || dist2(actor.Position, tc.goal) >= 250*250 || actor.Blocked || actor.Paid != rule.Cost {
				t.Fatal("Move retired outside the unchanged strict click tolerance", actor.Position, tc.goal, actor.Orders)
			}
			stopped := actor.Position
			for step := 0; step < 20; step++ {
				e.Advance()
				if restored != nil {
					restored.Advance()
					if restored.Hash() != e.Hash() {
						t.Fatal("completed Move restore diverged", e.Tick())
					}
				}
				if actor.Position != stopped {
					t.Fatal("completed Move did not remain at its destination", actor.Position, stopped)
				}
			}
			navigationLegalMoveReplay(t, e, recorder)
		})
	}
}

func TestNavigationLegalMoveTailRequiresSweptClearance(t *testing.T) {
	cases := []struct {
		name    string
		prepare func(*Engine, *Entity, Vec, Vec) (Vec, Vec)
	}{
		{"clear_endpoints_blocked_circle_sweep", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			e.spawn("US.rifle", 1, Vec{X: 20710, Y: 19790}, true, 0)
			return end, goal
		}},
		{"occupied_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			e.spawn("US.rifle", 1, goal, true, 0)
			return end, goal
		}},
		{"building_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			e.spawn("power", 1, Vec{X: 21600, Y: 21600}, true, 0)
			return end, goal
		}},
		{"foundation_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			e.spawn("power", 1, Vec{X: 21600, Y: 21600}, false, 0)
			return end, goal
		}},
		{"retained_foundation_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			b := e.spawn("US.airfield", 1, Vec{X: 23800, Y: 22500}, true, 0)
			b.Type, b.Owner = "IR.drone_hub", 2
			if !e.validRetainedFootprint(b.Type, b.FootprintType, b.FootprintWidth, b.FootprintHeight) {
				panic("invalid retained goal footprint")
			}
			return end, goal
		}},
		{"blocked_terrain_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			e.state.Map.Tiles[21*e.state.Map.Width+21].Terrain = "blocked"
			e.state.NavigationRevision++
			return Vec{X: 20500, Y: 20500}, Vec{X: 20999, Y: 20999}
		}},
		{"grounded_aircraft_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			craft := e.spawn("IR.gunship", 2, Vec{X: goal.X + 1400, Y: goal.Y}, true, 0)
			craft.Home = 0
			return end, goal
		}},
		{"remote_service_goal", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			home := e.spawn("IR.drone_hub", 2, Vec{X: 45000, Y: 40000}, true, 0)
			craft := e.spawn("IR.strike", 2, Vec{X: 44000, Y: 45000}, true, 0)
			craft.Home, craft.Landed = home.ID, false
			craft.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: goal.X + 2000, Y: goal.Y}}
			return end, goal
		}},
		{"click_in_map_outside_full_radius", func(e *Engine, v *Entity, end, goal Vec) (Vec, Vec) {
			return Vec{X: 63500, Y: 20000}, Vec{X: 63999, Y: 20499}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := fixture(t)
			actor := e.spawn("US.rifle", 1, Vec{X: 18000, Y: 18000}, true, 300000)
			end, goal := tc.prepare(e, actor, Vec{X: 20000, Y: 20000}, Vec{X: 20499, Y: 20499})
			probe := *actor
			probe.Position = end
			if !e.clear(end, e.radius(actor), actor.ID, false, true) || e.navigationBridgeClear(&probe, goal, true) {
				t.Fatal("control requires a legal original endpoint and blocked tail", end, goal)
			}
			if tc.name == "clear_endpoints_blocked_circle_sweep" && !e.clear(goal, e.radius(actor), actor.ID, false, true) {
				t.Fatal("swept-circle counterexample must have two clear endpoints")
			}
			path := []Vec{end}
			before := e.Hash()
			e.pathBudget = 12
			if got := e.appendLegalMoveGoal(actor, path, goal); !reflect.DeepEqual(got, path) || e.Hash() != before || e.pathBudget != 12 {
				t.Fatal("blocked tail changed the original path, state or charge", got)
			}
		})
	}
}

func TestNavigationLegalMoveTailRelocatedGoal(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.rifle", 1, Vec{X: 18000, Y: 18000}, true, 300000)
	goal := Vec{X: 20500, Y: 20500}
	e.spawn("power", 1, Vec{X: 21000, Y: 21000}, true, 500000)
	path := e.findNavigationRoute(actor, goal, false)
	if len(path) == 0 || e.clear(goal, e.radius(actor), actor.ID, false, true) {
		t.Fatal("blocked click needs its original relocated route", path)
	}
	end := path[len(path)-1]
	if end.X/500 == goal.X/500 && end.Y/500 == goal.Y/500 {
		t.Fatal("original blocked-goal search did not relocate its endpoint", end)
	}
	if got := e.appendLegalMoveGoal(actor, path, goal); !reflect.DeepEqual(got, path) {
		t.Fatal("Move tail replaced a relocated blocked goal", got, path)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
	if actor.PathGoal != goal || actor.PathEnd != end {
		t.Fatal("ordinary blocked Move changed its intention or nearest endpoint", actor.PathGoal, actor.PathEnd, end)
	}
}

// A500-grid waypoint can be consumed110 short before turning into its legal
// tail. The actual rounded shortcut then meets a real circle. A cached retry
// must recover through the grid node and retain the requested final point.
func TestNavigationLegalMoveTailCachedRetry(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.rifle", 1, Vec{X: 18140, Y: 20000}, true, 300000)
	e.spawn("US.rifle", 1, Vec{X: 19753, Y: 20747}, true, 300000)
	goal, end := Vec{X: 20499, Y: 20499}, Vec{X: 20000, Y: 20000}
	probe := *actor
	probe.Position = end
	if !e.navigationBridgeClear(&probe, goal, true) {
		t.Fatal("planned final tail must be legal")
	}
	probe.Position = Vec{X: 19890, Y: 20000}
	if e.navigationBridgeClear(&probe, goal, true) {
		t.Fatal("early grid pop must expose a forbidden shortcut")
	}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
	var restored *Engine
	sawEarlyPop, sawCachedRetry := false, false
	for step := 0; step < 80 && len(actor.Orders) > 0; step++ {
		previous := *actor
		e.Advance()
		if !e.navigationBridgeClear(&previous, actor.Position, true) {
			t.Fatal("Move committed the forbidden shortcut", e.Tick(), previous.Position, actor.Position)
		}
		if restored != nil {
			restored.Advance()
			if restored.Hash() != e.Hash() {
				t.Fatal("cached tail restore diverged", e.Tick())
			}
		}
		if actor.Position == (Vec{X: 19890, Y: 20000}) && len(actor.Path) == 1 && actor.Path[0] == goal {
			sawEarlyPop = true
		}
		if previous.Position == (Vec{X: 19986, Y: 20079}) && actor.Position == previous.Position {
			if !sawEarlyPop || len(actor.Path) != 2 || actor.Path[0] != end || actor.Path[1] != goal || actor.PathEnd != goal || actor.PathGoal != goal || !actor.PathResolved {
				t.Fatal("cached retry lost the legal clicked tail", actor.Position, actor.Path, actor.PathEnd, actor.PathResolved)
			}
			sawCachedRetry = true
			restored = navigationLegalMoveCheckpoint(t, e, recorder)
		}
	}
	if !sawEarlyPop || !sawCachedRetry || len(actor.Orders) != 0 || dist2(actor.Position, goal) >= 250*250 || actor.Paid != 300000 {
		t.Fatal("cached tail did not physically recover within80 ticks", sawEarlyPop, sawCachedRetry, actor.Position, actor.Path, actor.Orders)
	}
	navigationLegalMoveReplay(t, e, recorder)
}

func TestNavigationLegalMoveTailQueue(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.rifle", 1, Vec{X: 18140, Y: 20000}, true, 300000)
	first, second := Vec{X: 20499, Y: 20499}, Vec{X: 24499, Y: 24499}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: first})
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: second, Queued: true})
	issue(t, e, 1, Order{Kind: "hold", Entities: []ID{actor.ID}, Queued: true})
	var restored *Engine
	transitions := 0
	for step := 0; step < 200 && len(actor.Orders) > 0; step++ {
		oldGoal := actor.Orders[0].Position
		e.Advance()
		if len(actor.Orders) == 0 || actor.Orders[0].Position != oldGoal {
			if dist2(actor.Position, oldGoal) >= 250*250 {
				t.Fatal("queued Move activated early outside strict click tolerance", actor.Position, oldGoal, actor.Orders)
			}
			transitions++
		}
		if restored != nil {
			restored.Advance()
			if restored.Hash() != e.Hash() {
				t.Fatal("queued tail restore diverged", e.Tick())
			}
		}
		if step == 5 {
			restored = navigationLegalMoveCheckpoint(t, e, recorder)
		}
	}
	if transitions != 2 || len(actor.Orders) != 0 || actor.Stance != "hold" || dist2(actor.Position, second) >= 250*250 || actor.Paid != 300000 {
		t.Fatal("legal Move queue did not finish both clicks and Hold", transitions, actor.Position, actor.Orders, actor.Stance)
	}
	navigationLegalMoveReplay(t, e, recorder)
}

func TestNavigationLegalMoveTailStopHold(t *testing.T) {
	for _, kind := range []string{"stop", "hold"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			actor := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 20000}, true, 300000)
			goal := Vec{X: 22499, Y: 20499}
			recorder, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
			for step := 0; step < 80 && !(len(actor.Path) == 1 && actor.Path[0] == goal); step++ {
				e.Advance()
			}
			if len(actor.Path) != 1 || actor.Path[0] != goal || distance(actor.Position, goal) <= 180 {
				t.Fatal("control did not reach an active final tail", actor.Position, actor.Path)
			}
			position := actor.Position
			issue(t, e, 1, Order{Kind: kind, Entities: []ID{actor.ID}})
			if actor.Position != position || len(actor.Path) != 0 || len(actor.Orders) != 0 || actor.Paid != 300000 {
				t.Fatal("manual interruption did not immediately cancel the tail", kind, actor.Position, actor.Path, actor.Orders)
			}
			restored := navigationLegalMoveCheckpoint(t, e, recorder)
			for step := 0; step < 40; step++ {
				e.Advance()
				restored.Advance()
				if actor.Position != position || restored.Hash() != e.Hash() {
					t.Fatal("manual Stop/Hold tail resumed or restore diverged", kind, e.Tick())
				}
			}
			navigationLegalMoveReplay(t, e, recorder)
		})
	}
}

func TestNavigationLegalMoveTailOtherOrders(t *testing.T) {
	for _, kind := range []string{"attack_move", "patrol"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			actor := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 20000}, true, 300000)
			goal := Vec{X: 22499, Y: 20499}
			order := Order{Kind: kind, Entities: []ID{actor.ID}, Position: goal}
			if kind == "patrol" {
				order.Points = []Vec{goal, {X: 24499, Y: 24499}}
			}
			issue(t, e, 1, order)
			if actor.PathEnd != (Vec{X: 22000, Y: 20000}) {
				t.Fatal("Move-only tail changed another order's endpoint", kind, actor.PathEnd)
			}
		})
	}
}
