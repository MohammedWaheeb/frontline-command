package sim

import "testing"

func TestAIReplacementHaulerReservesOneRealPaidJob(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.AI = "normal"
	p.Credits = 900000
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	beforeSpent := p.Spent
	budget := p.Credits
	order, ok := e.aiReplacementHauler(p, aiOwnView(e, 1), &budget)
	if !ok || order.Type != "US.hauler" || budget != 0 {
		t.Fatal("first collector did not receive its exact ordinary cost", order, ok, budget)
	}
	p.AI = ""
	issue(t, e, 1, order)
	if p.Credits != 0 || p.Spent-beforeSpent != 900000 {
		t.Fatal("replacement was not paid normally", p.Credits, p.Spent-beforeSpent)
	}
	budget = 2000000
	if _, ok := e.aiReplacementHauler(p, aiOwnView(e, 1), &budget); ok || budget != 2000000 {
		t.Fatal("queued collector caused duplicate reservation", budget)
	}
	ticks(e, 1100)
	if e.countRole(1, "hauler", false) != 1 {
		t.Fatal("replacement did not complete exactly once")
	}
}

func TestAIReplacementHaulerDoesNotReserveAgainstInvalidOrExhaustedPlan(t *testing.T) {
	for _, condition := range []string{"disabled", "unfinished", "queued", "existing", "exhausted", "unknown"} {
		t.Run(condition, func(t *testing.T) {
			e := fixture(t)
			baseInfrastructure(e, 1)
			p := e.player(1)
			p.Credits = 500000
			e.recalculate()
			e.updateFog()
			view, _ := e.PlayerView(1)
			e.aiObserve(p, view)
			var supply *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && e.role(v) == "supply" {
					supply = v
					break
				}
			}
			switch condition {
			case "disabled":
				supply.Enabled = false
			case "unfinished":
				supply.Complete = false
			case "queued":
				supply.Jobs = []Job{{Type: "US.hauler", Required: 1000}}
			case "existing":
				e.spawn("US.hauler", 1, Vec{X: 20000, Y: 20000}, true, 0)
			case "exhausted":
				for i := range p.AIFields {
					p.AIFields[i].Remaining = 0
				}
			case "unknown":
				p.AIFields = nil
			}
			e.updateFog()
			budget := int64(500000)
			if o, ok := e.aiReplacementHauler(p, aiOwnView(e, 1), &budget); ok || budget != 500000 {
				t.Fatal("invalid plan froze credits", condition, o, budget)
			}
		})
	}
}

func TestAIReplacementHaulerSavesTrickleBeforeOptionalInfrastructure(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	e.spawn("power", 1, Vec{X: 30000, Y: 8000}, true, 0)
	p := e.player(1)
	p.AI = "normal"
	p.Credits = 500000
	// Optional generic research and more production are available, but no current
	// or queued collector exists. No hidden state is needed to identify this gap.
	e.recalculate()
	e.updateFog()
	e.state.Tick = 40
	e.updateAI()
	for _, batch := range e.state.Pending {
		for _, o := range batch.Orders {
			if o.Kind == "build" || o.Kind == "train" || o.Kind == "research" {
				t.Fatal("spent recovery savings prematurely", o)
			}
		}
	}
	p.Credits = 900000
	e.state.Tick = 80
	e.updateAI()
	found := 0
	for _, batch := range e.state.Pending {
		for _, o := range batch.Orders {
			if o.Kind == "train" && o.Type == "US.hauler" {
				found++
			}
			if o.Kind == "research" {
				t.Fatal("research consumed replacement budget")
			}
		}
	}
	if found != 1 {
		t.Fatal("expected one affordable collector order", found)
	}
}

func TestAIReplacementHaulerDoesNotDelayEssentialPowerRecovery(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.AI = "normal"
	p.Credits = 500000
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "power" {
			v.HP = 0
		}
	}
	e.recalculate()
	e.updateFog()
	e.state.Tick = 40
	e.updateAI()
	power := false
	for _, batch := range e.state.Pending {
		for _, o := range batch.Orders {
			if o.Kind == "build" && o.Type == "power" {
				power = true
			}
			if o.Kind == "train" && o.Type == "US.hauler" {
				t.Fatal("collector displaced essential power")
			}
		}
	}
	if !power {
		t.Fatal("essential power recovery did not retain priority")
	}
}

func TestAIReplacementHaulerUsesObservedStockNotHiddenLiveStock(t *testing.T) {
	a, b := fixture(t), fixture(t)
	for _, e := range []*Engine{a, b} {
		baseInfrastructure(e, 1)
		e.player(1).Credits = 900000
		// The same last observed field record is retained while that field is fogged.
		e.player(1).AIFields = []FieldView{{ID: 2, Position: Vec{X: 49000, Y: 56000}, Remaining: 36000000}}
		e.recalculate()
		e.updateFog()
		if e.canSee(1, e.state.Fields[1].Position) {
			t.Fatal("remembered field must now be fogged")
		}
	}
	b.state.Fields[1].Remaining = 0
	b.player(2).Credits = 1
	for i := 0; i < 8; i++ {
		b.spawn("IR.hauler", 2, Vec{X: 50000 + int32(i)*1000, Y: 45000}, true, 0)
	}
	ba, bb := int64(900000), int64(900000)
	oa, oka := a.aiReplacementHauler(a.player(1), aiOwnView(a, 1), &ba)
	ob, okb := b.aiReplacementHauler(b.player(1), aiOwnView(b, 1), &bb)
	if !oka || !okb || oa.Kind != ob.Kind || oa.Type != ob.Type || oa.Entities[0] != ob.Entities[0] || ba != bb {
		t.Fatal("unseen stock/haulers affected recovery", oa, ob, ba, bb)
	}
}
