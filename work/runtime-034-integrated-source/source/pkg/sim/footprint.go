package sim

// Operating type can change after capture; a structure never enlarges or moves
// its existing physical foundation. These dimensions are authoritative for all
// collision, entrance, combat-distance, exit and service-pad calculations.
func (e *Engine) footprint(v *Entity) (int32, int32) {
	if v == nil || !v.Building {
		return 0, 0
	}
	return v.FootprintWidth, v.FootprintHeight
}
func (e *Engine) validRetainedFootprint(typ, original string, width, height int32) bool {
	physical, ok := e.buildingRule(original)
	if !ok || width != physical.Width || height != physical.Height || width <= 0 || height <= 0 {
		return false
	}
	current, ok := e.buildingRule(typ)
	if !ok {
		return false
	}
	if typ == original {
		return true
	}
	return physical.ServiceSlots > 0 && current.ServiceSlots > 0 || physical.Role == "safehouse" && current.Role == "outpost"
}
