package sim

// The real executor and independent advice probes share these read-only checks.
func (e *Engine) validateResume(player PlayerID, v, target *Entity) string {
	if e.role(v) != "rig" || target == nil || target.Owner != player || !target.Building || target.Complete {
		return "invalid_foundation"
	}
	if builder := e.entity(target.Builder); builder != nil && builder.HP > 0 && len(builder.Orders) > 0 && builder.Orders[0].Target == target.ID {
		return "builder_assigned"
	}
	return "ok"
}
func (e *Engine) validateMobileOrder(player PlayerID, o Order, selected []*Entity) string {
	if code := e.validateMobileSources(o, selected); code != "ok" {
		return code
	}
	for _, v := range selected {
		switch o.Kind {
		case "guard", "escort":
			if o.Target != 0 || o.Kind == "escort" {
				target := e.entity(o.Target)
				if target == nil || target.HP <= 0 || e.defeated(target.Owner) || !e.allied(player, target.Owner) || target.ID == v.ID || target.Container != 0 {
					return "friendly_target_required"
				}
			}
		case "patrol":
			if len(o.Points) == 1 {
				return "patrol_needs_two_points"
			}
		case "attack":
			target := e.entity(o.Target)
			if target == nil || !e.canSeeEntity(player, target) || e.allied(player, target.Owner) {
				return "target_not_visible"
			}
			if e.defeated(target.Owner) {
				return "inactive_target"
			}
			if !e.canAttack(v, target) {
				return "illegal_target_layer"
			}
		case "force_fire":
			w, ok := e.weapon(v)
			if !ok || (w.Kind != "shell" && w.Kind != "cannon") {
				return "cannot_force_fire"
			}
			if !e.explored(player, o.Position) {
				return "unexplored_target"
			}
		case "gather":
			if e.role(v) != "hauler" {
				return "hauler_required"
			}
			if o.Target != 0 {
				f := e.field(uint32(o.Target))
				if f == nil || !e.explored(player, f.Position) {
					return "unknown_field"
				}
			}
		case "salvage":
			if v.Type != "SY.engineer" && v.Type != "SY.repair" {
				return "salvage_collector_required"
			}
			if crate := e.salvage(o.Target); crate == nil || e.allied(player, crate.Owner) || !e.canSee(player, crate.Position) {
				return "salvage_not_visible"
			}
		case "repair":
			target := e.entity(o.Target)
			if target == nil || target.Owner != player || e.repairRate(v, target) == 0 || v.ID == target.ID {
				return "invalid_repair_target"
			}
		case "capture":
			if e.role(v) != "engineer" || v.TemporaryUntil != 0 {
				return "engineer_required"
			}
			if !e.validCapture(v, o.Target) {
				return "invalid_capture_target"
			}
		case "board":
			target := e.entity(o.Target)
			if !e.canBoard(v, target) || !e.canSeeEntity(player, target) {
				return "invalid_transport"
			}
		case "unload":
			if e.capacity(v) == 0 {
				return "transport_required"
			}
		case "return":
			if !e.isAircraft(v) {
				return "aircraft_required"
			}
		}
	}
	if o.Kind == "return" && o.Target != 0 {
		return e.validateRebase(player, o, selected)
	}
	return "ok"
}

func (e *Engine) validateMobileSources(o Order, selected []*Entity) string {
	for _, v := range selected {
		if v.Container != 0 && o.Kind != "unload" {
			return "unit_embarked"
		}
		if v.Building && o.Kind != "unload" {
			return "mobile_unit_required"
		}
		if v.DisabledUntil > e.state.Tick {
			return "unit_disabled"
		}
		if o.Queued && len(v.Orders) >= 10 {
			return "queue_full"
		}
	}
	return "ok"
}
