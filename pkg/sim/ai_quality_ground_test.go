package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiQualityGroundProductionFixture(t *testing.T) (*Engine, *Entity) {
	t.Helper()
	e := fixture(t)
	baseInfrastructure(e, 1)
	e.assign(e.entity(2), Order{Kind: "move", Position: Vec{X: 33000, Y: 33000}})
	e.spawn("US.hauler", 1, Vec{X: 16000, Y: 11000}, true, 0)
	e.spawn("US.hauler", 1, Vec{X: 18000, Y: 11000}, true, 0)
	var factory *Entity
	for _, v := range e.state.Entities {
		if v.Owner != 1 {
			continue
		}
		if e.role(v) == "barracks" {
			u, _ := e.catalog.Unit("US.rifle")
			v.Jobs = []Job{{Type: u.ID, Started: true, Required: u.BuildTicks * 2}}
		}
		if e.role(v) == "factory" {
			factory = v
		}
	}
	p := e.player(1)
	p.AI, p.AIStage, p.Credits = "hard", 1, 30000000
	e.state.Tick = seconds(40)
	e.recalculate()
	e.updateFog()
	return e, factory
}

func aiQualityGroundPendingOrder(e *Engine, id ID) (Order, bool) {
	for _, batch := range e.state.Pending {
		if o, ok := aiUnitOrder(batch.Orders, id); ok {
			return o, true
		}
	}
	return Order{}, false
}

func TestAIQualityGroundAirCounterKeepsMixedReserve(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	for i := int32(0); i < 4; i++ {
		e.spawn("US.aa", 1, Vec{X: 14000 + i*2000, Y: 14000}, true, 0)
	}
	e.spawn("US.tank", 1, Vec{X: 18000, Y: 16000}, true, 0)
	p := e.player(1)
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.strike", Position: Vec{X: 50000, Y: 40000}, Seen: e.Tick()}}
	e.recalculate()
	e.updateFog()
	e.updateAI()
	o, ok := aiQualityGroundPendingOrder(e, factory.ID)
	if !ok || o.Kind != "train" || o.Type != "US.tank" {
		t.Fatal("one observed aircraft replaced the mixed ground reserve with more AA", o, ok)
	}
}

func TestAIQualityGroundStaleAirDoesNotOverrideFactory(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	p := e.player(1)
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.strike", Position: Vec{X: 50000, Y: 40000}, Seen: e.Tick() - seconds(31)}}
	e.updateAI()
	o, ok := aiQualityGroundPendingOrder(e, factory.ID)
	if !ok || o.Kind != "train" || o.Type != "US.tank" {
		t.Fatal("uncertain old air sighting forced current AA production", o, ok)
	}
}

func TestAIQualityGroundFreshAirStillBuysOrdinaryPaidCounter(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	p := e.player(1)
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.strike", Position: Vec{X: 50000, Y: 40000}, Seen: e.Tick()}}
	e.updateAI()
	o, ok := aiQualityGroundPendingOrder(e, factory.ID)
	if !ok || o.Kind != "train" || o.Type != "US.aa" {
		t.Fatal("fresh observed air had no ordinary ground counter", o, ok)
	}
	p.AI, e.state.Pending = "", nil
	before := p.Credits
	issue(t, e, 1, o)
	if p.Credits != before-900000 || p.ReservedSupply != 3 {
		t.Fatal("counter bypassed the ordinary purchase and Supply reservation", p.Credits, p.ReservedSupply)
	}
}

func TestAIQualityGroundHaulerArmorDoesNotEraseOpeningScout(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	factory.Jobs = []Job{{Type: "US.car", Started: true, Required: 600}}
	var barracks *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "barracks" {
			barracks, v.Jobs = v, nil
		}
	}
	p := e.player(1)
	p.AIStage = 0
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.hauler", Position: Vec{X: 50000, Y: 40000}, Seen: e.Tick()}}
	e.updateAI()
	o, ok := aiQualityGroundPendingOrder(e, barracks.ID)
	if !ok || o.Kind != "train" || o.Type != "US.recon" {
		t.Fatal("unarmed logistics armor caused anti-tank spam before scouting", o, ok)
	}
}

func TestAIQualityGroundRepairAnchorCanActuallyHeal(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	busy := e.spawn("US.repair", 1, Vec{X: 19000, Y: 18000}, true, 0)
	ready := e.spawn("US.repair", 1, Vec{X: 16000, Y: 18000}, true, 0)
	tank := e.spawn("US.tank", 1, Vec{X: 20000, Y: 18000}, true, 0)
	tank.HP = tank.MaxHP / 4
	e.assign(busy, Order{Kind: "move", Position: Vec{X: 50000, Y: 20000}})
	e.updateFog()
	if anchor := e.aiRepairAnchor(p, tank, aiOwnView(e, 1)); anchor != ready {
		t.Fatalf("retreat selected a moving source that cannot heal: got %v want %d", anchor, ready.ID)
	}
}

func TestAIQualityGroundUnarmedPositionalGuardReturnsToSupport(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	medic := e.spawn("US.medic", 1, Vec{X: 18000, Y: 18000}, true, 0)
	e.assign(medic, Order{Kind: "guard", Position: medic.Position})
	e.updateFog()
	o, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), Vec{X: 50000, Y: 40000}), medic.ID)
	if !ok || o.Kind != "stop" {
		t.Fatal("unarmed support received a combat assault after guard recovery", o, ok)
	}
}

func TestAIQualityGroundDeployedRetreatPacksBeforeGuard(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.Faction, p.AI = "SA", "hard"
	e.spawn("depot", 1, Vec{X: 14000, Y: 18000}, true, 0)
	tank := e.spawn("SA.tank", 1, Vec{X: 20000, Y: 18000}, true, 0)
	tank.HP, tank.Deployed = tank.MaxHP/4, true
	e.updateFog()
	o, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), Vec{X: 50000, Y: 40000}), tank.ID)
	if !ok || o.Kind != "pack" {
		t.Fatal("deployed retreat could never travel to its repair guard", o, ok)
	}
	if code := e.execute(1, o); code != "ok" || tank.PackingUntil <= e.Tick() {
		t.Fatal("retreat packing bypassed ordinary deployment", code)
	}
}

func TestAIQualityGroundEscortRejectsAndReleasesReciprocalFollow(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Supply = "hard", 24
	rifle := e.spawn("US.rifle", 1, Vec{X: 18000, Y: 18000}, true, 0)
	medic := e.spawn("US.medic", 1, Vec{X: 21000, Y: 18000}, true, 0)
	e.assign(medic, Order{Kind: "guard", Target: rifle.ID, Position: rifle.Position})
	e.updateFog()
	if o, ok := aiUnitOrder(e.aiEscortOrders(p, aiOwnView(e, 1)), rifle.ID); ok {
		t.Fatal("escort created a reciprocal support guard cluster", o)
	}
	e.assign(rifle, Order{Kind: "escort", Target: medic.ID, Position: medic.Position})
	o, ok := aiUnitOrder(e.aiEscortOrders(p, aiOwnView(e, 1)), rifle.ID)
	if !ok || o.Kind != "stop" {
		t.Fatal("existing reciprocal ground escort never released", o, ok)
	}
}

func TestAIQualityGroundDisabledUnitDoesNotRepeatIllegalDispatch(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	factory.Jobs = []Job{{Type: "US.car", Started: true, Required: 600}}
	p := e.player(1)
	p.Supply = 24
	unit := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 18000}, true, 0)
	unit.DisabledUntil = e.Tick() + seconds(10)
	e.updateFog()
	e.updateAI()
	if o, ok := aiQualityGroundPendingOrder(e, unit.ID); ok {
		t.Fatal("disabled actor received an order rejected by ordinary mobile validation", o)
	}
}

func TestAIQualityGroundCommittedAssaultCanDefendObservedBase(t *testing.T) {
	e, factory := aiQualityGroundProductionFixture(t)
	factory.Jobs = []Job{{Type: "US.car", Started: true, Required: 600}}
	p := e.player(1)
	p.Credits = 0
	unit := e.spawn("US.rifle", 1, Vec{X: 22000, Y: 12000}, true, 0)
	threat := e.spawn("IR.rifle", 2, Vec{X: 12000, Y: 8000}, true, 0)
	e.assign(unit, Order{Kind: "attack_move", Position: Vec{X: 44000, Y: 42000}})
	e.updateFog()
	e.updateAI()
	o, ok := aiQualityGroundPendingOrder(e, unit.ID)
	if p.AIIntent != "defend" || !ok || o.Kind != "attack_move" || o.Position != threat.Position {
		t.Fatal("committed offensive task ignored a newly observed base threat", p.AIIntent, o, ok)
	}
	p.AI, e.state.Pending = "", nil
	before := unit.Position
	issue(t, e, 1, o)
	ticks(e, 60)
	if distance(unit.Position, before) < 2000 || distance(unit.Position, o.Position) >= distance(before, o.Position) {
		t.Fatal("ordinary admitted defense order made no movement toward the threat", before, unit.Position)
	}
}

func TestAIQualityGroundCoverDoesNotCrossVisibleWall(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	rifle := e.spawn("US.rifle", 1, Vec{X: 21000, Y: 17500}, true, 0)
	goal := Vec{X: 26000, Y: 17500}
	e.state.Map.Tiles[17*e.state.Map.Width+22].Terrain = "blocked"
	e.state.Map.Tiles[17*e.state.Map.Width+23].Terrain = "cover"
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.rifle", Position: goal}}
	e.updateFog()
	if point, ok := e.aiCoverPosition(p, rifle, goal); ok {
		t.Fatal("cover guard selected a point across a visible wall", point)
	}
}

func TestAIQualityGroundDefenseRedirectPreservesWorkingIntentions(t *testing.T) {
	for _, condition := range []string{"queued", "channel", "firing", "move", "board", "healing"} {
		t.Run(condition, func(t *testing.T) {
			e, factory := aiQualityGroundProductionFixture(t)
			factory.Jobs = []Job{{Type: "US.car", Started: true, Required: 600}}
			p := e.player(1)
			p.Credits = 0
			unit := e.spawn("US.rifle", 1, Vec{X: 22000, Y: 12000}, true, 0)
			e.spawn("IR.rifle", 2, Vec{X: 12000, Y: 8000}, true, 0)
			e.assign(unit, Order{Kind: "attack_move", Position: Vec{X: 44000, Y: 42000}})
			switch condition {
			case "queued":
				unit.Orders = append(unit.Orders, Order{Kind: "move", Position: Vec{X: 35000, Y: 35000}, Queued: true})
			case "channel":
				unit.Channel = "board"
			case "firing":
				unit.EverDealt, unit.LastDealt = true, e.Tick()
			case "move":
				e.assign(unit, Order{Kind: "move", Position: Vec{X: 35000, Y: 35000}})
			case "board":
				carrier := e.spawn("US.apc", 1, Vec{X: 25000, Y: 12000}, true, 0)
				e.assign(unit, Order{Kind: "board", Target: carrier.ID})
			case "healing":
				medic := e.spawn("US.medic", 1, Vec{X: 24000, Y: 12000}, true, 0)
				unit.HP = unit.MaxHP / 2
				e.assign(unit, Order{Kind: "guard", Target: medic.ID, Position: medic.Position})
			}
			e.updateFog()
			e.updateAI()
			if o, ok := aiQualityGroundPendingOrder(e, unit.ID); ok {
				t.Fatal("defense redirect replaced an active or intentional task", condition, o)
			}
		})
	}
}

func aiQualityGroundTransportFixture(t *testing.T) (*Engine, *Entity, *Entity, Vec) {
	t.Helper()
	e := fixture(t)
	p := e.player(1)
	p.AI, p.AIIntent = "hard", "pressure"
	carrier := e.spawn("US.apc", 1, Vec{X: 15000, Y: 15000}, true, 0)
	passenger := e.spawn("US.rifle", 1, carrier.Position, true, 0)
	passenger.Container, carrier.Passengers = carrier.ID, []ID{passenger.ID}
	e.updateFog()
	return e, carrier, passenger, Vec{X: 50000, Y: 40000}
}

func TestAIQualityGroundLoadedTransportDefendReleasesCargo(t *testing.T) {
	e, carrier, passenger, goal := aiQualityGroundTransportFixture(t)
	p := e.player(1)
	p.AIIntent = "defend"
	o, ok := aiUnitOrder(e.aiTransportOrders(p, aiOwnView(e, 1), goal), carrier.ID)
	if !ok || o.Kind != "unload" || o.Position != carrier.Position {
		t.Fatal("defense stranded available infantry inside an idle APC", o, ok)
	}
	p.AI = ""
	issue(t, e, 1, o)
	ticks(e, 60)
	if passenger.Container != 0 || len(carrier.Passengers) != 0 {
		t.Fatal("ordinary defensive unload failed to release infantry", passenger.Container)
	}
}

func TestAIQualityGroundConfirmedFailedDeliveryUnloadsLocally(t *testing.T) {
	e, carrier, passenger, goal := aiQualityGroundTransportFixture(t)
	e.state.Tick = seconds(40)
	e.assign(carrier, Order{Kind: "unload", Position: Vec{X: 44000, Y: 40000}})
	carrier.Blocked, carrier.StationarySince = true, e.Tick()-seconds(13)
	o, ok := aiUnitOrder(e.aiTransportOrders(e.player(1), aiOwnView(e, 1), goal), carrier.ID)
	if !ok || o.Kind != "unload" || o.Position != carrier.Position {
		t.Fatal("confirmed unreachable unload task kept its passengers forever", o, ok)
	}
	e.player(1).AI = ""
	issue(t, e, 1, o)
	ticks(e, 60)
	if passenger.Container != 0 {
		t.Fatal("recovered delivery did not complete ordinary local unloading")
	}
}

func TestAIQualityGroundDefensiveUnloadRestoresAndReplays(t *testing.T) {
	e, carrier, passenger, goal := aiQualityGroundTransportFixture(t)
	p := e.player(1)
	p.AIIntent = "defend"
	o, ok := aiUnitOrder(e.aiTransportOrders(p, aiOwnView(e, 1), goal), carrier.ID)
	if !ok || o.Kind != "unload" {
		t.Fatal("missing defensive delivery", o, ok)
	}
	p.AI = ""
	e.recalculate()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, o)
	ticks(e, 24)
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for range 80 {
		e.Advance()
		twin.Advance()
	}
	if passenger.Container != 0 || twin.Hash() != e.Hash() {
		t.Fatal("ordinary defensive delivery failed or diverged after restore", passenger.Container)
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("defensive delivery full replay drift", err)
	}
	t.Logf("tick=%d restored_and_replayed_hash=%s", e.Tick(), e.Hash())
}

func aiQualityGroundSafehouses(t *testing.T) (*Engine, *Entity, *Entity, Vec) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "SY", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown, e.state.Tick = 0, seconds(40)
	p := e.player(1)
	p.AI, p.AIIntent = "hard", "pressure"
	source := e.spawn("SY.safehouse", 1, Vec{X: 14000, Y: 16000}, true, 0)
	target := e.spawn("SY.safehouse", 1, Vec{X: 38000, Y: 16000}, true, 0)
	passenger := e.spawn("SY.rifle", 1, source.Position, true, 0)
	passenger.Container, source.Passengers = source.ID, []ID{passenger.ID}
	e.updateFog()
	return e, source, target, Vec{X: 54000, Y: 16000}
}

func TestAIQualityGroundSafehouseTransferChecksQuietAndExclusivity(t *testing.T) {
	for _, condition := range []string{"source_combat", "destination_combat", "active_transfer", "blocked_exit"} {
		t.Run(condition, func(t *testing.T) {
			e, source, target, goal := aiQualityGroundSafehouses(t)
			switch condition {
			case "source_combat":
				source.EverDamaged, source.LastDamage = true, e.Tick()
			case "destination_combat":
				target.EverDamaged, target.LastDamage = true, e.Tick()
			case "active_transfer":
				other := e.spawn("SY.safehouse", 1, Vec{X: 26000, Y: 24000}, true, 0)
				other.Channel = "transit"
			case "blocked_exit":
				for y := int32(12); y <= 20; y++ {
					for x := int32(34); x <= 42; x++ {
						e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
					}
				}
			}
			e.updateFog()
			for _, o := range e.aiTransportOrders(e.player(1), aiOwnView(e, 1), goal) {
				if o.Type == "transfer" {
					t.Fatal("planner repeatedly proposed a transfer excluded by owned/public facts", condition, o, e.execute(1, o))
				}
			}
		})
	}
}

func TestAIQualityGroundSafehousesPlanOnlyOneOrdinaryTransfer(t *testing.T) {
	e, first, _, goal := aiQualityGroundSafehouses(t)
	second := e.spawn("SY.safehouse", 1, Vec{X: 16000, Y: 22000}, true, 0)
	passenger := e.spawn("SY.at", 1, second.Position, true, 0)
	passenger.Container, second.Passengers = second.ID, []ID{passenger.ID}
	e.updateFog()
	transfers := []Order{}
	for _, o := range e.aiTransportOrders(e.player(1), aiOwnView(e, 1), goal) {
		if o.Type == "transfer" {
			transfers = append(transfers, o)
		}
	}
	if len(transfers) != 1 || transfers[0].Entities[0] != first.ID {
		t.Fatal("more than one transfer shared the same player transit slot", transfers)
	}
	if code := e.execute(1, transfers[0]); code != "ok" {
		t.Fatal("planned transfer bypassed ordinary legality", code)
	}
}

func TestAIQualityGroundBlockedSafehouseCannotRelocateItsUnload(t *testing.T) {
	e, source, _, goal := aiQualityGroundSafehouses(t)
	p := e.player(1)
	p.AIIntent = "defend"
	for y := int32(12); y <= 20; y++ {
		for x := int32(10); x <= 18; x++ {
			if x < 13 || x >= 15 || y < 15 || y >= 17 {
				e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
			}
		}
	}
	e.updateFog()
	if o, ok := aiUnitOrder(e.aiTransportOrders(p, aiOwnView(e, 1), goal), source.ID); ok {
		t.Fatal("immobile safehouse cannot travel to an alternate disembark point", o)
	}
}

func TestAIQualityGroundBlockedAssaultCanFollowChangedGoal(t *testing.T) {
	e, unit, _, goal := aiStalledRallyFixture(t)
	e.assign(unit, Order{Kind: "attack_move", Position: Vec{X: 46000, Y: 26000}})
	unit.Blocked, unit.StationarySince = true, e.Tick()-seconds(13)
	o, ok := e.aiStalledRallyOrder(unit, aiOwnView(e, 1), goal)
	if !ok || o.Kind != "attack_move" || o.Position != goal {
		t.Fatal("confirmed failed assault ignored a changed authorized strategic goal", o, ok)
	}
	unit.Orders = append(unit.Orders, Order{Kind: "move", Position: Vec{X: 26000, Y: 26000}, Queued: true})
	if _, ok := e.aiStalledRallyOrder(unit, aiOwnView(e, 1), goal); ok {
		t.Fatal("failed-assault recovery stole an intentional queued task")
	}
}

func TestAIQualityGroundTransportPlanningIgnoresUnseenOccupancy(t *testing.T) {
	a, _, _, goal := aiQualityGroundSafehouses(t)
	b, _, target, _ := aiQualityGroundSafehouses(t)
	for _, e := range []*Engine{a, b} {
		for _, v := range e.state.Entities {
			if e.role(v) == "safehouse" && v.Position.X == 38000 {
				v.Position = Vec{X: 38500, Y: 16500}
			}
		}
		for y := int32(12); y <= 21; y++ {
			for x := int32(34); x <= 43; x++ {
				if !(x >= 37 && x <= 39 && y >= 15 && y <= 17) && !(x >= 41 && y == 16) {
					e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
				}
			}
		}
		e.updateFog()
	}
	hidden := b.spawn("SY.rifle", 2, Vec{X: target.Position.X + 3150, Y: target.Position.Y}, true, 0)
	hidden.Concealed = true
	b.updateFog()
	if b.canSeeEntity(1, hidden) {
		t.Fatal("hidden occupancy setup is visible")
	}
	oa := a.aiTransportOrders(a.player(1), aiOwnView(a, 1), goal)
	ob := b.aiTransportOrders(b.player(1), aiOwnView(b, 1), goal)
	if len(oa) != 1 || oa[0].Type != "transfer" || !reflect.DeepEqual(oa, ob) {
		t.Fatal("unseen endpoint occupancy changed intended transport orders", oa, ob)
	}
	if code := b.execute(1, ob[0]); code != "exit_blocked" {
		t.Fatal("ordinary execution must retain the real hidden exit collision", code)
	}
}
