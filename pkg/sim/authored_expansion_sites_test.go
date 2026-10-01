package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// Twenty-five player-side intended sites around a public objective. These are
// still filtered by the current owner view and ordinary Go order validation.
func authoredExpansionSites(center sim.Vec) []sim.Vec {
	offsets := []sim.Vec{{X: 0, Y: 0}, {X: -2000, Y: 0}, {X: 2000, Y: 0}, {X: 0, Y: 2000}, {X: 0, Y: -2000},
		{X: -2000, Y: -2000}, {X: 2000, Y: -2000}, {X: 2000, Y: 2000}, {X: -2000, Y: 2000}}
	for _, radius := range []int32{4000, 6000} {
		for _, direction := range []sim.Vec{{X: 1, Y: 0}, {X: 0, Y: 1}, {X: -1, Y: 0}, {X: 0, Y: -1}, {X: 1, Y: 1}, {X: -1, Y: 1}, {X: -1, Y: -1}, {X: 1, Y: -1}} {
			offsets = append(offsets, sim.Vec{X: direction.X * radius, Y: direction.Y * radius})
		}
	}
	for i := range offsets {
		offsets[i].X += center.X
		offsets[i].Y += center.Y
	}
	return offsets
}

func TestAuthoredExpansionSitesBoundedAlternatives(t *testing.T) {
	center := sim.Vec{X: 49500, Y: 80500}
	points := authoredExpansionSites(center)
	if len(points) != 25 {
		t.Fatal("unbounded or incomplete intended-site search", len(points))
	}
	seen := map[sim.Vec]bool{}
	avoidsObservedField := false
	for _, p := range points {
		if seen[p] {
			t.Fatal("duplicate intended site", p)
		}
		seen[p] = true
		if p.X < center.X-6000 || p.X > center.X+6000 || p.Y < center.Y-6000 || p.Y > center.Y+6000 {
			t.Fatal("intended site exceeds bounded objective neighborhood", p)
		}
		// The actual failed owner view disclosed field 2 at (47500,78500).
		// The driver's conservative field prefilter excludes a 5000 square
		// for this 2x2 turret. At least one alternative must clear that known
		// constraint; this does not assert authoritative placement legality.
		if p.X >= 52500 || p.X <= 42500 || p.Y >= 83500 || p.Y <= 73500 {
			avoidsObservedField = true
		}
	}
	if !avoidsObservedField {
		t.Fatal("all alternatives repeat the observed resource exclusion")
	}
	old := []sim.Vec{{X: 49500, Y: 80500}, {X: 47500, Y: 80500}, {X: 51500, Y: 80500}, {X: 49500, Y: 82500}, {X: 49500, Y: 78500}}
	for i, p := range old {
		if points[i] != p {
			t.Fatal("existing legal-first order changed", i, points[i], p)
		}
	}
}
