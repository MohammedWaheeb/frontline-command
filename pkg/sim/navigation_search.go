package sim

// Navigation scratch is derived, bounded by the current map grid, and owned by
// one engine. Searches never share this mutable storage between engines. Paths
// returned to entities have their own backing arrays and survive the next search.
// Even marks are discovered nodes; the adjacent odd mark means closed. Scores
// and parent links are read only when their mark belongs to the current search.
type navigationSearch struct {
	scores, parents []int32
	mark            []uint32
	generation      uint32
	heap            pathHeap
	// position is the heap slot of each open node; valid only while the
	// node's mark equals the current generation (discovered, not closed).
	position []int32
}

func (s *navigationSearch) begin(size int) *navigationSearch {
	if len(s.mark) != size {
		s.scores = make([]int32, size)
		s.parents = make([]int32, size)
		s.mark = make([]uint32, size)
		s.position = make([]int32, size)
		s.generation = 0
	}
	s.generation += 2
	if s.generation == 0 {
		clear(s.mark)
		s.generation = 2
	}
	s.heap = s.heap[:0]
	return s
}

// Typed heap operations preserve the existing Less ordering while avoiding a
// boxed interface allocation for every A* expansion and neighbor insertion.
// Sifts move a hole instead of swapping at every level. Less is a strict total
// order (serial is unique per search), so the pop sequence is fully
// determined by the ordering and independent of heap layout.
func pathLess(a, b pathNode) bool {
	if a.f != b.f {
		return a.f < b.f
	}
	if a.g != b.g {
		return a.g > b.g
	}
	if a.index != b.index {
		return a.index < b.index
	}
	return a.serial < b.serial
}
func (h *pathHeap) initialize() {
	for i := len(*h)/2 - 1; i >= 0; i-- {
		h.downNode(i, len(*h))
	}
}
func (h *pathHeap) pushNode(value pathNode) {
	s := append(*h, value)
	child := len(s) - 1
	for child > 0 {
		parent := (child - 1) / 2
		if !pathLess(value, s[parent]) {
			break
		}
		s[child] = s[parent]
		child = parent
	}
	s[child] = value
	*h = s
}
func (h *pathHeap) popNode() pathNode {
	s := *h
	end := len(s) - 1
	root := s[0]
	s[0] = s[end]
	*h = s[:end]
	if end > 0 {
		h.downNode(0, end)
	}
	return root
}
func (h *pathHeap) downNode(parent, end int) {
	s := *h
	value := s[parent]
	for {
		child := 2*parent + 1
		if child >= end {
			break
		}
		if right := child + 1; right < end && pathLess(s[right], s[child]) {
			child = right
		}
		if !pathLess(s[child], value) {
			break
		}
		s[parent] = s[child]
		parent = child
	}
	s[parent] = value
}

// Indexed open set with decrease-key. The original search pushed a duplicate
// node whenever it found a cheaper route to an open cell and skipped the stale
// copies on pop. Keeping one entry per cell that always holds the pathLess
// minimum of every push for that cell pops exactly the same non-stale sequence
// (stale copies had no effect), while halving heap traffic. scores and parents
// are still written on every push by the caller, exactly as before.
func (s *navigationSearch) openPush(node pathNode) {
	s.heap = append(s.heap, node)
	s.siftUp(len(s.heap) - 1)
}

// openImprove offers node for a cell that is already open: it replaces the
// cell's entry only if it would pop first, matching the lazy duplicate.
func (s *navigationSearch) openImprove(node pathNode) {
	slot := int(s.position[node.index])
	if pathLess(node, s.heap[slot]) {
		s.heap[slot] = node
		s.siftUp(slot)
	}
}

func (s *navigationSearch) openPop() pathNode {
	h := s.heap
	end := len(h) - 1
	root := h[0]
	last := h[end]
	s.heap = h[:end]
	if end > 0 {
		s.siftDown(0, last)
	}
	return root
}

func (s *navigationSearch) siftUp(slot int) {
	h := s.heap
	node := h[slot]
	for slot > 0 {
		parent := (slot - 1) / 2
		if !pathLess(node, h[parent]) {
			break
		}
		h[slot] = h[parent]
		s.position[h[slot].index] = int32(slot)
		slot = parent
	}
	h[slot] = node
	s.position[node.index] = int32(slot)
}

func (s *navigationSearch) siftDown(slot int, node pathNode) {
	h := s.heap
	end := len(h)
	for {
		child := 2*slot + 1
		if child >= end {
			break
		}
		if right := child + 1; right < end && pathLess(h[right], h[child]) {
			child = right
		}
		if !pathLess(h[child], node) {
			break
		}
		h[slot] = h[child]
		s.position[h[slot].index] = int32(slot)
		slot = child
	}
	h[slot] = node
	s.position[node.index] = int32(slot)
}
