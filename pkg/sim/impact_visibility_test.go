package sim

import "testing"

func TestImpactIdentifiesOnlyCurrentlyAuthorizedTarget(t *testing.T) {
	for _, kind := range []string{"visible", "concealed", "fog", "embarked", "dead", "removed"} {
		t.Run(kind, func(t *testing.T) {
			e := fixture(t)
			shooter := e.spawn("US.tank", 1, Vec{X: 16000, Y: 16000}, true, 1300000)
			target := e.spawn("IR.tank", 2, Vec{X: 21000, Y: 16000}, true, 1200000)
			weapon, _ := e.weapon(shooter)
			e.launch(shooter, target, target.Position, weapon, weapon.Damage)
			e.state.Tick = 100
			e.updateProjectiles()
			var original Event
			for _, event := range e.state.Events {
				if event.Kind == "impact" {
					original = event
				}
			}
			if original.Entity != target.ID {
				t.Fatalf("real direct hit did not retain internal target: %+v", original)
			}
			switch kind {
			case "concealed":
				target.Concealed = true
			case "fog":
				target.Position = Vec{X: 48000, Y: 48000}
			case "embarked":
				target.Container = 999
			case "dead":
				target.HP = 0
			case "removed":
				e.state.Entities = e.state.Entities[:len(e.state.Entities)-1]
			}
			e.updateFog()
			view, _ := e.PlayerView(1)
			found := false
			for _, event := range view.Events {
				if event.ID != original.ID {
					continue
				}
				found = true
				if kind == "visible" && event.Entity != target.ID || kind != "visible" && event.Entity != 0 {
					t.Fatalf("%s impact leaks or loses identity: %+v", kind, event)
				}
			}
			if !found {
				t.Fatal("visible impact itself disappeared")
			}
			for _, event := range e.state.Events {
				if event.ID == original.ID && event.Entity != target.ID {
					t.Fatal("view filtering mutated authoritative event")
				}
			}
		})
	}
}

func TestAreaImpactDoesNotChooseAnArbitraryVictim(t *testing.T) {
	e := fixture(t)
	target := e.spawn("IR.tank", 2, Vec{X: 21000, Y: 16000}, true, 1200000)
	e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 1, Weapon: "IR_MISSILE", Position: target.Position, Impact: target.Position, ImpactAt: 0, Damage: 350000, Splash: 2000})
	e.updateProjectiles()
	if len(e.damages) == 0 {
		t.Fatal("area fixture did not hit")
	}
	for _, event := range e.state.Events {
		if event.Kind == "impact" && event.Entity != 0 {
			t.Fatal("area impact identifies a particular victim")
		}
	}
}
