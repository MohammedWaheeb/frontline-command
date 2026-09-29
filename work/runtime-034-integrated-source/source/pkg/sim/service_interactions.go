package sim

// Boarding uses the grounded aircraft's operational body, while weapon ranges
// and airborne contact retain the catalog combat radius. The parking margin is
// collision clearance, not an additional interaction range.
func (e *Engine) boardingRadiusExtra(target *Entity) int32 {
	if target == nil || !target.Landed || !e.isAircraft(target) {
		return 0
	}
	return max(int32(0), serviceParkingRadius(target.Type)-e.radius(target))
}

func (e *Engine) boardingDistance(passenger, target *Entity) int32 {
	return max(int32(0), e.edgeDistance(passenger, target)-e.boardingRadiusExtra(target))
}

func (e *Engine) boardingApproachPoint(passenger, target *Entity) Vec {
	extra := e.boardingRadiusExtra(target)
	if extra == 0 {
		return e.approachPoint(passenger, target)
	}
	dx, dy := passenger.Position.X-target.Position.X, passenger.Position.Y-target.Position.Y
	if dx == 0 && dy == 0 {
		dx = 1000
	}
	length := max(1, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy)))
	r := e.radius(target) + extra + e.radius(passenger) + 500
	return Vec{X: target.Position.X + int32(int64(dx)*int64(r)/int64(length)), Y: target.Position.Y + int32(int64(dy)*int64(r)/int64(length))}
}
