package sim

// A short bridge connects an actor's real sub-grid position to a clear A*
// node. Test the entire swept circle, so an escape never crosses an obstacle
// merely because its endpoints happen to be clear. All geometry is integer.
func segmentPointDistance2(a, b, p Vec) int64 {
	dx, dy := int64(b.X-a.X), int64(b.Y-a.Y)
	x, y := int64(p.X-a.X), int64(p.Y-a.Y)
	length := dx*dx + dy*dy
	dot := x*dx + y*dy
	if length == 0 || dot <= 0 {
		return dist2(a, p)
	}
	if dot >= length {
		return dist2(b, p)
	}
	cross := x*dy - y*dx
	return cross * cross / length
}

func bridgeSegmentsIntersect(a, b, c, d Vec) bool {
	if max(a.X, b.X) < min(c.X, d.X) || max(c.X, d.X) < min(a.X, b.X) || max(a.Y, b.Y) < min(c.Y, d.Y) || max(c.Y, d.Y) < min(a.Y, b.Y) {
		return false
	}
	cross := func(a, b, c Vec) int64 { return int64(b.X-a.X)*int64(c.Y-a.Y) - int64(b.Y-a.Y)*int64(c.X-a.X) }
	opposite := func(a, b int64) bool { return a <= 0 && b >= 0 || a >= 0 && b <= 0 }
	return opposite(cross(a, b, c), cross(a, b, d)) && opposite(cross(c, d, a), cross(c, d, b))
}

func bridgeRectangleClear(a, b Vec, radius int32, left, top, right, bottom int32) bool {
	r2 := int64(radius) * int64(radius)
	for _, p := range []Vec{a, b} {
		nearest := Vec{X: clamp(p.X, left, right), Y: clamp(p.Y, top, bottom)}
		if dist2(p, nearest) < r2 {
			return false
		}
	}
	corners := [4]Vec{{X: left, Y: top}, {X: right, Y: top}, {X: right, Y: bottom}, {X: left, Y: bottom}}
	for i, p := range corners {
		if segmentPointDistance2(a, b, p) < r2 || bridgeSegmentsIntersect(a, b, p, corners[(i+1)%4]) {
			return false
		}
	}
	return true
}

func (e *Engine) navigationBridgeClear(v *Entity, goal Vec, mobiles bool) bool {
	a, r := v.Position, e.radius(v)
	if !e.clear(a, r, v.ID, false, mobiles) || !e.clear(goal, r, v.ID, false, mobiles) {
		return false
	}
	for y := (min(a.Y, goal.Y) - r) / 1000; y <= (max(a.Y, goal.Y)+r)/1000; y++ {
		for x := (min(a.X, goal.X) - r) / 1000; x <= (max(a.X, goal.X)+r)/1000; x++ {
			if !e.state.Map.Tiles[y*e.state.Map.Width+x].Passable() && !bridgeRectangleClear(a, goal, r, x*1000, y*1000, (x+1)*1000, (y+1)*1000) {
				return false
			}
		}
	}
	for _, other := range e.state.Entities {
		if other.ID == v.ID || other.HP <= 0 || other.Container != 0 {
			continue
		}
		if other.Building {
			w, h := e.footprint(other)
			if !bridgeRectangleClear(a, goal, r, other.Position.X-w*500, other.Position.Y-h*500, other.Position.X+w*500, other.Position.Y+h*500) {
				return false
			}
		} else if mobiles && (!e.isAircraft(other) || other.Landed) {
			sum := int64(r + e.radius(other))
			if segmentPointDistance2(a, goal, other.Position) < sum*sum {
				return false
			}
		}
	}
	return true
}
