package sim

// Rotorcraft and aircraft returning to a pad use short deterministic detours
// around other airborne bodies. Direct paths alone deadlock opposing traffic.
// This changes only navigation: no overlap, teleport or landing reservation is
// granted, and ground terrain/buildings continue to be ignored in flight.
func (e *Engine) airDetour(v *Entity, goal Vec) bool {
	if len(v.Path) > 8 {
		return false
	}
	radius := e.radius(v)
	heading := direction(goal.X-v.Position.X, goal.Y-v.Position.Y)
	for _, offset := range []int32{90000, -90000, 45000, -45000, 135000, -135000} {
		candidate := advanceHeading(v.Position, heading+offset, max(int32(1800), radius*3))
		if !e.clear(candidate, radius, v.ID, true, true) {
			continue
		}
		legal := true
		for _, other := range e.state.Entities {
			if other.ID == v.ID || other.HP <= 0 || other.Container != 0 || !e.isAircraft(other) || other.Landed {
				continue
			}
			combined := int64(radius + e.radius(other))
			if segmentPointDistance2(v.Position, candidate, other.Position) < combined*combined {
				legal = false
				break
			}
		}
		if !legal {
			continue
		}
		v.Path = append([]Vec{candidate}, v.Path...)
		v.LastProgress = e.Tick()
		v.State = "avoiding"
		return true
	}
	return false
}
