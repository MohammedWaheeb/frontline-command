package sim

func (e *Engine) fixedWing(v *Entity) bool {
	role := e.role(v)
	return role == "fighter" || role == "strike"
}

// Fixed-wing attacks cross a fixed pass waypoint beyond the last visible
// target. They continue flying through windup and cooldown instead of hovering.
func (e *Engine) flyPass(v *Entity) {
	u, _ := e.catalog.Unit(v.Type)
	o := Order{}
	if len(v.Orders) > 0 {
		o = v.Orders[0]
	}
	target := e.entity(v.Target)
	if o.Kind == "attack" {
		target = e.entity(o.Target)
	}
	if target != nil && (!e.canSeeEntity(v.Owner, target) || !e.canAttack(v, target)) {
		target = nil
	}
	if v.PassUntil <= e.state.Tick || distance(v.Position, v.FlightPass) < 1000 {
		if target != nil && o.Kind != "move" {
			v.LastTarget = target.Position
			angle := direction(target.Position.X-v.Position.X, target.Position.Y-v.Position.Y)
			v.FlightPass = advanceHeading(target.Position, angle, 8000)
			v.PassUntil = e.state.Tick + seconds(5)
		} else if o.Kind == "move" || o.Kind == "attack_move" || o.Kind == "attack" {
			v.FlightPass = o.Position
			if o.Kind == "attack" {
				v.FlightPass = v.LastTarget
			}
			v.PassUntil = e.state.Tick + seconds(2)
			if distance(v.Position, v.FlightPass) < 1500 {
				v.Orders = v.Orders[1:]
				v.Anchor = v.Position
				v.PassUntil = 0
			}
		} else {
			// A small holding circuit also keeps idle interceptors moving.
			v.FlightPass = advanceHeading(v.Anchor, v.Facing+90000, 3000)
			v.PassUntil = e.state.Tick + seconds(2)
		}
		v.FlightPass.X = clamp(v.FlightPass.X, 1500, e.state.Map.Width*1000-1500)
		v.FlightPass.Y = clamp(v.FlightPass.Y, 1500, e.state.Map.Height*1000-1500)
	}
	desired := direction(v.FlightPass.X-v.Position.X, v.FlightPass.Y-v.Position.Y)
	v.Facing = turn(v.Facing, desired, 9000)
	step := (u.Speed + v.MoveRemainder) / 20
	v.MoveRemainder = (u.Speed + v.MoveRemainder) % 20
	next := advanceHeading(v.Position, v.Facing, step)
	if e.clear(next, u.Radius, v.ID, true, true) {
		v.Position = next
		v.LastProgress = e.state.Tick
		v.State = "flying"
	} else {
		// Separation changes the route, never permits an aircraft overlap.
		v.FlightPass = advanceHeading(v.Position, v.Facing+90000, 2500)
		v.PassUntil = e.state.Tick + seconds(1)
	}
}

func (e *Engine) landingPoint(v, home *Entity) Vec {
	index := int32(0)
	for _, other := range e.state.Entities {
		if other.ID == v.ID {
			break
		}
		if other.Home == home.ID && other.HP > 0 {
			index++
		}
	}
	b, _ := e.catalog.Building(home.Type)
	cols := min(int32(3), b.Width/2)
	if cols < 1 {
		cols = 1
	}
	x := index % cols
	y := index / cols
	return Vec{X: home.Position.X + (2*x-cols+1)*650, Y: home.Position.Y + (2*y-1)*650}
}
func (e *Engine) serviceRequired(v *Entity) uint32 {
	u, _ := e.catalog.Unit(v.Type)
	sec := uint32(18)
	switch u.Role {
	case "fighter":
		sec = 20
	case "strike", "gunship":
		sec = 24
	}
	base := sec * 20 * 2
	required := base
	p := e.player(v.Owner)
	if p.Faction == "US" {
		required = required * 80 / 100
	}
	if p.Faction == "IR" && p.HasUpgrade("IR.drone_servicing") {
		required = required * 85 / 100
	}
	return max(base/2, required)
}
func (e *Engine) updateAircraft() {
	for _, v := range e.state.Entities {
		if e.role(v) == "support_plane" {
			continue
		}
		if v.HP <= 0 || !e.isAircraft(v) || e.defeated(v.Owner) {
			continue
		}
		if v.EmergencyTakeoffUntil > 0 {
			if e.state.Tick < v.EmergencyTakeoffUntil {
				continue
			}
			v.EmergencyTakeoffUntil = 0
			v.Landed = false
			v.State = "taking_off"
		}
		home := e.entity(v.Home)
		if home == nil || home.HP <= 0 || home.Owner != v.Owner || !home.Complete {
			hadHome := v.Home != 0
			v.Home = 0
			v.Endurance = min(v.Endurance, uint32(1200))
			if v.Landed {
				v.EmergencyTakeoffUntil = e.state.Tick + seconds(2)
				v.ServiceWork = 0
				v.State = "emergency_takeoff"
			}
			if id := e.freeService(v.Owner); id != 0 {
				v.Home = id
				home = e.entity(id)
				e.assign(v, Order{Kind: "return"})
			} else {
				home = nil
			}
			if hadHome {
				e.emit("service_lost", v.Owner, v.ID, v.Position, "owner", int64(v.Endurance))
			}
		}
		if !v.Landed {
			if v.Endurance > 0 {
				v.Endurance--
			}
			if v.Endurance == 900 {
				e.emit("aircraft_return_soon", v.Owner, v.ID, v.Position, "owner", 0)
			}
			if v.Endurance == 0 {
				v.HP = 0
				continue
			}
			if v.TaskUntil > e.state.Tick {
				continue
			}
			returnQueued := false
			for _, o := range v.Orders {
				if o.Kind == "return" {
					returnQueued = true
				}
			}
			if v.Endurance <= 600 && !returnQueued {
				e.assign(v, Order{Kind: "return"})
				if len(v.Passengers) > 0 {
					if drop, ok := e.airliftDropPoint(v); ok {
						v.Orders = []Order{{Kind: "unload", Position: drop}, {Kind: "return"}}
					}
				}
				e.emit("aircraft_returning", v.Owner, v.ID, v.Position, "owner", 0)
			}
			if home != nil && len(v.Orders) > 0 && v.Orders[0].Kind == "return" && distance(v.Position, e.landingPoint(v, home)) <= 500 {
				v.Position = e.landingPoint(v, home)
				v.Landed = true
				v.ServiceWork = 1
				v.Path = nil
				v.State = "servicing"
				if len(v.Passengers) > 0 {
					v.Orders = append([]Order{{Kind: "unload"}}, v.Orders...)
				}
			}
			continue
		}
		if home == nil || !home.Active(e.state.Tick) {
			continue
		}
		if v.ServiceWork == 0 {
			continue
		}
		work := uint32(2)
		if e.player(v.Owner).LowPower() {
			work = 1
		}
		if e.hasBuff(home, "rapid_sortie") {
			if work == 2 {
				work = 3
			} else if e.state.Tick%2 == 0 {
				work = 2
			}
		}
		v.ServiceWork += work
		if v.ServiceWork >= e.serviceRequired(v) {
			v.ServiceWork = 0
			v.Endurance = 2400
			w, ok := e.weapon(v)
			if ok {
				v.Ammo = w.Ammo
			}
			v.State = "landed"
			if len(v.Orders) > 0 && v.Orders[0].Kind == "return" {
				v.Orders = v.Orders[1:]
			}
			setCooldown(&v.Cooldowns, "decoy_initial", 0)
			e.emit("aircraft_serviced", v.Owner, v.ID, v.Position, "owner", 0)
		}
	}
}

func (e *Engine) airliftDropPoint(v *Entity) (Vec, bool) {
	for ring := int32(0); ring <= 4000; ring += 1000 {
		for _, d := range neighbors {
			candidate := Vec{X: v.Position.X + d.X*ring, Y: v.Position.Y + d.Y*ring}
			if !e.clear(candidate, e.radius(v), v.ID, true, true) {
				continue
			}
			hypothetical := *v
			hypothetical.Position = candidate
			exits, legal := e.passengerExits(&hypothetical, v.Passengers, 1000)
			for _, exit := range exits {
				if distance(v.Position, exit) > 5000 {
					legal = false
					break
				}
			}
			if legal {
				return candidate, true
			}
		}
	}
	return Vec{}, false
}
