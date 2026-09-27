package sim

const spatialCell int32 = 8000

func (e *Engine) rebuildSpatial() {
	e.spatial = map[int32][]*Entity{}
	width := (e.state.Map.Width*1000 + spatialCell - 1) / spatialCell
	for _, v := range e.state.Entities {
		if v.HP <= 0 || v.Container != 0 {
			continue
		}
		key := v.Position.Y/spatialCell*width + v.Position.X/spatialCell
		e.spatial[key] = append(e.spatial[key], v)
	}
}
func (e *Engine) nearby(pos Vec, radius int32) []*Entity {
	if e.spatial == nil {
		return e.state.Entities
	}
	width := (e.state.Map.Width*1000 + spatialCell - 1) / spatialCell
	height := (e.state.Map.Height*1000 + spatialCell - 1) / spatialCell
	out := []*Entity{}
	for y := max(int32(0), (pos.Y-radius)/spatialCell); y <= min(height-1, (pos.Y+radius)/spatialCell); y++ {
		for x := max(int32(0), (pos.X-radius)/spatialCell); x <= min(width-1, (pos.X+radius)/spatialCell); x++ {
			out = append(out, e.spatial[y*width+x]...)
		}
	}
	return out
}
