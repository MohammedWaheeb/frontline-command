package sim

// Recovery is an explicit allied scenario action. It cannot capture enemies,
// bypass army/utility caps, grant a new vehicle, or transfer passenger control.
func (e *Engine) recoverScenarioTag(tag string, owner PlayerID) bool {
	p := e.player(owner)
	if p == nil || p.Defeated || p.Controller != "human" {
		return false
	}
	actors := []*Entity{}
	supply := int32(0)
	roles := map[string]int32{}
	for _, actor := range e.state.Entities {
		if actor.Tag != tag || actor.HP <= 0 {
			continue
		}
		if actor.Owner == owner {
			continue
		}
		if !e.allied(owner, actor.Owner) || actor.Building || actor.Container != 0 || len(actor.Passengers) > 0 || e.isAircraft(actor) || actor.TemporaryUntil > 0 {
			return false
		}
		unit, ok := e.catalog.Unit(actor.Type)
		if !ok || unit.Faction != p.Faction {
			return false
		}
		supply += unit.Supply
		roles[unit.Role]++
		actors = append(actors, actor)
	}
	if len(actors) == 0 {
		return false
	}
	if p.Supply+p.ReservedSupply+supply > 100 {
		return false
	}
	for role, limit := range map[string]int32{"rig": 4, "hauler": 8, "elite": 1} {
		if e.countRole(owner, role, true)+roles[role] > limit {
			return false
		}
	}
	for _, actor := range actors {
		actor.Owner = owner
		actor.Enabled = true
		actor.Contributions = nil
		actor.AttributedDamage = 0
		e.assign(actor, Order{Kind: "hold"})
		e.emit("scenario_recovered", owner, actor.ID, actor.Position, "team", 0)
	}
	e.recalculate()
	return true
}
