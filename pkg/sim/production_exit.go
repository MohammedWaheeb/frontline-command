package sim

// Prefer an existing clear production point with a swept outward continuation.
// A point alone can be legal inside an enclosed producer pocket. This local
// preference is not a connected-component certificate: if every candidate lacks
// a clear continuation, retain the original first-clear fallback and exit limit.
// Air service parking and passenger exits keep their separate existing rules.
func (e *Engine) productionExitPosition(source *Entity, typ string, maxRadius int32) (Vec, bool) {
	u, ok := e.catalog.Unit(typ)
	if !ok {
		return Vec{}, false
	}
	if u.Armor == "air" {
		return e.exitPosition(source, typ, 0, maxRadius)
	}
	baseX, baseY := e.radius(source)+u.Radius+300, e.radius(source)+u.Radius+300
	if source.Building {
		width, height := e.footprint(source)
		baseX, baseY = width*500+u.Radius+300, height*500+u.Radius+300
	}
	var first Vec
	found := false
	for extra := int32(0); extra <= maxRadius; extra += 500 {
		for _, d := range neighbors {
			point := Vec{X: source.Position.X + d.X*(baseX+extra), Y: source.Position.Y + d.Y*(baseY+extra)}
			if e.distanceTo(source, point)-u.Radius > maxRadius || !e.clear(point, u.Radius, 0, false, true) {
				continue
			}
			if !found {
				first, found = point, true
			}
			probe := Entity{ID: e.state.NextID, Type: typ, Position: point}
			outward := Vec{X: point.X + d.X*1000, Y: point.Y + d.Y*1000}
			if e.navigationBridgeClear(&probe, outward, true) {
				return point, true
			}
		}
	}
	return first, found
}
