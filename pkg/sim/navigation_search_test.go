package sim

import (
	"container/heap"
	"reflect"
	"testing"
)

func TestNavigationWorkspaceMatchesOriginalPaths(t *testing.T) {
	for _, kind := range []string{"US.rifle", "US.tank", "US.hauler"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			unit := e.spawn(kind, 1, Vec{X: 18350, Y: 19250}, true, 0)
			for y := int32(5); y < 58; y++ {
				if y < 27 || y > 32 {
					e.state.Map.Tiles[y*64+30].Terrain = "blocked"
				}
			}
			for y := int32(20); y < 37; y++ {
				for x := int32(19); x < 29; x++ {
					e.state.Map.Tiles[y*64+x].Terrain = "cover"
				}
			}
			e.state.NavigationRevision++
			e.spawn("US.tank", 1, Vec{X: 24500, Y: 22500}, true, 0)
			e.spawn("US.hauler", 1, Vec{X: 22500, Y: 25000}, true, 0)
			for _, dynamic := range []bool{false, true} {
				for _, goal := range []Vec{{X: 46000, Y: 42000}, {X: 25000, Y: 22500}, {X: 63500, Y: 63500}, {X: 19000, Y: 19000}, {X: 100, Y: 100}} {
					before := e.Hash()
					e.pathBudget = 20
					got := e.findPath(unit, goal, dynamic)
					e.pathBudget = 20
					want := e.referenceFindPath(unit, goal, dynamic)
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("path differs dynamic=%v goal=%+v\ngot %v\nwant%v", dynamic, goal, got, want)
					}
					if e.Hash() != before {
						t.Fatal("derived search changed authoritative state")
					}
					previous := append([]Vec(nil), got...)
					e.pathBudget = 20
					e.findPath(unit, Vec{X: 51000, Y: 51000}, dynamic)
					if len(got) > 0 && !reflect.DeepEqual(got, previous) {
						t.Fatal("returned path aliases reusable scratch")
					}
				}
			}
			// Revisions invalidate static cells, while stale scratch scores are ignored.
			for y := int32(0); y < 64; y++ {
				e.state.Map.Tiles[y*64+30].Terrain = "blocked"
			}
			e.state.NavigationRevision++
			e.pathBudget = 20
			got := e.findPath(unit, Vec{X: 46000, Y: 42000}, true)
			e.pathBudget = 20
			want := e.referenceFindPath(unit, Vec{X: 46000, Y: 42000}, true)
			if len(got) != 0 || !reflect.DeepEqual(got, want) {
				t.Fatal("blocked corridor retained a prior path")
			}
			e.state.Map.Tiles[30*64+30].Terrain = "open"
			e.state.Map.Tiles[31*64+30].Terrain = "open"
			e.state.Map.Tiles[32*64+30].Terrain = "open"
			e.state.NavigationRevision++
			e.navigationSearch.generation = ^uint32(0) - 1
			e.pathBudget = 20
			got = e.findPath(unit, Vec{X: 46000, Y: 42000}, false)
			e.pathBudget = 20
			want = e.referenceFindPath(unit, Vec{X: 46000, Y: 42000}, false)
			if !reflect.DeepEqual(got, want) {
				t.Fatal("generation wrap reused stale search marks")
			}
		})
	}
}

func TestNavigationWorkspaceKeepsSubgridBridgeAndRestorePaths(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.hauler", 1, Vec{X: 33312, Y: 30810}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 31800, Y: 31500}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 32152, Y: 29652}, true, 0)
	goal := Vec{X: 25400, Y: 27400}
	e.pathBudget = 20
	got := e.findPath(v, goal, true)
	e.pathBudget = 20
	want := e.referenceFindPath(v, goal, true)
	if len(got) == 0 || !reflect.DeepEqual(got, want) {
		t.Fatal("subgrid bridge path changed", got, want)
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	restored.pathBudget = 20
	if path := restored.findPath(restored.entity(v.ID), goal, true); !reflect.DeepEqual(got, path) {
		t.Fatal("cold restored workspace differs", path, got)
	}
}

func TestCoarsePortalCacheMatchesOriginalClearance(t *testing.T) {
	e := fixture(t)
	for y := int32(12); y < 50; y++ {
		e.state.Map.Tiles[y*64+24].Terrain = "blocked"
	}
	e.state.NavigationRevision++
	for _, ignored := range []ID{0, e.state.Entities[0].ID, e.state.Entities[1].ID} {
		for _, radius := range []int32{350, 600, 800} {
			for _, goal := range []Vec{{X: 42, Y: 37}, {X: 7, Y: 7}, {X: 60, Y: 60}} {
				got := e.coarseCorridor(8, 9, goal.X, goal.Y, radius, ignored)
				want := e.referenceCoarseCorridor(8, 9, goal.X, goal.Y, radius, ignored)
				if !reflect.DeepEqual(got, want) {
					t.Fatal("coarse portals changed", ignored, radius, goal, got, want)
				}
			}
		}
	}
}

func TestTypedNavigationHeapPreservesExistingOrder(t *testing.T) {
	values := pathHeap{}
	for index := uint32(0); index < 4096; index++ {
		values = append(values, pathNode{index: int32((index * 17) % 311), g: int32(index % 37), f: int32(index % 73), serial: index})
	}
	typed := append(pathHeap(nil), values[:1024]...)
	standard := append(pathHeap(nil), typed...)
	typed.initialize()
	heap.Init(&standard)
	for _, node := range values[1024:] {
		typed.pushNode(node)
		heap.Push(&standard, node)
	}
	for standard.Len() > 0 {
		if got, want := typed.popNode(), heap.Pop(&standard).(pathNode); got != want {
			t.Fatal("heap ordering changed", got, want)
		}
	}
	if len(typed) != 0 {
		t.Fatal("heap retained nodes")
	}
}

func TestNavigationWorkspaceReducesRepeatedSearchAllocations(t *testing.T) {
	e := fixture(t)
	unit := e.spawn("US.rifle", 1, Vec{X: 18000, Y: 18000}, true, 0)
	goal := Vec{X: 49000, Y: 39000}
	current := testing.AllocsPerRun(20, func() {
		e.pathBudget = 20
		if len(e.findPath(unit, goal, false)) == 0 {
			t.Fatal("empty optimized path")
		}
	})
	original := testing.AllocsPerRun(20, func() {
		e.pathBudget = 20
		if len(e.referenceFindPath(unit, goal, false)) == 0 {
			t.Fatal("empty reference path")
		}
	})
	t.Logf("repeated exact-equivalent paths: workspace %.0f allocations; original %.0f", current, original)
	if current >= original/2 {
		t.Fatal("search again allocates per node or per grid")
	}
}
