package sim

import (
	"fmt"
	"testing"
)

// These synthetic traffic layouts deliberately intersect. The actors receive
// public movement orders; no route, position or collision state is edited after
// the initial replay snapshot. The public-order campaign sortie is covered in
// air_return_validation_test.go.
func TestAirTrafficCrossingsFinishWithoutOverlap(t *testing.T) {
	for _, count := range []int{2, 4} {
		for _, typ := range []string{"US.gunship", "US.fighter", "IR.isr"} {
			t.Run(fmt.Sprintf("%d-%s", count, typ), func(t *testing.T) {
				e := fixture(t)
				e.player(1).Faction = typ[:2]
				homeType := "US.airfield"
				if typ[:2] == "IR" {
					homeType = "IR.drone_hub"
				}
				home := e.spawn(homeType, 1, Vec{X: 12000, Y: 24000}, true, 0)
				starts := []Vec{{X: 24000, Y: 32000}, {X: 40000, Y: 32000}, {X: 32000, Y: 24000}, {X: 32000, Y: 40000}}
				ends := []Vec{starts[1], starts[0], starts[3], starts[2]}
				actors := make([]*Entity, count)
				orders := make([]Order, count)
				for i := range count {
					actor := e.spawn(typ, 1, starts[i], true, 0)
					actor.Home, actor.Landed, actor.Endurance = home.ID, false, 2400
					actor.Facing = direction(ends[i].X-starts[i].X, ends[i].Y-starts[i].Y)
					actors[i] = actor
					orders[i] = Order{Kind: "move", Entities: []ID{actor.ID}, Position: ends[i]}
				}
				e.recalculate()
				e.updateFog()
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				if err = e.Submit(1, 1, orders); err != nil {
					t.Fatal(err)
				}
				var restored *Engine
				arrived := false
				for range 1800 {
					e.Advance()
					if restored != nil {
						restored.Advance()
					}
					if e.Tick() == 1 {
						for _, result := range e.state.Results {
							if !result.Accepted {
								t.Fatal(result)
							}
						}
					}
					arrived = true
					for i, a := range actors {
						if a.HP <= 0 || a.Landed || a.Home != home.ID {
							t.Fatal("traffic must remain airborne and alive", a.ID, a.State)
						}
						arrived = arrived && len(a.Orders) == 0 && distance(a.Position, ends[i]) <= 1000
						for _, b := range actors[i+1:] {
							radius := int64(e.radius(a) + e.radius(b))
							if dist2(a.Position, b.Position) < radius*radius {
								t.Fatalf("aircraft overlap at tick%d: %d/%d", e.Tick(), a.ID, b.ID)
							}
						}
						if restored == nil && (a.State == "avoiding" || e.fixedWing(a) && e.Tick() == 40) {
							saved, err := e.Save()
							if err != nil {
								t.Fatal(err)
							}
							restored, err = Restore(e.catalog, saved)
							if err != nil {
								t.Fatal("cannot restore ongoing crossing", err)
							}
						}
					}
					if arrived {
						break
					}
				}
				if !arrived || restored == nil {
					for _, actor := range actors {
						t.Logf("actor%d pos%+v state%s orders%+v path%+v", actor.ID, actor.Position, actor.State, actor.Orders, actor.Path)
					}
					t.Fatalf("crossing finish=%v, midpoint restored=%v", arrived, restored != nil)
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("mid-detour restore diverged")
				}
				replay.Capture(e, false)
				played, err := replay.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("air traffic replay diverged", err)
				}
				t.Logf("%d aircraft reached destinations in %d ticks with no overlap", count, e.Tick())
			})
		}
	}
}
