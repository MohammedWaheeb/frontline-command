package sim

import "testing"

func TestCombatRoutesWithdrawIntoLegalFiringRange(t *testing.T) {
	for _, typ := range []string{"US.artillery", "IR.artillery", "SY.artillery", "SA.artillery", "US.launcher", "IR.launcher", "SY.launcher", "SA.launcher"} {
		for _, kind := range []string{"attack_move", "patrol"} {
			t.Run(typ+"/"+kind, func(t *testing.T) {
				e := fixture(t)
				v := e.spawn(typ, 1, Vec{X: 30000, Y: 32000}, true, 0)
				target := e.spawn("power", 2, Vec{X: 33500, Y: 32000}, true, 0)
				e.spawn("US.recon", 1, Vec{X: 36500, Y: 35000}, true, 0) // Ordinary spotter supplies sight as the gun retreats.
				e.recalculate()
				e.updateFog()
				weapon, _ := e.weapon(v)
				if e.edgeDistance(v, target) >= weapon.MinRange {
					t.Fatal("fixture is not inside minimum range")
				}
				order := Order{Kind: kind, Entities: []ID{v.ID}, Position: Vec{X: 40000, Y: 32000}}
				if kind == "patrol" {
					order.Points = []Vec{{X: 40000, Y: 32000}, {X: 30000, Y: 32000}}
				}
				issue(t, e, 1, order)
				ticks(e, 30)
				save, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, save)
				if err != nil {
					t.Fatal(err)
				}
				fired := false
				for range 700 {
					e.Advance()
					restored.Advance()
					for _, event := range e.state.Events {
						if event.Kind == "weapon_fired" && event.Entity == v.ID {
							if d := e.edgeDistance(v, target); d < weapon.MinRange || d > weapon.MaxRange {
								t.Fatalf("fired outside ring: %d", d)
							}
							fired = true
						}
					}
					if fired {
						break
					}
				}
				if !fired {
					t.Fatalf("no legal shot: pos%+v state%s target%d distance%d charge%d", v.Position, v.State, v.Target, e.edgeDistance(v, target), v.Charges)
				}
				if restored.Hash() != e.Hash() {
					t.Fatal("retreat changed after restoration")
				}
			})
		}
	}
}

func TestDeployedLauncherPacksForPursuitButHoldStaysPut(t *testing.T) {
	for _, kind := range []string{"attack", "attack_move", "patrol", "hold"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn("SY.launcher", 1, Vec{X: 30000, Y: 32000}, true, 0)
			target := e.spawn("power", 2, Vec{X: 33500, Y: 32000}, true, 0)
			v.Deployed = true
			v.Stance = "hold"
			v.Orders = []Order{{Kind: kind, Target: target.ID, Position: Vec{X: 40000, Y: 32000}, Points: []Vec{{X: 40000, Y: 32000}, {X: 30000, Y: 32000}}}}
			e.updateFog()
			e.updateCombat()
			if kind == "hold" {
				if !v.Deployed || v.PackingUntil != 0 {
					t.Fatal("hold moved automatically")
				}
				return
			}
			if v.Deployed || v.PackingUntil != e.Tick()+seconds(3) {
				t.Fatal("did not preserve ordinary three-second pack channel")
			}
		})
	}
}
