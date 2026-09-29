package sim

import (
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func rangeFixture(t *testing.T, mobile, lowPower, upgraded, shield bool) (*Engine, *Entity) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 916, Players: []PlayerConfig{{ID: 1, Faction: "SA", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	typ := "abm"
	if mobile {
		typ = "SA.mobile_abm"
	}
	v := e.spawn(typ, 1, Vec{X: 20000, Y: 16000}, true, 2000000)
	if mobile {
		v.Deployed = true
		v.State = "deployed"
	}
	if upgraded {
		e.player(1).Upgrades = append(e.player(1).Upgrades, "SA.interception")
	}
	if lowPower {
		e.spawn("radar", 1, Vec{X: 8000, Y: 22000}, true, 2000000)
		e.spawn("radar", 1, Vec{X: 14000, Y: 22000}, true, 2000000)
		e.spawn("radar", 1, Vec{X: 20000, Y: 22000}, true, 2000000)
	}
	if shield {
		v.Buffs = append(v.Buffs, Buff{Kind: "shieldline", Until: 5000, Source: v.ID})
	}
	e.recalculate()
	e.updateFog()
	if e.player(1).LowPower() != lowPower {
		t.Fatal("incorrect power fixture", e.player(1).PowerCapacity, e.player(1).PowerDemand)
	}
	return e, v
}

func TestOwnerRangesRechargeEstimateMatchesOrdinaryTicks(t *testing.T) {
	for _, tc := range []struct {
		name                         string
		mobile, low, upgrade, shield bool
		ticks                        uint32
	}{
		{"fixed", false, false, false, false, 480},
		{"fixed-low", false, true, false, false, 960},
		{"fixed-shield", false, false, false, true, 240},
		{"fixed-low-shield", false, true, false, true, 480},
		{"mobile", true, false, false, false, 600},
		{"mobile-low", true, true, false, false, 600},
		{"mobile-upgrade", true, false, true, false, 500},
		{"mobile-upgrade-shield", true, true, true, true, 250},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e, v := rangeFixture(t, tc.mobile, tc.low, tc.upgrade, tc.shield)
			r := e.ownerRanges(v).Interception
			if r == nil || r.NextChargeTicks == nil || *r.NextChargeTicks != tc.ticks || !r.Active || r.Ready {
				t.Fatal("incorrect empty magazine", r)
			}
			before := e.Hash()
			view, _ := e.PlayerView(1)
			if e.Hash() != before {
				t.Fatal("projection mutated state")
			}
			exportFeedback(t, "ranges-"+tc.name, view)
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			exportRangeSave(t, e, "ranges-"+tc.name+".start.save.json", saved)
			ticks(e, tc.ticks-1)
			if v.Charges != 0 {
				t.Fatal("charge appeared early")
			}
			r = e.ownerRanges(v).Interception
			if r.NextChargeTicks == nil || *r.NextChargeTicks != 1 {
				t.Fatal("last tick estimate", r)
			}
			e.Advance()
			if v.Charges != 1 || !e.ownerRanges(v).Interception.Ready {
				t.Fatal("charge missed exact ordinary tick")
			}
			if tc.mobile && e.ownerRanges(v).Interception.NextChargeTicks != nil {
				t.Fatal("full mobile magazine claims another charge")
			}
		})
	}
}

func TestOwnerRangesPausedAndPartialRecharge(t *testing.T) {
	for _, mode := range []string{"disabled", "power-off", "constructing", "packed", "full", "partial"} {
		t.Run(mode, func(t *testing.T) {
			e, v := rangeFixture(t, mode == "packed", false, false, false)
			v.ChargeWork = 123
			switch mode {
			case "disabled":
				v.DisabledUntil = 100
			case "power-off":
				v.Enabled = false
			case "constructing":
				v.Complete = false
			case "packed":
				v.Deployed = false
			case "full":
				v.Charges = 2
			}
			r := e.ownerRanges(v).Interception
			view, _ := e.PlayerView(1)
			exportFeedback(t, "ranges-"+mode, view)
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			exportRangeSave(t, e, "ranges-"+mode+".start.save.json", saved)
			if mode == "partial" {
				if r.NextChargeTicks == nil || *r.NextChargeTicks != 419 {
					t.Fatal("partial work must use integer ceiling", r)
				}
			} else if r.NextChargeTicks != nil {
				t.Fatal("paused or full magazine invented a deadline", r)
			}
			if mode != "partial" && mode != "full" && (r.Active || r.Ready || r.RechargeRate != 0) {
				t.Fatal("inactive defense shown operating", r)
			}
		})
	}
}

func TestOwnerRangesAssignmentsAreRealPrivateAndDetached(t *testing.T) {
	e, v := rangeFixture(t, false, false, false, false)
	v.Charges = 2
	e.spawn("IR.rifle", 2, Vec{X: 23000, Y: 18000}, true, 300000).Stance = "hold"
	for _, at := range []Tick{60, 59, 70} {
		point := Vec{X: 26000, Y: 18000}
		e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Weapon: "IR_MISSILE", Position: Vec{X: 50000, Y: 50000}, Origin: Vec{X: 50000, Y: 50000}, Impact: point, ImpactAt: at, Damage: 350000, Splash: 2000, Interceptable: true})
	}
	e.updateFog()
	e.Advance()
	r := e.ownerRanges(v).Interception
	if len(r.Assignments) != 1 || r.Assignments[0].Projectile != e.state.Projectiles[1].ID || r.Assignments[0].InterceptAt != 11 || r.Ready || r.FireReadyAt != 21 || v.Charges != 1 {
		t.Fatal("assignment or interval guessed", r)
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	exportRangeSave(t, e, "ranges-assigned.start.save.json", saved)
	before := e.Hash()
	for _, allied := range []bool{false, true} {
		if allied {
			e.player(2).Team = 1
			e.updateFog()
			before = e.Hash()
		}
		for _, id := range []PlayerID{1, 2} {
			view, _ := e.PlayerView(id)
			var found *EntityView
			for i := range view.Entities {
				if view.Entities[i].ID == v.ID {
					found = &view.Entities[i]
				}
			}
			if found == nil {
				t.Fatal("fixture lacks visible defender")
			}
			if id == 2 && found.Private != nil {
				t.Fatal("foreign magazine/assignment leaked")
			}
			if id == 1 {
				if found.Private.Ranges == nil || !reflect.DeepEqual(found.Private.Ranges.Interception, r) {
					t.Fatal("owner view lost ranges")
				}
				exportFeedback(t, "ranges-assigned", view)
				found.Private.Ranges.Interception.Assignments[0].Impact = Vec{}
				*found.Private.Ranges.Interception.NextChargeTicks = 9999
			}
		}
		if e.Hash() != before || e.ownerRanges(v).Interception.Assignments[0].Impact == (Vec{}) {
			t.Fatal("range projection aliases state")
		}
	}
	ticks(e, 10)
	if len(e.ownerRanges(v).Interception.Assignments) != 0 {
		t.Fatal("completed assignment persisted")
	}
}

func TestOwnerRangesSightDetectionAndBuildBounds(t *testing.T) {
	e := fixture(t)
	drone := e.spawn("IR.isr", 1, Vec{X: 30000, Y: 30000}, true, 300000)
	drone.Landed = false
	e.state.Map.Tiles[30*64+30].Height = 2
	drone.Buffs = append(drone.Buffs, Buff{Kind: "relay", Until: 1000, Source: drone.ID})
	r := e.ownerRanges(drone)
	if r.SightRadius != 17000 || r.DetectionRadius != 6000 || !r.AirborneSight || r.BuildRadius != 0 || r.Interception != nil {
		t.Fatal("effective perception", r)
	}
	drone.Landed = true
	if e.ownerRanges(drone).AirborneSight {
		t.Fatal("landed detector ignores ground sight")
	}
	drone.Container = 999
	r = e.ownerRanges(drone)
	if r.SightRadius != 0 || r.DetectionRadius != 0 {
		t.Fatal("passenger provides sight")
	}
	rig := e.entity(2)
	if e.ownerRanges(rig).DetectionRadius != 3000 {
		t.Fatal("ordinary close detection missing")
	}
	anchor := e.spawn("outpost", 1, Vec{X: 30000, Y: 30000}, true, 900000)
	if e.ownerRanges(anchor).BuildRadius != 14000 {
		t.Fatal("build anchor radius missing")
	}
	for _, delta := range []int32{0, 1} {
		o := Order{Kind: "build", Type: "power", Position: Vec{X: 44000 + delta, Y: 30000}}
		_, code := e.buildingRequirements(e.player(1), rig, o)
		if (code == "ok") != (delta == 0) {
			t.Fatal("display disagrees with ordinary build bound", delta, code)
		}
	}
	anchor.Complete = false
	if e.ownerRanges(anchor).BuildRadius != 0 {
		t.Fatal("foundation grants build radius")
	}
}

// Save envelope hashes cover exact embedded state bytes. Keep their original
// encoding; pretty-printing a json.RawMessage changes the checksummed payload.
func exportRangeSave(t *testing.T, e *Engine, name string, saved []byte) {
	t.Helper()
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("range fixture must restore exactly", err)
	}
	if dir := os.Getenv("FRONTLINE_COMBAT_OUTPUT"); dir != "" {
		if err = os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dir, name), saved, 0644); err != nil {
			t.Fatal(err)
		}
	}
}
