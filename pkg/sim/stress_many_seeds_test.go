package sim

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/content"
)

// TestStressManySeeds is a STRESS=1 gated many-seed bot-vs-bot sweep.
// It is not run in ordinary test runs.
func TestStressManySeeds(t *testing.T) {
	if os.Getenv("STRESS") != "1" {
		t.Skip("set STRESS=1 to run many-seed bot stress")
	}
	maps := []string{
		"copper-junction",
		"relay-heights",
		"dry-river",
		"industrial-valley",
		"border-depots",
		"port-outskirts",
		"convoy-union",
		"twin-outposts",
	}
	factions := []string{"US", "IR", "SY", "SA"}
	// All unordered distinct pairs, cycled.
	pairs := [][2]int{{0, 1}, {0, 2}, {0, 3}, {1, 2}, {1, 3}, {2, 3}}

	catalog := content.MustBase()
	limit := seconds(90 * 60)
	game := 0
	total, failed := 0, 0
	for mi, mapID := range maps {
		data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", mapID+".json"))
		if err != nil {
			t.Fatalf("read map %s: %v", mapID, err)
		}
		battlefield, err := content.DecodeMap(data)
		if err != nil {
			t.Fatalf("decode map %s: %v", mapID, err)
		}
		if battlefield.ID != mapID {
			t.Fatalf("map id mismatch: got %q want %q", battlefield.ID, mapID)
		}
		for si := 0; si < 6; si++ {
			seed := uint64(41000 + mi*1000 + si*137 + 11)
			pair := pairs[game%len(pairs)]
			// Rotate pair orientation by game index for variety.
			f1, f2 := factions[pair[0]], factions[pair[1]]
			if (game/len(pairs))%2 == 1 {
				f1, f2 = f2, f1
			}
			name := fmt.Sprintf("%s/seed%d_%s_vs_%s", mapID, seed, f1, f2)
			total++
			g, s, f1c, f2c := game, seed, f1, f2
			_ = g
			ok := t.Run(name, func(t *testing.T) {
				cfg := Config{Map: battlefield, Seed: s, Ruleset: "standard-v2"}
				cfg.Players = append(cfg.Players,
					PlayerConfig{ID: PlayerID(1), Name: f1c + " normal bot 1", Faction: f1c, Team: 1, AI: "normal"},
					PlayerConfig{ID: PlayerID(2), Name: f2c + " normal bot 2", Faction: f2c, Team: 2, AI: "normal"},
				)
				e, err := New(catalog, cfg)
				if err != nil {
					t.Fatalf("New map=%s seed=%d factions=%s/%s: %v", mapID, s, f1c, f2c, err)
				}
				var failure string
				for !e.Outcome().Finished && e.Tick() < limit {
					e.Advance() // panic propagates and fails the test
					if e.Tick()%100 != 0 {
						continue
					}
					for _, p := range e.state.Players {
						if p.Credits < 0 {
							failure = fmt.Sprintf("credits<0 tick=%d player=%d credits=%d", e.Tick(), p.ID, p.Credits)
							break
						}
						sum := p.Supply + p.ReservedSupply
						if p.Supply < 0 || p.ReservedSupply < 0 || sum < 0 || sum > 100 {
							failure = fmt.Sprintf("supply out of bounds tick=%d player=%d supply=%d reserved=%d sum=%d", e.Tick(), p.ID, p.Supply, p.ReservedSupply, sum)
							break
						}
					}
					if failure != "" {
						break
					}
				}
				out := e.Outcome()
				// Final Save/Restore hash equality (also on invariant failure, if reachable).
				restoreOK := false
				var restoreErr string
				saved, err := e.Save()
				if err != nil {
					restoreErr = "save: " + err.Error()
				} else if restored, err := Restore(catalog, saved); err != nil {
					restoreErr = "restore: " + err.Error()
				} else {
					restoreOK = restored.Hash() == e.Hash()
					if !restoreOK {
						restoreErr = fmt.Sprintf("hash mismatch orig=%s restored=%s", e.Hash(), restored.Hash())
					}
				}
				t.Logf("RESULT map=%s seed=%d factions=%s/%s ticks=%d finished=%v reason=%q winningTeam=%d draw=%v restoreOK=%v failure=%q restoreErr=%q",
					mapID, s, f1c, f2c, e.Tick(), out.Finished, out.Reason, out.WinningTeam, out.Draw, restoreOK, failure, restoreErr)
				if failure != "" {
					t.Errorf("invariant failure map=%s seed=%d factions=%s/%s tick=%d: %s", mapID, s, f1c, f2c, e.Tick(), failure)
				}
				if restoreErr != "" {
					t.Errorf("save/restore failure map=%s seed=%d factions=%s/%s tick=%d: %s", mapID, s, f1c, f2c, e.Tick(), restoreErr)
				}
			})
			if !ok {
				failed++
			}
			game++
		}
	}
	t.Logf("SUMMARY total=%d failed=%d passed=%d", total, failed, total-failed)
	if failed > 0 {
		t.Errorf("%d/%d games failed", failed, total)
	}
}
