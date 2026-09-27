package sim

import "frontlinecommand/pkg/content"

func (e *Engine) outOfCombat(v *Entity) bool {
	return (!v.EverDamaged || e.state.Tick-v.LastDamage >= seconds(3)) && (!v.EverDealt || e.state.Tick-v.LastDealt >= seconds(3))
}
func (e *Engine) transferQuiet(v *Entity) bool {
	if v.EverDamaged && e.state.Tick-v.LastDamage < seconds(5) || v.EverDealt && e.state.Tick-v.LastDealt < seconds(5) {
		return false
	}
	for _, id := range v.Passengers {
		if unit := e.entity(id); unit != nil && unit.EverDealt && e.state.Tick-unit.LastDealt < seconds(5) {
			return false
		}
	}
	return true
}
func (e *Engine) repairRate(source, target *Entity) int64 {
	if source.ID == target.ID || source.Owner != target.Owner || target.TemporaryUntil > 0 {
		return 0
	}
	role := e.role(source)
	armor := e.armor(target)
	if source.Building {
		if role == "depot" && (armor == "light" || armor == "heavy") && !e.isAircraft(target) {
			return 50000
		}
		if e.isAircraft(target) && target.Landed && target.Home == source.ID {
			if e.player(source.Owner).HasUpgrade("US.service_crews") {
				return 55000
			}
			return 40000
		}
		return 0
	}
	switch role {
	case "medic":
		if armor == "infantry" {
			return 12000
		}
	case "engineer":
		if target.Building {
			return 25000
		}
	case "repair":
		if (armor == "light" || armor == "heavy") && !target.Building && !e.isAircraft(target) {
			if source.Type == "SA.repair" && source.Deployed {
				return 20000
			}
			if source.Type == "SY.repair" && e.player(source.Owner).HasUpgrade("SY.field_restoration") {
				return 40000
			}
			return 30000
		}
	}
	return 0
}
func (e *Engine) updateSupport() {
	assigned := map[ID]int32{}
	for _, target := range e.state.Entities {
		if target.Owner == 0 || target.HP <= 0 || target.HP >= target.MaxHP || target.Container != 0 || e.defeated(target.Owner) || !e.outOfCombat(target) || !target.Complete {
			continue
		}
		var best *Entity
		bestRate := int64(0)
		for _, source := range e.state.Entities {
			if !source.Active(e.state.Tick) || source.Channel != "" {
				continue
			}
			rate := e.repairRate(source, target)
			if rate == 0 {
				continue
			}
			rangeLimit := int32(3000)
			role := e.role(source)
			if role == "engineer" {
				rangeLimit = 1000
				if len(source.Orders) == 0 || source.Orders[0].Kind != "repair" || source.Orders[0].Target != target.ID {
					continue
				}
			} else if len(source.Orders) > 0 && source.Orders[0].Kind != "repair" && source.Orders[0].Kind != "hold" && source.Orders[0].Kind != "guard" {
				continue
			}
			if e.edgeDistance(source, target) > rangeLimit {
				continue
			}
			capacity := int32(1)
			if source.Type == "SA.repair" && source.Deployed {
				capacity = 2
			}
			if source.Building {
				capacity = 688
			}
			if assigned[source.ID] >= capacity {
				continue
			}
			if e.hasBuff(source, "recovery") {
				rate = rate * 3 / 2
			}
			if rate > bestRate {
				best, bestRate = source, rate
			}
		}
		if best == nil {
			continue
		}
		amount := min64(bestRate/20, target.MaxHP-target.HP)
		p := e.player(target.Owner)
		free := e.role(best) == "medic"
		if !free {
			available := max(int64(0), p.Credits-p.RepairReserve)
			amount = min64(amount, available*10)
			cost := (amount + 9) / 10
			if cost > available {
				amount = available * 10
				cost = available
			}
			p.Credits -= cost
			p.Spent += cost
		}
		if amount > 0 {
			target.HP += amount
			assigned[best.ID]++
			best.State = "repairing"
		}
	}
	for _, v := range e.state.Entities {
		if v.HP <= 0 || e.defeated(v.Owner) {
			continue
		}
		if v.Container != 0 {
			if parent := e.entity(v.Container); parent != nil {
				v.Position = parent.Position
			}
			continue
		}
		if v.Channel != "" {
			e.updateChannel(v)
			continue
		}
		if len(v.Orders) == 0 {
			continue
		}
		o := v.Orders[0]
		switch o.Kind {
		case "salvage":
			if crate := e.salvage(o.Target); crate != nil && distance(v.Position, crate.Position) <= 1200 {
				e.beginChannel(v, "salvage", crate.ID, seconds(2))
			}
		case "capture":
			if !e.validCapture(v, o.Target) {
				v.Orders = nil
				e.emit("capture_interrupted", v.Owner, v.ID, v.Position, "owner", 0)
				continue
			}
			near := false
			duration := seconds(8)
			if target := e.entity(o.Target); target != nil {
				near = e.edgeDistance(v, target) <= 1000
			} else {
				for _, s := range e.state.Stations {
					if s.ID == o.Target {
						near = distance(v.Position, s.Position) <= 1500
						duration = seconds(6)
					}
				}
			}
			if near {
				e.beginChannel(v, "capture", o.Target, duration)
			}
		case "board":
			target := e.entity(o.Target)
			if !e.canBoard(v, target) {
				v.Orders = nil
				continue
			}
			if e.edgeDistance(v, target) <= 1000 && target.LastPosition == target.Position {
				duration := seconds(2)
				if target.Type == "SY.apc" {
					duration = seconds(1)
				}
				if e.isAircraft(target) {
					duration = seconds(3)
				}
				e.beginChannel(v, "board", target.ID, duration)
			}
		case "unload":
			if len(v.Passengers) == 0 {
				v.Orders = v.Orders[1:]
				continue
			}
			if !v.Building && (v.LastPosition != v.Position || o.Position != (Vec{}) && distance(v.Position, o.Position) > 400) {
				continue
			}
			duration := seconds(2)
			if v.Type == "SY.apc" {
				duration = seconds(1)
			}
			if e.isAircraft(v) {
				duration = seconds(3)
			}
			e.beginChannel(v, "unload", 0, duration)
		}
	}
}
func (e *Engine) capacity(v *Entity) int32 {
	switch e.role(v) {
	case "apc":
		if v.Type == "SY.apc" {
			return 2
		}
		return 3
	case "airlift", "bunker", "safehouse", "garrison":
		return 2
	}
	return 0
}
func (e *Engine) validCapture(engineer *Entity, target ID) bool {
	if engineer.TemporaryUntil > 0 {
		return false
	}
	if v := e.entity(target); v != nil {
		return v.MapObject == 0 && v.HP > 0 && v.Building && v.Complete && v.Owner != engineer.Owner && !e.allied(v.Owner, engineer.Owner) && e.role(v) != "hq" && e.role(v) != "strategic" && v.HP*4 < v.MaxHP && e.canSeeEntity(engineer.Owner, v)
	}
	for _, s := range e.state.Stations {
		if s.ID == target {
			return s.Owner != engineer.Owner && !e.allied(engineer.Owner, s.Owner) && e.canSee(engineer.Owner, s.Position)
		}
	}
	return false
}
func (e *Engine) beginChannel(v *Entity, kind string, target ID, duration Tick) {
	v.Channel = kind
	v.ChannelTarget = target
	v.ChannelUntil = e.state.Tick + duration
	v.ChannelStartDamage = v.LastDamage
	if t := e.entity(target); t != nil {
		v.ChannelTargetDamage = t.LastDamage
	}
	v.State = kind
	v.Path = nil
	v.Concealed = false
	e.removeBuff(v, "disperse")
}
func (e *Engine) interruptChannel(v *Entity) {
	kind := v.Channel
	if kind == "sabotage" {
		setCooldown(&v.Cooldowns, "sabotage", e.state.Tick+seconds(10))
	}
	if kind == "transit" {
		e.emit("transfer_canceled", v.Owner, v.ID, v.Position, "owner", 0)
	}
	v.Channel = ""
	v.ChannelUntil = 0
	v.State = "idle"
	if kind == "capture" {
		e.emit("capture_interrupted", v.Owner, v.ID, v.Position, "owner", 0)
	}
}
func (e *Engine) updateChannel(v *Entity) {
	kind := v.Channel
	target := e.entity(v.ChannelTarget)
	if kind != "board" && kind != "unload" && kind != "conversion" && v.LastDamage != v.ChannelStartDamage {
		e.interruptChannel(v)
		return
	}
	switch kind {
	case "salvage":
		if crate := e.salvage(v.ChannelTarget); crate == nil || distance(v.Position, crate.Position) > 1500 {
			e.interruptChannel(v)
			return
		}
	case "capture":
		if !e.validCapture(v, v.ChannelTarget) {
			e.interruptChannel(v)
			return
		}
	case "board":
		if !e.canBoard(v, target) || target.LastPosition != target.Position {
			e.interruptChannel(v)
			return
		}
	case "sabotage", "designate":
		if target == nil || !e.canSeeEntity(v.Owner, target) || kind == "sabotage" && e.edgeDistance(v, target) > 1000 {
			e.interruptChannel(v)
			return
		}
	case "transit":
		if target == nil || target.HP <= 0 || target.Owner != v.Owner || target.LastDamage != v.ChannelTargetDamage || !e.canSee(v.Owner, target.Position) {
			e.interruptChannel(v)
			return
		}
	}
	if e.state.Tick < v.ChannelUntil {
		return
	}
	switch kind {
	case "salvage":
		e.collectSalvage(v)
	case "sell":
		p := e.player(v.Owner)
		b, _ := e.catalog.Building(v.Type)
		basis := v.Paid
		if b.Role == "supply" {
			basis = max(int64(0), basis-900000)
		}
		catalogBasis := b.Cost
		if b.Role == "supply" {
			catalogBasis -= 900000
		}
		basis = min64(basis, catalogBasis)
		p.Credits += basis * v.HP / (2 * v.MaxHP)
		v.HP = 0
		v.Contributions = nil
		e.releasePassengers(v)
		e.emit("building_sold", p.ID, v.ID, v.Position, "owner", 0)
	case "capture":
		if target != nil {
			e.captureBuilding(v.Owner, target)
		} else {
			for _, s := range e.state.Stations {
				if s.ID == v.ChannelTarget {
					s.Owner = v.Owner
					e.emit("station_captured", v.Owner, s.ID, s.Position, "visible", 0)
				}
			}
		}
		v.Orders = nil
	case "board":
		if target != nil && len(target.Passengers) < int(e.capacity(target)) {
			if target.Owner == 0 {
				target.Owner = v.Owner
			}
			target.Passengers = append(target.Passengers, v.ID)
			v.Container = target.ID
			v.Position = target.Position
			v.Anchor = target.Position
			v.Orders = nil
			v.Target = 0
			v.State = "embarked"
		}
	case "unload":
		e.unload(v, false)
		if len(v.Passengers) > 0 {
			v.ChannelUntil = e.state.Tick + seconds(1)
			return
		}
		if len(v.Orders) > 0 {
			v.Orders = v.Orders[1:]
		}
	case "sabotage":
		if target != nil {
			target.DisabledUntil = e.state.Tick + seconds(10)
			target.ResistanceUntil = target.DisabledUntil + seconds(30)
			target.State = "disabled"
			setCooldown(&v.Cooldowns, "sabotage", e.state.Tick+seconds(60))
		}
	case "designate":
		if target != nil {
			target.Buffs = append(target.Buffs, Buff{"designated", e.state.Tick + seconds(8), v.ID})
		}
	case "transit":
		if target != nil {
			exits, ok := e.passengerExits(target, v.Passengers, 2000)
			if !ok {
				e.interruptChannel(v)
				return
			}
			for i, id := range append([]ID(nil), v.Passengers...) {
				unit := e.entity(id)
				pos := exits[i]
				unit.Container = 0
				unit.Position = pos
				unit.Anchor = pos
				unit.State = "idle"
				unit.Buffs = append(unit.Buffs, Buff{"exit_lock", e.state.Tick + seconds(2), v.ID})
				v.Passengers = removeID(v.Passengers, id)
			}
		}
	case "conversion":
		v.State = "idle"
	case "beacon":
		e.createBeacon(v)
	}
	v.Channel = ""
	v.ChannelUntil = 0
	if v.Container == 0 && v.HP > 0 {
		v.State = "idle"
	}
}
func (e *Engine) captureBuilding(owner PlayerID, v *Entity) {
	e.releasePassengers(v)
	v.Jobs = nil
	v.Orders = nil
	v.Builder = 0
	v.Channel = ""
	v.Owner = owner
	v.Enabled = true
	v.IncludedHauler = true
	v.Contributions = nil
	v.AttributedDamage = 0
	b, _ := e.catalog.Building(v.Type)
	if b.ServiceSlots > 0 || b.Role == "safehouse" {
		typ := content.AirProducer(e.player(owner).Faction)
		if b.Role == "safehouse" {
			typ = "outpost"
		}
		next, _ := e.catalog.Building(typ)
		v.HP = v.HP * next.HP / v.MaxHP
		v.MaxHP = next.HP
		v.Type = typ
		e.beginChannel(v, "conversion", 0, seconds(10))
		v.DisabledUntil = e.state.Tick + seconds(10)
		e.state.NavigationRevision++
	}
	e.emit("building_captured", owner, v.ID, v.Position, "visible", 0)
}
func removeID(ids []ID, id ID) []ID {
	out := ids[:0]
	for _, v := range ids {
		if v != id {
			out = append(out, v)
		}
	}
	return out
}
func (e *Engine) unload(v *Entity, escape bool) {
	for _, id := range append([]ID(nil), v.Passengers...) {
		unit := e.entity(id)
		if unit == nil {
			v.Passengers = removeID(v.Passengers, id)
			continue
		}
		if escape && e.isAircraft(v) && !v.Landed {
			unit.HP = 0
			unit.Container = 0
			v.Passengers = removeID(v.Passengers, id)
			continue
		}
		pos, ok := e.exitPosition(v, unit.Type, unit.ID, 2000)
		if !ok {
			if escape {
				unit.HP = 0
				unit.Container = 0
				v.Passengers = removeID(v.Passengers, id)
			}
			continue
		}
		unit.Container = 0
		unit.Position = pos
		unit.Anchor = pos
		unit.State = "idle"
		unit.Orders = nil
		if escape {
			unit.HP = max(int64(1), unit.HP/2)
		}
		v.Passengers = removeID(v.Passengers, id)
	}
	if v.MapObject != 0 && len(v.Passengers) == 0 {
		v.Owner = 0
	}
}
func (e *Engine) canBoard(passenger, target *Entity) bool {
	return target != nil && target.HP > 0 && target.Complete && (target.Owner == passenger.Owner || target.Owner == 0 && e.role(target) == "garrison") && e.capacity(target) > int32(len(target.Passengers)) && e.armor(passenger) == "infantry" && passenger.TemporaryUntil == 0
}
func (e *Engine) releasePassengers(v *Entity) {
	if len(v.Passengers) > 0 {
		e.unload(v, true)
	}
}
func (e *Engine) changeDeployment(v *Entity, deploy bool) {
	p := e.player(v.Owner)
	if deploy {
		if v.Deployed || v.DeployUntil > 0 {
			return
		}
		duration := seconds(3)
		if e.role(v) == "launcher" {
			duration = seconds(4)
			if p.HasUpgrade("IR.launcher_crews") {
				duration = seconds(3)
			}
		}
		if v.Type == "SA.repair" && p.HasUpgrade("SA.service_crews") {
			duration = seconds(2)
		}
		v.DeployUntil = e.state.Tick + duration
		v.Path = nil
		v.State = "deploying"
	} else {
		if !v.Deployed && v.DeployUntil == 0 {
			return
		}
		duration := seconds(2)
		if e.role(v) == "launcher" {
			duration = seconds(3)
			if p.HasUpgrade("IR.launcher_crews") {
				duration = seconds(2)
			}
		}
		if v.Type == "SA.repair" && p.HasUpgrade("SA.service_crews") {
			duration = seconds(1)
		}
		v.Deployed = false
		v.DeployUntil = 0
		v.PackingUntil = e.state.Tick + duration
		v.State = "packing"
		e.removeBuff(v, "shield_anchor")
	}
}
