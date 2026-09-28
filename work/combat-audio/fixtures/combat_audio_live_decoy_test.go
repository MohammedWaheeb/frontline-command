package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Separate from the original 14 microfixtures: a real initialized aircraft and
// legal AA order must survive complete ordinary engine ticks through the decoy.
func TestCombatAudioLiveDecoy(t *testing.T) {
	e := fixture(t)
	shooter := e.spawn("US.aa", 1, Vec{16000, 16000}, true, 900000)
	home := e.spawn("IR.drone_hub", 2, Vec{40000, 40000}, true, 1000000)
	target := e.spawn("IR.fighter", 2, Vec{20500, 16000}, true, 1000000)
	shooter.Stance, target.Stance = "hold", "hold"
	target.Landed = false
	target.Home = home.ID
	target.Buffs = append(target.Buffs, Buff{Kind: "decoy", Until: 200, Source: target.ID})
	e.recalculate()
	e.updateFog()
	if err := e.Submit(1, 1, []Order{{Kind: "attack", Entities: []ID{shooter.ID}, Target: target.ID}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 || !e.state.Results[0].Accepted {
		t.Fatal("legal attack rejected", e.state.Results)
	}
	for len(e.state.Projectiles) == 0 && e.Tick() < 30 {
		e.Advance()
	}
	if len(e.state.Projectiles) == 0 {
		t.Fatal("ordinary AA did not fire")
	}
	before := audioView(t, e)
	audioSave(t, "live-decoy.start", e)
	if _, err := os.Stat(filepath.Join(os.Getenv("FRONTLINE_AUDIO_OUTPUT"), "saves", "live-decoy.start.save.json")); err != nil {
		t.Fatal("start must restore", err)
	}
	start := e.Tick()
	for e.Tick() < start+40 {
		e.Advance()
		view := audioView(t, e)
		for _, event := range view.Events {
			if event.Kind == "missile_intercepted" {
				t.Fatal("AA decoy invented interception")
			}
			if event.Kind == "decoy_triggered" {
				if event.Entity != target.ID || event.Owner != 2 || event.Scope != "visible" {
					t.Fatal("decoy disclosure", event)
				}
				audioExport(t, "live-decoy", before, e)
				result := map[string]any{"local_players": []int{1}, "shooter": shooter.ID, "target": target.ID, "home": home.ID, "start_tick": start, "decoy_tick": e.Tick(), "additional_ticks": e.Tick() - start, "order": "ordinary player1 attack already accepted before start save", "source": "initialized US.aa and IR.fighter, genuine home, seeded active decoy buff; no force visibility"}
				raw, _ := json.MarshalIndent(result, "", "  ")
				if err := os.WriteFile(filepath.Join(os.Getenv("FRONTLINE_AUDIO_OUTPUT"), "receipt.json"), raw, 0644); err != nil {
					t.Fatal(err)
				}
				return
			}
		}
	}
	t.Fatal("no authorized live decoy event through full Advance")
}
