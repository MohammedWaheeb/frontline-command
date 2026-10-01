package sim

import (
	"fmt"
	"testing"
)

func TestConcealmentExactAcquisitionAndDetectionRadii(t *testing.T) {
	for _, typ := range []string{"SY.rifle", "SY.recon", "SY.elite"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			e.player(1).Faction = "SY"
			v := e.spawn(typ, 1, Vec{X: 30000, Y: 30000}, true, 250000)
			e.state.Map.Tiles[30*64+30].Terrain = "cover"
			ticks(e, 79)
			if v.Concealed {
				t.Fatal("concealed before four stationary seconds")
			}
			e.Advance()
			if !v.Concealed || v.ConcealedSince != 80 {
				t.Fatal("missing exact four-second concealment", v.ConcealedSince)
			}
		})
	}
	for _, tc := range []struct {
		typ    string
		radius int32
	}{{"IR.rig", 3000}, {"IR.recon", 7000}, {"IR.isr", 6000}} {
		for _, offset := range []int32{-1, 0, 1} {
			t.Run(fmt.Sprintf("%s/%d", tc.typ, offset), func(t *testing.T) {
				e := fixture(t)
				e.player(1).Faction = "SY"
				v := e.spawn("SY.rifle", 1, Vec{X: 30000, Y: 30000}, true, 250000)
				v.Concealed = true
				d := e.spawn(tc.typ, 2, Vec{X: 30000 + tc.radius + offset, Y: 30000}, true, 300000)
				if e.isAircraft(d) {
					d.Landed = false
				}
				e.updateFog()
				if got := e.canSeeEntity(2, v); got != (offset <= 0) {
					t.Fatalf("detection at radius %+d: %v", offset, got)
				}
			})
		}
	}
}

func TestConcealmentDetectionRequiresDetectorSight(t *testing.T) {
	for _, airborne := range []bool{false, true} {
		t.Run(fmt.Sprintf("airborne=%v", airborne), func(t *testing.T) {
			e := fixture(t)
			e.player(1).Faction = "SY"
			v := e.spawn("SY.rifle", 1, Vec{X: 30000, Y: 30000}, true, 250000)
			v.Concealed = true
			d := e.spawn("IR.isr", 2, Vec{X: 35000, Y: 30000}, true, 300000)
			d.Landed = !airborne
			e.spawn("IR.rig", 2, Vec{X: 30000, Y: 34500}, true, 1000000)
			e.state.Map.Tiles[30*64+32].SightBlocker = true
			e.state.NavigationRevision++
			e.updateFog()
			if !e.canSee(2, v.Position) {
				t.Fatal("fixture needs shared sight beyond detector blocker")
			}
			if got := e.canSeeEntity(2, v); got != airborne {
				t.Fatalf("landed detection bypassed its own sight blocker: %v", got)
			}
		})
	}
	t.Run("incomplete foundation", func(t *testing.T) {
		e := fixture(t)
		e.player(1).Faction = "SY"
		v := e.spawn("SY.rifle", 1, Vec{X: 30000, Y: 30000}, true, 250000)
		v.Concealed = true
		e.spawn("power", 2, Vec{X: 32000, Y: 30000}, false, 600000)
		e.spawn("IR.rig", 2, Vec{X: 30000, Y: 34500}, true, 1000000)
		e.updateFog()
		if e.canSeeEntity(2, v) {
			t.Fatal("incomplete foundation contributed detection without sight")
		}
	})
}

func TestConcealmentAmbushFirstShotAndDetectedSuppression(t *testing.T) {
	for _, detected := range []bool{false, true} {
		t.Run(fmt.Sprintf("detected=%v", detected), func(t *testing.T) {
			m := balanceMap()
			m.Tiles[48*96+48].Terrain = "cover"
			e := balanceEngine(t, m, "SY", "US")
			e.state.Countdown = 0
			u, _ := e.catalog.Unit("SY.rifle")
			v := e.spawn(u.ID, 1, Vec{X: 48000, Y: 48000}, true, u.Cost)
			// An explicit saved cooldown holds this prepared squad's first shot
			// until concealment can mature. No state is changed after recording.
			v.FireAt = 200
			v.Stance = "hold"
			target := e.spawn("US.rig", 2, Vec{X: 52000, Y: 48000}, true, 1000000)
			if detected {
				d := e.spawn("US.recon", 2, Vec{X: 48000, Y: 54500}, true, 350000)
				d.FireAt = 5000
				d.Stance = "hold"
			}
			r := balanceRecord(t, e, fmt.Sprintf("concealment-ambush-detected-%v", detected))
			r.submit(1, Order{Kind: "attack", Entities: []ID{v.ID}, Target: target.ID})
			var damage []int64
			var shotTicks []Tick
			for e.Tick() < 300 && len(damage) < 2 {
				before := target.HP
				r.step()
				for _, event := range e.state.Events {
					if event.Kind == "weapon_fired" && event.Entity == v.ID {
						damage = append(damage, before-target.HP)
						shotTicks = append(shotTicks, e.Tick())
					}
				}
			}
			if len(damage) != 2 {
				t.Fatal("fixture failed to fire two ordinary shots", damage)
			}
			w, _ := e.weapon(v)
			baseline := w.Damage * int64(e.catalog.Multiplier(w.Kind, e.armor(target))) / 1000
			first := baseline
			if !detected {
				first = baseline * 120 / 100
			}
			if damage[0] != first || damage[1] != baseline {
				t.Fatalf("one-shot ambush actual=%v want=[%d %d]", damage, first, baseline)
			}
			r.finish(struct {
				Detected bool    `json:"detected"`
				Damage   []int64 `json:"damage_milli_hp"`
				Shots    []Tick  `json:"shot_ticks"`
			}{detected, damage, shotTicks})
		})
	}
}

func TestConcealmentOverlapReadinessAndCooldown(t *testing.T) {
	e := fixture(t)
	e.player(1).Faction = "SY"
	v := e.spawn("SY.rifle", 1, Vec{X: 30000, Y: 30000}, true, 250000)
	v.FireAt = 10000
	e.state.Map.Tiles[30*64+30].Terrain = "cover"
	ticks(e, 199)
	if e.ambushReady(v) {
		t.Fatal("ambush ready before six concealed seconds")
	}
	e.Advance()
	if !e.ambushReady(v) {
		t.Fatal("ambush not ready at exact concealment boundary")
	}
	view, _ := e.PlayerView(1)
	found := false
	for _, entity := range view.Entities {
		if entity.ID == v.ID {
			found = entity.Private != nil && entity.Private.AmbushReady
		}
	}
	if !found {
		t.Fatal("owning player missing actual readiness indicator")
	}
	a := e.spawn("IR.recon", 2, Vec{X: 36000, Y: 30000}, true, 350000)
	b := e.spawn("IR.recon", 2, Vec{X: 30000, Y: 36500}, true, 350000)
	a.FireAt, b.FireAt = 10000, 10000
	e.Advance()
	if v.Concealed || e.ambushReady(v) {
		t.Fatal("valid detection did not break concealment/ambush")
	}
	a.HP = 0
	e.Advance()
	if v.Concealed {
		t.Fatal("one lost detector incorrectly canceled overlapping detection")
	}
	b.HP = 0
	e.Advance()
	if !v.Concealed || e.ambushReady(v) {
		t.Fatal("detection loss must restart continuous concealment timer")
	}
	ticks(e, 120)
	if !e.ambushReady(v) {
		t.Fatal("uninterrupted renewed concealment failed")
	}
	setCooldown(&v.Cooldowns, "ambush", e.Tick()+600)
	ticks(e, 599)
	if e.ambushReady(v) {
		t.Fatal("ambush cooldown ended early")
	}
	e.Advance()
	if !e.ambushReady(v) {
		t.Fatal("ambush cooldown did not end at exactly 30 seconds")
	}
}
