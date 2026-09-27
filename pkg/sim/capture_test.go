package sim

import (
	"testing"
)

func capturedBunker(t *testing.T) (*Engine, *Entity, []*Entity) {
	t.Helper()
	e := fixture(t)
	building := e.spawn("bunker", 2, Vec{X: 30000, Y: 30000}, true, 400000)
	building.HP = building.MaxHP / 5
	passengers := []*Entity{e.spawn("IR.rifle", 2, building.Position, true, 200000), e.spawn("IR.at", 2, building.Position, true, 400000)}
	for i, p := range passengers {
		p.HP -= int64(17000 + i*11000)
		p.Container = building.ID
		p.State = "embarked"
		building.Passengers = append(building.Passengers, p.ID)
	}
	e.recalculate()
	e.updateFog()
	return e, building, passengers
}
func TestCaptureEjectsPassengersHealthyWithoutTransferringControl(t *testing.T) {
	e, building, passengers := capturedBunker(t)
	health := []int64{passengers[0].HP, passengers[1].HP}
	count, nextID := len(e.state.Entities), e.state.NextID
	if !e.captureBuilding(1, building) {
		t.Fatal("legal capture failed")
	}
	if building.Owner != 1 || len(building.Passengers) != 0 || len(e.state.Entities) != count || e.state.NextID != nextID {
		t.Fatal("capture created actors or retained passengers")
	}
	for i, p := range passengers {
		if p.Owner != 2 || p.Container != 0 || p.HP != health[i] || p.State != "idle" || !e.clear(p.Position, e.radius(p), p.ID, false, true) {
			t.Fatal("ordinary capture damaged, stole or overlapped passenger")
		}
		if e.distanceTo(building, p.Position)-e.radius(p) > 2000 {
			t.Fatal("passenger teleported beyond lawful exit radius")
		}
	}
	if dist2(passengers[0].Position, passengers[1].Position) < int64(e.radius(passengers[0])+e.radius(passengers[1]))*int64(e.radius(passengers[0])+e.radius(passengers[1])) {
		t.Fatal("atomic reserved exits overlap")
	}
}
func TestCaptureBlockedExitsWaitAtomicallyAndRecover(t *testing.T) {
	e, building, passengers := capturedBunker(t)
	e.state.Map.Shipment = Vec{X: 40000, Y: 40000}
	for y := int32(25); y <= 35; y++ {
		for x := int32(25); x <= 35; x++ {
			if x < 29 || x >= 31 || y < 29 || y >= 31 {
				e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
			}
		}
	}
	e.state.Map.Tiles[29*e.state.Map.Width+31].Terrain = "open"
	e.state.Map.Tiles[30*e.state.Map.Width+31].Terrain = "open"
	engineer := e.spawn("US.engineer", 1, Vec{X: 31500, Y: 30000}, true, 500000)
	e.updateFog()
	e.beginChannel(engineer, "capture", building.ID, 0)
	beforeHP := passengers[0].HP
	beforePaid := building.Paid
	building.Jobs = []Job{{Type: "IR.rifle", Paid: 200000, Required: 400, Work: 40, Supply: 1, Started: true}}
	e.recalculate()
	e.updateChannel(engineer)
	if building.Owner != 2 || len(building.Passengers) != 2 || passengers[0].HP != beforeHP || passengers[0].Container != building.ID || len(building.Jobs) != 1 || building.Paid != beforePaid || engineer.State != "capture_exit_blocked" || engineer.Channel != "capture" {
		t.Fatal("blocked capture partially transferred or damaged state")
	}
	found := false
	for _, event := range e.state.Events {
		if event.Kind == "capture_exit_blocked" {
			found = true
		}
	}
	if !found {
		t.Fatal("blocked capture lacked actionable event")
	}
	// Open the same existing exit space on both native and restored worlds.
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for _, engine := range []*Engine{e, restored} {
		for y := int32(25); y <= 35; y++ {
			for x := int32(25); x <= 35; x++ {
				engine.state.Map.Tiles[y*engine.state.Map.Width+x].Terrain = "open"
			}
		}
		engine.state.Tick = engine.entity(engineer.ID).ChannelUntil
		engine.updateFog()
		engine.updateChannel(engine.entity(engineer.ID))
	}
	if e.Hash() != restored.Hash() || building.Owner != 1 || passengers[0].HP != beforeHP || len(building.Jobs) != 0 {
		t.Fatal("unblocked capture did not transfer once with healthy exits")
	}
}
func TestCapturedAirProducerRetainsPhysicalFoundationAcrossConversions(t *testing.T) {
	e := fixture(t)
	e.player(2).Faction = "SY"
	building := e.spawn("SY.workshop_air", 2, Vec{X: 30000, Y: 30000}, true, 1000000)
	building.Work = 1200
	building.HP = building.MaxHP / 5
	e.state.Map.Tiles[30*e.state.Map.Width+32].Terrain = "cliff"
	probe := Vec{X: 32000, Y: 28000}
	if !e.clear(probe, 350, 0, false, true) {
		t.Fatal("original footprint unexpectedly blocked adjacent point")
	}
	id, paid, healthPercent := building.ID, building.Paid, building.HP*1000/building.MaxHP
	originalRevision := e.state.NavigationRevision
	if !e.captureBuilding(1, building) {
		t.Fatal("capture failed")
	}
	if building.ID != id || building.Paid != paid || building.Type != "US.airfield" || building.FootprintType != "SY.workshop_air" || building.FootprintWidth != 3 || building.FootprintHeight != 3 || building.HP*1000/building.MaxHP != healthPercent || building.DisabledUntil != e.Tick()+200 || building.Channel != "conversion" || e.state.NavigationRevision != originalRevision {
		t.Fatal("conversion changed foundation, paid basis, health ratio or outage")
	}
	if !e.clear(probe, 350, 0, false, true) {
		t.Fatal("converted catalog size blocked original legal corridor")
	}
	dummy := &Entity{Position: Vec{X: 34000, Y: 30000}}
	if e.edgeDistance(building, dummy) != 2500 {
		t.Fatal("combat range uses converted catalog footprint")
	}
	approach := e.approachPoint(&Entity{Type: "US.engineer", Position: Vec{X: 36000, Y: 30000}}, building)
	if approach.X != 32100 {
		t.Fatalf("entrance does not use original foundation: %+v", approach)
	}
	e.updateFog()
	if code := e.validPlacement(1, Vec{X: 33500, Y: 28000}, 2, 2); code != "ok" {
		t.Fatalf("retained foundation blocked adjacent legal construction: %s", code)
	}
	view, _ := e.PlayerView(1)
	for _, visible := range view.Entities {
		if visible.ID == id && (visible.FootprintWidth != 3 || visible.FootprintType != "SY.workshop_air") {
			t.Fatal("public geometry omitted retained dimensions")
		}
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if restored.entity(id).FootprintType != "SY.workshop_air" {
		t.Fatal("footprint lost on restore")
	}
	// Capturing back does not restore a larger/smaller physical foundation or
	// refill health. Completed build work is normalized for the new operating type.
	if !e.captureBuilding(2, building) || building.Type != "SY.workshop_air" || building.FootprintWidth != 3 || building.Paid != paid || building.HP*1000/building.MaxHP != healthPercent {
		t.Fatal("recapture inflated value/health or changed geometry")
	}
	save, _ = e.Save()
	if _, err = Restore(e.catalog, save); err != nil {
		t.Fatal(err)
	}
}
func TestCaptureDropsOldServiceAssignmentsAndPreservesOwnedAircraft(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 2)
	captured := e.spawn("IR.drone_hub", 2, Vec{X: 28000, Y: 32000}, true, 1500000)
	captured.HP = captured.MaxHP / 5
	alternate := e.spawn("IR.drone_hub", 2, Vec{X: 45000, Y: 32000}, true, 1500000)
	plane := e.spawn("IR.isr", 2, captured.Position, true, 600000)
	plane.Home = captured.ID
	plane.ServiceWork = 100
	plane.Endurance = 2000
	captured.Jobs = []Job{{Type: "IR.fighter", Paid: 900000, Supply: 4, Required: 500, Work: 100, Started: true, Service: captured.ID}}
	e.recalculate()
	oldCredits := e.player(2).Credits
	if !e.captureBuilding(1, captured) {
		t.Fatal("air capture failed")
	}
	if plane.Owner != 2 || plane.Home != alternate.ID || plane.ServiceWork != 0 || plane.Endurance != 1200 || plane.EmergencyTakeoffUntil != e.Tick()+40 || !plane.Landed || len(captured.Jobs) != 0 || e.player(2).Credits != oldCredits || e.player(2).ReservedSupply != 0 {
		t.Fatal("capture refunded jobs, stole planes or missed immediate rebase")
	}
	if e.freeService(1) != 0 {
		t.Fatal("converting producer operated before ten-second outage ended")
	}
	ticks(e, 39)
	if !plane.Landed {
		t.Fatal("emergency takeoff started before two seconds")
	}
	e.Advance()
	if plane.Landed {
		t.Fatal("captured aircraft did not take off")
	}
	ticks(e, 160)
	if captured.Channel != "" || !captured.Active(e.Tick()) || e.freeService(1) != captured.ID {
		t.Fatal("converted service did not become available after ten seconds")
	}
	rule, _ := e.buildingRule(captured.Type)
	if rule.ServiceSlots != 6 {
		t.Fatal("new service roster capacity missing")
	}
}
func TestCaptureDoesNotRefillChargesAndMayExceedCaps(t *testing.T) {
	t.Run("structure", func(t *testing.T) {
		e := fixture(t)
		for i := 0; i < 59; i++ {
			e.spawn("power", 1, Vec{X: int32(2000 + i%12*4000), Y: int32(20000 + i/12*6000)}, true, 0)
		}
		target := e.spawn("power", 2, Vec{X: 48000, Y: 10000}, true, 500000)
		target.HP = target.MaxHP / 5
		before := len(e.state.Entities)
		if !e.captureBuilding(1, target) || len(e.state.Entities) != before {
			t.Fatal("structure cap rejected capture or created an actor")
		}
		if code := e.startBuilding(e.player(1), e.entity(2), Order{Type: "power", Position: Vec{X: 12000, Y: 13000}}); code != "structure_cap" {
			t.Fatalf("over-cap owner could construct: %s", code)
		}
	})
	e := fixture(t)
	baseInfrastructure(e, 1)
	for i := 0; i < 16; i++ {
		e.spawn("turret", 1, Vec{X: int32(2000 + i%10*5000), Y: int32(30000 + i/10*7000)}, false, 0)
	}
	battery := e.spawn("abm", 2, Vec{X: 40000, Y: 49000}, true, 1800000)
	battery.HP = battery.MaxHP / 5
	battery.Charges = 1
	battery.ChargeWork = 123
	battery.FireAt = 321
	count := len(e.state.Entities)
	if !e.captureBuilding(1, battery) || len(e.state.Entities) != count || battery.Charges != 1 || battery.ChargeWork != 123 || battery.FireAt != 321 {
		t.Fatal("capture rejected overflow or refilled interception")
	}
	var rig *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "rig" {
			rig = v
		}
	}
	if code := e.startBuilding(e.player(1), rig, Order{Type: "turret", Position: Vec{X: 15000, Y: 15000}}); code != "defense_cap" {
		t.Fatalf("over-cap owner could build defense: %s", code)
	}
}
func TestCaptureFootprintValidationAndFogMemory(t *testing.T) {
	e := fixture(t)
	home := e.spawn("IR.drone_hub", 2, Vec{X: 15000, Y: 12000}, true, 1500000)
	home.HP = home.MaxHP / 5
	e.updateFog()
	if !e.captureBuilding(1, home) {
		t.Fatal("capture failed")
	}
	e.updateFog()
	observer := e.spawn("IR.recon", 2, Vec{X: 18000, Y: 12000}, true, 0)
	e.updateFog()
	observer.Position = Vec{X: 55000, Y: 55000}
	e.updateFog()
	found := false
	for _, memory := range e.player(2).Memory {
		if memory.ID == home.ID {
			found = true
			if memory.FootprintWidth != 4 || memory.FootprintType != "IR.drone_hub" {
				t.Fatal("fog memory expanded converted structure")
			}
		}
	}
	if !found {
		t.Fatal("fixture lacks observed structure memory")
	}
	for _, mutate := range []func(*State){func(s *State) { s.Entities[0].FootprintWidth++ }, func(s *State) { s.Entities[1].FootprintType = "power" }, func(s *State) { s.Entities[len(s.Entities)-2].FootprintType = "power" }, func(s *State) { s.SpawnPlayers = []PlayerID{1, 1} }} {
		state := e.StateCopy()
		mutate(&state)
		if _, err := Restore(e.catalog, signedState(state)); err == nil {
			t.Fatal("forged physical footprint or spawn order accepted")
		}
	}
}

func TestCaptureSafehouseBecomesOutpostAndDoesNotShareResearch(t *testing.T) {
	e := fixture(t)
	e.player(2).Faction = "SY"
	e.player(2).Upgrades = []string{"SY.prepared_exits"}
	house := e.spawn("SY.safehouse", 2, Vec{X: 25000, Y: 28000}, true, 800000)
	house.HP = house.MaxHP / 5
	house.Channel = "transit"
	house.ChannelUntil = 99
	passenger := e.spawn("SY.rifle", 2, house.Position, true, 200000)
	passenger.Container = house.ID
	passenger.HP = 123000
	house.Passengers = []ID{passenger.ID}
	if !e.captureBuilding(1, house) || house.Type != "outpost" || house.FootprintType != "SY.safehouse" || house.Channel != "conversion" || house.ChannelUntil != 200 || passenger.HP != 123000 || passenger.Owner != 2 || passenger.Container != 0 || len(e.player(1).Upgrades) != 0 {
		t.Fatal("captured safehouse retained network, injured occupant or transferred research")
	}
	ticks(e, 200)
	if house.Channel != "" || e.capacity(house) != 0 || !house.Active(e.Tick()) {
		t.Fatal("safehouse conversion did not finish as an ordinary outpost")
	}
}
func TestCaptureReplayAndMidChannelSavePreserveOutcome(t *testing.T) {
	e := fixture(t)
	target := e.spawn("power", 2, Vec{X: 28000, Y: 30000}, true, 500000)
	target.HP = target.MaxHP / 5
	engineer := e.spawn("US.engineer", 1, Vec{X: 29500, Y: 30000}, true, 500000)
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID})
	ticks(e, 79)
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 100)
	ticks(restored, 100)
	if target.Owner != 1 || e.Hash() != restored.Hash() {
		t.Fatal("mid-channel save changed capture outcome")
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	replayed, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || replayed.Hash() != e.Hash() {
		t.Fatal("capture replay did not match live state", err)
	}
	count := 0
	for _, event := range e.state.Events {
		if event.Kind == "building_captured" {
			count++
		}
	}
	if count > 1 {
		t.Fatal("capture side effect duplicated")
	}
}
func TestCaptureRepairsOrDistanceCancelChannelWhileExitsWait(t *testing.T) {
	for _, kind := range []string{"repair", "damage", "distance"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			target := e.spawn("power", 2, Vec{X: 28000, Y: 30000}, true, 500000)
			target.HP = target.MaxHP / 5
			engineer := e.spawn("US.engineer", 1, Vec{X: 29500, Y: 30000}, true, 500000)
			e.updateFog()
			e.beginChannel(engineer, "capture", target.ID, 160)
			switch kind {
			case "repair":
				target.HP = target.MaxHP / 4
			case "damage":
				engineer.LastDamage = 1
			case "distance":
				engineer.Position.X = 35000
			}
			e.updateChannel(engineer)
			if engineer.Channel != "" || target.Owner != 2 {
				t.Fatal("invalid capture was not interrupted")
			}
		})
	}
}
func TestCapturedSmallAirfieldSupportsSixDistinctLegalPads(t *testing.T) {
	e := fixture(t)
	e.player(2).Faction = "SY"
	home := e.spawn("SY.workshop_air", 2, Vec{X: 30000, Y: 30000}, true, 1000000)
	home.HP = home.MaxHP / 5
	if !e.captureBuilding(1, home) {
		t.Fatal("capture failed")
	}
	e.state.Tick = 200
	e.updateChannel(home)
	e.recalculate()
	planes := []*Entity{}
	for i := 0; i < 6; i++ {
		if e.freeService(1) != home.ID {
			t.Fatal("new six-slot capacity did not retain free reservation")
		}
		plane := e.spawn("US.fighter", 1, Vec{X: int32(18000 + i*1500), Y: 22000}, true, 1000000)
		plane.Home = home.ID
		point, ok := e.serviceLandingPosition(plane, home)
		if !ok {
			t.Fatalf("no legal service pad for slot %d", i)
		}
		plane.Position = point
		plane.LastPosition = point
		plane.Landed = true
		planes = append(planes, plane)
	}
	if e.freeService(1) != 0 {
		t.Fatal("seventh aircraft bypassed captured service cap")
	}
	for _, plane := range planes {
		if !e.clearExcept(plane.Position, e.radius(plane), plane.ID, home.ID, false, true) {
			t.Fatal("service pads overlap terrain or actors")
		}
	}
	save, _ := e.Save()
	if _, err := Restore(e.catalog, save); err != nil {
		t.Fatal(err)
	}
}
func TestCapturedAirProducerWaitsForClearProductionPad(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 1)
	e.player(2).Faction = "SY"
	home := e.spawn("SY.workshop_air", 2, Vec{X: 30000, Y: 40000}, true, 1000000)
	home.HP = home.MaxHP / 5
	if !e.captureBuilding(1, home) {
		t.Fatal("capture failed")
	}
	e.state.Tick = 200
	e.updateChannel(home)
	e.recalculate()
	// A deliberately solid ring of actors blocks all internal and nearby pads.
	obstacles := []*Entity{}
	for y := int32(35500); y <= 44500; y += 900 {
		for x := int32(25500); x <= 34500; x += 900 {
			obstacles = append(obstacles, e.spawn("US.hauler", 1, Vec{X: x, Y: y}, true, 0))
		}
	}
	home.Jobs = []Job{{Type: "US.fighter", Started: true, Paid: 1000000, Supply: 4, Service: home.ID, Required: 20, Work: 20}}
	count, nextID := len(e.state.Entities), e.state.NextID
	e.updateJobs(e.player(1), home)
	if len(home.Jobs) != 1 || home.State != "exit_blocked" || len(e.state.Entities) != count || e.state.NextID != nextID {
		t.Fatal("production spawned into occupied retained foundation")
	}
	for _, obstacle := range obstacles {
		obstacle.HP = 0
	}
	e.updateJobs(e.player(1), home)
	if len(home.Jobs) != 0 || len(e.state.Entities) != count+1 {
		t.Fatal("production failed to resume after clearing legal pads")
	}
}
func TestCapturedServiceReassignsOtherProducersPaidReservation(t *testing.T) {
	e := fixture(t)
	baseInfrastructure(e, 2)
	captured := e.spawn("IR.drone_hub", 2, Vec{X: 28000, Y: 32000}, true, 1500000)
	captured.HP = captured.MaxHP / 5
	producer := e.spawn("IR.drone_hub", 2, Vec{X: 45000, Y: 32000}, true, 1500000)
	producer.Jobs = []Job{{Type: "IR.fighter", Paid: 900000, Supply: 4, Required: 500, Work: 100, Started: true, Service: captured.ID}}
	before := e.player(2).Credits
	if !e.captureBuilding(1, captured) {
		t.Fatal("capture failed")
	}
	if producer.Jobs[0].Service != producer.ID || producer.Jobs[0].Paid != 900000 || producer.Jobs[0].Work != 100 || e.player(2).Credits != before {
		t.Fatal("paid production reservation lost money/progress or remained enemy-owned")
	}
	e.updateJobs(e.player(2), producer)
	if producer.Jobs[0].Work <= 100 {
		t.Fatal("compatible replacement slot did not resume production")
	}
}
