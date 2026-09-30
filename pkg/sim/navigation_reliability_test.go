package sim

import "testing"

// A legal actor can floor to a legal grid node while the first A* segment from
// its real position crosses an obstacle. Prepared geometry ends before the
// command; the journey then uses ordinary public orders and collision checks.
func navigationSubgridFixture(t *testing.T, obstacle string) (*Engine, *Entity, Vec) {
	t.Helper()
	e := fixture(t)
	start, goal := Vec{X: 19600, Y: 19990}, Vec{X: 30000, Y: 19500}
	typ := "US.rifle"
	switch obstacle {
	case "mobile":
		start, goal = Vec{X: 20499, Y: 20499}, Vec{X: 30000, Y: 20000}
		e.spawn("US.rifle", 1, Vec{X: 21180, Y: 20250}, true, 0)
	case "mobile-light", "mobile-heavy":
		typ = "US.apc"
		if obstacle == "mobile-heavy" {
			typ = "US.hauler"
		}
		unit, _ := e.catalog.Unit(typ)
		start, goal = Vec{X: 20499, Y: 20499}, Vec{X: 30000, Y: 20000}
		e.spawn(typ, 1, Vec{X: 20500 + unit.Radius*2 - 10, Y: 20250}, true, 0)
	case "terrain":
		e.state.Map.Tiles[20*e.state.Map.Width+20].Terrain = "blocked"
	case "building":
		building := e.spawn("power", 1, Vec{X: 25000, Y: 25000}, true, 0)
		width, height := e.footprint(building)
		building.Position = Vec{X: 20000 + width*500, Y: 20000 + height*500}
	default:
		t.Fatal("unknown obstacle", obstacle)
	}
	e.state.NavigationRevision++
	actor := e.spawn(typ, 1, start, true, 0)
	snapped := Vec{X: start.X / 500 * 500, Y: start.Y / 500 * 500}
	first := Vec{X: snapped.X + 500, Y: snapped.Y}
	if !e.clear(start, e.radius(actor), actor.ID, false, true) || !e.clear(snapped, e.radius(actor), actor.ID, false, true) || !e.clear(first, e.radius(actor), actor.ID, false, true) {
		t.Fatal("fixture needs legal real position, snapped start and first A* node")
	}
	if e.navigationBridgeClear(actor, first, true) {
		t.Fatal("fixture first segment must cross the obstacle")
	}
	if !e.navigationBridgeClear(actor, snapped, true) {
		t.Fatal("fixture must permit a safe connection to its snapped start")
	}
	e.recalculate()
	e.updateFog()
	return e, actor, goal
}

func TestNavigationReliabilitySubgridFirstSegmentIsClear(t *testing.T) {
	for _, obstacle := range []string{"mobile", "mobile-light", "mobile-heavy", "terrain", "building"} {
		t.Run(obstacle, func(t *testing.T) {
			e, actor, goal := navigationSubgridFixture(t, obstacle)
			e.pathBudget = 12
			path := e.findPath(actor, goal, true)
			if len(path) == 0 {
				t.Fatal("legal start and destination have no route")
			}
			if !e.navigationBridgeClear(actor, path[0], true) {
				t.Fatalf("first segment crosses obstacle: start=%+v first=%+v", actor.Position, path[0])
			}
		})
	}
}

func TestNavigationReliabilitySubgridMovementFinishes(t *testing.T) {
	for _, obstacle := range []string{"mobile", "mobile-light", "mobile-heavy", "terrain", "building"} {
		t.Run(obstacle, func(t *testing.T) {
			e, actor, goal := navigationSubgridFixture(t, obstacle)
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
			var restored *Engine
			for range 400 {
				e.Advance()
				if restored != nil {
					restored.Advance()
				}
				if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
					t.Fatalf("actor crossed obstacle at tick %d: %+v", e.Tick(), actor.Position)
				}
				if e.Tick() == 60 {
					saved, err := e.Save()
					if err != nil {
						t.Fatal(err)
					}
					restored, err = Restore(e.catalog, saved)
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			if len(actor.Orders) != 0 || distance(actor.Position, goal) > 250 || actor.Blocked {
				t.Fatalf("public move remained stuck: tick=%d pos=%+v goal=%+v state=%s failures=%d orders=%+v", e.Tick(), actor.Position, goal, actor.State, actor.RouteFailures, actor.Orders)
			}
			if restored == nil || restored.Hash() != e.Hash() {
				t.Fatal("mid-route save restoration changed movement")
			}
		})
	}
}
