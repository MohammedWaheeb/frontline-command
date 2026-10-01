package sim

import "sort"

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

// Protect accepted delayed shots and unpaid jobs with available prerequisites
// and capacity. Blocked jobs leave money for recovery; a cash shortage still
// allows saving toward a legal job. Only ordinary execution spends the bank.
func (e *Engine) aiPlanningBudget(p *Player, own []EntityView) int64 {
	budget := p.Credits - e.aiCommittedVolleyCredits(p)
	for _, observed := range own {
		v := e.entity(observed.ID)
		for _, job := range v.Jobs {
			if job.Started || !v.Active(e.state.Tick) || !e.jobReady(p, v, &job) {
				continue
			}
			if _, _, _, code := e.productionAllocation(p, &job); code != "ok" && code != "insufficient_credits" {
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

// Planned service capacity includes retained outage reservations and paid
// replacement foundations. Starting production uses active capacity separately.
func (e *Engine) aiServiceMargin(own []EntityView) int32 {
	margin := int32(0)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && v.HP > 0 && v.Channel != "sell" {
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
		if !v.Active(e.state.Tick) || v.Container != 0 || v.Channel != "" || v.DeployUntil > 0 || v.PackingUntil > 0 || e.repairRate(v, unit) == 0 || e.aiThreatNear(p, v.Position, 6000) {
			continue
		}
		// Moving or explicitly servicing another recipient cannot supply the
		// promised heal. These are the same source duties ordinary support uses.
		if len(v.Orders) > 0 && (v.Orders[0].Kind != "guard" && v.Orders[0].Kind != "hold" && v.Orders[0].Kind != "repair" || v.Orders[0].Kind == "repair" && v.Orders[0].Target != unit.ID) {
			continue
		}
		if best == nil || distance(unit.Position, v.Position) < distance(unit.Position, best.Position) {
			best = v
		}
	}
	return best
}

func (e *Engine) aiCoverPosition(p *Player, unit *Entity, goal Vec) (Vec, bool) {
	var known *Engine
	return e.aiCoverPositionWithGeometry(p, unit, goal, &known)
}

// A view-only collision set is needed only for an otherwise useful cover tile.
// The caller owns the lazy slot for this unchanged pass; nothing persists in
// engine state or crosses players, ticks, or transport geometry.
func (e *Engine) aiCoverPositionWithGeometry(p *Player, unit *Entity, goal Vec, known **Engine) (Vec, bool) {
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
			// Nearby cover is optional. Do not trade a working assault for a
			// guard across a known wall or structure; use view-only swept geometry.
			if *known == nil {
				*known = e.aiPlacementKnowledge(p)
			}
			if !(*known).navigationBridgeClear(unit, point, false) {
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
func (e *Engine) aiRecoveryOrders(p *Player, own []EntityView, goal Vec, publicHold ...map[ID]bool) []Order {
	if p.AI == "easy" {
		return nil
	}
	orders := e.aiAirRecoveryOrders(p, own)
	var coverGeometry *Engine
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building || v.Container != 0 || v.Channel != "" || !v.Active(e.state.Tick) || e.role(v) == "rig" || e.role(v) == "hauler" {
			continue
		}
		if e.isAircraft(v) {
			continue
		}
		if v.DeployUntil > 0 || v.PackingUntil > 0 {
			continue
		}
		if v.HP*100 < v.MaxHP*35 {
			if v.Deployed {
				orders = append(orders, Order{Kind: "pack", Entities: []ID{v.ID}})
				continue
			}
			if source := e.aiRepairAnchor(p, v, own); source != nil {
				if len(v.Orders) == 0 || v.Orders[0].Kind != "guard" || v.Orders[0].Target != source.ID {
					orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Target: source.ID, Position: source.Position})
				}
				continue
			}
		}
		// A healthy actor selected from an active public hold keeps its exact
		// Move/Guard duty. Actual critical recovery above still wins. The lease
		// is recomputed from this player's view each cycle and expires with the
		// task or an immediate observed armed defense priority.
		if len(publicHold) > 0 && publicHold[0][v.ID] {
			continue
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target != 0 {
			target := e.aiOwnEntity(own, v.Orders[0].Target)
			recovered := target != nil && e.repairRate(target, v) > 0 && v.HP*100 >= v.MaxHP*85
			// Mobile medics/repair teams are recovery destinations too. Leaving
			// their healed followers parked forever creates reciprocal guard
			// clusters. A lost owned destination likewise cannot remain a task;
			// critically damaged units still use the normal HQ retreat below.
			orphaned := (target == nil || !target.Active(e.Tick())) && v.HP*3 >= v.MaxHP
			if recovered || orphaned {
				kind := "stop"
				if _, armed := e.weapon(v); armed {
					kind = "attack_move"
				}
				orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}, Position: goal})
				continue
			}
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target == 0 && !e.aiThreatNear(p, v.Position, 12000) {
			kind := "stop"
			if _, armed := e.weapon(v); armed {
				kind = "attack_move"
			}
			orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}, Position: goal})
			continue
		}
		if weapon, ok := e.weapon(v); ok && weapon.Kind != "tactical" && (len(v.Orders) == 0 || len(v.Orders) == 1 && v.Orders[0].Kind == "attack_move" && !v.Orders[0].Queued) {
			// Cover is optional. Keep Hold, deployed positions, committed queues
			// and an ordinary aim, volley or recent shot. LastDealt records shot
			// launch; use the same quiet window as defensive retargeting.
			if v.Deployed || v.Stance == "hold" || v.AimUntil > 0 || v.VolleyLeft > 0 || v.EverDealt && e.Tick()-v.LastDealt < seconds(3) {
				continue
			}
			if point, ok := e.aiCoverPositionWithGeometry(p, v, goal, &coverGeometry); ok {
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
	var publicAllies map[ID]EntityView
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building || v.Container != 0 || v.Channel != "" || !v.Active(e.state.Tick) || v.HP*2 < v.MaxHP {
			continue
		}
		if len(v.Orders) > 0 {
			if v.Orders[0].Kind == "escort" || e.role(v) == "fighter" && v.Orders[0].Kind == "guard" && v.Orders[0].Target != 0 {
				target := e.aiOwnEntity(own, v.Orders[0].Target)
				if target == nil {
					// Existing scenario or human orders can follow a teammate.
					// Shared sight permits preserving that task without reading
					// the ally's private queue or following it through live state.
					if publicAllies == nil {
						publicAllies = map[ID]EntityView{}
						view, _ := e.PlayerView(p.ID)
						for _, ally := range view.Entities {
							if ally.Owner != p.ID && aiActiveAlly(p, view, ally.Owner) {
								publicAllies[ally.ID] = ally
							}
						}
					}
					if ally, visible := publicAllies[v.Orders[0].Target]; visible {
						if e.role(v) == "fighter" && (ally.Landed || ally.Health < 500 || e.aiAirRouteDanger(p, v.Position, ally.Position)) {
							kind := "return"
							if v.Landed {
								kind = "stop"
							}
							orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}})
						}
						continue
					}
				}
				if e.role(v) == "fighter" && (target == nil || target.Landed || len(target.Orders) == 0 || target.Orders[0].Kind == "return" || target.HP*2 < target.MaxHP || e.aiAirRouteDanger(p, v.Position, target.Position)) {
					kind := "return"
					if v.Landed {
						kind = "stop"
					}
					orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}})
				}
				if !e.isAircraft(v) && (target == nil || !target.Active(e.Tick()) || e.aiGroundFollowCycle(own, v.ID, target.ID)) {
					orders = append(orders, Order{Kind: "stop", Entities: []ID{v.ID}})
				}
			}
			continue
		}
		role := e.role(v)
		if role != "fighter" && role != "aa" && role != "rifle" {
			continue
		}
		if role == "fighter" && !e.aiAirReady(v, own) || role != "fighter" && (p.Supply < 24 || groundEscorts >= 2) {
			continue
		}
		for _, targetView := range own {
			target := e.entity(targetView.ID)
			if target.ID == v.ID || target.Container != 0 || target.Building || escorted[target.ID] || len(target.Orders) == 0 || target.HP*2 < target.MaxHP {
				continue
			}
			if role == "fighter" {
				if !e.isAircraft(target) || target.Landed || e.role(target) == "fighter" || e.role(target) == "support_plane" || target.Orders[0].Kind == "return" || e.aiAirRouteDanger(p, v.Position, target.Position) {
					continue
				}
			} else {
				if !target.Active(e.Tick()) || target.Channel != "" || e.role(target) != "repair" && e.role(target) != "medic" || distance(v.Position, target.Position) > 12000 || e.aiGroundFollowCycle(own, v.ID, target.ID) {
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

// Read only owned follow intentions. Joining a support cycle cannot create a
// moving escort, and a saved reciprocal escort must be able to return to duty.
func (e *Engine) aiGroundFollowCycle(own []EntityView, follower, target ID) bool {
	seen := map[ID]bool{follower: true}
	for range len(own) {
		if seen[target] {
			return true
		}
		seen[target] = true
		v := e.aiOwnEntity(own, target)
		if v == nil || len(v.Orders) == 0 || v.Orders[0].Kind != "guard" && v.Orders[0].Kind != "escort" || v.Orders[0].Target == 0 {
			return false
		}
		target = v.Orders[0].Target
	}
	return true
}

// Geometry uses only the authorized view. Embarked owned actors are restored
// to this advisory copy solely so ordinary passenger-exit checks know their
// type; their Container still excludes them from ground collision.
func (e *Engine) aiGroundGeometry(p *Player, own []EntityView) *Engine {
	known := e.aiPlacementKnowledge(p)
	for _, observed := range own {
		unit := e.entity(observed.ID)
		if unit.Container != 0 {
			known.state.Entities = append(known.state.Entities, &Entity{ID: unit.ID, Owner: unit.Owner, Type: unit.Type, Position: unit.Position, HP: unit.HP, Container: unit.Container})
		}
	}
	sort.Slice(known.state.Entities, func(i, j int) bool { return known.state.Entities[i].ID < known.state.Entities[j].ID })
	return known
}

// At most 49 nearby candidates use ordinary clearance and passenger exits.
// This is a delivery intention; authoritative navigation and unloading retain
// their normal checks if unseen occupancy or changing traffic blocks it later.
func (e *Engine) aiGroundUnloadPosition(known *Engine, carrier *Entity, goal Vec) (Vec, bool) {
	legal := func(point Vec) bool {
		if !known.clear(point, e.radius(carrier), carrier.ID, false, true) {
			return false
		}
		at := *carrier
		at.Position = point
		_, exits := known.passengerExits(&at, carrier.Passengers, 2000)
		return exits
	}
	if legal(goal) {
		return goal, true
	}
	if carrier.Building {
		return Vec{}, false
	}
	for r := int32(500); r <= 3000; r += 500 {
		for _, d := range neighbors {
			point := Vec{X: goal.X + d.X*r, Y: goal.Y + d.Y*r}
			if legal(point) && (goal != carrier.Position || known.navigationBridgeClear(carrier, point, false)) {
				return point, true
			}
		}
	}
	return Vec{}, false
}

func (e *Engine) aiTransportOrders(p *Player, own []EntityView, goal Vec) []Order {
	if p.AI == "easy" {
		return nil
	}
	orders := []Order{}
	claimed := map[ID]bool{}
	transferPlanned := false
	for _, observed := range own {
		if e.entity(observed.ID).Channel == "transit" {
			transferPlanned = true
			break
		}
	}
	var known *Engine
	geometry := func() *Engine {
		if known == nil {
			known = e.aiGroundGeometry(p, own)
		}
		return known
	}
	for _, observed := range own {
		carrier := e.entity(observed.ID)
		role := e.role(carrier)
		if role != "apc" && role != "safehouse" || !carrier.Active(e.state.Tick) || carrier.Container != 0 || carrier.Channel != "" || carrier.HP*2 < carrier.MaxHP {
			continue
		}
		failedDelivery := role == "apc" && len(carrier.Passengers) > 0 && len(carrier.Orders) == 1 && carrier.Orders[0].Kind == "unload" && carrier.Blocked && e.Tick()-carrier.StationarySince >= seconds(12)
		defensiveDelivery := p.AIIntent == "defend" && len(carrier.Passengers) > 0 && (len(carrier.Orders) == 0 || len(carrier.Orders) == 1 && (carrier.Orders[0].Kind == "unload" || carrier.Orders[0].Kind == "attack_move"))
		if failedDelivery || defensiveDelivery {
			if point, ok := e.aiGroundUnloadPosition(geometry(), carrier, carrier.Position); ok {
				orders = append(orders, Order{Kind: "unload", Entities: []ID{carrier.ID}, Position: point})
			}
			continue
		}
		if len(carrier.Orders) > 0 || p.AIIntent == "defend" {
			continue
		}
		waiting := int32(0)
		for _, passengerView := range own {
			unit := e.entity(passengerView.ID)
			if !unit.Active(e.Tick()) || len(unit.Orders) == 0 || unit.Orders[0].Kind != "board" || unit.Orders[0].Target != carrier.ID {
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
			if !e.transferQuiet(carrier) || transferPlanned {
				continue
			}
			for _, targetView := range own {
				target := e.entity(targetView.ID)
				if target.ID != carrier.ID && e.role(target) == "safehouse" && target.Active(e.state.Tick) && target.Channel == "" && e.transferQuiet(target) && e.canSee(p.ID, target.Position) && !e.aiThreatNear(p, target.Position, 6000) && distance(target.Position, goal)+8000 < distance(carrier.Position, goal) && (destination == nil || distance(target.Position, goal) < distance(destination.Position, goal)) {
					if len(carrier.Passengers) > 0 {
						if _, exits := geometry().passengerExits(target, carrier.Passengers, 2000); !exits {
							continue
						}
					}
					destination = target
				}
			}
			if len(carrier.Passengers) > 0 {
				if destination != nil {
					orders = append(orders, Order{Kind: "ability", Type: "transfer", Entities: []ID{carrier.ID}, Target: destination.ID})
					transferPlanned = true
				} else if _, exits := geometry().passengerExits(carrier, carrier.Passengers, 2000); exits {
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
			if point, ok := e.aiGroundUnloadPosition(geometry(), carrier, point); ok {
				orders = append(orders, Order{Kind: "unload", Entities: []ID{carrier.ID}, Position: point})
			}
			continue
		} else if distance(carrier.Position, goal) < 18000 || e.aiThreatNear(p, carrier.Position, 9000) {
			continue
		}
		for _, passengerView := range own {
			unit := e.entity(passengerView.ID)
			unitRole := e.role(unit)
			if waiting+int32(len(carrier.Passengers)) >= e.capacity(carrier) || claimed[unit.ID] || !unit.Active(e.Tick()) || len(unit.Orders) > 0 || unit.Channel != "" || unit.Container != 0 || unit.TemporaryUntil != 0 || unit.HP*2 < unit.MaxHP || distance(unit.Position, carrier.Position) > 5000 || unitRole != "rifle" && unitRole != "at" && unitRole != "elite" {
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
