package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Stress: many bot-vs-bot games fast-forwarded. Checks per-game:
// termination, invariants, determinism spot-check, save/restore hash.
func TestStressBots(t *testing.T) {
	if os.Getenv("STRESS") != "1" {
		t.Skip("STRESS=1")
	}
	maps := []string{"copper-junction", "relay-heights", "dry-river", "industrial-valley", "border-depots", "port-outskirts", "convoy-union", "twin-outposts"}
	factions := []string{"US", "IR", "SY", "SA"}
	catalog := content.MustBase()
	type res struct {
		id string
		ticks Tick
		outcome string
		dur time.Duration
		issues []string
		maxTickMs float64
		entities int
	}
	var results []res
	game := 0
	for mi, mname := range maps {
		data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", mname+".json"))
		if err != nil { t.Fatal(err) }
		mp, err := content.DecodeMap(data)
		if err != nil { t.Fatal(err) }
		nspawns := len(mp.Spawns)
		for seedOff := uint64(0); seedOff < 3; seedOff++ {
			for _, nplayers := range []int{2, 4} {
				if nplayers > nspawns { continue }
				game++
				id := fmt.Sprintf("%s/s%d/p%d", mname, seedOff, nplayers)
				cfg := Config{Map: mp, Seed: uint64(90000 + mi*1000 + int(seedOff)*37 + nplayers), Ruleset: "standard-v2"}
				for i := 0; i < nplayers; i++ {
					team := uint32(i + 1)
					// last config: 2v2 teams
					if seedOff == 2 && nplayers == 4 { team = uint32(i%2 + 1) }
					cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(i + 1), Name: fmt.Sprintf("bot%d", i), Faction: factions[(i+int(seedOff))%4], Team: team, AI: "normal"})
				}
				start := time.Now()
				e, err := New(catalog, cfg)
				if err != nil { results = append(results, res{id: id, issues: []string{"New: " + err.Error()}}); continue }
				var issues []string
				var maxTick time.Duration
				lastCombatTick := Tick(0)
				lastAlive := -1
				stallWarned := false
				// per-tick loop, cap 90 min game time
				for e.Tick() < seconds(90*60) && !e.Outcome().Finished {
					ts := time.Now()
					func() {
						defer func() { if r := recover(); r != nil { issues = append(issues, fmt.Sprintf("PANIC tick %d: %v", e.Tick(), r)) } }()
						e.Advance()
					}()
					if len(issues) > 0 { break }
					if d := time.Since(ts); d > maxTick { maxTick = d }
					for _, ev := range e.state.Events {
						if ev.Kind == "weapon_fired" { lastCombatTick = e.Tick() }
					}
					// invariants every 100 ticks
					if e.Tick()%100 == 0 {
						for _, p := range e.state.Players {
							if p.Credits < 0 { issues = append(issues, fmt.Sprintf("tick%d p%d credits<0 %d", e.Tick(), p.ID, p.Credits)) }
							if p.Supply < 0 || p.ReservedSupply < 0 { issues = append(issues, fmt.Sprintf("tick%d p%d supply<0", e.Tick(), p.ID)) }
							if p.Supply+p.ReservedSupply > 100 { issues = append(issues, fmt.Sprintf("tick%d p%d supply>100 %d+%d", e.Tick(), p.ID, p.Supply, p.ReservedSupply)) }
						}
						alive := 0
						for _, en := range e.state.Entities { if en.HP > 0 { alive++ } }
						// entity explosion guard
						if alive > 2000 { issues = append(issues, fmt.Sprintf("tick%d entities explode %d", e.Tick(), alive)) }
						if alive == lastAlive && e.Tick() > seconds(600) && !stallWarned {
							// not necessarily bug; note only if also no combat
						}
						lastAlive = alive
						_ = stallWarned
						// save/restore spot check once at ~5min
						if e.Tick() == seconds(300) {
							sv, err := e.Save(); if err != nil { issues = append(issues, "save: "+err.Error()) } else {
								re, err := Restore(catalog, sv); if err != nil { issues = append(issues, "restore: "+err.Error()) } else if re.Hash() != e.Hash() { issues = append(issues, fmt.Sprintf("restore hash mismatch tick%d %s vs %s", e.Tick(), re.Hash(), e.Hash())) }
							}
						}
					}
				}
				out := e.Outcome()
				r := res{id: id, ticks: e.Tick(), dur: time.Since(start), maxTickMs: float64(maxTick.Microseconds()) / 1000.0, entities: lastAlive}
				r.issues = issues
				if !out.Finished { r.issues = append(r.issues, fmt.Sprintf("NO_FINISH by 90min tick=%d lastCombat=%d alive=%d", e.Tick(), lastCombatTick, lastAlive)) } else { r.outcome = fmt.Sprintf("winner=%v reason=%s", out.WinningTeam, out.Reason) }
				// final restore
				if sv, err := e.Save(); err == nil {
					if re, err := Restore(catalog, sv); err != nil || re.Hash() != e.Hash() { r.issues = append(r.issues, "final restore mismatch") }
				} else { r.issues = append(r.issues, "final save: "+err.Error()) }
				results = append(results, r)
				t.Logf("%s ticks=%d (%.1fmin) wall=%s maxtick=%.1fms alive=%d %s issues=%v", id, r.ticks, float64(r.ticks)/1200.0, r.dur.Round(time.Millisecond), r.maxTickMs, r.entities, r.outcome, r.issues)
			}
		}
	}
	bad := 0
	for _, r := range results { if len(r.issues) > 0 { bad++; t.Errorf("BAD %s: %v", r.id, r.issues) } }
	t.Logf("games=%d bad=%d", len(results), bad)
}
