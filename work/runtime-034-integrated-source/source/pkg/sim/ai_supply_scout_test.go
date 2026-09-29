package sim

import (
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAISupplyScoutPreservesWorkAndBoundsFailedRoutes(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	rig := e.entity(2)
	working := e.spawn("US.hauler", 1, Vec{X: 12000, Y: 12000}, true, 0)
	working.Orders = []Order{{Kind: "gather"}}
	working.State = "gathering"
	working.Cargo = 200000
	idle := e.spawn("US.hauler", 1, Vec{X: 14000, Y: 12000}, true, 0)
	idle.Orders = []Order{{Kind: "gather"}}
	idle.State = "no_known_supplies"
	e.updateFog()
	e.state.Tick = 240
	planned := []Order{{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: Vec{X: 8000, Y: 15000}}}
	order, ok := e.aiSupplyScoutOrder(p, aiOwnView(e, 1), planned, 40)
	if !ok || len(order.Entities) != 1 || order.Entities[0] != idle.ID {
		t.Fatal("stole active cargo or builder task", order, ok)
	}
	first := order.Position
	idle.Orders = []Order{order}
	idle.Blocked = true
	idle.LastProgress = 0
	attempts := 0
	for tick := Tick(280); tick <= 1440; tick += 40 {
		e.state.Tick = tick
		// Navigation refreshes LastProgress on each failed route attempt;
		// stationary time, not that retry clock, bounds recovery.
		idle.LastProgress = tick
		next, ok := e.aiSupplyScoutOrder(p, aiOwnView(e, 1), planned, 40)
		if !ok {
			continue
		}
		attempts++
		if next.Entities[0] != idle.ID || next.Position == idle.Orders[0].Position {
			t.Fatal("blocked worker retried the same goal", next)
		}
		idle.Orders = []Order{next}
	}
	if attempts != 5 {
		t.Fatal("expected one retry per twelve seconds", attempts)
	}
	if idle.Orders[0].Position == first && p.AIScout == 1 {
		t.Fatal("failed route did not rotate")
	}
	idle.Blocked = false
	idle.Orders = []Order{{Kind: "gather"}}
	idle.State = "loading"
	idle.Cargo = 0
	e.state.Tick = 1680
	if order, ok := e.aiSupplyScoutOrder(p, aiOwnView(e, 1), planned, 40); ok {
		t.Fatal("stole productive gather", order)
	}
}

func TestAISupplyScoutOnlyUsesOwnedViewAndPublicExploration(t *testing.T) {
	makeEngine := func(t *testing.T, alterHidden bool) *Engine {
		e := fixture(t)
		e.player(1).AI = "normal"
		worker := e.spawn("US.hauler", 1, Vec{X: 14000, Y: 12000}, true, 0)
		worker.State = "no_known_supplies"
		worker.Orders = []Order{{Kind: "gather"}}
		// Original nearby supplies remain outside the inputs by moving both variants'
		// fields beyond starting vision, then varying their private remaining stock.
		for i := range e.state.Fields {
			e.state.Fields[i].Position = Vec{X: 54000, Y: 12000 + int32(i)*10000}
		}
		hidden := e.spawn("IR.tank", 2, Vec{X: 52000, Y: 10000}, true, 0)
		if alterHidden {
			e.state.Fields[0].Position = Vec{X: 46000, Y: 54000}
			e.state.Fields[0].Remaining = 1
			hidden.Position = Vec{X: 58000, Y: 20000}
			e.player(2).Credits = 123000
		}
		e.updateFog()
		e.state.Tick = 240
		view, _ := e.PlayerView(1)
		e.aiObserve(e.player(1), view)
		if len(e.player(1).AIFields) != 0 || e.canSeeEntity(1, hidden) {
			t.Fatal("hidden-control setup invalid")
		}
		return e
	}
	a, b := makeEngine(t, false), makeEngine(t, true)
	oa, oka := a.aiSupplyScoutOrder(a.player(1), aiOwnView(a, 1), nil, 40)
	ob, okb := b.aiSupplyScoutOrder(b.player(1), aiOwnView(b, 1), nil, 40)
	if !oka || !okb || !reflect.DeepEqual(oa, ob) {
		t.Fatal("hidden resources/enemy state changed scouting", oa, ob)
	}
	// Removing workers from the owned authorized input forbids live-state lookup.
	if _, ok := a.aiSupplyScoutOrder(a.player(1), nil, nil, 40); ok {
		t.Fatal("selected actor absent from authorized owned view")
	}
}

func TestAISupplySightPriorityBuysScoutBeforeOptionalSpending(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	p.Credits = 2200000
	for i := range e.state.Fields {
		e.state.Fields[i].Position = Vec{X: 54000, Y: 12000 + int32(i)*10000}
	}
	for i, typ := range []string{"power", "supply", "barracks"} {
		e.spawn(typ, 1, Vec{X: 7000 + int32(i)*5000, Y: 18000}, true, 0)
	}
	e.spawn("US.hauler", 1, Vec{X: 17000, Y: 21000}, true, 0)
	e.recalculate()
	e.updateFog()
	e.state.Tick = 40
	e.updateAI()
	var scout *Order
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			if order.Kind == "train" && order.Type == "US.recon" {
				copy := order
				scout = &copy
			}
			if order.Kind == "build" && order.Type == "factory" || order.Kind == "train" && order.Type == "US.hauler" {
				t.Fatal("spent sight-acquisition budget on optional opening", order)
			}
		}
	}
	if scout == nil {
		t.Fatal("ordinary paid recon was not planned")
	}
	p.AI = ""
	e.Advance()
	if p.Spent <= 0 || p.Credits >= 2200000 {
		t.Fatal("recon did not pay normal production cost")
	}
}

func TestAIFoggedSupplyOpeningOnAuthoredMaps(t *testing.T) {
	if testing.Short() || os.Getenv("FRONTLINE_AUTHORED_AI") != "1" {
		t.Skip("opt-in original authored opening regressions")
	}
	for _, spec := range []struct{ mapID, faction string }{{"relay-heights", "SY"}, {"relay-heights", "IR"}, {"dry-river", "US"}, {"dry-river", "SY"}} {
		t.Run(spec.mapID+"-"+spec.faction, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", spec.mapID+".json"))
			if err != nil {
				t.Fatal(err)
			}
			m, err := content.DecodeMap(data)
			if err != nil {
				t.Fatal(err)
			}
			e, err := New(content.MustBase(), Config{Map: m, Seed: 28002, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Name: "Opening bot", Faction: spec.faction, Team: 1, AI: "normal"}, {ID: 2, Name: "Inactive opponent", Faction: "IR", Team: 2}}})
			if err != nil {
				t.Fatal(err)
			}
			if len(e.player(1).AIFields) != 0 {
				t.Fatal("expected undiscovered supply opening")
			}
			ticks(e, 7200)
			p := e.player(1)
			if p.Income <= 0 || p.Supply <= 0 {
				t.Fatalf("opening still stranded: income%d spent%d supply%d", p.Income, p.Spent, p.Supply)
			}
			t.Logf("original %s/%s opening income=%d spent=%d supply=%d", spec.mapID, spec.faction, p.Income, p.Spent, p.Supply)
		})
	}
}

func TestAISupplyWorkerUsesNormalMoveThenGather(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	p.Credits = 0
	for i := range e.state.Fields {
		e.state.Fields[i].Position = Vec{X: 26000 + int32(i)*28000, Y: 8000}
	}
	e.spawn("supply", 1, Vec{X: 16000, Y: 15000}, true, 0)
	worker := e.spawn("US.hauler", 1, Vec{X: 19000, Y: 16000}, true, 0)
	worker.Orders = []Order{{Kind: "gather"}}
	worker.State = "no_known_supplies"
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	if len(view.Fields) != 0 {
		t.Fatal("recovery must begin without resource sight")
	}
	moves, gathers := 0, 0
	delivered := false
	for i := 0; i < 6000 && !delivered; i++ {
		e.Advance()
		for _, event := range e.state.Events {
			if event.Kind == "cargo_delivered" && event.Entity == worker.ID {
				delivered = true
			}
		}
		for _, result := range e.state.Results {
			if !result.Accepted {
				continue
			}
			for _, batch := range e.state.Log {
				if batch.Player != 1 || batch.Sequence != result.Sequence {
					continue
				}
				o := batch.Orders[result.Index]
				if len(o.Entities) > 0 && o.Entities[0] == worker.ID {
					if o.Kind == "move" {
						moves++
					}
					if o.Kind == "gather" {
						gathers++
					}
				}
			}
		}
	}
	if moves == 0 || gathers == 0 || !delivered || p.Income == 0 {
		t.Fatalf("cash-starved worker did not scout and resume actual delivery: moves%d gathers%d income%d state%s", moves, gathers, p.Income, worker.State)
	}
}
