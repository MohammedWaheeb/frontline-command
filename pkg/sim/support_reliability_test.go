package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func supportReliabilityFixture(t *testing.T, faction string) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 930, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

func TestSupportReliabilityExplicitRepairTarget(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, pair := range []struct {
			source, target string
			gain, cost     int64
		}{{"medic", "rifle", 600, 0}, {"repair", "tank", 1500, 150}} {
			t.Run(faction+"/"+pair.source, func(t *testing.T) {
				e := supportReliabilityFixture(t, faction)
				earlier := e.spawn(faction+"."+pair.target, 1, Vec{X: 27000, Y: 19000}, true, 0)
				requested := e.spawn(faction+"."+pair.target, 1, Vec{X: 27000, Y: 21000}, true, 0)
				source := e.spawn(faction+"."+pair.source, 1, Vec{X: 25000, Y: 20000}, true, 0)
				earlier.HP -= 10000
				requested.HP -= 10000
				e.recalculate()
				e.updateFog()
				beforeEarlier, beforeRequested, beforeCredits := earlier.HP, requested.HP, e.player(1).Credits
				issue(t, e, 1, Order{Kind: "repair", Entities: []ID{source.ID}, Target: requested.ID})
				if earlier.HP != beforeEarlier || requested.HP != beforeRequested+pair.gain || e.player(1).Credits != beforeCredits-pair.cost {
					t.Fatalf("explicit target lost to earlier casualty: earlier gained=%d requested gained=%d credits spent=%d; want 0/%d/%d", earlier.HP-beforeEarlier, requested.HP-beforeRequested, beforeCredits-e.player(1).Credits, pair.gain, pair.cost)
				}
			})
		}
	}
}

func TestSupportReliabilityAutomaticTargetSelectionUnchanged(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e := supportReliabilityFixture(t, faction)
			earlier := e.spawn(faction+".tank", 1, Vec{X: 27000, Y: 19000}, true, 0)
			later := e.spawn(faction+".tank", 1, Vec{X: 27000, Y: 21000}, true, 0)
			e.spawn(faction+".repair", 1, Vec{X: 25000, Y: 20000}, true, 0)
			earlier.HP -= 10000
			later.HP -= 10000
			beforeEarlier, beforeLater, beforeCredits := earlier.HP, later.HP, e.player(1).Credits
			e.Advance()
			if earlier.HP != beforeEarlier+1500 || later.HP != beforeLater || e.player(1).Credits != beforeCredits-150 {
				t.Fatal("ordinary automatic repair changed its stable one-target selection")
			}
		})
	}
}

func TestSupportReliabilityRepairCompletionPreservesQueueAndRestore(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, pair := range []struct {
			source, target string
			gain           int64
		}{{"medic", faction + ".rifle", 600}, {"repair", faction + ".tank", 1500}, {"engineer", "outpost", 1250}} {
			t.Run(faction+"/"+pair.source, func(t *testing.T) {
				e := supportReliabilityFixture(t, faction)
				target := e.spawn(pair.target, 1, Vec{X: 26000, Y: 20000}, true, 0)
				source := e.spawn(faction+"."+pair.source, 1, Vec{X: 24000, Y: 20000}, true, 0)
				target.HP -= pair.gain * 3
				e.recalculate()
				e.updateFog()
				issue(t, e, 1, Order{Kind: "repair", Entities: []ID{source.ID}, Target: target.ID})
				goal := Vec{X: 34000, Y: 20000}
				issue(t, e, 1, Order{Kind: "move", Entities: []ID{source.ID}, Position: goal, Queued: true})
				if target.HP != target.MaxHP-pair.gain || len(source.Orders) != 2 {
					t.Fatal("fixture did not retain one repair tick and one queued move")
				}
				restored := containerRestore(t, e)
				e.Advance()
				restored.Advance()
				if target.HP != target.MaxHP || len(source.Orders) != 1 || source.Orders[0].Kind != "move" || source.Orders[0].Position != goal {
					t.Fatalf("full repair blocked accepted queued work: hp=%d/%d orders=%+v", target.HP, target.MaxHP, source.Orders)
				}
				before := source.Position
				for range 20 {
					e.Advance()
					restored.Advance()
					if e.Hash() != restored.Hash() {
						t.Fatal("repair completion diverged after restoration")
					}
				}
				if source.Position == before {
					t.Fatal("completed repair never resumed queued movement")
				}
			})
		}
	}
}

func TestSupportReliabilityInvalidRepairTargetPreservesQueue(t *testing.T) {
	for _, change := range []string{"destroyed", "captured"} {
		t.Run(change, func(t *testing.T) {
			e := supportReliabilityFixture(t, "US")
			target := e.spawn("outpost", 1, Vec{X: 26000, Y: 20000}, true, 1000000)
			source := e.spawn("US.engineer", 1, Vec{X: 24000, Y: 20000}, true, 400000)
			target.HP = 100000
			e.recalculate()
			e.updateFog()
			issue(t, e, 1, Order{Kind: "repair", Entities: []ID{source.ID}, Target: target.ID})
			goal := Vec{X: 34000, Y: 20000}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{source.ID}, Position: goal, Queued: true})
			if change == "destroyed" {
				transportImpact(e, target.ID, e.Tick()+1, true)
			} else if !e.captureBuilding(2, target) {
				t.Fatal("fixture could not capture the repair target")
			}
			beforeCredits := e.player(1).Credits
			e.Advance()
			if len(source.Orders) != 1 || source.Orders[0].Kind != "move" || source.Orders[0].Position != goal || e.player(1).Credits != beforeCredits {
				t.Fatalf("invalid repair target consumed credits or blocked queued move: orders=%+v", source.Orders)
			}
			if change == "destroyed" && e.entity(target.ID) != nil || change == "captured" && target.Owner != 2 {
				t.Fatal("fixture did not invalidate the target")
			}
		})
	}
}

func TestSupportReliabilityBlockedRepairKeepsPendingOrder(t *testing.T) {
	for _, block := range []string{"incoming_combat", "outgoing_combat", "reserve", "source_disabled"} {
		t.Run(block, func(t *testing.T) {
			e := supportReliabilityFixture(t, "US")
			target := e.spawn("US.tank", 1, Vec{X: 26000, Y: 20000}, true, 1300000)
			source := e.spawn("US.repair", 1, Vec{X: 24000, Y: 20000}, true, 600000)
			target.HP -= 100000
			e.recalculate()
			e.updateFog()
			issue(t, e, 1, Order{Kind: "repair", Entities: []ID{source.ID}, Target: target.ID})
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{source.ID}, Position: Vec{X: 34000, Y: 20000}, Queued: true})
			switch block {
			case "incoming_combat":
				target.EverDamaged, target.LastDamage = true, e.Tick()
			case "outgoing_combat":
				target.EverDealt, target.LastDealt = true, e.Tick()
			case "reserve":
				e.player(1).RepairReserve = e.player(1).Credits
			case "source_disabled":
				source.DisabledUntil = e.Tick() + seconds(5)
			}
			beforeHP, beforeCredits := target.HP, e.player(1).Credits
			for range 3 {
				e.Advance()
			}
			if target.HP != beforeHP || e.player(1).Credits != beforeCredits || len(source.Orders) != 2 || source.Orders[0].Kind != "repair" {
				t.Fatal("temporarily blocked repair healed, spent reserve, or abandoned its target")
			}
		})
	}
}

func TestSupportReliabilitySafehousePowerOffCancelsAtCompletion(t *testing.T) {
	for _, mode := range []string{"normal", "prepared", "rapid"} {
		for _, endpoint := range []string{"source", "destination"} {
			t.Run(mode+"/"+endpoint, func(t *testing.T) {
				s := safehouseAcceptanceFixture(t, mode)
				e := s.engine
				issue(t, e, 1, transferOrder(s))
				until := e.entity(s.source).ChannelUntil
				for e.Tick() < until-1 {
					e.Advance()
				}
				restored := containerRestore(t, e)
				id := s.source
				if endpoint == "destination" {
					id = s.destination
				}
				o := Order{Kind: "power", Entities: []ID{id}, Index: 0}
				issue(t, e, 1, o)
				issue(t, restored, 1, o)
				if e.Tick() != until || e.entity(s.source).Channel != "" {
					t.Fatalf("disabled endpoint completed transfer: tick=%d until=%d source channel=%s passengers=%v", e.Tick(), until, e.entity(s.source).Channel, e.entity(s.source).Passengers)
				}
				safehousePassengersRemain(t, e, s)
				canceled := 0
				for _, event := range e.state.Events {
					if event.Kind == "transfer_canceled" && event.Owner == 1 && event.Entity == s.source {
						canceled++
					}
				}
				if canceled != 1 || e.Hash() != restored.Hash() {
					t.Fatal("power-off must emit one cancellation and restore identically")
				}
				for range 3 {
					e.Advance()
					restored.Advance()
					if e.Hash() != restored.Hash() {
						t.Fatal("canceled preparation diverged after restoration")
					}
					for _, event := range e.state.Events {
						if event.Kind == "transfer_canceled" {
							t.Fatal("canceled preparation repeated its warning")
						}
					}
				}
				issue(t, e, 1, Order{Kind: "power", Entities: []ID{id}, Index: 1})
				issue(t, e, 1, transferOrder(s))
				if e.entity(s.source).Channel != "transit" {
					t.Fatal("cancellation retained the per-player transfer reservation")
				}
				ticks(e, 120)
				for i, id := range s.passengers {
					unit := e.entity(id)
					if unit == nil || unit.Container != 0 || unit.HP != []int64{123456, 99999}[i] {
						t.Fatal("fresh enabled transfer lost or injured a retained passenger")
					}
				}
			})
		}
	}
}
