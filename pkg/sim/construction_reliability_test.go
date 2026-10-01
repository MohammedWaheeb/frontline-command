package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func constructionReliabilityFixture(t testing.TB, faction string) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Builder", Faction: faction, Team: 1}, {ID: 2, Name: "Opponent", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

// Prepared cargo isolates interrupted delivery from field travel and extraction
// balance. The gather/power orders, rerouting, three-second payment, save and
// replay all use the ordinary simulation path.
func TestConstructionReliabilityInterruptedUnloadingRequiresFreshDelivery(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, interruption := range []string{"destroyed", "disabled", "captured"} {
			t.Run(faction+"/"+interruption, func(t *testing.T) {
				e := constructionReliabilityFixture(t, faction)
				old := e.spawn("supply", 1, Vec{X: 18000, Y: 20000}, true, 1800000)
				replacement := e.spawn("supply", 1, Vec{X: 43000, Y: 20000}, true, 1800000)
				old.IncludedHauler, replacement.IncludedHauler = true, true
				hauler := e.spawn(faction+".hauler", 1, Vec{X: 21500, Y: 20000}, true, 900000)
				hauler.Cargo = 600000
				e.recalculate()
				e.updateFog()
				issue(t, e, 1, Order{Kind: "gather", Entities: []ID{hauler.ID}, Target: 1})
				if hauler.Depot != old.ID || hauler.State != "unloading" || hauler.TaskUntil != e.Tick()+seconds(3) {
					t.Fatal("fixture did not begin ordinary delivery", hauler.Depot, hauler.State, hauler.TaskUntil)
				}
				oldDeadline := hauler.TaskUntil
				ticks(e, uint32(seconds(1)))
				switch interruption {
				case "destroyed":
					old.HP = 0
					e.Advance()
				case "disabled":
					issue(t, e, 1, Order{Kind: "power", Entities: []ID{old.ID}, Index: 0})
				case "captured":
					old.HP = old.MaxHP / 5
					if !e.captureBuilding(2, old) {
						t.Fatal("fixture capture failed")
					}
					e.Advance()
				}
				if hauler.Depot != replacement.ID || e.edgeDistance(hauler, replacement) <= 1200 {
					t.Fatal("fixture did not choose a distant replacement depot")
				}
				credits, income := e.player(1).Credits, e.player(1).Income
				rerouteFrom := hauler.Position
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, saved)
				if err != nil {
					t.Fatal(err)
				}
				for e.Tick() < oldDeadline {
					e.Advance()
					restored.Advance()
				}
				if hauler.Cargo != 600000 || e.player(1).Credits != credits || e.player(1).Income != income {
					t.Fatalf("old unloading timer paid without reaching replacement: tick=%d edge=%d cargo=%d credits_delta=%d income_delta=%d", e.Tick(), e.edgeDistance(hauler, replacement), hauler.Cargo, e.player(1).Credits-credits, e.player(1).Income-income)
				}
				// Navigation reports moving/turning activity while returning.
				// Observe the transaction and travel rather than its activity label.
				if hauler.State == "unloading" || hauler.TaskUntil != 0 || hauler.Position == rerouteFrom {
					t.Fatal("lost depot retained the unloading timer or failed to travel", hauler.State, hauler.TaskUntil, hauler.Position)
				}
				newDeadline := Tick(0)
				delivered := false
				for range 400 {
					e.Advance()
					restored.Advance()
					if hauler.State == "unloading" && newDeadline == 0 {
						if e.edgeDistance(hauler, replacement) > 1200 || hauler.TaskUntil != e.Tick()+seconds(3) {
							t.Fatal("replacement delivery did not start at the depot with a fresh three-second timer")
						}
						newDeadline = hauler.TaskUntil
					}
					if e.player(1).Income != income {
						if newDeadline == 0 || e.Tick() != newDeadline || e.player(1).Income-income != 600000 || e.player(1).Credits-credits != 600000 || hauler.Cargo != 0 {
							t.Fatal("replacement delivery changed payment or timing", e.Tick(), newDeadline, e.player(1).Income-income)
						}
						delivered = true
						break
					}
				}
				if !delivered {
					t.Fatal("hauler never delivered retained cargo at the replacement depot", hauler.Position, hauler.State)
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("interrupted delivery changed after restore")
				}
				if err := replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
				played, err := replay.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("interrupted delivery replay drift", err)
				}
				t.Logf("old_deadline=%d fresh_deadline=%d paid_once=%d hash=%s", oldDeadline, newDeadline, e.player(1).Income-income, e.Hash())
			})
		}
	}
}

func constructionReliabilityResumeResult(t testing.TB, e *Engine, rig, foundation ID) string {
	t.Helper()
	if err := e.Submit(1, e.player(1).LastSequence+1, []Order{{Kind: "resume", Entities: []ID{rig}, Target: foundation}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 {
		t.Fatal("missing resume receipt", e.state.Results)
	}
	return e.state.Results[0].Code
}

func TestConstructionReliabilityConfirmedBlockedBuilderCanBeReplaced(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e := constructionReliabilityFixture(t, faction)
			original := e.entity(2)
			original.Position = Vec{X: 8000, Y: 17000}
			original.LastPosition, original.Anchor = original.Position, original.Position
			replacement := e.spawn(faction+".rig", 1, Vec{X: 17400, Y: 17000}, true, 800000)
			e.recalculate()
			e.updateFog()
			issue(t, e, 1, Order{Kind: "build", Entities: []ID{original.ID}, Type: "power", Position: Vec{X: 15000, Y: 17000}})
			foundation := e.entity(original.Orders[0].Target)
			foundation.HP -= 50000
			paid, spent := foundation.Paid, e.player(1).Spent
			// Enclose only the assigned rig, leaving all map resources and
			// starting areas connected. The second rig has legal access.
			for y := int32(15); y <= 19; y++ {
				for x := int32(6); x <= 10; x++ {
					if x == 6 || x == 10 || y == 15 || y == 19 {
						e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
					}
				}
			}
			if err := e.state.Map.Validate(); err != nil {
				t.Fatal("blocked-builder fixture disconnected map objectives", err)
			}
			e.state.NavigationRevision++
			// Route failure is recorded only after two seconds without
			// progress, not on the first unsuccessful path-search tick.
			for range 90 {
				e.Advance()
				if original.RouteFailures > 0 {
					break
				}
			}
			if original.RouteFailures != 1 || original.Blocked {
				t.Fatal("fixture did not begin a short reroute", original.RouteFailures, original.Blocked)
			}
			if code := constructionReliabilityResumeResult(t, e, replacement.ID, foundation.ID); code != "builder_assigned" || foundation.Builder != original.ID {
				t.Fatal("short reroute lost its construction reservation", code, foundation.Builder)
			}
			for range 100 {
				if original.Blocked {
					break
				}
				e.Advance()
			}
			if !original.Blocked || original.RouteFailures < 2 || foundation.Work != 0 {
				t.Fatal("fixture did not confirm an unreachable builder", original.RouteFailures, foundation.Work)
			}
			order := Order{Kind: "resume", Entities: []ID{replacement.ID}, Target: foundation.ID}
			before := e.Hash()
			advice, err := e.PreviewCandidates(1, []Order{order})
			if err != nil || len(advice) != 1 || advice[0].Code != "ok" || before != e.Hash() {
				t.Fatal("confirmed blocked reservation prevented pure replacement advice", advice, err)
			}
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			if code := constructionReliabilityResumeResult(t, e, replacement.ID, foundation.ID); code != "ok" || foundation.Builder != replacement.ID {
				t.Fatal("confirmed blocked foundation could not be resumed", code, foundation.Builder)
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			if code := constructionReliabilityResumeResult(t, e, original.ID, foundation.ID); code != "builder_assigned" {
				t.Fatal("replacement did not take the exclusive reservation", code)
			}
			if code := constructionReliabilityResumeResult(t, restored, original.ID, foundation.ID); code != "builder_assigned" {
				t.Fatal("exclusive replacement changed after restore", code)
			}
			for range 320 {
				if foundation.Complete {
					break
				}
				previous := foundation.Work
				e.Advance()
				restored.Advance()
				if foundation.Work != previous+2 {
					t.Fatal("replacement did not preserve ordinary single-builder work", previous, foundation.Work)
				}
			}
			if !foundation.Complete {
				t.Fatal("replacement did not finish within ordinary construction time")
			}
			b, _ := e.buildingRule(foundation.Type)
			if foundation.HP != b.HP-50000 || foundation.Paid != paid || e.player(1).Spent != spent || paid != b.Cost {
				t.Fatal("resuming changed existing damage or charged for the foundation again", foundation.HP, foundation.Paid, e.player(1).Spent)
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("replacement construction changed after restore")
			}
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("replacement construction replay drift", err)
			}
			t.Logf("failures=%d completion_tick=%d paid=%d damage_retained=%d hash=%s", original.RouteFailures, e.Tick(), paid, b.HP-foundation.HP, e.Hash())
		})
	}
}

func TestConstructionReliabilityUnrelatedBuilderOrdersDoNotReserveFoundation(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, kind := range []string{"guard", "escort"} {
			t.Run(faction+"/"+kind, func(t *testing.T) {
				e := constructionReliabilityFixture(t, faction)
				original := e.entity(2)
				original.Position = Vec{X: 8000, Y: 14000}
				original.LastPosition, original.Anchor = original.Position, original.Position
				replacement := e.spawn(faction+".rig", 1, Vec{X: 17400, Y: 14000}, true, 800000)
				e.recalculate()
				e.updateFog()
				issue(t, e, 1, Order{Kind: "build", Entities: []ID{original.ID}, Type: "power", Position: Vec{X: 15000, Y: 14000}})
				foundation := e.entity(original.Orders[0].Target)
				issue(t, e, 1, Order{Kind: kind, Entities: []ID{original.ID}, Target: foundation.ID, Position: foundation.Position})
				if original.Blocked || original.Orders[0].Kind != kind || foundation.Work != 0 {
					t.Fatal("fixture did not pause construction for an unrelated target order")
				}
				before := e.Hash()
				advice, err := e.PreviewCandidates(1, []Order{{Kind: "resume", Entities: []ID{replacement.ID}, Target: foundation.ID}})
				if err != nil || len(advice) != 1 || advice[0].Code != "ok" || before != e.Hash() {
					t.Fatal("unrelated target order prevented pure resume advice", advice, err)
				}
				if code := constructionReliabilityResumeResult(t, e, replacement.ID, foundation.ID); code != "ok" || foundation.Builder != replacement.ID || foundation.Work != 2 {
					t.Fatal("unrelated target order reserved paused construction", code, foundation.Builder, foundation.Work)
				}
			})
		}
	}
}
