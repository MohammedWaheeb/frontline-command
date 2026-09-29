package sim

import (
	"frontlinecommand/pkg/content"
	"math/rand"
	"testing"
)

// The retained clearance oracle does not call navigationCells. The existing
// referenceFindPath shares this grid and cannot catch a grid regression.
func assertRasterCells(t *testing.T, e *Engine, radii []int32) {
	t.Helper()
	before := e.Hash()
	for _, radius := range radii {
		grid := e.navigationCells(radius)
		w, h := e.state.Map.Width*2, e.state.Map.Height*2
		if len(grid) != int(w*h) {
			t.Fatal("grid dimensions")
		}
		for y := int32(0); y < h; y++ {
			for x := int32(0); x < w; x++ {
				p := Vec{X: x * 500, Y: y * 500}
				if got, want := grid[y*w+x], e.referenceClearExceptLookup(p, radius, 0, 0, false, false); got != want {
					t.Fatalf("map%d×%d radius%d cell%v got%v want%v", w/2, h/2, radius, p, got, want)
				}
			}
		}
		if &grid[0] != &e.navigationCells(radius)[0] {
			t.Fatal("unchanged revision/radius did not reuse grid")
		}
	}
	if e.Hash() != before {
		t.Fatal("grid query changed authoritative state")
	}
}
func TestNavigationRasterFullGridsEqualClearanceOracle(t *testing.T) {
	rng := rand.New(rand.NewSource(740321))
	radii := []int32{0, 1, 199, 200, 499, 500, 501, 999, 1400}
	seen := map[int32]bool{}
	for _, r := range radii {
		seen[r] = true
	}
	e := fixture(t)
	for _, u := range e.catalog.Units() {
		if !seen[u.Radius] {
			radii = append(radii, u.Radius)
			seen[u.Radius] = true
		}
	}
	for _, size := range []int32{9, 17, 64} {
		e := fixture(t)
		e.state.Map.Width = size
		e.state.Map.Height = size + 3
		e.state.Map.Tiles = make([]content.Tile, int(size*(size+3)))
		e.state.Entities = nil
		e.navCache = nil
		for i := range e.state.Map.Tiles {
			e.state.Map.Tiles[i] = content.Tile{Terrain: []string{"open", "water", "cliff", "blocked", "cover", "rubble"}[rng.Intn(6)], Height: int32(rng.Intn(7)), SightBlocker: i%3 == 0, Mandatory: i%5 == 0}
		}
		for i := 0; i < 90; i++ {
			v := &Entity{ID: ID(i), Type: "unknown", Position: Vec{X: int32(rng.Intn(int(size * 1000))), Y: int32(rng.Intn(int((size + 3) * 1000)))}, HP: 10000, Building: i%3 != 0, Complete: i%2 == 0, Enabled: i%4 == 0, Owner: PlayerID(i % 5), FootprintWidth: int32(1 + i%5), FootprintHeight: int32(1 + i%7)}
			if i%11 == 0 {
				v.HP = 0
			}
			if i%13 == 0 {
				v.Container = 900
			}
			if !v.Building {
				v.Type = "US.tank"
				v.Deployed = true
				v.Landed = true
				v.Landing = &LandingReservation{Home: 3, Position: Vec{X: 4000, Y: 5000}}
			}
			e.state.Entities = append(e.state.Entities, v)
		}
		e.state.Entities = append(e.state.Entities, &Entity{ID: 0, Building: true, HP: 100, Position: Vec{X: 3000, Y: 4000}, FootprintWidth: 9, FootprintHeight: 7})
		assertRasterCells(t, e, radii)
	}
}
func TestNavigationRasterStrictTangencyAndZeroRadius(t *testing.T) {
	e := fixture(t)
	e.state.Entities = []*Entity{{ID: 10, Building: true, HP: 1, Position: Vec{X: 6000, Y: 6000}, FootprintWidth: 2, FootprintHeight: 2}}
	for i := range e.state.Map.Tiles {
		e.state.Map.Tiles[i].Terrain = "open"
	}
	e.state.Map.Tiles[12*64+12].Terrain = "blocked"
	e.navCache = nil
	grid := e.navigationCells(500)
	w := e.state.Map.Width * 2
	at := func(x, y int32) bool { return grid[y/500*w+x/500] }
	if !at(4500, 6000) || at(5000, 6000) || !at(4500, 4500) || !at(11500, 12000) || at(12000, 12000) {
		t.Fatal("strict edge/corner tangency changed")
	}
	if !at(500, 500) || at(0, 500) || at(63500, 500) {
		t.Fatal("asymmetric map boundary changed")
	}
	for _, v := range e.navigationCells(0) {
		if !v {
			t.Fatal("zero-radius strict circle changed")
		}
	}
	assertRasterCells(t, e, []int32{0, 1, 500, 501, 1400})
}
func TestNavigationRasterRetainedFootprintAndRevision(t *testing.T) {
	e := fixture(t)
	v := e.state.Entities[0]
	v.Building = true
	v.FootprintWidth = 3
	v.FootprintHeight = 5
	v.Position = Vec{X: 15000, Y: 17000}
	v.HP = 100
	v.Container = 0
	e.state.NavigationRevision++
	e.navCache = nil
	assertRasterCells(t, e, []int32{0, 350, 800})
	old := e.navigationCells(350)
	revision := e.state.NavigationRevision
	v.Type = "captured-unknown-operating-type"
	v.Owner = 2
	v.Enabled = false
	v.Complete = false
	assertRasterCells(t, e, []int32{0, 350, 800})
	if e.state.NavigationRevision != revision || &old[0] != &e.navigationCells(350)[0] {
		t.Fatal("ownership/type changed physical cache identity")
	}
	e.navCache = nil
	assertRasterCells(t, e, []int32{0, 350, 800})
	for phase := 0; phase < 3; phase++ {
		switch phase {
		case 0:
			v.HP = 0
		case 1:
			v.HP = 100
			v.Container = 901
		case 2:
			v.Container = 0
			e.state.Map.Tiles[17*64+15].Terrain = "cliff"
		}
		e.state.NavigationRevision++
		assertRasterCells(t, e, []int32{0, 350, 800})
	}
}
func TestNavigationRasterMaximumOpeningGrid(t *testing.T) {
	e, _ := exteriorMaximumFixture(t)
	assertRasterCells(t, e, []int32{0, 1, 200, 350, 600, 1400})
}
