package sim

import "testing"

// One findPath request can run several actual A* searches (coarse-restricted,
// full, connection retry, plus the static-to-dynamic retry). The per-tick
// path budget must charge each search it actually runs, otherwise twelve
// requests can silently burn several dozen searches in one tick.
func TestNavigationBudgetChargesPerActualSearch(t *testing.T) {
	e, actor, _ := physicalStallNavigationFixture(t)
	goal := Vec{X: 30500, Y: 57050}

	// A plain open-ground route succeeds on its first search and charges one.
	open := fixture(t)
	rifle := open.spawn("US.rifle", 1, Vec{X: 18000, Y: 18000}, true, 0)
	open.pathBudget = 12
	if path := open.findPath(rifle, Vec{X: 30000, Y: 30000}, true); len(path) == 0 {
		t.Fatal("open route missing")
	}
	if used := 12 - open.pathBudget; used != 1 {
		t.Fatal("single-search route must charge exactly one", used)
	}

	// The static route's first step is unsafe in this fixture, so findPath
	// runs a second (dynamic) route search. That retry is real work and
	// must be charged as a second search, not hidden inside the first.
	e.pathBudget = 12
	path := e.findPath(actor, goal, false)
	if len(path) == 0 {
		t.Fatal("static request lost its dynamic retry route")
	}
	if used := 12 - e.pathBudget; used < 2 {
		t.Fatal("multi-search request charged as one search", used)
	}

	// With only one search left in the tick, the same request cannot also
	// afford its retry: it returns no route instead of overrunning budget.
	e.pathBudget = 1
	if path := e.findPath(actor, goal, false); len(path) != 0 {
		t.Fatal("request overran a one-search budget", path)
	}
	if e.pathBudget != 0 {
		t.Fatal("one-search budget not consumed by the attempted search", e.pathBudget)
	}
}

// Depot routing may probe alternate unloading sides, but the whole probe
// stays inside a three-search share of the tick budget per hauler.
func TestNavigationDepotProbeChargesActualSearches(t *testing.T) {
	e, v, depot := depotApproachFixture(t)
	e.pathBudget = 12
	e.harvestDepotGoal(v, depot)
	if used := 12 - e.pathBudget; used == 0 || used > 3 {
		t.Fatal("depot probe exceeded its three-search share", used)
	}
	// The rest of the tick budget remains available to other units.
	if e.pathBudget < 9 {
		t.Fatal("depot probe starved the remaining tick budget", e.pathBudget)
	}
}
