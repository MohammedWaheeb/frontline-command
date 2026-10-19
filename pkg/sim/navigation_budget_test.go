package sim

import "testing"

// A step-blocked ground unit gets one immediate dynamic retry, then a
// one-second replan backoff. A second consecutive blocked step inside the
// backoff window must not burn another path-budget A*: in a choke jam the
// first units in entity order would otherwise replan every tick and starve
// every later route request.
func TestNavigationStepBlockedReplanBackoff(t *testing.T) {
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

	// Tick 1: unsafe cached step is rejected, one charged dynamic retry is
	// stored, and the one-second backoff is armed.
	e.Advance()
	if e.pathBudget != 11 || len(actor.Path) == 0 || actor.Path[0] == oldFirst {
		t.Fatal("first blocked step did not store one charged retry", e.pathBudget, actor.Path)
	}
	if actor.NextRouteAt != e.state.Tick+seconds(1) {
		t.Fatal("retry did not arm the replan backoff", actor.NextRouteAt, e.state.Tick)
	}

	// Tick 2: force the same unsafe step again. Inside the backoff window
	// the blocked step must clear the path and wait, consuming no budget.
	actor.Path = []Vec{oldFirst, goal}
	actor.PathGoal, actor.PathEnd = goal, goal
	actor.PathRevision, actor.PathResolved = e.state.NavigationRevision, true
	e.Advance()
	if actor.Position != start || len(actor.Path) != 0 {
		t.Fatal("second blocked step moved or kept its unsafe path", actor.Position, actor.Path)
	}
	if e.pathBudget != 12 {
		t.Fatal("blocked step inside backoff window burned path budget", e.pathBudget)
	}
	if actor.NextRouteAt != 1+seconds(1) {
		t.Fatal("backoff window moved before it expired", actor.NextRouteAt)
	}

	// The wait is bounded: once the window expires the unit replans and
	// leaves through the ordinary dynamic exit.
	for e.Tick() < 60 && actor.Position == start {
		e.Advance()
	}
	if actor.Position == start {
		t.Fatal("unit never replanned after the backoff expired")
	}
}
