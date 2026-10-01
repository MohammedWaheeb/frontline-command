package sim

import "frontlinecommand/pkg/content"

// This value lives only for one synchronous connection enumeration. All
// endpoints and sub-grid elbows lie inside the ring-12 coordinate envelope.
// Shapes copy current geometry in entity order; nothing is stored on Engine.
type navigationConnectionGeometry struct {
	origin        Vec
	radius        int32
	width, height int32
	tiles         []content.Tile
	colliders     []navigationConnectionCollider
}

type navigationConnectionCollider struct {
	id                    ID
	position              Vec
	radius                int32
	halfWidth, halfHeight int32
	rectangle             bool
}

func (e *Engine) prepareNavigationConnectionGeometry(v *Entity, dynamic bool) navigationConnectionGeometry {
	q := navigationConnectionGeometry{
		origin: v.Position, radius: e.radius(v),
		width: e.state.Map.Width, height: e.state.Map.Height,
		tiles: e.state.Map.Tiles,
		colliders: make([]navigationConnectionCollider, 0, len(e.state.Entities)),
	}
	sx, sy := v.Position.X/500, v.Position.Y/500
	left := min(v.Position.X, (sx-12)*500) - q.radius
	top := min(v.Position.Y, (sy-12)*500) - q.radius
	right := max(v.Position.X, (sx+12)*500) + q.radius
	bottom := max(v.Position.Y, (sy+12)*500) + q.radius
	for _, other := range e.state.Entities {
		if other.ID == v.ID || other.HP <= 0 || other.Container != 0 {
			continue
		}
		shape := navigationConnectionCollider{id: other.ID, position: other.Position}
		if other.Building {
			w, h := e.footprint(other)
			shape.rectangle = true
			shape.halfWidth, shape.halfHeight = w*500, h*500
			if other.Position.X+shape.halfWidth < left || other.Position.X-shape.halfWidth > right || other.Position.Y+shape.halfHeight < top || other.Position.Y-shape.halfHeight > bottom {
				continue
			}
		} else {
			if !dynamic {
				continue
			}
			point, radius, blocks := e.groundObstacle(other)
			if !blocks {
				continue
			}
			shape.position, shape.radius = point, radius
			// A reservation can be far from the aircraft's real Position.
			// Filter its actual obstacle circle, including service clearance.
			if point.X+radius < left || point.X-radius > right || point.Y+radius < top || point.Y-radius > bottom {
				continue
			}
		}
		q.colliders = append(q.colliders, shape)
	}
	return q
}

// This is the ordinary ground clear predicate over the prepared current
// shapes. Height/sight flags retain their original Tile.Passable semantics.
func (q *navigationConnectionGeometry) clear(pos Vec) bool {
	radius := q.radius
	if pos.X-radius < 0 || pos.Y-radius < 0 || pos.X+radius >= q.width*1000 || pos.Y+radius >= q.height*1000 {
		return false
	}
	for y := (pos.Y - radius) / 1000; y <= (pos.Y+radius)/1000; y++ {
		for x := (pos.X - radius) / 1000; x <= (pos.X+radius)/1000; x++ {
			if !q.tiles[y*q.width+x].Passable() {
				cx, cy := clamp(pos.X, x*1000, (x+1)*1000), clamp(pos.Y, y*1000, (y+1)*1000)
				if dist2(pos, Vec{X: cx, Y: cy}) < int64(radius)*int64(radius) {
					return false
				}
			}
		}
	}
	for _, shape := range q.colliders {
		// clearExcept also ignores its zero ignoredStructure ID. The
		// swept predicate below keeps its existing ID-zero behavior.
		if shape.id == 0 {
			continue
		}
		if shape.rectangle {
			dx := max(0, abs(pos.X-shape.position.X)-shape.halfWidth)
			dy := max(0, abs(pos.Y-shape.position.Y)-shape.halfHeight)
			if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(radius)*int64(radius) {
				return false
			}
		} else {
			r := radius + shape.radius
			if abs(pos.X-shape.position.X) >= r || abs(pos.Y-shape.position.Y) >= r {
				continue
			}
			if dist2(pos, shape.position) < int64(r)*int64(r) {
				return false
			}
		}
	}
	return true
}

// Both endpoints and every swept obstacle use the canonical integer helpers.
// It is valid only inside this enumeration's ring-12 endpoint/elbow envelope.
func (q *navigationConnectionGeometry) bridgeClear(a, goal Vec) bool {
	r := q.radius
	if !q.clear(a) || !q.clear(goal) {
		return false
	}
	for y := (min(a.Y, goal.Y) - r) / 1000; y <= (max(a.Y, goal.Y)+r)/1000; y++ {
		for x := (min(a.X, goal.X) - r) / 1000; x <= (max(a.X, goal.X)+r)/1000; x++ {
			if !q.tiles[y*q.width+x].Passable() && !bridgeRectangleClear(a, goal, r, x*1000, y*1000, (x+1)*1000, (y+1)*1000) {
				return false
			}
		}
	}
	for _, shape := range q.colliders {
		if shape.rectangle {
			if !bridgeRectangleClear(a, goal, r, shape.position.X-shape.halfWidth, shape.position.Y-shape.halfHeight, shape.position.X+shape.halfWidth, shape.position.Y+shape.halfHeight) {
				return false
			}
		} else {
			sum := r + shape.radius
			point := shape.position
			if point.X < min(a.X, goal.X)-sum || point.X > max(a.X, goal.X)+sum || point.Y < min(a.Y, goal.Y)-sum || point.Y > max(a.Y, goal.Y)+sum {
				continue
			}
			if segmentPointDistance2(a, goal, point) < int64(sum)*int64(sum) {
				return false
			}
		}
	}
	return true
}

func (q *navigationConnectionGeometry) connection(goal Vec) (Vec, int32, bool) {
	if q.bridgeClear(q.origin, goal) {
		return q.origin, distance(q.origin, goal) * 2, true
	}
	for _, elbow := range [2]Vec{{X: goal.X, Y: q.origin.Y}, {X: q.origin.X, Y: goal.Y}} {
		if elbow.X%500 == 0 && elbow.Y%500 == 0 {
			continue
		}
		if !q.bridgeClear(q.origin, elbow) {
			continue
		}
		if q.bridgeClear(elbow, goal) {
			return elbow, (distance(q.origin, elbow) + distance(elbow, goal)) * 2, true
		}
	}
	return Vec{}, 0, false
}
