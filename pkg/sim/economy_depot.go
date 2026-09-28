package sim

import "sort"

// harvestDepotGoal preserves an existing usable approach, but searches another
// legal unloading side when the radial goal is occupied. It shares normal path
// search limits and persisted route state with every other movement order.
func (e *Engine) harvestDepotGoal(v, depot *Entity) Vec {
	radial := e.approachPoint(v, depot)
	if e.edgeDistance(v, depot) <= 1100 {
		return radial
	}
	inRange := func(point Vec) bool {
		probe := *v
		probe.Position = point
		return e.edgeDistance(&probe, depot) <= 1100
	}
	if len(v.Path) > 0 && v.RouteFailures == 0 && v.PathRevision == e.state.NavigationRevision && inRange(v.PathEnd) && e.clear(v.PathEnd, e.radius(v), v.ID, false, true) {
		return v.PathGoal
	}
	if v.RouteFailures == 0 && e.clear(radial, e.radius(v), v.ID, false, true) {
		return radial
	}
	if e.state.Tick < v.NextRouteAt && v.PathRevision == e.state.NavigationRevision {
		return v.PathGoal
	}
	if e.pathBudget == 0 {
		return radial
	}
	// Supply centers use a4x3 footprint; the bounded neighborhood includes all
	// grid approaches within1100 of that footprint for an800-radius hauler.
	// Candidate points still require exact terrain/footprint/mobile clearance.
	candidates := make([]Vec, 0, 32)
	for y := depot.Position.Y - 4000; y <= depot.Position.Y+4000; y += 500 {
		for x := depot.Position.X - 4000; x <= depot.Position.X+4000; x += 500 {
			point := Vec{X: x, Y: y}
			if inRange(point) && e.clear(point, e.radius(v), v.ID, false, true) {
				candidates = append(candidates, point)
			}
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return dist2(v.Position, candidates[i]) < dist2(v.Position, candidates[j])
	})
	if len(candidates) > 32 {
		candidates = candidates[:32]
	}
	for i, point := range candidates {
		if i == 3 || e.pathBudget == 0 {
			break
		}
		path := e.findPath(v, point, true)
		if len(path) == 0 || !inRange(path[len(path)-1]) {
			continue
		}
		v.Path = path
		v.PathGoal = point
		v.PathEnd = path[len(path)-1]
		v.PathResolved = true
		v.PathRevision = e.state.NavigationRevision
		v.NextRouteAt = 0
		return point
	}
	// A failed probe uses the same two-second retry boundary as ordinary
	// navigation. No derived timing state can drift across save or replay.
	v.Path = nil
	v.PathGoal = radial
	v.PathRevision = e.state.NavigationRevision
	v.NextRouteAt = e.state.Tick + seconds(2)
	e.blocked(v)
	return radial
}
