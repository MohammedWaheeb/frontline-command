package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// Only owner-disclosed positive supply fields near the publicly briefed first
// crossing are eligible. The engine remains sole placement/harvest authority.
func authoredExpansionField(view sim.View, point sim.Vec) (sim.FieldView, bool) {
	var choice sim.FieldView
	best := int64(20000 * 20000)
	for _, f := range view.Fields {
		if f.Remaining <= 0 {
			continue
		}
		dx, dy := int64(f.Position.X-point.X), int64(f.Position.Y-point.Y)
		d := dx*dx + dy*dy
		if d < best || d == best && choice.ID != 0 && f.ID < choice.ID {
			choice, best = f, d
		}
	}
	return choice, choice.ID != 0
}
func TestAuthoredExpansionLogisticsDisclosedFieldsOnly(t *testing.T) {
	p := sim.Vec{X: 50500, Y: 81500}
	if _, ok := authoredExpansionField(sim.View{}, p); ok {
		t.Fatal("fabricated undisclosed field")
	}
	v := sim.View{Fields: []sim.FieldView{{ID: 1, Position: sim.Vec{X: 50500, Y: 81500}, Remaining: 0}, {ID: 2, Position: sim.Vec{X: 47500, Y: 78500}, Remaining: 22000000}, {ID: 3, Position: sim.Vec{X: 21500, Y: 91500}, Remaining: 9000000}}}
	if f, ok := authoredExpansionField(v, p); !ok || f.ID != 2 {
		t.Fatal("did not select disclosed usable nearby field", f, ok)
	}
	v.Fields[1].Remaining = 0
	if _, ok := authoredExpansionField(v, p); ok {
		t.Fatal("selected depleted or outside-neighborhood field")
	}
}
