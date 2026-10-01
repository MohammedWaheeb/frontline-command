package sim

// Ordinary Move keeps its legal click after the final half-tile grid node.
// A relocated blocked goal stays relocated; a clear endpoint alone cannot
// justify a tail across an obstacle. Actual rounded steps remain authoritative.
func (e *Engine) appendLegalMoveGoal(v *Entity, path []Vec, goal Vec) []Vec {
	if len(path) == 0 {
		return path
	}
	end := path[len(path)-1]
	if end == goal || end.X/500 != goal.X/500 || end.Y/500 != goal.Y/500 {
		return path
	}
	probe := *v
	probe.Position = end
	if e.navigationBridgeClear(&probe, goal, true) {
		return append(path, goal)
	}
	return path
}
