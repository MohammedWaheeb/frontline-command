package sim

import (
	"frontlinecommand/pkg/content"
	"strings"
	"testing"
)

type containerValidationCase struct {
	typ, faction string
	capacity     int
}

var containerValidationCases = []containerValidationCase{
	{"US.apc", "US", 3}, {"IR.apc", "IR", 3}, {"SA.apc", "SA", 3}, {"SY.apc", "SY", 2},
	{"US.airlift", "US", 2}, {"bunker", "US", 2}, {"SY.safehouse", "SY", 2}, {"map.garrison", "US", 2},
}

// Geometry is a synthetic test fixture. Every valid occupancy relationship below
// is created through an ordinary board order, never by assigning Container.
func containerValidationFixture(t *testing.T, c containerValidationCase) (*Engine, *Entity, []ID) {
	t.Helper()
	m := fixtureMap()
	pos := Vec{X: 25500, Y: 19500}
	if c.typ == "map.garrison" {
		m.Objects = []content.MapObject{{ID: 1, Class: "garrison", Position: pos}}
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 926, Players: []PlayerConfig{{ID: 1, Faction: c.faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	// Skip only the shared match countdown; actual boarding/unload channel
	// durations, movement and receipts remain authoritative.
	e.state.Countdown = 0
	var carrier *Entity
	if c.typ == "map.garrison" {
		carrier = objectEntity(e, 1)
	} else {
		carrier = e.spawn(c.typ, 1, pos, true, 0)
	}
	if c.typ == "US.airlift" {
		home := e.spawn("US.airfield", 1, Vec{X: 14000, Y: 27000}, true, 2200000)
		carrier.Home = home.ID
	}
	var ids []ID
	for i := 0; i < c.capacity; i++ {
		v := e.spawn(c.faction+".rifle", 1, Vec{X: pos.X - 2400, Y: pos.Y + int32(i-1)*700}, true, 300000)
		ids = append(ids, v.ID)
	}
	e.recalculate()
	e.updateFog()
	return e, carrier, ids
}

func containerRestore(t *testing.T, e *Engine) *Engine {
	t.Helper()
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("restoring a valid container changed state")
	}
	return restored
}

func containerBoardAll(t *testing.T, e *Engine, carrier *Entity, ids []ID) {
	t.Helper()
	issue(t, e, 1, Order{Kind: "board", Entities: ids, Target: carrier.ID})
	for elapsed := 0; len(carrier.Passengers) < len(ids) && elapsed < 150; elapsed++ {
		e.Advance()
	}
	if len(carrier.Passengers) != len(ids) {
		t.Fatalf("ordinary boarding incomplete: %s %+v", carrier.Type, carrier.Passengers)
	}
	for _, id := range ids {
		if e.entity(id).Container != carrier.ID {
			t.Fatal("boarding did not establish reciprocal occupancy")
		}
	}
}

func TestContainerRestoreEveryTransportAndGarrison(t *testing.T) {
	for _, c := range containerValidationCases {
		t.Run(c.typ, func(t *testing.T) {
			e, carrier, ids := containerValidationFixture(t, c)
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			containerRestore(t, e) // Also covers an empty neutral garrison.
			issue(t, e, 1, Order{Kind: "board", Entities: ids, Target: carrier.ID})
			containerRestore(t, e) // Orders/channel pending, before any reservation.
			for elapsed := 0; len(carrier.Passengers) < c.capacity && elapsed < 150; elapsed++ {
				e.Advance()
			}
			if len(carrier.Passengers) != c.capacity {
				t.Fatal("carrier did not fill through legal boarding")
			}
			restored := containerRestore(t, e)
			order := Order{Kind: "unload", Entities: []ID{carrier.ID}}
			issue(t, e, 1, order)
			issue(t, restored, 1, order)
			containerRestore(t, e) // Retained passengers during an unload channel.
			for range 80 {
				e.Advance()
				restored.Advance()
				if e.Hash() != restored.Hash() {
					t.Fatalf("unload diverged at tick %d", e.Tick())
				}
			}
			if len(carrier.Passengers) != 0 {
				t.Fatal("ordinary unload did not finish")
			}
			for _, id := range ids {
				if v := e.entity(id); v == nil || v.Container != 0 || v.HP <= 0 {
					t.Fatal("unload lost valid passenger")
				}
			}
			containerRestore(t, e)
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil {
				t.Fatal(err)
			}
			if played.Hash() != e.Hash() {
				t.Fatal("boarding/unloading replay diverged")
			}
		})
	}
}

func TestContainerRestoreAllPermanentInfantryRoles(t *testing.T) {
	for _, u := range content.MustBase().Units() {
		if u.Armor != "infantry" {
			continue
		}
		t.Run(u.ID, func(t *testing.T) {
			c := containerValidationCase{typ: u.Faction + ".apc", faction: u.Faction, capacity: 0}
			e, carrier, _ := containerValidationFixture(t, c)
			unit := e.spawn(u.ID, 1, Vec{X: carrier.Position.X - 1600, Y: carrier.Position.Y}, true, u.Cost)
			e.recalculate()
			e.updateFog()
			containerBoardAll(t, e, carrier, []ID{unit.ID})
			containerRestore(t, e)
		})
	}
}

func TestContainerRestorePreservesInactiveAndAirborneOccupancy(t *testing.T) {
	for _, state := range []string{"disabled", "defeated-owner", "airborne"} {
		t.Run(state, func(t *testing.T) {
			c := containerValidationCase{"US.apc", "US", 3}
			if state == "airborne" {
				c = containerValidationCase{"US.airlift", "US", 2}
			}
			e, carrier, ids := containerValidationFixture(t, c)
			containerBoardAll(t, e, carrier, ids)
			switch state {
			case "disabled":
				carrier.DisabledUntil = e.Tick() + seconds(10)
				carrier.Enabled = false
			case "defeated-owner":
				e.defeat(e.player(1))
			case "airborne":
				issue(t, e, 1, Order{Kind: "move", Entities: []ID{carrier.ID}, Position: Vec{X: 42000, Y: 22000}})
				ticks(e, 20)
				if carrier.Landed {
					t.Fatal("airlift never took off")
				}
			}
			restored := containerRestore(t, e)
			for range 20 {
				e.Advance()
				restored.Advance()
				if e.Hash() != restored.Hash() {
					t.Fatal("retained occupancy diverged after restore")
				}
			}
			if len(e.entity(carrier.ID).Passengers) != len(ids) {
				t.Fatal("restoring inactive occupancy dropped passengers")
			}
		})
	}
}

func TestContainerRestoreSafehouseTransitAndBlockedUnload(t *testing.T) {
	for _, mode := range []string{"transit", "blocked-unload"} {
		t.Run(mode, func(t *testing.T) {
			e, source, ids := containerValidationFixture(t, containerValidationCase{"SY.safehouse", "SY", 2})
			containerBoardAll(t, e, source, ids)
			if mode == "transit" {
				destination := e.spawn("SY.safehouse", 1, Vec{X: 40000, Y: 36000}, true, 800000)
				e.updateFog()
				issue(t, e, 1, Order{Kind: "ability", Type: "transfer", Entities: []ID{source.ID}, Target: destination.ID})
				if source.Channel != "transit" || len(destination.Passengers) != 0 {
					t.Fatal("transfer did not retain source-only occupancy")
				}
				ticks(e, uint32(source.ChannelUntil-e.Tick()-1))
			} else {
				sealTransportArea(e, source.Position, true)
				issue(t, e, 1, Order{Kind: "unload", Entities: []ID{source.ID}})
				ticks(e, 40)
				if source.Channel != "unload" || source.State != "unload_exit_blocked" {
					t.Fatal("blocked unload fixture did not wait")
				}
			}
			restored := containerRestore(t, e)
			for range 20 {
				e.Advance()
				restored.Advance()
				if e.Hash() != restored.Hash() {
					t.Fatal("transit/unload continuation diverged")
				}
			}
			if mode == "transit" && len(source.Passengers) != 0 {
				t.Fatal("saved transit did not complete")
			}
			if mode == "blocked-unload" && len(source.Passengers) != len(ids) {
				t.Fatal("saved blocked unload lost occupancy")
			}
		})
	}
}

func TestContainerRestoreDestructionOutcome(t *testing.T) {
	for _, airborne := range []bool{false, true} {
		t.Run(map[bool]string{false: "ground-escape", true: "airborne-loss"}[airborne], func(t *testing.T) {
			e, carrier, ids := containerValidationFixture(t, containerValidationCase{"US.airlift", "US", 2})
			containerBoardAll(t, e, carrier, ids)
			if airborne {
				issue(t, e, 1, Order{Kind: "move", Entities: []ID{carrier.ID}, Position: Vec{X: 42000, Y: 22000}})
				ticks(e, 10)
			}
			transportImpact(e, carrier.ID, e.Tick()+1, true)
			restored := containerRestore(t, e) // A lethal projectile is still pending.
			e.Advance()
			restored.Advance()
			if e.Hash() != restored.Hash() || e.entity(carrier.ID) != nil {
				t.Fatal("carrier destruction changed after restore")
			}
			for _, id := range ids {
				v := e.entity(id)
				if airborne {
					if v != nil {
						t.Fatal("airborne passenger survived")
					}
				} else if v == nil || v.Container != 0 || v.HP != v.MaxHP/2 {
					t.Fatal("ground escape state invalid")
				}
			}
			containerRestore(t, e) // Death outcomes themselves remain loadable.
		})
	}
}

func TestContainerRestoreRejectsForgedCapacity(t *testing.T) {
	for _, c := range containerValidationCases {
		t.Run(c.typ, func(t *testing.T) {
			e, carrier, ids := containerValidationFixture(t, c)
			containerBoardAll(t, e, carrier, ids)
			extra := e.spawn(c.faction+".rifle", 1, carrier.Position, true, 300000)
			extra.Container = carrier.ID
			carrier.Passengers = append(carrier.Passengers, extra.ID)
			e.recalculate()
			if _, err := Restore(e.catalog, signedState(e.StateCopy())); err == nil {
				t.Fatalf("forged %d-passenger %s accepted", len(carrier.Passengers), c.typ)
			}
		})
	}
}

func TestContainerRestoreRejectsForgedRelationships(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Engine, *Entity, *Entity)
	}{
		{"nontransport-parent", func(e *Engine, p, c *Entity) { p.Type = "US.hauler" }},
		{"infantry-parent", func(e *Engine, p, c *Entity) { p.Type = "US.rifle" }},
		{"incomplete-parent", func(e *Engine, p, c *Entity) { p.Complete = false }},
		{"vehicle-passenger", func(e *Engine, p, c *Entity) { c.Type = "US.car" }},
		{"aircraft-passenger", func(e *Engine, p, c *Entity) { c.Type = "US.airlift"; c.Landed = false }},
		{"landed-aircraft-passenger", func(e *Engine, p, c *Entity) { c.Type = "US.airlift"; c.Landed = true }},
		{"building-passenger", func(e *Engine, p, c *Entity) {
			b, _ := e.buildingRule("power")
			c.Type = "power"
			c.Building = true
			c.FootprintType = "power"
			c.FootprintWidth = b.Width
			c.FootprintHeight = b.Height
		}},
		{"temporary-passenger", func(e *Engine, p, c *Entity) { c.TemporaryUntil = e.Tick() + 100 }},
		{"expired-temporary-passenger", func(e *Engine, p, c *Entity) { c.TemporaryUntil = 1 }},
		{"allied-other-owner", func(e *Engine, p, c *Entity) { e.player(2).Team = e.player(1).Team; c.Owner = 2 }},
		{"missing-parent", func(e *Engine, p, c *Entity) { p.Passengers = nil; c.Container = e.state.NextID + 1 }},
		{"missing-parent-reservation", func(e *Engine, p, c *Entity) { p.Passengers = nil }},
		{"missing-passenger-pointer", func(e *Engine, p, c *Entity) { c.Container = 0 }},
		{"missing-passenger", func(e *Engine, p, c *Entity) { p.Passengers = []ID{e.state.NextID + 1}; c.Container = 0 }},
		{"duplicate-passenger", func(e *Engine, p, c *Entity) { p.Passengers = []ID{c.ID, c.ID} }},
		{"self-container", func(e *Engine, p, c *Entity) { p.Container = p.ID; p.Passengers = []ID{p.ID}; c.Container = 0 }},
		{"container-cycle", func(e *Engine, p, c *Entity) { c.Type = "US.apc"; c.Passengers = []ID{p.ID}; p.Container = c.ID }},
		{"nested-container", func(e *Engine, p, c *Entity) {
			outer := e.spawn("US.apc", 1, Vec{X: 35000, Y: 20000}, true, 900000)
			outer.Passengers = []ID{p.ID}
			p.Container = outer.ID
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, parent, ids := containerValidationFixture(t, containerValidationCase{"US.apc", "US", 1})
			containerBoardAll(t, e, parent, ids)
			tc.mutate(e, parent, e.entity(ids[0]))
			_, err := Restore(e.catalog, signedState(e.StateCopy()))
			if err == nil {
				t.Fatal("structurally forged, correctly checksummed save accepted")
			}
			if !strings.Contains(err.Error(), "passenger") && !strings.Contains(err.Error(), "container") {
				t.Fatalf("rejected outside container validation: %v", err)
			}
		})
	}
}
