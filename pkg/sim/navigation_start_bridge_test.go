package sim

import "testing"

func TestPathEscapesCollisionFreeSubgridStart(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.hauler", 1, Vec{X: 33312, Y: 30810}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 31800, Y: 31500}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 32152, Y: 29652}, true, 0)
	radius := e.radius(v)
	if !e.clear(v.Position, radius, v.ID, false, true) {
		t.Fatal("fixture actor overlaps another actor")
	}
	if e.clear(Vec{X: 33000, Y: 30500}, radius, v.ID, false, true) {
		t.Fatal("fixture must have a blocked floor-snapped path start")
	}
	// This diagonal is legal from the actual actor position. Treating the
	// snapped grid node as the actor's position incorrectly rejects it.
	escape := Vec{X: 33500, Y: 31000}
	for step := int32(0); step <= 20; step++ {
		point := Vec{X: v.Position.X + (escape.X-v.Position.X)*step/20, Y: v.Position.Y + (escape.Y-v.Position.Y)*step/20}
		if !e.clear(point, radius, v.ID, false, true) {
			t.Fatalf("actual escape segment collides at %+v", point)
		}
	}
	goal := Vec{X: 25400, Y: 27400}
	e.pathBudget = 12
	path := e.findPath(v, goal, true)
	if len(path) == 0 {
		t.Fatal("collision-free actor cannot escape a blocked snapped start")
	}
	// A start bridge must describe physical travel, not teleport across the
	// neighboring trucks. Sample its first segment with ordinary collision.
	for step := int32(0); step <= 20; step++ {
		point := Vec{X: v.Position.X + (path[0].X-v.Position.X)*step/20, Y: v.Position.Y + (path[0].Y-v.Position.Y)*step/20}
		if !e.clear(point, radius, v.ID, false, true) {
			t.Fatalf("start bridge cuts through an actor at %+v", point)
		}
	}
	e.updateFog()
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Position: goal})
	for range 1500 {
		e.Advance()
		if !e.clear(v.Position, radius, v.ID, false, true) {
			t.Fatalf("ordinary movement overlapped another actor at %+v", v.Position)
		}
	}
	if len(v.Orders) != 0 || distance(v.Position, goal) > 1000 {
		t.Fatalf("normal movement did not finish after start escape: state=%s position=%+v orders=%v", v.State, v.Position, v.Orders)
	}
}

func TestNavigationBridgeRejectsClearEndpointsAcrossObstacle(t *testing.T) {
	t.Run("mobile", func(t *testing.T) {
		e := fixture(t)
		v := e.spawn("US.hauler", 1, Vec{X: 20000, Y: 20000}, true, 0)
		blocker := e.spawn("US.hauler", 1, Vec{X: 20500, Y: 21550}, true, 0)
		goal := Vec{X: 21000, Y: 20000}
		if !e.clear(v.Position, e.radius(v), v.ID, false, true) || !e.clear(goal, e.radius(v), v.ID, false, true) {
			t.Fatal("endpoints must be clear")
		}
		if e.navigationBridgeClear(v, goal, true) {
			t.Fatal("bridge crossed a mobile collision circle")
		}
		if !e.navigationBridgeClear(v, goal, false) {
			t.Fatal("static-only routing unexpectedly considered a mobile")
		}
		blocker.Position.Y = 21600
		if !e.navigationBridgeClear(v, goal, true) {
			t.Fatal("exact tangency incorrectly rejected")
		}
	})
	t.Run("terrain corner", func(t *testing.T) {
		e := fixture(t)
		v := e.spawn("US.rifle", 1, Vec{X: 19400, Y: 20400}, true, 0)
		goal := Vec{X: 20400, Y: 19400}
		e.state.Map.Tiles[20*e.state.Map.Width+20].Terrain = "blocked"
		if !e.clear(v.Position, e.radius(v), v.ID, false, true) || !e.clear(goal, e.radius(v), v.ID, false, true) {
			t.Fatal("endpoints must be clear")
		}
		if e.navigationBridgeClear(v, goal, true) {
			t.Fatal("bridge crossed the rounded terrain corner")
		}
	})
	t.Run("building corner", func(t *testing.T) {
		e := fixture(t)
		v := e.spawn("US.rifle", 1, Vec{X: 19400, Y: 20400}, true, 0)
		goal := Vec{X: 20400, Y: 19400}
		b := e.spawn("power", 1, Vec{X: 25000, Y: 25000}, true, 0)
		w, h := e.footprint(b)
		b.Position = Vec{X: 20000 + w*500, Y: 20000 + h*500}
		if !e.clear(v.Position, e.radius(v), v.ID, false, true) || !e.clear(goal, e.radius(v), v.ID, false, true) {
			t.Fatal("endpoints must be clear")
		}
		if e.navigationBridgeClear(v, goal, false) {
			t.Fatal("bridge crossed the rounded building corner")
		}
	})
}
