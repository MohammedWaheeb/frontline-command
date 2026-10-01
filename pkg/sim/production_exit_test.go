package sim

import "testing"

// The original car2326 producer geometry, including the idle structures and
// currently working rig. Synthetic controls are separate from original saves.
func productionPocketFixture(t *testing.T) (*Engine, *Entity) {
	t.Helper()
	e := fixture(t)
	e.spawn("hq", 1, Vec{X: 25500, Y: 25500}, true, 0)
	e.spawn("US.rig", 1, Vec{X: 28565, Y: 18501}, true, 0)
	e.spawn("supply", 1, Vec{X: 31500, Y: 22500}, true, 0)
	factory := e.spawn("factory", 1, Vec{X: 25500, Y: 21500}, true, 0)
	e.spawn("radar", 1, Vec{X: 29500, Y: 25500}, true, 0)
	e.spawn("depot", 1, Vec{X: 21500, Y: 21500}, true, 0)
	e.spawn("tech", 1, Vec{X: 31500, Y: 19500}, false, 0)
	return e, factory
}

func TestProductionExitPrefersActualSweptNorthAlternative(t *testing.T) {
	e, factory := productionPocketFixture(t)
	before := e.Hash()
	old, ok := e.exitPosition(factory, "US.car", 0, 6000)
	if !ok || old != (Vec{X: 28400, Y: 21500}) {
		t.Fatal("original nearest-clear sealed pocket not reproduced", old)
	}
	got, ok := e.productionExitPosition(factory, "US.car", 6000)
	if !ok || got != (Vec{X: 25500, Y: 18600}) || e.Hash() != before {
		t.Fatal("north alternative or read-only selection changed", got)
	}
	probe := Entity{ID: e.state.NextID, Type: "US.car", Position: got}
	if !e.navigationBridgeClear(&probe, Vec{X: 25500, Y: 17600}, true) {
		t.Fatal("preferred original north continuation is not physically swept-clear")
	}
}

func TestProductionExitRetainsFirstClearWhenNoOutwardAlternative(t *testing.T) {
	e, factory := productionPocketFixture(t)
	e.spawn("US.hauler", 1, Vec{X: 25500, Y: 18100}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 22600, Y: 18600}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 22600, Y: 24400}, true, 0)
	before := e.Hash()
	want, wantOK := e.exitPosition(factory, "US.car", 0, 900)
	got, gotOK := e.productionExitPosition(factory, "US.car", 900)
	if !wantOK || want != (Vec{X: 28400, Y: 21500}) || gotOK != wantOK || got != want || e.Hash() != before {
		t.Fatal("local preference removed original first-clear fallback", want, wantOK, got, gotOK)
	}
	e.spawn("US.hauler", 1, want, true, 0)
	before = e.Hash()
	want, wantOK = e.exitPosition(factory, "US.car", 0, 900)
	got, gotOK = e.productionExitPosition(factory, "US.car", 900)
	if wantOK || gotOK || got != want || e.Hash() != before {
		t.Fatal("truly occupied output lost original blocked admission", want, wantOK, got, gotOK)
	}
}

func TestProductionExitPreservesOpenAndAirSelection(t *testing.T) {
	for _, typ := range []string{"US.car", "US.fighter"} {
		e := fixture(t)
		factory := e.spawn("factory", 1, Vec{X: 25500, Y: 21500}, true, 0)
		before := e.Hash()
		want, wantOK := e.exitPosition(factory, typ, 0, 6000)
		got, gotOK := e.productionExitPosition(factory, typ, 6000)
		if !wantOK || gotOK != wantOK || got != want || e.Hash() != before {
			t.Fatal("already clear output or separate air behavior changed", typ, want, got)
		}
	}
}

