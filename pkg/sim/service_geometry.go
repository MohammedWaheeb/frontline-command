package sim

func (e *Engine) preferredLandingPoint(v, home *Entity) Vec {
	index := int32(0)
	for _, other := range e.state.Entities {
		if other.ID == v.ID {
			break
		}
		if other.Home == home.ID && other.Owner == v.Owner && other.HP > 0 {
			index++
		}
	}
	width, _ := e.footprint(home)
	spacing := max(int32(1300), e.radius(v)*2+100)
	columns := clamp(width*1000/spacing, 1, 3)
	rule, _ := e.buildingRule(home.Type)
	rows := (rule.ServiceSlots + columns - 1) / columns
	return Vec{X: home.Position.X + (2*(index%columns)-columns+1)*spacing/2, Y: home.Position.Y + (2*(index/columns)-rows+1)*spacing/2}
}

// A converted small air producer keeps the new roster's service reservations,
// but planes must find a physical pad in/on or within two tiles of that original
// foundation. Occupied/walled pads wait; capacity never permits ground overlap.
func (e *Engine) serviceLandingPosition(v, home *Entity) (Vec, bool) {
	if home == nil || !home.Building || home.Owner != v.Owner || home.HP <= 0 || !home.Complete {
		return Vec{}, false
	}
	radius := e.radius(v)
	legal := func(point Vec) bool {
		return e.distanceTo(home, point)-radius <= 2000 && e.clearExcept(point, radius, v.ID, home.ID, false, true)
	}
	preferred := e.preferredLandingPoint(v, home)
	if legal(preferred) {
		return preferred, true
	}
	if legal(home.Position) {
		return home.Position, true
	}
	// Stable ring order is shared by native/WASM and requires no slot randomness.
	for ring := int32(1300); ring <= 6500; ring += 1300 {
		for _, d := range neighbors {
			point := Vec{X: home.Position.X + d.X*ring, Y: home.Position.Y + d.Y*ring}
			if legal(point) {
				return point, true
			}
		}
	}
	return preferred, false
}
func (e *Engine) landingPoint(v, home *Entity) Vec {
	point, _ := e.serviceLandingPosition(v, home)
	return point
}
