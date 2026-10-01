package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"slices"
	"testing"
)

// Infrastructure/hostile targets are conventional backend fixtures. Every
// selectable trained unit below is obtained through normal paid production;
// these tests qualify command semantics, not an autonomous match opening.
func groupOrderFixture(t *testing.T, faction string) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	for e.state.Countdown > 0 {
		e.Advance()
	}
	baseInfrastructure(e, 1)
	// Additional service/power buildings are declared backend setup, not
	// claimed paid construction. Unit job admission and allocation stay real.
	e.spawn("power", 1, Vec{X: 40000, Y: 10000}, true, 500000)
	e.spawn("power", 1, Vec{X: 46000, Y: 10000}, true, 500000)
	e.recalculate()
	e.updateFog()
	return e
}

func groupPaidUnit(t *testing.T, e *Engine, typ string) *Entity {
	t.Helper()
	u, ok := e.catalog.Unit(typ)
	if !ok {
		t.Fatal("unknown fixture unit", typ)
	}
	var producer *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Building && e.role(v) == u.Producer {
			producer = v
			break
		}
	}
	if producer == nil {
		for _, b := range e.catalog.Buildings() {
			if b.Role == u.Producer && (b.Faction == "" || b.Faction == e.player(1).Faction) {
				producer = e.spawn(b.ID, 1, Vec{X: 44000, Y: 28000}, true, b.Cost)
				break
			}
		}
	}
	if producer == nil {
		t.Fatal("fixture lacks producer", typ)
	}
	e.recalculate()
	e.updateFog()
	nextID, spent := e.state.NextID, e.player(1).Spent
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ})
	if len(producer.Jobs) != 1 || !producer.Jobs[0].Started || producer.Jobs[0].Paid != u.Cost {
		t.Fatal("ordinary paid job did not start", typ, producer.Jobs)
	}
	for i := uint32(0); i <= u.BuildTicks*2+1200; i++ {
		for _, v := range e.state.Entities {
			if v.ID >= nextID && v.Owner == 1 && v.Type == typ {
				if v.Paid != u.Cost || e.player(1).Spent-spent != u.Cost {
					t.Fatal("unit payment changed", typ, v.Paid, e.player(1).Spent-spent)
				}
				return v
			}
		}
		e.Advance()
	}
	t.Fatal("bounded paid production did not finish", typ, producer.Jobs)
	return nil
}

func groupEntityBytes(t *testing.T, v *Entity) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func groupUnchanged(t *testing.T, v *Entity, before []byte) {
	t.Helper()
	if !bytes.Equal(before, groupEntityBytes(t, v)) {
		t.Fatalf("skipped actor %d changed", v.ID)
	}
}

func groupApplied(t *testing.T, e *Engine, o Order, want []ID) {
	t.Helper()
	original := append([]ID(nil), o.Entities...)
	code, ids, applied := e.executeWithSelection(1, o)
	if code != "ok" || !slices.Equal(ids, want) || applied != int32(len(want)) || !slices.Equal(o.Entities, original) {
		t.Fatal("wrong effective recipients or mutated request", code, ids, applied, want, o.Entities)
	}
}

func TestGroupOrderEligibleSubset(t *testing.T) {
	t.Run("guard_queue_and_disabled", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		medic := groupPaidUnit(t, e, "US.medic")
		e.assign(rifle, Order{Kind: "move", Position: Vec{X: 22000, Y: 25000}})
		e.assign(medic, Order{Kind: "patrol", Points: []Vec{{X: 16000, Y: 20000}, {X: 18000, Y: 20000}}})
		medic.DisabledUntil = e.Tick() + 100
		beforeHQ, beforeMedic := groupEntityBytes(t, e.entity(1)), groupEntityBytes(t, medic)
		order := Order{Kind: "guard", Entities: []ID{medic.ID, 1, rifle.ID}, Target: 2, Queued: true}
		before := e.Hash()
		advice := previewOne(t, e, order)
		if !advice.Accepted || advice.Code != "ok" || !slices.Equal(advice.EligibleEntities, []ID{rifle.ID}) || advice.AppliedCount != 0 || e.Hash() != before {
			t.Fatal("mixed guard advisory", advice)
		}
		groupApplied(t, e, order, []ID{rifle.ID})
		if len(rifle.Orders) != 2 || rifle.Orders[0].Kind != "move" || rifle.Orders[1].Kind != "guard" || rifle.Orders[1].Target != 2 || !rifle.Orders[1].Queued {
			t.Fatal("queue flag or original work lost", rifle.Orders)
		}
		groupUnchanged(t, e.entity(1), beforeHQ)
		groupUnchanged(t, medic, beforeMedic)
	})

	t.Run("repair_target_role_and_candidates", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		medic := groupPaidUnit(t, e, "US.medic")
		engineer := groupPaidUnit(t, e, "US.engineer")
		beforeRifle, beforeEngineer := groupEntityBytes(t, rifle), groupEntityBytes(t, engineer)
		order := Order{Kind: "repair", Entities: []ID{engineer.ID, medic.ID, rifle.ID}, Target: rifle.ID}
		before := e.Hash()
		candidates, err := e.PreviewCandidates(1, []Order{order})
		if err != nil || len(candidates) != 1 || candidates[0].Code != "ok" || !slices.Equal(candidates[0].EligibleEntities, []ID{medic.ID}) || candidates[0].AppliedCount != 0 || e.Hash() != before {
			t.Fatal("mixed repair candidates", candidates, err)
		}
		groupApplied(t, e, order, []ID{medic.ID})
		if len(medic.Orders) != 1 || medic.Orders[0].Kind != "repair" || medic.Orders[0].Target != rifle.ID {
			t.Fatal("medic did not receive exact repair task", medic.Orders)
		}
		groupUnchanged(t, rifle, beforeRifle)
		groupUnchanged(t, engineer, beforeEngineer)
		bad := order
		bad.Target = 3
		before = e.Hash()
		if code, _, applied := e.executeWithSelection(1, bad); code != "invalid_repair_target" || applied != 0 || e.Hash() != before {
			t.Fatal("foreign repair target bypassed", code, applied)
		}
	})

	t.Run("attack_air_layer_and_target_legality", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		medic := groupPaidUnit(t, e, "US.medic")
		fighter := groupPaidUnit(t, e, "US.fighter")
		target := e.spawn("IR.isr", 2, Vec{X: 18000, Y: 20000}, true, 0)
		target.Landed = false
		e.updateFog()
		if !e.canSeeEntity(1, target) {
			t.Fatal("fixture air target must be publicly visible")
		}
		beforeRifle, beforeMedic := groupEntityBytes(t, rifle), groupEntityBytes(t, medic)
		order := Order{Kind: "attack", Entities: []ID{fighter.ID, medic.ID, rifle.ID}, Target: target.ID}
		advice := previewOne(t, e, order)
		if !advice.Accepted || advice.Code != "indeterminate" || !slices.Equal(advice.EligibleEntities, []ID{fighter.ID}) {
			t.Fatal("mixed attack public-layer advice", advice)
		}
		groupApplied(t, e, order, []ID{fighter.ID})
		if fighter.Orders[0].Kind != "attack" || fighter.Orders[0].Target != target.ID {
			t.Fatal("compatible aircraft did not receive attack")
		}
		groupUnchanged(t, rifle, beforeRifle)
		groupUnchanged(t, medic, beforeMedic)
		before := e.Hash()
		order.Target = 999999
		if code, _, applied := e.executeWithSelection(1, order); code != "target_not_visible" || applied != 0 || e.Hash() != before {
			t.Fatal("unknown attack target bypassed", code, applied)
		}
	})

	t.Run("return_subset_and_atomic_capacity", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		fighter := groupPaidUnit(t, e, "US.fighter")
		beforeRifle := groupEntityBytes(t, rifle)
		groupApplied(t, e, Order{Kind: "return", Entities: []ID{rifle.ID, fighter.ID}}, []ID{fighter.ID})
		if fighter.Orders[0].Kind != "return" {
			t.Fatal("aircraft return missing")
		}
		groupUnchanged(t, rifle, beforeRifle)
		other := e.spawn("US.airfield", 1, Vec{X: 50000, Y: 28000}, true, 1500000)
		b, _ := e.buildingRule(other.Type)
		for i := int32(0); i < b.ServiceSlots; i++ {
			occupant := e.spawn("US.fighter", 1, Vec{X: 51000 + i*1500, Y: 28000}, true, 0)
			occupant.Home = other.ID
			occupant.Landed = false
		}
		e.recalculate()
		e.updateFog()
		before := e.Hash()
		order := Order{Kind: "return", Entities: []ID{rifle.ID, fighter.ID}, Target: other.ID}
		if code, ids, applied := e.executeWithSelection(1, order); code != "service_full" || !slices.Equal(ids, []ID{fighter.ID}) || applied != 0 || e.Hash() != before {
			t.Fatal("subset Return changed a reservation on capacity failure", code, ids, applied)
		}
	})

	t.Run("deploy_board_and_free_settings", func(t *testing.T) {
		e := groupOrderFixture(t, "SA")
		rifle := groupPaidUnit(t, e, "SA.rifle")
		tank := groupPaidUnit(t, e, "SA.tank")
		transport := groupPaidUnit(t, e, "SA.apc")
		hauler := groupPaidUnit(t, e, "SA.hauler")
		beforeRifle := groupEntityBytes(t, rifle)
		groupApplied(t, e, Order{Kind: "deploy", Entities: []ID{rifle.ID, tank.ID}}, []ID{tank.ID})
		if tank.DeployUntil <= e.Tick() || tank.State != "deploying" {
			t.Fatal("capable tank not deploying")
		}
		groupUnchanged(t, rifle, beforeRifle)
		beforeTank := groupEntityBytes(t, tank)
		if e.capacity(transport) == 0 {
			t.Fatal("fixture APC must be a real transport")
		}
		groupApplied(t, e, Order{Kind: "board", Entities: []ID{tank.ID, rifle.ID}, Target: transport.ID}, []ID{rifle.ID})
		if rifle.Orders[0].Kind != "board" || rifle.Orders[0].Target != transport.ID {
			t.Fatal("infantry board missing")
		}
		groupUnchanged(t, tank, beforeTank)
		groupApplied(t, e, Order{Kind: "unload", Entities: []ID{rifle.ID, transport.ID}}, []ID{transport.ID})
		beforeTank = groupEntityBytes(t, tank)
		beforeRifle = groupEntityBytes(t, rifle)
		credits, spent := e.player(1).Credits, e.player(1).Spent
		groupApplied(t, e, Order{Kind: "retreat_when_attacked", Entities: []ID{tank.ID, rifle.ID, hauler.ID}, Index: 1}, []ID{hauler.ID})
		if !hauler.RetreatWhenAttacked || e.player(1).Credits != credits || e.player(1).Spent != spent {
			t.Fatal("free hauler setting or payment changed")
		}
		groupUnchanged(t, tank, beforeTank)
		groupUnchanged(t, rifle, beforeRifle)
	})

	t.Run("owned_dead_disabled_and_foreign_admission", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		dead := groupPaidUnit(t, e, "US.medic")
		dead.HP = 0
		beforeDead := groupEntityBytes(t, dead)
		groupApplied(t, e, Order{Kind: "hold", Entities: []ID{dead.ID, rifle.ID}}, []ID{rifle.ID})
		groupUnchanged(t, dead, beforeDead)
		before := e.Hash()
		if code, ids, applied := e.executeWithSelection(1, Order{Kind: "move", Entities: []ID{dead.ID}, Position: Vec{X: 26000, Y: 26000}}); code != "unit_destroyed" || len(ids) != 0 || applied != 0 || e.Hash() != before {
			t.Fatal("all-dead selection mutated", code, ids, applied)
		}
		foreign := e.spawn("IR.rifle", 2, Vec{X: 56000, Y: 53000}, true, 0)
		for _, hp := range []int64{foreign.MaxHP, 0} {
			foreign.HP = hp
			before = e.Hash()
			order := Order{Kind: "move", Entities: []ID{rifle.ID, foreign.ID}, Position: Vec{X: 26000, Y: 26000}}
			if code, ids, applied := e.executeWithSelection(1, order); code != "not_owner" || len(ids) != 0 || applied != 0 || e.Hash() != before {
				t.Fatal("foreign member partly applied", code, ids, applied)
			}
			if err := e.Submit(1, e.player(1).LastSequence+1, []Order{order}); err == nil || err.Error() != "not_owner" || e.Hash() != before {
				t.Fatal("foreign member admitted", err)
			}
		}
		for _, ids := range [][]ID{{rifle.ID, rifle.ID}, {rifle.ID, 999999}} {
			before = e.Hash()
			if code, _, applied := e.executeWithSelection(1, Order{Kind: "hold", Entities: ids}); code != "not_owner" || applied != 0 || e.Hash() != before {
				t.Fatal("duplicate or missing source bypassed", code)
			}
		}
	})

	t.Run("singleton_paid_build_train_and_cast", func(t *testing.T) {
		e := groupOrderFixture(t, "IR")
		rifle := groupPaidUnit(t, e, "IR.rifle")
		first := groupPaidUnit(t, e, "IR.recon")
		second := groupPaidUnit(t, e, "IR.recon")
		beforeRifle, beforeSecond := groupEntityBytes(t, rifle), groupEntityBytes(t, second)
		credits, spent := e.player(1).Credits, e.player(1).Spent
		order := Order{Kind: "ability", Type: "beacon", Entities: []ID{second.ID, rifle.ID, first.ID}, Position: first.Position}
		groupApplied(t, e, order, []ID{first.ID})
		if e.player(1).Credits != credits-200000 || e.player(1).Spent != spent+200000 || first.Channel != "beacon" || second.Channel != "" {
			t.Fatal("one cast did not debit exactly once")
		}
		groupUnchanged(t, rifle, beforeRifle)
		groupUnchanged(t, second, beforeSecond)
		credits, spent = e.player(1).Credits, e.player(1).Spent
		next := e.state.NextID
		groupApplied(t, e, Order{Kind: "build", Type: "power", Entities: []ID{rifle.ID, 2}, Position: Vec{X: 13000, Y: 13000}}, []ID{2})
		foundation := e.entity(next)
		if foundation == nil || foundation.Type != "power" || foundation.Complete || foundation.Builder != 2 || foundation.Paid != 500000 || e.player(1).Credits != credits-500000 || e.player(1).Spent != spent+500000 {
			t.Fatal("mixed Build did not buy exactly one ordinary foundation")
		}
		groupUnchanged(t, rifle, beforeRifle)
		if code := e.execute(1, Order{Kind: "stop", Entities: []ID{2}}); code != "ok" {
			t.Fatal("ordinary construction pause", code)
		}
		credits = e.player(1).Credits
		groupApplied(t, e, Order{Kind: "resume", Entities: []ID{rifle.ID, 2}, Target: foundation.ID}, []ID{2})
		if foundation.Builder != 2 || len(e.entity(2).Orders) != 1 || e.entity(2).Orders[0].Kind != "build" || e.entity(2).Orders[0].Target != foundation.ID || e.player(1).Credits != credits {
			t.Fatal("mixed Resume lost existing paid foundation or charged twice")
		}
		var barracks *Entity
		for _, v := range e.state.Entities {
			if v.Owner == 1 && e.role(v) == "barracks" {
				barracks = v
				break
			}
		}
		beforeRifle = groupEntityBytes(t, rifle)
		groupApplied(t, e, Order{Kind: "train", Type: "IR.rifle", Entities: []ID{rifle.ID, barracks.ID, 1}}, []ID{barracks.ID})
		if len(barracks.Jobs) != 1 || barracks.Jobs[0].Type != "IR.rifle" {
			t.Fatal("mixed train did not queue one canonical job")
		}
		groupUnchanged(t, rifle, beforeRifle)
		groupApplied(t, e, Order{Kind: "cancel", Entities: []ID{rifle.ID, barracks.ID}, Index: 0}, []ID{barracks.ID})
		if len(barracks.Jobs) != 0 {
			t.Fatal("mixed cancel retained job")
		}
	})

	t.Run("power_on_rally_and_sales_apply_all", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		var buildings []*Entity
		for _, v := range e.state.Entities {
			if v.Owner == 1 && v.Building && e.role(v) == "power" && v.Paid == 500000 {
				buildings = append(buildings, v)
			}
		}
		if len(buildings) != 2 {
			t.Fatal("two paid-value sale fixtures required")
		}
		a, b := buildings[0], buildings[1]
		a.Enabled = false
		beforeRifle := groupEntityBytes(t, rifle)
		want := []ID{a.ID, b.ID}
		slices.Sort(want)
		order := Order{Kind: "power", Index: 1, Entities: []ID{rifle.ID, b.ID, a.ID}}
		advice := previewOne(t, e, order)
		if advice.Code != "ok" || !slices.Equal(advice.EligibleEntities, want) || advice.AppliedCount != 0 {
			t.Fatal("off building was not eligible for Power-on", advice)
		}
		groupApplied(t, e, order, want)
		if !a.Enabled || !b.Enabled {
			t.Fatal("Power-on did not apply to both structures")
		}
		point := Vec{X: 28000, Y: 31000}
		groupApplied(t, e, Order{Kind: "rally", Entities: order.Entities, Position: point}, want)
		if a.Rally != point || b.Rally != point {
			t.Fatal("Rally did not apply explicit point to both structures")
		}
		credits, spent := e.player(1).Credits, e.player(1).Spent
		groupApplied(t, e, Order{Kind: "sell", Entities: order.Entities}, want)
		if a.Channel != "sell" || b.Channel != "sell" || a.ChannelUntil != b.ChannelUntil {
			t.Fatal("Sell did not channel on both structures")
		}
		groupUnchanged(t, rifle, beforeRifle)
		ticks(e, 100)
		if e.entity(a.ID) != nil || e.entity(b.ID) != nil || e.player(1).Credits != credits+500000 || e.player(1).Spent != spent {
			t.Fatal("sales refunded more or less than once each", e.player(1).Credits-credits)
		}
	})

	t.Run("observe_all_idempotent_and_malformed_atomic", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		rifle := groupPaidUnit(t, e, "US.rifle")
		a := groupPaidUnit(t, e, "US.recon")
		b := groupPaidUnit(t, e, "US.recon")
		beforeRifle := groupEntityBytes(t, rifle)
		want := []ID{a.ID, b.ID}
		order := Order{Kind: "ability", Type: "observe", Entities: []ID{b.ID, rifle.ID, a.ID}, Index: 0}
		credits, energy := e.player(1).Credits, e.player(1).Energy
		groupApplied(t, e, order, want)
		if a.Channel != "observe" || b.Channel != "observe" || a.ChannelUntil != e.Tick()+40 || b.ChannelUntil != e.Tick()+40 || e.player(1).Credits != credits || e.player(1).Energy != energy {
			t.Fatal("Observe did not channel both recons for zero cost")
		}
		beforeA, beforeB := groupEntityBytes(t, a), groupEntityBytes(t, b)
		groupApplied(t, e, order, want)
		groupUnchanged(t, a, beforeA)
		groupUnchanged(t, b, beforeB)
		for _, malformed := range []Order{{Kind: "ability", Type: "observe", Entities: order.Entities, Index: 2}, {Kind: "ability", Type: "observe", Entities: order.Entities, Queued: true}} {
			before := e.Hash()
			if code, _, applied := e.executeWithSelection(1, malformed); code != "invalid_toggle" || applied != 0 || e.Hash() != before {
				t.Fatal("malformed group Observe partly mutated", code, applied)
			}
		}
		order.Index = 1
		groupApplied(t, e, order, want)
		if a.Channel != "" || b.Channel != "" {
			t.Fatal("Observe OFF did not reach both sources")
		}
		groupUnchanged(t, rifle, beforeRifle)
	})

	t.Run("paid_committed_shahed_preserves_fixed_task", func(t *testing.T) {
		e := groupOrderFixture(t, "IR")
		recon := groupPaidUnit(t, e, "IR.recon")
		shahed := groupPaidUnit(t, e, "IR.shahed")
		isr := groupPaidUnit(t, e, "IR.isr")
		for i := 0; i < 2400 && e.player(1).Energy < 45000; i++ {
			e.Advance()
		}
		if e.player(1).Energy < 45000 {
			t.Fatal("normal fixture energy did not fund Recall")
		}
		target := e.spawn("power", 2, Vec{X: 44000, Y: 34000}, true, 500000)
		e.updateFog()
		if !e.canSeeEntity(1, target) {
			t.Fatal("commitment target must be currently public")
		}
		issue(t, e, 1, Order{Kind: "attack", Entities: []ID{shahed.ID}, Target: target.ID})
		for i := 0; i < 20 && !shahed.ShahedCommitted && shahed.HP > 0; i++ {
			e.Advance()
		}
		if !shahed.ShahedCommitted || shahed.HP <= 0 {
			t.Fatal("real paid visible-ground Attack did not establish a living commitment")
		}
		beforeShahed := groupEntityBytes(t, shahed)
		groupApplied(t, e, Order{Kind: "hold", Entities: []ID{shahed.ID, recon.ID}}, []ID{recon.ID})
		groupUnchanged(t, shahed, beforeShahed)
		energy := e.player(1).Energy
		groupApplied(t, e, Order{Kind: "ability", Type: "drone_recall", Entities: []ID{shahed.ID, recon.ID, isr.ID}}, []ID{isr.ID})
		if e.player(1).Energy != energy-45000 || len(isr.Orders) != 1 || isr.Orders[0].Kind != "return" {
			t.Fatal("Recall did not charge once for the eligible drone")
		}
		groupUnchanged(t, shahed, beforeShahed)
		groupApplied(t, e, Order{Kind: "repeat_sortie", Entities: []ID{shahed.ID, isr.ID}, Index: 1}, []ID{isr.ID})
		groupUnchanged(t, shahed, beforeShahed)
		before := e.Hash()
		if code, ids, applied := e.executeWithSelection(1, Order{Kind: "return", Entities: []ID{shahed.ID}}); code != "shahed_committed" || len(ids) != 0 || applied != 0 || e.Hash() != before {
			t.Fatal("all-committed selection reset its fixed task", code, ids, applied)
		}
	})

	t.Run("receipts_view_save_and_replay", func(t *testing.T) {
		e := groupOrderFixture(t, "US")
		a := groupPaidUnit(t, e, "US.rifle")
		b := groupPaidUnit(t, e, "US.rifle")
		replay, err := NewReplay(e)
		if err != nil {
			t.Fatal(err)
		}
		order := Order{Kind: "move", Entities: []ID{b.ID, 1, a.ID}, Position: Vec{X: 28000, Y: 27000}}
		request := append([]ID(nil), order.Entities...)
		issue(t, e, 1, order)
		if !slices.Equal(order.Entities, request) {
			t.Fatal("Submit reordered caller's selection")
		}
		result := e.state.Results[0]
		if !slices.Equal(result.EligibleEntities, []ID{a.ID, b.ID}) || result.AppliedCount != 2 {
			t.Fatal("actual recipient receipt", result)
		}
		before := e.Hash()
		view, ok := e.PlayerView(1)
		if !ok || len(view.Results) == 0 {
			t.Fatal("owner result not disclosed", ok)
		}
		view.Results[0].EligibleEntities[0] = 999999
		if e.Hash() != before {
			t.Fatal("owner view result IDs alias simulation")
		}
		save, err := e.Save()
		if err != nil {
			t.Fatal(err)
		}
		twin, err := Restore(e.catalog, save)
		if err != nil || twin.Hash() != e.Hash() {
			t.Fatal("mixed result save", err)
		}
		for i := 0; i < 20; i++ {
			e.Advance()
			twin.Advance()
			if e.Hash() != twin.Hash() {
				t.Fatal("mixed task restore diverged", e.Tick())
			}
		}
		if err := replay.Capture(e, true); err != nil {
			t.Fatal(err)
		}
		ticks(e, 20)
		if err := replay.Capture(e, false); err != nil {
			t.Fatal(err)
		}
		full := *replay
		full.Checkpoints = nil
		for name, r := range map[string]*Replay{"full": &full, "checkpoint": replay} {
			played, err := r.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal(name, "mixed command replay", err)
			}
		}
		if !reflect.DeepEqual(e.state.Log[len(e.state.Log)-1].Orders[0].Entities, []ID{1, a.ID, b.ID}) {
			t.Fatal("logged intention replaced by eligible subset")
		}
	})
}
