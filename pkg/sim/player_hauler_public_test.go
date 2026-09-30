package sim_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// These tests compile against the frozen predecessor too. Every actor, cargo
// load, damage and payment comes from validated input, paid orders and Advance.
type playerHaulerAudit struct {
	t       *testing.T
	e       *sim.Engine
	dir     string
	orders  []sim.Scheduled
	receipt map[string]any
}

func newPlayerHaulerAudit(t *testing.T, stock int64) *playerHaulerAudit {
	t.Helper()
	m := shipmentCapacityMap(2)
	m.ID, m.Title = "player-hauler-public", "Player hauler public control fixture"
	m.Spawns[1].Position = sim.Vec{X: 56000, Y: 8000}
	m.Fields[0].Credits, m.Fields[1].Credits = stock, 6000000
	m.Fields[1].Position = sim.Vec{X: 22000, Y: 8500}
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	m, err = content.DecodeMap(raw)
	if err != nil {
		t.Fatal("fixture map rejected by public decoder", err)
	}
	e, err := sim.New(content.MustBase(), sim.Config{Map: m, Seed: 730035, Ruleset: "standard-v2", Players: []sim.PlayerConfig{{ID: 1, Name: "Owner", Faction: "US", Team: 1}, {ID: 2, Name: "Attacker", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	dir := os.Getenv("FRONTLINE_HAULER_EVIDENCE")
	if dir == "" {
		dir = t.TempDir()
	}
	dir = filepath.Join(dir, strings.ReplaceAll(t.Name(), "/", "-"))
	if err = os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	a := &playerHaulerAudit{t: t, e: e, dir: dir, receipt: map[string]any{"metadata": e.Metadata(), "fixture_kind": "validated map, paid public orders, canonical stepping", "initial_hash": e.Hash()}}
	a.write("map.json", raw)
	a.save("initial")
	t.Cleanup(func() {
		a.receipt["orders"], a.receipt["tick"], a.receipt["final_hash"], a.receipt["failed"] = a.orders, e.Tick(), e.Hash(), t.Failed()
		data, err := json.MarshalIndent(a.receipt, "", "  ")
		if err != nil {
			t.Error(err)
			return
		}
		a.write("receipt.json", data)
	})
	a.wait(101, func() bool { v, _ := e.PlayerView(1); return v.Countdown == 0 })
	return a
}

func (a *playerHaulerAudit) write(name string, data []byte) {
	a.t.Helper()
	if err := os.WriteFile(filepath.Join(a.dir, name), data, 0644); err != nil {
		a.t.Fatal(err)
	}
}

func (a *playerHaulerAudit) save(name string) []byte {
	a.t.Helper()
	data, err := a.e.Save()
	if err != nil {
		a.t.Fatal(err)
	}
	a.write(name+".save.json", data)
	sum := sha256.Sum256(data)
	a.receipt[name] = map[string]any{"tick": a.e.Tick(), "state_hash": a.e.Hash(), "sha256": hex.EncodeToString(sum[:]), "bytes": len(data)}
	return data
}

func (a *playerHaulerAudit) step() {
	a.t.Helper()
	prior := a.e.Tick()
	a.e.Advance()
	if a.e.Tick() != prior+1 {
		a.t.Fatal("fixture stopped before intended boundary", a.e.Outcome())
	}
}

func (a *playerHaulerAudit) wait(limit int, predicate func() bool) {
	a.t.Helper()
	for range limit {
		if predicate() {
			return
		}
		a.step()
	}
	a.save("fixture-timeout")
	a.t.Fatal("fixture did not reach boundary within", limit, "ticks")
}

func (a *playerHaulerAudit) command(player sim.PlayerID, order sim.Order, accepted bool) {
	a.t.Helper()
	view, _ := a.e.PlayerView(player)
	sequence := view.Economy.LastSequence + 1
	if err := a.e.Submit(player, sequence, []sim.Order{order}); err != nil {
		a.receipt["submit_rejected"] = map[string]any{"player": player, "sequence": sequence, "order": order, "error": err.Error()}
		a.t.Fatal("public Submit rejected intention", order, err)
	}
	a.orders = append(a.orders, sim.Scheduled{Tick: a.e.Tick() + 1, Player: player, Sequence: sequence, Orders: []sim.Order{order}})
	a.step()
	feedback, _ := a.e.PlayerFeedback(player)
	if len(feedback.Results) != 1 || feedback.Results[0].Accepted != accepted {
		a.t.Fatal("public executor acceptance", order, feedback.Results)
	}
}

func (a *playerHaulerAudit) entity(player sim.PlayerID, id sim.ID) sim.EntityView {
	a.t.Helper()
	view, _ := a.e.PlayerView(player)
	for _, v := range view.Entities {
		if v.ID == id {
			return v
		}
	}
	a.t.Fatal("owner entity absent", id)
	return sim.EntityView{}
}

func haulerPrivateJSON(t *testing.T, v sim.EntityView) map[string]any {
	t.Helper()
	data, err := json.Marshal(v.Private)
	if err != nil {
		t.Fatal(err)
	}
	var private map[string]any
	if err = json.Unmarshal(data, &private); err != nil {
		t.Fatal(err)
	}
	return private
}

func (a *playerHaulerAudit) first(player sim.PlayerID, typ string, completed bool) sim.ID {
	view, _ := a.e.PlayerView(player)
	for _, v := range view.Entities {
		if v.Owner == player && v.Type == typ && (!completed || v.Complete) {
			return v.ID
		}
	}
	return 0
}

func (a *playerHaulerAudit) paidOwnerOpening() (hauler, depot sim.ID) {
	a.t.Helper()
	rig := a.first(1, "US.rig", true)
	a.command(1, sim.Order{Kind: "build", Type: "power", Entities: []sim.ID{rig}, Position: sim.Vec{X: 14000, Y: 12000}}, true)
	a.wait(2000, func() bool { return a.first(1, "power", true) != 0 })
	a.command(1, sim.Order{Kind: "move", Entities: []sim.ID{rig}, Position: sim.Vec{X: 12000, Y: 6000}}, true)
	a.wait(600, func() bool { v := a.entity(1, rig); return squared(v.Position, sim.Vec{X: 12000, Y: 6000}) <= 300*300 })
	a.command(1, sim.Order{Kind: "build", Type: "supply", Entities: []sim.ID{rig}, Position: sim.Vec{X: 15000, Y: 8500}}, true)
	a.wait(2000, func() bool { return a.first(1, "US.hauler", true) != 0 })
	hauler, depot = a.first(1, "US.hauler", true), a.first(1, "supply", true)
	state := a.e.StateCopy()
	power, _ := content.MustBase().Building("power")
	supply, _ := content.MustBase().Building("supply")
	if state.Players[0].Spent != power.Cost+supply.Cost {
		a.t.Fatal("opening did not pay ordinary catalog costs")
	}
	a.receipt["opening"] = map[string]any{"tick": a.e.Tick(), "hauler": hauler, "depot": depot, "spent": state.Players[0].Spent, "credits": state.Players[0].Credits}
	return
}

func squared(a, b sim.Vec) int64 {
	dx, dy := int64(a.X-b.X), int64(a.Y-b.Y)
	return dx*dx + dy*dy
}

func TestPlayerHaulerEndpointPinsPublicOrdersRestoreReplay(t *testing.T) {
	a := newPlayerHaulerAudit(t, 2000)
	replay, err := sim.NewReplay(a.e)
	if err != nil {
		t.Fatal(err)
	}
	hauler, depot := a.paidOwnerOpening()
	a.command(1, sim.Order{Kind: "gather_depot", Entities: []sim.ID{hauler}, Target: depot}, true)
	a.command(1, sim.Order{Kind: "retreat_when_attacked", Entities: []sim.ID{hauler}, Index: 1}, true)
	a.command(1, sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: 1}, true)
	a.command(1, sim.Order{Kind: "move", Entities: []sim.ID{hauler}, Queued: true, Position: sim.Vec{X: 12000, Y: 16000}}, true)
	a.wait(1200, func() bool {
		private := haulerPrivateJSON(t, a.entity(1, hauler))
		return private["field"] == float64(2)
	})
	v := a.entity(1, hauler)
	private := haulerPrivateJSON(t, v)
	if private["pinned_field"] != float64(0) || private["pinned_depot"] != float64(depot) || private["retreat_when_attacked"] != true || len(v.Private.Orders) != 2 || v.Private.Orders[1].Kind != "move" {
		t.Fatal("known depletion lost independent chosen depot, preference or accepted tail", private)
	}
	a.command(1, sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: 2}, true)
	a.command(1, sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: 0}, true)
	private = haulerPrivateJSON(t, a.entity(1, hauler))
	if private["pinned_field"] != float64(0) || private["pinned_depot"] != float64(depot) {
		t.Fatal("automatic field release erased chosen depot", private)
	}
	a.command(1, sim.Order{Kind: "gather_depot", Entities: []sim.ID{hauler}, Target: 0}, true)
	if private = haulerPrivateJSON(t, a.entity(1, hauler)); private["pinned_depot"] != float64(0) {
		t.Fatal("automatic depot release failed", private)
	}
	saved := a.save("chosen-controls")
	restored, err := sim.Restore(content.MustBase(), saved)
	if err != nil || restored.Hash() != a.e.Hash() {
		t.Fatal("chosen controls Restore/hash", err)
	}
	for range 700 {
		a.step()
		restored.Advance()
	}
	if restored.Hash() != a.e.Hash() {
		t.Fatal("chosen endpoint continuation drift")
	}
	if err = replay.Capture(a.e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(content.MustBase(), a.e.Tick())
	if err != nil || played.Hash() != a.e.Hash() {
		t.Fatal("full public endpoint replay drift", err)
	}
	a.save("continued-controls")
}

func TestPlayerHaulerDamageOptInPublicPaidDelivery(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		name := "default_continue"
		if enabled {
			name = "opt_in_retreat"
		}
		t.Run(name, func(t *testing.T) {
			a := newPlayerHaulerAudit(t, 6000000)
			replay, err := sim.NewReplay(a.e)
			if err != nil {
				t.Fatal(err)
			}
			hauler, depot := a.paidOwnerOpening()
			if enabled {
				a.command(1, sim.Order{Kind: "retreat_when_attacked", Entities: []sim.ID{hauler}, Index: 1}, true)
			}
			a.command(1, sim.Order{Kind: "gather_depot", Entities: []sim.ID{hauler}, Target: depot}, true)
			a.command(1, sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: 1}, true)
			a.command(1, sim.Order{Kind: "move", Entities: []sim.ID{hauler}, Queued: true, Position: sim.Vec{X: 12000, Y: 16000}}, true)
			rig := a.first(2, "IR.rig", true)
			a.command(2, sim.Order{Kind: "build", Type: "power", Entities: []sim.ID{rig}, Position: sim.Vec{X: 50000, Y: 12000}}, true)
			a.wait(2000, func() bool { return a.first(2, "power", true) != 0 })
			a.command(2, sim.Order{Kind: "move", Entities: []sim.ID{rig}, Position: sim.Vec{X: 49000, Y: 6000}}, true)
			a.wait(600, func() bool { return squared(a.entity(2, rig).Position, sim.Vec{X: 49000, Y: 6000}) <= 300*300 })
			a.command(2, sim.Order{Kind: "build", Type: "barracks", Entities: []sim.ID{rig}, Position: sim.Vec{X: 47000, Y: 8500}}, true)
			a.wait(2000, func() bool { return a.first(2, "barracks", true) != 0 })
			barracks := a.first(2, "barracks", true)
			a.command(2, sim.Order{Kind: "train", Type: "IR.rifle", Entities: []sim.ID{barracks}}, true)
			a.wait(1200, func() bool { return a.first(2, "IR.rifle", true) != 0 })
			attacker := a.first(2, "IR.rifle", true)
			a.command(2, sim.Order{Kind: "attack_move", Entities: []sim.ID{attacker}, Position: sim.Vec{X: 19000, Y: 8000}}, true)
			var damaged sim.Tick
			a.wait(2400, func() bool {
				feedback, _ := a.e.PlayerFeedback(1)
				for _, event := range feedback.Events {
					if event.Kind == "under_attack" && event.Entity == hauler && event.Value > 0 {
						damaged = event.Tick
						return true
					}
				}
				return false
			})
			v := a.entity(1, hauler)
			private := haulerPrivateJSON(t, v)
			if private["retreating"] != enabled || v.Private.Cargo <= 0 || len(v.Private.Orders) != 2 {
				t.Fatal("actual hostile damage did not respect preference/cargo/chosen queue", private, v.State)
			}
			// Stop the paid attacker after the first impact, so this test measures
			// one return/delivery rather than sustained combat survivability.
			a.command(2, sim.Order{Kind: "move", Entities: []sim.ID{attacker}, Position: sim.Vec{X: 29000, Y: 8000}}, true)
			a.receipt["hostile_damage"] = map[string]any{"tick": damaged, "cargo": v.Private.Cargo, "hp": v.Private.HP, "position": v.Position, "enabled": enabled}
			if !enabled {
				a.save("default-continues-after-damage")
				return
			}
			saved := a.save("retreat-in-progress")
			restored, err := sim.Restore(content.MustBase(), saved)
			if err != nil {
				t.Fatal(err)
			}
			initialIncome := a.e.StateCopy().Players[0].Income
			unloadStarted := sim.Tick(0)
			if a.entity(1, hauler).State == "unloading" {
				unloadStarted = a.e.Tick()
			}
			delivered := false
			retreatAlerts := 0
			for range 1600 {
				prior := a.entity(1, hauler)
				a.step()
				restored.Advance()
				current := a.entity(1, hauler)
				if squared(prior.Position, current.Position) > 151*151 {
					t.Fatal("retreat teleported cargo")
				}
				if current.State == "unloading" && unloadStarted == 0 {
					unloadStarted = a.e.Tick()
				}
				feedback, _ := a.e.PlayerFeedback(1)
				for _, event := range feedback.Events {
					if event.Entity == hauler && event.Kind == "hauler_retreat" {
						retreatAlerts++
					}
					if event.Entity == hauler && event.Kind == "cargo_delivered" {
						if unloadStarted == 0 || event.Tick-unloadStarted < sim.Tick(3*sim.TickRate) {
							t.Fatal("retreat bypassed the fresh three-second unload")
						}
						delivered = true
					}
				}
				if delivered {
					if haulerPrivateJSON(t, current)["retreating"] != false || current.Private.Cargo != 0 || len(current.Private.Orders) != 2 || current.Private.Orders[0].Kind != "gather" {
						t.Fatal("delivery did not resume chosen gather/accepted tail", current)
					}
					break
				}
			}
			if !delivered || retreatAlerts != 0 || a.e.StateCopy().Players[0].Income != initialIncome+v.Private.Cargo || a.e.Hash() != restored.Hash() {
				t.Fatal("retreat payment, repeated alert or continuation mismatch", delivered, retreatAlerts)
			}
			if err = replay.Capture(a.e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(content.MustBase(), a.e.Tick())
			if err != nil || played.Hash() != a.e.Hash() {
				t.Fatal("paid hostile retreat full command replay mismatch", err)
			}
			if err = replay.Capture(a.e, true); err != nil {
				t.Fatal(err)
			}
			checkpointed, err := replay.Seek(content.MustBase(), a.e.Tick())
			if err != nil || checkpointed.Hash() != a.e.Hash() {
				t.Fatal("paid hostile retreat checkpoint mismatch", err)
			}
			a.save("retreat-delivered-and-resumed")
		})
	}
}
