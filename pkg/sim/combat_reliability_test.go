package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"testing"
)

// These scenes use accepted Move orders and the real tick pipeline. The enemy
// is outside the departure leash but enters the moving weapon's firing ring.
func TestCombatReliabilityMovingFireAcquiresLocalTargets(t *testing.T) {
	for _, typ := range []string{
		"US.tank", "IR.tank", "SY.tank", "SA.tank",
		"US.car", "IR.car", "SY.car", "SA.car",
		"US.apc", "IR.apc", "SY.apc", "SA.apc",
		"US.gunship", "IR.gunship", "SA.gunship",
	} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(typ, 1, Vec{X: 16000, Y: 16000}, true, 0)
			target := e.spawn("power", 2, Vec{X: 30000, Y: 20000}, true, 0)
			if e.isAircraft(v) {
				home := e.spawn(content.AirProducer(e.player(1).Faction), 1, Vec{X: 16000, Y: 35000}, true, 0)
				v.Home, v.Landed = home.ID, false
			}
			e.updateFog()
			destination := Vec{X: 44000, Y: 16000}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Position: destination})
			ticks(e, 19)
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			for range 240 {
				e.Advance()
				restored.Advance()
				for _, event := range e.state.Events {
					if event.Kind != "weapon_fired" || event.Entity != v.ID {
						continue
					}
					w, _ := e.weapon(v)
					if v.Position == v.LastPosition || len(v.Orders) != 1 || v.Orders[0].Kind != "move" || v.Orders[0].Position != destination {
						t.Fatalf("firing interrupted Move: pos=%+v last=%+v orders=%+v", v.Position, v.LastPosition, v.Orders)
					}
					if d := e.weaponDistance(v, target); d < w.MinRange || d > w.MaxRange {
						t.Fatalf("fired outside the current ring: %d", d)
					}
					if distance(v.Anchor, target.Position) <= 6000 || v.Target != target.ID {
						t.Fatal("fixture did not acquire a target beyond the departure leash")
					}
					if restored.Hash() != e.Hash() {
						t.Fatal("moving shot changed after save/restore")
					}
					return
				}
			}
			t.Fatalf("no moving shot at a newly encountered visible enemy: pos=%+v target=%d anchor=%+v", v.Position, v.Target, v.Anchor)
		})
	}
}

func TestCombatReliabilityMovingFireReplacesOutOfRangeTarget(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.tank", 1, Vec{X: 32000, Y: 24000}, true, 0)
	old := e.spawn("power", 2, Vec{X: 22000, Y: 24000}, true, 0)
	local := e.spawn("power", 2, Vec{X: 36000, Y: 24000}, true, 0)
	e.spawn("US.recon", 1, Vec{X: 26000, Y: 30000}, true, 0)
	e.assign(v, Order{Kind: "move", Position: Vec{X: 50000, Y: 24000}})
	// A previously acquired enemy remains visible to the allied spotter while
	// the moving tank has advanced beyond that enemy's reachable firing ring.
	v.Anchor, v.Target = Vec{X: 18000, Y: 24000}, old.ID
	e.updateFog()
	if !e.canSeeEntity(1, old) || !e.canSeeEntity(1, local) {
		t.Fatal("fixture requires current sight of both targets")
	}
	for range 30 {
		e.Advance()
		for _, p := range e.state.Projectiles {
			if p.Shooter == v.ID {
				if p.Target != local.ID {
					t.Fatalf("retained out-of-range target: got %d want %d", p.Target, local.ID)
				}
				return
			}
		}
	}
	t.Fatal("out-of-range retained target suppressed the reachable enemy")
}

func TestCombatReliabilityStationaryWeaponsDoNotFireDuringMove(t *testing.T) {
	for _, typ := range []string{"US.rifle", "US.at", "US.aa", "US.artillery", "SY.buggy", "SY.portable_aa"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(typ, 1, Vec{X: 16000, Y: 24000}, true, 0)
			targetType := "IR.tank"
			if e.role(v) == "aa" || e.role(v) == "portable_aa" {
				targetType = "IR.gunship"
			}
			target := e.spawn(targetType, 2, Vec{X: 22000, Y: 24000}, true, 0)
			target.Landed = false
			target.FireAt = 10000
			e.updateFog()
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Position: Vec{X: 44000, Y: 24000}})
			if v.Position == v.LastPosition {
				t.Fatal("fixture did not move")
			}
			for _, event := range e.state.Events {
				if event.Kind == "weapon_fired" && event.Entity == v.ID {
					t.Fatal("stationary weapon fired while moving")
				}
			}
		})
	}
}

func combatReliabilityTeamFixture(t *testing.T) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{
		{ID: 1, Name: "Shooter", Faction: "US", Team: 1},
		{ID: 2, Name: "Enemy", Faction: "IR", Team: 2},
		{ID: 3, Name: "Capturing ally", Faction: "SA", Team: 1},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

// A real capture channel completes one tick after a valid shot leaves the
// shooter. The already-fired projectile persists, but direct friendly damage
// must not occur after either the shooter or its teammate captures the factory.
func TestCombatReliabilityTrackedDirectRoundsRespectCapture(t *testing.T) {
	for _, typ := range []string{"US.car", "US.tank", "US.at", "US.gunship"} {
		for _, capturer := range []PlayerID{0, 1, 3} {
			name := "hostile_control"
			if capturer == 1 {
				name = "owned_capture"
			} else if capturer == 3 {
				name = "allied_capture"
			}
			t.Run(typ+"/"+name, func(t *testing.T) {
				e := combatReliabilityTeamFixture(t)
				source := e.spawn(typ, 1, Vec{X: 20000, Y: 24000}, true, 0)
				source.Stance, source.FireAt = "hold", 10000
				if e.isAircraft(source) {
					home := e.spawn("US.airfield", 1, Vec{X: 16000, Y: 35000}, true, 0)
					source.Home, source.Landed = home.ID, false
				}
				target := e.spawn("factory", 2, Vec{X: 27000, Y: 24000}, true, 0)
				target.HP = target.MaxHP / 5
				before := target.HP
				captureAt := Tick(161)
				if capturer != 0 {
					engineerType := "US.engineer"
					if capturer == 3 {
						engineerType = "SA.engineer"
					}
					engineer := e.spawn(engineerType, capturer, Vec{X: 24000, Y: 24000}, true, 0)
					e.updateFog()
					issue(t, e, capturer, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID})
					for range 20 {
						if engineer.Channel == "capture" {
							break
						}
						e.Advance()
					}
					if engineer.Channel != "capture" {
						t.Fatal("capture channel did not start")
					}
					captureAt = engineer.ChannelUntil
				}
				for e.Tick() < captureAt-8 {
					e.Advance()
				}
				source.FireAt = 0
				e.updateFog()
				issue(t, e, 1, Order{Kind: "attack", Entities: []ID{source.ID}, Target: target.ID})
				var round *Projectile
				for range 20 {
					for _, p := range e.state.Projectiles {
						if p.Shooter == source.ID {
							round = p
						}
					}
					if round != nil {
						break
					}
					e.Advance()
				}
				if round == nil || target.Owner != 2 || round.ImpactAt <= captureAt || e.Tick() >= captureAt {
					t.Fatalf("fixture did not launch before capture and impact afterward: tick=%d capture=%d round=%+v owner=%d", e.Tick(), captureAt, round, target.Owner)
				}
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, saved)
				if err != nil {
					t.Fatal(err)
				}
				for e.Tick() < round.ImpactAt {
					e.Advance()
					restored.Advance()
				}
				if restored.Hash() != e.Hash() {
					t.Fatal("capture during projectile flight changed after restoration")
				}
				if capturer == 0 {
					w, _ := e.weapon(source)
					want := before - round.Damage*int64(e.catalog.Multiplier(w.Kind, "structure"))/1000
					if target.Owner != 2 || target.HP != want {
						t.Fatalf("hostile control lost ordinary damage: hp=%d want=%d owner=%d", target.HP, want, target.Owner)
					}
					return
				}
				if target.Owner != capturer || target.HP != before || target.EverDamaged {
					t.Fatalf("direct round damaged a captured friendly: hp=%d want=%d owner=%d wantOwner=%d damaged=%v", target.HP, before, target.Owner, capturer, target.EverDamaged)
				}
				for _, event := range e.state.Events {
					if event.Kind == "under_attack" && event.Entity == target.ID || event.Kind == "impact" && event.Entity == target.ID {
						t.Fatal("suppressed friendly round emitted resolved damage feedback")
					}
				}
			})
		}
	}
}

// Capturing a structure does not remove area friendly fire, and killing a
// shooter does not erase an already-launched shell or tactical missile.
func TestCombatReliabilityCapturedTargetsKeepSplashFriendlyFire(t *testing.T) {
	for _, typ := range []string{"US.artillery", "IR.artillery", "SY.artillery", "SA.artillery", "US.launcher", "IR.launcher", "SY.launcher", "SA.launcher"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			source := e.spawn(typ, 1, Vec{X: 16000, Y: 24000}, true, 0)
			target := e.spawn("factory", 2, Vec{X: 32000, Y: 24000}, true, 0)
			target.HP = target.MaxHP / 5
			before := target.HP
			w, _ := e.weapon(source)
			e.launch(source, target, target.Position, w, w.Damage)
			round := e.state.Projectiles[0]
			if round.Target != 0 || round.Interceptable != (w.Kind == "tactical") {
				t.Fatal("shell/missile target or interception layer changed")
			}
			if !e.captureBuilding(1, target) {
				t.Fatal("capture failed")
			}
			source.HP = 0
			e.cleanup()
			if e.entity(source.ID) != nil || len(e.state.Projectiles) != 1 {
				t.Fatal("shooter death removed its launched area projectile")
			}
			e.state.Tick = round.ImpactAt
			e.updateProjectiles()
			e.resolveDamage()
			if want := before - w.Damage/2; target.HP != want || !target.EverDamaged {
				t.Fatalf("captured structure lost area friendly fire: hp=%d want=%d", target.HP, want)
			}
		})
	}
}

// Independent design section 6.1 values cover every purchasable unit's weapon
// resolution, including unarmed support roles and landed-aircraft light armor.
func TestCombatReliabilityAllRosterTargetLayers(t *testing.T) {
	e := fixture(t)
	matrix := map[string][]int32{
		"small": {1000, 350, 100, 100, 0}, "auto": {1000, 1000, 350, 300, 0},
		"cannon": {350, 1000, 1000, 700, 0}, "antiarmor": {0, 1000, 1400, 700, 0},
		"shell": {1000, 800, 450, 1000, 0}, "antiair": {0, 0, 0, 0, 1000},
		"airground": {650, 1000, 1000, 1000, 0}, "tactical": {300, 700, 700, 1000, 0},
	}
	targets := []*Entity{
		e.spawn("IR.rifle", 2, Vec{X: 32000, Y: 24000}, true, 0),
		e.spawn("IR.car", 2, Vec{X: 36000, Y: 24000}, true, 0),
		e.spawn("IR.tank", 2, Vec{X: 40000, Y: 24000}, true, 0),
		e.spawn("power", 2, Vec{X: 44000, Y: 24000}, true, 0),
		e.spawn("IR.gunship", 2, Vec{X: 48000, Y: 24000}, true, 0),
		e.spawn("IR.gunship", 2, Vec{X: 52000, Y: 24000}, true, 0),
	}
	targets[4].Landed = false
	units := e.catalog.Units()
	if len(units) != 76 {
		t.Fatalf("audit roster changed: %d", len(units))
	}
	seen := map[string]bool{}
	check := func(source *Entity) {
		t.Helper()
		w, armed := e.weapon(source)
		if armed {
			seen[w.ID] = true
		}
		for i, target := range targets {
			armorIndex := i
			if i == 5 {
				armorIndex = 1
			}
			want := armed && matrix[w.Kind][armorIndex] > 0
			if got := e.canAttack(source, target); got != want {
				t.Fatalf("%s/%s landed=%v legal=%v want=%v", source.Type, target.Type, target.Landed, got, want)
			}
			if armed {
				wantDamage := w.Damage * int64(matrix[w.Kind][armorIndex]) / 1000
				if got := e.projectileDamage(&Projectile{Weapon: w.ID, Damage: w.Damage}, target, w); got != wantDamage {
					t.Fatalf("%s/%s landed=%v damage=%d want=%d", w.ID, target.Type, target.Landed, got, wantDamage)
				}
			}
		}
	}
	for _, unit := range units {
		check(e.spawn(unit.ID, 1, Vec{X: 16000, Y: 24000}, true, 0))
	}
	for _, rule := range e.catalog.Buildings() {
		if rule.Weapon != "" {
			check(e.spawn(rule.ID, 1, Vec{X: 16000, Y: 24000}, true, 0))
		}
	}
	if len(seen) != 29 {
		t.Fatalf("audit did not exercise all weapon identities: %d", len(seen))
	}
}

// Inspection only: the existing windup/cooldown cadence is recorded for parent
// review, without asserting that the observed timing conforms to the design.
func TestCombatReliabilityCadenceInspection(t *testing.T) {
	if os.Getenv("FRONTLINE_COMBAT_CADENCE_INSPECTION") != "1" {
		t.Skip("explicit cadence inspection requested")
	}
	for _, typ := range []string{"US.rifle", "US.tank", "IR.artillery"} {
		e := fixture(t)
		source := e.spawn(typ, 1, Vec{X: 16000, Y: 24000}, true, 0)
		point := Vec{X: 21000, Y: 24000}
		if typ == "IR.artillery" {
			point.X = 24000
		}
		target := e.spawn("IR.tank", 2, point, true, 0)
		source.Orders = []Order{{Kind: "attack", Target: target.ID}}
		e.updateFog()
		w, _ := e.weapon(source)
		launches := []Tick{}
		for tick := Tick(1); tick <= 260; tick++ {
			e.state.Tick, e.state.Events = tick, nil
			e.updateCombat()
			for _, event := range e.state.Events {
				if event.Kind == "weapon_fired" && event.Entity == source.ID {
					launches = append(launches, tick)
				}
			}
		}
		raw, err := json.Marshal(struct {
			Weapon   string `json:"weapon"`
			Interval uint32 `json:"specified_interval_ticks"`
			Windup   uint32 `json:"windup_ticks"`
			Launches []Tick `json:"observed_launch_ticks"`
		}{w.ID, w.IntervalTicks, w.WindupTicks, launches})
		if err != nil {
			t.Fatal(err)
		}
		t.Log(string(raw))
	}
}
