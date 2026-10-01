package sim

import "testing"

func TestAircraftEnduranceLossIsOneOwnerOnlyCause(t *testing.T) {
	e, home := droneServiceFixture(t)
	drone := droneFixtureActor(e, home, "IR.strike")
	droneFarFromHome(drone)
	drone.Endurance = 1
	id := drone.ID
	e.Advance()
	for _, player := range []PlayerID{1, 2} {
		view, ok := e.PlayerView(player)
		if !ok {
			t.Fatal("missing view")
		}
		count := 0
		for _, event := range view.Events {
			if event.Kind == "aircraft_endurance_lost" && event.Entity == id {
				count++
			}
		}
		if player == 1 && count != 1 || player == 2 && count != 0 {
			t.Fatalf("player%d cause count%d", player, count)
		}
	}
	e.Advance()
	count := 0
	for _, event := range e.state.Events {
		if event.Kind == "aircraft_endurance_lost" && event.Entity == id {
			count++
		}
	}
	if count > 1 {
		t.Fatal("loss cause repeated after removal")
	}
}

func TestAircraftCombatLossDoesNotClaimEnduranceCause(t *testing.T) {
	e, home := droneServiceFixture(t)
	drone := droneFixtureActor(e, home, "IR.strike")
	droneFarFromHome(drone)
	drone.HP = 0 // Explicit already-resolved combat death in the fixture.
	e.Advance()
	for _, event := range e.state.Events {
		if event.Kind == "aircraft_endurance_lost" {
			t.Fatal("combat death reported as endurance loss")
		}
	}
}
