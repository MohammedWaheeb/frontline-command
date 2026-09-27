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
	if len(p.Units) != 75 || len(p.Weapons) != 28 || len(p.Buildings) != 19 || len(p.Upgrades) != 10 {
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
