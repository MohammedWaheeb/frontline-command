package sim

import "frontlinecommand/pkg/content"

// combatRule is immutable catalog data, shared by all entities of one operating
// type. Entity state (including landed armor, ownership and retained physical
// footprints) is deliberately not cached. These derived values never enter State.
type combatRule struct {
	role      string
	armor     string
	radius    int32
	weapon    content.Weapon
	armed     bool
	infantry  int32
	light     int32
	heavy     int32
	structure int32
	air       int32
}

func (e *Engine) combatRule(v *Entity) *combatRule {
	rules := e.unitCombatRules
	if v.Building {
		rules = e.buildingCombatRules
	}
	if r := rules[v.Type]; r != nil {
		return r
	}
	r := new(combatRule)
	var weapon string
	if v.Building {
		b, _ := e.buildingRule(v.Type)
		r.role, r.armor, weapon = b.Role, "structure", b.Weapon
	} else {
		u, _ := e.catalog.Unit(v.Type)
		r.role, r.armor, r.radius, weapon = u.Role, u.Armor, u.Radius, u.Weapon
	}
	r.weapon, r.armed = e.catalog.Weapon(weapon)
	r.infantry = e.catalog.Multiplier(r.weapon.Kind, "infantry")
	r.light = e.catalog.Multiplier(r.weapon.Kind, "light")
	r.heavy = e.catalog.Multiplier(r.weapon.Kind, "heavy")
	r.structure = e.catalog.Multiplier(r.weapon.Kind, "structure")
	r.air = e.catalog.Multiplier(r.weapon.Kind, "air")
	if rules == nil {
		rules = make(map[string]*combatRule)
		if v.Building {
			e.buildingCombatRules = rules
		} else {
			e.unitCombatRules = rules
		}
	}
	rules[v.Type] = r
	return r
}

func (r *combatRule) entityArmor(v *Entity) string {
	if r.armor == "air" && v.Landed {
		return "light"
	}
	return r.armor
}

func (r *combatRule) multiplier(armor string) int32 {
	switch armor {
	case "infantry":
		return r.infantry
	case "light":
		return r.light
	case "heavy":
		return r.heavy
	case "structure":
		return r.structure
	case "air":
		return r.air
	}
	// Catalog validation only admits these five armor classes. Unknown entity
	// types retain the catalog's zero multiplier for an empty armor class.
	return 0
}
