package sim

import "sort"

// FieldObservation is the player's last public observation, not live stock.
// Human automation and presentation never refresh an unseen field from State.
type FieldObservation struct {
	ID        uint32 `json:"id"`
	Position  Vec    `json:"position"`
	Remaining int64  `json:"remaining"`
	Seen      Tick   `json:"seen"`
}

func (e *Engine) knownField(p *Player, id uint32) *FieldObservation {
	if p == nil {
		return nil
	}
	i := sort.Search(len(p.KnownFields), func(i int) bool { return p.KnownFields[i].ID >= id })
	if i < len(p.KnownFields) && p.KnownFields[i].ID == id {
		return &p.KnownFields[i]
	}
	return nil
}

func (e *Engine) observeField(p *Player, f *ResourceField) {
	observation := FieldObservation{ID: f.ID, Position: f.Position, Remaining: f.Remaining, Seen: e.state.Tick}
	i := sort.Search(len(p.KnownFields), func(i int) bool { return p.KnownFields[i].ID >= f.ID })
	if i < len(p.KnownFields) && p.KnownFields[i].ID == f.ID {
		p.KnownFields[i] = observation
		return
	}
	p.KnownFields = append(p.KnownFields, FieldObservation{})
	copy(p.KnownFields[i+1:], p.KnownFields[i:])
	p.KnownFields[i] = observation
}

func (e *Engine) observeFields(p *Player) {
	for _, f := range e.state.Fields {
		if e.canSee(p.ID, f.Position) {
			e.observeField(p, f)
		}
	}
}

func (e *Engine) ownedHaulerDepot(owner PlayerID, id ID) *Entity {
	d := e.entity(id)
	if d == nil || d.Owner != owner || e.defeated(owner) || e.role(d) != "supply" || d.HP <= 0 || !d.Complete {
		return nil
	}
	return d
}

func (e *Engine) activeHaulerDepot(owner PlayerID, id ID) *Entity {
	d := e.ownedHaulerDepot(owner, id)
	if d == nil || !d.Active(e.state.Tick) {
		return nil
	}
	return d
}

func (e *Engine) validateHaulerControl(player PlayerID, selected []*Entity, o Order) string {
	if o.Queued {
		return "configuration_not_queueable"
	}
	if o.Kind == "retreat_when_attacked" && o.Index > 1 {
		return "invalid_toggle"
	}
	if code := e.validateMobileSources(o, selected); code != "ok" {
		return code
	}
	for _, v := range selected {
		if e.role(v) != "hauler" {
			return "hauler_required"
		}
	}
	if o.Kind == "gather_depot" && o.Target != 0 && e.activeHaulerDepot(player, o.Target) == nil {
		return "owned_supply_center_required"
	}
	return "ok"
}

func (e *Engine) haulerControl(player PlayerID, selected []*Entity, o Order) string {
	if code := e.validateHaulerControl(player, selected, o); code != "ok" {
		return code
	}
	for _, v := range selected {
		if o.Kind == "retreat_when_attacked" {
			v.RetreatWhenAttacked = o.Index == 1
			if !v.RetreatWhenAttacked && v.HaulerRetreating {
				e.resumeHaulerTask(v)
			}
			continue
		}
		v.PinnedDepot = o.Target
		v.DepotRetryAt = 0
		// A safety return already in progress keeps its reachable destination.
		// The independently chosen depot applies when the chosen task resumes.
		if v.HaulerRetreating || len(v.Orders) == 0 || v.Orders[0].Kind != "gather" {
			continue
		}
		depot := o.Target
		if depot == 0 {
			if automatic := e.chooseDepot(v); automatic != nil {
				depot = automatic.ID
			}
		}
		e.changeHaulerDepot(v, depot)
	}
	return "ok"
}

func (e *Engine) changeHaulerDepot(v *Entity, depot ID) {
	if v.Depot == depot {
		return
	}
	v.Depot = depot
	if v.State == "unloading" {
		v.State = "returning_cargo"
		v.TaskUntil = 0
	}
	if v.State == "returning_cargo" || v.State == "no_supply_center" {
		v.Path = nil
		v.PathResolved = false
		v.NextRouteAt = 0
		v.RouteFailures = 0
		v.Blocked = false
		v.LastProgress = e.state.Tick
	}
}

func (e *Engine) releaseHaulerReservation(v *Entity) {
	for _, f := range e.state.Fields {
		if f.Loader == v.ID {
			f.Loader = 0
		}
		q := f.Queue[:0]
		for _, id := range f.Queue {
			if id != v.ID {
				q = append(q, id)
			}
		}
		f.Queue = q
	}
}

func (e *Engine) retreatHauler(v *Entity) {
	if !v.RetreatWhenAttacked || v.HaulerRetreating || e.role(v) != "hauler" || !v.Active(e.state.Tick) || e.defeated(v.Owner) || len(v.Orders) == 0 || v.Orders[0].Kind != "gather" {
		return
	}
	v.HaulerRetreating = true
	e.releaseHaulerReservation(v)
	v.TaskUntil = 0
	v.Path = nil
	v.PathResolved = false
	v.NextRouteAt = 0
	v.RouteFailures = 0
	v.Blocked = false
	v.LastProgress = e.state.Tick
	v.DepotRetryAt = 0
	v.Depot = 0
	if depot := e.chooseDepot(v); depot != nil {
		v.Depot = depot.ID
	} else {
		v.DepotRetryAt = e.state.Tick + seconds(2)
	}
	v.State = "returning_cargo"
	e.emit("hauler_retreat", v.Owner, v.ID, v.Position, "owner", int64(v.Depot))
}

func (e *Engine) resumeHaulerTask(v *Entity) {
	v.HaulerRetreating = false
	v.TaskUntil = 0
	// Orders were never consumed by the safety return. Activate their chosen
	// task again so queued work, a field pin and a depot pin all survive.
	e.activateMovementQueue(v)
}

// Reconcile after destruction/capture and before publishing a tick boundary.
// An invalidated depot never carries an unloading timer to a replacement.
func (e *Engine) reconcileHaulerDepots() {
	for _, v := range e.state.Entities {
		if e.role(v) != "hauler" {
			continue
		}
		if e.defeated(v.Owner) {
			v.HaulerRetreating = false
			v.TaskUntil = 0
		}
		if v.PinnedDepot != 0 && e.ownedHaulerDepot(v.Owner, v.PinnedDepot) == nil {
			v.PinnedDepot = 0
		}
		if v.Depot != 0 && e.activeHaulerDepot(v.Owner, v.Depot) == nil {
			e.changeHaulerDepot(v, 0)
			v.DepotRetryAt = 0
		}
	}
}

// Counts disclose only this owner's active loader and waiting reservations.
// Other players' identities/positions/orders/queue sizes stay private.
func (e *Engine) ownedHarvestQueue(v *Entity) (position, length int32) {
	f := e.field(v.Field)
	if f == nil {
		return 0, 0
	}
	if loader := e.entity(f.Loader); loader != nil && loader.Owner == v.Owner && e.harvestReservationActive(loader, f.ID) {
		length = 1
		if loader.ID == v.ID {
			position = 1
		}
	}
	for _, id := range f.Queue {
		actor := e.entity(id)
		if actor == nil || actor.Owner != v.Owner || !e.harvestReservationActive(actor, f.ID) {
			continue
		}
		length++
		if id == v.ID {
			position = length
		}
	}
	return position, length
}

type haulerRoutingKey struct {
	owner  PlayerID
	radius int32
}

type haulerRoutingKnowledge struct {
	engine     *Engine
	components []uint32
	width      int32
	height     int32
}

// Depot selection projects geometry from permitted knowledge. Physical movement
// still uses the ordinary bounded pathfinder and can encounter new obstacles.
// No full-state navigation or parking cache enters this selection.
func (e *Engine) haulerRoutingFor(v *Entity) *haulerRoutingKnowledge {
	if e.haulerRouting == nil || e.haulerRoutingTick != e.state.Tick {
		e.haulerRouting = map[haulerRoutingKey]*haulerRoutingKnowledge{}
		e.haulerRoutingTick = e.state.Tick
	}
	key := haulerRoutingKey{owner: v.Owner, radius: e.radius(v)}
	if known := e.haulerRouting[key]; known != nil {
		return known
	}
	p := e.player(v.Owner)
	known := &Engine{catalog: e.catalog, buildingRules: e.buildingRules}
	known.state.Map = e.aiPlanningMap(p)
	known.state.Tick = e.state.Tick
	seen := map[ID]bool{}
	for _, actor := range e.state.Entities {
		if actor.Building && actor.HP > 0 && (actor.Owner == v.Owner || e.canSeeEntity(v.Owner, actor)) {
			known.state.Entities = append(known.state.Entities, actor)
			seen[actor.ID] = true
		}
	}
	for _, memory := range p.Memory {
		if seen[memory.ID] || e.canSee(v.Owner, memory.Position) {
			continue
		}
		known.state.Entities = append(known.state.Entities, &Entity{ID: memory.ID, Owner: memory.Owner, Type: memory.Type, Position: memory.Position, HP: 1, Building: true, FootprintWidth: memory.FootprintWidth, FootprintHeight: memory.FootprintHeight, FootprintType: memory.FootprintType})
	}
	w, h := known.state.Map.Width*2, known.state.Map.Height*2
	cells := known.navigationCells(key.radius)
	components := make([]uint32, len(cells))
	queue := make([]int32, 0, len(cells))
	component := uint32(0)
	for index, passable := range cells {
		if !passable || components[index] != 0 {
			continue
		}
		component++
		components[index] = component
		queue = append(queue[:0], int32(index))
		for head := 0; head < len(queue); head++ {
			at := queue[head]
			x, y := at%w, at/w
			for _, direction := range neighbors {
				nx, ny := x+direction.X, y+direction.Y
				if nx < 0 || ny < 0 || nx >= w || ny >= h {
					continue
				}
				next := ny*w + nx
				if !cells[next] || components[next] != 0 || direction.X != 0 && direction.Y != 0 && (!cells[y*w+nx] || !cells[ny*w+x]) {
					continue
				}
				components[next] = component
				queue = append(queue, next)
			}
		}
	}
	result := &haulerRoutingKnowledge{engine: known, components: components, width: w, height: h}
	e.haulerRouting[key] = result
	return result
}

func (k *haulerRoutingKnowledge) component(point Vec) uint32 {
	x, y := point.X/500, point.Y/500
	if point.X < 0 || point.Y < 0 || point.X%500 != 0 || point.Y%500 != 0 || x >= k.width || y >= k.height {
		return 0
	}
	return k.components[y*k.width+x]
}

func (e *Engine) reachableHaulerDepot(v, depot *Entity, known *haulerRoutingKnowledge) bool {
	starts := map[uint32]bool{}
	sx, sy := v.Position.X/500, v.Position.Y/500
	for dy := int32(-1); dy <= 1; dy++ {
		for dx := int32(-1); dx <= 1; dx++ {
			point := Vec{X: (sx + dx) * 500, Y: (sy + dy) * 500}
			component := known.component(point)
			if component != 0 && known.engine.navigationBridgeClear(v, point, false) {
				starts[component] = true
			}
		}
	}
	for y := max(int32(0), depot.Position.Y-4000) / 500 * 500; y <= depot.Position.Y+4000; y += 500 {
		for x := max(int32(0), depot.Position.X-4000) / 500 * 500; x <= depot.Position.X+4000; x += 500 {
			point := Vec{X: x, Y: y}
			if !starts[known.component(point)] {
				continue
			}
			probe := *v
			probe.Position = point
			// A nearby A* fallback beyond unloading contact is not a depot.
			if e.edgeDistance(&probe, depot) <= 1100 {
				return true
			}
		}
	}
	return false
}
