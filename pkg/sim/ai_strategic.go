package sim

// These are planning reservations only. The ordinary executor charges the
// accepted order and rechecks its current prerequisites, visibility and limits.
func (e *Engine) aiOrderReservation(p *Player, o *Order) (credits, energy int64, supply int32) {
	switch o.Kind {
	case "build":
		if b, ok := e.buildingRule(o.Type); ok {
			credits = b.Cost
		}
	case "train":
		if u, ok := e.catalog.Unit(o.Type); ok {
			credits, supply = u.Cost, u.Supply
			if u.Role == "rig" && len(o.Entities) == 1 {
				if source := e.entity(o.Entities[0]); source != nil && source.Owner == p.ID && e.role(source) == "factory" {
					credits = 1200000
				}
			}
		}
	case "research":
		if u, ok := e.catalog.Upgrade(o.Type); ok {
			credits = u.Cost
		}
	case "attack":
		if len(o.Entities) == 1 {
			if source := e.entity(o.Entities[0]); source != nil && source.Owner == p.ID {
				if w, ok := e.weapon(source); ok && w.Kind == "tactical" {
					credits = aiMissileShotCost(w.ID)
				}
			}
		}
	case "ability":
		energy = aiFactionEnergy(o.Type)
		switch o.Type {
		case "beacon":
			credits = 200000
		case "volley":
			credits = 600000
		case "strategic":
			credits = 1200000
			if p.Faction == "IR" {
				credits = 1500000
			} else if p.Faction == "SA" {
				credits = 1000000
			} else if p.Faction == "SY" {
				supply = int32(len(o.Entities)) * 4
			}
		}
	}
	return
}

func aiFactionEnergy(typ string) int64 {
	switch typ {
	case "radar_pulse":
		return 25000
	case "recon_sweep", "relay_boost":
		return 35000
	case "rapid_transfer":
		return 40000
	case "drone_recall", "disperse", "emergency_power":
		return 45000
	case "rapid_sortie", "recovery_order":
		return 50000
	}
	return 0
}

func aiMissileShotCost(weapon string) int64 {
	if weapon == "MISSILE" {
		return 400000
	}
	return 300000
}

func (e *Engine) aiCommittedVolleyCredits(p *Player) int64 {
	credits := int64(0)
	for _, operation := range e.state.Operations {
		if operation.Owner == p.ID && operation.Kind == "second_volley" && operation.At >= e.Tick() {
			credits += 300000
		}
	}
	return credits
}

func (e *Engine) aiBeaconCommitments(own []EntityView) (int32, map[ID]bool) {
	count := int32(0)
	builders := map[ID]bool{}
	for _, observed := range own {
		if observed.Type == "IR.beacon" {
			count++
			builders[e.entity(observed.ID).Builder] = true
		}
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Channel == "beacon" && !builders[v.ID] {
			count++
			builders[v.ID] = true
		}
	}
	return count, builders
}

func (e *Engine) aiDisperseUseful(own []EntityView, point Vec) bool {
	for _, observed := range own {
		unit, ok := e.catalog.Unit(observed.Type)
		if !ok || unit.Armor != "infantry" || !observed.Complete || !observed.Enabled || observed.Private == nil || observed.Private.Container != 0 || observed.ChannelUntil > e.Tick() || distance(observed.Position, point) > 6000 {
			continue
		}
		if len(observed.Private.Orders) > 0 {
			switch observed.Private.Orders[0].Kind {
			case "capture", "board", "ability":
				continue
			}
		}
		return true
	}
	return false
}

// A public target proxy supplies the geometry needed by the ordinary range
// helpers without ever fetching a live enemy entity or its private state.
func (e *Engine) aiObservedGeometry(observed EntityView) Entity {
	_, building := e.buildingRule(observed.Type)
	return Entity{ID: observed.ID, Owner: observed.Owner, Type: observed.Type, Position: observed.Position, HP: 1, Building: building, Complete: observed.Complete, Enabled: observed.Enabled, Landed: observed.Landed, FootprintWidth: observed.FootprintWidth, FootprintHeight: observed.FootprintHeight, FootprintType: observed.FootprintType}
}

func (e *Engine) aiStrikeTarget(p *Player, view View, source *Entity, goal Vec) (EntityView, bool) {
	var best EntityView
	bestRing, bestPriority := false, int64(-1)
	bestDistance := int64(1 << 62)
	for _, target := range view.Entities {
		if !aiActiveOpponent(p, view, target.Owner) || !e.canSee(p.ID, target.Position) {
			continue
		}
		geometry := e.aiObservedGeometry(target)
		if e.armor(&geometry) == "air" {
			continue
		}
		inRing := true
		if source != nil {
			w, ok := e.weapon(source)
			if !ok || !e.canAttack(source, &geometry) {
				continue
			}
			d := e.edgeDistance(source, &geometry)
			inRing = d >= w.MinRange && d <= w.MaxRange
		}
		priority := int64(0)
		if b, ok := e.buildingRule(target.Type); ok {
			priority = b.Cost + 2000000
			if b.Qualifying {
				priority += 4000000
			}
		} else if u, ok := e.catalog.Unit(target.Type); ok {
			priority = u.Cost
		}
		d := dist2(goal, target.Position)
		if best.ID == 0 || inRing && !bestRing || inRing == bestRing && (priority > bestPriority || priority == bestPriority && (d < bestDistance || d == bestDistance && target.ID < best.ID)) {
			best, bestRing, bestPriority, bestDistance = target, inRing, priority, d
		}
	}
	return best, best.ID != 0
}

func (e *Engine) aiLauncherOrder(p *Player, view View, launcher *Entity, goal Vec, credits int64) (Order, bool) {
	if e.pendingVolley(launcher.ID) || launcher.Charges <= 0 {
		return Order{}, false
	}
	w, ok := e.weapon(launcher)
	if !ok || credits < aiMissileShotCost(w.ID) {
		return Order{}, false
	}
	target, ok := e.aiStrikeTarget(p, view, launcher, goal)
	if !ok {
		if launcher.Deployed && !e.hasBuff(launcher, "shield_anchor") {
			return Order{Kind: "pack", Entities: []ID{launcher.ID}}, true
		}
		return Order{}, false
	}
	pointDistance := e.distanceTo(launcher, target.Position)
	if launcher.Type == "IR.launcher" && launcher.Deployed && launcher.Charges >= 2 && p.AI != "easy" && credits >= 600000 && pointDistance >= w.MinRange && pointDistance <= w.MaxRange {
		return Order{Kind: "ability", Entities: []ID{launcher.ID}, Type: "volley", Points: []Vec{target.Position, target.Position}}, true
	}
	if len(launcher.Orders) > 0 && launcher.Orders[0].Kind == "attack" && launcher.Orders[0].Target == target.ID {
		return Order{}, false
	}
	// Attack authorizes normal pursuit, minimum-range retreat and deployment.
	// A separate pack intention would take precedence and cancel that pursuit.
	return Order{Kind: "attack", Entities: []ID{launcher.ID}, Target: target.ID}, true
}

func (e *Engine) aiGroundDeployment(p *Player, view View, own []EntityView, source *Entity) bool {
	if source.Type == "SA.repair" {
		return e.aiThreatNear(p, source.Position, 14000)
	}
	if source.Type == "SA.tank" {
		w, _ := e.weapon(source)
		for _, target := range view.Entities {
			if !aiActiveOpponent(p, view, target.Owner) {
				continue
			}
			geometry := e.aiObservedGeometry(target)
			if e.canAttack(source, &geometry) && e.edgeDistance(source, &geometry) <= w.MaxRange {
				return true
			}
		}
		return false
	}
	if e.hasBuff(source, "shield_anchor") {
		return true
	}
	// Warnings are public even when the launcher is hidden. Empty carriers must
	// deploy before the warning reaches their finite protected impact coverage.
	for _, projectile := range view.Projectiles {
		if projectile.Interceptable && aiActiveOpponent(p, view, projectile.Owner) && distance(source.Position, projectile.Impact) <= 10000 {
			return true
		}
	}
	for _, target := range own {
		if target.ID == source.ID || target.Private == nil || target.Private.Container != 0 || distance(source.Position, target.Position) > 10000 {
			continue
		}
		if b, ok := e.buildingRule(target.Type); ok && target.Complete && (b.Qualifying || b.Role == "supply" || b.Role == "abm") {
			return true
		}
		if u, ok := e.catalog.Unit(target.Type); ok && u.Weapon != "" && (u.Armor == "light" || u.Armor == "heavy") {
			return true
		}
	}
	return false
}

func (e *Engine) aiStrategicOrder(p *Player, view View, own []EntityView, site *Entity, goal Vec, used map[ID]bool, freeSupply int32) (Order, bool) {
	if p.AI == "easy" || site == nil || !site.Active(e.Tick()) || p.Tier < 3 || p.LowPower() || site.ChargeWork < e.strategicCharge(p.Faction) {
		return Order{}, false
	}
	order := Order{Kind: "ability", Type: "strategic"}
	switch p.Faction {
	case "US", "IR":
		if used[site.ID] {
			return Order{}, false
		}
		target, ok := e.aiStrikeTarget(p, view, nil, goal)
		if !ok {
			return Order{}, false
		}
		order.Entities = []ID{site.ID}
		order.Points = []Vec{target.Position, target.Position, target.Position}
		if p.Faction == "US" {
			distances := []int32{target.Position.X, e.state.Map.Width*1000 - target.Position.X, target.Position.Y, e.state.Map.Height*1000 - target.Position.Y}
			for edge := int32(1); edge < 4; edge++ {
				if distances[edge] < distances[order.Index] {
					order.Index = edge
				}
			}
		}
	case "SY":
		known := e.aiPlacementKnowledge(p)
		for _, observed := range own {
			if observed.Type != "SY.safehouse" || used[observed.ID] || freeSupply < 4 {
				continue
			}
			house := e.entity(observed.ID)
			if !e.raidSafehouseReady(p.ID, house) {
				continue
			}
			if _, ok := known.raidExits(house); !ok {
				continue
			}
			order.Entities = append(order.Entities, house.ID)
			freeSupply -= 4
			if len(order.Entities) == 3 {
				break
			}
		}
	case "SA":
		var anchor *Entity
		for _, observed := range own {
			if used[observed.ID] {
				continue
			}
			v := e.entity(observed.ID)
			if !v.Active(e.Tick()) || v.Channel != "" || v.DeployUntil > 0 || v.PackingUntil > 0 || !e.canSee(p.ID, v.Position) {
				continue
			}
			if e.role(v) != "hq" && e.role(v) != "outpost" && !(v.Type == "SA.mobile_abm" && v.Deployed) {
				continue
			}
			if anchor == nil || distance(v.Position, goal) < distance(anchor.Position, goal) {
				anchor = v
			}
		}
		if anchor != nil {
			order.Entities = []ID{anchor.ID}
		}
	}
	return order, len(order.Entities) > 0
}
