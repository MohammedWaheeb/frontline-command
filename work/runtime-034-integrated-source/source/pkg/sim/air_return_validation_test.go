package sim

import "testing"

func TestLandedAircraftCanQueueDepartureThenReturn(t *testing.T) {
	for _, typ := range []string{"US.fighter", "US.strike", "US.gunship", "US.airlift", "IR.fighter", "IR.strike", "IR.gunship", "IR.isr", "SY.scout_drone", "SA.fighter", "SA.strike", "SA.gunship"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			faction := typ[:2]
			e.player(1).Faction = faction
			homeType := map[string]string{"US": "US.airfield", "IR": "IR.drone_hub", "SY": "SY.workshop_air", "SA": "SA.airfield"}[faction]
			home := e.spawn(homeType, 1, Vec{X: 24000, Y: 24000}, true, 0)
			aircraft := droneFixtureActor(e, home.ID, typ)
			e.recalculate()
			e.updateFog()
			if !aircraft.Landed || e.armor(aircraft) != "light" {
				t.Fatal("fixture must be a grounded aircraft")
			}
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			orders := []Order{{Kind: "move", Entities: []ID{aircraft.ID}, Position: Vec{X: 32000, Y: 28000}}, {Kind: "return", Entities: []ID{aircraft.ID}, Queued: true}}
			if err = e.Submit(1, 1, orders); err != nil {
				t.Fatal(err)
			}
			e.Advance()
			if len(e.state.Results) != 2 {
				t.Fatal(e.state.Results)
			}
			for _, result := range e.state.Results {
				if !result.Accepted {
					t.Fatalf("landed sortie rejected %+v", result)
				}
			}
			if len(aircraft.Orders) != 2 || aircraft.Orders[1].Kind != "return" {
				t.Fatal("return missing from queue", aircraft.Orders)
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			seenFlying := !aircraft.Landed
			returned := false
			for range 1600 {
				e.Advance()
				restored.Advance()
				seenFlying = seenFlying || !aircraft.Landed
				if seenFlying && aircraft.Landed && len(aircraft.Orders) == 0 {
					returned = true
					break
				}
			}
			if !returned || aircraft.Home != home.ID || aircraft.HP <= 0 {
				t.Fatalf("sortie failed: flew%v landed%v state%s orders%+v", seenFlying, aircraft.Landed, aircraft.State, aircraft.Orders)
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("queued sortie restore diverged")
			}
			replay.Capture(e, false)
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("queued sortie replay diverged", err)
			}
			issue(t, e, 1, Order{Kind: "return", Entities: []ID{aircraft.ID}})
		})
	}
}

func TestReturnStillRejectsGroundUnits(t *testing.T) {
	e := fixture(t)
	for _, typ := range []string{"US.rifle", "US.tank", "US.rig"} {
		actor := e.spawn(typ, 1, Vec{X: 20000, Y: 20000}, true, 0)
		if got := e.execute(1, Order{Kind: "return", Entities: []ID{actor.ID}}); got != "aircraft_required" {
			t.Fatal(typ, got)
		}
	}
}

func TestTwoLandedGunshipsAcceptAttackThenQueuedReturn(t *testing.T) {
	e := fixture(t)
	home := e.spawn("US.airfield", 1, Vec{X: 24000, Y: 24000}, true, 0)
	a := droneFixtureActor(e, home.ID, "US.gunship")
	b := droneFixtureActor(e, home.ID, "US.gunship")
	target := e.spawn("power", 2, Vec{X: 29000, Y: 24000}, true, 0)
	target.HP = 40000
	e.recalculate()
	e.updateFog()
	ids := []ID{a.ID, b.ID}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	if err = e.Submit(1, 1, []Order{{Kind: "attack", Entities: ids, Target: target.ID}, {Kind: "return", Entities: ids, Queued: true}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 2 {
		t.Fatal(e.state.Results)
	}
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatalf("actual campaign batch rejected: %+v", result)
		}
	}
	for range 1200 {
		e.Advance()
		if target.HP <= 0 && a.Landed && b.Landed && len(a.Orders) == 0 && len(b.Orders) == 0 {
			break
		}
	}
	if target.HP > 0 || !a.Landed || !b.Landed || a.HP <= 0 || b.HP <= 0 || len(a.Orders) != 0 || len(b.Orders) != 0 {
		t.Fatalf("attack and return did not finish: A=%+v B=%+v targetHP=%d", a, b, target.HP)
	}
	replay.Capture(e, false)
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("attack sortie replay", err)
	}
}
