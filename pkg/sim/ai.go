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
		needSupplyScout := true
		for _, field := range p.AIFields {
			if field.Remaining > 0 {
				needSupplyScout = false
				break
			}
		}
		replacementProducer := ID(0)
		if counts["hq"] > 0 && counts["supply"] > 0 && counts["power"] > 0 && e.aiPowerMargin(p, own) >= 35 {
			if replacement, ok := e.aiReplacementHauler(p, own, &budget); ok {
				orders = append(orders, replacement)
				replacementProducer = replacement.Entities[0]
				counts["hauler"]++
			}
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
		if hq == nil && rig == nil {
			for _, v := range own {
				if e.role(e.entity(v.ID)) == "factory" && len(v.Private.Jobs) == 0 {
					order := Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".rig"}
					producer := e.entity(v.ID)
					job, code := e.productionJob(p, producer, order)
					if code != "ok" || !e.jobReady(p, producer, &job) {
						continue
					}
					orders = append(orders, order)
					budget = max(int64(0), budget-1200000)
					break
				}
			}
		}
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
				if builder == nil || builder.HP <= 0 || len(builder.Orders) == 0 {
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
			if buildType != "" {
				b, _ := e.buildingRule(buildType)
				if e.prerequisites(p, b.Prerequisites) {
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
		if !needSupplyScout {
			orders = append(orders, e.aiResearchOrders(p, own, &budget)...)
		}
		enemyAir, enemyArmor := false, false
		for _, v := range p.AIKnowledge {
			if !aiActiveOpponent(p, view, v.Owner) {
				continue
			}
			u, ok := e.catalog.Unit(v.Type)
			if ok {
				if u.Armor == "air" {
					enemyAir = true
				}
				if u.Armor == "heavy" {
					enemyArmor = true
				}
			}
		}
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building && unit.Active(e.state.Tick) && len(unit.Jobs) == 0 && unit.ID != replacementProducer {
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
					if counts["recon"] == 0 {
						choose = "recon"
					}
					if counts["engineer"] == 0 && counts["recon"] > 0 {
						choose = "engineer"
					}
					if choose == "medic" && counts["medic"] >= 2 || choose == "recon" && counts["recon"] >= 2 {
						choose = "rifle"
					}
					if enemyArmor && p.AIStage%2 == 0 {
						choose = "at"
					}
					typ = p.Faction + "." + choose
				case "factory":
					if needSupplyScout && counts["recon"] == 0 {
						break
					}
					choose := []string{"car", "tank", "aa", "apc", "tank", "repair"}[p.AIStage%6]
					if enemyAir {
						choose = "aa"
					}
					if p.Tier >= 2 && p.AIStage%7 == 6 {
						choose = "artillery"
					}
					if choose == "repair" && counts["repair"] >= 2 {
						choose = "tank"
					}
					if counts["repair"] == 0 && p.Supply >= 24 && !enemyAir {
						choose = "repair"
					}
					if p.Tier >= 3 && p.AIStage%9 == 8 && counts["launcher"] < 2 {
						choose = "launcher"
					}
					if p.Faction == "SA" && p.Tier >= 2 && counts["mobile_abm"] == 0 && p.Supply >= 35 {
						choose = "mobile_abm"
					}
					typ = p.Faction + "." + choose
				case "airfield", "drone_hub", "workshop_air":
					if needSupplyScout && counts["recon"] == 0 {
						break
					}
					choose := "strike"
					if p.Faction == "SY" {
						choose = "scout_drone"
					} else if p.Faction == "IR" && counts["isr"] == 0 {
						choose = "isr"
					} else if p.AIStage%3 == 0 {
						choose = "fighter"
					}
					typ = p.Faction + "." + choose
					airSupply := int32(0)
					for _, v := range own {
						if u, ok := e.catalog.Unit(v.Type); ok && u.Armor == "air" {
							airSupply += u.Supply
						}
					}
					if airSupply >= 28 || choose == "fighter" && !enemyAir && counts["fighter"] >= 1 || choose == "strike" && e.aiAirDanger(p, p.AIGoal) {
						typ = ""
					}
				}
				if typ != "" {
					u, valid := e.catalog.Unit(typ)
					if valid && u.Tier <= p.Tier && (u.Armor != "air" || serviceMargin > 0) && budget >= u.Cost+300000 && plannedSupply+u.Supply <= 100 {
						orders = append(orders, Order{Kind: "train", Entities: []ID{unit.ID}, Type: typ})
						budget -= u.Cost
						plannedSupply += u.Supply
						if u.Armor == "air" {
							serviceMargin--
						}
						counts[u.Role]++
						p.AIStage++
					}
				}
			}
		}
		goal, haveGoal := e.aiGoal(p, view)
		p.AIGoal = goal
		orders = append(orders, e.aiRecoveryOrders(p, own, goal)...)
		orders = append(orders, e.aiTransportOrders(p, own, goal)...)
		orders = append(orders, e.aiEscortOrders(p, own)...)
		orders = append(orders, e.aiSpecialOrders(p, view, own, goal)...)
		if needSupplyScout && counts["recon"] == 0 {
			if scout, ok := e.aiSupplyScoutOrder(p, own, orders, period); ok {
				orders = append(orders, scout)
			}
		}
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building || unit.Container != 0 {
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
			if role == "recon" || role == "isr" || role == "scout_drone" {
				if len(unit.Orders) == 0 && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
					scout := e.aiExplore(p, unit.Position)
					orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: scout})
				}
				continue
			}
			if u.Weapon == "" {
				continue
			}
			if e.isAircraft(unit) && (unit.ServiceWork > 0 || len(unit.Orders) > 0 && unit.Orders[0].Kind == "return" || e.aiAirDanger(p, goal) && role != "fighter") {
				continue
			}
			if unit.Deployed {
				continue
			}
			if unit.HP*3 < unit.MaxHP && hq != nil && p.AI != "easy" {
				if len(unit.Orders) > 0 && unit.Orders[0].Kind == "guard" {
					if source := e.aiOwnEntity(own, unit.Orders[0].Target); source != nil && e.repairRate(source, unit) > 0 {
						continue
					}
				}
				if len(unit.Orders) == 0 || unit.Orders[0].Kind != "move" {
					orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: hq.Position})
				}
				continue
			}
			if haveGoal && (p.Supply >= 12 || p.AIIntent == "defend") && len(unit.Orders) == 0 && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
			}
		}

		// One chosen intention per unit per planning cycle. A later generic
		// movement order must not cancel an accepted channel or deployment.
		used := map[ID]bool{}
		chosen := orders[:0]
		for _, order := range orders {
			conflict := false
			for _, id := range order.Entities {
				if used[id] {
					conflict = true
				}
			}
			if conflict {
				continue
			}
			chosen = append(chosen, order)
			for _, id := range order.Entities {
				used[id] = true
			}
			if len(chosen) == 32 {
				break
			}
		}
		orders = chosen

		if len(orders) > 0 {
			_ = e.Submit(p.ID, p.LastSequence+1, orders)
		}
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
		if e.role(v) == "hauler" {
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

// A cash-starved opening can lack even a barracks or scout. At most once per
// twelve seconds, send one idle worker to an ordinary public exploration point.
// Productive gather tasks, cargo, construction and already planned orders win.
// Failed routes rotate among nearby unexplored waypoints; no hidden field or
// collision lookup informs this choice. Actual movement validates the route.
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
			for y := int32(6); y < m.Height-6; y += 8 {
				for x := int32(6); x < m.Width-6; x += 8 {
					point := Vec{X: x*1000 + 500, Y: y*1000 + 500}
					if !p.Explored[y*m.Width+x] && m.Tiles[y*m.Width+x].Passable() && distance(v.Position, point) >= 3000 && (!failed || point != v.Orders[0].Position) {
						points = append(points, point)
					}
				}
			}
			if len(points) == 0 {
				continue
			}
			sort.SliceStable(points, func(i, j int) bool { return dist2(v.Position, points[i]) < dist2(v.Position, points[j]) })
			point := points[p.AIScout%uint32(min(4, len(points)))]
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
	for _, enemy := range view.Entities {
		if !aiActiveOpponent(p, view, enemy.Owner) {
			continue
		}
		for _, own := range view.Entities {
			if own.Owner != p.ID {
				continue
			}
			role := ""
			if b, ok := e.buildingRule(own.Type); ok {
				role = b.Role
			}
			if u, ok := e.catalog.Unit(own.Type); ok {
				role = u.Role
			}
			if (role == "hq" || role == "supply" || role == "hauler") && distance(own.Position, enemy.Position) < 14000 {
				p.AIIntent = "defend"
				return enemy.Position, true
			}
		}
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
	m := e.state.Map
	best := Vec{X: m.Width * 500, Y: m.Height * 500}
	score := int64(-1)
	for y := int32(6); y < m.Height-6; y += 8 {
		for x := int32(6); x < m.Width-6; x += 8 {
			idx := y*m.Width + x
			if p.Explored[idx] || !m.Tiles[idx].Passable() {
				continue
			}
			pt := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			s := int64(10000000000) - dist2(from, pt)
			if s > score {
				score = s
				best = pt
			}
		}
	}
	if score >= 0 {
		return best
	}
	// Explored is permanent knowledge, not current sight. When the whole
	// scout grid is known, revisit fog in a saved deterministic rotation.
	points := []Vec{}
	for y := int32(6); y < m.Height-6; y += 8 {
		for x := int32(6); x < m.Width-6; x += 8 {
			if m.Tiles[y*m.Width+x].Passable() {
				points = append(points, Vec{X: x*1000 + 500, Y: y*1000 + 500})
			}
		}
	}
	for offset := 0; offset < len(points); offset++ {
		index := (int(p.AIScout%uint32(len(points))) + offset) % len(points)
		point := points[index]
		if !e.canSee(p.ID, point) && distance(from, point) >= 4000 {
			p.AIScout = uint32((index + 1) % len(points))
			return point
		}
	}
	return best
}
