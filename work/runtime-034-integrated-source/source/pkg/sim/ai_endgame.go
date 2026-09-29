package sim

// Defeat and team membership are public PlayerSummary information. Never infer
// an opponent's status from hidden buildings, HP, resources or private orders.
func aiActiveOpponent(p *Player, view View, owner PlayerID) bool {
	if owner == 0 || owner == p.ID {
		return false
	}
	for _, player := range view.Players {
		if player.ID == owner {
			return !player.Defeated && player.Team != p.Team
		}
	}
	return false
}
func aiIndicatorGoal(p *Player, view View, from Vec) (Vec, bool) {
	best, score := Vec{}, int64(1<<62)
	for _, indicator := range view.Indicators {
		if !aiActiveOpponent(p, view, indicator.Owner) {
			continue
		}
		d := dist2(from, indicator.Position)
		if d < score {
			best, score = indicator.Position, d
		}
	}
	return best, score < int64(1<<62)
}

// Existing attacks and hostile channels can outlive the public defeat of their
// target's owner. Use the last authorized identity, overridden by current sight,
// to release only those intentions. Unknown hidden IDs reveal nothing here.
func (e *Engine) aiRetireDefeatedTargets(p *Player, view View) []Order {
	defeated := map[PlayerID]bool{}
	for _, player := range view.Players {
		if player.Defeated {
			defeated[player.ID] = true
		}
	}
	if len(defeated) == 0 {
		return nil
	}
	owners := map[ID]PlayerID{}
	for _, remembered := range p.AIKnowledge {
		owners[remembered.ID] = remembered.Owner
	}
	for _, observed := range view.Entities {
		owners[observed.ID] = observed.Owner
	}
	orders := []Order{}
	for _, observed := range view.Entities {
		if observed.Owner != p.ID {
			continue
		}
		unit := e.entity(observed.ID)
		retire := false
		if len(unit.Orders) > 0 {
			order := unit.Orders[0]
			if order.Kind == "attack" || order.Kind == "capture" {
				retire = defeated[owners[order.Target]]
			}
		}
		if unit.Channel == "capture" || unit.Channel == "sabotage" || unit.Channel == "designate" {
			retire = retire || defeated[owners[unit.ChannelTarget]]
		}
		if retire {
			// Preserve the 32-order planning budget without losing remembered
			// cancellations when a large force shares a now-retired objective.
			if len(orders) == 0 || len(orders[len(orders)-1].Entities) == 64 {
				orders = append(orders, Order{Kind: "stop", Entities: []ID{}})
			}
			orders[len(orders)-1].Entities = append(orders[len(orders)-1].Entities, unit.ID)
		}
	}
	return orders
}
