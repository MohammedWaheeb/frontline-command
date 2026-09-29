package sim

// Reconcile all live aircraft first, in stable entity order. This includes
// previously unassigned aircraft when newly completed service capacity opens.
// Active outages do not invalidate an owned, complete reservation.
func (e *Engine) reconcileAircraftService() {
	for _, actor := range e.state.Entities {
		if actor.HP <= 0 || e.defeated(actor.Owner) || !e.isAircraft(actor) || e.role(actor) == "support_plane" {
			continue
		}
		home := e.entity(actor.Home)
		if home == nil || home.HP <= 0 || home.Owner != actor.Owner || !home.Complete {
			e.loseService(actor)
		}
	}
}

func (e *Engine) loseService(v *Entity) {
	hadHome := v.Home != 0
	v.Home = 0
	v.Landing = nil
	v.ParkingRetryAt = 0
	v.Endurance = min(v.Endurance, uint32(1200))
	v.ServiceWork = 0
	if v.Landed && v.EmergencyTakeoffUntil == 0 {
		v.EmergencyTakeoffUntil = e.state.Tick + seconds(2)
		v.State = "emergency_takeoff"
	}
	if id := e.freeService(v.Owner); id != 0 {
		v.Home = id
		e.returnForService(v)
	}
	if hadHome {
		e.emit("service_lost", v.Owner, v.ID, v.Position, "owner", int64(v.Endurance))
	}
}
func (e *Engine) detachCapturedService(home ID, previousOwner PlayerID) {
	for _, actor := range e.state.Entities {
		if actor.HP > 0 && actor.Owner == previousOwner && actor.Home == home && e.isAircraft(actor) {
			e.loseService(actor)
		}
	}
	// Living aircraft claim replacement reservations before deferred paid jobs.
	// A waiting job keeps its money/progress and cannot displace that return slot.
	for _, actor := range e.state.Entities {
		if actor.Owner != previousOwner {
			continue
		}
		for i := range actor.Jobs {
			job := &actor.Jobs[i]
			if job.Started && job.Service == home {
				job.Service = 0
				job.Service = e.freeService(previousOwner)
			}
		}
	}
}
