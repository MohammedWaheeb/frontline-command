package sim

// A targeted Return changes an owned aircraft's reserved home and then uses
// ordinary flight, landing and service. Capacity is checked for the whole
// selection before any reservation changes; active paid jobs keep their slots.
func (e *Engine) validateRebase(player PlayerID, o Order, selected []*Entity) string {
	if o.Queued {
		return "rebase_not_queueable"
	}
	home := e.entity(o.Target)
	if home == nil || home.Owner != player {
		return "owned_service_required"
	}
	rule, ok := e.buildingRule(home.Type)
	if !ok || !home.Building || rule.ServiceSlots == 0 || !home.Active(e.state.Tick) || home.Channel == "sell" {
		return "service_unavailable"
	}
	needed := int32(0)
	for _, aircraft := range selected {
		unit, _ := e.catalog.Unit(aircraft.Type)
		if !e.isAircraft(aircraft) || unit.Producer != rule.Role {
			return "incompatible_service"
		}
		if aircraft.Home == home.ID {
			continue
		}
		if aircraft.ServiceWork != 0 {
			return "aircraft_servicing"
		}
		if aircraft.EmergencyTakeoffUntil > e.state.Tick {
			return "aircraft_recovering"
		}
		needed++
	}
	used := int32(0)
	for _, actor := range e.state.Entities {
		if actor.Owner != player {
			continue
		}
		if actor.HP > 0 && actor.Home == home.ID {
			used++
		}
		for _, job := range actor.Jobs {
			if job.Started && job.Service == home.ID {
				used++
			}
		}
	}
	if used+needed > rule.ServiceSlots {
		return "service_full"
	}
	return "ok"
}

func (e *Engine) rebaseAircraft(v *Entity, home ID) {
	if v.Home == home {
		return
	}
	v.Home = home
	v.Landing = nil
	v.ParkingRetryAt = 0
	if v.Landed {
		v.Landed = false
		v.State = "taking_off"
	}
	// Health, ammunition and endurance are deliberately unchanged. They recover
	// only through the existing service and paid-repair mechanisms at arrival.
	e.emit("aircraft_rebased", v.Owner, v.ID, v.Position, "owner", int64(home))
}
