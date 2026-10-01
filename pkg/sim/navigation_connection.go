package sim

// A physically legal passage can contain no half-tile row at all. If the
// original adjacent seeds all fail, connect to the first usable ring through
// at most one sub-grid elbow. Both swept circles use ordinary collision rules;
// no blocker is removed or enlarged, and failed connections remain unreachable.
func (e *Engine) offGridNavigationStarts(v *Entity, gx, gy int32, dynamic bool, passable func(Vec) bool) ([]pathNode, map[int32]Vec) {
	return e.navigationConnectionStarts(v, gx, gy, dynamic, passable, 2, false)
}

// After the original seeded search fails, an adjacent clear node can still be
// isolated by its grid corner gates. Collect every swept-clear local connection
// within the same bounded radius, so an isolated inner ring cannot hide an exit.
func (e *Engine) navigationConnectionStarts(v *Entity, gx, gy int32, dynamic bool, passable func(Vec) bool, firstRing int32, allRings bool) ([]pathNode, map[int32]Vec) {
	// Every direct or first-elbow bridge requires this same current origin.
	// Reject it once; clear origins retain every endpoint and the full sweep.
	if !e.clear(v.Position, e.radius(v), v.ID, false, dynamic) {
		return nil, nil
	}
	geometry := e.prepareNavigationConnectionGeometry(v, dynamic)
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
				elbow, cost, ok := geometry.connection(p)
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

func (e *Engine) offGridNavigationConnection(v *Entity, goal Vec, dynamic bool) (Vec, int32, bool) {
	if e.navigationBridgeClear(v, goal, dynamic) {
		return v.Position, distance(v.Position, goal) * 2, true
	}
	for _, elbow := range [2]Vec{{X: goal.X, Y: v.Position.Y}, {X: v.Position.X, Y: goal.Y}} {
		// A grid-aligned elbow is itself a direct seed on this or an earlier
		// ring. Keep bends sub-grid so movement reaches them exactly.
		if elbow.X%500 == 0 && elbow.Y%500 == 0 {
			continue
		}
		if !e.navigationBridgeClear(v, elbow, dynamic) {
			continue
		}
		bridge := *v
		bridge.Position = elbow
		if e.navigationBridgeClear(&bridge, goal, dynamic) {
			return elbow, (distance(v.Position, elbow) + distance(elbow, goal)) * 2, true
		}
	}
	return Vec{}, 0, false
}
