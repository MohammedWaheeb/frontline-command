package sim

import "sort"

type harvestParkingMember struct {
	id          ID
	radius      int32
	depot       ID
	destination Vec
}
type harvestParkingCache struct {
	revision uint32
	field    Vec
	members  []harvestParkingMember
	slots    map[ID]Vec
	adapted  bool
}

func (e *Engine) updateEconomy() {
	// Live aircraft reserve replacement capacity before production can claim it.
	// Damage resolved last tick may have removed their previous producer.
	e.reconcileAircraftService()
	e.prepareAircraftReturns()
	e.updateServiceParking()
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
				v.CompletedAt = e.state.Tick
				v.State = "idle"
				e.completeMovementOrder(rig)
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
		field := e.replenishShipment()
		// The arrival, site and stock are already a global public announcement.
		// Subsequent hidden depletion never updates this observation.
		for _, p := range e.state.Players {
			e.observeField(p, field)
		}
		e.state.ShipmentAt = 0
		e.emit("shipment_arrived", 0, 0, e.state.Map.Shipment, "all", 6000000)
	}
}

func (e *Engine) replenishShipment() *ResourceField {
	authored := make(map[uint32]bool, len(e.state.Map.Fields))
	for _, field := range e.state.Map.Fields {
		authored[field.ID] = true
	}
	used := make(map[uint32]bool, len(e.state.Fields))
	for _, field := range e.state.Fields {
		used[field.ID] = true
		if !authored[field.ID] {
			// The countdown starts only after every field is exhausted. Reuse
			// the central field without changing identities or reservations.
			field.Remaining = 6000000
			return field
		}
	}
	// Authored IDs may occupy any nonzero uint32 value. A bounded set has a
	// free small ID, so first shipment creation cannot wrap maxID+1 to zero.
	id := uint32(1)
	for used[id] {
		id++
	}
	field := &ResourceField{ID: id, Position: e.state.Map.Shipment, Remaining: 6000000}
	e.state.Fields = append(e.state.Fields, field)
	return field
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
		if v.Owner != p || !v.Building || !v.Active(e.state.Tick) {
			continue
		}
		b, _ := e.buildingRule(v.Type)
		if b.ServiceSlots == 0 {
			continue
		}
		used := int32(0)
		for _, a := range e.state.Entities {
			if a.HP > 0 && a.Owner == p && a.Home == v.ID {
				used++
			}
			for _, j := range a.Jobs {
				if a.Owner == p && j.Started && j.Service == v.ID {
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
		cost, supply, service, code := e.productionAllocation(p, j)
		if code == "already_researched" {
			v.Jobs = v.Jobs[1:]
			return
		}
		if code != "ok" {
			v.State = code
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
	if !j.Research {
		unit, _ := e.catalog.Unit(j.Type)
		if unit.Armor == "air" {
			home := e.entity(j.Service)
			if home == nil || home.Owner != p.ID || home.HP <= 0 || !home.Complete {
				j.Service = 0
				j.Service = e.freeService(p.ID)
				home = e.entity(j.Service)
			}
			if home == nil || !home.Active(e.state.Tick) {
				v.State = "service_full"
				return
			}
		}
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
		pos, ok := e.productionExitPosition(v, j.Type, 6000)
		if u, found := e.catalog.Unit(j.Type); found && u.Armor == "air" && j.Service == v.ID {
			if !e.parkingAttempt(v) {
				v.State = "exit_blocked"
				return
			}
			candidate := &Entity{ID: e.state.NextID, Type: j.Type, Owner: p.ID, Home: v.ID}
			pos, ok = e.serviceLandingPosition(candidate, v)
		}
		if !ok {
			v.State = "exit_blocked"
			return
		}
		v.ParkingRetryAt = 0
		unit := e.spawn(j.Type, p.ID, pos, true, j.Paid)
		unit.Home = j.Service
		if e.isAircraft(unit) {
			unit.Landed = true
			if home := e.entity(unit.Home); home != nil && home.ID == v.ID {
				unit.Position = pos
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
		if j.Emergency {
			e.emit("emergency_rig_ready", p.ID, unit.ID, pos, "owner", j.Paid)
		}
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
	for _, observation := range e.player(v.Owner).KnownFields {
		if observation.Remaining <= 0 {
			continue
		}
		f := e.field(observation.ID)
		if f == nil {
			continue
		}
		waiting := int64(0)
		for _, id := range f.Queue {
			if actor := e.entity(id); actor != nil && actor.Owner == v.Owner && e.harvestReservationActive(actor, f.ID) {
				waiting++
			}
		}
		score := dist2(v.Position, observation.Position) + waiting*4000000
		if score < bestScore {
			best, bestScore = f, score
		}
	}
	return best
}
func (e *Engine) chooseDepot(v *Entity) *Entity {
	depots := []*Entity{}
	for _, d := range e.state.Entities {
		if d.Owner != v.Owner || e.role(d) != "supply" || !d.Active(e.state.Tick) {
			continue
		}
		depots = append(depots, d)
	}
	sort.SliceStable(depots, func(i, j int) bool {
		left, right := dist2(v.Position, depots[i].Position), dist2(v.Position, depots[j].Position)
		return left < right || left == right && depots[i].ID < depots[j].ID
	})
	if len(depots) == 0 {
		return nil
	}
	known := e.haulerRoutingFor(v)
	for _, depot := range depots {
		if e.reachableHaulerDepot(v, depot, known) {
			return depot
		}
	}
	return nil
}
func (e *Engine) updateHarvest() {
	for _, f := range e.state.Fields {
		q := f.Queue[:0]
		for _, id := range f.Queue {
			v := e.entity(id)
			if e.harvestReservationActive(v, f.ID) && v.Cargo < 600000 {
				q = append(q, id)
			}
		}
		f.Queue = q
		if f.Loader != 0 {
			v := e.entity(f.Loader)
			if !e.harvestReservationActive(v, f.ID) || distance(v.Position, f.Position) > 1700 {
				f.Loader = 0
				if v != nil && v.State == "loading" {
					v.State = "gathering"
				}
			}
		}
	}
	for _, v := range e.state.Entities {
		if !v.Active(e.state.Tick) || e.role(v) != "hauler" || e.defeated(v.Owner) || !v.HaulerRetreating && (len(v.Orders) == 0 || v.Orders[0].Kind != "gather") {
			continue
		}
		if !v.HaulerRetreating && v.PinnedDepot != 0 {
			if chosen := e.activeHaulerDepot(v.Owner, v.PinnedDepot); chosen != nil {
				e.changeHaulerDepot(v, chosen.ID)
			}
		}
		if e.activeHaulerDepot(v.Owner, v.Depot) == nil {
			// Delivery belongs to the depot where its three-second timer
			// began. A replacement requires a physical return and fresh timer.
			if v.State == "unloading" {
				v.State = "returning_cargo"
				v.TaskUntil = 0
			}
			var d *Entity
			if !v.HaulerRetreating {
				d = e.activeHaulerDepot(v.Owner, v.PinnedDepot)
				if v.PinnedDepot != 0 && e.ownedHaulerDepot(v.Owner, v.PinnedDepot) == nil {
					v.PinnedDepot = 0
				}
			}
			if d == nil && e.state.Tick >= v.DepotRetryAt {
				d = e.chooseDepot(v)
				if d == nil {
					v.DepotRetryAt = e.state.Tick + seconds(2)
				}
			}
			if d != nil {
				v.Depot = d.ID
				v.DepotRetryAt = 0
				if v.State == "no_supply_center" {
					v.State = "gathering"
					if v.HaulerRetreating || v.Cargo > 0 {
						v.State = "returning_cargo"
					}
				}
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
				v.TaskUntil = 0
				v.State = "gathering"
				e.emit("cargo_delivered", p.ID, v.ID, v.Position, "owner", 0)
				if v.HaulerRetreating {
					e.resumeHaulerTask(v)
				}
			}
			continue
		}
		f := e.field(v.Field)
		observation := e.knownField(e.player(v.Owner), v.Field)
		if !v.HaulerRetreating && (f == nil || observation == nil || observation.Remaining == 0) {
			if v.PinnedField != 0 {
				v.PinnedField = 0
				v.Orders[0].Target = 0
			}
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
		if v.HaulerRetreating || v.Cargo >= 600000 || v.State == "returning_cargo" {
			d := e.entity(v.Depot)
			if e.edgeDistance(v, d) <= 1200 {
				if v.HaulerRetreating && v.Cargo == 0 {
					e.resumeHaulerTask(v)
					continue
				}
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
		// Constrained terrain can require a real waiting slot beyond the usual
		// field approach radius. Arrival there also joins the same FIFO queue.
		atQueue := distance(v.Position, f.Position) <= 7000
		if !atQueue {
			point := e.harvestParkingPoint(v, f)
			_, hasSlot := e.harvestParking[f.ID].slots[v.ID]
			atQueue = hasSlot && e.harvestParking[f.ID].adapted && distance(v.Position, point) <= 1000
		}
		if atQueue && !v.Blocked {
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

// Design §5.3 retains short-reroute reservations and withdraws them after the
// movement system confirms two failed attempts. Cargo and gather intent remain.
func (e *Engine) harvestReservationActive(v *Entity, field uint32) bool {
	if v == nil || !v.Active(e.state.Tick) || e.defeated(v.Owner) || v.Blocked || v.HaulerRetreating || v.Field != field || len(v.Orders) == 0 || v.Orders[0].Kind != "gather" {
		return false
	}
	depot := e.entity(v.Depot)
	return depot != nil && depot.Owner == v.Owner && e.role(depot) == "supply" && depot.Active(e.state.Tick)
}

// Keep the normal loading lane when legal. A nearby cliff or structure may
// cover that lane while another part of the same field remains accessible.
// Search actual path-grid endpoints inside the unchanged loading circle; do
// not let A* relocate the destination outside the extraction radius forever.
func (e *Engine) harvestLoadingPoint(v *Entity, field, preferred Vec) Vec {
	mobiles := false
	snapped := Vec{X: preferred.X / 500 * 500, Y: preferred.Y / 500 * 500}
	if distance(snapped, field) <= 1200 && e.clear(preferred, e.radius(v), v.ID, false, mobiles) && e.clear(snapped, e.radius(v), v.ID, false, mobiles) {
		return preferred
	}
	best, bestScore := preferred, int64(1<<62)
	for y := field.Y/500 - 3; y <= field.Y/500+3; y++ {
		for x := field.X/500 - 3; x <= field.X/500+3; x++ {
			candidate := Vec{X: x * 500, Y: y * 500}
			if distance(candidate, field) > 1000 || !e.clear(candidate, e.radius(v), v.ID, false, mobiles) {
				continue
			}
			if score := dist2(candidate, preferred); score < bestScore {
				best, bestScore = candidate, score
			}
		}
	}
	return best
}
func (e *Engine) harvestGoal(v *Entity) (Vec, bool, int32) {
	if v.State == "no_supply_center" {
		if v.HaulerRetreating {
			return v.Position, false, 200
		}
		if f := e.field(v.Field); f != nil {
			goal := e.harvestParkingPoint(v, f)
			return goal, distance(v.Position, goal) > 250, 200
		}
	}
	if v.State == "unloading" || v.State == "loading" || v.State == "no_known_supplies" {
		return v.Position, false, 200
	}
	if v.HaulerRetreating || v.Cargo >= 600000 || v.State == "returning_cargo" {
		if d := e.entity(v.Depot); d != nil {
			return e.harvestDepotGoal(v, d), e.edgeDistance(v, d) > 1100, 300
		}
	}
	if f := e.field(v.Field); f != nil {
		index := 0
		// A withdrawn reservation cannot keep obstructing the loading circle.
		if v.Blocked {
			index = 1
		}
		if len(f.Queue) > 0 {
			e.harvestParkingPoint(v, f)
			if e.harvestParking[f.ID].adapted {
				index = 1
			}
		}
		for i, id := range f.Queue {
			if id == v.ID {
				index = i
				break
			}
		}
		if f.Loader != 0 && f.Loader != v.ID {
			index++
		}
		// Stable approach sides let the next loader enter while the previous
		// hauler leaves. Rotate them with the actual unloading route instead of
		// privileging a hard-coded southeast supply-building orientation.
		dx, dy := int32(0), int32(1000)
		if depot := e.entity(v.Depot); depot != nil {
			dx, dy = depot.Position.X-f.Position.X, depot.Position.Y-f.Position.Y
		}
		length := max(1, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy)))
		ordinal := 0
		for _, other := range e.state.Entities {
			if other.ID >= v.ID {
				break
			}
			if other.HP > 0 && other.Field == f.ID && e.role(other) == "hauler" && len(other.Orders) > 0 && other.Orders[0].Kind == "gather" {
				ordinal++
			}
		}
		side := int32(1)
		if ordinal%2 != 0 {
			side = -1
		}
		across, along := side*650, int32(-500)
		if index > 0 {
			// Stable, unique parking slots do not swap sides when a delivery
			// changes FIFO order. Only the head approaches the loading area.
			// Leave more than two hauler radii between successive rows.
			row := int32(ordinal / 2)
			across = side * (3000 + row*700)
			along = -500 - row*2200
		}
		goal := Vec{X: f.Position.X + int32((int64(dx)*int64(along)-int64(dy)*int64(across))/int64(length)),
			Y: f.Position.Y + int32((int64(dy)*int64(along)+int64(dx)*int64(across))/int64(length))}
		if index == 0 {
			goal = e.harvestLoadingPoint(v, f.Position, goal)
		} else {
			goal = e.harvestParkingPoint(v, f)
		}
		return goal, distance(v.Position, goal) > 250, 200
	}
	return v.Position, false, 200
}

// Parking is derived from the stable roster and static geometry, never FIFO
// position or moving actor locations. Rebuilding it after Restore yields the
// same destinations. Reserve a through-lane for each depot so parked haulers
// cannot seal the only exit from a field beside the map boundary.
func (e *Engine) harvestParkingPoint(v *Entity, field *ResourceField) Vec {
	members := []harvestParkingMember{}
	for _, other := range e.state.Entities {
		if other.HP <= 0 || other.Container != 0 || other.Field != field.ID || e.role(other) != "hauler" || len(other.Orders) == 0 || other.Orders[0].Kind != "gather" {
			continue
		}
		member := harvestParkingMember{id: other.ID, radius: e.radius(other), depot: other.Depot}
		if depot := e.entity(other.Depot); depot != nil {
			member.destination = depot.Position
		}
		members = append(members, member)
	}
	cache := e.harvestParking[field.ID]
	same := cache.revision == e.state.NavigationRevision && cache.field == field.Position && len(cache.members) == len(members)
	if same {
		for i := range members {
			if members[i] != cache.members[i] {
				same = false
				break
			}
		}
	}
	if !same || cache.slots == nil {
		cache = harvestParkingCache{revision: e.state.NavigationRevision, field: field.Position, members: members, slots: map[ID]Vec{}}
		reserved := []reservedExit{}
		for ordinal, member := range members {
			preferred := harvestParkingPreferred(field.Position, member.destination, ordinal)
			valid := func(candidate Vec) bool {
				snapped := Vec{X: candidate.X / 500 * 500, Y: candidate.Y / 500 * 500}
				if distance(snapped, field.Position) < 3000 || !e.clear(candidate, member.radius, member.id, false, false) || !e.clear(snapped, member.radius, member.id, false, false) {
					return false
				}
				for _, old := range reserved {
					r := member.radius + old.radius + 400
					if dist2(snapped, old.position) < int64(r)*int64(r) {
						return false
					}
				}
				for _, route := range members {
					if route.destination != (Vec{}) && harvestLaneDistance(snapped, field.Position, route.destination) < member.radius+1400 {
						return false
					}
				}
				return true
			}
			point, found := preferred, valid(preferred)
			if !found {
				cache.adapted = true
				best := int64(1 << 62)
				// A bounded grid has wider gaps than two hauler radii and normal arrival
				// tolerance. Every fallback endpoint is a real 500-millitile path node.
				for y := int32(-5); y <= 5; y++ {
					for x := int32(-5); x <= 5; x++ {
						candidate := Vec{X: field.Position.X/500*500 + x*4000, Y: field.Position.Y/500*500 + y*4000}
						score := dist2(candidate, preferred)
						if score >= best || !valid(candidate) || !e.clear(candidate, member.radius*3+500, member.id, false, false) {
							continue
						}
						passing := true
						for _, old := range reserved {
							r := member.radius*2 + old.radius + 1000
							if dist2(candidate, old.position) < int64(r)*int64(r) {
								passing = false
								break
							}
						}
						if !passing {
							continue
						}
						point, found, best = candidate, true, score
					}
				}
			}
			if found {
				cache.slots[member.id] = point
				reserved = append(reserved, reservedExit{position: Vec{X: point.X / 500 * 500, Y: point.Y / 500 * 500}, radius: member.radius})
			}
		}
		if e.harvestParking == nil {
			e.harvestParking = map[uint32]harvestParkingCache{}
		}
		e.harvestParking[field.ID] = cache
	}
	if point, ok := cache.slots[v.ID]; ok {
		return point
	}
	return v.Position
}
func harvestParkingPreferred(field, depot Vec, ordinal int) Vec {
	dx, dy := int32(0), int32(1000)
	if depot != (Vec{}) {
		dx, dy = depot.X-field.X, depot.Y-field.Y
	}
	length := max(1, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy)))
	side := int32(1)
	if ordinal%2 != 0 {
		side = -1
	}
	row := int32(ordinal / 2)
	across, along := side*(3000+row*700), -500-row*2200
	return Vec{X: field.X + int32((int64(dx)*int64(along)-int64(dy)*int64(across))/int64(length)), Y: field.Y + int32((int64(dy)*int64(along)+int64(dx)*int64(across))/int64(length))}
}
func harvestLaneDistance(point, from, to Vec) int32 {
	dx, dy := int64(to.X-from.X), int64(to.Y-from.Y)
	length := dx*dx + dy*dy
	if length == 0 {
		return distance(point, from)
	}
	along := max(int64(0), min(length, int64(point.X-from.X)*dx+int64(point.Y-from.Y)*dy))
	nearest := Vec{X: from.X + int32(dx*along/length), Y: from.Y + int32(dy*along/length)}
	return distance(point, nearest)
}
