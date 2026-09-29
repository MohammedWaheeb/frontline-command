package sim

// Used both by actual strategic impacts and their public area warnings.
const strategicImpactRadius int32 = 2000

func (e *Engine) cast(p *Player, selection []*Entity, o Order) string {
	v := selection[0]
	target := e.entity(o.Target)
	switch o.Type {
	case "designate":
		if v.Type != "US.recon" || target == nil || e.defeated(target.Owner) || e.allied(p.ID, target.Owner) || target.HP <= 0 || (e.armor(target) != "light" && e.armor(target) != "heavy" && !target.Building) || !e.canSeeEntity(p.ID, target) || e.edgeDistance(v, target) > 7000 {
			return "invalid_designation"
		}
		if cooldown(v.Cooldowns, o.Type, e.state.Tick) {
			return "cooldown"
		}
		setCooldown(&v.Cooldowns, o.Type, e.state.Tick+seconds(30))
		e.beginChannel(v, "designate", target.ID, seconds(1))
		return "ok"
	case "beacon":
		if v.Type != "IR.recon" || p.Credits < 200000 || !e.canSee(p.ID, o.Position) || distance(v.Position, o.Position) > 1000 {
			return "invalid_beacon"
		}
		count := 0
		for _, b := range e.state.Entities {
			if b.Type == "IR.beacon" && b.Owner == p.ID && b.Builder != v.ID {
				count++
			}
		}
		if count >= 3 {
			return "beacon_limit"
		}
		p.Credits -= 200000
		p.Spent += 200000
		v.LastTarget = o.Position
		e.beginChannel(v, "beacon", 0, seconds(4))
		return "ok"
	case "sabotage":
		if e.role(v) != "elite" || target == nil || !target.Building || e.defeated(target.Owner) || e.allied(p.ID, target.Owner) || !e.canSeeEntity(p.ID, target) || e.edgeDistance(v, target) > 1000 || !target.Active(e.state.Tick) || target.ResistanceUntil > e.state.Tick {
			return "invalid_sabotage"
		}
		switch e.role(target) {
		case "barracks", "factory", "airfield", "drone_hub", "workshop_air", "radar", "tech":
		default:
			return "invalid_sabotage"
		}
		if cooldown(v.Cooldowns, "sabotage", e.state.Tick) {
			return "cooldown"
		}
		duration := seconds(6)
		if p.Faction == "SY" {
			duration = seconds(5)
		}
		e.beginChannel(v, "sabotage", target.ID, duration)
		return "ok"
	case "decoy":
		if p.Faction != "US" || !p.HasUpgrade("US.countermeasures") || !e.isAircraft(v) || e.role(v) == "airlift" || v.Landed || cooldown(v.Cooldowns, "decoy_initial", e.state.Tick) {
			return "decoy_unavailable"
		}
		if cooldown(v.Cooldowns, "decoy", e.state.Tick) {
			return "cooldown"
		}
		setCooldown(&v.Cooldowns, "decoy", e.state.Tick+seconds(45))
		v.Buffs = append(v.Buffs, Buff{"decoy", e.state.Tick + seconds(3), v.ID})
		return "ok"
	case "transfer":
		if p.Faction != "SY" || e.role(v) != "safehouse" || target == nil || target.ID == v.ID || target.Owner != p.ID || e.role(target) != "safehouse" || !v.Active(e.state.Tick) || !target.Active(e.state.Tick) || len(v.Passengers) == 0 || !e.canSee(p.ID, target.Position) || !e.transferQuiet(v) || !e.transferQuiet(target) {
			return "invalid_transfer"
		}
		for _, house := range e.state.Entities {
			if house.Owner == p.ID && house.Channel == "transit" {
				return "transfer_active"
			}
		}
		for _, id := range v.Passengers {
			unit := e.entity(id)
			if unit == nil || unit.TemporaryUntil > 0 {
				return "invalid_passenger"
			}
		}
		if _, ok := e.passengerExits(target, v.Passengers, 2000); !ok {
			return "exit_blocked"
		}
		duration := e.transferDuration(p.ID)
		e.beginChannel(v, "transit", target.ID, duration)
		for i, c := range p.Cooldowns {
			if c.ID == "rapid_transfer_window" {
				p.Cooldowns[i].Until = 0
			}
		}
		return "ok"
	case "volley":
		if v.Type != "IR.launcher" || !v.Deployed || v.Charges < 2 || len(o.Points) != 2 || p.Credits < 600000 {
			return "volley_unavailable"
		}
		w, _ := e.weapon(v)
		if distance(o.Points[0], o.Points[1]) > 4000 {
			return "cluster_too_large"
		}
		for _, pt := range o.Points {
			d := e.distanceTo(v, pt)
			if !e.canSee(p.ID, pt) || d < w.MinRange || d > w.MaxRange {
				return "invalid_missile_target"
			}
		}
		p.Credits -= 300000
		p.Spent += 300000
		e.recordMissionEvent("missile_spent", p.ID, v.ID, 300000)
		v.Charges--
		v.PublicRevealUntil = e.state.Tick + seconds(6)
		e.launch(v, nil, o.Points[0], w, w.Damage)
		e.state.Operations = append(e.state.Operations, Operation{Kind: "second_volley", Owner: p.ID, Source: v.ID, At: e.state.Tick + 30, Points: []Vec{o.Points[1], v.Position}})
		return "ok"
	case "strategic":
		return e.activateStrategic(p, selection, o)
	}
	type ability struct {
		faction string
		cost    int64
		cd      Tick
	}
	defs := map[string]ability{"recon_sweep": {"US", 35000, seconds(100)}, "rapid_sortie": {"US", 50000, seconds(120)}, "relay_boost": {"IR", 35000, seconds(100)}, "drone_recall": {"IR", 45000, seconds(120)}, "rapid_transfer": {"SY", 40000, seconds(120)}, "disperse": {"SY", 45000, seconds(120)}, "emergency_power": {"SA", 45000, seconds(120)}, "recovery_order": {"SA", 50000, seconds(120)}}
	def, ok := defs[o.Type]
	if !ok {
		return "unknown_ability"
	}
	if p.Faction != def.faction || p.Tier < 2 || !e.has(p.ID, "hq") {
		return "ability_prerequisite"
	}
	if p.Energy < def.cost {
		return "insufficient_energy"
	}
	if cooldown(p.Cooldowns, o.Type, e.state.Tick) {
		return "cooldown"
	}
	switch o.Type {
	case "recon_sweep":
		if !e.explored(p.ID, o.Position) {
			return "unexplored_target"
		}
	case "rapid_sortie":
		if v.Type != "US.airfield" || !v.Active(e.state.Tick) {
			return "airfield_required"
		}
	case "relay_boost":
		if v.Type != "IR.isr" || v.Landed {
			return "survey_drone_required"
		}
	case "drone_recall":
		if len(selection) > 4 {
			return "selection_limit"
		}
		for _, drone := range selection {
			if !e.isAircraft(drone) || drone.Owner != p.ID {
				return "owned_drone_required"
			}
		}
	case "emergency_power":
		if e.role(v) != "hq" || !v.Active(e.state.Tick) {
			return "active_hq_required"
		}
	case "disperse", "recovery_order":
		if !e.canSee(p.ID, o.Position) {
			return "target_not_visible"
		}
	}
	p.Energy -= def.cost
	setCooldown(&p.Cooldowns, o.Type, e.state.Tick+def.cd)
	switch o.Type {
	case "recon_sweep":
		e.state.Zones = append(e.state.Zones, Zone{Kind: "scan", Owner: p.ID, Position: o.Position, Radius: 9000, Start: e.state.Tick + seconds(2), Until: e.state.Tick + seconds(10)})
	case "rapid_sortie":
		v.Buffs = append(v.Buffs, Buff{"rapid_sortie", e.state.Tick + seconds(15), v.ID})
	case "relay_boost":
		v.Buffs = append(v.Buffs, Buff{"relay", e.state.Tick + seconds(10), v.ID})
	case "drone_recall":
		for _, drone := range selection {
			drone.Buffs = append(drone.Buffs, Buff{"recall", e.state.Tick + seconds(8), v.ID})
			e.assign(drone, Order{Kind: "return"})
		}
	case "rapid_transfer":
		setCooldown(&p.Cooldowns, "rapid_transfer_window", e.state.Tick+seconds(10))
	case "disperse":
		for _, unit := range e.state.Entities {
			if unit.Owner == p.ID && e.armor(unit) == "infantry" && distance(unit.Position, o.Position) <= 6000 {
				unit.Buffs = append(unit.Buffs, Buff{"disperse", e.state.Tick + seconds(8), v.ID})
			}
		}
	case "emergency_power":
		v.Buffs = append(v.Buffs, Buff{"emergency_power", e.state.Tick + seconds(20), v.ID})
	case "recovery_order":
		for _, source := range e.state.Entities {
			role := e.role(source)
			if source.Owner == p.ID && distance(source.Position, o.Position) <= 8000 && (role == "repair" || role == "depot" || role == "engineer" || role == "airfield" || role == "drone_hub" || role == "workshop_air") {
				source.Buffs = append(source.Buffs, Buff{"recovery", e.state.Tick + seconds(12), v.ID})
			}
		}
	}
	e.emit("ability_activated", p.ID, v.ID, o.Position, "owner", 0)
	return "ok"
}
func (e *Engine) transferDuration(owner PlayerID) Tick {
	p := e.player(owner)
	if cooldown(p.Cooldowns, "rapid_transfer_window", e.state.Tick) {
		return seconds(3)
	}
	if p.HasUpgrade("SY.prepared_exits") {
		return seconds(5)
	}
	return seconds(6)
}
func (e *Engine) createBeacon(observer *Entity) {
	for _, v := range e.state.Entities {
		if v.Type == "IR.beacon" && v.Builder == observer.ID {
			v.HP = 0
		}
	}
	v := e.spawn("IR.beacon", observer.Owner, observer.LastTarget, true, 200000)
	v.Builder = observer.ID
	v.TemporaryUntil = e.state.Tick + seconds(45)
}
func (e *Engine) strategicCharge(faction string) uint32 {
	if faction == "IR" || faction == "SY" {
		return 210 * 20 * 2
	}
	return 180 * 20 * 2
}
func (e *Engine) activateStrategic(p *Player, selection []*Entity, o Order) string {
	var site *Entity
	for _, v := range e.state.Entities {
		if v.Owner == p.ID && e.role(v) == "strategic" && v.Active(e.state.Tick) {
			site = v
			break
		}
	}
	if site == nil || p.Tier < 3 || p.LowPower() || site.ChargeWork < e.strategicCharge(p.Faction) {
		return "strategic_not_ready"
	}
	cost := int64(1200000)
	if p.Faction == "IR" {
		cost = 1500000
	}
	if p.Faction == "SA" {
		cost = 1000000
	}
	if p.Credits < cost {
		return "insufficient_credits"
	}
	switch p.Faction {
	case "US", "IR":
		if len(o.Points) != 3 || o.Index > 3 {
			return "three_impact_points_required"
		}
		for _, pt := range o.Points {
			if !e.canSee(p.ID, pt) || distance(pt, o.Points[0]) > 4000 {
				return "invalid_strategic_target"
			}
		}
	case "SY":
		if len(selection) > 3 {
			return "safehouse_limit"
		}
		if p.Supply+p.ReservedSupply+int32(len(selection))*4 > 100 {
			return "supply_blocked"
		}
		for _, v := range selection {
			if e.role(v) != "safehouse" || !v.Active(e.state.Tick) || e.state.Tick-v.Created < seconds(20) || !e.canSee(p.ID, v.Position) {
				return "invalid_safehouse"
			}
			if _, ok := e.raidExits(v); !ok {
				return "exit_blocked"
			}
		}
	case "SA":
		v := selection[0]
		if !(e.role(v) == "hq" || e.role(v) == "outpost" || v.Type == "SA.mobile_abm" && v.Deployed) || !v.Active(e.state.Tick) || !e.canSee(p.ID, v.Position) {
			return "invalid_shield_anchor"
		}
	}
	p.Credits -= cost
	p.Spent += cost
	site.ChargeWork = 0
	e.emit("strategic_activated", p.ID, site.ID, site.Position, "owner", cost)
	switch p.Faction {
	case "IR":
		for i, pt := range o.Points {
			for wave := 0; wave < 2; wave++ {
				projectile := &Projectile{ID: e.newID(), Owner: p.ID, Shooter: site.ID, Weapon: "SATURATION", Origin: site.Position, Position: site.Position, Impact: pt, ImpactAt: e.state.Tick + seconds(uint32(14+wave*3)), Damage: 220000, Splash: strategicImpactRadius, Interceptable: true, Strategic: true}
				e.state.Projectiles = append(e.state.Projectiles, projectile)
				e.emit("missile_warning", p.ID, 0, pt, "all", int64(projectile.ImpactAt))
			}
			_ = i
		}
	case "US":
		for _, route := range e.skybreakerRoutes(o, e.state.Tick) {
			flight := route.ReleaseAt - route.EntryAt
			plane := e.spawn("US.support_plane", p.ID, route.Entry, true, 200000)
			plane.Landed = false
			plane.Endurance = 2400
			plane.TemporaryUntil = route.ReleaseAt + flight + seconds(30)
			plane.Facing = direction(route.Drop.X-route.Entry.X, route.Drop.Y-route.Entry.Y)
			plane.Orders = []Order{{Kind: "move", Position: route.Drop}}
			plane.DisabledUntil = route.EntryAt
			e.state.Operations = append(e.state.Operations, Operation{Kind: "skybreaker", Owner: p.ID, At: route.ReleaseAt, Source: plane.ID, Points: []Vec{route.Impact, route.Entry, route.Drop}})
			e.emit("airstrike_warning", p.ID, 0, route.Impact, "all", int64(route.ReleaseAt))
		}
	case "SY":
		for _, house := range selection {
			exits, _ := e.raidExits(house)
			e.state.Operations = append(e.state.Operations, Operation{Kind: "raid", Owner: p.ID, At: e.state.Tick + seconds(12), Source: house.ID, Points: exits, DamageAtStart: house.LastDamage, ReservedSupply: 4})
			e.emit("raid_warning", p.ID, house.ID, house.Position, "visible", int64(e.state.Tick+seconds(12)))
		}
	case "SA":
		anchor := selection[0]
		anchor.Buffs = append(anchor.Buffs, Buff{"shield_anchor", e.state.Tick + seconds(37), anchor.ID})
		e.state.Zones = append(e.state.Zones, Zone{"shieldline", p.ID, anchor.Position, 10000, e.state.Tick + seconds(12), e.state.Tick + seconds(37), anchor.ID})
		e.emit("shield_preparing", p.ID, anchor.ID, anchor.Position, "visible", int64(e.state.Tick+seconds(12)))
	}
	return "ok"
}
func (e *Engine) updateSpecial() {
	for _, v := range e.state.Entities {
		if v.Owner == 0 || v.HP <= 0 || e.defeated(v.Owner) {
			continue
		}
		if v.DeployUntil > 0 && e.state.Tick >= v.DeployUntil {
			v.Deployed = true
			v.DeployUntil = 0
			v.DeploymentStarted = 0
			v.State = "deployed"
		}
		if v.PackingUntil > 0 && e.state.Tick >= v.PackingUntil {
			v.PackingUntil = 0
			v.DeploymentStarted = 0
			v.State = "idle"
		}
		p := e.player(v.Owner)
		role := e.role(v)
		var cap int32
		var required uint32
		work := uint32(2)
		switch {
		case role == "launcher":
			w, _ := e.weapon(v)
			cap = w.Ammo
			required = w.IntervalTicks * 2
		case role == "abm" && v.Active(e.state.Tick):
			rule, _ := e.interceptionParameters(v)
			cap, required, work = rule.capacity, rule.required, rule.rate
		case v.Type == "SA.mobile_abm" && v.Deployed && v.Active(e.state.Tick):
			rule, _ := e.interceptionParameters(v)
			cap, required, work = rule.capacity, rule.required, rule.rate
		case role == "strategic" && v.Active(e.state.Tick) && !p.LowPower() && p.Tier == 3:
			v.ChargeWork = min(e.strategicCharge(p.Faction), v.ChargeWork+2)
		}
		if cap > 0 && v.DisabledUntil <= e.state.Tick && v.Enabled {
			if v.Charges < cap {
				if e.hasBuff(v, "shieldline") && (role == "abm" || role == "mobile_abm") {
					work *= 2
				}
				v.ChargeWork += work
				if v.ChargeWork >= required {
					v.ChargeWork -= required
					v.Charges++
				}
			} else {
				v.ChargeWork = 0
			}
		}
		if p.Faction == "SY" && (role == "rifle" || role == "recon" || role == "elite") && e.state.Map.TileAt(v.Position).Cover() && v.Container == 0 && v.Channel == "" && e.state.Tick-v.StationarySince >= seconds(4) && (!v.EverDealt || e.state.Tick-v.LastDealt >= seconds(6)) && (!v.EverDamaged || e.state.Tick-v.LastDamage >= seconds(6)) && v.RevealedUntil <= e.state.Tick && !e.detectedByEnemy(v) {
			if !v.Concealed {
				v.Concealed = true
				v.ConcealedSince = e.state.Tick
			}
		} else {
			v.Concealed = false
		}
	}
	zones := e.state.Zones[:0]
	for _, z := range e.state.Zones {
		if e.state.Tick >= z.Until || e.defeated(z.Owner) {
			continue
		}
		if z.Kind == "shieldline" {
			anchor := e.entity(z.Anchor)
			if anchor == nil || !anchor.Active(e.state.Tick) || anchor.Position != z.Position || !e.hasBuff(anchor, "shield_anchor") || anchor.Type == "SA.mobile_abm" && !anchor.Deployed {
				continue
			}
			if e.state.Tick >= z.Start {
				for _, v := range e.state.Entities {
					if v.Owner == z.Owner && distance(v.Position, z.Position) <= z.Radius {
						e.removeBuff(v, "shieldline")
						v.Buffs = append(v.Buffs, Buff{"shieldline", e.state.Tick + 2, z.Anchor})
					}
				}
			}
		}
		zones = append(zones, z)
	}
	e.state.Zones = zones
	pending := e.state.Operations[:0]
	for _, op := range e.state.Operations {
		source := e.entity(op.Source)
		if source == nil || source.HP <= 0 || source.Owner != op.Owner || e.defeated(op.Owner) {
			continue
		}
		if op.Kind == "raid" && source.LastDamage != op.DamageAtStart {
			e.emit("raid_canceled", op.Owner, source.ID, source.Position, "owner", 0)
			continue
		}
		if op.Kind == "second_volley" && (source.Position != op.Points[1] || !source.Deployed || source.PackingUntil > e.state.Tick) {
			continue
		}
		if e.state.Tick < op.At {
			pending = append(pending, op)
			continue
		}
		switch op.Kind {
		case "second_volley":
			p := e.player(op.Owner)
			if source.Charges > 0 && p.Credits >= 300000 {
				p.Credits -= 300000
				p.Spent += 300000
				e.recordMissionEvent("missile_spent", p.ID, source.ID, 300000)
				source.Charges--
				w, _ := e.weapon(source)
				e.launch(source, nil, op.Points[0], w, w.Damage)
				source.PublicRevealUntil = e.state.Tick + seconds(6)
			}
		case "raid":
			legal := len(op.Points) == 2
			for _, point := range op.Points {
				if !e.clear(point, 350, 0, false, true) {
					legal = false
				}
			}
			if legal {
				for i, typ := range []string{"SY.rifle", "SY.at"} {
					unit := e.spawn(typ, op.Owner, op.Points[i], true, 0)
					unit.TemporaryUntil = e.state.Tick + seconds(45)
				}
			} else {
				e.emit("raid_exit_blocked", op.Owner, source.ID, source.Position, "owner", 0)
			}
		case "skybreaker":
			if distance(source.Position, op.Points[2]) > 1000 {
				op.At = e.state.Tick + 1
				pending = append(pending, op)
				continue
			}
			pt := op.Points[0]
			e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: op.Owner, Shooter: source.ID, Weapon: "SKYBREAKER", Origin: source.Position, Position: source.Position, Impact: pt, ImpactAt: e.state.Tick + 1, Damage: 400000, Splash: strategicImpactRadius, Strategic: true})
			e.assign(source, Order{Kind: "move", Position: op.Points[1]})
		}
	}
	e.state.Operations = pending
}
