package sim

import "testing"

func TestFailedPathWaitsAndRecoversAfterTerrainChange(t *testing.T) {
	e := fixture(t)
	u := e.entity(2)
	// A closed synthetic wall separates the rig from its order destination.
	for y := int32(0); y < e.state.Map.Height; y++ {
		e.state.Map.Tiles[y*64+24].Terrain = "blocked"
	}
	e.state.NavigationRevision++
	e.assign(u, Order{Kind: "move", Position: Vec{X: 38000, Y: 8000}})
	e.Advance()
	if u.NextRouteAt <= e.Tick() {
		t.Fatal("unreachable path was not deferred")
	}
	deadline := u.NextRouteAt
	ticks(e, 10)
	if u.NextRouteAt != deadline {
		t.Fatal("failed route searched again every tick")
	}
	for y := int32(5); y <= 10; y++ {
		e.state.Map.Tiles[y*64+24].Terrain = "open"
	}
	e.state.NavigationRevision++
	e.Advance()
	if u.NextRouteAt != 0 || len(u.Path) == 0 {
		t.Fatal("navigation change did not trigger immediate retry")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for range 180 {
		e.Advance()
		restored.Advance()
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("navigation caches changed restore determinism")
	}
	if u.Position.X < 24000 {
		t.Fatal("rig did not cross opened corridor")
	}
}
func TestMobileObstacleGridMatchesCollisionRules(t *testing.T) {
	e := fixture(t)
	a := e.spawn("US.rifle", 1, Vec{X: 19000, Y: 18000}, true, 0)
	e.spawn("US.tank", 1, Vec{X: 20800, Y: 18600}, true, 0)
	e.spawn("IR.recon", 2, Vec{X: 21800, Y: 17600}, true, 0)
	for _, radius := range []int32{350, 600, 800} {
		grid := e.mobileObstacleCells(radius)
		for y := int32(15000); y <= 22000; y += 500 {
			for x := int32(15000); x <= 25000; x += 500 {
				position := Vec{X: x, Y: y}
				id := grid[y/500*128+x/500]
				if got, want := id == 0 || id == a.ID, e.mobileClear(position, radius, a.ID); got != want {
					t.Fatal("cached mobile occupancy mismatch", position, radius)
				}
			}
		}
	}
}
