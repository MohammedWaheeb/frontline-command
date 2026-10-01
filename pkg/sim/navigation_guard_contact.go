package sim

// A protected ground ally can be wider than the ordinary one tile center
// follow distance. Allow the existing 120 waypoint gap outside both bodies;
// aiming inside the ally otherwise causes repeated safe routes away from it.
// The anchor, combat override and all actual collision checks remain unchanged.
func (e *Engine) guardFollowDistance(v *Entity, o Order) int32 {
	const ordinary int32 = 1000
	if o.Kind != "guard" && o.Kind != "escort" || o.Target == 0 || v.Building || v.HP <= 0 || v.Container != 0 || e.isAircraft(v) {
		return ordinary
	}
	ally := e.entity(o.Target)
	if ally == nil || ally.ID == v.ID || ally.HP <= 0 || ally.Container != 0 || ally.Building || !e.allied(v.Owner, ally.Owner) || e.isAircraft(ally) || v.Anchor != ally.Position {
		return ordinary
	}
	point, radius, blocks := e.groundObstacle(ally)
	combined := e.radius(v) + radius
	if !blocks || point != ally.Position || combined <= ordinary || dist2(v.Position, point) < int64(combined)*int64(combined) {
		// A real overlap cannot acquire a new escape or arrival allowance.
		return ordinary
	}
	return combined + 120
}
