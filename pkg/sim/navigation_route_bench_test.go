package sim

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"frontlinecommand/pkg/content"
)

// A late-game 4-player Industrial Valley state with real bases, rubble and
// armies. Unlike the synthetic all-open maximum-actor fixture, it contains
// building-sealed pockets and long detours, which is where route cost lives.
var lateGameNavigation = struct {
	once   sync.Once
	engine *Engine
	err    error
}{}

func lateGameNavigationEngine(b *testing.B) *Engine {
	b.Helper()
	lateGameNavigation.once.Do(func() {
		data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "industrial-valley.json"))
		if err != nil {
			lateGameNavigation.err = err
			return
		}
		battlefield, err := content.DecodeMap(data)
		if err != nil {
			lateGameNavigation.err = err
			return
		}
		players := []PlayerConfig{
			{ID: 1, Name: "p1", Faction: "SY", Team: 1, AI: "normal"},
			{ID: 2, Name: "p2", Faction: "US", Team: 2, AI: "hard"},
			{ID: 3, Name: "p3", Faction: "IR", Team: 3, AI: "easy"},
			{ID: 4, Name: "p4", Faction: "SA", Team: 4, AI: "normal"},
		}
		e, err := New(content.MustBase(), Config{Map: battlefield, Seed: 3, Players: players, Ruleset: battlefield.Ruleset})
		if err != nil {
			lateGameNavigation.err = err
			return
		}
		for i := 0; i < 9000 && !e.Outcome().Finished; i++ {
			e.Advance()
		}
		lateGameNavigation.engine = e
	})
	if lateGameNavigation.err != nil {
		b.Fatal(lateGameNavigation.err)
	}
	return lateGameNavigation.engine
}

// BenchmarkNavigationRoutes routes every live ground unit to every spawn,
// statically and with dynamic obstacles, through the unbudgeted search.
func BenchmarkNavigationRoutes(b *testing.B) {
	e := lateGameNavigationEngine(b)
	var movers []*Entity
	for _, v := range e.state.Entities {
		if v.ID != 0 && !v.Building && v.HP > 0 && v.Container == 0 && !e.isAircraft(v) {
			movers = append(movers, v)
		}
	}
	// Goals are other units' live positions: reachable, spread across bases,
	// so the benchmark measures real long searches rather than rejections.
	var goals []Vec
	for k := 0; k < 8 && len(movers) > 0; k++ {
		goals = append(goals, movers[k*len(movers)/8].Position)
	}
	if len(movers) == 0 || len(goals) == 0 {
		b.Skip("late-game fixture has no ground movers")
	}
	b.ReportAllocs()
	b.ResetTimer()
	before := processCPUTime()
	found := 0
	for i := 0; i < b.N; i++ {
		for _, v := range movers {
			for _, goal := range goals {
				if len(e.findNavigationRoute(v, goal, false)) > 0 {
					found++
				}
				if len(e.findNavigationRoute(v, goal, true)) > 0 {
					found++
				}
			}
		}
	}
	// Process CPU time is far less sensitive than wall time to other load on
	// a shared host; compare cpu-ns/op between variants.
	if elapsed := processCPUTime() - before; elapsed > 0 {
		b.ReportMetric(float64(elapsed)/float64(b.N), "cpu-ns/op")
	}
	b.ReportMetric(float64(len(movers)*len(goals)*2), "routes/op")
	b.ReportMetric(float64(found)/float64(b.N), "found/op")
}
