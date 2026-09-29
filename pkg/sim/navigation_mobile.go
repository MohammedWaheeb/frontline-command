package sim

// Many blocked units may replan on one tick. Rasterize nearby mobile occupancy
// once per movement clearance instead of scanning the whole army at every A*
// neighbor. Actual movement still checks current positions before committing.
func (e *Engine) mobileObstacleCells(radius int32) []ID {
	if e.dynamicNav == nil || e.dynamicNavTick != e.state.Tick {
		e.dynamicNav = map[int32][]ID{}
		e.dynamicNavTick = e.state.Tick
	}
	if cells, ok := e.dynamicNav[radius]; ok {
		return cells
	}
	w, h := e.state.Map.Width*2, e.state.Map.Height*2
	cells := make([]ID, int(w*h))
	for _, v := range e.state.Entities {
		point, otherRadius, blocks := e.groundObstacle(v)
		if !blocks {
			continue
		}
		r := radius + otherRadius
		for y := max(int32(0), (point.Y-r)/500); y <= min(h-1, (point.Y+r)/500); y++ {
			for x := max(int32(0), (point.X-r)/500); x <= min(w-1, (point.X+r)/500); x++ {
				if dist2(point, Vec{X: x * 500, Y: y * 500}) >= int64(r)*int64(r) {
					continue
				}
				index := y*w + x
				if cells[index] == 0 {
					cells[index] = v.ID
				} else {
					cells[index] = ^ID(0)
				}
			}
		}
	}
	e.dynamicNav[radius] = cells
	return cells
}
