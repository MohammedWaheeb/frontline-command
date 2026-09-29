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
	target := e.pickTarget(v)
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
		} else if o.Kind == "move" || o.Kind == "attack_move" || o.Kind == "attack" || o.Kind == "patrol" {
			v.FlightPass = o.Position
			if o.Kind == "patrol" {
				v.FlightPass = o.Points[o.Index]
			}
			if o.Kind == "attack" {
				v.FlightPass = v.LastTarget
			}
			v.PassUntil = e.state.Tick + seconds(2)
			if distance(v.Position, v.FlightPass) < 1500 {
				v.Anchor = v.Position
				if o.Kind == "patrol" {
					e.advanceMovementPatrol(v)
				} else {
					e.completeMovementOrder(v)
				}
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

// Automatic Return decisions run before the explicit reservation/movement
// stage. Initial601 is the same threshold as post-decrement600; endurance,
// warning and service work still update in updateAircraft. This intentionally
// advances forced-return movement by one tick in this candidate version.
func (e *Engine) prepareAircraftReturns() {
	for _, v := range e.state.Entities {
		if v.HP <= 0 || !e.isAircraft(v) || e.role(v) == "support_plane" || e.defeated(v.Owner) {
			continue
		}
		if v.EmergencyTakeoffUntil > e.state.Tick {
			continue
		}
		if v.EmergencyTakeoffUntil > 0 {
			v.EmergencyTakeoffUntil = 0
			v.Landed = false
			v.State = "taking_off"
		}
		if v.Landed || v.TaskUntil > e.state.Tick && v.Endurance > 1 {
			continue
		}
		returning := len(v.Orders) > 0 && (v.Orders[0].Kind == "return" || v.Orders[0].Kind == "unload" && len(v.Orders) > 1 && v.Orders[1].Kind == "return")
		if v.Endurance <= 601 && !returning {
			e.returnForService(v)
			if len(v.Passengers) > 0 {
				if drop, ok := e.airliftDropPoint(v); ok {
					v.Orders = append([]Order{{Kind: "unload", Position: drop}}, v.Orders...)
				}
			}
			e.emit("aircraft_returning", v.Owner, v.ID, v.Position, "owner", 0)
		}
	}
}

func (e *Engine) updateAircraft() {
	for _, v := range e.state.Entities {
		if e.role(v) == "support_plane" {
			continue
		}
		if v.HP <= 0 || !e.isAircraft(v) || e.defeated(v.Owner) {
			continue
		}
		if v.EmergencyTakeoffUntil > e.state.Tick {
			continue
		}
		home := e.entity(v.Home)
		if home == nil || home.HP <= 0 || home.Owner != v.Owner || !home.Complete {
			e.loseService(v)
			home = e.entity(v.Home)
		}

		if !v.Landed {
			if v.Endurance > 0 {
				v.Endurance--
			}
			if v.Endurance == 900 {
				e.emit("aircraft_return_soon", v.Owner, v.ID, v.Position, "owner", 0)
			}
			if v.TaskUntil > e.state.Tick && v.Endurance > 0 {
				continue
			}
			if home != nil && len(v.Orders) > 0 && v.Orders[0].Kind == "return" {
				point, legal := Vec{}, false
				if v.Landing != nil && v.Landing.Home == home.ID {
					point = v.Landing.Position
					legal = e.serviceParkingClear(v, home, point, nil)
				}
				if legal && distance(v.Position, point) <= 500 {
					v.Position = point
					v.LastPosition = point
					v.Landed = true
					v.Landing = nil
					v.ParkingRetryAt = 0
					v.ServiceWork = 1
					v.Path = nil
					v.State = "servicing"
					if len(v.Passengers) > 0 {
						v.Orders = append([]Order{{Kind: "unload"}}, v.Orders...)
					}
				} else if !legal {
					v.State = "landing_blocked"
				}
			}
			// The last airborne tick may reach a legal reserved pad. Landing
			// wins that boundary; otherwise zero endurance still destroys the
			// aircraft. Endurance remains zero until ordinary service completes.
			if !v.Landed && v.Endurance == 0 {
				e.emit("aircraft_endurance_lost", v.Owner, v.ID, v.Position, "owner", 0)
				v.HP = 0
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
		// One marks service admission; only subsequent work advances rearming.
		// Excluding that sentinel keeps low-power service at exactly half rate.
		if v.ServiceWork > e.serviceRequired(v) {
			v.ServiceWork = 0
			v.Endurance = 2400
			w, ok := e.weapon(v)
			if ok {
				v.Ammo = w.Ammo
			}
			if len(v.Orders) > 0 && v.Orders[0].Kind == "return" {
				e.completeMovementOrder(v)
			}
			v.State = "landed"
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

// Automatic servicing preserves explicitly queued work, and continuous patrol
// or escort orders. Ground attacks repeat only when the owner enabled it.
func (e *Engine) returnForService(v *Entity) {
	if len(v.Orders) > 0 && v.Orders[0].Kind == "return" {
		if v.Orders[0].Target != 0 {
			v.Orders[0].Target = v.Home
			if home := e.entity(v.Home); home != nil {
				v.Orders[0].Position = home.Position
			}
		}
		return
	}
	orders := cloneOrders(v.Orders)
	if len(orders) > 0 {
		current := orders[0]
		resume := current.Kind == "patrol" || current.Kind == "escort" || current.Kind == "guard" && current.Target != 0 || v.RepeatSortie && (current.Kind == "attack" || current.Kind == "attack_move" || current.Kind == "force_fire")
		if !resume {
			orders = orders[1:]
		}
	}
	for len(orders) > 0 && orders[0].Kind == "return" {
		orders = orders[1:]
	}
	e.assign(v, Order{Kind: "return"})
	// One internal Return and one emergency Unload may prefix the ten explicit
	// user orders. They never drop the user's last queued command.
	v.Orders = append(v.Orders, orders...)
}
