package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
	"testing"
	"time"
)

func maximumFixture(t testing.TB) *Engine {
	return maximumFactionFixture(t, []string{"US", "IR", "SY", "SA"})
}
func maximumFactionFixture(t testing.TB, factions []string) *Engine {
	m := fixtureMap()
	m.Width = 160
	m.Height = 160
	m.Tiles = make([]content.Tile, 25600)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	m.Spawns = []content.Spawn{{Position: Vec{X: 20000, Y: 20000}}, {Position: Vec{X: 140000, Y: 20000}}, {Position: Vec{X: 20000, Y: 140000}}, {Position: Vec{X: 140000, Y: 140000}}}
	m.Fields = nil
	m.Stations = nil
	m.Shipment = Vec{X: 80000, Y: 80000}
	cfg := Config{Map: m, Seed: 1}
	for i, f := range factions {
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(i + 1), Name: f, Faction: f, Team: uint32(i + 1)})
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Entities = nil
	e.state.Countdown = 0
	for i, p := range e.state.Players {
		ox, oy := int32(8000+(i%2)*90000), int32(8000+(i/2)*90000)
		for n := 0; n < 60; n++ {
			typ := "power"
			if n > 0 && n <= 16 {
				typ = "bunker"
			}
			if n == 0 {
				typ = "hq"
			}
			e.spawn(typ, p.ID, Vec{X: ox + int32(n%10)*4000, Y: oy + int32(n/10)*4000}, true, 0)
		}
		for n := 0; n < 100; n++ {
			e.spawn(p.Faction+".recon", p.ID, Vec{X: ox + int32(n%10)*1200, Y: oy + 30000 + int32(n/10)*1200}, true, 350000)
		}
		for n := 0; n < 12; n++ {
			role := "hauler"
			if n < 4 {
				role = "rig"
			}
			e.spawn(p.Faction+"."+role, p.ID, Vec{X: ox + int32(n)*2000, Y: oy + 46000}, true, 800000)
		}
	}
	e.recalculate()
	e.updateFog()
	if len(e.state.Entities) != 688 {
		t.Fatal("stress fixture actor count")
	}
	return e
}
func TestMaximumActorTickBudget(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("performance workload runs without race instrumentation")
	}
	e := maximumFixture(t)
	times := make([]time.Duration, 100)
	for i := range times {
		start := time.Now()
		e.Advance()
		times[i] = time.Since(start)
	}
	sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })
	t.Logf("688 actors steady tick p50=%s p95=%s p99=%s; host-specific measurement", times[50], times[95], times[99])
	if times[95] > 25*time.Millisecond || times[99] > 40*time.Millisecond {
		t.Fatalf("declared simulation tick budget exceeded")
	}
}
func BenchmarkMaximumActors(b *testing.B) {
	e := maximumFixture(b)
	b.ResetTimer()
	for b.Loop() {
		e.Advance()
	}
}

func TestMaximumActorsMovingAndFighting(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("performance workload runs without race instrumentation")
	}
	e := maximumFixture(t)
	armies := map[PlayerID][]ID{}
	for i, p := range e.state.Players {
		n := 0
		for _, v := range e.state.Entities {
			if v.Owner == p.ID && !v.Building && e.role(v) != "rig" && e.role(v) != "hauler" {
				// All factions' standard rifle squads use one Supply; this remains legal.
				u, _ := e.catalog.Unit(p.Faction + ".rifle")
				v.Type = u.ID
				v.HP = u.HP
				v.MaxHP = u.HP
				v.Position = Vec{X: 55000 + int32(i%2)*35000 + int32(n%10)*1200, Y: 55000 + int32(i/2)*35000 + int32(n/10)*1200}
				armies[p.ID] = append(armies[p.ID], v.ID)
				n++
			}
		}
	}
	e.recalculate()
	e.updateFog()
	var measurements []time.Duration
	peakProjectiles, fired := 0, 0
	for tick := 0; tick < 1200; tick++ {
		if tick < 320 && tick%40 == 0 {
			for _, p := range e.state.Players {
				goal := Vec{X: 78000 + int32((tick/40)%2)*4000, Y: 78000 + int32((tick/40)%2)*4000}
				ids := armies[p.ID]
				for start := 0; start < len(ids); start += 64 {
					live := []ID{}
					for _, id := range ids[start:min(start+64, len(ids))] {
						if v := e.entity(id); v != nil && v.HP > 0 {
							live = append(live, id)
						}
					}
					if len(live) > 0 {
						if err := e.Submit(p.ID, p.LastSequence+1, []Order{{Kind: "attack_move", Entities: live, Position: goal}}); err != nil {
							t.Fatal(err)
						}
					}
				}
			}
		}
		start := time.Now()
		e.Advance()
		measurements = append(measurements, time.Since(start))
		peakProjectiles = max(peakProjectiles, len(e.state.Projectiles))
		for _, event := range e.state.Events {
			if event.Kind == "weapon_fired" {
				fired++
			}
		}
	}
	if fired == 0 {
		t.Fatal("stress workload did not reach combat")
	}
	sort.Slice(measurements, func(i, j int) bool { return measurements[i] < measurements[j] })
	p50, p95, p99 := measurements[600], measurements[1140], measurements[1188]
	t.Logf("legal initial 688 actors, mass route changes + combat: p50=%s p95=%s p99=%s; shots=%d peak projectiles=%d final actors=%d; host-specific", p50, p95, p99, fired, peakProjectiles, len(e.state.Entities))
	if p95 > 25*time.Millisecond || p99 > 40*time.Millisecond {
		t.Fatal("moving/combat tick budget exceeded")
	}
}
