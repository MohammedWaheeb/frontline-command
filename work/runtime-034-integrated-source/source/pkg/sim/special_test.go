package sim

import (
	"testing"
)

func TestSalvageEligibilityChannelAndCaps(t *testing.T) {
	e := fixture(t)
	e.player(1).Faction = "SY"
	collector := e.spawn("SY.engineer", 1, Vec{X: 18000, Y: 18000}, true, 400000)
	victim := e.spawn("IR.tank", 2, Vec{X: 21000, Y: 18000}, true, 1600000)
	e.damages = []damage{{Target: victim.ID, Owner: 1, Shooter: collector.ID, Amount: victim.HP, Kind: "cannon"}}
	e.resolveDamage()
	e.cleanup()
	e.damages = nil
	e.updateFog()
	if len(e.state.Salvage) != 1 || e.state.Salvage[0].Value != 120000 {
		t.Fatal("enemy vehicle must drop capped purchase-value salvage")
	}
	crateID := e.state.Salvage[0].ID
	credits := e.player(1).Credits
	issue(t, e, 1, Order{Kind: "salvage", Entities: []ID{collector.ID}, Target: crateID})
	ticks(e, 80)
	if e.player(1).Credits != credits+120000 || e.salvage(crateID) != nil {
		t.Fatal("walk, channel and single collection did not complete")
	}
	for range 3 {
		id := e.newID()
		e.state.Salvage = append(e.state.Salvage, Salvage{ID: id, Owner: 2, Position: collector.Position, Value: 120000, Until: e.state.Tick + 900})
		collector.ChannelTarget = id
		e.collectSalvage(collector)
	}
	if e.player(1).SalvageTotal != 400000 {
		t.Fatal("rolling minute cap bypassed")
	}
	e.state.Tick += seconds(60)
	e.player(1).SalvageTotal = 2990000
	id := e.newID()
	e.state.Salvage = append(e.state.Salvage, Salvage{ID: id, Owner: 2, Position: collector.Position, Value: 120000, Until: e.state.Tick + 900})
	collector.ChannelTarget = id
	e.collectSalvage(collector)
	if e.player(1).SalvageTotal != 3000000 {
		t.Fatal("match cap bypassed")
	}
	e.expireSalvage()
	for _, typ := range []string{"IR.tank", "IR.hauler", "IR.strike"} {
		v := e.spawn(typ, 2, Vec{X: 22000, Y: 18000}, true, 1000000)
		// Prior enemy damage must not make a later friendly kill eligible.
		v.Contributions = []Contribution{{Attacker: collector.ID, Owner: 1, Damage: 1}}
		e.damages = []damage{{Target: v.ID, Owner: 2, Shooter: v.ID, Amount: v.HP, Kind: "shell"}}
		e.resolveDamage()
		e.cleanup()
		e.damages = nil
	}
	if len(e.state.Salvage) != 0 {
		t.Fatal("friendly kills created salvage")
	}
}

func TestGarrisonFireAndUnload(t *testing.T) {
	e := fixture(t)
	house := e.spawn("bunker", 1, Vec{X: 20000, Y: 18000}, true, 600000)
	rifle := e.spawn("US.rifle", 1, Vec{X: 17700, Y: 18000}, true, 300000)
	enemy := e.spawn("IR.rig", 2, Vec{X: 25000, Y: 18000}, true, 1000000)
	before := enemy.HP
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{rifle.ID}, Target: house.ID})
	ticks(e, 100)
	if rifle.Container != house.ID || len(house.Passengers) != 1 {
		t.Fatal("boarding did not complete")
	}
	if enemy.HP >= before {
		t.Fatal("garrison occupant did not fire from structure")
	}
	if e.canSeeEntity(2, rifle) {
		t.Fatal("occupant exposed as independently targetable")
	}
	if code := e.execute(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{rifle.ID}, Target: enemy.ID}); code != "unit_embarked" {
		t.Fatal("embarked ability bypass", code)
	}
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{house.ID}})
	ticks(e, 45)
	if rifle.Container != 0 || len(house.Passengers) != 0 {
		t.Fatal("building unload unavailable")
	}
}

func TestVehicleTurningAndFixedWingPass(t *testing.T) {
	e := fixture(t)
	tank := e.spawn("US.tank", 1, Vec{X: 22000, Y: 22000}, true, 1400000)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{tank.ID}, Position: Vec{X: 15000, Y: 22000}})
	prior := tank.Facing
	for range 45 {
		e.Advance()
		if abs(angleDifference(prior, tank.Facing)) > 9000 {
			t.Fatal("vehicle turned faster than 180 degrees/s")
		}
		prior = tank.Facing
	}
	if tank.Position.X >= 22000 {
		t.Fatal("turning vehicle failed to move")
	}
	home := e.spawn("US.airfield", 1, Vec{X: 20000, Y: 38000}, true, 1500000)
	plane := e.spawn("US.strike", 1, Vec{X: 16000, Y: 32000}, true, 1500000)
	plane.Home = home.ID
	plane.Landed = false
	target := e.spawn("IR.rig", 2, Vec{X: 29000, Y: 32000}, true, 1000000)
	e.spawn("US.engineer", 1, Vec{X: 26000, Y: 30000}, true, 400000)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "attack", Entities: []ID{plane.ID}, Target: target.ID})
	shots := 0
	for range 180 {
		before := plane.Ammo
		pos := plane.Position
		heading := plane.Facing
		e.Advance()
		if abs(angleDifference(heading, plane.Facing)) > 9000 {
			t.Fatal("fixed wing turn rate violated")
		}
		if plane.Ammo < before {
			shots++
			if plane.Position == pos {
				t.Fatal("fixed wing fired while hovering")
			}
		}
	}
	if shots == 0 {
		t.Fatal("flight pass never fired")
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 40)
	ticks(restored, 40)
	if e.Hash() != restored.Hash() {
		t.Fatal("flight pass restore diverged")
	}
}

func TestEndgameIndicatorsDoNotGrantFiringVision(t *testing.T) {
	e := fixture(t)
	e.state.Tick = seconds(35 * 60)
	view, _ := e.PlayerView(1)
	if len(view.Indicators) != 1 {
		t.Fatal("missing qualifying enemy HQ indicator")
	}
	for _, v := range view.Entities {
		if v.Owner == 2 {
			t.Fatal("minimap indicator revealed target")
		}
	}
	enemy := e.entity(3)
	if e.canSee(1, enemy.Position) || e.explored(1, enemy.Position) {
		t.Fatal("indicator changed fog")
	}
	e.state.Tick += seconds(5)
	view, _ = e.PlayerView(1)
	if len(view.Indicators) != 0 {
		t.Fatal("indicator remained beyond five seconds")
	}
}

func TestGroundedAircraftEmergencyLiftRetainsGroundLayer(t *testing.T) {
	e := fixture(t)
	home := e.spawn("US.airfield", 1, Vec{X: 18000, Y: 18000}, true, 2200000)
	plane := e.spawn("US.strike", 1, home.Position, true, 1800000)
	plane.Home = home.ID
	plane.Landed = true
	plane.Endurance = 2000
	home.HP = 0
	e.Advance()
	position := plane.Position
	if !plane.Landed || e.armor(plane) != "light" || plane.EmergencyTakeoffUntil == 0 {
		t.Fatal("grounded aircraft skipped emergency takeoff")
	}
	ticks(e, 39)
	if !plane.Landed || plane.Position != position || plane.Endurance != 1200 {
		t.Fatal("aircraft moved or spent airborne endurance during emergency lift")
	}
	e.Advance()
	if plane.Landed || plane.Endurance != 1199 {
		t.Fatal("emergency lift did not complete after two seconds")
	}
}
func TestAirliftUnloadsBeforeEnduranceReturnAndAtBase(t *testing.T) {
	for _, water := range []bool{false, true} {
		t.Run(map[bool]string{false: "local_drop", true: "return_with_passengers"}[water], func(t *testing.T) {
			e := fixture(t)
			home := e.spawn("US.airfield", 1, Vec{X: 20000, Y: 20000}, true, 2200000)
			transport := e.spawn("US.airlift", 1, Vec{X: 36000, Y: 36000}, true, 1200000)
			transport.Landed = false
			transport.Home = home.ID
			transport.Endurance = 601
			passenger := e.spawn("US.rifle", 1, transport.Position, true, 300000)
			passenger.Container = transport.ID
			transport.Passengers = []ID{passenger.ID}
			if water {
				for y := int32(28); y < 44; y++ {
					for x := int32(28); x < 44; x++ {
						e.state.Map.Tiles[y*64+x].Terrain = "water"
					}
				}
			}
			e.Advance()
			if water && transport.Orders[0].Kind != "return" {
				t.Fatal("airlift chose an illegal local drop")
			}
			if !water && transport.Orders[0].Kind != "unload" {
				t.Fatal("airlift did not schedule local emergency unload")
			}
			ticks(e, 590)
			if passenger.Container != 0 || passenger.HP <= 0 || len(transport.Passengers) != 0 {
				t.Fatal("passengers were not safely unloaded")
			}
			if !water && distance(passenger.Position, Vec{X: 36000, Y: 36000}) > 5000 {
				t.Fatal("local emergency unload exceeded five tiles")
			}
		})
	}
}
func TestPingsAreTeamOnlyAndBounded(t *testing.T) {
	e := fixture(t)
	issue(t, e, 1, Order{Kind: "ping", Position: Vec{X: 30000, Y: 30000}, Type: "danger"})
	mine, _ := e.PlayerView(1)
	enemy, _ := e.PlayerView(2)
	count := 0
	for _, event := range mine.Events {
		if event.Kind == "tactical_ping" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("owner missing tactical ping")
	}
	for _, event := range enemy.Events {
		if event.Kind == "tactical_ping" {
			t.Fatal("enemy received private tactical ping")
		}
	}
	for range 2 {
		issue(t, e, 1, Order{Kind: "ping", Position: Vec{X: 30000, Y: 30000}})
	}
	if code := e.execute(1, Order{Kind: "ping", Position: Vec{X: 30000, Y: 30000}}); code != "ping_rate_exceeded" {
		t.Fatal("unbounded pings")
	}
}
