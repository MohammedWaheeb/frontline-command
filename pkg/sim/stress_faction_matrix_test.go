package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

// TestStressFactionMatrix: STRESS=1 gated bot-vs-bot faction/difficulty matrix.
// Map: copper-junction, 2 players, ordered faction pairs.
// Pass A: 16 pairs at hard/hard, Pass B: 16 pairs at easy/easy,
// Pass C: 8 asymmetric hard/easy games (4 hard-as-P1, 4 hard-as-P2).
func TestStressFactionMatrix(t *testing.T) {
	if os.Getenv("STRESS") != "1" {
		t.Skip("STRESS=1")
	}
	factions := []string{"US", "IR", "SY", "SA"}
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "copper-junction.json"))
	if err != nil {
		t.Fatal(err)
	}
	mp, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	catalog := content.MustBase()

	type gameSpec struct {
		Label string
		F     [2]string
		D     [2]string
		Seed  uint64
		Group string // "same" or "asym"
	}
	var specs []gameSpec
	idx := 0
	mk := func(group string, f, d [2]string) {
		seed := uint64(77000 + idx*101)
		specs = append(specs, gameSpec{
			Label: fmt.Sprintf("%02d_%s-%s_%s-%s_s%d", idx, f[0], d[0], f[1], d[1], seed),
			F:     f, D: d, Seed: seed, Group: group,
		})
		idx++
	}
	for _, diff := range []string{"hard", "easy"} {
		for _, f1 := range factions {
			for _, f2 := range factions {
				mk("same", [2]string{f1, f2}, [2]string{diff, diff})
			}
		}
	}
	// Asymmetric: rotating pairs, both orientations (hard as P2 tested).
	asymPairs := [][2]string{{"US", "IR"}, {"IR", "SY"}, {"SY", "SA"}, {"SA", "US"}}
	for _, pr := range asymPairs {
		mk("asym", pr, [2]string{"hard", "easy"})
	}
	for _, pr := range asymPairs {
		mk("asym", pr, [2]string{"easy", "hard"})
	}

	type result struct {
		Spec        gameSpec
		Finished    bool
		Draw        bool
		Reason      string
		WinnerIdx   int // 0/1, -1 if none
		WinnerFac   string
		Ticks       Tick
		Minutes     float64
		Credits     [2]int64
		Income      [2]int64
		Spent       [2]int64
		Wall        time.Duration
	}
	var results []result
	rejected := map[string]uint64{}
	var rejectedTotal uint64

	for _, spec := range specs {
		cfg := Config{Map: mp, Seed: spec.Seed, Ruleset: "standard-v2"}
		for i := 0; i < 2; i++ {
			cfg.Players = append(cfg.Players, PlayerConfig{
				ID: PlayerID(i + 1), Name: fmt.Sprintf("bot%d", i),
				Faction: spec.F[i], Team: uint32(i + 1), AI: spec.D[i],
			})
		}
		start := time.Now()
		e, err := New(catalog, cfg)
		if err != nil {
			t.Fatalf("New %s: %v", spec.Label, err)
		}
		for e.Tick() < seconds(90*60) && !e.Outcome().Finished {
			e.Advance()
			for _, r := range e.state.Results {
				if !r.Accepted {
					code := r.Code
					if code == "" {
						code = "(empty)"
					}
					rejected[code]++
					rejectedTotal++
				}
			}
		}
		out := e.Outcome()
		res := result{Spec: spec, Finished: out.Finished, Draw: out.Draw, Reason: out.Reason,
			Ticks: e.Tick(), Minutes: float64(e.Tick()) / 1200.0, WinnerIdx: -1, Wall: time.Since(start)}
		for i, p := range e.state.Players {
			if i < 2 {
				res.Credits[i], res.Income[i], res.Spent[i] = p.Credits, p.Income, p.Spent
			}
		}
		if out.Finished && !out.Draw && out.WinningTeam >= 1 && out.WinningTeam <= 2 {
			res.WinnerIdx = int(out.WinningTeam) - 1
			res.WinnerFac = spec.F[res.WinnerIdx]
		}
		results = append(results, res)
		t.Logf("GAME %s finished=%v draw=%v winnerIdx=%d winnerFac=%q ticks=%d min=%.1f wall=%s credits=%v income=%v spent=%v reason=%q",
			spec.Label, res.Finished, res.Draw, res.WinnerIdx, res.WinnerFac, res.Ticks, res.Minutes,
			res.Wall.Round(time.Millisecond), res.Credits, res.Income, res.Spent, res.Reason)
	}

	// Aggregates
	facWins := map[string]int{}
	facGames := map[string]int{} // player slots
	sameFinished, sameP1Wins := 0, 0
	asymFinished, asymHardWins, asymHardP2Wins, asymHardP2Games := 0, 0, 0, 0
	var flags []string
	for _, r := range results {
		if !r.Finished {
			flags = append(flags, fmt.Sprintf("NOT_FINISHED %s ticks=%d", r.Spec.Label, r.Ticks))
		}
		for _, f := range r.Spec.F {
			facGames[f]++
		}
		if r.WinnerFac != "" {
			facWins[r.WinnerFac]++
		}
		if r.Spec.Group == "same" && r.Finished && !r.Draw && r.WinnerIdx >= 0 {
			sameFinished++
			if r.WinnerIdx == 0 {
				sameP1Wins++
			}
		}
		if r.Spec.Group == "asym" && r.Finished && !r.Draw && r.WinnerIdx >= 0 {
			asymFinished++
			if r.Spec.D[r.WinnerIdx] == "hard" {
				asymHardWins++
			}
			if r.Spec.D[1] == "hard" {
				asymHardP2Games++
				if r.WinnerIdx == 1 {
					asymHardP2Wins++
				}
			}
		}
	}
	for _, f := range factions {
		if facGames[f] > 0 {
			rate := float64(facWins[f]) / float64(facGames[f])
			t.Logf("FACTION %s wins=%d slots=%d winRateSlots=%.3f", f, facWins[f], facGames[f], rate)
			if rate > 0.75 {
				flags = append(flags, fmt.Sprintf("FACTION_DOMINANCE %s %.1f%% (%d/%d slots)", f, rate*100, facWins[f], facGames[f]))
			}
		}
	}
	if sameFinished > 0 {
		rate := float64(sameP1Wins) / float64(sameFinished)
		t.Logf("SPAWN same-diff finished=%d p1Wins=%d p1Rate=%.3f", sameFinished, sameP1Wins, rate)
		if rate > 0.70 {
			flags = append(flags, fmt.Sprintf("SPAWN_BIAS P1 %.1f%% (%d/%d same-diff)", rate*100, sameP1Wins, sameFinished))
		}
	}
	t.Logf("ASYM finished=%d hardWins=%d hardP2=%d/%d", asymFinished, asymHardWins, asymHardP2Wins, asymHardP2Games)

	// Full table
	t.Logf("=== RESULTS TABLE (credits/income/spent are milliMoney raw) ===")
	t.Logf("%-28s %-6s %-4s | %-28s %-6s %-4s | %-5s %-7s %6s | P1 cr/inc/spent | P2 cr/inc/spent", "P1", "fac", "diff", "P2", "fac", "diff", "win", "winFac", "min")
	for _, r := range results {
		win := "-"
		if r.WinnerIdx >= 0 {
			win = fmt.Sprintf("P%d", r.WinnerIdx+1)
		} else if r.Draw {
			win = "draw"
		} else if !r.Finished {
			win = "DNF"
		}
		t.Logf("%s seed=%d %s/%s vs %s/%s win=%s fac=%s ticks=%d min=%.1f P1[c=%d i=%d s=%d] P2[c=%d i=%d s=%d] reason=%q",
			r.Spec.Label, r.Spec.Seed, r.Spec.F[0], r.Spec.D[0], r.Spec.F[1], r.Spec.D[1],
			win, r.WinnerFac, r.Ticks, r.Minutes,
			r.Credits[0], r.Income[0], r.Spent[0], r.Credits[1], r.Income[1], r.Spent[1], r.Reason)
	}
	// Rejected codes sorted
	type kv struct {
		k string
		v uint64
	}
	var kvs []kv
	for k, v := range rejected {
		kvs = append(kvs, kv{k, v})
	}
	sort.Slice(kvs, func(i, j int) bool { if kvs[i].v != kvs[j].v { return kvs[i].v > kvs[j].v }; return kvs[i].k < kvs[j].k })
	t.Logf("=== REJECTED total=%d distinct=%d ===", rejectedTotal, len(kvs))
	for _, p := range kvs {
		t.Logf("REJECTED %q %d", p.k, p.v)
	}
	t.Logf("=== FLAGS (%d) ===", len(flags))
	for _, f := range flags {
		t.Logf("FLAG %s", f)
	}
	t.Logf("SUMMARY games=%d finished=%d", len(results), func() int { n := 0; for _, r := range results { if r.Finished { n++ } }; return n }())
	if len(flags) > 0 {
		t.Errorf("flags: %v", flags)
	}
}
