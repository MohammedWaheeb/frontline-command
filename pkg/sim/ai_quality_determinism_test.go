package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
	"time"
)

func aiQualityDeterminismArmy(t testing.TB, difficulty, unitType string) (*Engine, []ID, Tick) {
	t.Helper()
	return aiQualityDeterminismPopulate(t, fixture(t), difficulty, unitType)
}

func aiQualityDeterminismPopulate(t testing.TB, e *Engine, difficulty, unitType string) (*Engine, []ID, Tick) {
	t.Helper()
	p := e.player(1)
	p.AI, p.Controller = difficulty, "ai"
	p.Credits, p.RepairReserve = 0, 300000
	period := seconds(2)
	if difficulty == "easy" {
		period = seconds(4)
	} else if difficulty == "hard" {
		period = seconds(1)
	}
	rule, ok := e.catalog.Unit(unitType)
	if !ok || rule.Supply <= 0 {
		t.Fatal("invalid army fixture type", unitType)
	}
	count := int(100 / rule.Supply)
	army := make([]ID, 0, count)
	for i := 0; i < count; i++ {
		v := e.spawn(unitType, 1, Vec{X: 16000 + int32(i%10)*1000, Y: 16000 + int32(i/10)*1000}, true, 0)
		army = append(army, v.ID)
	}
	p.AIKnowledge = []AIObservation{{ID: 3, Owner: 2, Type: "hq", Position: e.entity(3).Position}}
	e.recalculate()
	e.updateFog()
	if p.Supply != 100 {
		t.Fatalf("fixture must be legal 100-Supply army, got %d", p.Supply)
	}
	return e, army, period
}

func TestAIQualityDeterminismFullScoutArmyOnMaximumMap(t *testing.T) {
	m := fixtureMap()
	m.Width, m.Height = 256, 256
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	e, err := New(fixture(t).catalog, Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e, _, period := aiQualityDeterminismPopulate(t, e, "hard", "US.recon")
	e.state.Tick = period
	start := time.Now()
	e.updateAI()
	elapsed := time.Since(start)
	if got := len(aiQualityDeterminismPending(e, 1)); got != 100 {
		t.Fatalf("maximum-map full scout cycle admitted %d/100 actors", got)
	}
	t.Logf("one 100-scout planning cycle on %d public terrain tiles: %s, shared host descriptive timing only", len(m.Tiles), elapsed)
}

func aiQualityDeterminismPending(e *Engine, player PlayerID) []Order {
	orders := []Order{}
	for _, scheduled := range e.state.Pending {
		if scheduled.Player == player {
			orders = append(orders, scheduled.Orders...)
		}
	}
	return orders
}

// A strategic update is due at the documented difficulty interval. All idle
// members of a legal maximum army must respond then, rather than dropping the
// actors after the first batch just because each Submit admits 32 intentions.
func TestAIQualityDeterminismFullArmyRespondsInFirstCycle(t *testing.T) {
	for _, difficulty := range []string{"easy", "normal", "hard"} {
		for _, unitType := range []string{"US.rifle", "US.recon"} {
			t.Run(difficulty+"/"+unitType, func(t *testing.T) {
				e, army, period := aiQualityDeterminismArmy(t, difficulty, unitType)
				wantKind := "attack_move"
				if unitType == "US.recon" {
					wantKind = "move"
				}
				e.state.Tick = period
				start := time.Now()
				e.updateAI()
				planningTime := time.Since(start)
				seen := map[ID]bool{}
				for i, scheduled := range e.state.Pending {
					if len(scheduled.Orders) > 32 || scheduled.Tick != period+1 || scheduled.Sequence != uint32(i+1) {
						t.Fatalf("ordinary batch admission changed: %+v", scheduled)
					}
					for _, order := range scheduled.Orders {
						if order.Kind != wantKind || len(order.Entities) != 1 {
							t.Fatalf("per-actor movement geometry changed: %+v", order)
						}
						if seen[order.Entities[0]] {
							t.Fatal("actor received more than one chosen intention")
						}
						seen[order.Entities[0]] = true
					}
				}
				if len(seen) != len(army) {
					t.Fatalf("first %s planning cycle scheduled %d/%d combat actors", difficulty, len(seen), len(army))
				}
				e.state.Tick++
				e.executePending()
				if len(e.state.Results) != len(army) {
					t.Fatalf("executed %d/%d actor intentions", len(e.state.Results), len(army))
				}
				for _, result := range e.state.Results {
					if !result.Accepted {
						t.Fatal("normal execution rejected scheduled intention", result)
					}
				}
				for _, id := range army {
					if orders := e.entity(id).Orders; len(orders) != 1 || orders[0].Kind != wantKind {
						t.Fatalf("normal execution failed for actor %d: %+v", id, orders)
					}
				}
				t.Logf("%s: %d actors admitted and executed through %d ordinary batches; planning=%s on shared host (descriptive only)", difficulty, len(army), len(e.state.Log), planningTime)
			})
		}
	}
}

func TestAIQualityDeterminismRespectsRemainingCommandWindow(t *testing.T) {
	for _, already := range []uint32{130, 149, 160} {
		e, _, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
		e.state.Tick = period
		p := e.player(1)
		p.CommandWindow, p.CommandCount = period, already
		e.updateAI()
		got := len(aiQualityDeterminismPending(e, 1))
		want := int(160 - already)
		if got != want || p.CommandCount != 160 {
			t.Fatalf("starting count %d: scheduled=%d want=%d resulting command count=%d", already, got, want, p.CommandCount)
		}
	}
}

func TestAIQualityDeterminismExpiredCommandWindowRecovers(t *testing.T) {
	e, _, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
	e.state.Tick = period
	p := e.player(1)
	p.CommandCount = 160
	e.updateAI()
	if got := len(aiQualityDeterminismPending(e, 1)); got != 100 || p.CommandCount != 100 || p.CommandWindow != period {
		t.Fatalf("expired window did not admit a new full-army cycle: scheduled=%d count=%d window=%d", got, p.CommandCount, p.CommandWindow)
	}
}

func TestAIQualityDeterminismRespectsPendingBatchCapacity(t *testing.T) {
	e, _, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
	e.state.Tick = period
	for i := 0; i < 127; i++ {
		e.state.Pending = append(e.state.Pending, Scheduled{Tick: period + 10, Player: 2, Sequence: uint32(i + 1), Orders: []Order{{Kind: "repair_reserve", Index: 300}}})
	}
	e.updateAI()
	if got := len(aiQualityDeterminismPending(e, 1)); got != 32 || len(e.state.Pending) != 128 || e.player(1).CommandCount != 32 {
		t.Fatalf("pending batch ceiling changed: scheduled=%d pending=%d count=%d", got, len(e.state.Pending), e.player(1).CommandCount)
	}
}

func TestAIQualityDeterminismOpponentPendingCannotChangeChosenOrders(t *testing.T) {
	for _, count := range []int{1, 127, 128} {
		a, army, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
		b, _, _ := aiQualityDeterminismArmy(t, "hard", "US.recon")
		a.state.Tick, b.state.Tick = period, period
		for sequence := 1; sequence <= count; sequence++ {
			if err := b.Submit(2, uint32(sequence), []Order{{Kind: "repair_reserve", Index: int32(sequence)}}); err != nil {
				t.Fatal("ordinary opponent queue setup failed", count, sequence, err)
			}
		}
		av, _ := a.PlayerView(1)
		bv, _ := b.PlayerView(1)
		if !reflect.DeepEqual(av, bv) {
			t.Fatal("opponent queue unexpectedly changed this player's permitted view")
		}
		orders := make([]Order, 0, len(army))
		for _, id := range army {
			orders = append(orders, Order{Kind: "move", Entities: []ID{id}, Position: Vec{X: 40000, Y: 40000}})
		}
		ac := a.aiChooseOrders(a.player(1), av.Entities, append([]Order(nil), orders...), a.aiPlanningBudget(a.player(1), av.Entities))
		bc := b.aiChooseOrders(b.player(1), bv.Entities, append([]Order(nil), orders...), b.aiPlanningBudget(b.player(1), bv.Entities))
		if len(ac) != 100 || !reflect.DeepEqual(ac, bc) {
			t.Fatalf("%d undisclosed opponent batches changed choices: clear=%d occupied=%d", count, len(ac), len(bc))
		}
	}
}

func TestAIQualityDeterminismFullSupplyQueueStillAllowsMovement(t *testing.T) {
	e, _, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
	e.spawn("power", 1, Vec{X: 10000, Y: 34000}, true, 0)
	barracks := e.spawn("barracks", 1, Vec{X: 14000, Y: 32000}, true, 0)
	if err := e.Submit(1, 1, []Order{{Kind: "train", Entities: []ID{barracks.ID}, Type: "US.recon"}}); err != nil {
		t.Fatal(err)
	}
	e.state.Tick = period
	e.executePending()
	if len(e.state.Results) != 1 || !e.state.Results[0].Accepted || len(barracks.Jobs) != 1 || barracks.Jobs[0].Started {
		t.Fatal("ordinary unpaid queue admission failed at full Supply", e.state.Results, barracks.Jobs)
	}
	e.recalculate()
	e.updateFog()
	e.updateAI()
	if got := len(aiQualityDeterminismPending(e, 1)); got != 100 {
		t.Fatalf("unpaid Supply-blocked job suppressed resource-independent movement: %d/100", got)
	}
}

func TestAIQualityDeterminismLargeArmySaveReplay(t *testing.T) {
	e, _, period := aiQualityDeterminismArmy(t, "hard", "US.recon")
	e.state.Tick = period - 1
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if got := len(aiQualityDeterminismPending(e, 1)); got != 100 {
		t.Fatalf("expected pending full-army update at save boundary, got %d", got)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("pending split batches changed on restore", err)
	}
	for i := 0; i < 25; i++ {
		e.Advance()
		restored.Advance()
		if restored.Hash() != e.Hash() {
			t.Fatalf("AI or order continuation diverged at tick %d", e.Tick())
		}
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("AI replay failed to reproduce live scheduler state", err)
	}
	t.Logf("100-Supply live/restore/replay hash at tick %d: %s", e.Tick(), e.Hash())
}

func TestAIQualityDeterminismDedupBeforeBatchBoundary(t *testing.T) {
	e, army, _ := aiQualityDeterminismArmy(t, "hard", "US.recon")
	p := e.player(1)
	p.Energy = 100000
	p.Tier = 2
	view, _ := e.PlayerView(1)
	orders := []Order{{Kind: "stop", Entities: []ID{army[0]}}}
	for _, id := range army {
		orders = append(orders, Order{Kind: "move", Entities: []ID{id}, Position: Vec{X: 40000, Y: 40000}})
	}
	// The second faction source is rejected without consuming that actor, so
	// the later ordinary move still survives. An actor used before order 32 must
	// remain reserved in every subsequent batch of the same planning cycle.
	orders = append(orders,
		Order{Kind: "ability", Type: "recon_sweep", Entities: []ID{1}, Position: e.entity(1).Position},
		Order{Kind: "ability", Type: "recon_sweep", Entities: []ID{2}, Position: e.entity(1).Position},
		Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 40000, Y: 40000}},
		Order{Kind: "attack_move", Entities: []ID{army[0]}, Position: Vec{X: 40000, Y: 40000}},
	)
	before := e.Hash()
	chosen := e.aiChooseOrders(p, view.Entities, orders, e.aiPlanningBudget(p, view.Entities))
	if e.Hash() != before {
		t.Fatal("choosing intentions mutated authoritative resources or state")
	}
	if len(chosen) != 102 || chosen[0].Kind != "stop" || chosen[101].Kind != "move" || chosen[101].Entities[0] != 2 {
		t.Fatalf("stable actor/faction priority changed: count=%d orders=%+v", len(chosen), chosen)
	}
	e.aiDispatchOrders(p, chosen)
	if len(e.state.Pending) != 4 || len(e.state.Pending[3].Orders) != 6 {
		t.Fatalf("dedup crossed a batch boundary: %+v", e.state.Pending)
	}
}

func TestAIQualityDeterminismFactionEnergyIsReservedAcrossSources(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Controller = "hard", "ai"
	p.Credits, p.RepairReserve, p.Energy = 0, 300000, 50000
	e.spawn("radar", 1, Vec{X: 14000, Y: 16000}, true, 0)
	airfield := e.spawn("US.airfield", 1, Vec{X: 10000, Y: 18000}, true, 0)
	plane := e.spawn("US.strike", 1, Vec{X: 12000, Y: 18000}, true, 0)
	plane.Home, plane.ServiceWork = airfield.ID, 100
	goal := e.entity(3).Position
	p.AIKnowledge = []AIObservation{{ID: 3, Owner: 2, Type: "hq", Position: goal}}
	p.Explored[goal.Y/1000*e.state.Map.Width+goal.X/1000] = true
	e.state.Tick = seconds(1)
	e.recalculate()
	e.updateFog()
	e.updateAI()
	abilities := []Order{}
	for _, order := range aiQualityDeterminismPending(e, 1) {
		if order.Kind == "ability" {
			abilities = append(abilities, order)
		}
	}
	if len(abilities) != 1 || abilities[0].Type != "recon_sweep" {
		t.Fatalf("50k energy must retain only first affordable faction intention: %+v", abilities)
	}
	if p.Energy != 50000 {
		t.Fatal("planning spent real command energy")
	}
	e.state.Tick++
	e.executePending()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("same-cycle source reservation produced invalid order", result)
		}
	}
	if p.Energy != 15000 {
		t.Fatalf("ordinary ability execution spent wrong energy: %d", p.Energy)
	}
}

func TestAIQualityDeterminismRecoveryEnergyPrecedesOptionalAbility(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	p.AI, p.Controller = "hard", "ai"
	p.Credits, p.RepairReserve, p.Energy = 0, 300000, 50000
	e.spawn("radar", 2, Vec{X: 50000, Y: 56000}, true, 0)
	hub := e.spawn("IR.drone_hub", 2, Vec{X: 50000, Y: 50000}, true, 0)
	strike := e.spawn("IR.strike", 2, Vec{X: 49000, Y: 46000}, true, 0)
	strike.Home, strike.Landed, strike.HP = hub.ID, false, strike.MaxHP*2/5
	isr := e.spawn("IR.isr", 2, Vec{X: 48000, Y: 45000}, true, 0)
	isr.Home, isr.Landed = hub.ID, false
	e.spawn("US.rifle", 1, Vec{X: 45000, Y: 44000}, true, 0)
	e.state.Tick = seconds(1)
	e.recalculate()
	e.updateFog()
	e.updateAI()
	recall, scout := false, false
	for _, order := range aiQualityDeterminismPending(e, 2) {
		if order.Kind == "ability" {
			if order.Type != "drone_recall" || len(order.Entities) != 1 || order.Entities[0] != strike.ID {
				t.Fatal("optional ability ignored the earlier recovery energy reservation", order)
			}
			recall = true
		}
		if order.Kind == "move" && len(order.Entities) == 1 && order.Entities[0] == isr.ID {
			scout = true
		}
	}
	if !recall || !scout || p.Energy != 50000 {
		t.Fatalf("45k recovery must preserve ISR fallback movement without spending during planning: recall=%v scout=%v energy=%d", recall, scout, p.Energy)
	}
	e.state.Tick++
	e.executePending()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("cross-layer reservation produced invalid order", result)
		}
	}
	if p.Energy != 5000 {
		t.Fatalf("ordinary recovery spent wrong energy: %d", p.Energy)
	}
}

func TestAIQualityDeterminismQueuedProductionReservesCreditsBeforeAbility(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	rule, _ := e.catalog.Unit("IR.recon")
	p.Credits = rule.Cost
	e.spawn("power", 2, Vec{X: 54000, Y: 40000}, true, 0)
	barracks := e.spawn("barracks", 2, Vec{X: 50000, Y: 40000}, true, 0)
	recon := e.spawn("IR.recon", 2, Vec{X: 40000, Y: 40000}, true, 0)
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(2)
	orders := []Order{
		{Kind: "train", Entities: []ID{barracks.ID}, Type: "IR.recon"},
		{Kind: "ability", Entities: []ID{recon.ID}, Type: "beacon", Position: recon.Position},
		{Kind: "move", Entities: []ID{recon.ID}, Position: Vec{X: 44000, Y: 42000}},
	}
	before := e.Hash()
	chosen := e.aiChooseOrders(p, view.Entities, orders, e.aiPlanningBudget(p, view.Entities))
	if e.Hash() != before {
		t.Fatal("shared credit reservation spent real money during planning")
	}
	if len(chosen) != 2 || chosen[0].Kind != "train" || chosen[1].Kind != "move" {
		t.Fatalf("paid ability displaced queued production or affordable movement: %+v", chosen)
	}
	e.aiDispatchOrders(p, chosen)
	e.state.Tick++
	e.executePending()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("normal queue or movement admission failed", result)
		}
	}
	e.updateEconomy()
	if p.Credits != 0 || len(barracks.Jobs) != 1 || !barracks.Jobs[0].Started {
		t.Fatalf("ordinary producer could not start its reserved job: credits=%d jobs=%+v", p.Credits, barracks.Jobs)
	}
}
