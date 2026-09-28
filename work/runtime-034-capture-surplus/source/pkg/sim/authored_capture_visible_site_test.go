package sim_test

import (
	"frontlinecommand/pkg/sim"
	"os"
	"testing"
)

// This player-side construction choice reuses the existing conservative current
// view prefilter. Go preview and actual execution still decide legality/cost.
// Only SY05 Hard's optional route calls it; other capture routes stay unchanged.
func (r *authoredRun) buildVisibleCaptureDefense(kind string, point sim.Vec, reserve func(int64)) {
	building, known := r.catalog.Building(kind)
	if !known {
		r.t.Fatal("unknown planned defense", kind)
	}
	reserve(building.Cost)
	defer reserve(0)
	rig := r.ownedType("SY.rig")
	if len(rig) == 0 {
		r.t.Logf("abandon unstarted %s: necessary builder absent tick%d", kind, r.engine.Tick())
		return
	}
	rig = rig[:1]
	scout := sim.Vec{X: point.X + 4000, Y: point.Y}
	r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: scout})
	r.wait("rig scouts "+kind+" foundation", 2400, func() bool {
		actor, alive := r.seen(rig[0])
		if !alive {
			return true // Stop scouting an optional site after the owned builder is lost.
		}
		dx, dy := int64(actor.Position.X-scout.X), int64(actor.Position.Y-scout.Y)
		return dx*dx+dy*dy < 1500*1500
	})
	if !authoredExpansionRigAvailable(r.view()) {
		r.t.Logf("abandon unstarted %s: builder lost while scouting tick%d", kind, r.engine.Tick())
		return
	}
	var foundation sim.ID
	// Placement and paid construction share the ORIGINAL 3600-tick construction
	// budget. No additional wait is granted for choosing another nearby site.
	r.wait("visible paid "+kind+" construction", 3600, func() bool {
		if foundation != 0 {
			actor, alive := r.seen(foundation)
			return alive && actor.Complete
		}
		if !authoredExpansionRigAvailable(r.view()) {
			r.t.Logf("abandon unstarted %s: builder lost before placement tick%d", kind, r.engine.Tick())
			return true
		}
		for _, candidate := range authoredExpansionSites(point) {
			if !r.visibleFoundationLooksClear(kind, candidate) {
				continue
			}
			if !r.tryIssue(sim.Order{Kind: "build", Entities: rig, Type: kind, Position: candidate}) {
				continue
			}
			for _, actor := range r.view().Entities {
				if actor.Owner == 1 && actor.Type == kind && actor.Position == candidate {
					foundation = actor.ID
					reserve(0) // The real foundation is already paid; do not reserve it again.
					r.t.Logf("visible capture defense %s tick%d site%v actor%d", kind, r.engine.Tick(), candidate, foundation)
					return actor.Complete
				}
			}
			r.t.Fatal("accepted visible construction did not emit its foundation")
		}
		return false
	})
}

func TestAuthoredCaptureVisibleSiteObservedInfantry(t *testing.T) {
	path := os.Getenv("FRONTLINE_CAPTURE_PLACEMENT_FIXTURE")
	if path == "" {
		t.Skip("exact preserved Hard occupied-site owner-state fixture")
	}
	r := newAuthoredRun(t, "sy-05-relay-break", "hard", "")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := sim.Restore(r.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	r.engine = restored
	hash := r.engine.Hash()
	center := sim.Vec{X: 41500, Y: 88500}
	if r.visibleFoundationLooksClear("outpost", center) {
		t.Fatal("known occupied original site accepted by visual prefilter")
	}
	var candidates int
	for _, p := range authoredExpansionSites(center) {
		if !r.visibleFoundationLooksClear("outpost", p) {
			continue
		}
		candidates++
		preview, err := r.engine.PreviewOrders(1, []sim.Order{{Kind: "build", Entities: []sim.ID{29}, Type: "outpost", Position: p}})
		if err != nil || len(preview) != 1 {
			t.Fatal("real preview unavailable", err, preview)
		}
		t.Logf("visible alternative %v authoritative advisory %+v", p, preview[0])
	}
	if candidates == 0 {
		t.Fatal("no current visible nearby alternate site")
	}
	if r.engine.Hash() != hash {
		t.Fatal("view/advice changed source state")
	}
}

// A discretionary unstarted building reserves its actual catalog cost only.
// This is a commander's spending intention, not an authoritative escrow or a
// free queue: every producer admission and eventual paid start remains in Go.
func authoredCaptureConstructionCanSpend(view sim.View, cost int64) bool {
	return cost == 0 || view.Economy.Credits > cost || !authoredExpansionRigAvailable(view)
}
func TestAuthoredCaptureConstructionReserve(t *testing.T) {
	r := newAuthoredRun(t, "sy-05-relay-break", "hard", "")
	building, ok := r.catalog.Building("outpost")
	if !ok {
		t.Fatal("catalog outpost missing")
	}
	view := r.view()
	view.Economy.Credits = building.Cost
	if authoredCaptureConstructionCanSpend(view, building.Cost) {
		t.Fatal("spends reserved unpaid building cost")
	}
	view.Economy.Credits++
	if !authoredCaptureConstructionCanSpend(view, building.Cost) {
		t.Fatal("surplus cannot fund ordinary legal queues")
	}
	view.Economy.Credits = 0
	if !authoredCaptureConstructionCanSpend(view, 0) {
		t.Fatal("paid foundation still hoards credits")
	}
	var withoutRig []sim.EntityView
	for _, actor := range view.Entities {
		if actor.Type != "SY.rig" {
			withoutRig = append(withoutRig, actor)
		}
	}
	view.Entities = withoutRig
	if !authoredCaptureConstructionCanSpend(view, building.Cost) {
		t.Fatal("lost builder still suppresses paid reinforcement")
	}
}
