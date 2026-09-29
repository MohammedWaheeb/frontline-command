package sim

import "frontlinecommand/pkg/content"

func (e *Engine) radius(v *Entity) int32 {
	if v.Building {
		return 0
	}
	u, _ := e.catalog.Unit(v.Type)
	return u.Radius
}
func (e *Engine) armor(v *Entity) string {
	if v.Building {
		return "structure"
	}
	u, _ := e.catalog.Unit(v.Type)
	if u.Armor == "air" && v.Landed {
		return "light"
	}
	return u.Armor
}
func (e *Engine) isAircraft(v *Entity) bool {
	if v.Building {
		return false
	}
	u, ok := e.catalog.Unit(v.Type)
	return ok && u.Armor == "air"
}
func (e *Engine) edgeDistance(a, b *Entity) int32 {
	dx, dy := abs(a.Position.X-b.Position.X), abs(a.Position.Y-b.Position.Y)
	if a.Building {
		width, height := e.footprint(a)
		dx = max(0, dx-width*500)
		dy = max(0, dy-height*500)
	}
	if b.Building {
		width, height := e.footprint(b)
		dx = max(0, dx-width*500)
		dy = max(0, dy-height*500)
	}
	return max(0, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy))-e.radius(a)-e.radius(b))
}
func (e *Engine) distanceTo(v *Entity, p Vec) int32 {
	dummy := Entity{Position: p}
	return e.edgeDistance(v, &dummy)
}
func rectOverlap(a Vec, aw, ah int32, b Vec, bw, bh int32) bool {
	return abs(a.X-b.X) < (aw+bw)*500 && abs(a.Y-b.Y) < (ah+bh)*500
}
func (e *Engine) validPlacement(player PlayerID, pos Vec, width, height int32) string {
	// Centers are tile-aligned to preserve the authored mandatory-corridor mask.
	if pos.X%500 != 0 || pos.Y%500 != 0 {
		return "snap_to_grid"
	}
	left, right := pos.X-width*500, pos.X+width*500
	top, bottom := pos.Y-height*500, pos.Y+height*500
	if left < 0 || top < 0 || right > e.state.Map.Width*1000 || bottom > e.state.Map.Height*1000 {
		return "outside_map"
	}
	for y := top / 1000; y <= (bottom-1)/1000; y++ {
		for x := left / 1000; x <= (right-1)/1000; x++ {
			p := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			t := e.state.Map.TileAt(p)
			if !t.Passable() {
				return "blocked_terrain"
			}
			if t.Mandatory {
				return "mandatory_corridor"
			}
			if !e.canSee(player, p) {
				return "unseen_placement"
			}
		}
	}
	for _, v := range e.state.Entities {
		if v.HP <= 0 || v.Container != 0 {
			continue
		}
		if v.Building {
			vw, vh := e.footprint(v)
			if rectOverlap(pos, width, height, v.Position, vw, vh) {
				return "occupied"
			}
		} else {
			point, r, blocks := e.groundObstacle(v)
			if !blocks {
				continue
			}
			dx := max(0, abs(point.X-pos.X)-width*500)
			dy := max(0, abs(point.Y-pos.Y)-height*500)
			if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(r)*int64(r) {
				return "occupied"
			}
		}
	}
	return e.resourceFootprint(pos, width, height)
}

// Both normal construction and authored scenario relocation preserve the same
// one-tile access margin around supply fields, stations and the shipment site.
func (e *Engine) resourceFootprint(pos Vec, width, height int32) string {
	left, top, right, bottom := pos.X-width*500, pos.Y-height*500, pos.X+width*500, pos.Y+height*500
	for _, f := range e.state.Fields {
		if f.Position.X >= left-1000 && f.Position.X < right+1000 && f.Position.Y >= top-1000 && f.Position.Y < bottom+1000 {
			return "resource_footprint"
		}
	}
	for _, s := range e.state.Stations {
		if s.Position.X >= left-1000 && s.Position.X < right+1000 && s.Position.Y >= top-1000 && s.Position.Y < bottom+1000 {
			return "objective_footprint"
		}
	}
	p := e.state.Map.Shipment
	if p.X >= left-1000 && p.X < right+1000 && p.Y >= top-1000 && p.Y < bottom+1000 {
		return "shipment_footprint"
	}
	return "ok"
}
func (e *Engine) clear(pos Vec, radius int32, ignore ID, air, mobiles bool) bool {
	return e.clearExcept(pos, radius, ignore, 0, air, mobiles)
}
func (e *Engine) clearExcept(pos Vec, radius int32, ignore, ignoredStructure ID, air, mobiles bool) bool {
	if pos.X-radius < 0 || pos.Y-radius < 0 || pos.X+radius >= e.state.Map.Width*1000 || pos.Y+radius >= e.state.Map.Height*1000 {
		return false
	}
	if !air {
		for y := (pos.Y - radius) / 1000; y <= (pos.Y+radius)/1000; y++ {
			for x := (pos.X - radius) / 1000; x <= (pos.X+radius)/1000; x++ {
				tile := e.state.Map.Tiles[y*e.state.Map.Width+x]
				if !tile.Passable() {
					cx, cy := clamp(pos.X, x*1000, (x+1)*1000), clamp(pos.Y, y*1000, (y+1)*1000)
					if dist2(pos, Vec{X: cx, Y: cy}) < int64(radius)*int64(radius) {
						return false
					}
				}
			}
		}
	}
	for _, v := range e.state.Entities {
		if v.ID == ignore || v.ID == ignoredStructure || v.HP <= 0 || v.Container != 0 {
			continue
		}
		if !v.Building && !mobiles {
			continue
		}
		if v.Building {
			if air {
				continue
			}
			width, height := e.footprint(v)
			dx := max(0, abs(pos.X-v.Position.X)-width*500)
			dy := max(0, abs(pos.Y-v.Position.Y)-height*500)
			if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(radius)*int64(radius) {
				return false
			}
		} else if mobiles {
			point, otherRadius, blocks := Vec{}, int32(0), false
			if air {
				if v.Landed {
					continue
				}
				u, ok := e.catalog.Unit(v.Type)
				if !ok || u.Armor != "air" {
					continue
				}
				point, otherRadius, blocks = v.Position, u.Radius, true
			} else {
				point, otherRadius, blocks = e.groundObstacle(v)
			}
			if !blocks {
				continue
			}
			r := radius + otherRadius
			if abs(pos.X-point.X) >= r || abs(pos.Y-point.Y) >= r {
				continue
			}
			if dist2(pos, point) < int64(r)*int64(r) {
				return false
			}
		}
	}
	return true
}

type pathNode struct {
	index  int32
	g      int32
	f      int32
	serial uint32
}
type pathHeap []pathNode

func (h pathHeap) Len() int { return len(h) }
func (h pathHeap) Less(i, j int) bool {
	if h[i].f != h[j].f {
		return h[i].f < h[j].f
	}
	if h[i].g != h[j].g {
		return h[i].g > h[j].g
	}
	if h[i].index != h[j].index {
		return h[i].index < h[j].index
	}
	return h[i].serial < h[j].serial
}
func (h pathHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }
func (h *pathHeap) Push(v any)   { *h = append(*h, v.(pathNode)) }
func (h *pathHeap) Pop() any     { old := *h; v := old[len(old)-1]; *h = old[:len(old)-1]; return v }

var neighbors = []Vec{{X: 1, Y: 0}, {X: 0, Y: 1}, {X: -1, Y: 0}, {X: 0, Y: -1}, {X: 1, Y: 1}, {X: -1, Y: 1}, {X: -1, Y: -1}, {X: 1, Y: -1}}

func heuristic(x, y, gx, gy int32) int32 {
	dx, dy := abs(x-gx), abs(y-gy)
	return max(dx, dy)*1000 + min(dx, dy)*414
}

func (e *Engine) navigationCells(radius int32) []bool {
	if e.navCache == nil || e.navRevision != e.state.NavigationRevision {
		e.navCache = map[int32][]bool{}
		e.navRevision = e.state.NavigationRevision
	}
	if cells, ok := e.navCache[radius]; ok {
		return cells
	}
	w, h := e.state.Map.Width*2, e.state.Map.Height*2
	cells := make([]bool, int(w*h))
	for y := int32(0); y < h; y++ {
		for x := int32(0); x < w; x++ {
			cells[y*w+x] = e.clear(Vec{X: x * 500, Y: y * 500}, radius, 0, false, false)
		}
	}
	e.navCache[radius] = cells
	return cells
}
func (e *Engine) mobileClear(pos Vec, radius int32, ignore ID) bool {
	for _, v := range e.state.Entities {
		if v.ID == ignore || v.Building || v.HP <= 0 || v.Container != 0 {
			continue
		}
		point, otherRadius, blocks := e.groundObstacle(v)
		if !blocks {
			continue
		}
		r := radius + otherRadius
		if dist2(pos, point) < int64(r)*int64(r) {
			return false
		}
	}
	return true
}

// findPath uses coarse-region guidance followed by deterministic tile A*. Fine
// searches share stable collision rules with movement and forbid corner cuts.
func (e *Engine) findPath(v *Entity, goal Vec, dynamic bool) []Vec {
	if e.pathBudget == 0 {
		return nil
	}
	e.pathBudget--
	m := e.state.Map
	r := e.radius(v)
	air := e.isAircraft(v) && !v.Landed
	if air {
		return []Vec{goal}
	}
	gridW, gridH := m.Width*2, m.Height*2
	cells := e.navigationCells(r)
	var mobileCells []ID
	var serviceEdges []uint8
	if dynamic {
		mobileCells = e.mobileObstacleCells(r)
		serviceEdges = e.serviceObstacleEdges(r)
	}
	passable := func(p Vec) bool {
		x, y := p.X/500, p.Y/500
		if x < 0 || y < 0 || x >= gridW || y >= gridH || !cells[y*gridW+x] {
			return false
		}
		return !dynamic || mobileCells[y*gridW+x] == 0 || mobileCells[y*gridW+x] == v.ID
	}
	gx, gy := goal.X/500, goal.Y/500
	sx, sy := v.Position.X/500, v.Position.Y/500
	// Search a nearby free goal to avoid permanent producer/destination overlap.
	found := false
	for ring := int32(0); ring <= 12 && !found; ring++ {
		for dy := -ring; dy <= ring && !found; dy++ {
			for dx := -ring; dx <= ring; dx++ {
				if ring > 0 && abs(dx) != ring && abs(dy) != ring {
					continue
				}
				p := Vec{X: (gx + dx) * 500, Y: (gy + dy) * 500}
				if passable(p) {
					gx, gy = p.X/500, p.Y/500
					found = true
					break
				}
			}
		}
	}
	if !found {
		return nil
	}
	start, end := sy*gridW+sx, gy*gridW+gx
	// Flooring a legal physical position can put its A* start inside a nearby
	// collision circle. Seed reachable adjacent nodes from the actual position
	// instead of applying corner-cut rules to that fictitious blocked start.
	startPoint := Vec{X: sx * 500, Y: sy * 500}
	bridged := !passable(startPoint) || dynamic && !e.serviceSegmentClear(v.Position, startPoint, r)
	starts := []pathNode{{start, 0, heuristic(sx, sy, gx, gy), 0}}
	if bridged {
		starts = nil
		for dy := int32(-1); dy <= 1; dy++ {
			for dx := int32(-1); dx <= 1; dx++ {
				p := Vec{X: (sx + dx) * 500, Y: (sy + dy) * 500}
				if !passable(p) || !e.navigationBridgeClear(v, p, dynamic) {
					continue
				}
				cost := distance(v.Position, p) * 2
				starts = append(starts, pathNode{(sy+dy)*gridW + sx + dx, cost, cost + heuristic(sx+dx, sy+dy, gx, gy), uint32(len(starts))})
			}
		}
		if len(starts) == 0 {
			return nil
		}
	}
	if start == end {
		return []Vec{{X: gx * 500, Y: gy * 500}}
	}
	coarse := e.coarseCorridor(sx/2, sy/2, gx/2, gy/2, r, v.ID)
	search := func(restrict bool) []Vec {
		work := e.navigationSearch.begin(int(gridW * gridH))
		scores, parents := work.scores, work.parents
		for _, seed := range starts {
			work.mark[seed.index] = work.generation
			scores[seed.index] = seed.g
			parents[seed.index] = -1
			work.heap = append(work.heap, seed)
		}
		work.heap.initialize()
		h := &work.heap
		serial := uint32(len(starts))
		expansions := 0
		for h.Len() > 0 && expansions < 32768 {
			n := h.popNode()
			if work.mark[n.index] == work.generation+1 {
				continue
			}
			work.mark[n.index] = work.generation + 1
			expansions++
			if n.index == end {
				path := []Vec{}
				for i := end; i >= 0; i = parents[i] {
					if i == start && !bridged {
						break
					}
					path = append(path, Vec{X: i % gridW * 500, Y: i / gridW * 500})
				}
				for a, b := 0, len(path)-1; a < b; a, b = a+1, b-1 {
					path[a], path[b] = path[b], path[a]
				}
				if dynamic && !bridged && len(path) > 0 && !e.serviceSegmentClear(v.Position, path[0], r) {
					if !e.navigationBridgeClear(v, startPoint, true) {
						return nil
					}
					path = append([]Vec{startPoint}, path...)
				}
				return path
			}
			x, y := n.index%gridW, n.index/gridW
			for edge, d := range neighbors {
				if len(serviceEdges) > 0 && serviceEdges[n.index]&(1<<edge) != 0 {
					continue
				}
				nx, ny := x+d.X, y+d.Y
				if nx < 0 || ny < 0 || nx >= gridW || ny >= gridH {
					continue
				}
				index := ny*gridW + nx
				if work.mark[index] == work.generation+1 {
					continue
				}
				if restrict && !coarse[(ny/16)*((m.Width+7)/8)+nx/16] {
					continue
				}
				p := Vec{X: nx * 500, Y: ny * 500}
				if !passable(p) {
					continue
				}
				if d.X != 0 && d.Y != 0 && (!passable(Vec{X: x * 500, Y: ny * 500}) || !passable(Vec{X: nx * 500, Y: y * 500})) {
					continue
				}
				cost := int32(1000)
				if d.X != 0 && d.Y != 0 {
					cost = 1414
				}
				if m.TileAt(p).Cover() {
					u, _ := e.catalog.Unit(v.Type)
					if u.Armor != "infantry" {
						cost = cost * 5 / 4
					}
				}
				g := n.g + cost
				if work.mark[index] != work.generation || g < scores[index] {
					work.mark[index] = work.generation
					scores[index] = g
					parents[index] = n.index
					serial++
					h.pushNode(pathNode{index, g, g + heuristic(nx, ny, gx, gy), serial})
				}
			}
		}
		return nil
	}
	if len(coarse) > 0 {
		if p := search(true); len(p) > 0 {
			return p
		}
	}
	return search(false)
}
func (e *Engine) coarseCorridor(sx, sy, gx, gy, r int32, ignore ID) map[int32]bool {
	m := e.state.Map
	staticClear := func(position Vec) bool { return e.clear(position, r, ignore, false, false) }
	// Portal samples are exact half-tile grid points. The existing static cache
	// uses the same clearance test and revision invalidation, with no mobiles.
	// Ignoring a structure changes that test, so retain the direct path for it.
	if ignored := e.entity(ignore); ignored == nil || !ignored.Building {
		cells := e.navigationCells(r)
		w, h := m.Width*2, m.Height*2
		staticClear = func(position Vec) bool {
			x, y := position.X/500, position.Y/500
			return position.X >= 0 && position.Y >= 0 && x < w && y < h && cells[y*w+x]
		}
	}
	cw, ch := (m.Width+7)/8, (m.Height+7)/8
	start, goal := (sy/8)*cw+sx/8, (gy/8)*cw+gx/8
	parents := make([]int32, cw*ch)
	for i := range parents {
		parents[i] = -2
	}
	parents[start] = -1
	q := []int32{start}
	for n := 0; n < len(q); n++ {
		c := q[n]
		if c == goal {
			break
		}
		x, y := c%cw, c/cw
		for _, d := range neighbors[:4] {
			nx, ny := x+d.X, y+d.Y
			if nx < 0 || ny < 0 || nx >= cw || ny >= ch {
				continue
			}
			j := ny*cw + nx
			if parents[j] != -2 {
				continue
			}
			portal := false
			for k := int32(0); k < 8; k++ {
				var a, b Vec
				if d.X != 0 {
					edge := max(x, nx) * 8 * 1000
					a = Vec{X: edge - 500, Y: (y*8+k)*1000 + 500}
					b = Vec{X: edge + 500, Y: a.Y}
				} else {
					edge := max(y, ny) * 8 * 1000
					a = Vec{X: (x*8+k)*1000 + 500, Y: edge - 500}
					b = Vec{X: a.X, Y: edge + 500}
				}
				if staticClear(a) && staticClear(b) {
					portal = true
					break
				}
			}
			if portal {
				parents[j] = c
				q = append(q, j)
			}
		}
	}
	if parents[goal] == -2 {
		return nil
	}
	allowed := map[int32]bool{}
	for c := goal; c >= 0; c = parents[c] {
		x, y := c%cw, c/cw
		for dy := int32(-1); dy <= 1; dy++ {
			for dx := int32(-1); dx <= 1; dx++ {
				nx, ny := x+dx, y+dy
				if nx >= 0 && ny >= 0 && nx < cw && ny < ch {
					allowed[ny*cw+nx] = true
				}
			}
		}
	}
	return allowed
}
func (e *Engine) updateMovement() {
	for _, v := range e.state.Entities {
		if v.HP <= 0 || v.Building || v.Container != 0 || v.DisabledUntil > e.state.Tick || e.defeated(v.Owner) {
			continue
		}
		v.LastPosition = v.Position
		if v.EmergencyTakeoffUntil > e.state.Tick {
			continue
		}
		if v.PackingUntil > e.state.Tick || v.DeployUntil > e.state.Tick || v.Deployed || v.Channel != "" {
			continue
		}
		if e.isAircraft(v) && v.Landed && v.ServiceWork == 0 && len(v.Orders) > 0 {
			switch v.Orders[0].Kind {
			case "attack", "attack_move", "move", "guard", "escort", "patrol", "aggressive":
				if e.clear(v.Position, e.radius(v), v.ID, true, true) {
					v.Landed = false
					v.Landing = nil
					v.State = "taking_off"
				}
			}
		}
		e.updateOrderAnchor(v)
		if e.fixedWing(v) && !v.Landed && (len(v.Orders) == 0 || v.Orders[0].Kind != "return") {
			e.flyPass(v)
			continue
		}
		if len(v.Orders) == 0 {
			continue
		}
		o := v.Orders[0]
		goal := o.Position
		moving := false
		arrive := int32(180)
		switch o.Kind {
		case "move", "attack_move", "patrol":
			if o.Kind == "patrol" {
				goal = o.Points[o.Index]
			}
			moving = true
			if (o.Kind == "attack_move" || o.Kind == "patrol") && v.Target != 0 {
				target := e.entity(v.Target)
				if target != nil && e.canAttack(v, target) && e.canSeeEntity(v.Owner, target) {
					w, ok := e.weapon(v)
					if ok && e.edgeDistance(v, target) <= w.MaxRange {
						moving = e.edgeDistance(v, target) < w.MinRange
						if moving {
							goal = e.minimumRangeRetreat(v, target)
						}
					}
				}
			}
		case "attack":
			target := e.entity(o.Target)
			if target != nil && e.canSeeEntity(v.Owner, target) && e.defeated(target.Owner) {
				e.completeMovementOrder(v)
				continue
			}
			if target != nil && e.canSeeEntity(v.Owner, target) {
				v.LastTarget = target.Position
				v.Target = target.ID
				goal = e.approachPoint(v, target)
				w, _ := e.weapon(v)
				moving = e.edgeDistance(v, target) > w.MaxRange || e.edgeDistance(v, target) < w.MinRange
				if e.edgeDistance(v, target) < w.MinRange {
					goal = e.minimumRangeRetreat(v, target)
				}
			} else {
				v.Target = 0
				goal = v.LastTarget
				moving = true
				if distance(v.Position, goal) < 1000 {
					// Searching the last observed position finishes this attack,
					// not the later commands the player deliberately queued.
					e.completeMovementOrder(v)
					moving = false
				}
			}
		case "build", "repair", "capture", "board":
			target := e.entity(o.Target)
			if target != nil {
				goal = e.approachPoint(v, target)
				moving = e.edgeDistance(v, target) > 900
				if o.Kind == "board" {
					goal = e.boardingApproachPoint(v, target)
					moving = e.boardingDistance(v, target) > 900
				}
				arrive = 350
			} else if o.Kind == "capture" {
				for _, s := range e.state.Stations {
					if s.ID == o.Target {
						goal = s.Position
						moving = distance(v.Position, goal) > 1200
						arrive = 1200
					}
				}
			}
		case "guard", "escort", "aggressive":
			goal = v.Anchor
			moving = distance(v.Position, goal) > 1000
			if target := e.entity(v.Target); target != nil && e.canSeeEntity(v.Owner, target) {
				w, _ := e.weapon(v)
				if distance(v.Anchor, target.Position) <= e.combatLeash(v) {
					moving = false
				}
				if e.edgeDistance(v, target) > w.MaxRange && distance(v.Anchor, target.Position) <= e.combatLeash(v) {
					goal = e.approachPoint(v, target)
					moving = true
				}
			}
		case "gather":
			goal, moving, arrive = e.harvestGoal(v)
		case "unload":
			if o.Position != (Vec{}) {
				goal = o.Position
				arrive = 300
				moving = distance(v.Position, goal) > arrive
			}
		case "salvage":
			if crate := e.salvage(o.Target); crate != nil {
				goal, arrive = crate.Position, 1000
				moving = distance(v.Position, goal) > arrive
			} else {
				e.completeMovementOrder(v)
			}
		case "return":
			home := e.entity(v.Home)
			if home != nil && home.HP > 0 {
				goal = e.landingPoint(v, home)
				moving = !v.Landed
				arrive = 300
			}
		}
		if !moving {
			continue
		}
		if e.isAircraft(v) && v.Landed {
			if v.ServiceWork > 0 {
				continue
			}
			v.Landed = false
			v.State = "taking_off"
		}
		if distance(v.Position, goal) <= arrive {
			if o.Kind == "patrol" {
				e.advanceMovementPatrol(v)
			}
			if o.Kind == "move" || o.Kind == "attack_move" {
				e.completeMovementOrder(v)
			}
			continue
		}
		if len(v.Path) == 0 && v.PathResolved && distance(v.Position, v.PathEnd) < 250 && (o.Kind == "move" || o.Kind == "attack_move" || o.Kind == "patrol") {
			if o.Kind == "patrol" {
				e.advanceMovementPatrol(v)
				continue
			}
			e.completeMovementOrder(v)
			continue
		}
		if len(v.Path) == 0 || distance(goal, v.PathGoal) > 1400 || v.PathRevision != e.state.NavigationRevision {
			if e.state.Tick < v.NextRouteAt && v.PathRevision == e.state.NavigationRevision && distance(goal, v.PathGoal) <= 1400 {
				continue
			}
			if e.pathBudget == 0 {
				continue
			}
			v.Path = e.findPath(v, goal, v.RouteFailures > 0)
			if o.Kind == "unload" && len(v.Path) > 0 {
				end := v.Path[len(v.Path)-1]
				// Grid nodes are 500 millitiles apart; truncating a legal click can
				// leave the carrier 706 away, outside its 400-unit unload radius.
				// Finish within the same grid cell, without accepting a relocated
				// blocked destination or broadening the unloading tolerance.
				if end != goal && end.X/500 == goal.X/500 && end.Y/500 == goal.Y/500 && e.clear(goal, e.radius(v), v.ID, false, false) {
					v.Path = append(v.Path, goal)
				}
			}
			v.PathGoal = goal
			v.PathRevision = e.state.NavigationRevision
			if len(v.Path) == 0 {
				v.NextRouteAt = e.state.Tick + seconds(2)
				e.blocked(v)
				continue
			}
			v.NextRouteAt = 0
			v.PathEnd = v.Path[len(v.Path)-1]
			v.PathResolved = true
		}
		p := v.Path[0]
		u, _ := e.catalog.Unit(v.Type)
		desired := direction(p.X-v.Position.X, p.Y-v.Position.Y)
		if u.Armor == "infantry" {
			v.Facing = desired
		} else {
			v.Facing = turn(v.Facing, desired, 9000)
			if abs(angleDifference(v.Facing, desired)) > 9000 {
				v.State = "turning"
				v.LastProgress = e.state.Tick
				continue
			}
		}
		speed := u.Speed
		if e.state.Map.TileAt(v.Position).Cover() && !e.isAircraft(v) && u.Armor != "infantry" {
			speed = speed * 80 / 100
		}
		if e.hasBuff(v, "disperse") || e.hasBuff(v, "recall") {
			speed = speed * 120 / 100
		}
		step := (speed + v.MoveRemainder) / 20
		v.MoveRemainder = (speed + v.MoveRemainder) % 20
		d := distance(v.Position, p)
		next := p
		if d > step {
			next = Vec{X: v.Position.X + int32(int64(p.X-v.Position.X)*int64(step)/int64(d)), Y: v.Position.Y + int32(int64(p.Y-v.Position.Y)*int64(step)/int64(d))}
		}
		air := e.isAircraft(v) && !v.Landed
		if e.clear(next, e.radius(v), v.ID, air, true) && (air || e.serviceSegmentClear(v.Position, next, e.radius(v))) {
			v.Position = next
			v.State = "moving"
			v.LastProgress = e.state.Tick
			v.Blocked = false
			v.RouteFailures = 0
			if distance(next, p) < 120 && (next == p || air || len(v.Path) < 2 || e.serviceSegmentClear(next, v.Path[1], e.radius(v))) {
				v.Path = v.Path[1:]
			}
			v.StationarySince = e.state.Tick
			v.Concealed = false
		} else if !air || !e.airDetour(v, p) {
			e.blocked(v)
		}
	}
}
func (e *Engine) minimumRangeRetreat(v, target *Entity) Vec {
	dx, dy := v.Position.X-target.Position.X, v.Position.Y-target.Position.Y
	if dx == 0 && dy == 0 {
		dx = 1000
	}
	length := max(1, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy)))
	return Vec{X: clamp(v.Position.X+int32(int64(dx)*3000/int64(length)), 1000, e.state.Map.Width*1000-1000), Y: clamp(v.Position.Y+int32(int64(dy)*3000/int64(length)), 1000, e.state.Map.Height*1000-1000)}
}

// Completing a route invalidates its endpoint before a queued order becomes
// current. Otherwise the next move can mistake the previous endpoint for its
// own completed route. Activate queued orders through the ordinary assignment
// setup so hold, guard and gather also receive their normal stance/task state.
func (e *Engine) completeMovementOrder(v *Entity) {
	if len(v.Orders) > 0 {
		v.Orders = v.Orders[1:]
	}
	e.activateMovementQueue(v)
}

func (e *Engine) activateMovementQueue(v *Entity) {
	remaining := v.Orders
	v.Orders = nil
	v.Path = nil
	v.PathResolved = false
	v.PathEnd, v.PathGoal = Vec{}, Vec{}
	v.NextRouteAt = 0
	v.Target = 0
	v.AimUntil = 0
	v.PassUntil = 0
	v.RouteFailures = 0
	v.Blocked = false
	v.State = "idle"
	v.Anchor = v.Position
	for len(remaining) > 0 {
		next := remaining[0]
		remaining = remaining[1:]
		e.assign(v, next)
		// Stop and hold are immediate stance orders. If another accepted
		// order follows, activate it too rather than leaving it uninitialized.
		if len(v.Orders) > 0 {
			v.Orders = append(v.Orders, remaining...)
			return
		}
	}
}

func (e *Engine) advanceMovementPatrol(v *Entity) {
	before := len(v.Orders)
	e.advancePatrol(v)
	if len(v.Orders) < before {
		e.activateMovementQueue(v)
	}
}

func (e *Engine) blocked(v *Entity) {
	if e.state.Tick-v.LastProgress < seconds(2) {
		return
	}
	v.Path = nil
	v.LastProgress = e.state.Tick
	v.RouteFailures++
	if v.RouteFailures >= 2 && !v.Blocked {
		v.Blocked = true
		v.State = "blocked"
		e.emit("route_blocked", v.Owner, v.ID, v.Position, "owner", 0)
	}
}
func (e *Engine) approachPoint(v, target *Entity) Vec {
	dx, dy := v.Position.X-target.Position.X, v.Position.Y-target.Position.Y
	if dx == 0 && dy == 0 {
		dx = 1000
	}
	length := max(1, isqrt(int64(dx)*int64(dx)+int64(dy)*int64(dy)))
	r := e.radius(target) + e.radius(v) + 500
	if target.Building {
		width, height := e.footprint(target)
		// Intersect the approach ray with the actual rectangle. Using the larger
		// dimension leaves builders permanently out of range of short sides.
		rx, ry := int64(1<<40), int64(1<<40)
		if dx != 0 {
			rx = int64(width*500) * int64(length) / int64(abs(dx))
		}
		if dy != 0 {
			ry = int64(height*500) * int64(length) / int64(abs(dy))
		}
		r = int32(min(rx, ry)) + e.radius(v) + 250
	}
	return Vec{X: target.Position.X + int32(int64(dx)*int64(r)/int64(length)), Y: target.Position.Y + int32(int64(dy)*int64(r)/int64(length))}
}
func (e *Engine) exitPosition(source *Entity, typ string, ignore ID, maxRadius int32) (Vec, bool) {
	return e.findExitPosition(source, typ, ignore, maxRadius, nil)
}

type reservedExit struct {
	position Vec
	radius   int32
}

func (e *Engine) findExitPosition(source *Entity, typ string, ignore ID, maxRadius int32, reserved []reservedExit) (Vec, bool) {
	u, ok := e.catalog.Unit(typ)
	if !ok {
		return Vec{}, false
	}
	air := u.Armor == "air"
	baseX, baseY := e.radius(source)+u.Radius+300, e.radius(source)+u.Radius+300
	if source.Building {
		width, height := e.footprint(source)
		baseX, baseY = width*500+u.Radius+300, height*500+u.Radius+300
	}
	for extra := int32(0); extra <= maxRadius; extra += 500 {
		for _, d := range neighbors {
			p := Vec{X: source.Position.X + d.X*(baseX+extra), Y: source.Position.Y + d.Y*(baseY+extra)}
			if e.distanceTo(source, p)-u.Radius > maxRadius {
				continue
			}
			overlaps := false
			for _, other := range reserved {
				r := u.Radius + other.radius
				if dist2(p, other.position) < int64(r)*int64(r) {
					overlaps = true
					break
				}
			}
			if overlaps {
				continue
			}
			if e.clear(p, u.Radius, ignore, air, true) {
				return p, true
			}
		}
	}
	return Vec{}, false
}
func (e *Engine) passengerExits(source *Entity, passengers []ID, maxRadius int32) ([]Vec, bool) {
	positions := make([]Vec, 0, len(passengers))
	reserved := []reservedExit{}
	for _, id := range passengers {
		unit := e.entity(id)
		if unit == nil || unit.HP <= 0 {
			return nil, false
		}
		pos, ok := e.findExitPosition(source, unit.Type, unit.ID, maxRadius, reserved)
		if !ok {
			return nil, false
		}
		positions = append(positions, pos)
		reserved = append(reserved, reservedExit{pos, e.radius(unit)})
	}
	return positions, true
}
func (e *Engine) raidExits(source *Entity) ([]Vec, bool) {
	positions := []Vec{}
	reserved := []reservedExit{}
	for _, typ := range []string{"SY.rifle", "SY.at"} {
		pos, ok := e.findExitPosition(source, typ, 0, 2000, reserved)
		if !ok {
			return nil, false
		}
		u, _ := e.catalog.Unit(typ)
		positions = append(positions, pos)
		reserved = append(reserved, reservedExit{pos, u.Radius})
	}
	return positions, true
}

var _ content.Point
