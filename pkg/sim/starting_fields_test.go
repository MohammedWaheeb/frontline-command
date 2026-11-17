package sim

import (
	"fmt"
	"os"
	"testing"

	"frontlinecommand/pkg/content"
)

func TestStartingFieldObservationIsStableAndNotLiveSight(t *testing.T) {
	m := fixtureMap()
	m.Stations = nil
	m.Fields = []content.Field{
		{ID: 9, Position: Vec{X: 8000, Y: 24000}, Credits: 36000000},
		{ID: 3, Position: Vec{X: 24000, Y: 8000}, Credits: 36000000},
	}
	for _, controller := range []string{"human", "script", "ai"} {
		t.Run(controller, func(t *testing.T) {
			pc := PlayerConfig{ID: 7, Name: "Opening", Faction: "US", Controller: controller}
			if controller == "ai" {
				pc.AI = "normal"
			}
			e, err := New(content.MustBase(), Config{Map: m, Players: []PlayerConfig{pc, {ID: 2, Name: "Other", Faction: "IR"}}})
			if err != nil {
				t.Fatal(err)
			}
			p := e.player(7)
			if len(p.KnownFields) != 1 || p.KnownFields[0].ID != 3 || !e.explored(7, m.Fields[1].Position) {
				t.Fatalf("spawn assignment or ID tie-break incorrect: %+v", p.KnownFields)
			}
			if e.canSee(7, m.Fields[1].Position) {
				t.Fatal("briefing granted live sight")
			}
			e.state.Tick = 10
			e.field(3).Remaining = 1000
			e.updateFog()
			if p.KnownFields[0].Remaining != 36000000 || p.KnownFields[0].Seen != 0 {
				t.Fatal("hidden stock refreshed from full state")
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil || restored.Hash() != e.Hash() {
				t.Fatal("starting observation restore diverged", err)
			}
		})
	}
}

// Exercise paid Power -> Supply construction from an unchanged shipped map.
// No scouts, manual gather orders, free buildings, or visibility edits rescue
// the included hauler. Player IDs are deliberately unsorted in every case.
func TestStartingHaulerPaidOpeningAllReleaseSpawns(t *testing.T) {
	for _, name := range []string{"copper-junction", "industrial-valley", "port-outskirts", "relay-heights", "dry-river", "border-depots", "twin-outposts", "convoy-union"} {
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile("../../content/maps/" + name + ".json")
			if err != nil {
				t.Fatal(err)
			}
			m, err := content.DecodeMap(data)
			if err != nil {
				t.Fatal(err)
			}
			for slot := range m.Spawns {
				t.Run(fmt.Sprintf("slot-%d", slot), func(t *testing.T) {
					startingHaulerPaidOpening(t, m, map[int]bool{slot: true})
				})
			}
			// Co-op mission slots include scripted factions which share a
			// field with a human base. Isolate those slots above; skirmish
			// parity additionally exercises every opening simultaneously.
			if name != "twin-outposts" && name != "convoy-union" {
				active := map[int]bool{}
				for slot := range m.Spawns {
					active[slot] = true
				}
				t.Run("simultaneous", func(t *testing.T) { startingHaulerPaidOpening(t, m, active) })
			}
		})
	}
}

func startingHaulerPaidOpening(t *testing.T, m content.Map, active map[int]bool) {
	t.Helper()
	cfg := Config{Map: m, Seed: 1031}
	factions := []string{"US", "IR", "SY", "SA"}
	for slot := range m.Spawns {
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(4 - slot), Name: fmt.Sprint(slot), Faction: factions[slot]})
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	for slot, pc := range cfg.Players {
		if !active[slot] {
			continue
		}
		nearest := e.state.Fields[0]
		for _, field := range e.state.Fields {
			if dist2(m.Spawns[slot].Position, field.Position) < dist2(m.Spawns[slot].Position, nearest.Position) {
				nearest = field
			}
		}
		if e.knownField(e.player(pc.ID), nearest.ID) == nil || !e.explored(pc.ID, nearest.Position) {
			t.Fatalf("slot %d starting field %d absent from opening briefing", slot, nearest.ID)
		}
	}
	type opening struct {
		building         ID
		stage            int
		gathered, income Tick
	}
	progress := make([]opening, len(cfg.Players))
	for e.Tick() < seconds(90) {
		if e.state.Countdown == 0 {
			for slot, pc := range cfg.Players {
				if !active[slot] {
					continue
				}
				o := &progress[slot]
				if o.building != 0 && e.entity(o.building).Complete {
					o.stage++
					o.building = 0
				}
				if o.stage >= 2 || o.building != 0 {
					continue
				}
				kind := []string{"power", "supply"}[o.stage]
				b, _ := e.buildingRule(kind)
				var rig *Entity
				for _, v := range e.state.Entities {
					if v.Owner == pc.ID && e.role(v) == "rig" {
						rig = v
						break
					}
				}
				// Choose legal visible ground nearest the known starting
				// field; Power stays near HQ to leave the supply approach free.
				goal := rig.Position
				if kind == "supply" {
					goal = e.player(pc.ID).KnownFields[0].Position
					for _, observation := range e.player(pc.ID).KnownFields {
						if dist2(m.Spawns[slot].Position, observation.Position) < dist2(m.Spawns[slot].Position, goal) {
							goal = observation.Position
						}
					}
				}
				var chosen Vec
				found := false
				center := m.Spawns[slot].Position
				for y := center.Y - 8000; y <= center.Y+8000; y += 500 {
					for x := center.X - 8000; x <= center.X+8000; x += 500 {
						pos := Vec{X: x, Y: y}
						if _, code := e.buildingRequirements(e.player(pc.ID), rig, Order{Type: kind, Position: pos}); code != "ok" || e.validPlacement(pc.ID, pos, b.Width, b.Height) != "ok" {
							continue
						}
						if !found || dist2(pos, goal) < dist2(chosen, goal) {
							chosen, found = pos, true
						}
					}
				}
				if !found {
					t.Fatalf("slot %d no legal %s foundation", slot, kind)
				}
				if err := e.Submit(pc.ID, e.player(pc.ID).LastSequence+1, []Order{{Kind: "build", Entities: []ID{rig.ID}, Type: kind, Position: chosen}}); err != nil {
					t.Fatal(err)
				}
				t.Logf("slot=%d build=%s tick=%d pos=%+v rig=%+v", slot, kind, e.Tick(), chosen, rig.Position)
				o.building = e.state.NextID // resolved by owner immediately after Advance
			}
		}
		e.Advance()
		for _, receipt := range e.state.Results {
			if !receipt.Accepted {
				t.Fatalf("opening rejected: %+v", receipt)
			}
		}
		for slot, pc := range cfg.Players {
			if !active[slot] {
				continue
			}
			o := &progress[slot]
			// Resolve foundations by owner, independent of batch ordering.
			if o.stage < 2 {
				for _, v := range e.state.Entities {
					if v.Owner == pc.ID && v.Type == []string{"power", "supply"}[o.stage] {
						o.building = v.ID
					}
				}
			}
			for _, v := range e.state.Entities {
				if v.Owner == pc.ID && e.role(v) == "hauler" && o.gathered == 0 && (v.State == "loading" || v.Cargo > 0) {
					o.gathered = e.Tick()
				}
			}
			if o.income == 0 && e.player(pc.ID).Income > 0 {
				o.income = e.Tick()
			}
		}
	}
	for slot, o := range progress {
		if !active[slot] {
			continue
		}
		t.Logf("slot=%d faction=%s first_loading=%.2fs first_income=%.2fs", slot, factions[slot], float64(o.gathered)/20, float64(o.income)/20)
		if o.gathered == 0 || o.gathered > seconds(75) || o.income == 0 || o.income > seconds(90) {
			t.Errorf("slot %d missed 75s gathering / 90s first-income bound: %+v", slot, o)
		}
	}
}
