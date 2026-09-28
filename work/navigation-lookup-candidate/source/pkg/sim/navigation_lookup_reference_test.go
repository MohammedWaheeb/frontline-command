package sim

// Exact preceding production implementations, retained independently for the
// lookup-only optimization. These are not alternate shipping algorithms.
func (e *Engine) referenceClearExceptLookup(pos Vec, radius int32, ignore, ignoredStructure ID, air, mobiles bool) bool {
	if pos.X-radius < 0 || pos.Y-radius < 0 || pos.X+radius >= e.state.Map.Width*1000 || pos.Y+radius >= e.state.Map.Height*1000 {
		return false
	}
	if !air {
		for y := (pos.Y - radius) / 1000; y <= (pos.Y+radius)/1000; y++ {
			for x := (pos.X - radius) / 1000; x <= (pos.X+radius)/1000; x++ {
				tile := e.state.Map.Tiles[y*e.state.Map.Width+x]
				if !tile.Passable() {
					cx, cy := clamp(pos.X, x*1000, (x+1)*1000), clamp(pos.Y, y*1000, (y+1)*1000)
					if dist2(pos, Vec{X: cx, Y: cy}) < int64(radius)*int64(radius) {
						return false
					}
				}
			}
		}
	}
	for _, v := range e.state.Entities {
		if v.ID == ignore || v.ID == ignoredStructure || v.HP <= 0 || v.Container != 0 {
			continue
		}
		if !v.Building && !mobiles {
			continue
		}
		if v.Building {
			if air {
				continue
			}
			width, height := e.footprint(v)
			dx := max(0, abs(pos.X-v.Position.X)-width*500)
			dy := max(0, abs(pos.Y-v.Position.Y)-height*500)
			if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(radius)*int64(radius) {
				return false
			}
		} else if mobiles {
			point, otherRadius, blocks := Vec{}, int32(0), false
			if air {
				if !e.isAircraft(v) || v.Landed {
					continue
				}
				point, otherRadius, blocks = v.Position, e.radius(v), true
			} else {
				point, otherRadius, blocks = e.referenceGroundObstacleLookup(v)
			}
			if !blocks {
				continue
			}
			r := radius + otherRadius
			if abs(pos.X-point.X) >= r || abs(pos.Y-point.Y) >= r {
				continue
			}
			if dist2(pos, point) < int64(r)*int64(r) {
				return false
			}
		}
	}
	return true
}

func (e *Engine) referenceGroundObstacleLookup(v *Entity) (Vec, int32, bool) {
	if v.Building || v.HP <= 0 || v.Container != 0 {
		return Vec{}, 0, false
	}
	if !e.isAircraft(v) {
		return v.Position, e.radius(v), true
	}
	if v.Landed {
		return v.Position, max(e.radius(v), serviceParkingRadius(v.Type)) + serviceParkingMargin, true
	}
	if v.Landing != nil {
		return v.Landing.Position, serviceParkingRadius(v.Type) + serviceParkingMargin, true
	}
	return Vec{}, 0, false
}
