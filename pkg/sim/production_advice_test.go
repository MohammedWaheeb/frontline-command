package sim

import (
	"reflect"
	"testing"
)

func productionOption(t *testing.T, e *Engine, actor ID, kind, typ string) ProductionStatus {
	t.Helper()
	before := e.Hash()
	advice, err := e.CommandAffordances(1, []ID{actor})
	if err != nil || before != e.Hash() {
		t.Fatal("menu advice mutated live state", err)
	}
	for _, status := range advice.Entities[0].Production {
		if status.Kind == kind && status.Type == typ {
			return status
		}
	}
	t.Fatalf("missing production status %s/%s", kind, typ)
	return ProductionStatus{}
}

func TestProductionAdviceIndependentOptionsAndUnpaidQueue(t *testing.T) {
	e := fixture(t)
	if got := productionOption(t, e, 2, "build", "power"); got.Code != "indeterminate" {
		t.Fatal(got)
	}
	if got := productionOption(t, e, 2, "build", "US.airfield"); got.Code != "missing_prerequisite" {
		t.Fatal(got)
	}
	e.player(1).Credits = 0
	if got := productionOption(t, e, 2, "build", "power"); got.Code != "insufficient_credits" {
		t.Fatal(got)
	}
	if got := productionOption(t, e, 1, "train", "US.rig"); got.Code != "ok" || got.WaitsFor != "insufficient_credits" {
		t.Fatal("unpaid queue admission was incorrectly disabled", got)
	}
	issue(t, e, 1, Order{Kind: "train", Type: "US.rig", Entities: []ID{1}})
	if len(e.entity(1).Jobs) != 1 || e.entity(1).Jobs[0].Started {
		t.Fatal("unpaid queue did not match menu advice")
	}
	if got := productionOption(t, e, 1, "train", "US.rig"); got.Code != "ok" || got.WaitsFor != "queued" {
		t.Fatal(got)
	}
	for range 5 {
		issue(t, e, 1, Order{Kind: "train", Type: "US.rig", Entities: []ID{1}})
	}
	if got := productionOption(t, e, 1, "train", "US.rig"); got.Code != "queue_full" {
		t.Fatal(got)
	}
}

func TestProductionAdviceHasNoGeometryOrEnemyInformation(t *testing.T) {
	e := fixture(t)
	one, _ := e.CommandAffordances(1, []ID{2, 1})
	enemy := e.spawn("IR.tank", 2, Vec{X: 13000, Y: 13000}, true, 0)
	enemy.Concealed = true
	e.player(2).Credits = 999000000
	e.updateFog()
	two, _ := e.CommandAffordances(1, []ID{2, 1})
	if !reflect.DeepEqual(one, two) {
		t.Fatal("menu advice exposed enemy state/occupancy")
	}
}

func TestProductionAdviceCapsDisabledAndResearchMatchExecutor(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	for i := range 3 {
		e.spawn("US.rig", 1, Vec{X: int32(16000 + i*2000), Y: 15000}, true, 0)
	}
	e.recalculate()
	if got := productionOption(t, e, 1, "train", "US.rig"); got.Code != "ok" || got.WaitsFor != "rig_limit" {
		t.Fatal(got)
	}
	e.entity(1).DisabledUntil = 100
	if got := productionOption(t, e, 1, "train", "US.rig"); got.Code != "producer_disabled" {
		t.Fatal(got)
	}
	var tech *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "tech" {
			tech = v
		}
	}
	advice, _ := e.CommandAffordances(1, []ID{tech.ID})
	for _, option := range advice.Entities[0].Production {
		if option.Kind != "research" {
			continue
		}
		if option.Code != "ok" {
			t.Fatal(option)
		}
		issue(t, e, 1, Order{Kind: "research", Type: option.Type, Entities: []ID{tech.ID}})
		if got := productionOption(t, e, tech.ID, "research", option.Type); got.Code != "already_queued" {
			t.Fatal(got)
		}
		return
	}
	t.Fatal("fixture has no research")
}
