package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Prepared fixtures isolate routing from map layout, spending and build time.
// Paid, unchanged shipping-map openings are recorded separately.
func harvestRoutingFixture(t testing.TB, rotation, separation, count int) (*Engine, []ID) {
	t.Helper()
	center := Vec{X: 32500, Y: 32500}
	e := fixture(t)
	e.state.Map.Fields = []content.Field{{ID: 1, Position: center, Credits: 36000000}}
	e.state.Fields = []*ResourceField{{ID: 1, Position: center, Remaining: 36000000}}
	// This prepared world replaces the authored field identities/positions.
	// Start its human observation memory with that world, not the old map.
	for _, player := range e.state.Players {
		player.KnownFields = nil
	}
	e.spawn("power", 1, Vec{X: 8000, Y: 16000}, true, 0)
	rotate := func(x, y int32) Vec {
		for range rotation {
			x, y = -y, x
		}
		return Vec{X: center.X + x, Y: center.Y + y}
	}
	// Supply footprint is one tile wider than high; equalize edge distance.
	offset := int32(separation)
	if rotation%2 != 0 {
		offset += 500
	}
	depot := e.spawn("supply", 1, rotate(0, offset), true, 0)
	depot.IncludedHauler = true
	ids := []ID{}
	for i := 0; i < count; i++ {
		v := e.spawn("US.hauler", 1, rotate(-3500-int32(i%2)*1800, -2500-int32(i/2)*1800), true, 900000)
		ids = append(ids, v.ID)
		if !e.clear(v.Position, e.radius(v), v.ID, false, true) {
			t.Fatalf("invalid fixture spawn%d: %+v", v.ID, v.Position)
		}
	}
	e.recalculate()
	e.updateFog()
	return e, ids
}

func TestHarvestQueueOrientationAndCloseDepot(t *testing.T) {
	for _, separation := range []int{3000, 5000} {
		incomes := []int64{}
		for rotation, name := range []string{"south", "west", "north", "east"} {
			t.Run(name+map[int]string{3000: "/close", 5000: "/normal"}[separation], func(t *testing.T) {
				e, ids := harvestRoutingFixture(t, rotation, separation, 2)
				issue(t, e, 1, Order{Kind: "gather", Entities: ids, Target: 1})
				ticks(e, 12000)
				income := e.player(1).Income
				incomes = append(incomes, income)
				t.Logf("income=%d queue=%v loader=%d", income, e.state.Fields[0].Queue, e.state.Fields[0].Loader)
				for _, id := range ids {
					v := e.entity(id)
					t.Logf("hauler%d pos%+v state%s cargo%d depot%d path%v", id, v.Position, v.State, v.Cargo, v.Depot, v.Path)
				}
				if income < 18000000 {
					t.Fatalf("route stalled or excessive delivery delay: %d", income)
				}
			})
		}
		if len(incomes) == 0 {
			continue
		}
		low, high := incomes[0], incomes[0]
		for _, value := range incomes {
			low = min(low, value)
			high = max(high, value)
		}
		if (high-low)*100 > high*5 {
			t.Errorf("directional bias exceeds5%% at separation%d: %v", separation, incomes)
		}
	}
}

func TestHarvestQueueEightHaulersPreservesSaveAndReplay(t *testing.T) {
	for rotation, name := range []string{"south", "west", "north", "east"} {
		t.Run(name, func(t *testing.T) {
			e, ids := harvestRoutingFixture(t, rotation, 5000, 8)
			deliveries := map[ID]int{}
			lastWindow := map[ID]int{}
			record := func() {
				for _, event := range e.state.Events {
					if event.Tick == e.Tick() && event.Kind == "cargo_delivered" {
						deliveries[event.Entity]++
						if e.Tick() > 6000 {
							lastWindow[event.Entity]++
						}
					}
				}
			}
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			issue(t, e, 1, Order{Kind: "gather", Entities: ids, Target: 1})
			for range 5999 {
				e.Advance()
				record()
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			before := e.player(1).Income
			for range 6000 {
				e.Advance()
				record()
				restored.Advance()
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("queue routing changed after mid-load restoration")
			}
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("queue routing replay drift", err)
			}
			income := e.player(1).Income
			t.Logf("income=%d midpoint=%d queue%v loader%d", income, before, e.state.Fields[0].Queue, e.state.Fields[0].Loader)
			for _, id := range ids {
				v := e.entity(id)
				t.Logf("hauler%d pos%+v state%s cargo%d depot%d path%v", id, v.Position, v.State, v.Cargo, v.Depot, v.Path)
			}
			// A non-starvation floor of 70% of the single loader's 40 credits/s,
			// including routes and unloading. This is not a faction balance gate.
			if income < 16800000 || income-before < 8400000 {
				t.Fatalf("crowded queue starved: %d -> %d", before, income)
			}
			for _, id := range ids {
				v := e.entity(id)
				if v == nil || v.HP <= 0 || len(v.Orders) == 0 {
					t.Fatalf("hauler %d lost its job", id)
				}
				if deliveries[id] < 2 || lastWindow[id] < 1 {
					t.Fatalf("hauler %d starved despite aggregate income: total%d last300s%d", id, deliveries[id], lastWindow[id])
				}
			}
		})
	}
}
