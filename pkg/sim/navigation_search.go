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
}

func (s *navigationSearch) begin(size int) *navigationSearch {
	if len(s.mark) != size {
		s.scores = make([]int32, size)
		s.parents = make([]int32, size)
		s.mark = make([]uint32, size)
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
func (h *pathHeap) initialize() {
	for i := len(*h)/2 - 1; i >= 0; i-- {
		h.downNode(i, len(*h))
	}
}
func (h *pathHeap) pushNode(value pathNode) {
	*h = append(*h, value)
	for child := len(*h) - 1; child > 0; {
		parent := (child - 1) / 2
		if !h.Less(child, parent) {
			break
		}
		h.Swap(child, parent)
		child = parent
	}
}
func (h *pathHeap) popNode() pathNode {
	end := len(*h) - 1
	h.Swap(0, end)
	h.downNode(0, end)
	value := (*h)[end]
	*h = (*h)[:end]
	return value
}
func (h *pathHeap) downNode(parent, end int) {
	for {
		child := 2*parent + 1
		if child >= end {
			return
		}
		if right := child + 1; right < end && h.Less(right, child) {
			child = right
		}
		if !h.Less(child, parent) {
			return
		}
		h.Swap(parent, child)
		parent = child
	}
}
