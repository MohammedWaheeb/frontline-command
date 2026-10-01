package sim

const (
	radarPulseEnergy   int64 = 25000
	radarPulseRadius   int32 = 12000
	radarPulseRange    int32 = 14000
	radarPulseLife     Tick  = 120
	radarPulseCooldown Tick  = 1600
)

// Read current enabled structures rather than the previous cached power totals.
// A preceding power order in the same packet must affect this cast immediately.
// This is the power calculation in recalculate, without mutating public advice.
func (e *Engine) radarPulsePowered(owner PlayerID) bool {
	var capacity, demand int32
	for _, v := range e.state.Entities {
		if v.Owner != owner || !v.Building || !v.Active(e.state.Tick) {
			continue
		}
		b, ok := e.buildingRule(v.Type)
		if !ok {
			continue
		}
		capacity += b.PowerCapacity
		demand += b.PowerDemand
		if b.Role == "hq" && e.hasBuff(v, "emergency_power") {
			capacity += 80
		}
	}
	return capacity >= demand
}

// The group-order normalizer and the actual cast share the same read-only probe.
// Disk revelation does not require existing sight or exploration at its center.
func (e *Engine) radarPulseReadyCode(p *Player, v *Entity, o Order) string {
	if p == nil || p.Defeated {
		return "player_inactive"
	}
	if v == nil || v.Owner != p.ID || !v.Building || e.role(v) != "radar" {
		return "radar_required"
	}
	if !v.Active(e.state.Tick) {
		return "radar_inactive"
	}
	if !e.radarPulsePowered(p.ID) {
		return "insufficient_power"
	}
	if !e.state.Map.InBounds(o.Position) || o.Target != 0 || len(o.Points) != 0 {
		return "invalid_target"
	}
	if dist2(v.Position, o.Position) > int64(radarPulseRange)*int64(radarPulseRange) {
		return "out_of_range"
	}
	if p.Energy < radarPulseEnergy {
		return "insufficient_energy"
	}
	if cooldown(v.Cooldowns, "radar_pulse", e.state.Tick) {
		return "cooldown"
	}
	return "ok"
}

// One lowest-ID READY radar performs one cast. An inactive, cooling or distant
// radar cannot displace another selected radar that can actually perform it.
func (e *Engine) radarPulseSource(p *Player, selected []*Entity, o Order) (*Entity, string) {
	if p == nil || p.Defeated {
		return nil, "player_inactive"
	}
	var chosen, firstRejected *Entity
	firstCode := "radar_required"
	for _, v := range selected {
		if v == nil || v.Owner != p.ID || !v.Building || e.role(v) != "radar" {
			continue
		}
		code := e.radarPulseReadyCode(p, v, o)
		if code == "ok" {
			if chosen == nil || v.ID < chosen.ID {
				chosen = v
			}
		} else if firstRejected == nil || v.ID < firstRejected.ID {
			firstRejected, firstCode = v, code
		}
	}
	if chosen != nil {
		return chosen, "ok"
	}
	return nil, firstCode
}

func (e *Engine) castRadarPulse(p *Player, selected []*Entity, o Order) string {
	v, code := e.radarPulseSource(p, selected, o)
	if code != "ok" {
		return code
	}
	p.Energy -= radarPulseEnergy
	setCooldown(&v.Cooldowns, "radar_pulse", e.state.Tick+radarPulseCooldown)
	e.state.Zones = append(e.state.Zones, Zone{Kind: "scan", Owner: p.ID, Position: o.Position, Radius: radarPulseRadius, Start: e.state.Tick, Until: e.state.Tick + radarPulseLife})
	// Source identity is delivered only to its team. Other players may observe
	// the existing local scan-circle projection without gaining source identity.
	e.emit("radar_pulse", p.ID, v.ID, o.Position, "team", int64(radarPulseRadius))
	return "ok"
}
