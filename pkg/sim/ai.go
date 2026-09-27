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
		orders := []Order{}
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
			case counts["barracks"] == 0:
				buildType = "barracks"
			case counts["factory"] == 0:
				buildType = "factory"
			case counts["radar"] == 0:
				buildType = "radar"
			case counts["airfield"]+counts["drone_hub"]+counts["workshop_air"] == 0 && p.Credits > 2400000:
				buildType = content.AirProducer(p.Faction)
			case counts["tech"] == 0 && p.Credits > 3200000:
				buildType = "tech"
			case counts["depot"] == 0 && p.Credits > 1600000:
				buildType = "depot"
			case counts["abm"] == 0 && p.Tier >= 2 && p.Credits > 2200000:
				buildType = "abm"
			case counts["strategic"] == 0 && p.Tier == 3 && p.Credits > 5500000:
				buildType = "strategic"
			}
			if buildType != "" {
				b, _ := e.catalog.Building(buildType)
				if p.Credits >= b.Cost && e.prerequisites(p, b.Prerequisites) {
					center := rig.Position
					if hq != nil {
						center = hq.Position
					}
					if pos, ok := e.aiPlacement(p.ID, center, b.Width, b.Height); ok {
						orders = append(orders, Order{Kind: "build", Entities: []ID{rig.ID}, Type: buildType, Position: pos})
					}
				}
			}
		}
		enemyAir, enemyArmor := false, false
		for _, v := range view.Entities {
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
					if counts["hauler"] < 2 {
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
				}
				if typ != "" {
					u, _ := e.catalog.Unit(typ)
					if p.Credits >= u.Cost+300000 && p.Supply+p.ReservedSupply+u.Supply <= 100 {
						orders = append(orders, Order{Kind: "train", Entities: []ID{unit.ID}, Type: typ})
						p.AIStage++
					}
				}
				if role == "radar" && p.Credits > 2400000 && !p.HasUpgrade("weapons_training") {
					orders = append(orders, Order{Kind: "research", Entities: []ID{unit.ID}, Type: "weapons_training"})
				}
			}
		}
		goal, haveGoal := e.aiGoal(p, view)
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
			if unit.HP*3 < unit.MaxHP && hq != nil && p.AI != "easy" {
				if len(unit.Orders) == 0 || unit.Orders[0].Kind != "move" {
					orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: hq.Position})
				}
				continue
			}
			if haveGoal && p.Supply >= 12 && len(unit.Orders) == 0 && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
			}
		}
		if len(orders) > 32 {
			orders = orders[:32]
		}
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
	for _, v := range view.Entities {
		if !e.allied(p.ID, v.Owner) {
			return v.Position, true
		}
	}
	for i := len(view.Memory) - 1; i >= 0; i-- {
		if !e.allied(p.ID, view.Memory[i].Owner) {
			return view.Memory[i].Position, true
		}
	}
	return e.aiExplore(p, e.state.Map.Spawns[0].Position), true
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
