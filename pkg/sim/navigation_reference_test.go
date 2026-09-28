package sim

import "container/heap"

// Frozen pre-workspace path search, retained as a deterministic behavioral oracle.
func (e *Engine) referenceFindPath(v *Entity, goal Vec, dynamic bool) []Vec {
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
	if dynamic {
		mobileCells = e.mobileObstacleCells(r)
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
	bridged := !passable(Vec{X: sx * 500, Y: sy * 500})
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
	coarse := e.referenceCoarseCorridor(sx/2, sy/2, gx/2, gy/2, r, v.ID)
	search := func(restrict bool) []Vec {
		scores := make([]int32, int(gridW*gridH))
		parents := make([]int32, int(gridW*gridH))
		closed := make([]bool, int(gridW*gridH))
		for i := range scores {
			scores[i] = 1 << 30
			parents[i] = -1
		}
		h := &pathHeap{}
		for _, seed := range starts {
			scores[seed.index] = seed.g
			*h = append(*h, seed)
		}
		heap.Init(h)
		serial := uint32(len(starts))
		expansions := 0
		for h.Len() > 0 && expansions < 32768 {
			n := heap.Pop(h).(pathNode)
			if closed[n.index] {
				continue
			}
			closed[n.index] = true
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
				return path
			}
			x, y := n.index%gridW, n.index/gridW
			for _, d := range neighbors {
				nx, ny := x+d.X, y+d.Y
				if nx < 0 || ny < 0 || nx >= gridW || ny >= gridH {
					continue
				}
				index := ny*gridW + nx
				if closed[index] {
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
				if g < scores[index] {
					scores[index] = g
					parents[index] = n.index
					serial++
					heap.Push(h, pathNode{index, g, g + heuristic(nx, ny, gx, gy), serial})
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
func (e *Engine) referenceCoarseCorridor(sx, sy, gx, gy, r int32, ignore ID) map[int32]bool {
	m := e.state.Map
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
				if e.clear(a, r, ignore, false, false) && e.clear(b, r, ignore, false, false) {
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
