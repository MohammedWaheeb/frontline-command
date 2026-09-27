package sim

import "testing"

func TestPassengerExitReservationsAreAtomic(t *testing.T) {
	e := fixture(t)
	e.player(1).Faction = "SY"
	source := e.spawn("SY.safehouse", 1, Vec{X: 16000, Y: 16000}, true, 0)
	destination := e.spawn("SY.safehouse", 1, Vec{X: 30000, Y: 30000}, true, 0)
	a := e.spawn("SY.rifle", 1, source.Position, true, 0)
	b := e.spawn("SY.at", 1, source.Position, true, 0)
	source.Passengers = []ID{a.ID, b.ID}
	a.Container, b.Container = source.ID, source.ID
	// Keep a single one-squad exit while sealing every other candidate with
	// synthetic terrain. Independent probes would both choose this same exit.
	for y := int32(24); y <= 36; y++ {
		for x := int32(24); x <= 36; x++ {
			e.state.Map.Tiles[y*64+x].Terrain = "blocked"
		}
	}
	for y := int32(29); y <= 30; y++ {
		e.state.Map.Tiles[y*64+32].Terrain = "open"
	}
	if _, ok := e.exitPosition(destination, a.Type, a.ID, 2000); !ok {
		t.Fatal("test has no first exit")
	}
	if _, ok := e.passengerExits(destination, source.Passengers, 2000); ok {
		t.Fatal("two passengers shared one exit")
	}
	e.updateFog()
	e.beginChannel(source, "transit", destination.ID, 0)
	e.updateChannel(source)
	if a.Container != source.ID || b.Container != source.ID || len(source.Passengers) != 2 || source.Channel != "" {
		t.Fatal("failed transit partially moved passengers")
	}
	a.EverDealt = true
	a.LastDealt = e.Tick()
	if e.transferQuiet(source) {
		t.Fatal("firing garrison counted as out of combat")
	}
}

func TestVolleyReservesSecondChargeAndMovementCancelsIt(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		e := fixture(t)
		e.player(1).Faction = "IR"
		launcher := e.spawn("IR.launcher", 1, Vec{X: 20000, Y: 30000}, true, 2000000)
		launcher.Deployed, launcher.Charges = true, 2
		point := Vec{X: 40000, Y: 30000}
		e.spawn("IR.engineer", 1, Vec{X: 39000, Y: 29000}, true, 0)
		e.spawn("barracks", 2, point, true, 0)
		e.updateFog()
		before := e.player(1).Credits
		issue(t, e, 1, Order{Kind: "ability", Type: "volley", Entities: []ID{launcher.ID}, Points: []Vec{point, point}})
		if launcher.Charges != 1 || len(e.state.Projectiles) != 1 {
			t.Fatal("automatic targeting consumed reserved charge")
		}
		if cancel {
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{launcher.ID}, Position: Vec{X: 23000, Y: 33000}})
			ticks(e, 35)
			if launcher.Charges != 1 || e.player(1).Credits != before-300000 || len(e.state.Projectiles) != 1 {
				t.Fatal("canceled volley spent second charge/cost")
			}
		} else {
			ticks(e, 29)
			if launcher.Charges != 1 || len(e.state.Projectiles) != 1 {
				t.Fatal("second missile launched early")
			}
			ticks(e, 1)
			if launcher.Charges != 0 || len(e.state.Projectiles) != 2 || e.player(1).Credits != before-600000 {
				t.Fatal("timed volley did not spend exactly two paid charges")
			}
		}
	}
}
