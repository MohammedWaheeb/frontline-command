package sim

import "testing"

// The legacy placement scan probes only eight spokes at five radii around
// one center. On a dense base every spoke can be occupied while legal
// ground remains between spokes or around another build-range structure;
// the planner must fall back deterministically instead of dropping the
// building for the whole cycle.
func aiSpokePositions(center Vec) []Vec {
	positions := []Vec{}
	for r := int32(4000); r <= 13000; r += 2000 {
		for _, d := range neighbors {
			positions = append(positions, Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500})
		}
	}
	return positions
}

func TestAIConstructionPositionFallsBackBeyondSpokes(t *testing.T) {
	e := fixture(t)
	center := Vec{X: 30000, Y: 30000}
	e.spawn("hq", 1, center, true, 0)
	for _, pos := range aiSpokePositions(center) {
		e.spawn("power", 1, pos, true, 0)
	}
	e.recalculate()
	e.updateFog()
	p := e.player(1)
	b, _ := e.buildingRule("radar")
	known := e.aiPlacementKnowledge(p)
	for _, pos := range aiSpokePositions(center) {
		if e.aiInBuildRadius(p, "radar", pos) && known.validPlacement(p.ID, pos, b.Width, b.Height) == "ok" {
			t.Fatal("fixture must block every legacy spoke position", pos)
		}
	}
	pos, ok := e.aiConstructionPosition(p, "radar", center)
	if !ok {
		t.Fatal("placement dropped the building on a dense base with legal ground between spokes")
	}
	if !e.aiInBuildRadius(p, "radar", pos) || e.validPlacement(1, pos, b.Width, b.Height) != "ok" {
		t.Fatal("fallback returned an illegal placement", pos, e.validPlacement(1, pos, b.Width, b.Height))
	}
	again, ok := e.aiConstructionPosition(p, "radar", center)
	if !ok || again != pos {
		t.Fatal("fallback placement is not deterministic", pos, again)
	}
}

func TestAIConstructionPositionFallsBackToAlternateCenter(t *testing.T) {
	e := fixture(t)
	center := Vec{X: 24000, Y: 24000}
	e.spawn("hq", 1, center, true, 0)
	// Pave the primary build area so no spiral point around it is legal.
	for y := center.Y - 14000; y <= center.Y+14000; y += 2000 {
		for x := center.X - 14000; x <= center.X+14000; x += 2000 {
			if x == center.X && y == center.Y {
				continue
			}
			e.spawn("power", 1, Vec{X: x, Y: y}, true, 0)
		}
	}
	alternate := Vec{X: 54000, Y: 24000}
	e.spawn("outpost", 1, alternate, true, 0)
	e.recalculate()
	e.updateFog()
	p := e.player(1)
	b, _ := e.buildingRule("radar")
	pos, ok := e.aiConstructionPosition(p, "radar", center)
	if !ok {
		t.Fatal("placement never tried the alternate build-range center")
	}
	// The starting HQ is itself a legal alternate center and precedes the
	// new outpost in entity order; either proves the fallback, as long as
	// the placement is legal and outside the paved primary base.
	if distance(pos, center) <= 16000 || !e.aiInBuildRadius(p, "radar", pos) || e.validPlacement(1, pos, b.Width, b.Height) != "ok" {
		t.Fatal("fallback did not build legally around an alternate center", pos, alternate)
	}
}
