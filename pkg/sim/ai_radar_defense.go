package sim

// First-line defense uses only current public armed threats to allied economy
// actors. It neither borrows construction/recovery commitments nor changes the
// normal production reserve. Ordinary execution revalidates and pays the job.
func (e *Engine) aiFirstRadarDefense(p *Player, view View, own []EntityView, prior []Order, budget int64, plannedSupply int32) (Order, int64, int32, bool) {
	threatArmor := map[string]bool{}
	for _, enemy := range view.Entities {
		if !aiActiveOpponent(p, view, enemy.Owner) || !enemy.Complete || !enemy.Enabled {
			continue
		}
		weapon, armor := "", "structure"
		if unit, ok := e.catalog.Unit(enemy.Type); ok {
			weapon, armor = unit.Weapon, unit.Armor
		} else if building, ok := e.buildingRule(enemy.Type); ok {
			weapon = building.Weapon
		}
		rule, armed := e.catalog.Weapon(weapon)
		if !armed {
			continue
		}
		for _, asset := range view.Entities {
			if !aiActiveAlly(p, view, asset.Owner) {
				continue
			}
			role, targetArmor := "", "structure"
			if building, ok := e.buildingRule(asset.Type); ok {
				role = building.Role
			} else if unit, ok := e.catalog.Unit(asset.Type); ok {
				role, targetArmor = unit.Role, unit.Armor
			}
			if (role == "hq" || role == "supply" || role == "hauler") && distance(asset.Position, enemy.Position) < 14000 && (rule.Kind == "tactical" || e.catalog.Multiplier(rule.Kind, targetArmor) > 0) {
				threatArmor[armor] = true
			}
		}
	}
	if len(threatArmor) == 0 {
		return Order{}, 0, 0, false
	}
	frontline := func(typ string) bool {
		unit, ok := e.catalog.Unit(typ)
		if !ok {
			return false
		}
		switch unit.Role {
		case "car", "rifle", "at", "tank", "aa":
		default:
			return false
		}
		weapon, ok := e.catalog.Weapon(unit.Weapon)
		if !ok || weapon.Kind == "tactical" {
			return false
		}
		// Fixed iteration keeps the selection independent of Go map ordering.
		for _, armor := range []string{"infantry", "light", "heavy", "structure", "air"} {
			if threatArmor[armor] && e.catalog.Multiplier(weapon.Kind, armor) > 0 {
				return true
			}
		}
		return false
	}
	used := map[ID]bool{}
	for _, order := range prior {
		for _, id := range order.Entities {
			used[id] = true
		}
		if order.Kind == "train" && frontline(order.Type) {
			return Order{}, 0, 0, false
		}
	}
	for _, observed := range own {
		actor := e.aiOwnEntity(own, observed.ID)
		if actor == nil || actor.Owner != p.ID {
			continue
		}
		if actor.HP > 0 && frontline(actor.Type) {
			return Order{}, 0, 0, false
		}
		for _, job := range actor.Jobs {
			if !job.Research && frontline(job.Type) {
				return Order{}, 0, 0, false
			}
		}
	}
	// Prefer the cheap first factory screen; infantry and AA remain bounded
	// fallbacks when that screen cannot meet current public target capability.
	for _, role := range []string{"car", "rifle", "at", "aa", "tank"} {
		typ := p.Faction + "." + role
		unit, ok := e.catalog.Unit(typ)
		if !ok || !frontline(typ) || budget < unit.Cost+300000 || plannedSupply+unit.Supply > 100 {
			continue
		}
		for _, observed := range own {
			producer := e.aiOwnEntity(own, observed.ID)
			if producer == nil || producer.Owner != p.ID || !producer.Building || !producer.Active(e.Tick()) || len(producer.Jobs) != 0 || used[producer.ID] || e.role(producer) != unit.Producer {
				continue
			}
			order := Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ}
			job, code := e.productionJob(p, producer, order)
			if code != "ok" || !e.jobReady(p, producer, &job) {
				continue
			}
			cost, supply, service, code := e.productionAllocation(p, &job)
			if code == "ok" && service == 0 && budget >= cost+300000 && plannedSupply+supply <= 100 {
				return order, cost, supply, true
			}
		}
	}
	return Order{}, 0, 0, false
}
