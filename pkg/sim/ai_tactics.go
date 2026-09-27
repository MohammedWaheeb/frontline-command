package sim

// Tactical choices use only observed entities and our own unit state. Failed
// intentions still pass through the normal execution validator and cost nothing.
func (e *Engine) aiSpecialOrders(p *Player, view View, own []EntityView, goal Vec) []Order {
	orders := []Order{}
	add := func(v *Entity, kind string, target ID, typ string, pos Vec) {
		orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}, Target: target, Type: typ, Position: pos})
	}
	var leader *Entity
	var site *Entity
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && e.role(v) == "strategic" {
			site = v
		}
		if v.Building || v.Container != 0 || v.HP*2 < v.MaxHP || e.isAircraft(v) {
			continue
		}
		if w, armed := e.weapon(v); armed && w.Kind != "tactical" && (leader == nil || distance(v.Position, goal) < distance(leader.Position, goal)) {
			leader = v
		}
	}
	if p.RepairReserve != 300000 {
		orders = append(orders, Order{Kind: "repair_reserve", Index: 300})
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if !v.Active(e.state.Tick) || v.Container != 0 || v.Channel != "" || v.DeployUntil > 0 || v.PackingUntil > 0 {
			continue
		}
		role := e.role(v)
		if role == "engineer" && len(v.Orders) == 0 {
			selected := false
			for _, target := range own {
				b, building := e.catalog.Building(target.Type)
				if building && target.Complete && target.Health < 850 && b.Role != "garrison" && distance(v.Position, target.Position) < 14000 {
					add(v, "repair", target.ID, "", Vec{})
					selected = true
					break
				}
			}
			if !selected {
				for _, station := range view.Stations {
					if !e.allied(p.ID, station.Owner) && !e.aiThreatNear(p, station.Position, 5000) {
						add(v, "capture", station.ID, "", Vec{})
						selected = true
						break
					}
				}
			}
			if !selected {
				for _, target := range view.Entities {
					if target.Owner == 0 || e.allied(p.ID, target.Owner) || target.Health >= 250 {
						continue
					}
					if b, ok := e.catalog.Building(target.Type); ok && b.Role != "hq" && b.Role != "strategic" && target.MapObject == 0 {
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
		if (role == "repair" || role == "medic") && leader != nil && len(v.Orders) == 0 {
			add(v, "guard", leader.ID, "", leader.Position)
		}
		if role == "launcher" || v.Type == "SA.mobile_abm" || v.Type == "SA.repair" || v.Type == "SA.tank" {
			near := e.aiThreatNear(p, v.Position, 14000)
			if role == "launcher" {
				near = e.canSee(p.ID, goal) && e.distanceTo(v, goal) > 9000 && e.distanceTo(v, goal) < 24000
			}
			if near && !v.Deployed {
				add(v, "deploy", 0, "", Vec{})
			}
			if !near && v.Deployed {
				add(v, "pack", 0, "", Vec{})
			}
			if v.Type == "IR.launcher" && v.Deployed && v.Charges == 2 && p.AI != "easy" && e.canSee(p.ID, goal) {
				orders = append(orders, Order{Kind: "ability", Entities: []ID{v.ID}, Type: "volley", Points: []Vec{goal, goal}})
			}
			if role == "launcher" && v.Deployed {
				for _, target := range view.Entities {
					if target.Owner != 0 && !e.allied(p.ID, target.Owner) {
						add(v, "attack", target.ID, "", Vec{})
						break
					}
				}
			}
		}
		if p.AI == "easy" {
			continue
		}
		if v.Type == "US.recon" && !cooldown(v.Cooldowns, "designate", e.Tick()) {
			for _, target := range view.Entities {
				if target.Owner != 0 && !e.allied(p.ID, target.Owner) && distance(v.Position, target.Position) < 6500 {
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
			if !beacon {
				add(v, "ability", 0, "beacon", v.Position)
			}
		}
		if e.isAircraft(v) && !v.Landed && v.HP*2 < v.MaxHP && len(v.Orders) > 0 && v.Orders[0].Kind != "return" {
			if p.Faction == "IR" && p.Energy >= 45000 && !cooldown(p.Cooldowns, "drone_recall", e.Tick()) {
				add(v, "ability", 0, "drone_recall", Vec{})
			} else {
				add(v, "return", 0, "", Vec{})
			}
		}
		if p.Tier >= 2 && p.Energy >= 50000 {
			ability := ""
			point := v.Position
			switch {
			case role == "hq" && p.Faction == "US" && e.explored(p.ID, goal) && !e.canSee(p.ID, goal):
				ability = "recon_sweep"
				point = goal
			case v.Type == "US.airfield":
				for _, unit := range own {
					if unit.Private != nil && unit.Private.Home == v.ID && unit.Private.ServiceWork > 0 {
						ability = "rapid_sortie"
						break
					}
				}
			case v.Type == "IR.isr" && !v.Landed && e.aiThreatNear(p, v.Position, 18000):
				ability = "relay_boost"
			case p.Faction == "SY" && role == "hq" && leader != nil && e.aiThreatNear(p, leader.Position, 9000):
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
	}
	if p.AI != "easy" && site != nil && site.ChargeWork >= e.strategicCharge(p.Faction) && p.Credits >= 1500000 && e.canSee(p.ID, goal) {
		o := Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Points: []Vec{goal, goal, goal}}
		switch p.Faction {
		case "SY":
			o.Entities = nil
			o.Points = nil
			for _, v := range own {
				if v.Type == "SY.safehouse" && len(o.Entities) < 3 {
					o.Entities = append(o.Entities, v.ID)
				}
			}
		case "SA":
			o.Entities = nil
			o.Points = nil
			for _, v := range own {
				if v.Type == "SA.mobile_abm" && v.Deployed {
					o.Entities = []ID{v.ID}
					break
				}
			}
			if len(o.Entities) == 0 {
				for _, v := range own {
					if v.Type == "hq" {
						o.Entities = []ID{v.ID}
						break
					}
				}
			}
		}
		if len(o.Entities) > 0 {
			orders = append(orders, o)
		}
	}
	return orders
}
