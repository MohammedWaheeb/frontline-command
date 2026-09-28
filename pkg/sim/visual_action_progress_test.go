package sim

import "testing"

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
