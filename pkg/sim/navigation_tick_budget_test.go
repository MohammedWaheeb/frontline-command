package sim

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"frontlinecommand/pkg/content"
)

// Late-game route-work gate for the 2026-11-08 skirmish freeze. The synthetic
// maximum-actor gates use an all-open map, where A* never meets a sealed
// pocket, and they skip under -short. These cases are the worst games of the
// 27-game sweep (work/perf-freeze-2026-11-08/sweep-run1.log): late, 4-player,
// 160x160 battlefields with real bases. The gate counts A* expansions per
// tick, a deterministic measure that does not depend on host load, so it can
// gate on any machine. Wall time is only logged.
//
// Calibration (2026-11-09, worst of the three cases):
//
//	                 worst tick   p99 tick   total (industrial-valley)
//	with reject         227,899     76,637   44.3M
//	without reject      319,372    135,147   90.3M
//
// In-tick searches are charged to the 12-search budget, each capped at 32,768
// expansions, so a tick can never exceed lateGameStructuralExpansionLimit; the
// calibrated limits leave about 15-30% headroom and fail the pre-fix build.
const (
	lateGameStructuralExpansionLimit = 12 * 32768
	lateGameTickExpansionLimit       = 260000 // worst single tick
	lateGameP99ExpansionLimit        = 100000 // 99th percentile tick
)

type lateGameCase struct {
	battlefield string
	seed        uint64
	players     int
	ticks       int
}

var lateGameCases = []lateGameCase{
	{"industrial-valley", 1, 4, 21000},
	{"border-depots", 2, 4, 22000},
	{"port-outskirts", 3, 4, 23000},
}

func lateGameEngine(t testing.TB, c lateGameCase) *Engine {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", c.battlefield+".json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	factions := []string{"US", "IR", "SA", "SY"}
	difficulties := []string{"normal", "hard", "easy"}
	var players []PlayerConfig
	for i := 0; i < c.players; i++ {
		players = append(players, PlayerConfig{ID: PlayerID(i + 1), Name: fmt.Sprint("p", i+1), Faction: factions[(int(c.seed)+i)%4], Team: uint32(i + 1), AI: difficulties[(int(c.seed)+i)%3]})
	}
	e, err := New(content.MustBase(), Config{Map: battlefield, Seed: c.seed, Players: players, Ruleset: battlefield.Ruleset})
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestLateGameRouteWorkStaysBounded(t *testing.T) {
	if testing.Short() {
		t.Skip("late-game route-work gate runs in the extended lane")
	}
	disableReject := os.Getenv("FRONTLINE_ROUTE_GATE_NO_REJECT") == "1" // calibration only
	for _, c := range lateGameCases {
		c := c
		t.Run(fmt.Sprintf("%s-s%d-n%d", c.battlefield, c.seed, c.players), func(t *testing.T) {
			t.Parallel()
			e := lateGameEngine(t, c)
			e.navNoRegionReject = disableReject
			work := make([]uint64, 0, c.ticks)
			worstTick, worstSeen := Tick(0), uint64(0)
			for i := 0; i < c.ticks && !e.Outcome().Finished; i++ {
				before := e.navExpansions
				e.Advance()
				spent := e.navExpansions - before
				if spent > worstSeen {
					worstTick, worstSeen = e.Tick(), spent
				}
				work = append(work, spent)
			}
			sorted := slices.Clone(work)
			slices.Sort(sorted)
			var total uint64
			for _, v := range work {
				total += v
			}
			worst, p99 := sorted[len(sorted)-1], sorted[len(sorted)*99/100]
			t.Logf("%d ticks: A* expansions total=%d mean=%.0f p99=%d worst=%d at tick %d (reject disabled=%v)", len(work), total, float64(total)/float64(len(work)), p99, worst, worstTick, disableReject)
			if disableReject {
				return
			}
			if worst > lateGameStructuralExpansionLimit {
				t.Fatalf("tick %d expanded %d A* nodes, above the structural per-tick ceiling %d: some in-tick search escaped the path budget", worstTick, worst, lateGameStructuralExpansionLimit)
			}
			if worst > lateGameTickExpansionLimit {
				t.Errorf("worst tick expanded %d A* nodes (limit %d) at tick %d: route work can freeze the browser worker again", worst, lateGameTickExpansionLimit, worstTick)
			}
			if p99 > lateGameP99ExpansionLimit {
				t.Errorf("p99 tick expanded %d A* nodes (limit %d)", p99, lateGameP99ExpansionLimit)
			}
			// The final late-game state must round-trip: a save that Restore
			// rejects is how F1-class bound mismatches reach players.
			save, err := e.Save()
			if err != nil {
				t.Fatalf("final state at tick %d does not save: %v", e.Tick(), err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatalf("final state at tick %d does not restore: %v", e.Tick(), err)
			}
			if restored.Hash() != e.Hash() {
				t.Errorf("final state hash after restore %s != live %s at tick %d", restored.Hash(), e.Hash(), e.Tick())
			}
		})
	}
}
