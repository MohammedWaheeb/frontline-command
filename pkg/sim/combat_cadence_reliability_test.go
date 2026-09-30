package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

// Section 6.2 specifies the interval between emitted shots, not a delay before
// beginning another windup. IR_ART specifies first-to-first volley timing.
var combatCadenceOrdinaryIntervals = []struct {
	id       string
	interval Tick
}{
	{"RIF", 20}, {"REC", 20}, {"ELI", 20}, {"APC", 20},
	{"AUTO", 15}, {"TANK", 50}, {"AT", 60}, {"ART", 100},
	{"AA", 30}, {"FIGHT", 40}, {"STRIKE", 20}, {"GUN", 40},
	{"US_FIGHT", 36}, {"US_STRIKE", 20}, {"US_GUN", 40},
	{"IR_ART", 120}, {"IR_FIGHT", 30}, {"IR_STRIKE", 20}, {"IR_LOITER", 40},
	{"SY_ART", 90}, {"SY_AA", 40}, {"SY_BUGGY", 60}, {"SY_TANK", 60},
	{"TURRET", 40}, {"AA_POST", 30},
}

// A continuously legal stationary firing opportunity isolates the weapon
// clock. Actual moving fixed-wing passes are verified separately below.
func combatCadenceScene(t *testing.T, weaponID string) (*Engine, *Entity, *Entity, content.Weapon) {
	t.Helper()
	e := fixture(t)
	w, ok := e.catalog.Weapon(weaponID)
	if !ok {
		t.Fatalf("missing canonical weapon %s", weaponID)
	}
	var source *Entity
	for _, unit := range e.catalog.Units() {
		if unit.Weapon == weaponID {
			source = e.spawn(unit.ID, 1, Vec{X: 16000, Y: 24000}, true, unit.Cost)
			break
		}
	}
	if source == nil {
		for _, building := range e.catalog.Buildings() {
			if building.Weapon == weaponID {
				source = e.spawn(building.ID, 1, Vec{X: 16000, Y: 24000}, true, building.Cost)
				break
			}
		}
	}
	if source == nil {
		t.Fatalf("no canonical firing platform for %s", weaponID)
	}
	source.Landed = false
	targetType := "IR.tank"
	if w.Kind == "antiair" {
		targetType = "IR.gunship"
	}
	target := e.spawn(targetType, 2, Vec{X: 16000 + max(4000, w.MinRange+2000), Y: 24000}, true, 0)
	target.Landed, target.FireAt, target.Stance = false, 10000, "hold"
	source.Orders = []Order{{Kind: "attack", Target: target.ID}}
	e.updateFog()
	if !e.canAttack(source, target) || !e.canSeeEntity(source.Owner, target) {
		t.Fatal("cadence scene lacks a legal visible enemy")
	}
	if d := e.weaponDistance(source, target); d < w.MinRange || d > w.MaxRange {
		t.Fatalf("cadence scene is outside weapon ring: %s distance=%d", weaponID, d)
	}
	return e, source, target, w
}

func combatCadenceTick(e *Engine, source *Entity, tick Tick) bool {
	e.state.Tick, e.state.Events = tick, nil
	e.updateCombat()
	for _, event := range e.state.Events {
		if event.Kind == "weapon_fired" && event.Entity == source.ID {
			return true
		}
	}
	return false
}

func TestCombatCadenceAllOrdinaryWeapons(t *testing.T) {
	for _, specified := range combatCadenceOrdinaryIntervals {
		t.Run(specified.id, func(t *testing.T) {
			e, source, _, w := combatCadenceScene(t, specified.id)
			windup := Tick(6)
			if w.Kind == "small" {
				windup = 3
			}
			if Tick(w.WindupTicks) != windup || Tick(w.IntervalTicks) != specified.interval {
				t.Fatal("canonical initial windup or interval changed")
			}
			volleys, rounds := 4, 1
			if specified.id == "IR_ART" {
				rounds = 4
				if w.Volley != 4 || w.VolleySpacingTicks != 8 {
					t.Fatal("canonical four-shell volley or spacing changed")
				}
			}
			if w.Ammo > 0 && int(w.Ammo) < volleys {
				volleys = int(w.Ammo)
			}
			need := volleys * rounds
			launches := []Tick{}
			limit := Tick(1) + windup + specified.interval*Tick(volleys) + 40
			for tick := Tick(1); tick <= limit && len(launches) < need; tick++ {
				if combatCadenceTick(e, source, tick) {
					launches = append(launches, tick)
				}
			}
			if len(launches) != need {
				t.Fatalf("incomplete ordinary magazine/volleys: launches=%v need=%d ammo=%d", launches, need, source.Ammo)
			}
			if launches[0] != 1+windup {
				t.Fatalf("initial windup was changed: first=%d want=%d", launches[0], 1+windup)
			}
			for i := 1; i < len(launches); i++ {
				if i%rounds == 0 {
					if delta := launches[i] - launches[i-rounds]; delta != specified.interval {
						t.Fatalf("shot/volley interval includes extra windup: launches=%v interval=%d want=%d", launches, delta, specified.interval)
					}
				} else if delta := launches[i] - launches[i-1]; delta != 8 {
					t.Fatalf("in-volley spacing changed: %v", launches)
				}
			}
			if w.Ammo > 0 && source.Ammo != w.Ammo-int32(need) {
				t.Fatal("cadence changed ammunition consumption")
			}
			if w.Ammo > 0 && source.Ammo == 0 {
				for tick := launches[len(launches)-1] + 1; tick <= limit; tick++ {
					if combatCadenceTick(e, source, tick) {
						t.Fatal("empty aircraft fired another round")
					}
				}
				if len(source.Orders) == 0 || source.Orders[0].Kind != "return" {
					t.Fatal("empty aircraft did not retain its automatic Return")
				}
			}
		})
	}
}

func TestCombatCadenceInitialWindupAndCooldownFloor(t *testing.T) {
	for _, weaponID := range []string{"RIF", "TANK", "AUTO"} {
		for _, floor := range []Tick{0, 1, 6, 40} {
			t.Run(fmt.Sprintf("%s/floor-%d", weaponID, floor), func(t *testing.T) {
				e, source, _, w := combatCadenceScene(t, weaponID)
				source.FireAt = floor
				want := max(Tick(1+w.WindupTicks), floor)
				for tick := Tick(1); tick <= want+Tick(w.WindupTicks); tick++ {
					if combatCadenceTick(e, source, tick) {
						if tick != want {
							t.Fatalf("first round ignored windup/cooldown floor: got=%d want=%d floor=%d", tick, want, floor)
						}
						return
					}
				}
				t.Fatal("initial shot never completed")
			})
		}
	}
}

func TestCombatCadenceLowPowerDefenseIntervals(t *testing.T) {
	for _, weaponID := range []string{"TURRET", "AA_POST"} {
		t.Run(weaponID, func(t *testing.T) {
			e, source, _, w := combatCadenceScene(t, weaponID)
			e.player(1).PowerCapacity, e.player(1).PowerDemand = 0, 200
			launches := []Tick{}
			for tick := Tick(1); tick <= 300 && len(launches) < 3; tick++ {
				if combatCadenceTick(e, source, tick) {
					launches = append(launches, tick)
				}
			}
			if len(launches) != 3 || launches[0] != Tick(1+w.WindupTicks) {
				t.Fatalf("low-power windup/shot scene failed: %v", launches)
			}
			for i := 1; i < len(launches); i++ {
				if delta := launches[i] - launches[i-1]; delta != Tick(w.IntervalTicks*2) {
					t.Fatalf("low-power cadence: launches=%v delta=%d want=%d", launches, delta, w.IntervalTicks*2)
				}
			}
		})
	}
}

func TestCombatCadenceTargetSwitchRestartsWindup(t *testing.T) {
	e, source, old, w := combatCadenceScene(t, "RIF")
	local := e.spawn("IR.tank", 2, Vec{X: 21500, Y: 24000}, true, 0)
	local.FireAt = 10000
	source.Orders, source.Stance = nil, "hold"
	e.updateFog()
	for tick := Tick(1); tick <= 21; tick++ {
		combatCadenceTick(e, source, tick)
	}
	if source.Target != old.ID || source.AimUntil != 24 || source.FireAt != 24 {
		t.Fatalf("windup did not begin before cooldown ended: target=%d aim=%d fire=%d", source.Target, source.AimUntil, source.FireAt)
	}
	old.HP = 0
	if combatCadenceTick(e, source, 22) || source.Target != local.ID || source.AimUntil != 22+Tick(w.WindupTicks) {
		t.Fatal("replacement target reused another target's windup")
	}
	for tick := Tick(23); tick <= 25; tick++ {
		fired := combatCadenceTick(e, source, tick)
		if fired != (tick == 25) {
			t.Fatalf("replacement target fired at wrong windup/cooldown boundary: tick=%d fired=%v", tick, fired)
		}
	}
}

func TestCombatCadenceLossOfSightRestartsWindup(t *testing.T) {
	e, source, _, w := combatCadenceScene(t, "RIF")
	for tick := Tick(1); tick <= 21; tick++ {
		combatCadenceTick(e, source, tick)
	}
	if source.AimUntil != 24 {
		t.Fatal("no windup in progress before sight was lost")
	}
	e.visible[1] = make([]bool, len(e.visible[1]))
	for tick := Tick(22); tick <= 24; tick++ {
		if combatCadenceTick(e, source, tick) || source.AimUntil != 0 || source.Target != 0 {
			t.Fatal("lost sight retained an aim or launched a round")
		}
	}
	e.updateFog()
	if combatCadenceTick(e, source, 25) || source.AimUntil != 25+Tick(w.WindupTicks) {
		t.Fatal("restored sight bypassed full windup")
	}
	for tick := Tick(26); tick <= 28; tick++ {
		if fired := combatCadenceTick(e, source, tick); fired != (tick == 28) {
			t.Fatal("restored target did not honor its new windup")
		}
	}
}

func TestCombatCadenceStationaryMovementInterruptsWindup(t *testing.T) {
	e, source, _, w := combatCadenceScene(t, "RIF")
	for tick := Tick(1); tick <= 21; tick++ {
		combatCadenceTick(e, source, tick)
	}
	if source.AimUntil != 24 {
		t.Fatal("no windup in progress before movement")
	}
	source.LastPosition.X -= 100
	if combatCadenceTick(e, source, 22) || source.AimUntil != 0 {
		t.Fatal("stationary weapon retained its aim while moving")
	}
	source.LastPosition = source.Position
	if combatCadenceTick(e, source, 23) || source.AimUntil != 23+Tick(w.WindupTicks) {
		t.Fatal("stopping bypassed full windup")
	}
	for tick := Tick(24); tick <= 26; tick++ {
		if fired := combatCadenceTick(e, source, tick); fired != (tick == 26) {
			t.Fatal("stationary weapon did not restart its windup after movement")
		}
	}
}

func TestCombatCadenceMinimumRangeInterruptsWindup(t *testing.T) {
	e, source, target, w := combatCadenceScene(t, "ART")
	legal := target.Position
	for tick := Tick(1); tick <= 101; tick++ {
		combatCadenceTick(e, source, tick)
	}
	if source.AimUntil != 107 {
		t.Fatal("no windup in progress before minimum-range intrusion")
	}
	target.Position.X = source.Position.X + 2000
	for tick := Tick(102); tick <= 107; tick++ {
		if combatCadenceTick(e, source, tick) || source.AimUntil != 0 {
			t.Fatal("minimum-range intrusion retained aim or fired")
		}
	}
	target.Position = legal
	if combatCadenceTick(e, source, 108) || source.AimUntil != 108+Tick(w.WindupTicks) {
		t.Fatal("return to legal range bypassed full windup")
	}
	for tick := Tick(109); tick <= 114; tick++ {
		if fired := combatCadenceTick(e, source, tick); fired != (tick == 114) {
			t.Fatal("returned artillery target fired at wrong windup boundary")
		}
	}
}

func TestCombatCadenceDesignationChangesWindupOnly(t *testing.T) {
	for _, weaponID := range []string{"US_STRIKE", "US_GUN"} {
		t.Run(weaponID, func(t *testing.T) {
			e, source, target, w := combatCadenceScene(t, weaponID)
			marker := e.spawn("US.recon", 1, Vec{X: 18000, Y: 26000}, true, 0)
			marker.FireAt = 10000
			target.Buffs = append(target.Buffs, Buff{Kind: "designated", Until: 1000, Source: marker.ID})
			launches := []Tick{}
			for tick := Tick(1); tick <= 100 && len(launches) < 2; tick++ {
				if combatCadenceTick(e, source, tick) {
					launches = append(launches, tick)
				}
			}
			if len(launches) != 2 || launches[0] != 4 || launches[1]-launches[0] != Tick(w.IntervalTicks) {
				t.Fatalf("designation altered interval instead of only windup: %v", launches)
			}
		})
	}
}

func TestCombatCadenceAircraftInitialWindupStillFlies(t *testing.T) {
	for _, typ := range []string{"US.fighter", "IR.fighter", "SA.fighter", "US.strike", "IR.strike", "SA.strike"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			e.player(1).Faction = typ[:2]
			home := e.spawn(content.AirProducer(e.player(1).Faction), 1, Vec{X: 16000, Y: 36000}, true, 0)
			source := e.spawn(typ, 1, Vec{X: 16000, Y: 24000}, true, 0)
			source.Home, source.Landed = home.ID, false
			source.FireAt = 10000
			targetType := "factory"
			if e.role(source) == "fighter" {
				targetType = "IR.gunship"
			}
			target := e.spawn(targetType, 2, Vec{X: 24000, Y: 24000}, true, 0)
			target.Landed, target.FireAt = false, 10000
			e.updateFog()
			source.FireAt = 0
			issue(t, e, 1, Order{Kind: "attack", Entities: []ID{source.ID}, Target: target.ID})
			started, due := e.Tick(), source.AimUntil
			w, _ := e.weapon(source)
			if due != started+Tick(w.WindupTicks) {
				t.Fatal("fixed-wing initial aim did not use its full windup")
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			for e.Tick() < due {
				before := source.Position
				e.Advance()
				restored.Advance()
				if source.Position == before {
					t.Fatal("fixed-wing aircraft hovered during its attack windup")
				}
				for _, event := range e.state.Events {
					if event.Kind == "weapon_fired" && event.Entity == source.ID && e.Tick() != due {
						t.Fatal("fixed-wing aircraft skipped initial windup")
					}
				}
			}
			fired := false
			for _, event := range e.state.Events {
				fired = fired || event.Kind == "weapon_fired" && event.Entity == source.ID
			}
			if !fired || source.Ammo != w.Ammo-1 || source.PassUntil <= e.Tick() || restored.Hash() != e.Hash() {
				t.Fatal("fixed-wing pass/first shot/ammunition/restore changed")
			}
		})
	}
}
