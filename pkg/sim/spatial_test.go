package sim

import (
	"slices"
	"testing"
)

// Keep the old materialized query as an independent ordering oracle: changing
// candidate order can change combat decisions even when membership is identical.
func referenceNearby(e *Engine, pos Vec, radius int32) []*Entity {
	cells := make(map[int32][]*Entity)
	w := (e.state.Map.Width*1000 + spatialCell - 1) / spatialCell
	h := (e.state.Map.Height*1000 + spatialCell - 1) / spatialCell
	for _, v := range e.state.Entities {
		if v.HP > 0 && v.Container == 0 {
			key := v.Position.Y/spatialCell*w + v.Position.X/spatialCell
			cells[key] = append(cells[key], v)
		}
	}
	var out []*Entity
	for y := max(int32(0), (pos.Y-radius)/spatialCell); y <= min(h-1, (pos.Y+radius)/spatialCell); y++ {
		for x := max(int32(0), (pos.X-radius)/spatialCell); x <= min(w-1, (pos.X+radius)/spatialCell); x++ {
			out = append(out, cells[y*w+x]...)
		}
	}
	return out
}

func TestSpatialQueryOrderAcrossRebuilds(t *testing.T) {
	e := &Engine{}
	e.state.Map.Width, e.state.Map.Height = 37, 29
	for i := 0; i < 96; i++ {
		e.state.Entities = append(e.state.Entities, &Entity{ID: ID(i + 1), HP: 100,
			Position: Vec{X: int32(i*3109) % 37000, Y: int32(i*1217) % 29000}})
	}
	for round := 0; round < 5; round++ {
		e.rebuildSpatial()
		for _, pos := range []Vec{{}, {X: 8000, Y: 8000}, {X: 36999, Y: 28999}, {X: 16000, Y: 15000}} {
			for _, radius := range []int32{0, 1, 7999, 8000, 17000, 80000} {
				got := slices.Collect(e.nearby(pos, radius))
				if want := referenceNearby(e, pos, radius); !slices.Equal(got, want) {
					t.Fatalf("round=%d pos=%v radius=%d: candidate order/membership differs", round, pos, radius)
				}
			}
		}
		for i, v := range e.state.Entities {
			v.Position = Vec{X: (v.Position.X + 17001) % 37000, Y: (v.Position.Y + 8999) % 29000}
			v.HP = 100
			v.Container = 0
			if (i+round)%5 == 0 {
				v.HP = 0
			}
			if (i+round)%7 == 0 {
				v.Container = 99
			}
		}
	}
	// Empty old cells must not retain killed/removed entities after reuse.
	e.state.Entities = nil
	e.rebuildSpatial()
	if got := slices.Collect(e.nearby(Vec{}, 80000)); len(got) != 0 {
		t.Fatalf("stale candidates after empty rebuild: %d", len(got))
	}
}

func TestSpatialQueryFallbackAndEarlyStop(t *testing.T) {
	e := &Engine{}
	e.state.Map.Width, e.state.Map.Height = 16, 16
	e.state.Entities = []*Entity{{ID: 1, HP: 100}, {ID: 2, HP: 100}}
	if got := slices.Collect(e.nearby(Vec{}, 0)); !slices.Equal(got, e.state.Entities) {
		t.Fatal("query without index must retain the original full-state fallback")
	}
	for _, indexed := range []bool{false, true} {
		if indexed {
			e.rebuildSpatial()
		}
		seen := 0
		for range e.nearby(Vec{}, 16000) {
			seen++
			break
		}
		if seen != 1 {
			t.Fatalf("indexed=%v: early stop yielded %d candidates", indexed, seen)
		}
	}
}

func TestSpatialQueryDoesNotAllocate(t *testing.T) {
	e := &Engine{}
	e.state.Map.Width, e.state.Map.Height = 16, 16
	e.state.Entities = []*Entity{{ID: 1, HP: 100}, {ID: 2, HP: 100, Position: Vec{X: 8000, Y: 8000}}}
	e.rebuildSpatial()
	var count int
	if allocs := testing.AllocsPerRun(100, func() {
		for range e.nearby(Vec{}, 16000) {
			count++
		}
	}); allocs != 0 {
		t.Fatalf("spatial query allocated %.1f objects", allocs)
	}
	if count == 0 {
		t.Fatal("allocation check did not visit candidates")
	}
}
