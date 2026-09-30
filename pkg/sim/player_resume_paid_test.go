package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// The opening is the normal match opening, including its countdown. All
// purchases, movement, blockage, guard and handoff commands use Submit.
func playerResumePaidFixture(t *testing.T, faction string, blocked bool) (*Engine, *Replay, *Entity, *Entity) {
	t.Helper()
	m := fixtureMap()
	if blocked {
		// An authored enclosure has a legal two-tile east entrance. A paid
		// power foundation later closes it; gameplay never edits terrain.
		for y := int32(15); y <= 19; y++ {
			for x := int32(6); x <= 10; x++ {
				if (x == 6 || x == 10 || y == 15 || y == 19) && !(x == 10 && (y == 16 || y == 17)) {
					m.Tiles[y*m.Width+x].Terrain = "blocked"
				}
			}
		}
	}
	if err := m.Validate(); err != nil {
		t.Fatal(err)
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Builder", Faction: faction, Team: 1}, {ID: 2, Name: "Opponent", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for e.state.Countdown > 0 {
		playerResumePaidAdvance(t, e, replay)
	}
	original := e.entity(2)
	credits, spent := e.player(1).Credits, e.player(1).Spent
	playerResumePaidOrder(t, e, Order{Kind: "train", Entities: []ID{e.entity(1).ID}, Type: faction + ".rig"}, "ok")
	var replacement *Entity
	for range 550 {
		for _, v := range e.state.Entities {
			if v.Owner == 1 && e.role(v) == "rig" && v.ID != original.ID {
				replacement = v
				break
			}
		}
		if replacement != nil {
			break
		}
		playerResumePaidAdvance(t, e, replay)
	}
	rule, _ := e.catalog.Unit(faction + ".rig")
	if replacement == nil || replacement.Paid != rule.Cost || e.player(1).Spent-spent != rule.Cost || credits-e.player(1).Credits != rule.Cost || e.countRole(1, "rig", true) != 2 {
		t.Fatal("second rig did not complete as one ordinary paid HQ order")
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	y := int32(14000)
	if blocked {
		y = 17000
	}
	playerResumePaidMove(t, e, replay, original, Vec{X: 8000, Y: y})
	replacementPoint := Vec{X: 17500, Y: y}
	playerResumePaidMove(t, e, replay, replacement, replacementPoint)
	return e, replay, original, replacement
}

func playerResumePaidAdvance(t *testing.T, e *Engine, replay *Replay) {
	t.Helper()
	before := e.Tick()
	e.Advance()
	if e.Tick() != before+1 {
		t.Fatal("ordinary world stopped", e.Outcome())
	}
	if replay != nil && e.Tick()%400 == 0 {
		if err := replay.Capture(e, false); err != nil {
			t.Fatal(err)
		}
	}
}

func playerResumePaidOrder(t *testing.T, e *Engine, o Order, want string) {
	t.Helper()
	if err := e.Submit(1, e.player(1).LastSequence+1, []Order{o}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 || e.state.Results[0].Code != want {
		t.Fatalf("tick=%d kind=%s want=%s results=%+v", e.Tick(), o.Kind, want, e.state.Results)
	}
}

func playerResumePaidMove(t *testing.T, e *Engine, replay *Replay, rig *Entity, point Vec) {
	t.Helper()
	playerResumePaidOrder(t, e, Order{Kind: "move", Entities: []ID{rig.ID}, Position: point}, "ok")
	for range 450 {
		if len(rig.Orders) == 0 && distance(rig.Position, point) <= 250 {
			break
		}
		playerResumePaidAdvance(t, e, replay)
	}
	if len(rig.Orders) != 0 || distance(rig.Position, point) > 250 || rig.Blocked {
		t.Fatal("paid rig could not reach authored work point", rig.Position, point, rig.RouteFailures)
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
}

func playerResumePaidProbe(t *testing.T, e *Engine, replacement, foundation ID, want string) {
	t.Helper()
	before := e.Hash()
	advice, err := e.PreviewCandidates(1, []Order{{Kind: "resume", Entities: []ID{replacement}, Target: foundation}})
	if err != nil || len(advice) != 1 || advice[0].Code != want || before != e.Hash() {
		t.Fatal("resume probe disagreed or mutated live state", advice, err)
	}
}

func TestPlayerResumePaidHandoff(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, mode := range []string{"guard", "active_build", "blocked_build"} {
			t.Run(faction+"/"+mode, func(t *testing.T) {
				e, replay, original, replacement := playerResumePaidFixture(t, faction, mode == "blocked_build")
				y := int32(14000)
				if mode == "blocked_build" {
					y = 17000
				}
				playerResumePaidOrder(t, e, Order{Kind: "build", Entities: []ID{original.ID}, Type: "power", Position: Vec{X: 15000, Y: y}}, "ok")
				foundation := e.entity(original.Orders[0].Target)
				created, paid, width, height := foundation.Created, foundation.Paid, foundation.FootprintWidth, foundation.FootprintHeight
				if foundation.Builder != original.ID || foundation.Complete || paid != 500000 {
					t.Fatal("original paid build was not accepted")
				}
				var gate *Entity
				switch mode {
				case "guard":
					playerResumePaidOrder(t, e, Order{Kind: "guard", Entities: []ID{original.ID}, Target: foundation.ID}, "ok")
					if original.Orders[0].Kind != "guard" || original.Orders[0].Target != foundation.ID || original.Blocked {
						t.Fatal("Guard did not replace Build at the same foundation")
					}
				case "active_build":
					playerResumePaidProbe(t, e, replacement.ID, foundation.ID, "builder_assigned")
					playerResumePaidOrder(t, e, Order{Kind: "resume", Entities: []ID{replacement.ID}, Target: foundation.ID}, "builder_assigned")
					if foundation.Builder != original.ID {
						t.Fatal("active builder lost exclusive assignment")
					}
					playerResumePaidOrder(t, e, Order{Kind: "stop", Entities: []ID{original.ID}}, "ok")
				case "blocked_build":
					playerResumePaidOrder(t, e, Order{Kind: "build", Entities: []ID{replacement.ID}, Type: "power", Position: Vec{X: 11000, Y: 17000}}, "ok")
					gate = e.entity(replacement.Orders[0].Target)
					playerResumePaidOrder(t, e, Order{Kind: "stop", Entities: []ID{replacement.ID}}, "ok")
					for range 130 {
						if original.RouteFailures > 0 {
							break
						}
						playerResumePaidAdvance(t, e, replay)
					}
					if original.RouteFailures != 1 || original.Blocked || original.Orders[0].Kind != "build" {
						t.Fatal("ordinary closed entrance did not yield a genuine short reroute", original.RouteFailures, original.Blocked)
					}
					playerResumePaidProbe(t, e, replacement.ID, foundation.ID, "builder_assigned")
					playerResumePaidOrder(t, e, Order{Kind: "resume", Entities: []ID{replacement.ID}, Target: foundation.ID}, "builder_assigned")
					if foundation.Builder != original.ID {
						t.Fatal("short reroute released its claim prematurely")
					}
					for range 130 {
						if original.Blocked {
							break
						}
						playerResumePaidAdvance(t, e, replay)
					}
					if !original.Blocked || original.RouteFailures < 2 || original.Orders[0].Kind != "build" || original.Orders[0].Target != foundation.ID {
						t.Fatal("public construction obstacle did not confirm failed Build", original.RouteFailures, original.Blocked)
					}
				}
				if foundation.Work != 0 || foundation.Builder != original.ID {
					t.Fatal("original case performed unintended foundation work", foundation.Work)
				}
				playerResumePaidProbe(t, e, replacement.ID, foundation.ID, "ok")
				before := e.player(1).Credits
				spent := e.player(1).Spent
				playerResumePaidOrder(t, e, Order{Kind: "resume", Entities: []ID{replacement.ID}, Target: foundation.ID}, "ok")
				if foundation.Builder != replacement.ID || e.player(1).Credits != before || e.player(1).Spent != spent || foundation.Work > 2 {
					t.Fatal("explicit handoff charged again or assigned two builders")
				}
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, saved)
				if err != nil || restored.Hash() != e.Hash() {
					t.Fatal("handoff save changed state", err)
				}
				for _, world := range []*Engine{e, restored} {
					playerResumePaidOrder(t, world, Order{Kind: "resume", Entities: []ID{original.ID}, Target: foundation.ID}, "builder_assigned")
					if gate != nil {
						playerResumePaidOrder(t, world, Order{Kind: "cancel", Entities: []ID{gate.ID}}, "ok")
					}
				}
				finance := e.player(1).Credits
				for range 400 {
					if foundation.Complete {
						break
					}
					work := foundation.Work
					playerResumePaidAdvance(t, e, replay)
					playerResumePaidAdvance(t, restored, nil)
					if foundation.Builder != replacement.ID || foundation.Work != work+2 {
						t.Fatal("handoff did not preserve exactly one builder's normal work", work, foundation.Work)
					}
				}
				if !foundation.Complete || foundation.Paid != paid || foundation.Created != created || foundation.FootprintWidth != width || foundation.FootprintHeight != height || foundation.HP != foundation.MaxHP || e.player(1).Spent != spent || e.player(1).Credits != finance || e.countRole(1, "rig", true) != 2 || len(replacement.Orders) != 0 {
					t.Fatal("handoff changed investment, footprint, completion cadence or builder availability")
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("paid handoff diverged after save restore")
				}
				if err := replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
				if len(replay.Checkpoints) != 0 {
					t.Fatal("handoff replay skipped normal paid opening")
				}
				played, err := replay.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("full paid-opening replay changed handoff", err)
				}
				t.Logf("mode=%s paid_second_rig=%d foundation_paid=%d completion=%d spent=%d failures=%d full_replay_hash=%s", mode, replacement.Paid, paid, e.Tick(), e.player(1).Spent, original.RouteFailures, e.Hash())
			})
		}
	}
}
