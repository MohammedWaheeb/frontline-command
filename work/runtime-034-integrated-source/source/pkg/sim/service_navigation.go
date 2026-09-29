package sim

// Per-tick derived navigation geometry. It never changes save/hash state and
// contains only real grounded or final-approach reserved service circles.
type serviceNavCircle struct {
	position Vec
	radius   int32
}

func (e *Engine) serviceCircles() []serviceNavCircle {
	if e.serviceNavReady && e.serviceNavTick == e.state.Tick {
		return e.serviceNavCircles
	}
	e.serviceNavTick, e.serviceNavReady = e.state.Tick, true
	e.serviceNavCircles = e.serviceNavCircles[:0]
	e.serviceNavEdges = nil
	for _, v := range e.state.Entities {
		if !e.isAircraft(v) {
			continue
		}
		if point, r, ok := e.groundObstacle(v); ok {
			e.serviceNavCircles = append(e.serviceNavCircles, serviceNavCircle{point, r})
		}
	}
	return e.serviceNavCircles
}

func (e *Engine) serviceSegmentClear(a, b Vec, radius int32) bool {
	for _, circle := range e.serviceCircles() {
		r := circle.radius + radius
		if circle.position.X <= min(a.X, b.X)-r || circle.position.X >= max(a.X, b.X)+r || circle.position.Y <= min(a.Y, b.Y)-r || circle.position.Y >= max(a.Y, b.Y)+r {
			continue
		}
		if segmentPointDistance2(a, b, circle.position) < int64(r)*int64(r) {
			return false
		}
	}
	return true
}

// Cache exact circle crossings for each A* edge. No inflated planning radius:
// a legal narrow passage remains legal. At most8edge bits per500mt grid node;
// only the bounded neighborhoods of service circles require geometry work.
func (e *Engine) serviceObstacleEdges(radius int32) []uint8 {
	circles := e.serviceCircles()
	if len(circles) == 0 {
		return nil
	}
	if e.serviceNavEdges == nil {
		e.serviceNavEdges = map[int32][]uint8{}
	}
	if cached, ok := e.serviceNavEdges[radius]; ok {
		return cached
	}
	w, h := e.state.Map.Width*2, e.state.Map.Height*2
	edges := make([]uint8, w*h)
	for _, circle := range circles {
		r := radius + circle.radius
		for y := max(int32(0), (circle.position.Y-r-500)/500); y <= min(h-1, (circle.position.Y+r+500)/500); y++ {
			for x := max(int32(0), (circle.position.X-r-500)/500); x <= min(w-1, (circle.position.X+r+500)/500); x++ {
				a := Vec{X: x * 500, Y: y * 500}
				for edge, d := range neighbors {
					b := Vec{X: a.X + d.X*500, Y: a.Y + d.Y*500}
					if segmentPointDistance2(a, b, circle.position) < int64(r)*int64(r) {
						edges[y*w+x] |= 1 << edge
					}
				}
			}
		}
	}
	e.serviceNavEdges[radius] = edges
	return edges
}
