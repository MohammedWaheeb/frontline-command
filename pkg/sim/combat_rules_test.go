package sim

import (
	"bytes"
	"testing"

	"frontlinecommand/pkg/content"
)

// Resolve directly through the public catalog, independently of derived caches.
func assertCombatRulesMatchCatalog(t *testing.T, e *Engine, v *Entity) {
	t.Helper()
	var role, armor, weapon string
	var radius int32
	if v.Building {
		b, _ := e.catalog.Building(v.Type)
		role, armor, weapon = b.Role, "structure", b.Weapon
	} else {
		u, _ := e.catalog.Unit(v.Type)
		role, armor, radius, weapon = u.Role, u.Armor, u.Radius, u.Weapon
		if armor == "air" && v.Landed {
			armor = "light"
		}
	}
	w, armed := e.catalog.Weapon(weapon)
	if got, ok := e.weapon(v); got != w || ok != armed {
		t.Fatalf("%s building=%v weapon=%+v/%v want=%+v/%v", v.Type, v.Building, got, ok, w, armed)
	}
	if e.role(v) != role || e.armor(v) != armor || e.radius(v) != radius {
		t.Fatalf("%s building=%v landed=%v role/armor/radius=%s/%s/%d want=%s/%s/%d", v.Type, v.Building, v.Landed, e.role(v), e.armor(v), e.radius(v), role, armor, radius)
	}
	r := e.combatRule(v)
	for _, layer := range []string{"infantry", "light", "heavy", "structure", "air", ""} {
		if got, want := r.multiplier(layer), e.catalog.Multiplier(w.Kind, layer); got != want {
			t.Fatalf("%s %s multiplier=%d want=%d", v.Type, layer, got, want)
		}
	}
}

func TestCombatRulesCatalogAndTypeTransitions(t *testing.T) {
	e := fixture(t)
	// Reuse the same entity and ID throughout. Capture/conversion changes the
	// operating type without replacing the entity or its physical foundation.
	v := &Entity{ID: 900, HP: 1000, FootprintWidth: 7, FootprintHeight: 3}
	types := []string{"IR.beacon", "US.support_plane", "unknown.type", ""}
	for _, unit := range e.catalog.Units() {
		types = append(types, unit.ID)
	}
	for _, building := range e.catalog.Buildings() {
		types = append(types, building.ID)
	}
	for _, object := range content.ObjectClasses() {
		types = append(types, "map."+object.ID)
	}
	for repeat := range 2 {
		for _, typ := range types {
			v.Type = typ
			for _, building := range []bool{false, true} {
				v.Building = building
				for _, landed := range []bool{false, true} {
					v.Landed = landed
					assertCombatRulesMatchCatalog(t, e, v)
				}
			}
			if v.FootprintWidth != 7 || v.FootprintHeight != 3 {
				t.Fatalf("pass %d: rule lookup modified physical foundation", repeat)
			}
		}
	}
}

func TestCombatRulesMutableTargetEligibility(t *testing.T) {
	e := fixture(t)
	e.state.Tick = 100
	var sourceType string
	// Use an explicitly armed air-defense source from the catalog rather than
	// relying on a purchasable type alias.
	for _, unit := range e.catalog.Units() {
		w, ok := e.catalog.Weapon(unit.Weapon)
		if ok && w.Kind == "antiair" {
			sourceType = unit.ID
			break
		}
	}
	if sourceType == "" {
		t.Fatal("catalog has no air-defense source")
	}
	a := e.spawn(sourceType, 1, Vec{X: 16000, Y: 24000}, true, 0)
	b := e.spawn("US.support_plane", 2, Vec{X: 18000, Y: 24000}, true, 0)
	b.Landed = false
	if !e.canAttack(a, b) {
		t.Fatal("armed air defense cannot attack live enemy support aircraft")
	}
	b.Landed = true
	if e.canAttack(a, b) {
		t.Fatal("landed aircraft retained cached air armor")
	}
	b.Landed = false
	b.DisabledUntil = e.state.Tick + 1
	if e.canAttack(a, b) {
		t.Fatal("disabled support aircraft remained attackable")
	}
	b.DisabledUntil = e.state.Tick
	if !e.canAttack(a, b) {
		t.Fatal("support aircraft remained disabled after deadline")
	}
	b.Owner = a.Owner
	if e.canAttack(a, b) {
		t.Fatal("ownership change reused enemy eligibility")
	}
	b.Owner = 2
	b.Container = a.ID
	if e.canAttack(a, b) {
		t.Fatal("contained target remained attackable")
	}
	b.Container = 0
	e.player(2).Defeated = true
	if e.canAttack(a, b) {
		t.Fatal("defeated target remained attackable")
	}
	if e.canAttack(nil, b) || e.canAttack(a, nil) {
		t.Fatal("nil target/source became attackable")
	}
}

func TestCombatRulesCacheDoesNotChangeSaveOrRestore(t *testing.T) {
	e := fixture(t)
	e.spawn("US.tank", 1, Vec{X: 28000, Y: 24000}, true, 0)
	e.spawn("IR.tank", 2, Vec{X: 32000, Y: 24000}, true, 0)
	e.updateFog()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	hash := e.Hash()
	for _, entity := range e.state.Entities {
		assertCombatRulesMatchCatalog(t, e, entity)
	}
	for _, typ := range []string{"unknown.type", "IR.beacon", "US.support_plane"} {
		assertCombatRulesMatchCatalog(t, e, &Entity{Type: typ})
	}
	after, err := e.Save()
	if err != nil || !bytes.Equal(saved, after) || e.Hash() != hash {
		t.Fatal("derived rule cache entered authoritative state", err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	// Restore may consult type rules during validation/visibility. Clearing only
	// those derived maps exercises reconstruction from a completely cold cache.
	restored.unitCombatRules, restored.buildingCombatRules = nil, nil
	for range 80 {
		e.Advance()
		restored.Advance()
		if e.Hash() != restored.Hash() {
			t.Fatalf("warm/cold combat cache diverged at tick %d", e.Tick())
		}
	}
}
