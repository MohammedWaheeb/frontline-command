// Package content defines immutable, validated gameplay rules. It has no I/O
// dependencies beyond its embedded base pack and is shared by native and WASM.
package content

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const Version = "2.0.0"

//go:embed rules.json
var baseRules []byte

type Unit struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Faction    string `json:"faction"`
	Role       string `json:"role"`
	Cost       int64  `json:"cost"`
	BuildTicks uint32 `json:"build_ticks"`
	HP         int64  `json:"hp"`
	Armor      string `json:"armor"`
	Supply     int32  `json:"supply"`
	Tier       int32  `json:"tier"`
	Speed      int32  `json:"speed"`
	Weapon     string `json:"weapon"`
	Producer   string `json:"producer"`
	Radius     int32  `json:"radius"`
	Sight      int32  `json:"sight"`
	Detection  int32  `json:"detection"`
}
type Weapon struct {
	ID                 string `json:"id"`
	Kind               string `json:"kind"`
	Damage             int64  `json:"damage"`
	IntervalTicks      uint32 `json:"interval_ticks"`
	MinRange           int32  `json:"min_range"`
	MaxRange           int32  `json:"max_range"`
	Ammo               int32  `json:"ammo"`
	WindupTicks        uint32 `json:"windup_ticks"`
	Splash             int32  `json:"splash"`
	Volley             int32  `json:"volley"`
	VolleySpacingTicks uint32 `json:"volley_spacing_ticks"`
}
type Building struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Role          string   `json:"role"`
	Cost          int64    `json:"cost"`
	BuildTicks    uint32   `json:"build_ticks"`
	HP            int64    `json:"hp"`
	Width         int32    `json:"width"`
	Height        int32    `json:"height"`
	PowerCapacity int32    `json:"power_capacity"`
	PowerDemand   int32    `json:"power_demand"`
	Prerequisites []string `json:"prerequisites"`
	Faction       string   `json:"faction"`
	ServiceSlots  int32    `json:"service_slots"`
	Weapon        string   `json:"weapon"`
	Defense       bool     `json:"defense"`
	Qualifying    bool     `json:"qualifying"`
}
type Upgrade struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Faction    string `json:"faction"`
	Cost       int64  `json:"cost"`
	BuildTicks uint32 `json:"build_ticks"`
	Tier       int32  `json:"tier"`
	Producer   string `json:"producer"`
	Effect     string `json:"effect"`
}
type ArmorRule struct {
	Weapon     string `json:"weapon"`
	Armor      string `json:"armor"`
	Multiplier int32  `json:"multiplier"`
}
type Pack struct {
	Version   string      `json:"version"`
	Units     []Unit      `json:"units"`
	Weapons   []Weapon    `json:"weapons"`
	Buildings []Building  `json:"buildings"`
	Upgrades  []Upgrade   `json:"upgrades"`
	Armor     []ArmorRule `json:"armor"`
}

// Catalog owns a private copy; lookups return values, preventing mid-match edits.
type Catalog struct {
	pack      Pack
	hash      string
	units     map[string]Unit
	weapons   map[string]Weapon
	buildings map[string]Building
	upgrades  map[string]Upgrade
	armor     map[string]int32
}

func Base() (*Catalog, error) { return Decode(baseRules) }
func MustBase() *Catalog {
	c, e := Base()
	if e != nil {
		panic(e)
	}
	return c
}
func Decode(data []byte) (*Catalog, error) {
	if len(data) > 4<<20 {
		return nil, fmt.Errorf("content pack exceeds 4 MiB")
	}
	var p Pack
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if e := d.Decode(&p); e != nil {
		return nil, e
	}
	if d.Decode(new(any)) != io.EOF {
		return nil, fmt.Errorf("trailing content")
	}
	if e := p.Validate(); e != nil {
		return nil, e
	}
	canonical, _ := json.Marshal(p)
	sum := sha256.Sum256(canonical)
	c := &Catalog{pack: p, hash: hex.EncodeToString(sum[:]), units: map[string]Unit{}, weapons: map[string]Weapon{}, buildings: map[string]Building{}, upgrades: map[string]Upgrade{}, armor: map[string]int32{}}
	for _, u := range p.Units {
		c.units[u.ID] = u
	}
	for _, w := range p.Weapons {
		c.weapons[w.ID] = w
	}
	for _, b := range p.Buildings {
		c.buildings[b.ID] = b
	}
	for _, u := range p.Upgrades {
		c.upgrades[u.ID] = u
	}
	for _, a := range p.Armor {
		c.armor[a.Weapon+":"+a.Armor] = a.Multiplier
	}
	return c, nil
}
func (c *Catalog) Hash() string { return c.hash }
func (c *Catalog) JSON() []byte { b, _ := json.Marshal(c.pack); return b }

// PresentationJSON includes the engine-owned map object dimensions needed to
// render observed rubble. JSON remains the exact canonical rules pack/hash API.
func (c *Catalog) PresentationJSON() []byte {
	b, _ := json.Marshal(struct {
		Pack
		Objects []ObjectClass `json:"object_classes"`
	}{c.pack, ObjectClasses()})
	return b
}
func (c *Catalog) Unit(id string) (Unit, bool) {
	// Ability-created entities are not purchasable members of the 75-unit roster.
	if id == "IR.beacon" {
		return Unit{ID: id, Name: "Forward beacon", Faction: "IR", Role: "beacon", Cost: 200000, HP: 100000, Armor: "structure", Radius: 300, Sight: 5000}, true
	}
	if id == "US.support_plane" {
		return Unit{ID: id, Name: "Skybreaker support aircraft", Faction: "US", Role: "support_plane", HP: 550000, Armor: "air", Radius: 600, Speed: 6000, Sight: 2000}, true
	}
	v, ok := c.units[id]
	return v, ok
}
func (c *Catalog) Weapon(id string) (Weapon, bool) { v, ok := c.weapons[id]; return v, ok }
func (c *Catalog) Building(id string) (Building, bool) {
	if strings.HasPrefix(id, "map.") {
		if object, ok := ObjectRule(strings.TrimPrefix(id, "map.")); ok {
			return Building{ID: id, Name: object.ID, Role: object.ID, HP: object.HP, Width: object.Width, Height: object.Height, BuildTicks: 1}, true
		}
	}
	v, ok := c.buildings[id]
	v.Prerequisites = append([]string(nil), v.Prerequisites...)
	return v, ok
}
func (c *Catalog) Upgrade(id string) (Upgrade, bool)     { v, ok := c.upgrades[id]; return v, ok }
func (c *Catalog) Multiplier(weapon, armor string) int32 { return c.armor[weapon+":"+armor] }
func (c *Catalog) Units() []Unit                         { return append([]Unit(nil), c.pack.Units...) }
func (c *Catalog) Buildings() []Building {
	v := make([]Building, 0, len(c.pack.Buildings))
	for _, b := range c.pack.Buildings {
		b.Prerequisites = append([]string(nil), b.Prerequisites...)
		v = append(v, b)
	}
	return v
}
func (c *Catalog) Upgrades() []Upgrade { return append([]Upgrade(nil), c.pack.Upgrades...) }
func ValidFaction(f string) bool       { return f == "US" || f == "IR" || f == "SY" || f == "SA" }
func AirProducer(f string) string {
	switch f {
	case "IR":
		return "IR.drone_hub"
	case "SY":
		return "SY.workshop_air"
	default:
		return f + ".airfield"
	}
}
func (p Pack) Validate() error {
	if p.Version == "" || len(p.Units) > 1024 || len(p.Buildings) > 256 || len(p.Weapons) > 256 {
		return fmt.Errorf("invalid content version or size")
	}
	ids := map[string]bool{}
	weapons := map[string]bool{}
	roles := map[string]bool{}
	unique := func(id string) error {
		if id == "" || len(id) > 80 || strings.ContainsAny(id, "/\\ \n\r\t") || ids[id] {
			return fmt.Errorf("invalid/duplicate content ID %q", id)
		}
		ids[id] = true
		return nil
	}
	for _, w := range p.Weapons {
		if e := unique(w.ID); e != nil {
			return e
		}
		if w.Damage <= 0 || w.Damage > 100000000 || w.IntervalTicks == 0 || w.MinRange < 0 || w.MaxRange <= w.MinRange || w.MaxRange > 256000 || w.Ammo < 0 || w.Ammo > 32 || w.Volley < 1 || w.Volley > 8 || w.WindupTicks == 0 {
			return fmt.Errorf("invalid weapon %s", w.ID)
		}
		switch w.Kind {
		case "small", "auto", "cannon", "antiarmor", "shell", "antiair", "airground", "tactical":
		default:
			return fmt.Errorf("unknown weapon class %s", w.Kind)
		}
		weapons[w.ID] = true
	}
	for _, b := range p.Buildings {
		if e := unique(b.ID); e != nil {
			return e
		}
		if b.Cost < 0 || b.Cost > 100000000 || b.HP <= 0 || b.HP > 100000000 || b.BuildTicks == 0 || b.Width < 1 || b.Width > 12 || b.Height < 1 || b.Height > 12 || b.PowerCapacity < 0 || b.PowerDemand < 0 || b.ServiceSlots < 0 || b.ServiceSlots > 16 || b.Faction != "" && !ValidFaction(b.Faction) || b.Weapon != "" && !weapons[b.Weapon] {
			return fmt.Errorf("invalid building %s", b.ID)
		}
		roles[b.Role] = true
	}
	deps := map[string][]string{}
	for _, b := range p.Buildings {
		deps[b.ID] = b.Prerequisites
		for _, r := range b.Prerequisites {
			if !roles[r] {
				return fmt.Errorf("missing prerequisite %s", r)
			}
		}
	}
	visited := map[string]uint8{}
	var visit func(string) error
	visit = func(id string) error {
		if visited[id] == 1 {
			return fmt.Errorf("cyclic prerequisite %s", id)
		}
		if visited[id] == 2 {
			return nil
		}
		visited[id] = 1
		for _, v := range deps[id] {
			if e := visit(v); e != nil {
				return e
			}
		}
		visited[id] = 2
		return nil
	}
	for _, b := range p.Buildings {
		if e := visit(b.ID); e != nil {
			return e
		}
	}
	for _, u := range p.Units {
		if e := unique(u.ID); e != nil {
			return e
		}
		if !ValidFaction(u.Faction) || u.Cost <= 0 || u.Cost > 100000000 || u.HP <= 0 || u.HP > 100000000 || u.BuildTicks == 0 || u.Speed <= 0 || u.Speed > 20000 || u.Supply < 0 || u.Supply > 100 || u.Tier < 1 || u.Tier > 3 || u.Radius <= 0 || u.Sight <= 0 || u.Sight > 32000 || u.Detection < 0 || !roles[u.Producer] || u.Weapon != "" && !weapons[u.Weapon] {
			return fmt.Errorf("invalid unit %s", u.ID)
		}
		switch u.Armor {
		case "infantry", "light", "heavy", "air":
		default:
			return fmt.Errorf("invalid armor %s", u.ID)
		}
	}
	for _, u := range p.Upgrades {
		if e := unique(u.ID); e != nil {
			return e
		}
		if u.Cost <= 0 || u.BuildTicks == 0 || u.Tier < 2 || u.Tier > 3 || !roles[u.Producer] || u.Faction != "" && !ValidFaction(u.Faction) {
			return fmt.Errorf("invalid upgrade %s", u.ID)
		}
	}
	matrix := map[string]bool{}
	for _, a := range p.Armor {
		k := a.Weapon + ":" + a.Armor
		if matrix[k] || a.Multiplier < 0 || a.Multiplier > 2000 {
			return fmt.Errorf("invalid armor multiplier %s", k)
		}
		matrix[k] = true
	}
	for _, w := range p.Weapons {
		if w.Kind == "tactical" {
			continue
		}
		for _, a := range []string{"infantry", "light", "heavy", "structure", "air"} {
			if !matrix[w.Kind+":"+a] {
				return fmt.Errorf("missing armor rule %s/%s", w.Kind, a)
			}
		}
	}
	return nil
}
