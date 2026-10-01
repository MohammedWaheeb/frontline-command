package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
)

// AI consumes the same fog-filtered view as a human. It inspects internal state
// only for its own entities, and routes decisions through normal Submit/execute.
func (e *Engine) updateAI() {
	for _, p := range e.state.Players {
		if p.AI == "" || p.Defeated {
			continue
		}
		period := seconds(2)
		if p.AI == "easy" {
			period = seconds(4)
		}
		if p.AI == "hard" {
			period = seconds(1)
		}
		if e.state.Tick-p.AILast < period {
			continue
		}
		p.AILast = e.state.Tick
		view, _ := e.PlayerView(p.ID)
		// Retire known hostile targets before observation drops defeated owners.
		// Cancellation is an ordinary command and wins the per-actor priority.
		orders := e.aiRetireDefeatedTargets(p, view)
		e.aiObserve(p, view)
		budget := p.Credits
		own := []EntityView{}
		counts := map[string]int32{}
		var rig *Entity
		var hq *Entity
		for _, v := range view.Entities {
			if v.Owner != p.ID {
				continue
			}
			own = append(own, v)
			unit := e.entity(v.ID)
			counts[e.role(unit)]++
			for _, job := range unit.Jobs {
				if u, ok := e.catalog.Unit(job.Type); ok {
					counts[u.Role]++
				}
			}
			if e.role(unit) == "rig" && len(unit.Orders) == 0 && unit.Channel == "" {
				rig = unit
			}
			if e.role(unit) == "hq" {
				hq = unit
			}
		}
		budget = e.aiPlanningBudget(p, own)
		planningCredits := budget
		needSupplyScout := true
		for _, field := range p.AIFields {
			if field.Remaining > 0 {
				needSupplyScout = false
				break
			}
		}
		// A funded legal emergency builder must reach the paid HQ foundation
		// before collector recovery can consume its credits. Probe a detached
		// budget: when the builder is unaffordable, collector bootstrap keeps
		// the existing opportunity to restore income.
		emergencyRigPlanned := false
		recoveryBudget := budget
		if recovery, ok := e.aiEmergencyRigRecovery(p, own, &recoveryBudget); ok && recovery.Kind == "train" {
			orders = append(orders, recovery)
			budget = recoveryBudget
			counts["rig"]++
			emergencyRigPlanned = true
		}
		replacementProducer := ID(0)
		if replacement, ok := e.aiReplacementHauler(p, own, &budget); ok {
			orders = append(orders, replacement)
			replacementProducer = replacement.Entities[0]
			counts["hauler"]++
		}
		serviceMargin := e.aiServiceMargin(own)
		plannedSupply := p.Supply + p.ReservedSupply
		for _, v := range own {
			for _, job := range e.entity(v.ID).Jobs {
				if !job.Started && !job.Research {
					u, _ := e.catalog.Unit(job.Type)
					plannedSupply += u.Supply
				}
			}
		}
		if !emergencyRigPlanned {
			if recovery, ok := e.aiEmergencyRigRecovery(p, own, &budget); ok {
				orders = append(orders, recovery)
				if recovery.Kind == "train" {
					counts["rig"]++
				}
			}
		}
		radarDefenseProducer := ID(0)
		buildType := ""
		expansion, expand := e.aiExpansion(p, own)
		var buildCenter Vec
		if hq != nil {
			buildCenter = hq.Position
		} else if rig != nil {
			buildCenter = rig.Position
		}
		if rig != nil {
			// Resume paid foundations after losing their original builder.
			for _, v := range own {
				foundation := e.entity(v.ID)
				if !foundation.Building || foundation.Complete {
					continue
				}
				builder := e.aiOwnEntity(own, foundation.Builder)
				working := builder != nil && builder.HP > 0 && len(builder.Orders) > 0 && builder.Orders[0].Target == foundation.ID
				if !working {
					orders = append(orders, Order{Kind: "resume", Entities: []ID{rig.ID}, Target: foundation.ID})
					rig = nil
					break
				}
			}
		}
		if rig != nil {
			switch {
			case counts["hq"] == 0:
				buildType = "hq"
			case e.aiPowerMargin(p, own) < 35:
				buildType = "power"
			case counts["power"] == 0:
				buildType = "power"
			case counts["supply"] == 0:
				buildType = "supply"
				for _, field := range p.AIFields {
					if field.Remaining > 0 && distance(field.Position, buildCenter) < 14000 {
						buildCenter = field.Position
						break
					}
				}
			case counts["barracks"] == 0:
				buildType = "barracks"
			case needSupplyScout && counts["recon"] == 0:
				// Sight must precede optional infrastructure when no supplies
				// are known. Otherwise the last credits can strand both haulers
				// and prevent buying the ordinary scout that would find income.
			case counts["factory"] == 0:
				buildType = "factory"
			case expand:
				buildCenter = expansion
				buildType = "supply"
				if !e.aiInBuildRadius(p, "supply", expansion) {
					buildType = "outpost"
				}
			case counts["radar"] == 0:
				buildType = "radar"
			case counts["airfield"]+counts["drone_hub"]+counts["workshop_air"] == 0 && p.Supply >= 18 || serviceMargin < 0:
				buildType = content.AirProducer(p.Faction)
			case counts["tech"] == 0 && p.Supply >= 28:
				buildType = "tech"
			case counts["depot"] == 0 && p.Credits > 1600000:
				buildType = "depot"
			case counts["abm"] == 0 && p.Tier >= 2 && p.Credits > 2200000:
				buildType = "abm"
			case counts["strategic"] == 0 && p.Tier == 3 && p.Credits > 5500000:
				buildType = "strategic"
			case p.Faction == "SY" && p.Tier >= 2 && counts["safehouse"] < 2 && p.Credits > 1600000:
				buildType = "SY.safehouse"
				if counts["safehouse"] > 0 {
					for _, v := range own {
						if v.Type == "outpost" && distance(v.Position, p.AIGoal) < distance(buildCenter, p.AIGoal) {
							buildCenter = v.Position
						}
					}
				}
			}
			if buildType == "radar" {
				// The first affordable public-threat defender precedes optional
				// radar savings, after essential construction and recovery.
				if defense, cost, supply, ok := e.aiFirstRadarDefense(p, view, own, orders, budget, plannedSupply); ok {
					orders = append(orders, defense)
					radarDefenseProducer = defense.Entities[0]
					budget -= cost
					plannedSupply += supply
					u, _ := e.catalog.Unit(defense.Type)
					counts[u.Role]++
					p.AIStage++
				}
			}
			if buildType != "" {
				b, _ := e.buildingRule(buildType)
				// Save toward legal future purchases, including when the current
				// bank is short. An impossible cap/prerequisite goal must not
				// consume the budget available to ordinary production.
				planning := *p
				planning.Credits = max(planning.Credits, b.Cost)
				if _, code := e.buildingCatalogRequirements(&planning, rig, buildType); code == "ok" {
					if pos, ok := e.aiConstructionPosition(p, buildType, buildCenter); ok {
						if budget >= b.Cost {
							orders = append(orders, Order{Kind: "build", Entities: []ID{rig.ID}, Type: buildType, Position: pos})
						}
						// Save toward an affordable, visible construction goal instead
						// of spending each arriving shipment on another infantry squad.
						budget = max(int64(0), budget-b.Cost)
					} else if expand && budget >= b.Cost && distance(rig.Position, expansion) > 5000 {
						orders = append(orders, Order{Kind: "move", Entities: []ID{rig.ID}, Position: expansion})
					}
				}
			}
		}
		earlyUsed := map[ID]bool{}
		for _, order := range orders {
			for _, id := range order.Entities {
				earlyUsed[id] = true
			}
		}
		// The sole builder restores construction. Save its ordinary HQ cost
		// before a charged operation or optional purchases claim those credits.
		if counts["rig"] == 0 {
			for _, v := range own {
				producer := e.entity(v.ID)
				if e.role(producer) != "hq" || !producer.Active(e.Tick()) || len(producer.Jobs) != 0 || earlyUsed[producer.ID] {
					continue
				}
				order := Order{Kind: "train", Entities: []ID{producer.ID}, Type: p.Faction + ".rig"}
				job, code := e.productionJob(p, producer, order)
				if code != "ok" || !e.jobReady(p, producer, &job) {
					continue
				}
				_, _, _, code = e.productionAllocation(p, &job)
				// Allocation errors omit prices; keep the catalog saving goal.
				u, _ := e.catalog.Unit(job.Type)
				cost, supply := u.Cost, u.Supply
				if code != "ok" && code != "insufficient_credits" || plannedSupply+supply > 100 {
					continue
				}
				if budget >= cost {
					orders = append(orders, order)
					earlyUsed[producer.ID] = true
					counts["rig"]++
					plannedSupply += supply
					p.AIStage++
				}
				budget = max(int64(0), budget-cost)
				break
			}
		}
		// A legal charged operation gets the remaining construction/recovery
		// budget before routine research and army production can consume it.
		for _, v := range own {
			site := e.entity(v.ID)
			if e.role(site) != "strategic" || !site.Active(e.Tick()) {
				continue
			}
			if order, ok := e.aiStrategicOrder(p, view, own, site, p.AIGoal, earlyUsed, max(int32(0), 100-plannedSupply)); ok {
				cost, _, supply := e.aiOrderReservation(p, &order)
				if budget >= cost && plannedSupply+supply <= 100 {
					orders = append(orders, order)
					budget -= cost
					plannedSupply += supply
				}
			}
			break
		}
		if !needSupplyScout {
			orders = append(orders, e.aiResearchOrders(p, own, &budget)...)
		}
		enemyAir, enemyArmor := false, false
		enemyAirCount := int32(0)
		for _, v := range p.AIKnowledge {
			if !aiActiveOpponent(p, view, v.Owner) || e.Tick()-v.Seen > seconds(30) {
				continue
			}
			u, ok := e.catalog.Unit(v.Type)
			if ok && u.Weapon != "" {
				if u.Armor == "air" {
					enemyAir = true
					enemyAirCount++
				}
				if u.Armor == "heavy" {
					enemyArmor = true
				}
			}
		}
		committedAirSupply := e.aiCommittedAirSupply(own)
		plannedAirSlots := map[string]int32{}
		knownAirThreat := e.aiKnownAirThreat(p)
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building && unit.Active(e.state.Tick) && len(unit.Jobs) == 0 && unit.ID != replacementProducer && unit.ID != radarDefenseProducer {
				role := e.role(unit)
				typ := ""
				switch role {
				case "supply":
					if (!needSupplyScout || counts["hauler"] == 0) && counts["hauler"] < min(int32(6), max(int32(2), counts["supply"]*2)) {
						typ = p.Faction + ".hauler"
					}
				case "hq":
					if counts["rig"] < 1 {
						typ = p.Faction + ".rig"
					}
				case "barracks":
					choose := []string{"rifle", "at", "rifle", "recon", "medic"}[p.AIStage%5]
					if choose == "medic" && counts["medic"] >= 2 || choose == "recon" && counts["recon"] >= 2 {
						choose = "rifle"
					}
					// Counters supplement the infantry screen; an unarmed hauler
					// or old sighting must not erase scouting and rifle production.
					if enemyArmor && p.AIStage%2 == 0 && counts["at"] < max(int32(1), (counts["rifle"]+counts["elite"]+1)/2) {
						choose = "at"
					}
					if choose == "at" && counts["at"] > 0 && counts["at"] >= counts["rifle"]+counts["elite"] {
						choose = "rifle"
					}
					if counts["recon"] == 0 {
						choose = "recon"
					} else if counts["engineer"] == 0 {
						choose = "engineer"
					}
					typ = p.Faction + "." + choose
				case "factory":
					if needSupplyScout && counts["recon"] == 0 {
						break
					}
					choose := []string{"car", "tank", "aa", "apc", "tank", "repair"}[p.AIStage%6]
					// Keep a small ordinary AA reserve, and scale a bounded
					// supplement to recent armed air evidence instead of replacing
					// every factory purchase with the same damage layer.
					aaLimit := max(int32(1), min(int32(4), enemyAirCount))
					if enemyAir && counts["aa"] < aaLimit {
						choose = "aa"
					}
					if choose == "aa" && counts["aa"] >= aaLimit {
						choose = "tank"
					}
					if p.Tier >= 2 && p.AIStage%7 == 6 {
						choose = "artillery"
					}
					if choose == "repair" && counts["repair"] >= 2 {
						choose = "tank"
					}
					if counts["repair"] == 0 && p.Supply >= 24 && (!enemyAir || counts["aa"] > 0) {
						choose = "repair"
					}
					if p.Tier >= 3 && p.AIStage%9 == 8 && counts["launcher"] < 2 {
						choose = "launcher"
					}
					if p.Faction == "SA" && p.Tier >= 2 && counts["mobile_abm"] == 0 && p.Supply >= 35 {
						choose = "mobile_abm"
					}
					typ = p.Faction + "." + choose
					urgent := enemyAir && counts["aa"] < aaLimit || choose == "mobile_abm"
					typ = e.aiFirstFactoryVehicle(p, unit, own, typ, budget, plannedSupply, orders, urgent)
				case "airfield", "drone_hub", "workshop_air":
					if needSupplyScout && counts["recon"] == 0 || e.aiRapidSortieUseful(p, unit, own) {
						break
					}
					choose := "strike"
					if p.Faction == "SY" {
						choose = "scout_drone"
					} else if p.Faction == "IR" && counts["isr"] == 0 {
						choose = "isr"
					} else if p.AIStage%3 == 0 && (knownAirThreat || counts["fighter"] == 0) {
						choose = "fighter"
					} else if p.AIStage%3 == 2 {
						choose = "gunship"
					}
					choose = e.aiAirFeatureChoice(p, counts, choose)
					typ = p.Faction + "." + choose
					air, valid := e.catalog.Unit(typ)
					if !valid || committedAirSupply+air.Supply > 28 || (choose == "strike" || choose == "gunship" || choose == "shahed") && (e.aiAirDanger(p, p.AIGoal) || e.aiAirRouteDanger(p, unit.Position, p.AIGoal)) {
						typ = ""
					}
				}
				if typ != "" {
					u, valid := e.catalog.Unit(typ)
					if valid && u.Tier <= p.Tier && (u.Armor != "air" || e.aiAirProductionMargin(own, u.Producer)-plannedAirSlots[u.Producer] > 0) && budget >= u.Cost+300000 && plannedSupply+u.Supply <= 100 {
						orders = append(orders, Order{Kind: "train", Entities: []ID{unit.ID}, Type: typ})
						budget -= u.Cost
						plannedSupply += u.Supply
						if u.Armor == "air" {
							plannedAirSlots[u.Producer]++
							committedAirSupply += u.Supply
						}
						counts[u.Role]++
						p.AIStage++
					}
				}
			}
		}
		goal, haveGoal := e.aiGoal(p, view)
		p.AIGoal = goal
		hasPublicTasks := view.Mission != nil && len(view.Mission.PublicTasks) > 0
		var transportOrders []Order
		hold := aiPublicHoldPlan{}
		if hasPublicTasks {
			transportOrders = e.aiTransportOrders(p, own, goal)
			holdPrior := append(append([]Order(nil), orders...), transportOrders...)
			holdPrior = e.aiChooseOrders(p, own, holdPrior, planningCredits)
			hold = e.aiPublicHoldOrders(p, view, own, holdPrior)
		}
		orders = append(orders, e.aiRecoveryOrders(p, own, goal, hold.reserved)...)
		if !hasPublicTasks {
			// Preserve the legacy recovery/transport call order for every
			// ordinary game and mission without an explicit public task.
			transportOrders = e.aiTransportOrders(p, own, goal)
		}
		orders = append(orders, transportOrders...)
		orders = append(orders, hold.orders...)
		orders = append(orders, e.aiEscortOrders(p, hold.available(own))...)
		// Choosing compacts its slice, so preserve the planning prefix explicitly.
		priorOrders := append([]Order(nil), orders...)
		priorOrders = e.aiChooseOrders(p, own, priorOrders, planningCredits)
		priorOrders = append(priorOrders, hold.claims()...)
		orders = append(orders, e.aiSpecialOrdersWithBudget(p, view, own, goal, budget, priorOrders...)...)
		if needSupplyScout && counts["recon"] == 0 {
			if scout, ok := e.aiSupplyScoutOrder(p, own, orders, period); ok {
				orders = append(orders, scout)
			}
		}
		var scoutTerrain *aiScoutTerrain
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building || unit.Container != 0 || aiShahedCommitted(unit) {
				continue
			}
			role := e.role(unit)
			u, _ := e.catalog.Unit(v.Type)
			if role == "hauler" && (len(unit.Orders) == 0 || !needSupplyScout && unit.Blocked && len(unit.Orders) == 1 && unit.Orders[0].Kind == "move" && e.Tick()-unit.StationarySince >= seconds(12)) {
				orders = append(orders, Order{Kind: "gather", Entities: []ID{v.ID}})
			}
			if unit.Channel != "" || unit.DeployUntil > 0 || unit.PackingUntil > 0 {
				continue
			}
			if hold.reserved[unit.ID] {
				continue
			}
			if recovery, ok := e.aiStalledRallyOrder(unit, own, goal); ok {
				orders = append(orders, recovery)
				continue
			}
			if e.isAircraft(unit) && (!e.aiAirReady(unit, own) || len(unit.Orders) > 0 && unit.Orders[0].Kind == "return") {
				continue
			}
			if role == "fighter" {
				if len(unit.Orders) > 0 && unit.Orders[0].Kind == "attack" && !e.aiFighterAttackVisible(p, view, unit.Orders[0].Target) {
					kind := "return"
					if unit.Landed {
						kind = "stop"
					}
					orders = append(orders, Order{Kind: kind, Entities: []ID{unit.ID}})
				} else if len(unit.Orders) == 0 {
					if target, ok := e.aiFighterTarget(p, view, unit); ok {
						orders = append(orders, Order{Kind: "attack", Entities: []ID{unit.ID}, Target: target.ID})
					} else if !unit.Landed {
						orders = append(orders, Order{Kind: "return", Entities: []ID{unit.ID}})
					}
				}
				continue
			}
			if role == "shahed" {
				if len(unit.Orders) == 0 {
					if target, ok := e.aiShahedTarget(p, view, unit, goal); ok {
						orders = append(orders, Order{Kind: "attack", Entities: []ID{unit.ID}, Target: target.ID})
					} else if haveGoal && !e.aiAirDanger(p, goal) && !e.aiAirRouteDanger(p, unit.Position, goal) {
						orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: goal})
					}
				}
				continue
			}
			if role == "recon" || role == "isr" || role == "scout_drone" {
				if unit.ReconObserve && e.aiThreatNear(p, unit.Position, e.sightRange(unit)) {
					continue
				}
				failed := len(unit.Orders) == 1 && unit.Orders[0].Kind == "move" && unit.Blocked && e.Tick()-unit.StationarySince >= seconds(12)
				if (len(unit.Orders) == 0 || failed) && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
					if !e.isAircraft(unit) && scoutTerrain == nil {
						scoutTerrain = e.aiScoutTerrainKnowledge(p)
					}
					avoid := Vec{}
					if failed {
						avoid = unit.Orders[0].Position
					}
					if scout, ok := e.aiScoutWaypoint(p, unit.Position, avoid, failed, e.isAircraft(unit), scoutTerrain); ok {
						orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: scout})
					}
				}
				continue
			}
			if u.Weapon == "" {
				continue
			}
			if !e.isAircraft(unit) && !unit.Active(e.Tick()) {
				continue
			}
			if e.isAircraft(unit) && (e.aiAirDanger(p, goal) || e.aiAirRouteDanger(p, unit.Position, goal)) {
				continue
			}
			if unit.Deployed {
				continue
			}
			if unit.HP*3 < unit.MaxHP && hq != nil && p.AI != "easy" {
				if len(unit.Orders) > 0 && unit.Orders[0].Kind == "guard" {
					if source := e.aiOwnEntity(own, unit.Orders[0].Target); source != nil && source.Active(e.Tick()) && source.Channel == "" && e.repairRate(source, unit) > 0 {
						continue
					}
				}
				if len(unit.Orders) == 0 || unit.Orders[0].Kind != "move" {
					orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: hq.Position})
				}
				continue
			}
			// A fresh observed defense goal can preempt a single AI assault
			// waypoint. Preserve queued work and units currently dealing damage;
			// ordinary movement still enforces its shared route-work budget.
			if !e.isAircraft(unit) && p.AIIntent == "defend" && len(unit.Orders) == 1 && unit.Orders[0].Kind == "attack_move" && distance(unit.Orders[0].Position, goal) > 4000 && (!unit.EverDealt || e.Tick()-unit.LastDealt >= seconds(3)) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
				continue
			}
			if haveGoal && (p.Supply >= 12 || p.AIIntent == "defend") && len(unit.Orders) == 0 && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
			}
		}

		e.aiDispatchOrders(p, e.aiChooseOrders(p, own, orders, planningCredits))
	}
}

// Rebuild the first lost collector before optional spending can consume a
// trickle of station income. All knowledge and producer state are our own;
// the shared production checks and normal train order retain real costs/limits.
func (e *Engine) aiReplacementHauler(p *Player, own []EntityView, budget *int64) (Order, bool) {
	knownSupply := false
	for _, field := range p.AIFields {
		if field.Remaining > 0 {
			knownSupply = true
			break
		}
	}
	if !knownSupply {
		return Order{}, false
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.role(v) == "hauler" || e.role(v) == "supply" && !v.IncludedHauler {
			return Order{}, false
		}
		for _, job := range v.Jobs {
			if unit, ok := e.catalog.Unit(job.Type); ok && unit.Role == "hauler" {
				return Order{}, false
			}
		}
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.role(v) != "supply" || len(v.Jobs) != 0 {
			continue
		}
		order := Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".hauler"}
		job, code := e.productionJob(p, v, order)
		if code != "ok" || !e.jobReady(p, v, &job) {
			continue
		}
		_, _, _, code = e.productionAllocation(p, &job)
		if code != "ok" && code != "insufficient_credits" {
			continue
		}
		unit, _ := e.catalog.Unit(job.Type)
		affordable := *budget >= unit.Cost
		*budget = max(int64(0), *budget-unit.Cost)
		return order, affordable
	}
	return Order{}, false
}

// A blocked factory must not indefinitely hide the only normal builder path.
// Clear one unworkable head with ordinary Cancel, then observe its real refund
// before a later paid train. Existing builders and reachable rig jobs win.
func (e *Engine) aiEmergencyRigRecovery(p *Player, own []EntityView, budget *int64) (Order, bool) {
	if e.has(p.ID, "hq") {
		return Order{}, false
	}
	blockedHead := func(v *Entity) bool {
		if len(v.Jobs) == 0 {
			return false
		}
		head := &v.Jobs[0]
		unit, _ := e.catalog.Unit(head.Type)
		if head.Emergency || unit.Role == "rig" || head.Work >= head.Required {
			return false
		}
		if !e.jobReady(p, v, head) {
			return true
		}
		if !head.Started {
			_, _, _, code := e.productionAllocation(p, head)
			return code == "supply_blocked" || code == "service_full" || code == "rig_limit" || code == "hauler_limit" || code == "elite_limit"
		}
		return false
	}
	var promised *Entity
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.role(v) == "rig" {
			return Order{}, false
		}
		for _, job := range v.Jobs {
			unit, ok := e.catalog.Unit(job.Type)
			if !ok || unit.Role != "rig" {
				continue
			}
			if e.role(v) != "factory" || !v.Active(e.Tick()) || !blockedHead(v) {
				return Order{}, false
			}
			if promised == nil {
				promised = v
			}
		}
	}
	if promised != nil {
		// The existing unpaid rig is already held by aiPlanningBudget.
		return Order{Kind: "cancel", Entities: []ID{promised.ID}, Index: 0}, true
	}
	var idle, blocked *Entity
	var idleCost, blockedCost int64
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.role(v) != "factory" || !v.Active(e.Tick()) {
			continue
		}
		// Inspect the ordinary job that will be legal when this queue is clear;
		// the copy changes no producer or reservation in the actual state.
		producer := *v
		producer.Jobs = nil
		order := Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".rig"}
		job, code := e.productionJob(p, &producer, order)
		if code != "ok" || !job.Emergency || !e.jobReady(p, &producer, &job) {
			continue
		}
		_, _, _, code = e.productionAllocation(p, &job)
		if code != "ok" && code != "insufficient_credits" {
			continue
		}
		// Preserve the ordinary emergency price even when allocation is short.
		cost, _, _ := e.aiOrderReservation(p, &order)
		if len(v.Jobs) == 0 && idle == nil {
			idle, idleCost = v, cost
		} else if blocked == nil && blockedHead(v) {
			blocked, blockedCost = v, cost
		}
	}
	if idle != nil {
		affordable := *budget >= idleCost
		*budget = max(int64(0), *budget-idleCost)
		return Order{Kind: "train", Entities: []ID{idle.ID}, Type: p.Faction + ".rig"}, affordable
	}
	if blocked != nil {
		*budget = max(int64(0), *budget-blockedCost)
		return Order{Kind: "cancel", Entities: []ID{blocked.ID}, Index: 0}, true
	}
	return Order{}, false
}

// A cash-starved opening can lack even a barracks or scout. At most once per
// twelve seconds, send one idle worker to an ordinary public exploration point.
// Productive gather tasks, cargo, construction and already planned orders win.
// Failed routes rotate through publicly reachable unexplored waypoints; no
// hidden field or collision lookup informs this choice. Movement validates it.
func (e *Engine) aiSupplyScoutOrder(p *Player, own []EntityView, planned []Order, period Tick) (Order, bool) {
	if e.Tick()%seconds(12) >= period {
		return Order{}, false
	}
	used := map[ID]bool{}
	for _, order := range planned {
		for _, id := range order.Entities {
			used[id] = true
		}
	}
	var terrain *aiScoutTerrain
	for _, role := range []string{"hauler", "rig"} {
		for _, observed := range own {
			v := e.entity(observed.ID)
			if used[v.ID] || e.role(v) != role || v.Container != 0 || !v.Active(e.Tick()) || v.Channel != "" || v.Cargo != 0 {
				continue
			}
			idle := len(v.Orders) == 0 || role == "hauler" && len(v.Orders) == 1 && v.Orders[0].Kind == "gather" && v.State == "no_known_supplies"
			failed := len(v.Orders) == 1 && v.Orders[0].Kind == "move" && v.Blocked && e.Tick()-v.StationarySince >= seconds(12)
			if !idle && !failed {
				continue
			}
			points := []Vec{}
			m := e.state.Map
			if terrain == nil {
				terrain = e.aiScoutTerrainKnowledge(p)
			}
			component := terrain.component(v.Position)
			for y := int32(6); y < m.Height-6; y += 8 {
				for x := int32(6); x < m.Width-6; x += 8 {
					point := Vec{X: x*1000 + 500, Y: y*1000 + 500}
					if !p.Explored[y*m.Width+x] && component != 0 && terrain.components[y*m.Width+x] == component && dist2(v.Position, point) >= 9000000 && (!failed || point != v.Orders[0].Position) {
						points = append(points, point)
					}
				}
			}
			if len(points) == 0 {
				continue
			}
			sort.SliceStable(points, func(i, j int) bool { return dist2(v.Position, points[i]) < dist2(v.Position, points[j]) })
			limit := min(4, len(points))
			if failed {
				limit = len(points)
			}
			point := points[p.AIScout%uint32(limit)]
			p.AIScout++
			return Order{Kind: "move", Entities: []ID{v.ID}, Position: point}, true
		}
	}
	return Order{}, false
}
func (e *Engine) aiPlacement(owner PlayerID, center Vec, width, height int32) (Vec, bool) {
	known := e.aiPlacementKnowledge(e.player(owner))
	for r := int32(4000); r <= 13000; r += 2000 {
		for _, d := range neighbors {
			p := Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500}
			if known.validPlacement(owner, p, width, height) == "ok" {
				return p, true
			}
		}
	}
	return Vec{}, false
}
func (e *Engine) aiGoal(p *Player, view View) (Vec, bool) {
	center := Vec{X: e.state.Map.Width * 500, Y: e.state.Map.Height * 500}
	for _, v := range view.Entities {
		if v.Owner == p.ID && v.Type == "hq" {
			center = v.Position
			break
		}
	}
	p.AIIntent = "scout"
	bestID := ID(0)
	bestDistance := int64(1 << 62)
	bestArmed := false
	defense := Vec{}
	for _, enemy := range view.Entities {
		if !aiActiveOpponent(p, view, enemy.Owner) {
			continue
		}
		weapon := ""
		if u, ok := e.catalog.Unit(enemy.Type); ok {
			weapon = u.Weapon
		} else if b, ok := e.buildingRule(enemy.Type); ok {
			weapon = b.Weapon
		}
		w, hasWeapon := e.catalog.Weapon(weapon)
		// Compare only observed threats to the public allied economy. Air-only
		// weapons cannot outrank a weapon that can damage this ground asset.
		for _, own := range view.Entities {
			if !aiActiveAlly(p, view, own.Owner) {
				continue
			}
			role, armor := "", ""
			if b, ok := e.buildingRule(own.Type); ok {
				role, armor = b.Role, "structure"
			}
			if u, ok := e.catalog.Unit(own.Type); ok {
				role, armor = u.Role, u.Armor
			}
			if role != "hq" && role != "supply" && role != "hauler" || distance(own.Position, enemy.Position) >= 14000 {
				continue
			}
			armed := enemy.Complete && enemy.Enabled && hasWeapon && (w.Kind == "tactical" || e.catalog.Multiplier(w.Kind, armor) > 0)
			d := dist2(own.Position, enemy.Position)
			if bestID == 0 || armed && !bestArmed || armed == bestArmed && (d < bestDistance || d == bestDistance && enemy.ID < bestID) {
				bestID, bestDistance, bestArmed, defense = enemy.ID, d, armed, enemy.Position
			}
		}
	}
	if bestID != 0 {
		p.AIIntent = "defend"
		return defense, true
	}
	// The announced endgame pulse gives positions only. It may guide ordinary
	// movement toward a surviving economy, never a target ID or firing vision.
	if goal, ok := aiIndicatorGoal(p, view, center); ok {
		p.AIIntent = "pressure"
		return goal, true
	}
	score := int64(1 << 62)
	goal := Vec{}
	for _, enemy := range p.AIKnowledge {
		if !aiActiveOpponent(p, view, enemy.Owner) {
			continue
		}
		d := dist2(center, enemy.Position)
		if b, ok := e.buildingRule(enemy.Type); ok && b.Qualifying {
			d /= 2
		}
		if d < score {
			goal = enemy.Position
			score = d
		}
	}
	if score < int64(1<<62) {
		p.AIIntent = "pressure"
		return goal, true
	}
	return e.aiExplore(p, center), true
}
func (e *Engine) aiExplore(p *Player, from Vec) Vec {
	if point, ok := e.aiScoutWaypoint(p, from, Vec{}, false, false, nil); ok {
		return point
	}
	return from
}

type aiScoutTerrain struct {
	width, height int32
	components    []uint32
}

func (terrain *aiScoutTerrain) component(point Vec) uint32 {
	if point.X < 0 || point.Y < 0 || point.X >= terrain.width*1000 || point.Y >= terrain.height*1000 {
		return 0
	}
	return terrain.components[point.Y/1000*terrain.width+point.X/1000]
}

// Ground exploration uses bounded floods over public authored terrain only.
// Observed rubble is included, while globally changed rubble remains hidden.
// Dynamic occupancy and exact movement-class clearance remain the ordinary
// route executor's responsibility. This derived local context is shared across
// one planning cycle; it contains no persistent cache or scouting decisions.
func (e *Engine) aiScoutTerrainKnowledge(p *Player) *aiScoutTerrain {
	m := e.aiPlanningMap(p)
	terrain := &aiScoutTerrain{width: m.Width, height: m.Height, components: make([]uint32, len(m.Tiles))}
	queue := make([]int32, 0, len(m.Tiles))
	component := uint32(0)
	for start, tile := range m.Tiles {
		if terrain.components[start] != 0 || !tile.Passable() {
			continue
		}
		component++
		terrain.components[start] = component
		queue = append(queue[:0], int32(start))
		for n := 0; n < len(queue); n++ {
			index := queue[n]
			x, y := index%m.Width, index/m.Width
			for _, d := range neighbors[:4] {
				nx, ny := x+d.X, y+d.Y
				if nx < 0 || ny < 0 || nx >= m.Width || ny >= m.Height {
					continue
				}
				next := ny*m.Width + nx
				if terrain.components[next] == 0 && m.Tiles[next].Passable() {
					terrain.components[next] = component
					queue = append(queue, next)
				}
			}
		}
	}
	return terrain
}

// A failed route is evidence about our own task, not hidden enemy occupancy.
// Rotate the saved cursor through alternatives instead of retrying the same
// nearest point forever. Air scouts avoid only remembered antiair coverage.
func (e *Engine) aiScoutWaypoint(p *Player, from, avoid Vec, retry, air bool, terrain *aiScoutTerrain) (Vec, bool) {
	m := e.state.Map
	component := uint32(0)
	if !air {
		if terrain == nil {
			terrain = e.aiScoutTerrainKnowledge(p)
		}
		component = terrain.component(from)
	}
	unexplored, fogged := []Vec{}, []Vec{}
	for y := int32(6); y < m.Height-6; y += 8 {
		for x := int32(6); x < m.Width-6; x += 8 {
			idx := y*m.Width + x
			pt := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			d := dist2(from, pt)
			if d < 9000000 || retry && pt == avoid || !air && (component == 0 || terrain.components[idx] != component) || air && (e.aiAirDanger(p, pt) || e.aiAirRouteDanger(p, from, pt)) {
				continue
			}
			if !p.Explored[idx] {
				unexplored = append(unexplored, pt)
			} else if !e.canSee(p.ID, pt) && d >= 16000000 {
				fogged = append(fogged, pt)
			}
		}
	}
	if len(unexplored) > 0 {
		if !retry {
			best := unexplored[0]
			for _, point := range unexplored[1:] {
				if dist2(from, point) < dist2(from, best) {
					best = point
				}
			}
			return best, true
		}
		sort.SliceStable(unexplored, func(i, j int) bool { return dist2(from, unexplored[i]) < dist2(from, unexplored[j]) })
		index := p.AIScout % uint32(len(unexplored))
		p.AIScout++
		return unexplored[index], true
	}
	// Explored is permanent knowledge, not current sight. When the whole
	// scout grid is known, revisit fog in a saved deterministic rotation.
	if len(fogged) > 0 {
		index := p.AIScout % uint32(len(fogged))
		p.AIScout = (index + 1) % uint32(len(fogged))
		return fogged[index], true
	}
	return from, false
}

// A confirmed failed producer rally releases healthy support for ordinary
// role work. Ground fighters retain the existing changed-goal assault recovery;
// queued tasks, channels, deployment and recent or damaged movement stay intact.
func (e *Engine) aiStalledRallyOrder(v *Entity, own []EntityView, goal Vec) (Order, bool) {
	if !v.Active(e.Tick()) || !v.Blocked || e.Tick()-v.StationarySince < seconds(12) || v.HP*100 < v.MaxHP*85 || v.Channel != "" || v.Container != 0 || v.Deployed || v.DeployUntil > 0 || v.PackingUntil > 0 || e.isAircraft(v) || len(v.Orders) != 1 {
		return Order{}, false
	}
	u, ok := e.catalog.Unit(v.Type)
	if !ok {
		return Order{}, false
	}
	if u.Weapon == "" {
		if u.Role != "engineer" && u.Role != "medic" && u.Role != "repair" || v.Orders[0].Kind != "move" || v.Orders[0].Queued {
			return Order{}, false
		}
		for _, observed := range own {
			if observed.Owner != v.Owner || observed.Private == nil || !observed.Complete || observed.Private.Rally != v.Orders[0].Position {
				continue
			}
			if b, ok := e.buildingRule(observed.Type); ok && b.Role == u.Producer {
				return Order{Kind: "stop", Entities: []ID{v.ID}}, true
			}
		}
		return Order{}, false
	}
	if u.Role == "recon" || v.Orders[0].Position == goal {
		return Order{}, false
	}
	if v.Orders[0].Kind == "attack_move" {
		return Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal}, true
	}
	if v.Orders[0].Kind != "move" {
		return Order{}, false
	}
	for _, observed := range own {
		if observed.Private == nil || !observed.Complete || observed.Private.Rally != v.Orders[0].Position {
			continue
		}
		if b, ok := e.buildingRule(observed.Type); ok && b.Role == u.Producer {
			return Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal}, true
		}
	}
	return Order{}, false
}
