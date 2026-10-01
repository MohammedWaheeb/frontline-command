package sim

import "testing"

func practiceFixture(t *testing.T) *Engine {
	e := fixture(t)
	e.state.Metadata.Ruleset = "practice-v1"
	return e
}
func TestPracticeToolsAreRestrictedAndReplayable(t *testing.T) {
	standard := fixture(t)
	for _, order := range []Order{{Kind: "practice_spawn", Type: "US.tank", Target: 1, Index: 1, Position: Vec{X: 21000, Y: 20000}}, {Kind: "practice_resources", Target: 1, Index: 100000}, {Kind: "practice_fog", Index: 1}, {Kind: "practice_remove", Target: 4}, {Kind: "practice_restore", Target: 2}} {
		before := standard.Hash()
		if got := standard.execute(1, order); got != "practice_only" {
			t.Fatal("practice escaped ruleset", got)
		}
		if standard.Hash() != before {
			t.Fatal("rejected practice changed standard state")
		}
	}
	e := practiceFixture(t)
	replay, _ := NewReplay(e)
	issue(t, e, 1, Order{Kind: "practice_spawn", Type: "IR.tank", Target: 2, Index: 2, Position: Vec{X: 31000, Y: 22000}})
	if len(e.state.Entities) != 6 {
		t.Fatal("free placement failed")
	}
	issue(t, e, 1, Order{Kind: "practice_resources", Target: 1, Index: 9999})
	if e.player(1).Credits != 9999000 {
		t.Fatal("practice resources")
	}
	view, _ := e.PlayerView(1)
	if len(view.Entities) != 2 {
		t.Fatal("fixture unexpectedly sees enemy")
	}
	issue(t, e, 1, Order{Kind: "practice_fog", Index: 1})
	view, _ = e.PlayerView(1)
	if len(view.Entities) != 6 {
		t.Fatal("practice reveal missing entities")
	}
	for _, visible := range view.Visible {
		if !visible {
			t.Fatal("practice reveal incomplete")
		}
	}
	issue(t, e, 1, Order{Kind: "practice_remove", Target: 4})
	ticks(e, 30)
	replay.Capture(e, false)
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("practice replay diverged", err)
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("practice restore", err)
	}
	e.state.Metadata.Ruleset = "standard-v2"
	save, _ = e.Save()
	if _, err := Restore(e.catalog, save); err == nil {
		t.Fatal("practice reveal accepted in standard save")
	}
}
func TestPracticePlacementStillRespectsRosterCapsAndSpace(t *testing.T) {
	e := practiceFixture(t)
	for _, order := range []Order{{Kind: "practice_spawn", Type: "not-real", Target: 1, Index: 1}, {Kind: "practice_spawn", Type: "IR.tank", Target: 1, Index: 1}, {Kind: "practice_spawn", Type: "US.tank", Target: 1, Index: 21}, {Kind: "practice_spawn", Type: "US.fighter", Target: 1, Index: 1, Position: Vec{X: 30000, Y: 24000}}} {
		before := e.Hash()
		if got := e.execute(1, order); got == "ok" {
			t.Fatal("invalid practice spawn accepted", order)
		}
		if e.Hash() != before {
			t.Fatal("failed practice placement changed state")
		}
	}
	if got := e.execute(1, Order{Kind: "practice_spawn", Type: "US.rig", Target: 1, Index: 4, Position: Vec{X: 22000, Y: 22000}}); got != "practice_capacity_or_placement" {
		t.Fatal("rig cap bypass", got)
	}
}
