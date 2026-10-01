package sim

// Capacity uses only this player's ordinary command window. A planning cycle
// may submit several 32-order batches or a final partial batch. The global
// backlog belongs exclusively to Submit admission; planning must not inspect
// another player's undisclosed queued intentions.
func (e *Engine) aiCommandCapacity(p *Player) int {
	remaining := 160
	if e.state.Tick-p.CommandWindow < seconds(1) {
		remaining -= int(min(p.CommandCount, 160))
	}
	return remaining
}

// Keep the earliest intention for each actor, preserving recovery/channel
// priority over later generic movement and each faction ability's one source.
// Maps are membership checks only; selection follows the planner's stable list.
func (e *Engine) aiChooseOrders(p *Player, own []EntityView, orders []Order, planningCredits int64) []Order {
	limit := e.aiCommandCapacity(p)
	if limit == 0 {
		return nil
	}
	used := map[ID]bool{}
	factionAbilities := map[string]bool{}
	credits, energy := planningCredits, p.Energy
	supply := p.Supply + p.ReservedSupply
	for _, observed := range own {
		if observed.Owner != p.ID {
			continue
		}
		for _, job := range e.entity(observed.ID).Jobs {
			if !job.Started && !job.Research {
				if unit, ok := e.catalog.Unit(job.Type); ok {
					supply += unit.Supply
				}
			}
		}
	}
	chosen := orders[:0]
	for _, order := range orders {
		conflict := false
		for _, id := range order.Entities {
			if used[id] {
				conflict = true
				break
			}
		}
		if conflict {
			continue
		}
		factionAbility := order.Kind == "ability" && aiFactionAbility(order.Type)
		if factionAbility && factionAbilities[order.Type] {
			continue
		}
		cost, commandEnergy, reservedSupply := e.aiOrderReservation(p, &order)
		if cost > credits || commandEnergy > energy || reservedSupply > 0 && supply+reservedSupply > 100 {
			continue
		}
		// Rejected/conflicting intentions reserve neither the actor nor shared
		// resources. Later affordable movement can still serve that actor.
		credits -= cost
		energy -= commandEnergy
		supply += reservedSupply
		chosen = append(chosen, order)
		for _, id := range order.Entities {
			used[id] = true
		}
		if factionAbility {
			factionAbilities[order.Type] = true
		}
		if len(chosen) == limit {
			break
		}
	}
	return chosen
}

// Submit preserves singleton movement/formation geometry and per-order
// execution failures. It remains the sole admission authority for every batch;
// no AI path executes intentions directly or bypasses the human command rules.
func (e *Engine) aiDispatchOrders(p *Player, orders []Order) {
	for len(orders) > 0 {
		count := min(32, len(orders))
		if err := e.Submit(p.ID, p.LastSequence+1, orders[:count]); err != nil {
			return
		}
		orders = orders[count:]
	}
}
