package sim

// direction returns millidegrees clockwise from east using integer arithmetic.
// The rational atan approximation is within a degree, without runtime floats.
func direction(dx, dy int32) int32 {
	if dx == 0 && dy == 0 {
		return 0
	}
	ax, ay := int64(abs(dx)), int64(abs(dy))
	var angle int64
	if ax >= ay {
		r := ay * 1000 / max(int64(1), ax)
		angle = r * (45000 + 15664*(1000-r)/1000) / 1000
	} else {
		r := ax * 1000 / max(int64(1), ay)
		angle = 90000 - r*(45000+15664*(1000-r)/1000)/1000
	}
	if dx < 0 {
		angle = 180000 - angle
	}
	if dy < 0 {
		angle = 360000 - angle
	}
	return int32(angle % 360000)
}
func angleDifference(from, to int32) int32 { d := (to-from+540000)%360000 - 180000; return d }
func turn(from, to, limit int32) int32 {
	d := angleDifference(from, to)
	return (from + clamp(d, -limit, limit) + 360000) % 360000
}

// Bhaskara's sine approximation, scaled to one million. Angles and results
// remain integral on native and WASM targets; no platform trigonometry enters
// authoritative movement.
func sine(angle int32) int64 {
	a := (angle%360000 + 360000) % 360000
	sign := int64(1)
	if a > 180000 {
		a -= 180000
		sign = -1
	}
	x := int64(a)
	product := x * (180000 - x)
	return sign * 4 * product * 1000000 / (40500000000 - product)
}
func advanceHeading(pos Vec, angle, amount int32) Vec {
	x, y := sine(angle+90000), sine(angle)
	length := int64(isqrt(x*x + y*y))
	return Vec{X: pos.X + int32(x*int64(amount)/max(int64(1), length)), Y: pos.Y + int32(y*int64(amount)/max(int64(1), length))}
}
