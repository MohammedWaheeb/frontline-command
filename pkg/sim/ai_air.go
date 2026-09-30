package sim

// Service planning uses only owned reservations. A disabled building keeps its
// slots, but only active compatible capacity can start another aircraft job.
func (e *Engine) aiAirProductionMargin(own []EntityView, producer string) int32 {
	margin := int32(0)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building && v.Active(e.Tick()) && v.Channel != "sell" {
			if b, ok := e.buildingRule(v.Type); ok && b.Role == producer {
				margin += b.ServiceSlots
			}
		}
		if u, ok := e.catalog.Unit(v.Type); ok && u.Armor == "air" && u.Role != "support_plane" && u.Producer == producer {
			margin--
		}
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && u.Armor == "air" && u.Producer == producer {
				margin--
			}
		}
	}
	return margin
}

func (e *Engine) aiCommittedAirSupply(own []EntityView) int32 {
	supply := int32(0)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if u, ok := e.catalog.Unit(v.Type); ok && u.Armor == "air" && u.Role != "support_plane" {
			supply += u.Supply
		}
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && u.Armor == "air" {
				supply += u.Supply
			}
		}
	}
	return supply
}

func (e *Engine) aiAirHome(v *Entity, own []EntityView) *Entity {
	home := e.aiOwnEntity(own, v.Home)
	if home == nil || !home.Building || !home.Complete || home.HP <= 0 {
		return nil
	}
	unit, ok := e.catalog.Unit(v.Type)
	rule, building := e.buildingRule(home.Type)
	if !ok || !building || rule.ServiceSlots == 0 || rule.Role != unit.Producer {
		return nil
	}
	return home
}

// Readiness never refills fuel or ammunition, and grounded damaged aircraft
// stay with their paid repair source rather than taking the ground retreat path.
func (e *Engine) aiAirReady(v *Entity, own []EntityView) bool {
	if aiShahedCommitted(v) || !v.Active(e.Tick()) || v.ServiceWork > 0 || v.EmergencyTakeoffUntil > e.Tick() || v.HP*2 < v.MaxHP || v.Endurance <= 600 || e.role(v) == "support_plane" {
		return false
	}
	if w, armed := e.weapon(v); armed && w.Ammo > 0 && v.Ammo == 0 {
		return false
	}
	home := e.aiAirHome(v, own)
	return home != nil && home.Active(e.Tick()) && home.Channel != "sell"
}

// Ground AA is a route barrier; visible hostile aircraft remain legitimate
// fighter intercept targets. Segment proximity uses remembered positions and
// the public weapon catalog, never hidden collision or navigation state.
func (e *Engine) aiAirRouteDanger(p *Player, from, to Vec) bool {
	dx, dy := int64(to.X-from.X), int64(to.Y-from.Y)
	length := dx*dx + dy*dy
	for _, enemy := range p.AIKnowledge {
		if e.allied(p.ID, enemy.Owner) || e.defeated(enemy.Owner) {
			continue
		}
		weapon, age := "", seconds(60)
		if u, ok := e.catalog.Unit(enemy.Type); ok {
			if u.Armor == "air" {
				continue
			}
			weapon = u.Weapon
		}
		if b, ok := e.buildingRule(enemy.Type); ok {
			weapon, age = b.Weapon, seconds(300)
		}
		w, ok := e.catalog.Weapon(weapon)
		if !ok || w.Kind != "antiair" || e.Tick()-enemy.Seen > age {
			continue
		}
		closest := from
		if length > 0 {
			projection := int64(enemy.Position.X-from.X)*dx + int64(enemy.Position.Y-from.Y)*dy
			if projection >= length {
				closest = to
			} else if projection > 0 {
				closest = Vec{X: from.X + int32(dx*projection/length), Y: from.Y + int32(dy*projection/length)}
			}
		}
		if distance(enemy.Position, closest) < w.MaxRange+3000 {
			return true
		}
	}
	return false
}

// Reserve proposed destinations locally so two standard Return commands cannot
// both claim the last slot. Existing aircraft and started paid jobs keep theirs.
func (e *Engine) aiAirReturnOrder(p *Player, v *Entity, own []EntityView, claims map[ID]int32) (Order, bool) {
	if aiShahedCommitted(v) {
		return Order{}, false
	}
	unit, _ := e.catalog.Unit(v.Type)
	var best *Entity
	bestDanger := true
	for _, observed := range own {
		home := e.entity(observed.ID)
		rule, building := e.buildingRule(home.Type)
		if !building || !home.Active(e.Tick()) || home.Channel == "sell" || rule.ServiceSlots == 0 || rule.Role != unit.Producer {
			continue
		}
		used := claims[home.ID]
		for _, otherView := range own {
			other := e.entity(otherView.ID)
			if e.isAircraft(other) && other.Home == home.ID {
				used++
			}
			for _, job := range other.Jobs {
				if job.Started && job.Service == home.ID {
					used++
				}
			}
		}
		if v.Home != home.ID && (used >= rule.ServiceSlots || v.ServiceWork > 0 || v.EmergencyTakeoffUntil > e.Tick()) {
			continue
		}
		danger := e.aiAirRouteDanger(p, v.Position, home.Position)
		if best == nil || bestDanger && !danger || danger == bestDanger && (home.ID == v.Home || best.ID != v.Home && distance(v.Position, home.Position) < distance(v.Position, best.Position)) {
			best, bestDanger = home, danger
		}
	}
	if best == nil {
		return Order{}, false
	}
	order := Order{Kind: "return", Entities: []ID{v.ID}}
	if best.ID != v.Home {
		order.Target, order.Position = best.ID, best.Position
		claims[best.ID]++
	}
	return order, true
}

func (e *Engine) aiAirRecoveryOrders(p *Player, own []EntityView) []Order {
	orders := []Order{}
	claims := map[ID]int32{}
	recall := []ID{}
	canRecall := p.Faction == "IR" && p.Tier >= 2 && e.has(p.ID, "hq") && p.Energy >= 45000 && !cooldown(p.Cooldowns, "drone_recall", e.Tick())
	for _, observed := range own {
		v := e.entity(observed.ID)
		if aiShahedCommitted(v) || !e.isAircraft(v) || e.role(v) == "support_plane" || !v.Active(e.Tick()) || v.Channel != "" || v.EmergencyTakeoffUntil > e.Tick() {
			continue
		}
		home := e.aiAirHome(v, own)
		serviceLost := home == nil || !home.Active(e.Tick()) || home.Channel == "sell"
		returning := len(v.Orders) > 0 && v.Orders[0].Kind == "return"
		empty := false
		if weapon, armed := e.weapon(v); armed {
			empty = weapon.Ammo > 0 && v.Ammo == 0
		}
		endangered := !v.Landed && (v.HP*2 < v.MaxHP || v.Endurance <= 600 || empty || e.aiAirRouteDanger(p, v.Position, v.Position) || e.role(v) != "fighter" && e.aiAirDanger(p, v.Position))
		if !v.Landed && !returning && len(v.Orders) > 0 {
			order := v.Orders[0]
			if order.Kind == "move" || order.Kind == "attack_move" || order.Kind == "patrol" {
				endangered = endangered || e.aiAirRouteDanger(p, v.Position, order.Position)
			}
		}
		if !serviceLost && !endangered {
			continue
		}
		order, available := e.aiAirReturnOrder(p, v, own, claims)
		if !available {
			// A normal destinationless Return can wait for service-loss
			// reconciliation when replacement infrastructure completes.
			if v.Landed {
				continue
			}
			order = Order{Kind: "return", Entities: []ID{v.ID}}
		}
		if canRecall && endangered && order.Target == 0 && !e.hasBuff(v, "recall") && len(recall) < 4 {
			recall = append(recall, v.ID)
			// Recall is selected as a group. Earlier actor or shared-energy
			// commitments can reject the whole ability; keep each ordinary
			// Return behind it so unclaimed aircraft still recover safely.
			orders = append(orders, order)
			continue
		}
		if returning && order.Target == 0 || v.Landed && order.Target == 0 {
			continue
		}
		orders = append(orders, order)
	}
	if len(recall) > 0 {
		orders = append([]Order{{Kind: "ability", Type: "drone_recall", Entities: recall}}, orders...)
	}
	return orders
}

func (e *Engine) aiKnownAirThreat(p *Player) bool {
	for _, enemy := range p.AIKnowledge {
		if u, ok := e.catalog.Unit(enemy.Type); ok && u.Armor == "air" && e.Tick()-enemy.Seen <= seconds(30) && !e.allied(p.ID, enemy.Owner) && !e.defeated(enemy.Owner) {
			return true
		}
	}
	return false
}

// A landed or vanished target no longer offers a legal air intercept. Resolve
// this from the filtered public view rather than inspecting a hidden live unit.
func (e *Engine) aiFighterAttackVisible(p *Player, view View, target ID) bool {
	for _, observed := range view.Entities {
		if observed.ID != target || !aiActiveOpponent(p, view, observed.Owner) || observed.Landed {
			continue
		}
		u, ok := e.catalog.Unit(observed.Type)
		return ok && u.Armor == "air"
	}
	return false
}

func (e *Engine) aiFighterTarget(p *Player, view View, fighter *Entity) (EntityView, bool) {
	best, found := EntityView{}, false
	for _, target := range view.Entities {
		u, ok := e.catalog.Unit(target.Type)
		if !ok || u.Armor != "air" || target.Landed || !aiActiveOpponent(p, view, target.Owner) || e.aiAirRouteDanger(p, fighter.Position, target.Position) {
			continue
		}
		if !found || distance(fighter.Position, target.Position) < distance(fighter.Position, best.Position) {
			best, found = target, true
		}
	}
	return best, found
}

func (e *Engine) aiRapidSortieUseful(p *Player, home *Entity, own []EntityView) bool {
	if p.AI == "easy" || p.Faction != "US" || p.Tier < 2 || !e.has(p.ID, "hq") || p.Energy < 50000 || cooldown(p.Cooldowns, "rapid_sortie", e.Tick()) || home.Type != "US.airfield" || !home.Active(e.Tick()) || home.Channel != "" || e.hasBuff(home, "rapid_sortie") {
		return false
	}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.isAircraft(v) && v.Landed && v.Home == home.ID && v.ServiceWork > 0 && v.ServiceWork+uint32(seconds(5))*2 < e.serviceRequired(v) {
			return true
		}
	}
	return false
}

func (e *Engine) aiRelayUseful(p *Player, v *Entity, own []EntityView, goal Vec) bool {
	if p.Faction != "IR" || p.Tier < 2 || !e.has(p.ID, "hq") || p.Energy < 35000 || cooldown(p.Cooldowns, "relay_boost", e.Tick()) || v.Type != "IR.isr" || v.Landed || !e.aiAirReady(v, own) || e.hasBuff(v, "relay") || e.aiAirDanger(p, v.Position) || len(v.Orders) > 0 && v.Orders[0].Kind == "return" {
		return false
	}
	d := distance(v.Position, goal)
	return e.explored(p.ID, goal) && !e.canSee(p.ID, goal) && d > e.sightRange(v) && d <= e.sightRange(v)+3000
}
