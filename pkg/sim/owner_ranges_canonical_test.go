package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Run unchanged before and after extracting shared presentation rules. This
// course exercises real ordinary ticks; only the initial mechanics fixture is
// seeded. Its checkpoint hashes include every authoritative state field.
func TestOwnerRangesCanonicalNoBehaviorChange(t *testing.T) {
	for _, name := range []string{"fixed", "low-power", "shieldline", "disabled", "mobile", "mobile-upgrade", "mobile-shieldline", "mobile-packed"} {
		t.Run(name, func(t *testing.T) {
			e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 612, Players: []PlayerConfig{{ID: 1, Faction: "SA", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
			if err != nil {
				t.Fatal(err)
			}
			e.state.Countdown = 0
			typ := "abm"
			if name == "mobile" || name == "mobile-upgrade" || name == "mobile-shieldline" || name == "mobile-packed" {
				typ = "SA.mobile_abm"
			}
			v := e.spawn(typ, 1, Vec{X: 20000, Y: 16000}, true, 2000000)
			v.Deployed = typ == "SA.mobile_abm" && name != "mobile-packed"
			if v.Deployed {
				v.State = "deployed"
			}
			v.Charges, v.ChargeWork = 1, 123
			if name == "mobile-upgrade" {
				e.player(1).Upgrades = append(e.player(1).Upgrades, "SA.interception")
			}
			if name == "low-power" {
				e.spawn("radar", 1, Vec{X: 8000, Y: 22000}, true, 2000000)
				e.spawn("radar", 1, Vec{X: 14000, Y: 22000}, true, 2000000)
			}
			if name == "disabled" {
				v.DisabledUntil = 120
			}
			if name == "shieldline" || name == "mobile-shieldline" {
				v.Buffs = append(v.Buffs, Buff{Kind: "shieldline", Until: 300, Source: v.ID})
			}
			for _, at := range []Tick{60, 90, 140, 610, 640, 910} {
				point := Vec{X: 26000, Y: 18000}
				e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Weapon: "IR_MISSILE", Origin: Vec{X: 50000, Y: 50000}, Position: Vec{X: 50000, Y: 50000}, Impact: point, ImpactAt: at, Damage: 350000, Splash: 2000, Interceptable: true})
			}
			e.recalculate()
			e.updateFog()
			hashes := map[Tick]string{0: e.Hash()}
			for range 1000 {
				e.Advance()
				if e.Tick() <= 3 || e.Tick()%20 == 0 {
					hashes[e.Tick()] = e.Hash()
				}
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil || restored.Hash() != e.Hash() {
				t.Fatal("canonical fixture restore", err)
			}
			exportFeedback(t, "ranges-canonical-"+name, hashes)
		})
	}
}
