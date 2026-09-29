package sim

import (
	"bytes"
	"encoding/json"
	"testing"
)

// Restoring deliberately discards derived visibility/source caches. Compare its
// cold reconstruction against reused buffers across real route changes, team
// sight, scans and a source disappearing. Held views must remain immutable.
func TestReusedFogMatchesColdRestoreAndDoesNotMutateHeldView(t *testing.T) {
	e := fixture(t)
	a := e.spawn("US.recon", 1, Vec{X: 16000, Y: 16000}, true, 300000)
	e.spawn("IR.recon", 2, Vec{X: 47000, Y: 47000}, true, 300000)
	e.recalculate()
	e.updateFog()
	for tick := 0; tick < 96; tick++ {
		switch tick {
		case 0, 32, 64:
			target := Vec{X: 25000, Y: 17000}
			if tick == 32 {
				target = Vec{X: 19000, Y: 33000}
			}
			if err := e.Submit(1, e.player(1).LastSequence+1, []Order{{Kind: "move", Entities: []ID{a.ID}, Position: target}}); err != nil {
				t.Fatal(err)
			}
		case 20:
			e.player(2).Team = 1
		case 40:
			e.player(2).Team = 2
		case 48:
			e.state.Zones = append(e.state.Zones, Zone{Kind: "scan", Owner: 1, Position: Vec{X: 41000, Y: 41000}, Radius: 5000, Start: e.Tick(), Until: e.Tick() + 8})
		case 80:
			a.HP = 0
		}
		held, _ := e.PlayerView(1)
		heldBytes, _ := json.Marshal(held)
		e.Advance()
		currentBytes, _ := json.Marshal(held)
		if !bytes.Equal(heldBytes, currentBytes) {
			t.Fatal("held view changed", tick)
		}
		if tick%4 != 0 {
			continue
		}
		saved, err := e.Save()
		if err != nil {
			t.Fatal(err)
		}
		cold, err := Restore(e.catalog, saved)
		if err != nil {
			t.Fatal("cold reconstruction", tick, err)
		}
		if e.Hash() != cold.Hash() {
			t.Fatal("restore changed authoritative state", tick)
		}
		for _, id := range []PlayerID{1, 2} {
			warm, _ := e.PlayerView(id)
			fresh, _ := cold.PlayerView(id)
			w, _ := json.Marshal(warm)
			c, _ := json.Marshal(fresh)
			if !bytes.Equal(w, c) {
				t.Fatal("reused fog differs from cold reconstruction", tick, id)
			}
		}
	}
}
