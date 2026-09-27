package sim

import (
	"reflect"
	"slices"
	"testing"
)

func previewOne(t *testing.T, e *Engine, o Order) OrderResult {
	t.Helper()
	results, err := e.PreviewOrders(1, []Order{o})
	if err != nil || len(results) != 1 {
		t.Fatal(results, err)
	}
	return results[0]
}
func TestAffordancesAreOwnedBoundedStableAndDetached(t *testing.T) {
	e := fixture(t)
	rig := e.entity(2)
	rifle := e.spawn("US.rifle", 1, Vec{X: 16000, Y: 9000}, true, 0)
	engineer := e.spawn("US.engineer", 1, Vec{X: 16000, Y: 10000}, true, 0)
	e.recalculate()
	e.updateFog()
	before := e.Hash()
	got, err := e.CommandAffordances(1, []ID{engineer.ID, rig.ID, rifle.ID})
	if err != nil {
		t.Fatal(err)
	}
	if got.Entities[0].ID != rig.ID || !slices.Contains(got.Entities[0].Commands, "build") || !slices.Contains(got.Entities[0].Builds, "power") {
		t.Fatal(got)
	}
	for _, a := range got.Entities {
		if a.ID == rifle.ID && (slices.Contains(a.Commands, "repair") || slices.Contains(a.Commands, "capture")) {
			t.Fatal("rifle offered engineer command")
		}
		if a.ID == engineer.ID && (!slices.Contains(a.Commands, "capture") || !slices.Contains(a.Commands, "repair")) {
			t.Fatal(a)
		}
	}
	got.Entities[0].Builds[0] = "mutated"
	if before != e.Hash() {
		t.Fatal("affordances changed simulation")
	}
	for _, ids := range [][]ID{{4}, {999999}, {2, 2}, make([]ID, 65)} {
		if _, err := e.CommandAffordances(1, ids); err == nil {
			t.Fatal("invalid selection accepted", ids)
		}
	}
	rifle.Container = e.entity(1).ID
	got, err = e.CommandAffordances(1, []ID{rifle.ID})
	if err != nil || len(got.Entities[0].Commands) != 0 {
		t.Fatal("embarked unit controllable", got, err)
	}
}
func TestAdvicePlacementCannotDiscoverHiddenBlocker(t *testing.T) {
	e := fixture(t)
	hidden := e.spawn("IR.elite", 2, Vec{X: 13000, Y: 13000}, true, 0)
	hidden.Concealed = true
	e.recalculate()
	e.updateFog()
	if e.canSeeEntity(1, hidden) {
		t.Fatal("fixture blocker visible")
	}
	order := Order{Kind: "build", Entities: []ID{2}, Type: "power", Position: hidden.Position}
	blocked := previewOne(t, e, order)
	before := e.Hash()
	if blocked.Code != "indeterminate" || !blocked.Accepted || e.Hash() != before {
		t.Fatal(blocked)
	}
	hidden.Position = Vec{X: 50000, Y: 50000}
	e.updateFog()
	clear := previewOne(t, e, order)
	if !reflect.DeepEqual(blocked, clear) {
		t.Fatal("hidden placement oracle", blocked, clear)
	}
	// Unknown and real hidden IDs must also be indistinguishable.
	rifle := e.spawn("US.rifle", 1, Vec{X: 15000, Y: 12000}, true, 0)
	e.recalculate()
	e.updateFog()
	attack := Order{Kind: "attack", Entities: []ID{rifle.ID}, Target: hidden.ID}
	real := previewOne(t, e, attack)
	attack.Target = 999999
	unknown := previewOne(t, e, attack)
	if !reflect.DeepEqual(real, unknown) || real.Code != "target_not_visible" {
		t.Fatal(real, unknown)
	}
}
func TestAdviceVisibleContextRejectsImpossiblePriorityChoices(t *testing.T) {
	e := fixture(t)
	engineer := e.spawn("US.engineer", 1, Vec{X: 14000, Y: 11000}, true, 0)
	rifle := e.spawn("US.rifle", 1, Vec{X: 14000, Y: 10000}, true, 0)
	target := e.spawn("power", 2, Vec{X: 16000, Y: 10000}, true, 0)
	e.recalculate()
	e.updateFog()
	if !e.canSeeEntity(1, target) {
		t.Fatal("fixture target hidden")
	}
	if result := previewOne(t, e, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID}); result.Accepted || result.Code != "invalid_capture_target" {
		t.Fatal(result)
	}
	if result := previewOne(t, e, Order{Kind: "board", Entities: []ID{rifle.ID}, Target: target.ID}); result.Accepted || result.Code != "invalid_transport" {
		t.Fatal(result)
	}
	if result := previewOne(t, e, Order{Kind: "attack", Entities: []ID{rifle.ID}, Target: target.ID}); !result.Accepted || result.Code != "indeterminate" {
		t.Fatal(result)
	}
	target.HP = target.MaxHP / 5
	capture := Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID}
	first := previewOne(t, e, capture)
	target.ResistanceUntil = 1000
	target.Jobs = []Job{{Type: "IR.rifle", Required: 100}}
	target.Paid = 123000
	target.HP++
	second := previewOne(t, e, capture)
	if first.Code != "indeterminate" || !reflect.DeepEqual(first, second) {
		t.Fatal("enemy private information leaked", first, second)
	}
}
func TestAdviceOwnedSequentialChecksAndDeferredDependencies(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	e.recalculate()
	e.updateFog()
	var producer *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "barracks" {
			producer = v
			break
		}
	}
	batch := make([]Order, 7)
	for i := range batch {
		batch[i] = Order{Kind: "train", Entities: []ID{producer.ID}, Type: "US.rifle"}
	}
	before := e.Hash()
	results, err := e.PreviewOrders(1, batch)
	if err != nil {
		t.Fatal(err)
	}
	if results[5].Code != "ok" || results[6].Code != "queue_full" || e.Hash() != before {
		t.Fatal(results)
	}
	results, err = e.PreviewOrders(1, []Order{{Kind: "build", Entities: []ID{2}, Type: "power", Position: Vec{X: 13000, Y: 13000}}, {Kind: "train", Entities: []ID{producer.ID}, Type: "US.rifle"}})
	if err != nil || results[0].Code != "indeterminate" || results[1].Code != "indeterminate" || e.Hash() != before {
		t.Fatal(results, err)
	}
}
func TestAdviceTransferDoesNotProbePassengerExitGeometry(t *testing.T) {
	e := fixture(t)
	e.player(1).Faction = "SY"
	e.entity(2).Type = "SY.rig"
	house := e.spawn("SY.safehouse", 1, Vec{X: 18000, Y: 18000}, true, 0)
	other := e.spawn("SY.safehouse", 1, Vec{X: 24000, Y: 18000}, true, 0)
	e.recalculate()
	e.updateFog()
	result := previewOne(t, e, Order{Kind: "ability", Entities: []ID{house.ID}, Type: "transfer", Target: other.ID})
	if result.Code != "indeterminate" {
		t.Fatal(result)
	}
}

func TestAdviceSnapshotOmitsCommandHistoryWithoutMutatingIt(t *testing.T) {
	e := fixture(t)
	for range 10000 {
		e.state.Log = append(e.state.Log, Scheduled{Tick: 0, Player: 1, Sequence: 1, Orders: []Order{{Kind: "stop", Entities: []ID{2}}}})
	}
	e.state.LogOrders = 10000
	if err := e.Submit(1, 1, []Order{{Kind: "stop", Entities: []ID{2}}}); err != nil {
		t.Fatal(err)
	}
	before := e.Hash()
	full, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	compact, err := e.SaveForAdvice()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, compact)
	if err != nil {
		t.Fatal(err)
	}
	if e.Hash() != before || len(compact)*2 >= len(full) || len(restored.state.Log) != 0 || len(restored.state.Pending) != 0 {
		t.Fatal("advice capture retained history or changed match")
	}
	results, err := PreviewSavedOrders(e.catalog, compact, 1, []Order{{Kind: "hold", Entities: []ID{2}}})
	if err != nil || results[0].Code != "ok" {
		t.Fatal(results, err)
	}
}

func TestCandidateProbesAreIndependentAndFinalBatchIsSequential(t *testing.T) {
	e := fixture(t)
	second := e.spawn("US.rig", 1, Vec{X: 13000, Y: 12000}, true, 0)
	foundation := e.spawn("power", 1, Vec{X: 15000, Y: 15000}, false, 500000)
	e.recalculate()
	e.updateFog()
	orders := []Order{{Kind: "resume", Entities: []ID{2}, Target: foundation.ID}, {Kind: "resume", Entities: []ID{second.ID}, Target: foundation.ID}}
	before := e.Hash()
	results, err := e.PreviewCandidates(1, orders)
	if err != nil || len(results) != 2 || results[0].Code != "ok" || results[1].Code != "ok" || e.Hash() != before {
		t.Fatal("alternatives interfered", results, err)
	}
	results, err = e.PreviewOrders(1, orders)
	if err != nil || results[0].Code != "ok" || results[1].Code != "builder_assigned" || e.Hash() != before {
		t.Fatal("final batch ignored shared assignment", results, err)
	}
	if _, err = e.PreviewCandidates(1, []Order{{Kind: "ability", Entities: []ID{2}, Type: "recon_sweep"}}); err == nil {
		t.Fatal("spending/ability candidate accepted")
	}
}
func TestCandidateIndeterminateDoesNotSuppressLaterOwnedRejection(t *testing.T) {
	e := fixture(t)
	rifle := e.spawn("US.rifle", 1, Vec{X: 15000, Y: 10000}, true, 0)
	engineer := e.spawn("US.engineer", 1, Vec{X: 15000, Y: 11000}, true, 0)
	target := e.spawn("IR.rifle", 2, Vec{X: 16000, Y: 10000}, true, 0)
	e.recalculate()
	e.updateFog()
	orders := []Order{{Kind: "attack", Entities: []ID{rifle.ID}, Target: target.ID}, {Kind: "repair", Entities: []ID{engineer.ID}, Target: rifle.ID}, {Kind: "guard", Entities: []ID{engineer.ID}, Target: rifle.ID}}
	results, err := e.PreviewCandidates(1, orders)
	if err != nil || results[0].Code != "indeterminate" || results[1].Code != "invalid_repair_target" || results[2].Code != "ok" {
		t.Fatal(results, err)
	}
	rifle.DisabledUntil = e.Tick() + 10
	results, err = e.PreviewCandidates(1, orders[:1])
	if err != nil || results[0].Code != "unit_disabled" {
		t.Fatal("owned source disability deferred", results, err)
	}
}
