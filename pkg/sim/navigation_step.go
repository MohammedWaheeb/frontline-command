package sim

// Keep route preview and committed movement on the same integer speed rules.
func (e *Engine) navigationSpeed(v *Entity, speed int32, armor string) int32 {
	if e.state.Map.TileAt(v.Position).Cover() && !e.isAircraft(v) && armor != "infantry" {
		speed = speed * 80 / 100
	}
	if e.hasBuff(v, "disperse") || e.hasBuff(v, "recall") {
		speed = speed * 120 / 100
	}
	return speed
}

func navigationStepPosition(position, waypoint Vec, step int32) Vec {
	d := distance(position, waypoint)
	if d <= step {
		return waypoint
	}
	return Vec{X: position.X + int32(int64(waypoint.X-position.X)*int64(step)/int64(d)), Y: position.Y + int32(int64(waypoint.Y-position.Y)*int64(step)/int64(d))}
}
