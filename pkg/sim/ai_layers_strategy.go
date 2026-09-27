package sim

// Resolve an order's target only after membership in the current owned view is
// established. A captured target must not become a back door into enemy state.
func (e *Engine) aiOwnEntity(own []EntityView, id ID) *Entity {
	for _, observed := range own {
		if observed.ID == id {
			return e.entity(id)
		}
	}
	return nil
}

// The planning budget accounts for our own unpaid jobs. It does not reserve or
// spend money; ordinary production execution remains responsible for both.
func (e *Engine) aiPlanningBudget(p *Player, own []EntityView) int64 {
	budget := p.Credits
	for _, observed := range own {
		v := e.entity(observed.ID)
		for _, job := range v.Jobs {
			if job.Started {
				continue
			}
			if job.Research {
				u, _ := e.catalog.Upgrade(job.Type)
				budget -= u.Cost
			} else if job.Emergency {
				budget -= 1200000
			} else {
				u, _ := e.catalog.Unit(job.Type)
				budget -= u.Cost
			}
		}
	}
	return max(int64(0), budget)
}

func (e *Engine) aiPowerMargin(p *Player, own []EntityView) int32 {
	margin := p.PowerCapacity - p.PowerDemand
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && !v.Complete {
			b, _ := e.buildingRule(v.Type)
			margin += b.PowerCapacity - b.PowerDemand
		}
	}
	return margin
}

func (e *Engine) aiServiceMargin(own []EntityView) int32 {
	margin := int32(0)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && v.Active(e.state.Tick) {
			b, _ := e.buildingRule(v.Type)
			margin += b.ServiceSlots
		} else if e.isAircraft(v) && e.role(v) != "support_plane" {
			margin--
		}
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && u.Armor == "air" {
				margin--
			}
		}
	}
	return margin
}

func (e *Engine) aiResearchOrders(p *Player, own []EntityView, budget *int64) []Order {
	queued := map[string]bool{}
	counts := map[string]int{}
	armed := 0
	for _, observed := range own {
		v := e.entity(observed.ID)
		counts[e.role(v)]++
		if u, ok := e.catalog.Unit(v.Type); ok {
			counts[u.Armor]++
			if u.Weapon != "" {
				armed++
			}
		}
		for _, job := range v.Jobs {
			if job.Research {
				queued[job.Type] = true
			}
		}
	}
	useful := func(id string) bool {
		switch id {
		case "weapons_training":
			return armed >= 4
		case "vehicle_armor":
			return counts["light"]+counts["heavy"] >= 3
		case "US.countermeasures", "US.service_crews", "IR.drone_servicing":
			return counts["air"] >= 2
		case "IR.launcher_crews":
			return counts["launcher"] > 0
		case "SY.prepared_exits":
			return counts["safehouse"] >= 2
		case "SY.field_restoration", "SA.service_crews":
			return counts["repair"] > 0
		case "SA.interception":
			return counts["abm"]+counts["mobile_abm"] > 0
		}
		return false
	}
	orders := []Order{}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if !v.Building || !v.Active(e.state.Tick) || len(v.Jobs) != 0 {
			continue
		}
		for _, upgrade := range e.catalog.Upgrades() {
			if upgrade.Producer != e.role(v) || upgrade.Tier > p.Tier || upgrade.Faction != "" && upgrade.Faction != p.Faction || queued[upgrade.ID] || p.HasUpgrade(upgrade.ID) || !useful(upgrade.ID) {
				continue
			}
			if p.AI == "easy" && upgrade.Faction != "" || *budget < upgrade.Cost+1000000 {
				continue
			}
			orders = append(orders, Order{Kind: "research", Entities: []ID{v.ID}, Type: upgrade.ID})
			*budget -= upgrade.Cost
			queued[upgrade.ID] = true
			break
		}
	}
	return orders
}

// Find a known healing source, never an unseen enemy or an arbitrary free heal.
func (e *Engine) aiRepairAnchor(p *Player, unit *Entity, own []EntityView) *Entity {
	var best *Entity
	for _, observed := range own {
		v := e.entity(observed.ID)
		if !v.Active(e.state.Tick) || v.Container != 0 || e.repairRate(v, unit) == 0 || e.aiThreatNear(p, v.Position, 6000) {
			continue
		}
		if best == nil || distance(unit.Position, v.Position) < distance(unit.Position, best.Position) {
			best = v
		}
	}
	return best
}

func (e *Engine) aiCoverPosition(p *Player, unit *Entity, goal Vec) (Vec, bool) {
	if e.armor(unit) != "infantry" || e.state.Map.TileAt(unit.Position).Cover() || !e.aiThreatNear(p, unit.Position, 10000) {
		return Vec{}, false
	}
	best, score := Vec{}, int64(1<<62)
	weapon, armed := e.weapon(unit)
	if !armed {
		return Vec{}, false
	}
	for y := unit.Position.Y/1000 - 3; y <= unit.Position.Y/1000+3; y++ {
		for x := unit.Position.X/1000 - 3; x <= unit.Position.X/1000+3; x++ {
			point := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			if !e.state.Map.InBounds(point) || !e.canSee(p.ID, point) || !e.state.Map.TileAt(point).Cover() || !e.state.Map.TileAt(point).Passable() || distance(point, goal) > weapon.MaxRange+2000 || distance(point, goal) > distance(unit.Position, goal)+2000 {
				continue
			}
			candidate := dist2(unit.Position, point)
			if candidate < score {
				best, score = point, candidate
			}
		}
	}
	return best, score < int64(1<<62)
}

// Recovery precedes optional abilities so a low-health unit is not repeatedly
// committed to a new attack. These all remain standard, rejectable orders.
func (e *Engine) aiRecoveryOrders(p *Player, own []EntityView, goal Vec) []Order {
	if p.AI == "easy" {
		return nil
	}
	orders := []Order{}
	recallPlanned := false
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building || v.Container != 0 || v.Channel != "" || !v.Active(e.state.Tick) || e.role(v) == "rig" || e.role(v) == "hauler" {
			continue
		}
		if e.isAircraft(v) {
			if !v.Landed && (v.HP*2 < v.MaxHP || e.aiAirDanger(p, v.Position) && e.role(v) != "fighter") && (len(v.Orders) == 0 || v.Orders[0].Kind != "return") {
				if v.HP*2 < v.MaxHP && p.Faction == "IR" && p.Tier >= 2 && e.has(p.ID, "hq") && p.Energy >= 45000 && !recallPlanned && !cooldown(p.Cooldowns, "drone_recall", e.state.Tick) {
					orders = append(orders, Order{Kind: "ability", Type: "drone_recall", Entities: []ID{v.ID}})
					recallPlanned = true
				} else {
					orders = append(orders, Order{Kind: "return", Entities: []ID{v.ID}})
				}
			}
			continue
		}
		if v.HP*100 < v.MaxHP*35 {
			if source := e.aiRepairAnchor(p, v, own); source != nil {
				if len(v.Orders) == 0 || v.Orders[0].Kind != "guard" || v.Orders[0].Target != source.ID {
					orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Target: source.ID, Position: source.Position})
				}
				continue
			}
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.HP*100 >= v.MaxHP*85 {
			if target := e.aiOwnEntity(own, v.Orders[0].Target); target != nil && target.Building && e.repairRate(target, v) > 0 {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal})
				continue
			}
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target == 0 && !e.aiThreatNear(p, v.Position, 12000) {
			orders = append(orders, Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal})
			continue
		}
		if weapon, ok := e.weapon(v); ok && weapon.Kind != "tactical" && (len(v.Orders) == 0 || v.Orders[0].Kind == "attack_move") {
			if point, ok := e.aiCoverPosition(p, v, goal); ok {
				orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Position: point})
			}
		}
	}
	return orders
}

func (e *Engine) aiEscortOrders(p *Player, own []EntityView) []Order {
	if p.AI == "easy" {
		return nil
	}
	orders := []Order{}
	escorted := map[ID]bool{}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if len(v.Orders) > 0 && (v.Orders[0].Kind == "escort" || v.Orders[0].Kind == "guard") && v.Orders[0].Target != 0 {
			escorted[v.Orders[0].Target] = true
		}
	}
	groundEscorts := 0
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building || v.Container != 0 || v.Channel != "" || !v.Active(e.state.Tick) || v.HP*2 < v.MaxHP {
			continue
		}
		if len(v.Orders) > 0 {
			if v.Orders[0].Kind == "escort" {
				target := e.aiOwnEntity(own, v.Orders[0].Target)
				if target != nil && e.isAircraft(v) && target.Landed {
					orders = append(orders, Order{Kind: "return", Entities: []ID{v.ID}})
				}
			}
			continue
		}
		role := e.role(v)
		if role != "fighter" && role != "aa" && role != "rifle" {
			continue
		}
		if role == "fighter" && v.ServiceWork > 0 || role != "fighter" && (p.Supply < 24 || groundEscorts >= 2) {
			continue
		}
		for _, targetView := range own {
			target := e.entity(targetView.ID)
			if target.ID == v.ID || target.Container != 0 || target.Building || escorted[target.ID] || len(target.Orders) == 0 || target.HP*2 < target.MaxHP {
				continue
			}
			if role == "fighter" {
				if !e.isAircraft(target) || target.Landed || e.role(target) == "fighter" || e.role(target) == "support_plane" || target.Orders[0].Kind == "return" || e.aiAirDanger(p, target.Position) {
					continue
				}
			} else {
				if e.role(target) != "repair" && e.role(target) != "medic" || distance(v.Position, target.Position) > 12000 {
					continue
				}
				groundEscorts++
			}
			orders = append(orders, Order{Kind: "escort", Entities: []ID{v.ID}, Target: target.ID, Position: target.Position})
			escorted[target.ID] = true
			break
		}
	}
	return orders
}

func (e *Engine) aiTransportOrders(p *Player, own []EntityView, goal Vec) []Order {
	if p.AI == "easy" || p.AIIntent == "defend" {
		return nil
	}
	orders := []Order{}
	claimed := map[ID]bool{}
	for _, observed := range own {
		carrier := e.entity(observed.ID)
		role := e.role(carrier)
		if role != "apc" && role != "safehouse" || !carrier.Active(e.state.Tick) || carrier.Container != 0 || carrier.Channel != "" || carrier.HP*2 < carrier.MaxHP {
			continue
		}
		if len(carrier.Orders) > 0 {
			continue
		}
		waiting := int32(0)
		for _, passengerView := range own {
			unit := e.entity(passengerView.ID)
			if len(unit.Orders) == 0 || unit.Orders[0].Kind != "board" || unit.Orders[0].Target != carrier.ID {
				continue
			}
			if unit.Blocked || distance(unit.Position, carrier.Position) > 6000 {
				orders = append(orders, Order{Kind: "stop", Entities: []ID{unit.ID}})
				claimed[unit.ID] = true
				continue
			}
			waiting++
		}
		if len(carrier.Passengers) > 0 && waiting > 0 {
			// Do not leave the second squad following a moving carrier. A normal
			// blocked-route report releases an unreachable squad on a later cycle.
			if role == "apc" {
				orders = append(orders, Order{Kind: "hold", Entities: []ID{carrier.ID}})
			}
			continue
		}
		var destination *Entity
		if role == "safehouse" {
			for _, targetView := range own {
				target := e.entity(targetView.ID)
				if target.ID != carrier.ID && e.role(target) == "safehouse" && target.Active(e.state.Tick) && target.Channel == "" && !e.aiThreatNear(p, target.Position, 6000) && distance(target.Position, goal)+8000 < distance(carrier.Position, goal) && (destination == nil || distance(target.Position, goal) < distance(destination.Position, goal)) {
					destination = target
				}
			}
			if len(carrier.Passengers) > 0 {
				if destination != nil {
					orders = append(orders, Order{Kind: "ability", Type: "transfer", Entities: []ID{carrier.ID}, Target: destination.ID})
				} else {
					orders = append(orders, Order{Kind: "unload", Entities: []ID{carrier.ID}, Position: carrier.Position})
				}
				continue
			}
			if destination == nil {
				continue
			}
		} else if len(carrier.Passengers) > 0 {
			// Disembark short of the last observed objective rather than drive
			// straight into a known firing line. Paths and exits remain Go-validated.
			d := distance(carrier.Position, goal)
			point := carrier.Position
			if d > 9000 {
				point = Vec{X: goal.X + int32(int64(carrier.Position.X-goal.X)*8000/int64(d)), Y: goal.Y + int32(int64(carrier.Position.Y-goal.Y)*8000/int64(d))}
			}
			orders = append(orders, Order{Kind: "unload", Entities: []ID{carrier.ID}, Position: point})
			continue
		} else if distance(carrier.Position, goal) < 18000 || e.aiThreatNear(p, carrier.Position, 9000) {
			continue
		}
		for _, passengerView := range own {
			unit := e.entity(passengerView.ID)
			unitRole := e.role(unit)
			if waiting >= e.capacity(carrier) || claimed[unit.ID] || len(unit.Orders) > 0 || unit.Channel != "" || unit.Container != 0 || unit.TemporaryUntil != 0 || unit.HP*2 < unit.MaxHP || distance(unit.Position, carrier.Position) > 5000 || unitRole != "rifle" && unitRole != "at" && unitRole != "elite" {
				continue
			}
			orders = append(orders, Order{Kind: "board", Entities: []ID{unit.ID}, Target: carrier.ID})
			claimed[unit.ID] = true
			waiting++
		}
		if waiting > 0 && role == "apc" {
			orders = append(orders, Order{Kind: "hold", Entities: []ID{carrier.ID}})
		}
	}
	return orders
}
