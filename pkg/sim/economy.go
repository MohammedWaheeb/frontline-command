package sim

import "sort"

func (e *Engine) updateEconomy() {
	for _, p := range e.state.Players {
		if p.Defeated {
			continue
		}
		if e.has(p.ID, "hq") {
			gain := int64(25)
			if p.LowPower() {
				gain = 0
				if e.state.Tick%2 == 0 {
					gain = 25
				}
			}
			p.Energy = min64(100000, p.Energy+gain)
		}
	}
	for _, v := range e.state.Entities {
		p := e.player(v.Owner)
		if p == nil || p.Defeated || v.HP <= 0 || !v.Building {
			continue
		}
		b, _ := e.buildingRule(v.Type)
		if !v.Complete {
			rig := e.entity(v.Builder)
			if rig == nil || rig.HP <= 0 || rig.Container != 0 || len(rig.Orders) == 0 || rig.Orders[0].Kind != "build" || rig.Orders[0].Target != v.ID || e.edgeDistance(rig, v) > 1100 || !e.prerequisites(p, b.Prerequisites) {
				continue
			}
			work := uint32(2)
			if p.LowPower() {
				work = 1
			}
			oldCap := b.HP/10 + b.HP*9*int64(v.Work)/(10*int64(b.BuildTicks*2))
			v.Work = min(b.BuildTicks*2, v.Work+work)
			newCap := b.HP/10 + b.HP*9*int64(v.Work)/(10*int64(b.BuildTicks*2))
			v.HP += newCap - oldCap
			rig.State = "building"
			if v.Work == b.BuildTicks*2 {
				v.Complete = true
				v.State = "idle"
				rig.Orders = nil
				rig.State = "idle"
				e.emit("construction_complete", p.ID, v.ID, v.Position, "owner", 0)
			}
		}
		if v.Complete && b.Role == "supply" && !v.IncludedHauler {
			if pos, ok := e.exitPosition(v, p.Faction+".hauler", 0, 6000); ok {
				hauler := e.spawn(p.Faction+".hauler", p.ID, pos, true, 900000)
				v.IncludedHauler = true
				e.assign(hauler, Order{Kind: "gather"})
				e.emit("unit_ready", p.ID, hauler.ID, pos, "owner", 0)
			}
		}
		if v.Active(e.state.Tick) {
			e.updateJobs(p, v)
		}
	}
	e.updateHarvest()
	for _, s := range e.state.Stations {
		if p := e.player(s.Owner); p != nil && !p.Defeated {
			p.Credits += 100
			p.Income += 100
		}
	}
	empty := true
	for _, f := range e.state.Fields {
		if f.Remaining > 0 {
			empty = false
			break
		}
	}
	if empty && e.state.ShipmentAt == 0 {
		e.state.ShipmentAt = e.state.Tick + seconds(180)
		e.emit("shipment_countdown", 0, 0, e.state.Map.Shipment, "all", int64(e.state.ShipmentAt))
	}
	if e.state.ShipmentAt > 0 && e.state.Tick >= e.state.ShipmentAt {
		maxID := uint32(0)
		for _, f := range e.state.Fields {
			if f.ID > maxID {
				maxID = f.ID
			}
		}
		e.state.Fields = append(e.state.Fields, &ResourceField{ID: maxID + 1, Position: e.state.Map.Shipment, Remaining: 6000000})
		e.state.ShipmentAt = 0
		e.emit("shipment_arrived", 0, 0, e.state.Map.Shipment, "all", 6000000)
	}
}
func (e *Engine) jobReady(p *Player, v *Entity, j *Job) bool {
	b, _ := e.buildingRule(v.Type)
	if !j.Emergency && !e.prerequisites(p, b.Prerequisites) {
		return false
	}
	if j.Research {
		u, _ := e.catalog.Upgrade(j.Type)
		return p.Tier >= u.Tier && e.has(p.ID, u.Producer)
	}
	u, _ := e.catalog.Unit(j.Type)
	if p.Tier < u.Tier {
		return false
	}
	if j.Emergency {
		return true
	}
	if !e.has(p.ID, u.Producer) {
		return false
	}
	return true
}
func (e *Engine) freeService(p PlayerID) ID {
	for _, v := range e.state.Entities {
		if v.Owner != p || !v.Building || !v.Complete || v.HP <= 0 {
			continue
		}
		b, _ := e.buildingRule(v.Type)
		if b.ServiceSlots == 0 {
			continue
		}
		used := int32(0)
		for _, a := range e.state.Entities {
			if a.HP > 0 && a.Home == v.ID {
				used++
			}
			for _, j := range a.Jobs {
				if j.Started && j.Service == v.ID {
					used++
				}
			}
		}
		if used < b.ServiceSlots {
			return v.ID
		}
	}
	return 0
}
func (e *Engine) updateJobs(p *Player, v *Entity) {
	if len(v.Jobs) == 0 {
		return
	}
	j := &v.Jobs[0]
	if !e.jobReady(p, v, j) {
		v.State = "prerequisite_lost"
		return
	}
	if !j.Started {
		var cost int64
		var supply int32
		var service ID
		if j.Research {
			u, _ := e.catalog.Upgrade(j.Type)
			cost = u.Cost
			if p.HasUpgrade(u.ID) {
				v.Jobs = v.Jobs[1:]
				return
			}
		} else {
			u, _ := e.catalog.Unit(j.Type)
			cost = u.Cost
			supply = u.Supply
			if j.Emergency {
				cost = 1200000
			}
			if p.Supply+p.ReservedSupply+supply > 100 {
				v.State = "supply_blocked"
				return
			}
			limits := map[string]int32{"rig": 4, "hauler": 8, "elite": 1}
			if cap, ok := limits[u.Role]; ok && e.countRole(p.ID, u.Role, true) >= cap {
				v.State = u.Role + "_limit"
				return
			}
			if u.Armor == "air" {
				service = e.freeService(p.ID)
				if service == 0 {
					v.State = "service_full"
					return
				}
			}
		}
		if p.Credits < cost {
			v.State = "insufficient_credits"
			return
		}
		p.Credits -= cost
		p.Spent += cost
		j.Paid = cost
		j.Supply = supply
		j.Service = service
		j.Started = true
		e.recalculate()
	}
	work := uint32(2)
	if p.LowPower() {
		work = 1
	}
	j.Work = min(j.Required, j.Work+work)
	v.State = "producing"
	if j.Work < j.Required {
		return
	}
	if j.Research {
		p.Upgrades = append(p.Upgrades, j.Type)
		sort.Strings(p.Upgrades)
		e.applyUpgrade(p, j.Type)
		e.emit("research_complete", p.ID, v.ID, v.Position, "owner", 0)
	} else {
		pos, ok := e.exitPosition(v, j.Type, 0, 6000)
		if u, found := e.catalog.Unit(j.Type); found && u.Armor == "air" && j.Service == v.ID {
			pos = v.Position
			ok = true
		}
		if !ok {
			v.State = "exit_blocked"
			return
		}
		unit := e.spawn(j.Type, p.ID, pos, true, j.Paid)
		unit.Home = j.Service
		if e.isAircraft(unit) {
			unit.Landed = true
			if home := e.entity(unit.Home); home != nil && home.ID == v.ID {
				unit.Position = e.landingPoint(unit, home)
				unit.LastPosition = unit.Position
				unit.Anchor = unit.Position
			}
			unit.State = "landed"
			if unit.Home != v.ID {
				unit.Landed = false
				unit.Orders = []Order{{Kind: "return"}}
				unit.State = "returning"
			}
		} else if e.role(unit) == "hauler" {
			e.assign(unit, Order{Kind: "gather"})
		} else if distance(pos, v.Rally) > 300 {
			e.assign(unit, Order{Kind: "move", Position: v.Rally})
		}
		e.emit("unit_ready", p.ID, unit.ID, pos, "owner", 0)
	}
	v.Jobs = v.Jobs[1:]
	v.State = "idle"
	e.recalculate()
}
func (e *Engine) applyUpgrade(p *Player, id string) {
	if id != "vehicle_armor" {
		return
	}
	for _, v := range e.state.Entities {
		if v.Owner != p.ID || v.HP <= 0 || v.Building || v.TemporaryUntil > 0 {
			continue
		}
		u, _ := e.catalog.Unit(v.Type)
		if u.Armor != "light" && u.Armor != "heavy" {
			continue
		}
		old := v.MaxHP
		v.MaxHP = u.HP * 110 / 100
		if v.Rank >= 2 {
			v.MaxHP = v.MaxHP * 110 / 100
		}
		v.HP = v.HP * v.MaxHP / old
	}
}
func (e *Engine) chooseField(v *Entity) *ResourceField {
	var best *ResourceField
	bestScore := int64(1 << 62)
	for _, f := range e.state.Fields {
		if f.Remaining <= 0 || !e.explored(v.Owner, f.Position) {
			continue
		}
		score := dist2(v.Position, f.Position) + int64(len(f.Queue))*4000000
		if score < bestScore {
			best, bestScore = f, score
		}
	}
	return best
}
func (e *Engine) chooseDepot(v *Entity) *Entity {
	var best *Entity
	score := int64(1 << 62)
	for _, d := range e.state.Entities {
		if d.Owner != v.Owner || e.role(d) != "supply" || !d.Active(e.state.Tick) {
			continue
		}
		s := dist2(v.Position, d.Position)
		if s < score {
			score = s
			best = d
		}
	}
	return best
}
func (e *Engine) updateHarvest() {
	for _, f := range e.state.Fields {
		q := f.Queue[:0]
		for _, id := range f.Queue {
			v := e.entity(id)
			if v != nil && v.HP > 0 && v.Field == f.ID && len(v.Orders) > 0 && v.Orders[0].Kind == "gather" && v.Cargo < 600000 {
				q = append(q, id)
			}
		}
		f.Queue = q
		if f.Loader != 0 {
			v := e.entity(f.Loader)
			if v == nil || v.HP <= 0 || v.Field != f.ID || len(v.Orders) == 0 || v.Orders[0].Kind != "gather" || distance(v.Position, f.Position) > 1700 {
				f.Loader = 0
			}
		}
	}
	for _, v := range e.state.Entities {
		if v.HP <= 0 || e.role(v) != "hauler" || e.defeated(v.Owner) || len(v.Orders) == 0 || v.Orders[0].Kind != "gather" {
			continue
		}
		if d := e.entity(v.Depot); d == nil || !d.Active(e.state.Tick) || d.Owner != v.Owner {
			if d = e.chooseDepot(v); d != nil {
				v.Depot = d.ID
			} else {
				v.Depot = 0
				v.State = "no_supply_center"
				continue
			}
		}
		if v.State == "unloading" {
			if e.state.Tick >= v.TaskUntil {
				p := e.player(v.Owner)
				p.Credits += v.Cargo
				p.Income += v.Cargo
				v.Cargo = 0
				v.State = "gathering"
				e.emit("cargo_delivered", p.ID, v.ID, v.Position, "owner", 0)
			}
			continue
		}
		f := e.field(v.Field)
		if f == nil || f.Remaining == 0 {
			if v.Cargo > 0 {
				v.State = "returning_cargo"
			} else {
				f = e.chooseField(v)
				if f != nil {
					v.Field = f.ID
					v.State = "gathering"
				} else {
					v.Field = 0
					v.State = "no_known_supplies"
					continue
				}
			}
		}
		if v.Cargo >= 600000 || v.State == "returning_cargo" {
			d := e.entity(v.Depot)
			if e.edgeDistance(v, d) <= 1200 {
				unloading := 0
				for _, other := range e.state.Entities {
					if other.Depot == d.ID && other.State == "unloading" {
						unloading++
					}
				}
				if unloading < 2 {
					v.State = "unloading"
					v.TaskUntil = e.state.Tick + seconds(3)
					v.Path = nil
				}
			}
			continue
		}
		if f == nil || f.Remaining == 0 {
			continue
		}
		if distance(v.Position, f.Position) <= 7000 {
			queued := false
			for _, id := range f.Queue {
				if id == v.ID {
					queued = true
				}
			}
			if !queued && f.Loader != v.ID {
				f.Queue = append(f.Queue, v.ID)
			}
		}
		if f.Loader == 0 && len(f.Queue) > 0 && f.Queue[0] == v.ID && distance(v.Position, f.Position) <= 1200 {
			f.Loader = v.ID
			f.Queue = f.Queue[1:]
		}
		if f.Loader == v.ID {
			amount := min64(2000, min64(600000-v.Cargo, f.Remaining))
			v.Cargo += amount
			f.Remaining -= amount
			v.State = "loading"
			v.Path = nil
			if v.Cargo == 600000 || f.Remaining == 0 {
				v.State = "returning_cargo"
				f.Loader = 0
			}
		}
	}
}
func (e *Engine) harvestGoal(v *Entity) (Vec, bool, int32) {
	if v.State == "unloading" || v.State == "loading" || v.State == "no_supply_center" || v.State == "no_known_supplies" {
		return v.Position, false, 200
	}
	if v.Cargo >= 600000 || v.State == "returning_cargo" {
		if d := e.entity(v.Depot); d != nil {
			return e.approachPoint(v, d), e.edgeDistance(v, d) > 1100, 300
		}
	}
	if f := e.field(v.Field); f != nil {
		index := 0
		for i, id := range f.Queue {
			if id == v.ID {
				index = i
				break
			}
		}
		if f.Loader != 0 && f.Loader != v.ID {
			index++
		}
		goal := f.Position
		if index > 0 {
			goal = Vec{X: f.Position.X + int32(index)*2000, Y: f.Position.Y + 2000}
			goal.X = clamp(goal.X, 1000, e.state.Map.Width*1000-1000)
			goal.Y = clamp(goal.Y, 1000, e.state.Map.Height*1000-1000)
		}
		return goal, distance(v.Position, goal) > 700, 600
	}
	return v.Position, false, 200
}
