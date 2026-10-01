package sim

import (
	"fmt"
	"testing"
)

func TestTransportUnloadsAtUnsnappedLegalClick(t *testing.T) {
	for _, kind := range []string{"US.apc", "SY.apc"} {
		for _, goal := range []Vec{{X: 49999, Y: 42499}, {X: 49499, Y: 42999}, {X: 49999, Y: 42999}} {
			t.Run(fmt.Sprintf("%s/%d-%d", kind, goal.X, goal.Y), func(t *testing.T) {
				setup := transportAcceptanceFixture(t, kind)
				e := setup.engine
				boardTransport(t, setup)
				issue(t, e, 1, Order{Kind: "unload", Entities: []ID{setup.carrier}, Position: goal})
				ticks(e, 150)
				save, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, save)
				if err != nil {
					t.Fatal(err)
				}
				for i := 0; i < 800 && len(e.entity(setup.carrier).Passengers) > 0; i++ {
					e.Advance()
					restored.Advance()
				}
				carrier := e.entity(setup.carrier)
				if len(carrier.Passengers) != 0 {
					t.Fatalf("unload stuck at %+v for click %+v: %s path%+v", carrier.Position, goal, carrier.State, carrier.Path)
				}
				if distance(carrier.Position, goal) > 400 {
					t.Fatal("unloaded outside original arrival tolerance")
				}
				for _, id := range setup.passengers {
					if e.entity(id).Container != 0 {
						t.Fatal("passenger stayed embarked")
					}
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("mid-route restoration changed unloading")
				}
			})
		}
	}
}

func TestUnloadTailCannotAcceptBlockedClick(t *testing.T) {
	setup := transportAcceptanceFixture(t, "US.apc")
	e := setup.engine
	boardTransport(t, setup)
	wall := e.spawn("hq", 2, Vec{X: 40000, Y: 40000}, true, 0)
	e.state.NavigationRevision++
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{setup.carrier}, Position: wall.Position})
	ticks(e, 600)
	if len(e.entity(setup.carrier).Passengers) != len(setup.passengers) {
		t.Fatal("blocked target silently became unload-here")
	}
}
