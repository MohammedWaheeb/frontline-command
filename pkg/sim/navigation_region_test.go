package sim

import (
	"reflect"
	"testing"
)

// Regression gate for the 2026-11-08 skirmish freeze: routes toward goals in a
// sealed pocket used to run three full A* searches to the 32,768-expansion cap
// and retry every two seconds, which froze late 4-player games in the browser.
// See work/perf-freeze-2026-11-08/.

// sealedPocketEngine returns a fixture with a walled pocket (no openings) and
// a few wall segments that force detours, plus one rifle squad outside it.
func sealedPocketEngine(t testing.TB) (*Engine, *Entity, Vec) {
	t.Helper()
	e := fixture(t)
	w := e.state.Map.Width
	block := func(x, y int32) { e.state.Map.Tiles[y*w+x].Terrain = "blocked" }
	for i := int32(36); i <= 46; i++ { // closed ring around tiles 37..45
		block(i, 36)
		block(i, 46)
		block(36, i)
		block(46, i)
	}
	for i := int32(10); i <= 30; i++ { // detour walls
		block(24, i)
		block(i, 32)
	}
	e.state.NavigationRevision++
	unit := e.spawn("US.rifle", 1, Vec{X: 16000, Y: 20000}, true, 0)
	return e, unit, Vec{X: 41000, Y: 41000}
}

func TestSealedPocketRouteIsRejectedWithoutSearchWork(t *testing.T) {
	e, unit, pocket := sealedPocketEngine(t)
	e.pathBudget = 12
	before := e.navExpansions
	if path := e.findPath(unit, pocket, false); path != nil {
		t.Fatalf("route into a sealed pocket must fail, got %d waypoints", len(path))
	}
	if work := e.navExpansions - before; work != 0 {
		t.Fatalf("unreachable goal expanded %d A* nodes; the static-region reject must make it free", work)
	}
	rejectedBudget := e.pathBudget

	// The same request without the reject is the original pathology: every
	// search exhausts its cap. Budget accounting must be identical.
	e.navNoRegionReject = true
	e.pathBudget = 12
	before = e.navExpansions
	if path := e.findPath(unit, pocket, false); path != nil {
		t.Fatalf("route into a sealed pocket must fail without the reject too")
	}
	if work := e.navExpansions - before; work < 32768 {
		t.Fatalf("expected the unreachable search to hit the expansion cap without the reject, got %d", work)
	}
	if e.pathBudget != rejectedBudget {
		t.Fatalf("region reject changed budget accounting: %d searches left with reject, %d without", rejectedBudget, e.pathBudget)
	}
}

func TestRegionRejectKeepsEveryRouteAndBudgetIdentical(t *testing.T) {
	e, unit, _ := sealedPocketEngine(t)
	// Moving obstacles exercise the dynamic search too.
	e.spawn("US.rifle", 1, Vec{X: 22000, Y: 20000}, true, 0)
	e.spawn("IR.tank", 2, Vec{X: 30000, Y: 36000}, true, 0)
	starts := []Vec{{X: 16000, Y: 20000}, {X: 5000, Y: 60000}, {X: 30000, Y: 12000}, {X: 41000, Y: 41000}}
	goals := []Vec{{X: 41000, Y: 41000}, {X: 60000, Y: 5000}, {X: 28000, Y: 28000}, {X: 12000, Y: 50000}, {X: 36500, Y: 36500}}
	origin := unit.Position
	defer func() { unit.Position = origin }()
	for _, start := range starts {
		for _, goal := range goals {
			for _, dynamic := range []bool{false, true} {
				unit.Position = start
				e.navNoRegionReject = false
				budgetWith := uint32(12)
				with := e.findNavigationRouteWithBuildContact(unit, goal, dynamic, nil, &budgetWith)
				e.navNoRegionReject = true
				budgetWithout := uint32(12)
				without := e.findNavigationRouteWithBuildContact(unit, goal, dynamic, nil, &budgetWithout)
				e.navNoRegionReject = false
				if !reflect.DeepEqual(with, without) {
					t.Fatalf("start %v goal %v dynamic=%v: region reject changed the route\nwith:    %v\nwithout: %v", start, goal, dynamic, with, without)
				}
				if budgetWith != budgetWithout {
					t.Fatalf("start %v goal %v dynamic=%v: budget %d with reject, %d without", start, goal, dynamic, budgetWith, budgetWithout)
				}
			}
		}
	}
}

func TestRegionLabelsFollowTheStaticCellCache(t *testing.T) {
	e, unit, _ := sealedPocketEngine(t)
	r := e.radius(unit)
	cells := e.navigationCells(r)
	labels := e.navigationComponents(r, cells)
	inside := labels[(41000/500)*(e.state.Map.Width*2)+41000/500]
	outside := labels[(unit.Position.Y/500)*(e.state.Map.Width*2)+unit.Position.X/500]
	if inside == 0 || outside == 0 || inside == outside {
		t.Fatalf("pocket and open field must be distinct regions, got inside=%d outside=%d", inside, outside)
	}
	if again := e.navigationComponents(r, e.navigationCells(r)); &again[0] != &labels[0] {
		t.Fatal("labels must be reused while the static cells are unchanged")
	}
	// Any rebuild of the static cells (revision bump, or a direct navCache
	// reset such as mission setup) must rebuild the labels.
	e.navCache = nil
	if rebuilt := e.navigationComponents(r, e.navigationCells(r)); &rebuilt[0] == &labels[0] {
		t.Fatal("labels survived a static cell rebuild")
	}
	// Open the pocket: the regions must merge after the revision bump.
	e.state.Map.Tiles[36*e.state.Map.Width+41].Terrain = "open"
	e.state.Map.Tiles[36*e.state.Map.Width+42].Terrain = "open"
	e.state.NavigationRevision++
	merged := e.navigationComponents(r, e.navigationCells(r))
	if merged[(41000/500)*(e.state.Map.Width*2)+41000/500] != merged[(unit.Position.Y/500)*(e.state.Map.Width*2)+unit.Position.X/500] {
		t.Fatal("opening the pocket must merge its region with the field")
	}
}
