package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"testing"
)

func aiOwnView(e *Engine, owner PlayerID) []EntityView {
	view, _ := e.PlayerView(owner)
	own := []EntityView{}
	for _, observed := range view.Entities {
		if observed.Owner == owner {
			own = append(own, observed)
		}
	}
	return own
}

func TestAIPaidResearchProgressionAndNoDuplicateInvestment(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.Credits = 12000000
	p.AI = "hard"
	for i := 0; i < 4; i++ {
		e.spawn("US.tank", 1, Vec{X: 12000 + int32(i)*2000, Y: 13000}, true, 0)
	}
	airfield := e.spawn("US.airfield", 1, Vec{X: 12000, Y: 30000}, true, 0)
	e.spawn("power", 1, Vec{X: 22000, Y: 30000}, true, 0)
	e.spawn("US.fighter", 1, Vec{X: 12000, Y: 30000}, true, 0).Home = airfield.ID
	e.spawn("US.strike", 1, Vec{X: 14000, Y: 30000}, true, 0).Home = airfield.ID
	e.recalculate()
	e.updateFog()
	own := aiOwnView(e, 1)
	budget := p.Credits
	orders := e.aiResearchOrders(p, own, &budget)
	if len(orders) != 2 || budget != 9300000 {
		t.Fatal("AI did not budget the two useful generic upgrades", orders, budget)
	}
	p.AI = ""
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if p.Credits != 9300000 || p.Spent != 2700000 {
		t.Fatal("research did not pay ordinary job costs", p.Credits, p.Spent)
	}
	p.AI = "hard"
	budget = p.Credits
	if duplicate := e.aiResearchOrders(p, aiOwnView(e, 1), &budget); len(duplicate) != 0 {
		t.Fatal("AI duplicated active research", duplicate)
	}
	p.AI = ""
	ticks(e, 2500)
	if !p.HasUpgrade("weapons_training") || !p.HasUpgrade("vehicle_armor") {
		t.Fatal("ordinary research did not complete")
	}
	p.AI = "hard"
	budget = p.Credits
	next := e.aiResearchOrders(p, aiOwnView(e, 1), &budget)
	if len(next) != 2 || next[0].Type != "US.countermeasures" || next[1].Type != "US.service_crews" {
		t.Fatal("AI did not progress to relevant faction upgrades", next)
	}
}

func TestAIBuildsBeyondSixPowerPlantsAndAccountsForPendingCapacity(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Credits = "hard", 30000000
	for i := 0; i < 6; i++ {
		e.spawn("power", 1, Vec{X: 8000 + int32(i)*5000, Y: 17000}, true, 0)
	}
	for i := 0; i < 28; i++ {
		e.spawn("factory", 1, Vec{X: 4000 + int32(i%7)*8000, Y: 25000 + int32(i/7)*8000}, true, 0)
	}
	e.recalculate()
	e.updateFog()
	if !p.LowPower() {
		t.Fatal("power recovery fixture must have real excess building demand")
	}
	e.state.Tick = 20
	e.updateAI()
	found := false
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			if order.Kind == "build" && order.Type == "power" {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("six existing plants incorrectly capped power recovery")
	}
	p.AI = ""
	e.Advance()
	if e.countRole(1, "power", false) != 7 || p.Spent < 500000 {
		t.Fatal("seventh power station was not bought normally")
	}
	if margin := e.aiPowerMargin(p, aiOwnView(e, 1)); margin != p.PowerCapacity-p.PowerDemand+100 {
		t.Fatal("pending power capacity was ignored", margin)
	}
}

func TestAIDepletedEconomyUsesSmallerKnownRemnantWithoutBreakingHaulerCap(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	depot := e.spawn("supply", 1, Vec{X: 14000, Y: 12000}, true, 0)
	depot.IncludedHauler = true
	p.AIFields = []FieldView{{ID: 1, Position: Vec{X: 14000, Y: 8000}, Remaining: 0}, {ID: 7, Position: Vec{X: 35000, Y: 24000}, Remaining: 3000000}}
	if point, ok := e.aiExpansion(p, aiOwnView(e, 1)); !ok || point != p.AIFields[1].Position {
		t.Fatal("resource exhaustion prevented use of a smaller known remnant")
	}
	p.AIFields[1].Remaining = 2000000
	if _, ok := e.aiExpansion(p, aiOwnView(e, 1)); ok {
		t.Fatal("AI would spend more on the outpost and depot than the known remaining field")
	}
	p.AIFields[1].Remaining = 3000000
	for i := 0; i < 8; i++ {
		e.spawn("US.hauler", 1, Vec{X: 16000 + int32(i)*1500, Y: 12000}, true, 0)
	}
	if _, ok := e.aiExpansion(p, aiOwnView(e, 1)); ok {
		t.Fatal("AI planned an extra included hauler beyond the cap")
	}
}

func TestAIRetreatChoosesOwnedPaidRepairAndCoverStaysWithinEngagementRange(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	depot := e.spawn("depot", 1, Vec{X: 12000, Y: 18000}, true, 0)
	tank := e.spawn("US.tank", 1, Vec{X: 18000, Y: 18000}, true, 0)
	tank.HP = tank.MaxHP / 4
	rifle := e.spawn("US.rifle", 1, Vec{X: 21000, Y: 17000}, true, 0)
	goal := Vec{X: 26000, Y: 17000}
	e.state.Map.Tiles[17*64+22].Terrain = "cover"
	p.AIKnowledge = []AIObservation{{ID: 90, Owner: 2, Type: "IR.rifle", Position: goal}}
	e.updateFog()
	orders := e.aiRecoveryOrders(p, aiOwnView(e, 1), goal)
	retreat, covered := false, false
	for _, order := range orders {
		if order.Entities[0] == tank.ID && order.Kind == "guard" && order.Target == depot.ID {
			retreat = true
		}
		if order.Entities[0] == rifle.ID && order.Kind == "guard" && e.state.Map.TileAt(order.Position).Cover() {
			covered = true
		}
	}
	if !retreat || !covered {
		t.Fatal("AI omitted repair retreat or observed cover", orders)
	}
	if _, ok := e.aiCoverPosition(p, rifle, Vec{X: 40000, Y: 17000}); ok {
		t.Fatal("cover would hold infantry outside useful engagement range")
	}
	tank.HP = tank.MaxHP
	tank.Orders = []Order{{Kind: "guard", Target: depot.ID}}
	orders = e.aiRecoveryOrders(p, aiOwnView(e, 1), goal)
	for _, order := range orders {
		if order.Entities[0] == tank.ID && order.Kind == "attack_move" {
			return
		}
	}
	t.Fatal("repaired combat unit stayed parked at its depot")
}

func TestAIFighterEscortsMovingFriendlyAircraftAndRecoversWhenItLands(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	home := e.spawn("US.airfield", 1, Vec{X: 14000, Y: 15000}, true, 0)
	fighter := e.spawn("US.fighter", 1, Vec{X: 14000, Y: 15000}, true, 0)
	strike := e.spawn("US.strike", 1, Vec{X: 18000, Y: 15000}, true, 0)
	fighter.Home, strike.Home = home.ID, home.ID
	strike.Landed = false
	strike.Orders = []Order{{Kind: "attack_move", Position: Vec{X: 35000, Y: 15000}}}
	orders := e.aiEscortOrders(p, aiOwnView(e, 1))
	if len(orders) != 1 || orders[0].Kind != "escort" || orders[0].Target != strike.ID || orders[0].Entities[0] != fighter.ID {
		t.Fatal("fighter did not protect a moving owned aircraft", orders)
	}
	if code := e.execute(1, orders[0]); code != "ok" {
		t.Fatal("AI escort bypassed normal legality", code)
	}
	// Execute the departure phase before the leader lands; grounded fighters
	// correctly stop a released escort instead of starting another service job.
	e.pathBudget = 32
	e.updateMovement()
	strike.Landed = true
	orders = e.aiEscortOrders(p, aiOwnView(e, 1))
	if len(orders) != 1 || orders[0].Kind != "return" {
		t.Fatal("escort failed to release its serviced leader", orders)
	}
}

func TestAIDroneRecoveryUsesPaidRecallAndFallsBackToReturn(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	baseInfrastructure(e, 2)
	p.AI, p.Energy = "hard", 45000
	drone := e.spawn("IR.strike", 2, Vec{X: 44000, Y: 47000}, true, 0)
	drone.HP, drone.Landed = drone.MaxHP/4, false
	e.recalculate()
	own := aiOwnView(e, 2)
	orders := e.aiRecoveryOrders(p, own, Vec{X: 14000, Y: 12000})
	orders = e.aiChooseOrders(p, own, orders, e.aiPlanningBudget(p, own))
	if len(orders) != 1 || orders[0].Type != "drone_recall" {
		t.Fatal("ordinary retreat overrode useful drone recall", orders)
	}
	if code := e.execute(2, orders[0]); code != "ok" || p.Energy != 0 || !e.hasBuff(drone, "recall") {
		t.Fatal("recall did not obey ordinary energy and cooldown rules", code, p.Energy)
	}
	drone.Orders = nil
	orders = e.aiRecoveryOrders(p, own, Vec{X: 14000, Y: 12000})
	orders = e.aiChooseOrders(p, own, orders, e.aiPlanningBudget(p, own))
	if len(orders) != 1 || orders[0].Kind != "return" {
		t.Fatal("unavailable recall prevented ordinary return", orders)
	}
}

func TestAIAPCBoardsAndUnloadsWithNormalOrders(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.AIIntent = "hard", "pressure"
	carrier := e.spawn("US.apc", 1, Vec{X: 13000, Y: 12000}, true, 0)
	passenger := e.spawn("US.rifle", 1, Vec{X: 14000, Y: 12000}, true, 0)
	goal := Vec{X: 49000, Y: 40000}
	orders := e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	p.AI = ""
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	ticks(e, 80)
	if passenger.Container != carrier.ID {
		t.Fatal("AI transport did not board through its normal channel", orders)
	}
	p.AI = "hard"
	orders = e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	if len(orders) != 1 || orders[0].Kind != "unload" {
		t.Fatal("loaded APC did not choose a delivery intention", orders)
	}
	p.AI = ""
	if err := e.Submit(1, 2, orders); err != nil {
		t.Fatal(err)
	}
	ticks(e, 800)
	if passenger.Container != 0 || len(carrier.Passengers) != 0 || distance(passenger.Position, goal) > 11000 {
		t.Fatal("transport did not travel and disembark normally", passenger.Container, passenger.Position, carrier.Position, carrier.Orders)
	}
}

func TestAISyrianSafehouseTransferUsesNormalChannels(t *testing.T) {
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "SY", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	p := e.player(1)
	p.AI, p.AIIntent = "hard", "pressure"
	source := e.spawn("SY.safehouse", 1, Vec{X: 13000, Y: 14000}, true, 0)
	target := e.spawn("SY.safehouse", 1, Vec{X: 37000, Y: 14000}, true, 0)
	passenger := e.spawn("SY.rifle", 1, Vec{X: 14500, Y: 14000}, true, 0)
	e.updateFog()
	goal := Vec{X: 50000, Y: 14000}
	orders := e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	p.AI = ""
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	ticks(e, 80)
	if passenger.Container != source.ID {
		t.Fatal("safehouse failed to board its ordinary passenger", orders)
	}
	p.AI = "hard"
	orders = e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	if len(orders) != 1 || orders[0].Type != "transfer" || orders[0].Target != target.ID {
		t.Fatal("AI did not select its useful safehouse link", orders)
	}
	p.AI = ""
	if err := e.Submit(1, 2, orders); err != nil {
		t.Fatal(err)
	}
	ticks(e, 400)
	if passenger.Container != 0 || distance(passenger.Position, target.Position) > 6000 || passenger.HP != passenger.MaxHP {
		t.Fatal("safehouse transfer did not preserve and deliver its passenger", passenger.Container, passenger.Position)
	}
}

func TestAITransportWaitsForItsSecondSquadAndReleasesBlockedBoarding(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.AIIntent = "hard", "pressure"
	carrier := e.spawn("US.apc", 1, Vec{X: 13000, Y: 12000}, true, 0)
	first := e.spawn("US.rifle", 1, Vec{X: 13000, Y: 12000}, true, 0)
	second := e.spawn("US.rifle", 1, Vec{X: 16000, Y: 12000}, true, 0)
	first.Container, carrier.Passengers = carrier.ID, []ID{first.ID}
	second.Orders = []Order{{Kind: "board", Target: carrier.ID}}
	goal := Vec{X: 49000, Y: 40000}
	orders := e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	if len(orders) != 1 || orders[0].Kind != "hold" || orders[0].Entities[0] != carrier.ID {
		t.Fatal("partly loaded transport left an approaching squad", orders)
	}
	second.Blocked = true
	orders = e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	if len(orders) != 2 || orders[0].Kind != "stop" || orders[0].Entities[0] != second.ID || orders[1].Kind != "unload" || orders[1].Entities[0] != carrier.ID {
		t.Fatal("unreachable passenger indefinitely blocked delivery", orders)
	}
	p.AI = ""
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(second.Orders) != 0 || len(carrier.Orders) != 1 || carrier.Orders[0].Kind != "unload" {
		t.Fatal("boarding recovery was not accepted as normal orders")
	}
}

func TestAIConcealedCollisionCannotChangePlannedConstruction(t *testing.T) {
	a, b := fixture(t), fixture(t)
	for _, e := range []*Engine{a, b} {
		e.entity(2).Position = Vec{X: 4000, Y: 4000}
		e.updateFog()
		view, _ := e.PlayerView(1)
		e.aiObserve(e.player(1), view)
	}
	point, ok := a.aiConstructionPosition(a.player(1), "power", a.entity(1).Position)
	if !ok {
		t.Fatal("fixture has no public placement candidate")
	}
	hidden := b.spawn("SY.rifle", 2, point, true, 0)
	hidden.Concealed = true
	b.updateFog()
	if b.canSeeEntity(1, hidden) {
		t.Fatal("concealment fixture is visible", point)
	}
	other, ok := b.aiConstructionPosition(b.player(1), "power", b.entity(1).Position)
	if !ok || other != point {
		t.Fatal("hidden occupancy changed the planned build", point, other)
	}
	if b.validPlacement(1, point, 2, 2) != "occupied" {
		t.Fatal("authoritative execution must still reject the hidden collision")
	}
}

func TestAIAdvancedLayersIgnoreHiddenEconomyAndArmyChanges(t *testing.T) {
	a, b := fixture(t), fixture(t)
	for _, e := range []*Engine{a, b} {
		baseInfrastructure(e, 1)
		p := e.player(1)
		p.AI, p.Credits = "hard", 12000000
		for i := 0; i < 4; i++ {
			e.spawn("US.tank", 1, Vec{X: 14000 + int32(i)*2000, Y: 15000}, true, 0)
		}
		e.state.Tick = 20
	}
	b.player(2).Credits = 100000000
	b.player(2).Upgrades = []string{"weapons_training"}
	b.spawn("IR.aa", 2, Vec{X: 55000, Y: 49000}, true, 0)
	b.entity(3).Jobs = []Job{{Type: "IR.rig"}}
	for _, e := range []*Engine{a, b} {
		e.recalculate()
		e.updateFog()
		e.updateAI()
	}
	ax, _ := json.Marshal(a.state.Pending)
	bx, _ := json.Marshal(b.state.Pending)
	if string(ax) != string(bx) {
		t.Fatal("advanced AI used hidden enemy information", string(ax), string(bx))
	}
}
