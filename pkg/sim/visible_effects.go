package sim

// StatusEffect exposes only an already-disclosed actor's visible presentation.
// Source identities and private cooldowns are deliberately absent. Until zero
// means an active state without a fixed expiry (deployment or a renewed aura).
type StatusEffect struct {
	Kind  string `json:"kind"`
	Until Tick   `json:"until"`
}

func (e *Engine) visibleEffects(v *Entity) []StatusEffect {
	var out []StatusEffect
	// Stable allowlist excludes internal exit locks and future/private buffs.
	for _, kind := range []string{"decoy", "designated", "disperse", "emergency_power", "rapid_sortie", "recall", "recovery", "relay", "shieldline"} {
		var until Tick
		for _, buff := range v.Buffs {
			if buff.Kind == kind && buff.Until > e.state.Tick {
				until = max(until, buff.Until)
			}
		}
		if until > 0 {
			if kind == "emergency_power" && !v.Active(e.state.Tick) {
				continue
			}
			if kind == "shieldline" {
				until = 0
			} // Actual aura is renewed; zone carries its end.
			out = append(out, StatusEffect{Kind: kind, Until: until})
		}
	}
	if v.Building && v.DisabledUntil > e.state.Tick {
		out = append(out, StatusEffect{Kind: "disabled", Until: v.DisabledUntil})
	}
	if v.Building && v.DisabledUntil <= e.state.Tick && v.ResistanceUntil > e.state.Tick {
		out = append(out, StatusEffect{Kind: "sabotage_resistance", Until: v.ResistanceUntil})
	}
	if v.Type == "SA.tank" && v.Deployed {
		out = append(out, StatusEffect{Kind: "hull_down"})
	}
	if v.TemporaryUntil > e.state.Tick && e.role(v) != "support_plane" {
		out = append(out, StatusEffect{Kind: "temporary", Until: v.TemporaryUntil})
	}
	if v.PublicRevealUntil > e.state.Tick {
		out = append(out, StatusEffect{Kind: "launch_reveal", Until: v.PublicRevealUntil})
	}
	return out
}
