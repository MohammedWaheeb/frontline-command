package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Exports a synthetic, restore-validated legal maximum to the browser load
// harness. This is performance/parity geometry, never a shipping scenario.
func TestExportBrowserMaximumLoad(t *testing.T) {
	dir := os.Getenv("FRONTLINE_BROWSER_LOAD_DIR")
	if dir == "" {
		t.Skip("explicit browser fixture export only")
	}
	e, aircraft := maximumAirReturnFixture(t)
	opening, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	type request struct {
		Tick     uint32   `json:"tick"`
		Player   PlayerID `json:"player"`
		Sequence uint32   `json:"sequence"`
		Orders   []Order  `json:"orders"`
	}
	commands := []request{}
	armies := map[PlayerID][]ID{}
	for _, v := range e.state.Entities {
		if e.role(v) == "recon" {
			armies[v.Owner] = append(armies[v.Owner], v.ID)
		}
	}
	startHash := e.Hash()
	var sequence uint32
	const ticks = 600
	for tick := 0; tick < ticks; tick++ {
		if tick%80 == 0 {
			for _, p := range e.state.Players {
				ids := armies[p.ID]
				for start := 0; start < len(ids); start += 64 {
					sequence++
					orders := []Order{{Kind: "move", Entities: ids[start:min(start+64, len(ids))], Position: Vec{X: 74000 + int32(tick/80%2)*12000, Y: 74000 + int32(tick/80%2)*12000}}}
					if err = e.Submit(p.ID, sequence, orders); err != nil {
						t.Fatal(err)
					}
					commands = append(commands, request{uint32(tick), p.ID, sequence, orders})
				}
			}
		}
		e.Advance()
		for _, r := range e.state.Results {
			if !r.Accepted {
				t.Fatal("load order rejected", r)
			}
		}
	}
	landed := 0
	for _, id := range aircraft {
		if v := e.entity(id); v != nil && v.Landed {
			landed++
		}
	}
	if landed != 64 {
		t.Fatal("aircraft did not all return", landed)
	}
	result := map[string]any{"scope": "synthetic legal688 actors;64air returns;336scouts mass-routed;natural owner view;not balance or reference-hardware certification", "ticks": ticks, "actors": 688, "aircraft": 64, "landed": landed, "initial_hash": startHash, "final_hash": e.Hash(), "commands": commands}
	meta, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "opening.json"), opening, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "native.json"), append(meta, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
	t.Logf("exported688 actor fixture,64landed,64command batches,final hash%s", e.Hash())
}
