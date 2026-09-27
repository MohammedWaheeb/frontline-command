package sim

import "testing"

func strategicFixture(t *testing.T, faction string) (*Engine, *Entity) {
	e := fixture(t)
	e.player(1).Faction = faction
	baseInfrastructure(e, 1)
	for i := 0; i < 6; i++ {
		e.spawn("power", 1, Vec{X: 4000 + int32(i)*5000, Y: 38000}, true, 600000)
	}
	site := e.spawn("strategic", 1, Vec{X: 35000, Y: 38000}, true, 4500000)
	e.player(1).Credits = 20000000
	e.recalculate()
	e.updateFog()
	site.ChargeWork = e.strategicCharge(faction)
	return e, site
}
func TestSkybreakerRealFlightBombsAndExperience(t *testing.T) {
	e, site := strategicFixture(t, "US")
	target := e.entity(3)
	e.spawn("US.engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
	e.updateFog()
	hp := target.HP
	point := target.Position
	issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Points: []Vec{point, point, point}})
	planes := []*Entity{}
	for _, v := range e.state.Entities {
		if e.role(v) == "support_plane" {
			planes = append(planes, v)
		}
	}
	if len(planes) != 3 {
		t.Fatal("Skybreaker did not create three support planes")
	}
	for i, a := range planes {
		for _, b := range planes[i+1:] {
			if distance(a.Position, b.Position) < 1200 {
				t.Fatal("support planes entered overlapping")
			}
		}
	}
	if code := e.execute(1, Order{Kind: "move", Entities: []ID{planes[0].ID}, Position: point}); code != "unit_not_controllable" {
		t.Fatal("strategic aircraft became controllable")
	}
	ticks(e, 238)
	if target.HP != hp {
		t.Fatal("bomb struck before twelve-second warning")
	}
	ticks(e, 30)
	if target.HP != hp-1200000 || target.HP <= 0 {
		t.Fatalf("unexpected Skybreaker HQ damage: %d", hp-target.HP)
	}
	for _, v := range planes {
		if v.Position.X < 50000 {
			t.Fatal("bombs dropped without real aircraft approach")
		}
	}
	// Support planes have a fixed 200 experience budget despite being temporary.
	fighter := e.spawn("IR.fighter", 2, Vec{X: 49000, Y: 54000}, true, 1200000)
	victim := planes[0]
	e.damages = []damage{{Target: victim.ID, Shooter: fighter.ID, Owner: 2, Amount: victim.HP, Kind: "antiair"}}
	e.resolveDamage()
	e.damages = nil
	e.cleanup()
	if fighter.Experience != 200000 {
		t.Fatal("support-plane XP budget incorrect", fighter.Experience)
	}
}
func TestSaturationPersistsAfterSiteLoss(t *testing.T) {
	e, site := strategicFixture(t, "IR")
	target := e.entity(3)
	point := target.Position
	e.spawn("IR.engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
	e.updateFog()
	hp := target.HP
	issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Points: []Vec{point, point, point}})
	if len(e.state.Projectiles) != 6 {
		t.Fatal("salvo should create six individually interceptable missiles")
	}
	site.HP = 0
	e.cleanup()
	ticks(e, 278)
	if target.HP != hp {
		t.Fatal("first salvo arrived before fourteen seconds")
	}
	ticks(e, 63)
	if target.HP != hp-1320000 || target.HP <= 0 {
		t.Fatalf("site destruction canceled or altered launched salvo: %d", hp-target.HP)
	}
}
func TestRaidInterruptedHouseAndTemporarySupply(t *testing.T) {
	e, _ := strategicFixture(t, "SY")
	a := e.spawn("SY.safehouse", 1, Vec{X: 40000, Y: 20000}, true, 900000)
	b := e.spawn("SY.safehouse", 1, Vec{X: 45000, Y: 20000}, true, 900000)
	e.state.Tick = seconds(20)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{a.ID, b.ID}})
	if e.player(1).ReservedSupply != 8 {
		t.Fatal("raid supply not reserved")
	}
	e.damages = []damage{{Target: a.ID, Owner: 2, Shooter: 3, Amount: 1000, Kind: "small"}}
	e.resolveDamage()
	e.damages = nil
	ticks(e, 241)
	count := 0
	for _, v := range e.state.Entities {
		if v.TemporaryUntil > 0 {
			count++
			if v.Owner != 1 || v.Paid != 0 {
				t.Fatal("invalid temporary raid unit")
			}
		}
	}
	if count != 2 || e.player(1).ReservedSupply != 0 {
		t.Fatal("interrupted house spawned or reservation leaked", count)
	}
	ticks(e, 900)
	for _, v := range e.state.Entities {
		if v.TemporaryUntil > 0 {
			t.Fatal("temporary raid army did not withdraw")
		}
	}
}
func TestShieldPreparationRegenerationAndPackCancellation(t *testing.T) {
	e, _ := strategicFixture(t, "SA")
	anchor := e.spawn("SA.mobile_abm", 1, Vec{X: 19000, Y: 30000}, true, 1400000)
	anchor.Deployed = true
	vehicle := e.spawn("SA.tank", 1, Vec{X: 22000, Y: 30000}, true, 1400000)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{anchor.ID}})
	ticks(e, 238)
	if e.hasBuff(vehicle, "shieldline") {
		t.Fatal("shield active before preparation")
	}
	ticks(e, 3)
	w, _ := e.catalog.Weapon("STRIKE")
	damage := e.projectileDamage(&Projectile{Weapon: w.ID, Damage: 100000}, vehicle, w)
	if damage != 80000 {
		t.Fatal("shield air damage reduction wrong", damage)
	}
	before := anchor.ChargeWork
	ticks(e, 20)
	if anchor.ChargeWork-before != 80 {
		t.Fatal("shield did not double only regeneration")
	}
	issue(t, e, 1, Order{Kind: "pack", Entities: []ID{anchor.ID}})
	ticks(e, 2)
	if len(e.state.Zones) != 0 || e.hasBuff(vehicle, "shieldline") {
		t.Fatal("packing anchor did not end shield")
	}
}
