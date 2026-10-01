package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func aiQualityAirFixture(t *testing.T, faction string) (*Engine, *Entity) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.AI, p.Credits, p.RepairReserve = "hard", 0, 300000
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "rig" {
			v.Orders = []Order{{Kind: "guard", Position: v.Position}}
		}
	}
	home := e.spawn(content.AirProducer(faction), 1, Vec{X: 23000, Y: 36000}, true, 0)
	e.recalculate()
	e.updateFog()
	return e, home
}

func aiQualityAirPending(e *Engine, actor ID) []Order {
	orders := []Order{}
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			for _, id := range order.Entities {
				if id == actor {
					orders = append(orders, order)
				}
			}
		}
	}
	return orders
}

func aiQualityAirPlan(e *Engine) {
	e.state.Tick = 20
	e.recalculate()
	e.updateFog()
	e.updateAI()
}

func TestAIQualityAirServiceReservationAndPendingReplacement(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			typ := faction + ".fighter"
			if faction == "SY" {
				typ = "SY.scout_drone"
			}
			jet := droneFixtureActor(e, home.ID, typ)
			home.DisabledUntil = seconds(10)
			rule, _ := e.buildingRule(home.Type)
			if got := e.aiServiceMargin(aiOwnView(e, 1)); got != rule.ServiceSlots-1 {
				t.Fatalf("temporary service outage discarded retained reservation: got %d want %d", got, rule.ServiceSlots-1)
			}
			home.HP = 0
			jet.Home = 0
			e.spawn(home.Type, 1, Vec{X: 43000, Y: 36000}, false, 0)
			if got := e.aiServiceMargin(aiOwnView(e, 1)); got != rule.ServiceSlots-1 {
				t.Fatalf("paid replacement foundation was ignored by construction planning: got %d", got)
			}
		})
	}
}

func TestAIQualityAirProductionDoesNotUseDisabledSpareCapacity(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			spare := e.spawn(home.Type, 1, Vec{X: 43000, Y: 36000}, true, 0)
			spare.Enabled = false
			rule, _ := e.buildingRule(home.Type)
			typ := faction + ".strike"
			if faction == "SY" {
				typ = "SY.scout_drone"
			}
			for i := int32(0); i < rule.ServiceSlots; i++ {
				jet := e.spawn(typ, 1, Vec{X: 18000 + i*1800, Y: 34000}, true, 0)
				jet.Home = home.ID
			}
			e.player(1).Credits, e.player(1).AIStage = 9000000, 1
			aiQualityAirPlan(e)
			for _, order := range aiQualityAirPending(e, home.ID) {
				if order.Kind == "train" {
					t.Fatal("AI queued aircraft against disabled spare capacity", order)
				}
			}
		})
	}
}

func TestAIQualityAirProductionBudgetsSameCycleAndQueuedAirSupply(t *testing.T) {
	for _, queued := range []bool{false, true} {
		t.Run(map[bool]string{false: "same_cycle", true: "queued"}[queued], func(t *testing.T) {
			e, home := aiQualityAirFixture(t, "US")
			second := e.spawn(home.Type, 1, Vec{X: 43000, Y: 36000}, true, 0)
			count := 6
			if queued {
				count = 5
				home.Jobs = []Job{{Type: "US.strike", Started: true, Service: home.ID, Supply: 4}, {Type: "US.strike"}}
			}
			committed := int32(count * 4)
			if queued {
				committed += 8
			}
			for i := 0; i < count; i++ {
				jet := e.spawn("US.strike", 1, Vec{X: 14000 + int32(i)*1800, Y: 33000}, true, 0)
				jet.Home = second.ID
			}
			e.player(1).Credits, e.player(1).AIStage = 15000000, 1
			aiQualityAirPlan(e)
			for _, batch := range e.state.Pending {
				for _, order := range batch.Orders {
					if order.Kind == "train" {
						if u, ok := e.catalog.Unit(order.Type); ok && u.Armor == "air" {
							committed += u.Supply
						}
					}
				}
			}
			if committed > 28 {
				t.Fatal("AI exceeded its combined-arms air commitment bound", committed)
			}
		})
	}
}

func TestAIQualityAirNoThreatFighterCadenceStillProducesSupport(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			droneFixtureActor(e, home.ID, faction+".fighter")
			if faction == "IR" {
				e.spawn("IR.isr", 1, Vec{X: 17000, Y: 33000}, true, 0).Home = home.ID
			}
			e.player(1).Credits = 9000000
			aiQualityAirPlan(e)
			for _, order := range aiQualityAirPending(e, home.ID) {
				if order.Kind == "train" && order.Type != faction+".fighter" {
					return
				}
			}
			t.Fatal("one existing fighter stranded an idle air producer at fighter cadence")
		})
	}
}

func TestAIQualityAirDepletedAircraftRecoverWithNormalReturn(t *testing.T) {
	for _, typ := range []string{"US.fighter", "US.strike", "US.gunship", "US.airlift", "IR.fighter", "IR.strike", "IR.gunship", "IR.isr", "SY.scout_drone", "SA.fighter", "SA.strike", "SA.gunship"} {
		t.Run(typ, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, typ[:2])
			jet := droneFixtureActor(e, home.ID, typ)
			jet.Landed, jet.Endurance = false, 600
			orders := e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), Vec{X: 48000, Y: 35000})
			if len(orders) != 1 || orders[0].Kind != "return" || orders[0].Entities[0] != jet.ID {
				t.Fatal("depleted endurance did not cause recovery", orders)
			}
			if code := e.execute(1, orders[0]); code != "ok" {
				t.Fatal("ordinary recovery order rejected", code)
			}
			if _, armed := e.weapon(jet); armed {
				jet.Endurance, jet.Ammo, jet.Orders = 2400, 0, nil
				orders = e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), Vec{X: 48000, Y: 35000})
				if len(orders) != 1 || orders[0].Kind != "return" {
					t.Fatal("empty magazine did not cause recovery", orders)
				}
			}
		})
	}
}

func TestAIQualityAirRebasesDuringOutageWithoutChangingAircraftResources(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			typ := faction + ".strike"
			if faction == "SY" {
				typ = "SY.scout_drone"
			}
			jet := droneFixtureActor(e, home.ID, typ)
			next := e.spawn(home.Type, 1, Vec{X: 43000, Y: 36000}, true, 0)
			home.DisabledUntil = seconds(10)
			jet.Endurance = 1400
			hp, ammo := jet.HP, jet.Ammo
			orders := e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), Vec{X: 48000, Y: 35000})
			if len(orders) != 1 || orders[0].Kind != "return" || orders[0].Target != next.ID {
				t.Fatal("outage did not choose an active owned rebase destination", orders)
			}
			if code := e.execute(1, orders[0]); code != "ok" {
				t.Fatal("standard rebase rejected", code)
			}
			if jet.Home != next.ID || jet.Landed || jet.HP != hp || jet.Ammo != ammo || jet.Endurance != 1400 {
				t.Fatal("AI rebase bypassed aircraft mechanics")
			}
		})
	}
}

func TestAIQualityAirRebaseDoesNotOverbookLastServiceSlot(t *testing.T) {
	e, home := aiQualityAirFixture(t, "SY")
	droneFixtureActor(e, home.ID, "SY.scout_drone")
	for i := 0; i < 2; i++ {
		jet := e.spawn("SY.scout_drone", 1, Vec{X: 15000 + int32(i)*2000, Y: 34000}, true, 0)
		jet.Landed, jet.Home, jet.Endurance = false, 0, 1200
	}
	orders := e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), Vec{X: 48000, Y: 35000})
	if len(orders) != 2 || orders[0].Kind != "return" || orders[0].Target != home.ID || orders[1].Kind != "return" || orders[1].Target != 0 {
		t.Fatal("same-cycle rebase did not reserve one slot and leave the other aircraft waiting", orders)
	}
	for _, order := range orders {
		if code := e.execute(1, order); code != "ok" {
			t.Fatal("ordinary reserved/waiting return rejected", code)
		}
	}
}

func TestAIQualityAirDamagedLandedAircraftWaitForPaidRecovery(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			jet := droneFixtureActor(e, home.ID, faction+".strike")
			jet.HP = jet.MaxHP / 4
			aiQualityAirPlan(e)
			for _, order := range aiQualityAirPending(e, jet.ID) {
				if order.Kind == "move" || order.Kind == "attack_move" || order.Kind == "escort" {
					t.Fatal("damaged grounded aircraft was sent away from paid home repair", order)
				}
			}
		})
	}
}

func TestAIQualityAirFighterReleasesReturningOrLostEscortLeader(t *testing.T) {
	for _, lost := range []bool{false, true} {
		t.Run(map[bool]string{false: "returning", true: "lost"}[lost], func(t *testing.T) {
			e, home := aiQualityAirFixture(t, "US")
			fighter := droneFixtureActor(e, home.ID, "US.fighter")
			strike := e.spawn("US.strike", 1, Vec{X: 17000, Y: 34000}, true, 0)
			fighter.Landed, strike.Landed, strike.Home = false, false, home.ID
			fighter.Orders = []Order{{Kind: "escort", Target: strike.ID}}
			strike.Orders = []Order{{Kind: "return"}}
			if lost {
				strike.HP = 0
			}
			orders := e.aiEscortOrders(e.player(1), aiOwnView(e, 1))
			if len(orders) != 1 || orders[0].Kind != "return" || orders[0].Entities[0] != fighter.ID {
				t.Fatal("fighter retained an escort task that no longer needs cover", orders)
			}
		})
	}
}

func TestAIQualityAirFighterWaitsWithoutAirTargetAndInterceptsObservedDrone(t *testing.T) {
	e, home := aiQualityAirFixture(t, "US")
	fighter := droneFixtureActor(e, home.ID, "US.fighter")
	for i := 0; i < 4; i++ {
		e.spawn("US.rifle", 1, Vec{X: 14000 + int32(i)*1400, Y: 12000}, true, 0)
	}
	aiQualityAirPlan(e)
	if orders := aiQualityAirPending(e, fighter.ID); len(orders) != 0 {
		t.Fatal("fighter launched to an unrelated ground objective", orders)
	}
	e.state.Pending = nil
	fighter.Position = Vec{X: 28000, Y: 36000}
	enemy := e.spawn("IR.isr", 2, Vec{X: 35000, Y: 36000}, true, 0)
	enemy.Landed = false
	e.state.Tick, e.player(1).AILast = 40, 0
	e.updateFog()
	e.updateAI()
	orders := aiQualityAirPending(e, fighter.ID)
	if len(orders) != 1 || orders[0].Kind != "attack" || orders[0].Target != enemy.ID {
		t.Fatal("fighter did not intercept a currently observed airborne sight drone", orders)
	}
	e.state.Pending = nil
	fighter.Landed, fighter.Orders = false, []Order{{Kind: "attack", Target: enemy.ID}}
	enemy.Landed = true
	e.state.Tick, e.player(1).AILast = 60, 0
	e.updateFog()
	e.updateAI()
	orders = aiQualityAirPending(e, fighter.ID)
	if len(orders) != 1 || orders[0].Kind != "return" {
		t.Fatal("fighter kept pursuing a drone after it became a ground target", orders)
	}
}

func TestAIQualityAirDoesNotSendStrikeThroughObservedGroundAA(t *testing.T) {
	e, home := aiQualityAirFixture(t, "US")
	strike := e.spawn("US.strike", 1, Vec{X: 18000, Y: 35000}, true, 0)
	strike.Home = home.ID
	for i := 0; i < 4; i++ {
		e.spawn("US.rifle", 1, Vec{X: 14000 + int32(i)*1400, Y: 12000}, true, 0)
	}
	e.player(1).AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "aa_post", Position: Vec{X: 35000, Y: 35000}, Seen: 20}, {ID: 901, Owner: 2, Type: "hq", Position: Vec{X: 50000, Y: 35000}, Seen: 20}}
	aiQualityAirPlan(e)
	if e.player(1).AIGoal != (Vec{X: 50000, Y: 35000}) {
		t.Fatal("fixture did not select an objective beyond the AA corridor", e.player(1).AIGoal)
	}
	if orders := aiQualityAirPending(e, strike.ID); len(orders) != 0 {
		t.Fatal("strike aircraft was sent through remembered ground AA", orders)
	}
}

func TestAIQualityAirFighterRecoversFromGroundAA(t *testing.T) {
	e, home := aiQualityAirFixture(t, "US")
	fighter := droneFixtureActor(e, home.ID, "US.fighter")
	fighter.Landed, fighter.Position = false, Vec{X: 38000, Y: 34000}
	e.player(1).AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "aa_post", Position: fighter.Position}}
	orders := e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), Vec{X: 48000, Y: 35000})
	if len(orders) != 1 || orders[0].Kind != "return" {
		t.Fatal("fighter ignored an observed ground AA battery", orders)
	}
}

func TestAIQualityAirRapidSortieWinsIdleAirfieldTrainingConflict(t *testing.T) {
	e, home := aiQualityAirFixture(t, "US")
	jet := droneFixtureActor(e, home.ID, "US.strike")
	jet.ServiceWork = 1
	e.player(1).Credits, e.player(1).Energy, e.player(1).AIStage = 9000000, 50000, 1
	aiQualityAirPlan(e)
	orders := aiQualityAirPending(e, home.ID)
	if len(orders) != 1 || orders[0].Kind != "ability" || orders[0].Type != "rapid_sortie" {
		t.Fatal("airfield train intention hid a useful available service boost", orders)
	}
	if code := e.execute(1, orders[0]); code != "ok" || e.player(1).Energy != 0 || !e.hasBuff(home, "rapid_sortie") || jet.ServiceWork != 1 {
		t.Fatal("service boost did not use its ordinary cost/effect", code)
	}
}

func TestAIQualityAirRelayUses35EnergyForUsefulSightOnly(t *testing.T) {
	e, home := aiQualityAirFixture(t, "IR")
	drone := droneFixtureActor(e, home.ID, "IR.isr")
	drone.Landed, drone.Position = false, Vec{X: 30000, Y: 38000}
	e.player(1).Energy = 35000
	e.updateFog()
	goal := Vec{X: 44000, Y: 38000}
	e.player(1).Explored[38*64+44] = true
	view, _ := e.PlayerView(1)
	orders := e.aiSpecialOrders(e.player(1), view, aiOwnView(e, 1), goal)
	if len(orders) != 1 || orders[0].Type != "relay_boost" || orders[0].Entities[0] != drone.ID {
		t.Fatal("useful relay boost was gated above its actual 35-energy cost", orders)
	}
	if code := e.execute(1, orders[0]); code != "ok" || e.player(1).Energy != 0 || e.sightRange(drone) != 15000 || e.detectionRange(drone) != 6000 {
		t.Fatal("relay boost did not obey ordinary effect and cost", code)
	}
	setCooldown(&e.player(1).Cooldowns, "relay_boost", 0)
	e.player(1).Energy, drone.Orders = 35000, []Order{{Kind: "return"}}
	if got := e.aiSpecialOrders(e.player(1), view, aiOwnView(e, 1), goal); len(got) != 0 {
		t.Fatal("returning drone spent energy on a sight boost", got)
	}
}

func TestAIQualityAirRecallGroupsAtMostFourAndPaysOnce(t *testing.T) {
	e, home := aiQualityAirFixture(t, "IR")
	drones := []*Entity{}
	for i := 0; i < 5; i++ {
		v := e.spawn("IR.strike", 1, Vec{X: 14000 + int32(i)*1800, Y: 35000}, true, 0)
		v.Home, v.Landed, v.HP = home.ID, false, v.MaxHP/4
		drones = append(drones, v)
	}
	e.player(1).Energy = 45000
	own := aiOwnView(e, 1)
	orders := e.aiRecoveryOrders(e.player(1), own, Vec{X: 48000, Y: 35000})
	fallbacks := map[ID]bool{}
	for _, order := range orders {
		if order.Kind == "return" {
			for _, id := range order.Entities {
				fallbacks[id] = true
			}
		}
	}
	for _, drone := range drones {
		if !fallbacks[drone.ID] {
			t.Fatal("endangered drone had no ordinary fallback if grouped Recall was rejected", drone.ID)
		}
	}
	orders = e.aiChooseOrders(e.player(1), own, orders, e.aiPlanningBudget(e.player(1), own))
	if len(orders) != 2 || orders[0].Type != "drone_recall" || len(orders[0].Entities) != 4 || orders[1].Kind != "return" {
		t.Fatal("retained recall did not cover four endangered drones with one paid cast", orders)
	}
	for _, order := range orders {
		if code := e.execute(1, order); code != "ok" {
			t.Fatal("ordinary grouped recovery rejected", code)
		}
	}
	if e.player(1).Energy != 0 {
		t.Fatal("recall did not spend its single ordinary 45-energy cost")
	}
	for i, drone := range drones {
		if e.hasBuff(drone, "recall") != (i < 4) || drone.HP != drone.MaxHP/4 || drone.Endurance != 2400 || drone.Orders[0].Kind != "return" {
			t.Fatal("grouped recall changed resources or skipped standard return", i)
		}
	}
}

func TestAIQualityAirOrdersRemainDeterministicAfterRestore(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, home := aiQualityAirFixture(t, faction)
			typ := faction + ".fighter"
			if faction == "SY" {
				typ = "SY.scout_drone"
			}
			jet := droneFixtureActor(e, home.ID, typ)
			jet.Landed, jet.Endurance = false, 600
			jet.Position, jet.LastPosition = Vec{X: 18000, Y: 34000}, Vec{X: 18000, Y: 34000}
			aiQualityAirPlan(e)
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			for range 30 {
				e.Advance()
				restored.Advance()
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("air planning/order execution diverged after save/restore", e.Hash(), restored.Hash())
			}
		})
	}
}
