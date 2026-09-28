package sim_test

import (
	"frontlinecommand/pkg/sim"
	"math"
	"testing"
)

// Test-commander geometry only. All final movement, target and placement legality
// remains the engine's real PreviewOrders/Submit responsibility.
func authoredCaptureGuardPoint(site, threat sim.Vec) sim.Vec {
	dx, dy := int64(threat.X-site.X), int64(threat.Y-site.Y)
	span := int64(math.Ceil(math.Hypot(float64(dx), float64(dy))))
	if span == 0 {
		return site
	}
	offset := min(int64(3000), span/2)
	return sim.Vec{X: site.X + int32(dx*offset/span), Y: site.Y + int32(dy*offset/span)}
}

func TestAuthoredCaptureGuardScreen(t *testing.T) {
	for _, tt := range []struct{ site, threat sim.Vec }{
		{sim.Vec{X: 50500, Y: 89500}, sim.Vec{X: 59092, Y: 86999}},
		{sim.Vec{X: 85500, Y: 65500}, sim.Vec{X: 92189, Y: 59811}},
		{sim.Vec{X: 85500, Y: 65500}, sim.Vec{X: 90312, Y: 57966}},
		{sim.Vec{X: 85500, Y: 65500}, sim.Vec{X: 86263, Y: 57236}},
	} {
		point := authoredCaptureGuardPoint(tt.site, tt.threat)
		fromSite := math.Hypot(float64(point.X-tt.site.X), float64(point.Y-tt.site.Y))
		toThreat := math.Hypot(float64(point.X-tt.threat.X), float64(point.Y-tt.threat.Y))
		if fromSite > 3000 || toThreat > 6000 {
			t.Fatalf("screen %v siteDistance%f threatDistance%f", point, fromSite, toThreat)
		}
	}
	for _, site := range []sim.Vec{{}, {X: 120000, Y: 50000}} {
		if p := authoredCaptureGuardPoint(site, site); p != site {
			t.Fatalf("same point: %v", p)
		}
		threat := sim.Vec{X: site.X - 2000, Y: site.Y}
		if p := authoredCaptureGuardPoint(site, threat); p != (sim.Vec{X: site.X - 1000, Y: site.Y}) {
			t.Fatalf("short leg: %v", p)
		}
	}
}
