package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
	"testing"
	"time"
)

func maximumFixture(t testing.TB) *Engine {
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
	for i, f := range []string{"US", "IR", "SY", "SA"} {
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
			typ := "bunker"
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
