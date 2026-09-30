package sim

import "slices"

// Ownership is an admission rule for the entire selection, not a capability
// filter. Never silently discard an unknown, duplicate or foreign source.
func (e *Engine) ownedOrderSelection(player PlayerID, ids []ID) ([]*Entity, string) {
	if len(ids) > 64 {
		return nil, "selection_limit"
	}
	selected := make([]*Entity, 0, len(ids))
	seen := make(map[ID]bool, len(ids))
	for _, id := range ids {
		v := e.entity(id)
		if seen[id] || v == nil || v.Owner != player {
			return nil, "not_owner"
		}
		seen[id] = true
		selected = append(selected, v)
	}
	slices.SortFunc(selected, func(a, b *Entity) int {
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	return selected, "ok"
}

// Call only after ownership has been checked. Skipping an actor never changes
// its task, channel, aim, production, stance or payment.
func (e *Engine) ownedOrderActorCode(v *Entity) string {
	if v.HP <= 0 {
		return "unit_destroyed"
	}
	if v.Type == "IR.shahed" && v.ShahedCommitted {
		return "shahed_committed"
	}
	if v.Container != 0 {
		return "unit_embarked"
	}
	if e.role(v) == "support_plane" {
		return "unit_not_controllable"
	}
	if v.DisabledUntil > e.state.Tick {
		return "unit_disabled"
	}
	return "ok"
}

func playerOrder(kind string) bool {
	switch kind {
	case "convoy_hold", "convoy_advance", "practice_spawn", "practice_remove", "practice_restore", "practice_resources", "practice_fog", "surrender", "surrender_cancel", "surrender_vote", "repair_reserve", "ping":
		return true
	}
	return false
}

func mobileOrder(kind string) bool {
	switch kind {
	case "move", "attack_move", "patrol", "stop", "hold", "guard", "escort", "aggressive", "attack", "force_fire", "gather", "salvage", "repair", "capture", "board", "unload", "return", "gather_depot", "retreat_when_attacked":
		return true
	}
	return false
}

// The result owns a fresh ID slice. Request/log arrays remain unchanged.
// Target-sensitive capability uses only owned or currently public properties;
// the existing executor still checks the complete target and group legality.
func (e *Engine) eligibleOrder(p *Player, o Order) (Order, string) {
	owned, code := e.ownedOrderSelection(p.ID, o.Entities)
	if code != "ok" {
		o.Entities = nil
		return o, code
	}
	if playerOrder(o.Kind) {
		o.Entities = nil
		return o, "ok"
	}
	if len(owned) == 0 {
		return o, "selection_empty"
	}
	if isFieldBarricadeOrder(o) {
		builder, code := e.fieldBarricadeBuilder(p.ID, o.Entities, o.Position)
		if code != "ok" {
			o.Entities = nil
			return o, code
		}
		o.Entities = []ID{builder.ID}
		return o, "ok"
	}
	if o.Kind == "ability" && o.Type == "observe" && (o.Queued || o.Index < 0 || o.Index > 1) {
		o.Entities = nil
		return o, "invalid_toggle"
	}
	eligible := make([]*Entity, 0, len(owned))
	firstCode := "unsupported_command"
	for i, v := range owned {
		code := e.orderActorCode(p, v, o)
		if code == "ok" {
			eligible = append(eligible, v)
		} else if i == 0 {
			firstCode = code
		}
	}
	if len(eligible) == 0 {
		o.Entities = nil
		return o, firstCode
	}
	if o.Kind == "ability" && o.Type == "radar_pulse" {
		v, code := e.radarPulseSource(p, eligible, o)
		if code != "ok" {
			o.Entities = nil
			return o, code
		}
		eligible = []*Entity{v}
	} else if singleSourceOrder(p, o) {
		eligible = eligible[:1]
	}
	o.Entities = make([]ID, len(eligible))
	for i, v := range eligible {
		o.Entities[i] = v.ID
	}
	return o, "ok"
}

func singleSourceOrder(p *Player, o Order) bool {
	switch o.Kind {
	case "build", "resume", "train", "research", "cancel":
		return true
	case "ability":
		return o.Type != "observe" && o.Type != "drone_recall" && !(o.Type == "strategic" && p.Faction == "SY")
	}
	return false
}

func (e *Engine) orderActorCode(p *Player, v *Entity, o Order) string {
	if code := e.ownedOrderActorCode(v); code != "ok" {
		return code
	}
	if mobileOrder(o.Kind) {
		if code := e.validateMobileSources(o, []*Entity{v}); code != "ok" {
			return code
		}
	}
	a := e.entityAffordance(p, v)
	if !slices.Contains(a.Commands, o.Kind) {
		switch o.Kind {
		case "build", "resume":
			return "rig_required"
		case "deploy", "pack":
			return "cannot_deploy"
		case "return", "repeat_sortie":
			return "aircraft_required"
		case "gather", "gather_depot", "retreat_when_attacked":
			return "hauler_required"
		case "attack":
			return "illegal_target_layer"
		case "repair":
			return "invalid_repair_target"
		case "board":
			return "invalid_transport"
		case "unload":
			return "transport_required"
		}
		return "unsupported_command"
	}
	target := e.entity(o.Target)
	publicTarget := target != nil && (target.Owner == p.ID || e.canSeeEntity(p.ID, target))
	switch o.Kind {
	case "build":
		_, code := e.buildingCatalogRequirements(p, v, o.Type)
		return code
	case "resume":
		if target != nil && target.Owner == p.ID {
			return e.validateResume(p.ID, v, target)
		}
	case "train", "research":
		_, code := e.productionJob(p, v, o)
		return code
	case "cancel":
		if (v.Building && !v.Complete) || o.Index >= 0 && int(o.Index) < len(v.Jobs) {
			return "ok"
		}
		return "job_not_found"
	case "guard", "escort":
		if o.Target == v.ID {
			return "friendly_target_required"
		}
	case "attack":
		if publicTarget {
			w, ok := e.weapon(v)
			if !ok || w.Kind == "tactical" && e.armor(target) == "air" || w.Kind != "tactical" && e.catalog.Multiplier(w.Kind, e.armor(target)) == 0 {
				return "illegal_target_layer"
			}
		}
	case "repair":
		if target != nil && target.Owner == p.ID && e.repairRate(v, target) == 0 {
			return "invalid_repair_target"
		}
	case "return":
		if target != nil && target.Owner == p.ID {
			rule, ok := e.buildingRule(target.Type)
			unit, _ := e.catalog.Unit(v.Type)
			if ok && rule.ServiceSlots > 0 && unit.Producer != rule.Role {
				return "incompatible_service"
			}
			if v.Home != o.Target {
				if o.Queued {
					return "rebase_not_queueable"
				}
				if v.ServiceWork != 0 {
					return "aircraft_servicing"
				}
				if v.EmergencyTakeoffUntil > e.state.Tick {
					return "aircraft_recovering"
				}
			}
		}
	case "ability":
		if !slices.Contains(a.Abilities, o.Type) {
			// Keep the original cast rejection for an incapable actor while
			// allowing another capable actor in the group to execute.
			switch o.Type {
			case "designate":
				return "invalid_designation"
			case "sabotage":
				return "invalid_sabotage"
			}
			return "unsupported_ability"
		}
		return e.abilityOrderActorCode(p, v, o, target, publicTarget)
	}
	return "ok"
}

// These are source-local readiness gates. Common payment, targeting and
// hidden geometry stay in cast; no ability is executed during filtering.
func (e *Engine) abilityOrderActorCode(p *Player, v *Entity, o Order, target *Entity, publicTarget bool) string {
	switch o.Type {
	case "observe":
		if !e.reconObserveActor(v) {
			return "recon_required"
		}
		if o.Index == 0 && !v.Active(e.state.Tick) {
			return "unit_disabled"
		}
	case "designate", "sabotage":
		// Match cast's target-law-first order, including resistance and sight.
		// The shared predicates inspect range only after earned visibility.
		if o.Type == "designate" && !e.validDesignation(v, target) {
			return "invalid_designation"
		}
		if o.Type == "sabotage" && !e.validSabotage(v, target) {
			return "invalid_sabotage"
		}
		if cooldown(v.Cooldowns, o.Type, e.state.Tick) {
			return "cooldown"
		}
	case "beacon":
		if distance(v.Position, o.Position) > 1000 {
			return "invalid_beacon"
		}
		if !e.beaconSlotAvailable(p.ID, v.ID) {
			return "beacon_limit"
		}
	case "decoy":
		if v.Landed || cooldown(v.Cooldowns, "decoy_initial", e.state.Tick) {
			return "decoy_unavailable"
		}
		if cooldown(v.Cooldowns, "decoy", e.state.Tick) {
			return "cooldown"
		}
	case "transfer":
		if !v.Active(e.state.Tick) || len(v.Passengers) == 0 || !e.transferQuiet(v) || v.ID == o.Target {
			return "invalid_transfer"
		}
	case "volley":
		if !v.Deployed || v.Charges < 2 {
			return "volley_unavailable"
		}
		w, _ := e.weapon(v)
		for _, pt := range o.Points {
			d := e.distanceTo(v, pt)
			if d < w.MinRange || d > w.MaxRange {
				return "invalid_missile_target"
			}
		}
	case "rapid_sortie":
		if !v.Active(e.state.Tick) {
			return "airfield_required"
		}
	case "relay_boost":
		if v.Landed {
			return "survey_drone_required"
		}
	case "emergency_power":
		if !v.Active(e.state.Tick) {
			return "active_hq_required"
		}
	case "strategic":
		if p.Faction == "SY" && !e.raidSafehouseReady(p.ID, v) {
			return "invalid_safehouse"
		}
		if p.Faction == "SA" && (!v.Active(e.state.Tick) || v.Type == "SA.mobile_abm" && !v.Deployed) {
			return "invalid_shield_anchor"
		}
	}
	return "ok"
}

func (e *Engine) execute(player PlayerID, o Order) string {
	code, _, _ := e.executeWithSelection(player, o)
	return code
}

func (e *Engine) executeWithSelection(player PlayerID, o Order) (string, []ID, int32) {
	p := e.player(player)
	if p == nil || p.Defeated || e.state.Outcome.Finished {
		return "player_inactive", nil, 0
	}
	effective, code := e.eligibleOrder(p, o)
	if code != "ok" {
		return code, effective.Entities, 0
	}
	// These free controls apply independently only after all source/ownership
	// gates have passed. Observe's malformed toggle is checked before this loop.
	if o.Kind == "power" || o.Kind == "sell" || o.Kind == "rally" || o.Kind == "ability" && o.Type == "observe" {
		for _, id := range effective.Entities {
			one := effective
			one.Entities = []ID{id}
			if code := e.executeSelected(player, one); code != "ok" {
				return code, effective.Entities, 0
			}
		}
		return "ok", effective.Entities, int32(len(effective.Entities))
	}
	code = e.executeSelected(player, effective)
	if code != "ok" {
		return code, effective.Entities, 0
	}
	return code, effective.Entities, int32(len(effective.Entities))
}
