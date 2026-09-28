package sim

import (
	"fmt"
	"testing"
)

func TestDeploymentPresentationFollowsAuthoritativeClockAndRestore(t *testing.T) {
	for _, typ := range []string{"US.launcher", "IR.launcher", "SY.launcher", "SA.launcher", "SA.tank", "SA.mobile_abm", "SA.repair"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(typ, 1, Vec{X: 20000, Y: 20000}, true, 0)
			e.spawn("IR.recon", 2, Vec{X: 24000, Y: 22000}, true, 0)
			e.recalculate()
			e.updateFog()
			e.state.Tick = 100
			e.changeDeployment(v, true)
			start, end := e.Tick(), v.DeployUntil
			for e.Tick() < start+(end-start)/2 {
				e.Advance()
			}
			check := func(engine *Engine, want int32) {
				t.Helper()
				for _, player := range []PlayerID{1, 2} {
					view, _ := engine.PlayerView(player)
					found := false
					for _, actor := range view.Entities {
						if actor.ID == v.ID {
							found = true
							if actor.Progress != want {
								t.Fatalf("player%d %s progress%d want%d", player, actor.State, actor.Progress, want)
							}
						}
					}
					if !found {
						t.Fatal("fixture lost visible actor")
					}
				}
			}
			check(e, 500)
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			check(restored, 500)
			for e.Tick() < end {
				e.Advance()
				restored.Advance()
			}
			if !v.Deployed || v.DeploymentStarted != 0 || e.Hash() != restored.Hash() {
				t.Fatal("deployment completion/restore drift")
			}
			e.changeDeployment(v, false)
			start, end = e.Tick(), v.PackingUntil
			for e.Tick() < start+(end-start)/2 {
				e.Advance()
			}
			check(e, 500)
			for e.Tick() < end {
				e.Advance()
			}
			if v.Deployed || v.DeploymentStarted != 0 || v.State != "idle" {
				t.Fatal("packing visual state did not finish")
			}
		})
	}
}

func TestRepairPoseEndsWhenNoRepairIsPerformed(t *testing.T) {
	e := fixture(t)
	medic := e.spawn("US.medic", 1, Vec{X: 20000, Y: 20000}, true, 0)
	rifle := e.spawn("US.rifle", 1, Vec{X: 21000, Y: 20000}, true, 0)
	rifle.HP -= 500
	e.updateSupport()
	if medic.State != "repairing" || rifle.HP != rifle.MaxHP {
		t.Fatal("fixture should finish healing this tick")
	}
	e.updateSupport()
	if medic.State == "repairing" {
		t.Fatal("completed healing keeps playing work pose")
	}
}

func TestSellingPresentationUsesChannelClockAndRestores(t *testing.T) {
	e := fixture(t)
	building := e.spawn("power", 1, Vec{X: 20000, Y: 20000}, true, 500000)
	e.spawn("IR.engineer", 2, Vec{X: 24000, Y: 22000}, true, 0)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "sell", Entities: []ID{building.ID}})
	for range 50 {
		e.Advance()
	}
	// Production can change activity while the sell channel still governs removal.
	building.State = "producing"
	check := func(engine *Engine) {
		t.Helper()
		before := engine.Hash()
		for _, player := range []PlayerID{1, 2} {
			view, _ := engine.PlayerView(player)
			found := false
			for _, actor := range view.Entities {
				if actor.ID == building.ID {
					found = true
					if actor.State != "selling" || actor.Progress < 490 || actor.Progress > 510 {
						t.Fatalf("selling view %+v", actor)
					}
				}
			}
			if !found {
				t.Fatal("fixture lost selling building")
			}
		}
		if before != engine.Hash() {
			t.Fatal("presentation mutated authoritative state")
		}
	}
	check(e)
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	check(restored)
	for range 60 {
		e.Advance()
		restored.Advance()
	}
	if building.HP != 0 || e.Hash() != restored.Hash() {
		t.Fatal("sell completion/restore mismatch")
	}
}

func TestSafehousePresentationRetainsAcceptedDuration(t *testing.T) {
	for _, duration := range []Tick{seconds(3), seconds(5), seconds(6)} {
		t.Run(fmt.Sprint(duration), func(t *testing.T) {
			e, house, ids := containerValidationFixture(t, containerValidationCase{"SY.safehouse", "SY", 2})
			containerBoardAll(t, e, house, ids)
			destination := e.spawn("SY.safehouse", 1, Vec{X: 40000, Y: 36000}, true, 800000)
			if duration == seconds(5) {
				e.player(1).Upgrades = append(e.player(1).Upgrades, "SY.prepared_exits")
			}
			if duration == seconds(3) {
				setCooldown(&e.player(1).Cooldowns, "rapid_transfer_window", e.Tick()+seconds(20))
			}
			e.updateFog()
			issue(t, e, 1, Order{Kind: "ability", Type: "transfer", Entities: []ID{house.ID}, Target: destination.ID})
			if house.ChannelDuration != duration {
				t.Fatalf("accepted duration %d want%d", house.ChannelDuration, duration)
			}
			if cooldown(e.player(1).Cooldowns, "rapid_transfer_window", e.Tick()) {
				t.Fatal("rapid transfer window should already be consumed")
			}
			midpoint := house.ChannelUntil - duration/2
			for e.Tick() < midpoint {
				e.Advance()
			}
			check := func(engine *Engine) {
				t.Helper()
				view, _ := engine.PlayerView(1)
				for _, actor := range view.Entities {
					if actor.ID == house.ID {
						if actor.State != "transit" || actor.Progress != 500 {
							t.Fatalf("mid-transit visual %+v", actor)
						}
						return
					}
				}
				t.Fatal("own transit missing")
			}
			check(e)
			restored := containerRestore(t, e)
			check(restored)
			for range uint32(duration) {
				e.Advance()
				restored.Advance()
			}
			if house.ChannelDuration != 0 || len(house.Passengers) != 0 || e.Hash() != restored.Hash() {
				t.Fatal("channel completion/restore mismatch")
			}
			bad := restored.entity(house.ID)
			bad.ChannelDuration = seconds(3)
			if restored.validateState() == nil {
				t.Fatal("orphan channel duration accepted")
			}
		})
	}
}
