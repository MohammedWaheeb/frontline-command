package sim

// Keep the ordinary factory cadence once a combat vehicle is committed. Before
// that first vehicle, a cash-short cadence choice may use a legal cheaper role
// with the same margin and the budget left by earlier planning priorities.
func (e *Engine) aiFirstFactoryVehicle(p *Player, producer *Entity, own []EntityView, preferred string, budget int64, plannedSupply int32, prior []Order, urgent bool) string {
	if urgent || producer == nil || producer.Owner != p.ID || e.aiOwnEntity(own, producer.ID) == nil || !producer.Active(e.Tick()) || len(producer.Jobs) != 0 {
		return preferred
	}
	unit, ok := e.catalog.Unit(preferred)
	if !ok || unit.Producer != "factory" || unit.Tier > p.Tier || budget >= unit.Cost+300000 {
		return preferred
	}
	// Special artillery, launcher and mobile interception choices retain their
	// existing priority; this fallback belongs only to the normal six-role loop.
	switch unit.Role {
	case "car", "tank", "aa", "apc", "repair":
	default:
		return preferred
	}
	armed := func(typ string) bool {
		u, ok := e.catalog.Unit(typ)
		if !ok || u.Producer != "factory" || u.Weapon == "" || u.Role == "repair" || u.Role == "rig" || u.Role == "launcher" {
			return false
		}
		w, ok := e.catalog.Weapon(u.Weapon)
		return ok && w.Kind != "tactical"
	}
	for _, observed := range own {
		if observed.Owner != p.ID {
			continue
		}
		v := e.entity(observed.ID)
		if v == nil || v.Owner != p.ID {
			continue
		}
		if armed(v.Type) {
			return preferred
		}
		for _, job := range v.Jobs {
			if !job.Research && armed(job.Type) {
				return preferred
			}
		}
	}
	for _, order := range prior {
		for _, id := range order.Entities {
			if id == producer.ID {
				return preferred
			}
		}
		if order.Kind == "train" && armed(order.Type) {
			for _, id := range order.Entities {
				if source := e.aiOwnEntity(own, id); source != nil && source.Owner == p.ID && e.role(source) == "factory" {
					return preferred
				}
			}
		}
	}
	for _, role := range []string{"car", "tank", "aa", "apc", "tank", "repair"} {
		typ := p.Faction + "." + role
		u, ok := e.catalog.Unit(typ)
		if !ok || !armed(typ) || u.Tier > p.Tier || budget < u.Cost+300000 || plannedSupply+u.Supply > 100 {
			continue
		}
		order := Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ}
		job, code := e.productionJob(p, producer, order)
		if code != "ok" || !e.jobReady(p, producer, &job) {
			continue
		}
		if _, _, _, code = e.productionAllocation(p, &job); code == "ok" {
			return typ
		}
	}
	return preferred
}
