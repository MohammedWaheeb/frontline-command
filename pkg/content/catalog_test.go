package content

import (
	"encoding/json"
	"testing"
)

func TestBaseCatalogMatchesApprovedRoster(t *testing.T) {
	c, e := Base()
	if e != nil {
		t.Fatal(e)
	}
	var p Pack
	if e = json.Unmarshal(c.JSON(), &p); e != nil {
		t.Fatal(e)
	}
	if len(p.Units) != 76 || len(p.Weapons) != 29 || len(p.Buildings) != 20 || len(p.Upgrades) != 10 {
		t.Fatal("incomplete base catalog")
	}
	counts := map[string]int{}
	for _, u := range p.Units {
		counts[u.Faction]++
		if u.Faction == "SY" && u.Armor == "air" && (u.ID != "SY.scout_drone" || u.Weapon != "") {
			t.Fatal("Syrian air roster drift")
		}
	}
	for _, f := range []string{"US", "IR", "SY", "SA"} {
		want := 19
		if f == "IR" {
			want = 20
		}
		if f == "SY" {
			want = 18
		}
		if counts[f] != want {
			t.Fatal(f, counts[f])
		}
	}
	u, _ := c.Unit("SY.tank")
	if u.Cost != 1250000 || u.HP != 1050000 || u.Weapon != "SY_TANK" {
		t.Fatal("superseded tank balance")
	}
	w, _ := c.Weapon("IR_ART")
	if w.IntervalTicks != 120 || w.Volley != 4 || w.VolleySpacingTicks != 8 {
		t.Fatal("rocket volley")
	}
}
func TestCatalogImmutable(t *testing.T) {
	c := MustBase()
	b, _ := c.Building("factory")
	b.Prerequisites[0] = "invalid"
	again, _ := c.Building("factory")
	if again.Prerequisites[0] == "invalid" {
		t.Fatal("mutation escaped")
	}
	d, e := Decode(c.JSON())
	if e != nil || d.Hash() != c.Hash() {
		t.Fatal("unstable content hash", e)
	}
}

func TestPresentationCatalogIncludesAuthoritativeObjectDimensions(t *testing.T) {
	c := MustBase()
	var presentation struct {
		Pack
		Objects []ObjectClass `json:"object_classes"`
	}
	if err := json.Unmarshal(c.PresentationJSON(), &presentation); err != nil {
		t.Fatal(err)
	}
	if len(presentation.Units) != 76 || len(presentation.Objects) != len(ObjectClasses()) {
		t.Fatal("presentation catalog missing rules")
	}
	for _, object := range presentation.Objects {
		expected, ok := ObjectRule(object.ID)
		if !ok || expected != object {
			t.Fatal("object geometry drifted from Go")
		}
	}
	pack, _ := json.Marshal(presentation.Pack)
	decoded, err := Decode(pack)
	if err != nil || decoded.Hash() != c.Hash() {
		t.Fatal("presentation changed canonical rules hash", err)
	}
}
func TestRejectInvalidCatalog(t *testing.T) {
	for _, mut := range []func(*Pack){func(p *Pack) { p.Units[0].Cost = -1 }, func(p *Pack) { p.Units = append(p.Units, p.Units[0]) }, func(p *Pack) { p.Units[0].Weapon = "missing" }, func(p *Pack) { p.Buildings[0].Prerequisites = []string{"power"} }, func(p *Pack) { p.Armor = nil }} {
		var p Pack
		json.Unmarshal(baseRules, &p)
		mut(&p)
		b, _ := json.Marshal(p)
		if _, e := Decode(b); e == nil {
			t.Fatal("accepted invalid pack")
		}
	}
}

// Prerequisites name roles, and faction buildings have IDs distinct from
// their role ("US.airfield" provides role "airfield"). A cycle through such
// a role must be rejected even though no building ID equals the role.
func TestRejectRolePrerequisiteCycle(t *testing.T) {
	var p Pack
	json.Unmarshal(baseRules, &p)
	for i := range p.Buildings {
		if p.Buildings[i].ID == "radar" {
			// airfield buildings already require radar: radar<->airfield.
			p.Buildings[i].Prerequisites = []string{"airfield"}
		}
	}
	b, _ := json.Marshal(p)
	if _, e := Decode(b); e == nil {
		t.Fatal("accepted radar<->airfield role prerequisite cycle")
	}
	json.Unmarshal(baseRules, &p)
	for i := range p.Buildings {
		if p.Buildings[i].ID == "US.airfield" {
			p.Buildings[i].Prerequisites = []string{"airfield"}
		}
	}
	b, _ = json.Marshal(p)
	if _, e := Decode(b); e == nil {
		t.Fatal("accepted building requiring its own role")
	}
}
func TestRejectWeaponSplashAndTimingOutOfRange(t *testing.T) {
	for name, mut := range map[string]func(*Weapon){
		"splash above save cap": func(w *Weapon) { w.Splash = 999999 },
		"splash negative":       func(w *Weapon) { w.Splash = -1 },
		"windup above match":    func(w *Weapon) { w.WindupTicks = 999999 },
		"volley spacing above":  func(w *Weapon) { w.VolleySpacingTicks = 999999 },
	} {
		t.Run(name, func(t *testing.T) {
			var p Pack
			json.Unmarshal(baseRules, &p)
			mut(&p.Weapons[0])
			b, _ := json.Marshal(p)
			if _, e := Decode(b); e == nil {
				t.Fatal("accepted out-of-range weapon")
			}
		})
	}
	var p Pack
	json.Unmarshal(baseRules, &p)
	p.Weapons[0].Splash = 10000 // boundary: exactly the sim save cap.
	b, _ := json.Marshal(p)
	if _, e := Decode(b); e != nil {
		t.Fatal("rejected splash at save cap:", e)
	}
}
func TestRejectUnknownArmorKinds(t *testing.T) {
	for name, rule := range map[string]ArmorRule{
		"unknown weapon kind": {Weapon: "cannno", Armor: "light", Multiplier: 100},
		"unknown armor kind":  {Weapon: "cannon", Armor: "structur", Multiplier: 100},
	} {
		t.Run(name, func(t *testing.T) {
			var p Pack
			json.Unmarshal(baseRules, &p)
			p.Armor = append(p.Armor, rule)
			b, _ := json.Marshal(p)
			if _, e := Decode(b); e == nil {
				t.Fatal("accepted armor rule with unknown kind")
			}
		})
	}
}
func FuzzDecodeContent(f *testing.F) {
	f.Add(baseRules)
	f.Add([]byte(`{}`))
	f.Fuzz(func(t *testing.T, b []byte) {
		c, e := Decode(b)
		if e == nil {
			if _, e = Decode(c.JSON()); e != nil {
				t.Fatal(e)
			}
		}
	})
}
