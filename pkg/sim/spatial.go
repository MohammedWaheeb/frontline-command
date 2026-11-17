package sim

import "iter"

const spatialCell int32 = 8000

func (e *Engine) rebuildSpatial() {
	if e.spatial == nil {
		e.spatial = make(map[int32][]*Entity)
	} else {
		for key, cell := range e.spatial {
			clear(cell)
			e.spatial[key] = cell[:0]
		}
	}
	width := (e.state.Map.Width*1000 + spatialCell - 1) / spatialCell
	for _, v := range e.state.Entities {
		if v.HP <= 0 || v.Container != 0 {
			continue
		}
		key := v.Position.Y/spatialCell*width + v.Position.X/spatialCell
		e.spatial[key] = append(e.spatial[key], v)
	}
}

// nearby visits cells in the original row-major order and entities in their
// authoritative order within each cell. Walking cells directly avoids building
// a candidate slice for every attacker's targeting pass. The consumer must not
// rebuild the spatial index during iteration.
func (e *Engine) nearby(pos Vec, radius int32) iter.Seq[*Entity] {
	return func(yield func(*Entity) bool) {
		if e.spatial == nil {
			for _, v := range e.state.Entities {
				if !yield(v) {
					return
				}
			}
			return
		}
		width := (e.state.Map.Width*1000 + spatialCell - 1) / spatialCell
		height := (e.state.Map.Height*1000 + spatialCell - 1) / spatialCell
		for y := max(int32(0), (pos.Y-radius)/spatialCell); y <= min(height-1, (pos.Y+radius)/spatialCell); y++ {
			for x := max(int32(0), (pos.X-radius)/spatialCell); x <= min(width-1, (pos.X+radius)/spatialCell); x++ {
				for _, v := range e.spatial[y*width+x] {
					if !yield(v) {
						return
					}
				}
			}
		}
	}
}
