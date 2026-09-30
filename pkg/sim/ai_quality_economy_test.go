package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiQualityEconomyPlan(e *Engine) []Order {
	e.recalculate()
	e.updateFog()
	e.state.Tick = 40
	e.updateAI()
	orders := []Order{}
	for _, batch := range e.state.Pending {
		orders = append(orders, batch.Orders...)
	}
	return orders
}

func TestAIQualityEconomyExistingBuilderPreservesHQRecoveryCredits(t *testing.T) {
	for _, condition := range []string{"moving", "queued"} {
		t.Run(condition, func(t *testing.T) {
			e := fixture(t)
			baseInfrastructure(e, 1)
			p := e.player(1)
			p.AI, p.Credits = "normal", 3500000
			e.entity(1).HP = 0
			if condition == "moving" {
				e.assign(e.entity(2), Order{Kind: "move", Position: Vec{X: 18000, Y: 14000}})
			} else {
				e.entity(2).HP = 0
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.role(v) == "factory" {
						v.Jobs = []Job{{Type: "US.rig", Emergency: true, Required: 1200}}
					}
				}
				e.spawn("factory", 1, Vec{X: 28000, Y: 12000}, true, 0)
			}
			for _, order := range aiQualityEconomyPlan(e) {
				if order.Kind == "train" && order.Type == "US.rig" {
					t.Fatalf("unnecessary emergency rig competes with HQ recovery: %s %+v", condition, order)
				}
			}
		})
	}
}

func TestAIQualityEconomyHQFoundationStillAllowsEmergencyBuilder(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.AI, p.Credits = "normal", 1200000
	e.entity(1).HP, e.entity(2).HP = 0, 0
	foundation := e.spawn("hq", 1, Vec{X: 12000, Y: 12000}, false, 3500000)
	foundation.Builder = 2
	var recovery Order
	for _, order := range aiQualityEconomyPlan(e) {
		if order.Kind == "train" && order.Type == "US.rig" {
			recovery = order
		}
	}
	if recovery.Kind == "" {
		t.Fatal("paid HQ foundation stranded without an ordinary emergency builder")
	}
	p.AI = ""
	e.Advance()
	producer := e.entity(recovery.Entities[0])
	if len(producer.Jobs) != 1 || !producer.Jobs[0].Emergency || !producer.Jobs[0].Started || p.Credits != 0 || p.Spent != 1200000 {
		t.Fatal("recovery must use the ordinary paid emergency job", producer.Jobs, p.Credits, p.Spent)
	}
}

func TestAIQualityEconomyResumeFoundationWhoseBuilderChangedTask(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	foundation := e.spawn("power", 1, Vec{X: 8000, Y: 14000}, false, 500000)
	foundation.Builder = 2
	e.assign(e.entity(2), Order{Kind: "move", Position: Vec{X: 20000, Y: 14000}})
	idle := e.spawn("US.rig", 1, Vec{X: 6000, Y: 16000}, true, 800000)
	found := false
	for _, order := range aiQualityEconomyPlan(e) {
		if order.Kind == "resume" && order.Target == foundation.ID && order.Entities[0] == idle.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("unrelated builder movement prevented recovery of the paid foundation")
	}
	p.AI = ""
	spent := p.Spent
	ticks(e, 700)
	if !foundation.Complete || foundation.Builder != idle.ID || p.Spent != spent {
		t.Fatal("ordinary resume must finish the same paid foundation without another purchase", foundation.Complete, foundation.Builder, p.Spent-spent)
	}
}

func TestAIQualityEconomyStructureCapDoesNotFreezeProduction(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Credits = "normal", 2000000
	for i, typ := range []string{"power", "supply", "barracks", "factory"} {
		v := e.spawn(typ, 1, Vec{X: 4000 + int32(i)*6000, Y: 20000}, true, 0)
		if typ == "supply" {
			v.IncludedHauler = true
		}
	}
	for i := 0; i < 55; i++ {
		e.spawn("outpost", 1, Vec{X: 26000 + int32(i%11)*3000, Y: 24000 + int32(i/11)*3000}, true, 0)
	}
	e.spawn("US.hauler", 1, Vec{X: 14000, Y: 16000}, true, 900000)
	trained := false
	for _, order := range aiQualityEconomyPlan(e) {
		if order.Kind == "build" {
			t.Fatalf("construction at the ordinary structure cap would be rejected: %+v", order)
		}
		if order.Kind == "train" {
			trained = true
		}
	}
	if !trained {
		t.Fatal("impossible construction plan consumed the production budget")
	}
	p.AI = ""
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("cap-aware planning must still issue legal ordinary orders", result)
		}
	}
}

func TestAIQualityEconomyExpansionCountsIncludedHaulerReservation(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	supply := e.spawn("supply", 1, Vec{X: 14000, Y: 12000}, true, 1800000)
	supply.IncludedHauler = true
	e.spawn("supply", 1, Vec{X: 14000, Y: 22000}, false, 1800000)
	for i := 0; i < 7; i++ {
		e.spawn("US.hauler", 1, Vec{X: 16000 + int32(i)*1500, Y: 12000}, true, 900000)
	}
	p.AIFields = []FieldView{{ID: 1, Position: Vec{X: 14000, Y: 8000}, Remaining: 5000000}, {ID: 7, Position: Vec{X: 35000, Y: 24000}, Remaining: 24000000}}
	if point, ok := e.aiExpansion(p, aiOwnView(e, 1)); ok {
		t.Fatal("expansion cannot buy its included collector at the ordinary hauler cap", point)
	}
}

func TestAIQualityEconomyPausedUnpaidJobDoesNotBlockPrerequisiteRecovery(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.AI, p.Credits = "normal", 600000
	for _, v := range e.state.Entities {
		if v.Owner != 1 {
			continue
		}
		if e.role(v) == "barracks" {
			v.HP = 0
		}
		if e.role(v) == "factory" {
			v.Jobs = []Job{{Type: "US.tank", Required: 1000}}
		}
	}
	e.spawn("US.hauler", 1, Vec{X: 14000, Y: 16000}, true, 900000)
	found := false
	for _, order := range aiQualityEconomyPlan(e) {
		if order.Kind == "build" && order.Type == "barracks" {
			found = true
		}
	}
	if !found {
		t.Fatal("unpaid job that cannot start froze the credits needed to restore its prerequisite")
	}
	p.AI = ""
	e.Advance()
	if p.Credits != 0 || p.Spent != 600000 {
		t.Fatal("prerequisite recovery must use the ordinary paid building order", p.Credits, p.Spent)
	}
}

func TestAIQualityEconomyPlansIgnoreHiddenEnemyChanges(t *testing.T) {
	a, b := fixture(t), fixture(t)
	for _, e := range []*Engine{a, b} {
		baseInfrastructure(e, 1)
		p := e.player(1)
		p.AI, p.Credits = "normal", 600000
		p.AIFields = []FieldView{{ID: 2, Position: Vec{X: 49000, Y: 56000}, Remaining: 36000000}}
		for _, v := range e.state.Entities {
			if v.Owner != 1 {
				continue
			}
			if e.role(v) == "barracks" {
				v.HP = 0
			}
			if e.role(v) == "factory" {
				v.Jobs = []Job{{Type: "US.tank", Required: 1000}}
			}
		}
		e.spawn("US.hauler", 1, Vec{X: 14000, Y: 16000}, true, 900000)
		e.updateFog()
		if e.canSee(1, e.state.Fields[1].Position) || e.canSeeEntity(1, e.entity(3)) {
			t.Fatal("hidden-state fixture is visible")
		}
	}
	b.player(2).Credits = 100000000
	b.entity(3).Jobs = []Job{{Type: "IR.rig", Required: 800}}
	b.state.Fields[1].Remaining = 0
	b.spawn("IR.launcher", 2, Vec{X: 49000, Y: 47000}, true, 1400000)
	left, right := aiQualityEconomyPlan(a), aiQualityEconomyPlan(b)
	if !reflect.DeepEqual(left, right) {
		t.Fatal("hidden army, queue, bank or field stock changed economy intentions", left, right)
	}
	if a.player(1).Credits != 600000 || b.player(1).Credits != 600000 || a.player(1).Spent != 0 || b.player(1).Spent != 0 {
		t.Fatal("planning mutated the real credit bank")
	}
}

func TestAIQualityEconomyRecoveryRestoreReplay(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	foundation := e.spawn("power", 1, Vec{X: 8000, Y: 14000}, false, 500000)
	foundation.Builder = 2
	e.assign(e.entity(2), Order{Kind: "move", Position: Vec{X: 20000, Y: 14000}})
	idle := e.spawn("US.rig", 1, Vec{X: 6000, Y: 16000}, true, 800000)
	orders := aiQualityEconomyPlan(e)
	found := false
	for _, order := range orders {
		if order.Kind == "resume" && order.Target == foundation.ID && order.Entities[0] == idle.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("replay fixture must contain the corrected recovery intention", orders)
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil || twin.Hash() != e.Hash() {
		t.Fatal("recovery save did not restore exactly", err)
	}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 700; i++ {
		e.Advance()
		twin.Advance()
		if i%100 == 0 && twin.Hash() != e.Hash() {
			t.Fatal("recovery continuation diverged after restore", e.Tick())
		}
		if i%350 == 0 {
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}
	if !foundation.Complete || foundation.Builder != idle.ID {
		t.Fatal("same paid foundation did not finish during deterministic recovery")
	}
	played, err := recorder.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("recovery full replay diverged", err)
	}
}

func TestAIQualityEconomyAllocationBlockedAircraftLeavesServiceRecoveryCredits(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Faction, p.AI, p.Credits = "IR", "normal", 1500000
	e.spawn("power", 1, Vec{X: 32000, Y: 12000}, true, 500000)
	e.spawn("IR.hauler", 1, Vec{X: 14000, Y: 16000}, true, 900000)
	hub := e.spawn("IR.drone_hub", 1, Vec{X: 28000, Y: 30000}, true, 1500000)
	for i := 0; i < 6; i++ {
		e.spawn("IR.strike", 1, Vec{X: 28000 + int32(i)*1000, Y: 30000}, true, 750000).Home = hub.ID
	}
	queued := Job{Type: "IR.strike", Required: 1000}
	hub.Jobs = []Job{queued}
	e.recalculate()
	if !e.jobReady(p, hub, &queued) {
		t.Fatal("queued aircraft must have valid current prerequisites")
	}
	if _, _, _, code := e.productionAllocation(p, &queued); code != "service_full" {
		t.Fatal("existing aircraft must occupy all ordinary service slots", code)
	}
	found := false
	for _, order := range aiQualityEconomyPlan(e) {
		if order.Kind == "build" && order.Type == "IR.drone_hub" {
			found = true
		}
	}
	if !found {
		t.Fatal("service-blocked unpaid aircraft froze the real bank needed to restore capacity")
	}
	p.AI = ""
	e.Advance()
	if p.Credits != 0 || p.Spent != 1500000 || len(hub.Jobs) != 1 || hub.Jobs[0].Started {
		t.Fatal("service recovery must pay for ordinary construction before the blocked aircraft", p.Credits, p.Spent, hub.Jobs)
	}
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("service recovery plan must execute legally", result)
		}
	}
}

func TestAIQualityEconomyAffordableFutureJobStillReceivesSavings(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Credits = 500000
	var factory *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "factory" {
			factory = v
		}
	}
	queued := Job{Type: "US.tank", Required: 1000}
	factory.Jobs = []Job{queued}
	if !e.jobReady(p, factory, &queued) {
		t.Fatal("ordinary future job must retain its prerequisites")
	}
	if _, _, _, code := e.productionAllocation(p, &queued); code != "insufficient_credits" {
		t.Fatal("only current funds should prevent this job from starting", code)
	}
	if budget := e.aiPlanningBudget(p, aiOwnView(e, 1)); budget != 0 {
		t.Fatal("a legal future job lost its accumulating purchase budget", budget)
	}
}

func TestAIQualityEconomyHardCyclePreservesAcceptedSecondVolleyCredits(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Faction, p.Credits = "IR", 800000
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "power" {
			v.HP = 0
		}
	}
	launcher := e.spawn("IR.launcher", 1, Vec{X: 20000, Y: 30000}, true, 2000000)
	launcher.Deployed, launcher.Charges = true, 2
	point := Vec{X: 40000, Y: 30000}
	e.spawn("IR.engineer", 1, Vec{X: 39000, Y: 29000}, true, 500000)
	e.spawn("barracks", 2, point, true, 600000)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "ability", Entities: []ID{launcher.ID}, Type: "volley", Points: []Vec{point, point}})
	if p.Credits != 500000 || p.Spent != 300000 || len(e.state.Operations) != 1 || e.state.Operations[0].At != 31 {
		t.Fatal("first ordinary volley shot must leave an accepted unpaid second shot", p.Credits, p.Spent, e.state.Operations)
	}
	ticks(e, 19)
	p.AI = "hard"
	e.updateAI()
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			if order.Kind == "build" || order.Kind == "train" || order.Kind == "research" || order.Kind == "ability" && (order.Type == "volley" || order.Type == "strategic" || order.Type == "beacon") {
				t.Fatal("between-shot Hard decision spent money committed to the accepted second shot", order)
			}
		}
	}
	if budget := e.aiPlanningBudget(p, aiOwnView(e, 1)); budget != 200000 {
		t.Fatal("accepted delayed-shot commitment must be deducted exactly once", budget)
	}
	p.AI = ""
	ticks(e, 11)
	if p.Credits != 200000 || p.Spent != 600000 || launcher.Charges != 0 || len(e.state.Operations) != 0 {
		t.Fatal("second shot must fire and pay its ordinary cost exactly once", p.Credits, p.Spent, launcher.Charges, e.state.Operations)
	}
}

func aiQualityEconomyChargedFixture(t *testing.T, faction string) (*Engine, *Entity) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "hard"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	baseInfrastructure(e, 1)
	for _, point := range []Vec{{X: 32000, Y: 12000}, {X: 38000, Y: 12000}} {
		e.spawn("power", 1, point, true, 500000)
	}
	e.spawn("depot", 1, Vec{X: 30000, Y: 24000}, true, 1000000)
	e.spawn("abm", 1, Vec{X: 36000, Y: 24000}, true, 1800000)
	site := e.spawn("strategic", 1, Vec{X: 32000, Y: 36000}, true, 4500000)
	site.ChargeWork = e.strategicCharge(faction)
	for i := int32(0); i < 4; i++ {
		e.spawn(faction+".rifle", 1, Vec{X: 14000 + i*2000, Y: 18000}, true, 0)
	}
	for i := int32(0); i < 2; i++ {
		e.spawn(faction+".hauler", 1, Vec{X: 14000 + i*2000, Y: 16000}, true, 900000)
	}
	e.spawn(faction+".recon", 1, Vec{X: 45000, Y: 24000}, true, 350000)
	e.spawn("IR.tank", 2, Vec{X: 45000, Y: 20000}, true, 1150000)
	e.player(1).Credits = 2200000
	e.recalculate()
	e.updateFog()
	return e, site
}

func TestAIQualityEconomyReadyStrategicPrecedesRoutinePurchases(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, site := aiQualityEconomyChargedFixture(t, faction)
			p := e.player(1)
			view, _ := e.PlayerView(1)
			ready, ok := e.aiStrategicOrder(p, view, aiOwnView(e, 1), site, p.AIGoal, map[ID]bool{}, 100-p.Supply-p.ReservedSupply)
			if !ok {
				t.Fatal("charged fixture must have a current legal observed activation")
			}
			cost, _, _ := e.aiOrderReservation(p, &ready)
			if e.aiPlanningBudget(p, aiOwnView(e, 1)) < cost {
				t.Fatal("ordinary activation must fit before routine purchases")
			}
			orders := aiQualityEconomyPlan(e)
			strategicIndex, strategicCount := -1, 0
			for index, order := range orders {
				if order.Kind == "ability" && order.Type == "strategic" {
					strategicIndex = index
					strategicCount++
				}
			}
			if strategicCount != 1 {
				t.Fatal("routine reservations starved or duplicated the charged operation", faction, orders)
			}
			for index, order := range orders {
				if (order.Kind == "research" || order.Kind == "train") && index < strategicIndex {
					t.Fatal("optional purchase preceded the ready operation", order)
				}
			}
			bank := p.Credits
			p.AI = ""
			e.Advance()
			activationCount := 0
			for _, event := range e.state.Events {
				if event.Kind == "strategic_activated" && event.Owner == 1 && event.Value == cost {
					activationCount++
				}
			}
			paidJobs := int64(0)
			for _, entity := range e.state.Entities {
				if entity.Owner == 1 {
					for _, job := range entity.Jobs {
						paidJobs += job.Paid
					}
				}
			}
			paidOrders := int64(0)
			for _, order := range orders {
				if order.Kind != "train" && order.Kind != "research" {
					credits, _, _ := e.aiOrderReservation(p, &order)
					paidOrders += credits
				}
			}
			if activationCount != 1 || site.ChargeWork >= e.strategicCharge(faction) || p.Spent != paidOrders+paidJobs || p.Credits != bank-p.Spent {
				t.Fatal("charged priority did not use one ordinary paid activation", activationCount, site.ChargeWork, p.Credits, p.Spent, cost, paidJobs)
			}
			for _, result := range e.state.Results {
				if !result.Accepted {
					t.Fatal("charged priority issued an illegal ordinary order", result)
				}
			}
		})
	}
}

func TestAIQualityEconomyEssentialRecoveryPrecedesReadyStrategic(t *testing.T) {
	for _, condition := range []string{"hq", "power", "income", "foundation", "hauler", "emergency_rig", "sole_rig", "sole_rig_exact"} {
		t.Run(condition, func(t *testing.T) {
			faction := "US"
			if condition == "sole_rig" || condition == "sole_rig_exact" {
				faction = "SA"
			}
			e, _ := aiQualityEconomyChargedFixture(t, faction)
			p := e.player(1)
			wantKind, wantType, wantTarget := "build", "", ID(0)
			switch condition {
			case "hq":
				e.entity(1).HP = 0
				p.Credits, wantType = 3500000, "hq"
			case "power":
				for _, entity := range e.state.Entities {
					if entity.Owner == 1 && e.role(entity) == "power" {
						entity.HP = 0
						break
					}
				}
				p.Credits, wantType = 1200000, "power"
			case "income":
				for _, entity := range e.state.Entities {
					if entity.Owner == 1 && e.role(entity) == "supply" {
						entity.HP = 0
					}
				}
				p.Credits, wantType = 1800000, "supply"
			case "foundation":
				foundation := e.spawn("power", 1, Vec{X: 8000, Y: 14000}, false, 500000)
				foundation.Builder = 999
				p.Credits, wantKind, wantTarget = 1200000, "resume", foundation.ID
			case "hauler":
				for _, entity := range e.state.Entities {
					if entity.Owner == 1 && e.role(entity) == "hauler" {
						entity.HP = 0
					}
				}
				p.Credits, wantKind, wantType = 2000000, "train", "US.hauler"
			case "emergency_rig":
				e.entity(1).HP, e.entity(2).HP = 0, 0
				p.Credits, wantKind, wantType = 1200000, "train", "US.rig"
			case "sole_rig", "sole_rig_exact":
				e.entity(2).HP = 0
				p.Credits, wantKind, wantType = 1100000, "train", "SA.rig"
				if condition == "sole_rig_exact" {
					unit, _ := e.catalog.Unit(wantType)
					p.Credits = unit.Cost
				}
			}
			orders := aiQualityEconomyPlan(e)
			recoveryIndex := -1
			var recovery Order
			for index, order := range orders {
				if order.Kind == wantKind && order.Type == wantType && (wantTarget == 0 || order.Target == wantTarget) {
					recoveryIndex, recovery = index, order
					break
				}
			}
			if recoveryIndex < 0 {
				t.Fatal("ready operation or routine purchase displaced essential recovery", condition, orders)
			}
			for index, order := range orders {
				if order.Kind == "ability" && order.Type == "strategic" {
					if condition != "foundation" || index < recoveryIndex {
						t.Fatal("charged operation consumed essential recovery resources", condition, orders)
					}
				}
			}
			p.AI = ""
			e.Advance()
			if wantKind == "resume" {
				if e.entity(wantTarget).Builder != recovery.Entities[0] {
					t.Fatal("paid foundation did not receive its ordinary replacement builder")
				}
			} else if wantKind == "train" {
				producer := e.entity(recovery.Entities[0])
				if len(producer.Jobs) == 0 || producer.Jobs[0].Type != wantType || !producer.Jobs[0].Started {
					t.Fatal("essential unit did not start as a normal paid job", producer.Jobs)
				}
			} else if e.countRole(1, wantType, false) == 0 {
				t.Fatal("essential normal paid foundation was not placed", wantType)
			}
			for _, result := range e.state.Results {
				if !result.Accepted {
					t.Fatal("essential priority issued an illegal ordinary order", result)
				}
			}
		})
	}
}
