package content

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFieldBarricadeExactBuildingRoster(t *testing.T) {
	c := MustBase()
	want := strings.Fields(`hq power supply barracks factory radar tech depot
		outpost bunker turret aa_post abm strategic US.airfield IR.drone_hub
		SY.workshop_air SA.airfield SY.safehouse barrier`)
	buildings := c.Buildings()
	if len(want) != 20 || len(buildings) != len(want) {
		t.Fatalf("exact building roster: got=%d want=%d", len(buildings), len(want))
	}
	expected := map[string]bool{}
	for _, id := range want {
		if expected[id] {
			t.Fatalf("duplicate expected building %s", id)
		}
		expected[id] = true
	}
	for _, b := range buildings {
		if !expected[b.ID] {
			t.Fatalf("unexpected or duplicate building %s", b.ID)
		}
		delete(expected, b.ID)
	}
	if len(expected) != 0 {
		t.Fatalf("missing original/new building identities: %v", expected)
	}
	var p Pack
	if err := json.Unmarshal(c.JSON(), &p); err != nil {
		t.Fatal(err)
	}
	if len(p.Units) != 76 || len(p.Weapons) != 29 || len(p.Upgrades) != 10 {
		t.Fatal("barrier must not change the sealed Iran unit/weapon roster or research")
	}
}

// These are the catalog inputs to normal paid construction. Actual rig/engineer
// admission, forward placement, owned caps and collision belong to sim tests.
func TestFieldBarricadePaidConstructionInputs(t *testing.T) {
	c := MustBase()
	b, ok := c.Building("barrier")
	if !ok || b.Name != "Field barricade" || b.Role != "barrier" || b.Cost != 150000 ||
		b.BuildTicks != 8*20 || b.HP != 800000 || b.Width != 2 || b.Height != 1 ||
		b.PowerCapacity != 0 || b.PowerDemand != 0 || b.Faction != "" ||
		b.ServiceSlots != 0 || b.Weapon != "" || b.Defense || b.Qualifying {
		t.Fatalf("field barricade paid, unarmed, nonqualifying definition: %+v", b)
	}
	if len(b.Prerequisites) != 1 || b.Prerequisites[0] != "barracks" {
		t.Fatalf("normal construction must require barracks: %v", b.Prerequisites)
	}
	prerequisite, ok := c.Building("barracks")
	if !ok || prerequisite.Role != b.Prerequisites[0] {
		t.Fatal("required owned barracks role missing from the validated catalog")
	}
	// A caller changing its returned prerequisite list must not lower the next
	// caller's construction gate. Existing immutable-catalog guarantees apply.
	b.Prerequisites[0] = "power"
	again, ok := c.Building("barrier")
	if !ok || len(again.Prerequisites) != 1 || again.Prerequisites[0] != "barracks" {
		t.Fatal("caller mutation weakened barricade prerequisites")
	}
	restored, err := Decode(c.JSON())
	if err != nil || restored.Hash() != c.Hash() {
		t.Fatalf("new building breaks canonical content roundtrip: %v", err)
	}
	roundtrip, ok := restored.Building("barrier")
	if !ok || len(roundtrip.Prerequisites) != 1 || roundtrip.Prerequisites[0] != "barracks" ||
		roundtrip.Cost != 150000 || roundtrip.Width != 2 || roundtrip.Height != 1 {
		t.Fatal("decoded construction inputs changed")
	}
}

func TestFieldBarricadeOrdinaryProductionValidation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Pack, int)
	}{
		{"duplicate_building_identity", func(p *Pack, i int) { p.Buildings = append(p.Buildings, p.Buildings[i]) }},
		{"negative_price", func(p *Pack, i int) { p.Buildings[i].Cost = -1 }},
		{"zero_build_work", func(p *Pack, i int) { p.Buildings[i].BuildTicks = 0 }},
		{"empty_footprint", func(p *Pack, i int) { p.Buildings[i].Width = 0 }},
		{"missing_required_role", func(p *Pack, i int) { p.Buildings[i].Prerequisites = []string{"missing_barracks"} }},
		{"cyclic_required_role", func(p *Pack, i int) { p.Buildings[i].Prerequisites = []string{"barrier"} }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var p Pack
			if err := json.Unmarshal(baseRules, &p); err != nil {
				t.Fatal(err)
			}
			index := -1
			for i, b := range p.Buildings {
				if b.ID == "barrier" {
					index = i
				}
			}
			if index < 0 {
				t.Fatal("new paid building absent before mutation")
			}
			tc.mutate(&p, index)
			data, err := json.Marshal(p)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := Decode(data); err == nil {
				t.Fatal("accepted invalid barricade construction content")
			}
		})
	}
}
