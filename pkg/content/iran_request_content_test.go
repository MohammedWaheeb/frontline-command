package content

import (
	"encoding/json"
	"strings"
	"testing"
)

// The user's Iran addendum adds one identity; it does not replace an old unit
// or weaken the full roster and weapon coverage to a lower bound.
func TestUserIranAddendumExactRoster(t *testing.T) {
	c := MustBase()
	wantUnits := strings.Fields(`
		US.rifle US.at US.recon US.elite US.engineer US.medic US.car US.apc
		US.tank US.artillery US.aa US.repair US.fighter US.strike US.gunship
		US.launcher US.rig US.hauler US.airlift
		IR.rifle IR.at IR.recon IR.elite IR.engineer IR.medic IR.car IR.apc
		IR.tank IR.artillery IR.aa IR.repair IR.fighter IR.strike IR.gunship
		IR.launcher IR.rig IR.hauler IR.isr IR.shahed
		SY.rifle SY.at SY.recon SY.elite SY.engineer SY.medic SY.car SY.apc
		SY.tank SY.artillery SY.aa SY.repair SY.portable_aa SY.scout_drone
		SY.buggy SY.launcher SY.rig SY.hauler
		SA.rifle SA.at SA.recon SA.elite SA.engineer SA.medic SA.car SA.apc
		SA.tank SA.artillery SA.aa SA.repair SA.fighter SA.strike SA.gunship
		SA.launcher SA.rig SA.hauler SA.mobile_abm`)
	units := c.Units()
	if len(wantUnits) != 76 || len(units) != len(wantUnits) {
		t.Fatalf("exact user-approved roster: got=%d want=%d", len(units), len(wantUnits))
	}
	expected := map[string]bool{}
	for _, id := range wantUnits {
		if expected[id] {
			t.Fatalf("duplicate expected identity %s", id)
		}
		expected[id] = true
	}
	for _, unit := range units {
		if !expected[unit.ID] || !strings.HasPrefix(unit.ID, unit.Faction+".") {
			t.Fatalf("unexpected, duplicate, or wrong-faction unit %+v", unit)
		}
		delete(expected, unit.ID)
	}
	if len(expected) != 0 {
		t.Fatalf("missing original/addendum identities: %v", expected)
	}

	var p Pack
	if err := json.Unmarshal(c.JSON(), &p); err != nil {
		t.Fatal(err)
	}
	wantWeapons := strings.Fields(`RIF REC ELI APC AUTO TANK AT ART AA
		FIGHT STRIKE GUN US_FIGHT US_STRIKE US_GUN IR_ART IR_FIGHT IR_STRIKE
		IR_LOITER IR_SHAHED SY_ART SY_AA SY_BUGGY SY_TANK MISSILE IR_MISSILE
		SY_ROCKET TURRET AA_POST`)
	if len(wantWeapons) != 29 || len(p.Weapons) != len(wantWeapons) {
		t.Fatalf("exact weapon roster: got=%d want=%d", len(p.Weapons), len(wantWeapons))
	}
	expected = map[string]bool{}
	for _, id := range wantWeapons {
		if expected[id] {
			t.Fatalf("duplicate expected weapon %s", id)
		}
		expected[id] = true
	}
	for _, weapon := range p.Weapons {
		if !expected[weapon.ID] {
			t.Fatalf("unexpected or duplicate weapon %s", weapon.ID)
		}
		delete(expected, weapon.ID)
	}
	if len(expected) != 0 {
		t.Fatalf("missing original/addendum weapons: %v", expected)
	}
}

func TestUserIranAddendumDistinctDroneAndCounterLayers(t *testing.T) {
	c := MustBase()
	drone, ok := c.Unit("IR.shahed")
	if !ok || drone.Name != "Shahed attack drone" || drone.Faction != "IR" || drone.Role != "shahed" ||
		drone.Cost != 400000 || drone.BuildTicks != 18*20 || drone.HP != 140000 ||
		drone.Armor != "air" || drone.Supply != 1 || drone.Tier != 2 || drone.Speed != 4500 ||
		drone.Weapon != "IR_SHAHED" || drone.Producer != "drone_hub" ||
		drone.Radius != 600 || drone.Sight != 11000 || drone.Detection != 0 {
		t.Fatalf("user-approved paid one-way catalog contract: %+v", drone)
	}
	hub, ok := c.Building(AirProducer(drone.Faction))
	if !ok || hub.ID != "IR.drone_hub" || hub.Role != drone.Producer || hub.Faction != drone.Faction || hub.ServiceSlots != 6 {
		t.Fatalf("new drone lost the existing owned hub production/capacity contract: %+v", hub)
	}
	w, ok := c.Weapon(drone.Weapon)
	if !ok || w.Kind != "airground" || w.Damage != 220000 || w.Splash != 1200 || w.Ammo != 1 || w.Volley != 1 {
		t.Fatalf("terminal payload must remain one ordinary ground-only air payload: %+v", w)
	}
	// These are inert contact metadata. Physical terminal impact is tested in
	// the separate simulation lane; no generic ranged shot is authorized here.
	if w.MinRange != 0 || w.MaxRange != 600 || w.WindupTicks != 1 || w.IntervalTicks != 1 || w.VolleySpacingTicks != 0 {
		t.Fatalf("unexpected ranged-fire metadata: %+v", w)
	}
	strike, ok := c.Weapon("IR_STRIKE")
	if !ok || strike.Kind != w.Kind {
		t.Fatal("new payload must inherit the existing strike armor class")
	}
	for _, tc := range []struct {
		armor string
		want  int32
	}{{"infantry", 650}, {"light", 1000}, {"heavy", 1000}, {"structure", 1000}, {"air", 0}} {
		if got := c.Multiplier(w.Kind, tc.armor); got != tc.want {
			t.Fatalf("ordinary airground/%s: got=%d want=%d", tc.armor, got, tc.want)
		}
	}
	for _, tc := range []struct {
		id     string
		role   string
		weapon string
		ammo   int32
	}{{"IR.fighter", "fighter", "IR_FIGHT", 6}, {"IR.strike", "strike", "IR_STRIKE", 2},
		{"IR.gunship", "gunship", "IR_LOITER", 10}, {"IR.isr", "isr", "", 0}} {
		u, found := c.Unit(tc.id)
		if !found || u.Role != tc.role || u.Weapon != tc.weapon || u.Armor != "air" || u.Producer != "drone_hub" {
			t.Fatalf("original reusable drone identity/role changed: %+v", u)
		}
		if tc.weapon != "" {
			weapon, found := c.Weapon(tc.weapon)
			if !found || weapon.Ammo != tc.ammo {
				t.Fatalf("original reusable magazine changed: %+v", weapon)
			}
		}
	}
	launcher, ok := c.Unit("IR.launcher")
	if !ok || launcher.Name != "Ballistic missile launcher" || launcher.Role != "launcher" ||
		launcher.Cost != 2400000 || launcher.BuildTicks != 55*20 || launcher.HP != 600000 ||
		launcher.Armor != "light" || launcher.Supply != 5 || launcher.Tier != 3 ||
		launcher.Speed != 1800 || launcher.Weapon != "IR_MISSILE" || launcher.Producer != "factory" {
		t.Fatalf("ballistic display name must preserve the existing launcher contract: %+v", launcher)
	}
	missile, ok := c.Weapon(launcher.Weapon)
	if !ok || missile.Kind != "tactical" || missile.Damage != 350000 || missile.IntervalTicks != 60*20 ||
		missile.MinRange != 10000 || missile.MaxRange != 44000 || missile.Ammo != 2 || missile.Splash != 2000 {
		t.Fatalf("ballistic naming must preserve the existing missile/interception layer: %+v", missile)
	}
	if w.Kind == missile.Kind || c.Multiplier("antiair", drone.Armor) != 1000 {
		t.Fatal("drone aircraft and interceptable missiles must keep distinct counter layers")
	}
}

func TestUserIranAddendumUsesOrdinaryContentValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Pack, int)
	}{
		{"duplicate_paid_identity", func(p *Pack, i int) { p.Units = append(p.Units, p.Units[i]) }},
		{"missing_terminal_weapon", func(p *Pack, i int) { p.Units[i].Weapon = "MISSING_SHAHED_PAYLOAD" }},
		{"missing_producer", func(p *Pack, i int) { p.Units[i].Producer = "missing_hub" }},
		{"free_purchase", func(p *Pack, i int) { p.Units[i].Cost = 0 }},
		{"missing_airground_air_rule", func(p *Pack, _ int) {
			for i, rule := range p.Armor {
				if rule.Weapon == "airground" && rule.Armor == "air" {
					p.Armor = append(p.Armor[:i], p.Armor[i+1:]...)
					return
				}
			}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var p Pack
			if err := json.Unmarshal(baseRules, &p); err != nil {
				t.Fatal(err)
			}
			index := -1
			for i, unit := range p.Units {
				if unit.ID == "IR.shahed" {
					index = i
				}
			}
			if index < 0 {
				t.Fatal("new paid identity absent before mutation")
			}
			tc.mutate(&p, index)
			data, err := json.Marshal(p)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := Decode(data); err == nil {
				t.Fatal("accepted invalid paid drone content")
			}
		})
	}
}
