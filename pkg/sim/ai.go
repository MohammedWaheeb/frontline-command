package sim

import "frontlinecommand/pkg/content"

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
		e.aiObserve(p, view)
		orders := []Order{}
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
		if hq == nil && rig == nil {
			for _, v := range own {
				if e.role(e.entity(v.ID)) == "factory" && len(v.Private.Jobs) == 0 {
					orders = append(orders, Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".rig"})
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
				builder := e.entity(foundation.Builder)
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
			case p.PowerCapacity-p.PowerDemand < 35 && counts["power"] < 6:
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
			case counts["airfield"]+counts["drone_hub"]+counts["workshop_air"] == 0 && p.Supply >= 18:
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
			}
			if buildType != "" {
				b, _ := e.buildingRule(buildType)
				budget = max(int64(0), budget-b.Cost)
				if p.Credits >= b.Cost && e.prerequisites(p, b.Prerequisites) {
					if pos, ok := e.aiConstructionPosition(p, buildType, buildCenter); ok {
						orders = append(orders, Order{Kind: "build", Entities: []ID{rig.ID}, Type: buildType, Position: pos})
					} else if expand && distance(rig.Position, expansion) > 5000 {
						orders = append(orders, Order{Kind: "move", Entities: []ID{rig.ID}, Position: expansion})
					}
				}
			}
		}
		enemyAir, enemyArmor := false, false
		for _, v := range p.AIKnowledge {
			if e.allied(p.ID, v.Owner) {
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
			if unit.Building && unit.Active(e.state.Tick) && len(unit.Jobs) == 0 {
				role := e.role(unit)
				typ := ""
				switch role {
				case "supply":
					if counts["hauler"] < min(int32(8), max(int32(2), counts["supply"]*2)) {
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
					if p.Tier >= 3 && p.AIStage%9 == 8 && counts["launcher"] < 2 {
						choose = "launcher"
					}
					if p.Faction == "SA" && p.Tier >= 2 && counts["mobile_abm"] == 0 && p.Supply >= 35 {
						choose = "mobile_abm"
					}
					typ = p.Faction + "." + choose
				case "airfield", "drone_hub", "workshop_air":
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
					u, _ := e.catalog.Unit(typ)
					if budget >= u.Cost+300000 && p.Supply+p.ReservedSupply+u.Supply <= 100 {
						orders = append(orders, Order{Kind: "train", Entities: []ID{unit.ID}, Type: typ})
						budget -= u.Cost
						counts[u.Role]++
						p.AIStage++
					}
				}
				if role == "radar" && budget > 2400000 && !p.HasUpgrade("weapons_training") {
					orders = append(orders, Order{Kind: "research", Entities: []ID{unit.ID}, Type: "weapons_training"})
				}
			}
		}
		goal, haveGoal := e.aiGoal(p, view)
		p.AIGoal = goal
		orders = append(orders, e.aiSpecialOrders(p, view, own, goal)...)
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building || unit.Container != 0 {
				continue
			}
			role := e.role(unit)
			u, _ := e.catalog.Unit(v.Type)
			if role == "hauler" && len(unit.Orders) == 0 {
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
func (e *Engine) aiPlacement(owner PlayerID, center Vec, width, height int32) (Vec, bool) {
	for r := int32(4000); r <= 13000; r += 2000 {
		for _, d := range neighbors {
			p := Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500}
			if e.validPlacement(owner, p, width, height) == "ok" {
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
		if enemy.Owner == 0 || e.allied(p.ID, enemy.Owner) {
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
	score := int64(1 << 62)
	goal := Vec{}
	for _, enemy := range p.AIKnowledge {
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
	return best
}
