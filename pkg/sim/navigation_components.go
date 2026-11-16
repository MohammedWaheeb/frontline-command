package sim

// navigationComponentEntry ties region labels to the exact static cell slice
// they were flooded from. Any rebuild of navigationCells (revision change,
// mission reset, tests clearing navCache) yields a new slice, so a stale
// entry can never be read against different geometry.
type navigationComponentEntry struct {
	cells  []bool
	labels []int32
}

// navigationComponents returns 4-connected region labels over the static
// navigationCells(radius) grid: 0 for blocked cells, otherwise a positive
// region ID. It is derived, unsaved engine state like navCache.
//
// 4-connectivity is exact for the route search: a diagonal step requires both
// orthogonal corner cells to be passable, so every diagonal has a 4-connected
// detour, and every dynamic, service-edge or coarse restriction only removes
// cells or edges from this static graph. A goal in another static region is
// therefore unreachable by every search variant.
func (e *Engine) navigationComponents(radius int32, cells []bool) []int32 {
	if entry, ok := e.navComponents[radius]; ok && len(entry.cells) == len(cells) && (len(cells) == 0 || &entry.cells[0] == &cells[0]) {
		return entry.labels
	}
	w, h := e.state.Map.Width*2, e.state.Map.Height*2
	labels := make([]int32, len(cells))
	queue := make([]int32, 0, 4096)
	next := int32(0)
	for i, open := range cells {
		if !open || labels[i] != 0 {
			continue
		}
		next++
		labels[i] = next
		queue = append(queue[:0], int32(i))
		for k := 0; k < len(queue); k++ {
			c := queue[k]
			x, y := c%w, c/w
			if x+1 < w && cells[c+1] && labels[c+1] == 0 {
				labels[c+1] = next
				queue = append(queue, c+1)
			}
			if x > 0 && cells[c-1] && labels[c-1] == 0 {
				labels[c-1] = next
				queue = append(queue, c-1)
			}
			if y+1 < h && cells[c+w] && labels[c+w] == 0 {
				labels[c+w] = next
				queue = append(queue, c+w)
			}
			if y > 0 && cells[c-w] && labels[c-w] == 0 {
				labels[c-w] = next
				queue = append(queue, c-w)
			}
		}
	}
	if e.navComponents == nil {
		e.navComponents = map[int32]navigationComponentEntry{}
	}
	e.navComponents[radius] = navigationComponentEntry{cells: cells, labels: labels}
	return labels
}

// navigationSeedsReachGoal reports whether any search seed can possibly reach
// end. Seeds or goals outside the static grid (label 0) are treated as
// possibly reachable so the full search still decides them.
func navigationSeedsReachGoal(labels []int32, starts []pathNode, end int32) bool {
	goal := labels[end]
	if goal == 0 {
		return true
	}
	for _, seed := range starts {
		if label := labels[seed.index]; label == 0 || label == goal {
			return true
		}
	}
	return false
}
