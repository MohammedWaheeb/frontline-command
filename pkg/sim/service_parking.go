package sim

// These fixed operational clearances protect stationary service geometry.
// They never replace the catalog's combat/airborne collision radius.
const (
	serviceParkingMargin    int32 = 100
	serviceApproachRange    int32 = 8000
	serviceCandidateLimit         = 128
	serviceAllocationBudget       = 8
	serviceRetryTicks       Tick  = 20
)

type LandingReservation struct {
	Home     ID  `json:"home"`
	Position Vec `json:"position"`
}

type serviceParkingMetrics struct {
	Attempts       uint64
	Candidates     uint64
	ObstacleChecks uint64
	MaxAttempts    uint32
}

func serviceParkingRadius(typ string) int32 {
	switch typ {
	case "IR.fighter", "IR.gunship", "IR.shahed":
		return 1000
	case "IR.isr", "SA.fighter", "US.fighter":
		return 1200
	case "SA.strike", "US.strike":
		return 1300
	case "US.gunship":
		return 1500
	case "IR.strike", "SA.gunship", "US.airlift":
		return 1600
	case "SY.scout_drone":
		return 800
	}
	return 0
}

func (e *Engine) returningToService(v *Entity) bool {
	return v.HP > 0 && !v.Landed && e.isAircraft(v) && len(v.Orders) > 0 && v.Orders[0].Kind == "return"
}

func (e *Engine) serviceHome(v *Entity) *Entity {
	home := e.entity(v.Home)
	if home == nil || !home.Building || home.Owner != v.Owner || home.HP <= 0 || !home.Complete {
		return nil
	}
	b, ok := e.buildingRule(home.Type)
	if !ok || b.ServiceSlots == 0 {
		return nil
	}
	return home
}

func (e *Engine) parkingAttempt(v *Entity) bool {
	if e.parkingBudgetTick != e.state.Tick || !e.parkingBudgetStarted {
		e.parkingBudgetTick = e.state.Tick
		e.parkingBudgetStarted = true
		e.parkingRemaining = serviceAllocationBudget
	}
	if v.ParkingRetryAt > e.state.Tick || e.parkingRemaining == 0 {
		return false
	}
	e.parkingRemaining--
	e.parkingMetrics.Attempts++
	e.parkingMetrics.MaxAttempts = max(e.parkingMetrics.MaxAttempts, uint32(serviceAllocationBudget-e.parkingRemaining))
	v.ParkingRetryAt = e.state.Tick + serviceRetryTicks
	return true
}

// Pruning runs again at the final tick boundary after destruction, capture
// and mission actions. Newly obstructed reservations are released, never
// reallocated here, so every ordinary saved boundary remains restorable.
func (e *Engine) pruneServiceParking() {
	for _, v := range e.state.Entities {
		if v.Landing == nil {
			continue
		}
		home := e.serviceHome(v)
		if !e.returningToService(v) || e.defeated(v.Owner) || v.Landing.Home != v.Home || home == nil || !e.serviceParkingClear(v, home, v.Landing.Position, nil) {
			v.Landing = nil
			v.ParkingRetryAt = 0
		}
	}
}

// Existing capacity reservations are reconciled immediately before this
// explicit pre-movement stage. Entity order is stable global actor-ID order.
func (e *Engine) updateServiceParking() {
	// Earlier command/AI queries may have populated this tick's mobile raster.
	// New reservations must be visible to every subsequent ground route.
	e.dynamicNav = nil
	e.serviceNavReady = false
	e.pruneServiceParking()
	for _, v := range e.state.Entities {
		if !e.returningToService(v) || e.defeated(v.Owner) {
			continue
		}
		home := e.serviceHome(v)
		if home == nil {
			continue
		}
		if v.Landing != nil {
			continue
		}
		if e.distanceTo(home, v.Position) > serviceApproachRange || !e.parkingAttempt(v) {
			continue
		}
		if point, ok := e.serviceLandingPosition(v, home); ok {
			v.Landing = &LandingReservation{Home: home.ID, Position: point}
			v.ParkingRetryAt = 0
			v.Path = nil
			v.PathResolved = false
			v.NextRouteAt = 0
		} else {
			v.State = "landing_blocked"
		}
	}
}

// Ground obstacle geometry is deliberately separate from radius()/edgeDistance.
// Emergency grounded aircraft keep their area even after losing Home.
// Passive beacons retain their combat radius without obstructing locomotion.
func (e *Engine) groundObstacle(v *Entity) (Vec, int32, bool) {
	if v.Building || v.HP <= 0 || v.Container != 0 || v.Type == "IR.beacon" {
		return Vec{}, 0, false
	}
	// The catalog is immutable. Reuse this lookup for classification and
	// radius instead of copying the same definition twice per obstacle.
	u, ok := e.catalog.Unit(v.Type)
	if !ok || u.Armor != "air" {
		return v.Position, u.Radius, true
	}
	if v.Landed {
		return v.Position, max(u.Radius, serviceParkingRadius(v.Type)) + serviceParkingMargin, true
	}
	if v.Landing != nil {
		return v.Landing.Position, serviceParkingRadius(v.Type) + serviceParkingMargin, true
	}
	return Vec{}, 0, false
}

type parkingObstacle struct {
	id            ID
	position      Vec
	radius        int32
	width, height int32
}

func (e *Engine) parkingObstacles(v, home *Entity) []parkingObstacle {
	out := make([]parkingObstacle, 0, 32)
	for _, other := range e.state.Entities {
		if other.ID == v.ID || other.HP <= 0 || other.Container != 0 {
			continue
		}
		ob := parkingObstacle{id: other.ID, position: other.Position}
		if other.Building {
			ob.width, ob.height = e.footprint(other)
		} else {
			point, r, ok := e.groundObstacle(other)
			if !ok {
				continue
			}
			ob.position, ob.radius = point, r
			if e.isAircraft(other) {
				ob.radius -= serviceParkingMargin
			}
		}
		// Every candidate is within the retained foundation plus2600.
		// Include the maximum catalog rectangle's half-size conservatively.
		if abs(ob.position.X-home.Position.X) <= 16000 && abs(ob.position.Y-home.Position.Y) <= 16000 {
			out = append(out, ob)
		}
	}
	return out
}

func (e *Engine) serviceParkingClear(v, home *Entity, point Vec, obstacles []parkingObstacle) bool {
	r := serviceParkingRadius(v.Type)
	if r == 0 || home == nil || e.distanceTo(home, point)-e.radius(v) > 2000 {
		return false
	}
	m := e.state.Map
	if point.X-r < 0 || point.Y-r < 0 || point.X+r >= m.Width*1000 || point.Y+r >= m.Height*1000 {
		return false
	}
	for y := (point.Y - r) / 1000; y <= (point.Y+r)/1000; y++ {
		for x := (point.X - r) / 1000; x <= (point.X+r)/1000; x++ {
			if !m.Tiles[y*m.Width+x].Passable() {
				closest := Vec{X: clamp(point.X, x*1000, (x+1)*1000), Y: clamp(point.Y, y*1000, (y+1)*1000)}
				if dist2(point, closest) < int64(r)*int64(r) {
					return false
				}
			}
		}
	}
	if obstacles == nil {
		obstacles = e.parkingObstacles(v, home)
	}
	for _, o := range obstacles {
		e.parkingMetrics.ObstacleChecks++
		dx, dy := abs(point.X-o.position.X), abs(point.Y-o.position.Y)
		radius := r + o.radius + serviceParkingMargin
		if o.width > 0 {
			dx = max(0, dx-o.width*500)
			dy = max(0, dy-o.height*500)
			radius = r + serviceParkingMargin
		}
		if dx >= radius || dy >= radius {
			continue
		}
		if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(radius)*int64(radius) {
			return false
		}
	}
	return true
}

func (e *Engine) serviceCandidates(v, home *Entity) []Vec {
	w, h := e.footprint(home)
	hw, hh := w*500, h*500
	out := make([]Vec, 0, serviceCandidateLimit)
	appendPoint := func(x, y int32) {
		if len(out) >= serviceCandidateLimit {
			return
		}
		p := Vec{X: home.Position.X + x, Y: home.Position.Y + y}
		for _, old := range out {
			if old == p {
				return
			}
		}
		out = append(out, p)
	}
	// Six proven open-ground pads also fit six largest craft around3x3.
	for _, y := range []int32{-hh - 1700, hh + 1700} {
		for _, x := range []int32{-3300, 0, 3300} {
			appendPoint(x, y)
		}
	}
	r := serviceParkingRadius(v.Type)
	// Interleave every radius and side at each coarse-to-fine coordinate.
	// Nine fixed fractions cover each entire side; no late ring/side can be
	// silently truncated by a long earlier perimeter. At most114 raw points.
	for _, fraction := range []int32{0, -4, 4, -2, 2, -1, 1, -3, 3} {
		for _, offset := range []int32{r + 100, r + 600, 2600} {
			if offset > 2600 {
				continue
			}
			extentX, extentY := hw+1500, hh+1500
			if offset == 2600 {
				extentX, extentY = hw, hh
			}
			x := (fraction * extentX / 4) / 500 * 500
			y := (fraction * extentY / 4) / 500 * 500
			appendPoint(x, -hh-offset)
			appendPoint(x, hh+offset)
			appendPoint(-hw-offset, y)
			appendPoint(hw+offset, y)
		}
	}
	return out
}
