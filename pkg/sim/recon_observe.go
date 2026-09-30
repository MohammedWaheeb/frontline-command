package sim

const reconObserveSightBonus int32 = 3000

// Observe is a stance for the four ground reconnaissance squads. Role checks
// keep its eligibility shared with mixed-selection command normalization.
func (e *Engine) reconObserveActor(v *Entity) bool {
	return v != nil && !v.Building && !e.isAircraft(v) && e.role(v) == "recon"
}

// Index 0 explicitly enables Observe; index 1 explicitly disables it. Repeating
// either intention never toggles the stance or restarts a pending channel.
func (e *Engine) reconObserve(v *Entity, o Order) string {
	if o.Queued || o.Index < 0 || o.Index > 1 {
		return "invalid_toggle"
	}
	if !e.reconObserveActor(v) {
		return "recon_required"
	}
	if o.Index == 1 {
		if v.ReconObserve || v.Channel == "observe" {
			e.assign(v, Order{Kind: "hold"})
		}
		return "ok"
	}
	if v.ReconObserve || v.Channel == "observe" {
		return "ok"
	}
	if !v.Active(e.Tick()) || e.defeated(v.Owner) {
		return "observe_unavailable"
	}
	// The existing hold stance retains this anchor and permits stationary
	// automatic fire. A subsequent ordinary task goes through assign and cancels
	// Observe, including a queued first task because this stance has no orders.
	e.assign(v, Order{Kind: "hold"})
	e.beginChannel(v, "observe", 0, seconds(2))
	e.emit("observe_started", v.Owner, v.ID, v.Position, "owner", 0)
	return "ok"
}

func (e *Engine) cancelReconObserve(v *Entity) {
	if v.ReconObserve || v.Channel == "observe" {
		v.ReconObserve = false
		e.emit("observe_canceled", v.Owner, v.ID, v.Position, "owner", 0)
	}
}

func (e *Engine) validReconObserveChannel(v *Entity) bool {
	return e.reconObserveActor(v) && v.Active(e.Tick()) && !e.defeated(v.Owner) &&
		!v.ReconObserve && v.ChannelDuration == seconds(2) && v.ChannelTarget == 0 &&
		v.Position == v.Anchor && v.LastPosition == v.Position &&
		v.Stance == "hold" && len(v.Orders) == 0
}

func (e *Engine) completeReconObserve(v *Entity) {
	v.ReconObserve = true
	e.emit("observe_ready", v.Owner, v.ID, v.Position, "owner", 0)
}

func (e *Engine) reconObserveSight(v *Entity) int32 {
	if !v.ReconObserve || !e.reconObserveActor(v) || !v.Active(e.Tick()) || e.defeated(v.Owner) ||
		v.Channel != "" || len(v.Orders) != 0 || v.Stance != "hold" ||
		v.Position != v.Anchor || v.LastPosition != v.Position {
		return 0
	}
	return reconObserveSightBonus
}
