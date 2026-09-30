package sim

import (
	"reflect"
	"testing"
)

// The oracle is the frozen Core17 enumeration before the origin guard
// (navigation_connection.go SHA256 a70c442280e05676e0d4ba3075958aa709a7ad7430fc0dbbc6b067dfb31f033f).
// It deliberately calls the unchanged connection/bridge collision predicate;
// no new collision implementation is used to justify the optimization.
func (e *Engine) navigationConnectionOriginOracleStarts(v *Entity, gx, gy int32, dynamic bool, passable func(Vec) bool, firstRing int32, allRings bool) ([]pathNode, map[int32]Vec) {
	sx, sy := v.Position.X/500, v.Position.Y/500
	gridW := e.state.Map.Width * 2
	var starts []pathNode
	var elbows map[int32]Vec
	for ring := firstRing; ring <= 12; ring++ {
		for dy := -ring; dy <= ring; dy++ {
			for dx := -ring; dx <= ring; dx++ {
				if abs(dx) != ring && abs(dy) != ring {
					continue
				}
				p := Vec{X: (sx + dx) * 500, Y: (sy + dy) * 500}
				if !passable(p) {
					continue
				}
				elbow, cost, ok := e.offGridNavigationConnection(v, p, dynamic)
				if !ok {
					continue
				}
				index := (sy+dy)*gridW + sx + dx
				starts = append(starts, pathNode{index, cost, cost + heuristic(sx+dx, sy+dy, gx, gy), uint32(len(starts))})
				if elbow != v.Position {
					if elbows == nil {
						elbows = map[int32]Vec{}
					}
					elbows[index] = elbow
				}
			}
		}
		if len(starts) > 0 && !allRings {
			return starts, elbows
		}
	}
	return starts, elbows
}

// Match the production findPath endpoint predicate. The callback reads only
// the prepared raster and actor ID; it does not mutate authoritative state.
func navigationConnectionOriginPassable(e *Engine, v *Entity, dynamic bool) func(Vec) bool {
	gridW, gridH := e.state.Map.Width*2, e.state.Map.Height*2
	cells := e.navigationCells(e.radius(v))
	var mobileCells []ID
	if dynamic {
		mobileCells = e.mobileObstacleCells(e.radius(v))
	}
	return func(p Vec) bool {
		x, y := p.X/500, p.Y/500
		if x < 0 || y < 0 || x >= gridW || y >= gridH || !cells[y*gridW+x] {
			return false
		}
		return !dynamic || mobileCells[y*gridW+x] == 0 || mobileCells[y*gridW+x] == v.ID
	}
}

func navigationConnectionOriginCompare(t *testing.T, e *Engine, v *Entity, dynamic bool, firstRing int32, allRings, originClear bool, passable func(Vec) bool) []pathNode {
	t.Helper()
	if clear := e.clear(v.Position, e.radius(v), v.ID, false, dynamic); clear != originClear {
		t.Fatalf("fixture origin clear=%v, want %v (radius=%d dynamic=%v)", clear, originClear, e.radius(v), dynamic)
	}
	before := e.Hash()
	oldVisits, newVisits := 0, 0
	want, wantElbows := e.navigationConnectionOriginOracleStarts(v, 60, 60, dynamic, func(p Vec) bool {
		oldVisits++
		return passable(p)
	}, firstRing, allRings)
	got, gotElbows := e.navigationConnectionStarts(v, 60, 60, dynamic, func(p Vec) bool {
		newVisits++
		return passable(p)
	}, firstRing, allRings)
	if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(gotElbows, wantElbows) {
		t.Fatalf("enumeration differs from preimage: got=%+v elbows=%+v want=%+v elbows=%+v", got, gotElbows, want, wantElbows)
	}
	if e.Hash() != before {
		t.Fatal("connection enumeration mutated authoritative state")
	}
	fullVisits := int(4 * (12*13 - (firstRing-1)*firstRing))
	if !originClear {
		if got != nil || gotElbows != nil || newVisits != 0 || oldVisits != fullVisits {
			t.Fatalf("blocked-origin rejection changed nil results or work bound: nodes=%v elbows=%v newVisits=%d oldVisits=%d wantOld=%d", got, gotElbows, newVisits, oldVisits, fullVisits)
		}
	} else {
		if newVisits != oldVisits {
			t.Fatalf("clear origin skipped endpoints: newVisits=%d oldVisits=%d", newVisits, oldVisits)
		}
		if allRings && newVisits != fullVisits {
			t.Fatalf("complete enumeration visited %d endpoints, want %d", newVisits, fullVisits)
		}
	}
	return got
}

func TestNavigationConnectionOriginGuardOracle(t *testing.T) {
	cases := []struct {
		name                      string
		prepare                   func(*Engine, *Entity)
		staticClear, dynamicClear bool
	}{
		{name: "open", staticClear: true, dynamicClear: true},
		{name: "grid_aligned_open", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			v.Position = Vec{X: 22000, Y: 22000}
		}},
		{name: "occupied_foundation", prepare: func(e *Engine, v *Entity) {
			e.spawn("power", 1, v.Position, true, 0)
		}},
		{name: "unfinished_foundation", prepare: func(e *Engine, v *Entity) {
			e.spawn("power", 1, v.Position, false, 0)
		}},
		{name: "retained_capture_foundation", prepare: func(e *Engine, v *Entity) {
			b := e.spawn("US.airfield", 1, Vec{X: 25000, Y: 22000}, true, 0)
			b.Type, b.Owner = "IR.drone_hub", 2
			// The current 4x4 rule would leave all three radii clear here;
			// the retained 6x5 physical foundation contains the real origin.
			if !e.validRetainedFootprint(b.Type, b.FootprintType, b.FootprintWidth, b.FootprintHeight) {
				panic("invalid retained-footprint fixture")
			}
		}},
		{name: "dead_foundation", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("power", 1, v.Position, true, 0).HP = 0
		}},
		{name: "live_ground_actor", staticClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("US.recon", 1, v.Position, true, 0)
		}},
		{name: "disabled_ground_actor", staticClear: true, prepare: func(e *Engine, v *Entity) {
			other := e.spawn("US.recon", 1, v.Position, true, 0)
			other.Enabled = false
			other.DisabledUntil = e.state.Tick + seconds(10)
		}},
		{name: "defeated_ground_actor", staticClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("IR.recon", 2, v.Position, true, 0)
			e.player(2).Defeated = true
		}},
		{name: "dead_ground_actor", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("US.recon", 1, v.Position, true, 0).HP = 0
		}},
		{name: "contained_ground_actor", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			carrier := e.spawn("US.apc", 1, Vec{X: 40000, Y: 22000}, true, 0)
			passenger := e.spawn("US.recon", 1, v.Position, true, 0)
			passenger.Container = carrier.ID
			carrier.Passengers = []ID{passenger.ID}
		}},
		{name: "grounded_without_home", staticClear: true, prepare: func(e *Engine, v *Entity) {
			craft := e.spawn("IR.gunship", 2, Vec{X: 23000, Y: 22000}, true, 0)
			craft.Home = 0
		}},
		{name: "remote_service_reservation", staticClear: true, prepare: func(e *Engine, v *Entity) {
			home := e.spawn("IR.drone_hub", 2, Vec{X: 19000, Y: 22000}, true, 0)
			craft := e.spawn("IR.strike", 2, Vec{X: 24000, Y: 26000}, true, 0)
			craft.Landed = false
			craft.Home = home.ID
			craft.Orders = []Order{{Kind: "return"}}
			craft.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: 23000, Y: 22000}}
		}},
		{name: "airborne_unreserved", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("IR.gunship", 2, v.Position, true, 0).Landed = false
		}},
		{name: "circle_tangent", staticClear: true, dynamicClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("US.recon", 1, Vec{X: v.Position.X + e.radius(v) + 350, Y: v.Position.Y}, true, 0)
		}},
		{name: "circle_one_inside", staticClear: true, prepare: func(e *Engine, v *Entity) {
			e.spawn("US.recon", 1, Vec{X: v.Position.X + e.radius(v) + 349, Y: v.Position.Y}, true, 0)
		}},
		{name: "blocked_origin_tile", prepare: func(e *Engine, v *Entity) {
			e.state.Map.Tiles[(v.Position.Y/1000)*e.state.Map.Width+v.Position.X/1000].Terrain = "blocked"
			e.state.NavigationRevision++
		}},
		{name: "left_bound_one_inside", prepare: func(e *Engine, v *Entity) {
			v.Position.X = e.radius(v) - 1
		}},
		{name: "right_bound_tangent_rejected", prepare: func(e *Engine, v *Entity) {
			v.Position.X = e.state.Map.Width*1000 - e.radius(v)
		}},
	}
	for _, typ := range []string{"US.recon", "US.rig", "US.hauler"} {
		t.Run(typ, func(t *testing.T) {
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					for _, dynamic := range []bool{false, true} {
						mode := "static"
						if dynamic {
							mode = "dynamic"
						}
						t.Run(mode, func(t *testing.T) {
							for _, collection := range []struct {
								name      string
								firstRing int32
								allRings  bool
							}{{"complete_ring_1_to_12", 1, true}, {"first_usable_ring_2_to_12", 2, false}} {
								t.Run(collection.name, func(t *testing.T) {
									e := fixture(t)
									v := e.spawn(typ, 1, Vec{X: 22025, Y: 22075}, true, 0)
									if tc.prepare != nil {
										tc.prepare(e, v)
									}
									originClear := tc.staticClear
									if dynamic {
										originClear = tc.dynamicClear
									}
									got := navigationConnectionOriginCompare(t, e, v, dynamic, collection.firstRing, collection.allRings, originClear, navigationConnectionOriginPassable(e, v, dynamic))
									if (tc.name == "open" || tc.name == "grid_aligned_open") && collection.allRings && len(got) != 624 {
										t.Fatalf("open origin retained %d connections, want all 624", len(got))
									}
								})
							}
						})
					}
				})
			}
		})
	}
}

func TestNavigationConnectionOriginGuardClearButNoEndpoint(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	navigationConnectionOriginCompare(t, e, v, true, 1, true, true, func(Vec) bool { return false })
}

func TestNavigationConnectionOriginGuardFreshServiceGeometry(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	home := e.spawn("IR.drone_hub", 2, Vec{X: 19000, Y: 22000}, true, 0)
	craft := e.spawn("IR.strike", 2, Vec{X: 24000, Y: 26000}, true, 0)
	craft.Landed = false
	craft.Home = home.ID
	craft.Orders = []Order{{Kind: "return"}}
	landing := &LandingReservation{Home: home.ID, Position: Vec{X: 23000, Y: 22000}}
	// These isolated geometry states deliberately include occupied origins.
	// No tick advances or shared collision index can hide the latest shape.
	phases := []struct {
		name   string
		change func()
		clear  bool
	}{
		{"remote_reservation", func() { craft.Landing = landing }, false},
		{"reservation_released", func() { craft.Landing = nil }, true},
		{"grounded_without_home", func() {
			craft.Position, craft.Home, craft.Landed = landing.Position, 0, true
		}, false},
		{"unreserved_takeoff", func() { craft.Landed = false }, true},
		{"reservation_returns", func() {
			craft.Position, craft.Home, craft.Landing = Vec{X: 24000, Y: 26000}, home.ID, landing
		}, false},
		{"destroyed", func() { craft.HP = 0 }, true},
	}
	passable := func(p Vec) bool {
		return p.X >= 0 && p.Y >= 0 && p.X < e.state.Map.Width*1000 && p.Y < e.state.Map.Height*1000
	}
	for _, phase := range phases {
		t.Run(phase.name, func(t *testing.T) {
			phase.change()
			navigationConnectionOriginCompare(t, e, v, false, 1, true, true, passable)
			navigationConnectionOriginCompare(t, e, v, true, 1, true, phase.clear, passable)
		})
	}
}

func TestNavigationConnectionOriginGuardRestore(t *testing.T) {
	e, v, _ := navigationSubgridFixture(t, "mobile")
	for _, dynamic := range []bool{false, true} {
		navigationConnectionOriginCompare(t, e, v, dynamic, 1, true, true, navigationConnectionOriginPassable(e, v, dynamic))
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("query cache preparation changed save/restore hash")
	}
	for _, dynamic := range []bool{false, true} {
		actor := restored.entity(v.ID)
		navigationConnectionOriginCompare(t, restored, actor, dynamic, 1, true, true, navigationConnectionOriginPassable(restored, actor, dynamic))
	}
}
