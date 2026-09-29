package sim

// This pure geometry choice is shared by reservation allocation and atomic
// production placement. Return movement/touchdown use the persisted choice.
func (e *Engine) serviceLandingPosition(v, home *Entity) (Vec, bool) {
	if home == nil || !home.Building || home.Owner != v.Owner || home.HP <= 0 || !home.Complete {
		return Vec{}, false
	}
	obstacles := e.parkingObstacles(v, home)
	if v.Landing != nil && v.Landing.Home == home.ID && e.serviceParkingClear(v, home, v.Landing.Position, obstacles) {
		return v.Landing.Position, true
	}
	for _, point := range e.serviceCandidates(v, home) {
		e.parkingMetrics.Candidates++
		if e.serviceParkingClear(v, home, point, obstacles) {
			return point, true
		}
	}
	return home.Position, false
}

func (e *Engine) landingPoint(v, home *Entity) Vec {
	if v.Landing != nil && v.Landing.Home == home.ID {
		return v.Landing.Position
	}
	// Ordinary airborne holding/approach ignores ground geometry. This center
	// is never a touchdown candidate or a structure-collision exemption.
	return home.Position
}
