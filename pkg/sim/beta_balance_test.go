package sim

import (
	"os"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
)

// These beta checks pin the deliberately small data adjustment. They do not
// model an alternate combat system or promise a successful approach through AA.
func TestBetaBalanceTankAndElite(t *testing.T) {
	c := content.MustBase()
	tank, _ := c.Unit("SY.tank")
	gun, _ := c.Weapon(tank.Weapon)
	if tank.Cost != 1250000 || tank.HP != 1050000 || tank.Supply != 4 || gun.ID != "SY_TANK" || gun.Damage != 90000 || gun.IntervalTicks != 60 {
		t.Fatalf("refitted tank campaign-safe stock balance drift: unit=%+v weapon=%+v", tank, gun)
	}
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			u, _ := c.Unit(faction + ".elite")
			wantCost := int64(1200000)
			if faction == "SY" {
				wantCost = 1050000
			}
			w, _ := c.Weapon(u.Weapon)
			if u.Cost != wantCost || u.Supply != 2 || u.Weapon != "ELI" || w.Damage != 60000 || w.IntervalTicks != 20 {
				t.Fatalf("sabotage specialist beta balance drift: unit=%+v weapon=%+v", u, w)
			}
			e := balanceEngine(t, balanceMap(), faction, "US")
			p := e.player(1)
			job := Job{Type: u.ID}
			cost, supply, _, code := e.productionAllocation(p, &job)
			if code != "ok" || cost != wantCost || supply != 2 {
				t.Fatalf("first elite allocation: cost=%d supply=%d code=%s", cost, supply, code)
			}
			e.spawn(u.ID, 1, Vec{X: 30000, Y: 30000}, true, wantCost)
			if _, _, _, code := e.productionAllocation(p, &job); code != "elite_limit" {
				t.Fatalf("second elite must retain the one-specialist cap, got %s", code)
			}
		})
	}
}

func TestBetaBalanceShahedContactKills(t *testing.T) {
	c := content.MustBase()
	drone, _ := c.Unit("IR.shahed")
	w, _ := c.Weapon(drone.Weapon)
	if drone.Cost != 350000 || w.Damage != 300000 || w.Splash != 1200 || w.Kind != "airground" || w.Ammo != 1 || w.Volley != 1 {
		t.Fatalf("one-way payload beta balance drift: unit=%+v weapon=%+v", drone, w)
	}
	for _, tc := range []struct {
		target string
		hits   int
		damage int64
	}{
		{"US.engineer", 1, 195000},
		{"US.aa", 3, 300000},
		{"US.artillery", 2, 300000},
		{"US.hauler", 3, 300000},
	} {
		t.Run(tc.target, func(t *testing.T) {
			e := balanceEngine(t, balanceMap(), "IR", "US")
			point := Vec{X: 48000, Y: 48000}
			target := e.spawn(tc.target, 2, point, true, 0)
			initialHP := target.HP
			if initialHP != target.MaxHP {
				t.Fatal("target must begin at full health")
			}
			for hit := 1; hit <= tc.hits; hit++ {
				carrier := e.spawn(drone.ID, 1, point, true, drone.Cost)
				carrier.Landed = false
				carrier.ShahedCommitted = true
				carrier.LastTarget = point
				carrier.Ammo = 0
				// Prepared terminal contact runs the production impact and
				// damage resolver; no projectile or hand-written HP deduction.
				e.damages = nil // Advance normally clears this per-tick scratch batch.
				e.resolveDamage()
				wantHP := initialHP - int64(hit)*tc.damage
				if wantHP < 0 {
					wantHP = 0
				}
				if target.HP != wantHP || carrier.HP != 0 {
					t.Fatalf("contact %d: targetHP=%d want=%d carrierHP=%d", hit, target.HP, wantHP, carrier.HP)
				}
				if hit < tc.hits && target.HP <= 0 {
					t.Fatalf("target died before the documented %d impacts", tc.hits)
				}
				if len(e.state.Projectiles) != 0 {
					t.Fatal("one physical impact left a persistent projectile")
				}
			}
			if target.HP != 0 {
				t.Fatalf("%d terminal impacts did not kill full-health %s", tc.hits, tc.target)
			}
		})
	}
}

func TestBetaBalanceAPCCapacityGuidance(t *testing.T) {
	e := fixture(t)
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		v := e.spawn(faction+".apc", 1, Vec{X: 30000, Y: 30000}, true, 0)
		want := int32(3)
		if faction == "SY" {
			want = 2
		}
		if got := e.capacity(v); got != want {
			t.Fatalf("%s capacity=%d want=%d", v.Type, got, want)
		}
	}
	// The owned client guidance is static text. Pin both public descriptions
	// here because this lane cannot add a client test runner or its test files.
	data, err := os.ReadFile("../../client/src/content/unit-guidance.ts")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, phrase := range []string{"Carries three infantry squads and supports them with small arms.", "Carries two infantry squads and supports them with small arms.", "unit.id==='SY.apc'"} {
		if !strings.Contains(text, phrase) {
			t.Fatalf("APC guidance missing %q", phrase)
		}
	}
}
