package sim

// Tactical choices use only observed entities and our own unit state. Failed
// intentions still pass through the normal execution validator and cost nothing.
func (e *Engine) aiSpecialOrders(p *Player, view View, own []EntityView, goal Vec) []Order {
	return e.aiSpecialOrdersWithBudget(p, view, own, goal, e.aiPlanningBudget(p, own))
}

// The full cycle passes its already reserved credit budget and retained earlier
// orders. Only actor, Energy and Supply commitments carry forward here; earlier
// credit costs have already been deducted. Standalone callers omit prior orders.
func (e *Engine) aiSpecialOrdersWithBudget(p *Player, view View, own []EntityView, goal Vec, budget int64, prior ...Order) []Order {
	orders := []Order{}
	plannedFactionAbilities := map[string]bool{}
	used := map[ID]bool{}
	credits, energy := max(int64(0), budget), p.Energy
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
	freeSupply := max(int32(0), 100-supply)
	strategicCommitted := false
	for _, order := range prior {
		for _, id := range order.Entities {
			used[id] = true
		}
		_, commandEnergy, reservedSupply := e.aiOrderReservation(p, &order)
		energy = max(int64(0), energy-commandEnergy)
		freeSupply = max(int32(0), freeSupply-reservedSupply)
		if order.Kind == "ability" {
			if aiFactionAbility(order.Type) {
				plannedFactionAbilities[order.Type] = true
			}
			if order.Type == "strategic" {
				strategicCommitted = true
			}
		}
	}
	activeHQ := e.has(p.ID, "hq")
	addOrder := func(order Order) bool {
		for _, id := range order.Entities {
			if used[id] {
				return false
			}
		}
		if order.Kind == "ability" && aiFactionAbility(order.Type) {
			if plannedFactionAbilities[order.Type] || p.Tier < 2 || !activeHQ || cooldown(p.Cooldowns, order.Type, e.Tick()) {
				return false
			}
			if (order.Type == "disperse" || order.Type == "recovery_order") && !e.canSee(p.ID, order.Position) {
				return false
			}
		}
		cost, commandEnergy, supply := e.aiOrderReservation(p, &order)
		if credits < cost || energy < commandEnergy || freeSupply < supply {
			return false
		}
		credits, energy, freeSupply = credits-cost, energy-commandEnergy, freeSupply-supply
		if order.Kind == "ability" && aiFactionAbility(order.Type) {
			plannedFactionAbilities[order.Type] = true
		}
		for _, id := range order.Entities {
			used[id] = true
		}
		orders = append(orders, order)
		return true
	}
	add := func(v *Entity, kind string, target ID, typ string, pos Vec) bool {
		return addOrder(Order{Kind: kind, Entities: []ID{v.ID}, Target: target, Type: typ, Position: pos})
	}
	var leader *Entity
	var site *Entity
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && e.role(v) == "strategic" && v.Active(e.Tick()) {
			site = v
		}
		if !v.Active(e.Tick()) || v.Building || v.Container != 0 || v.HP*2 < v.MaxHP || e.isAircraft(v) {
			continue
		}
		if w, armed := e.weapon(v); armed && w.Kind != "tactical" && (leader == nil || distance(v.Position, goal) < distance(leader.Position, goal)) {
			leader = v
		}
	}
	beaconCount, beaconBuilders := e.aiBeaconCommitments(own)
	if p.RepairReserve != 300000 {
		orders = append(orders, Order{Kind: "repair_reserve", Index: 300})
	}
	guardSupport := func(v *Entity) {
		role := e.role(v)
		if (role == "repair" || role == "medic" || role == "mobile_abm" && !v.Deployed) && leader != nil && len(v.Orders) == 0 {
			// An owned escort may already follow this source. Keep that duty
			// rather than making the support follow its escort back.
			if e.aiGroundFollowCycle(own, v.ID, leader.ID) {
				return
			}
			add(v, "guard", leader.ID, "", leader.Position)
		}
	}
	// A ready closing operation gets its own paid intention before optional
	// beacons or another missile can consume the faction's activation budget.
	if !strategicCommitted {
		if order, ok := e.aiStrategicOrder(p, view, own, site, goal, used, freeSupply); ok {
			addOrder(order)
		}
	}
	if pulse, ok := e.aiRadarPulseOrder(p, view, own, goal, used); ok {
		addOrder(pulse)
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if aiShahedCommitted(v) || !v.Active(e.state.Tick) || v.Container != 0 || v.Channel != "" || v.DeployUntil > 0 || v.PackingUntil > 0 {
			continue
		}
		role := e.role(v)
		if role == "engineer" && len(v.Orders) == 0 {
			selected := false
			for _, target := range own {
				b, building := e.buildingRule(target.Type)
				if building && target.Complete && target.Health < 850 && b.Role != "garrison" && distance(v.Position, target.Position) < 14000 {
					add(v, "repair", target.ID, "", Vec{})
					selected = true
					break
				}
			}
			if !selected {
				for _, station := range view.Stations {
					if (station.Owner == 0 || aiActiveOpponent(p, view, station.Owner)) && !e.aiThreatNear(p, station.Position, 5000) {
						sight := int32(0)
						if u, ok := e.catalog.Unit(observed.Type); ok {
							sight = u.Sight
						}
						if observed.Private != nil && observed.Private.Ranges != nil {
							sight = observed.Private.Ranges.SightRadius
						}
						// A teammate's sight may leave before the engineer arrives.
						// Ordinary travel retains this observed coordinate through fog;
						// a later current view still authorizes the normal capture.
						if sight > 0 && dist2(observed.Position, station.Position) > int64(sight)*int64(sight) {
							add(v, "move", 0, "", station.Position)
						} else {
							add(v, "capture", station.ID, "", Vec{})
						}
						selected = true
						break
					}
				}
			}
			if !selected {
				for _, target := range view.Entities {
					if !aiActiveOpponent(p, view, target.Owner) || !target.Complete || target.Health >= 250 {
						continue
					}
					if b, ok := e.buildingRule(target.Type); ok && b.Role != "hq" && b.Role != "strategic" && target.MapObject == 0 {
						add(v, "capture", target.ID, "", Vec{})
						break
					}
				}
			}
		}
		if p.Faction == "SY" && (role == "engineer" || role == "repair") && len(v.Orders) == 0 {
			for _, crate := range view.Salvage {
				if !e.allied(p.ID, crate.Owner) && distance(v.Position, crate.Position) < 10000 && !e.aiThreatNear(p, crate.Position, 5000) {
					add(v, "salvage", crate.ID, "", Vec{})
					break
				}
			}
		}
		if role == "launcher" {
			if order, ok := e.aiLauncherOrder(p, view, v, goal, credits); ok {
				addOrder(order)
			}
		}
		if v.Type == "SA.mobile_abm" || v.Type == "SA.repair" || v.Type == "SA.tank" {
			near := e.aiGroundDeployment(p, view, own, v)
			// The current critical repair Guard is already a recovery decision.
			// Recovery emits no duplicate Guard, so preserve that physical follow
			// even when this cycle has no new intention reserving the actor.
			recovering := false
			if v.HP*100 < v.MaxHP*35 && len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target != 0 {
				source := e.aiOwnEntity(own, v.Orders[0].Target)
				recovering = source != nil && source.Active(e.Tick()) && source.Channel == "" && e.repairRate(source, v) > 0
			}
			if near && !v.Deployed && !recovering {
				add(v, "deploy", 0, "", Vec{})
			}
			if !near && v.Deployed {
				add(v, "pack", 0, "", Vec{})
			}
		}
		if p.AI == "easy" {
			guardSupport(v)
			continue
		}
		if v.Type == "US.recon" && !cooldown(v.Cooldowns, "designate", e.Tick()) {
			for _, target := range view.Entities {
				geometry := e.aiObservedGeometry(target)
				if aiActiveOpponent(p, view, target.Owner) && e.aiDesignationTarget(target) && e.edgeDistance(v, &geometry) <= 7000 {
					add(v, "ability", target.ID, "designate", Vec{})
					break
				}
			}
		}
		if v.Type == "IR.recon" && len(v.Orders) == 0 && e.aiThreatNear(p, v.Position, 12000) && p.Credits >= 1000000 {
			beacon := false
			for _, ownUnit := range own {
				if ownUnit.Type == "IR.beacon" && distance(v.Position, ownUnit.Position) < 6000 {
					beacon = true
				}
			}
			if !beacon && (beaconBuilders[v.ID] || beaconCount < 3) && e.canSee(p.ID, v.Position) {
				if add(v, "ability", 0, "beacon", v.Position) && !beaconBuilders[v.ID] {
					beaconCount++
					beaconBuilders[v.ID] = true
				}
			}
		}
		// Existing target skills keep priority over an optional sight stance.
		if e.aiReconObserveUseful(p, view, v) && add(v, "ability", 0, "observe", Vec{}) {
			continue
		}
		if e.aiRelayUseful(p, v, own, goal) {
			add(v, "ability", 0, "relay_boost", v.Position)
		}
		if p.Tier >= 2 && activeHQ {
			ability := ""
			point := v.Position
			switch {
			case role == "hq" && p.Faction == "US" && e.explored(p.ID, goal) && !e.canSee(p.ID, goal):
				ability = "recon_sweep"
				point = goal
			case v.Type == "US.airfield" && e.aiRapidSortieUseful(p, v, own):
				ability = "rapid_sortie"
			case p.Faction == "SY" && role == "hq" && leader != nil && e.aiThreatNear(p, leader.Position, 9000) && e.aiDisperseUseful(own, leader.Position):
				ability = "disperse"
				point = leader.Position
			case p.Faction == "SA" && role == "hq" && p.LowPower():
				ability = "emergency_power"
			case p.Faction == "SA" && role == "repair" && e.aiThreatNear(p, v.Position, 14000):
				ability = "recovery_order"
			}
			if ability != "" && !cooldown(p.Cooldowns, ability, e.Tick()) {
				add(v, "ability", 0, ability, point)
			}
		}
		guardSupport(v)
	}
	return orders
}

// Eligibility comes from the observed type and public catalog, never the live
// enemy entity. The ordinary execution validator still checks vision/range.
func (e *Engine) aiDesignationTarget(target EntityView) bool {
	if _, building := e.buildingRule(target.Type); building {
		return true
	}
	unit, ok := e.catalog.Unit(target.Type)
	return ok && (unit.Armor == "light" || unit.Armor == "heavy" || unit.Armor == "air" && target.Landed)
}

// Command-energy abilities share one player cooldown regardless of the chosen
// source. Per-actor skills such as designate and volley remain independent.
func aiFactionAbility(typ string) bool {
	return typ != "radar_pulse" && aiFactionEnergy(typ) > 0
}
