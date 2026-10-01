package sim_test

import (
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

// Prepared successors for ten gaps in the accepted optional evidence matrix.
// These routes use only ordinary paid orders, current player views and authored
// map regions. The shared finish gate verifies the actual at-end optional award,
// main victory, accepted receipts, save/restore, replay and restart before writing
// a new evidence suffix. Existing accepted commanders and records are unchanged.
func TestAuthoredOptionalReliabilityRelayScout(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional original-scout preservation successors")
	}
	for _, difficulty := range []string{"easy", "normal", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "us-03-relay-ridge", difficulty, "")
			r.evidenceSuffix = "-optional-reliability-scout-preserved"
			r.requiredOptional = "scout-preserved"
			scout := r.ids("starting-recon")
			r.excludedArmy = map[sim.ID]bool{}
			for _, id := range scout {
				r.excludedArmy[id] = true
			}
			r.issue(1, sim.Order{Kind: "move", Entities: scout, Position: sim.Vec{X: 18500, Y: 122500}}, sim.Order{Kind: "hold", Entities: scout, Queued: true})
			playCampaignCapture(r)
		})
	}
}

func TestAuthoredOptionalReliabilityBasinStations(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional two-station basin successors")
	}
	for _, difficulty := range []string{"easy", "normal", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "ir-03-beyond-the-basin", difficulty, "")
			r.evidenceSuffix = "-optional-reliability-two-stations"
			r.requiredOptional = "two-stations"
			workers := r.ids("starting-engineers")
			r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 50500, Y: 81500}}, sim.Order{Kind: "move", Entities: workers[:1], Position: sim.Vec{X: 47500, Y: 87500}})
			r.captureOptionalStation(workers[0], sim.Vec{X: 49500, Y: 85500})
			r.checkpoint()
			// Vacate the first required region before entering the second. The
			// authored main victory must wait until both optional channels finish.
			first := reliabilityPublicRegion(r, "site1")
			var leave []sim.ID
			for _, actor := range r.view().Entities {
				if actor.Owner == 1 && reliabilityInPublicRegion(actor.Position, first) {
					leave = append(leave, actor.ID)
				}
			}
			r.issue(1, sim.Order{Kind: "move", Entities: leave, Position: sim.Vec{X: 65500, Y: 84500}})
			r.wait("first required region vacated before second station", 2000, func() bool {
				for _, actor := range r.view().Entities {
					if actor.Owner == 1 && reliabilityInPublicRegion(actor.Position, first) {
						return false
					}
				}
				return true
			})
			// A diagonal crossing by the second engineer could prematurely
			// satisfy the first region while the main force reaches the second.
			r.issue(1, sim.Order{Kind: "move", Entities: workers[1:2], Position: sim.Vec{X: 65500, Y: 100500}})
			r.wait("second engineer bypasses first-region crossing", 2400, func() bool { actor, ok := r.seen(workers[1]); return ok && actor.Position.X > 60000 })
			r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 85500, Y: 66500}}, sim.Order{Kind: "move", Entities: workers[1:2], Position: sim.Vec{X: 87500, Y: 74500}})
			r.captureOptionalStation(workers[1], sim.Vec{X: 88500, Y: 62500})
			r.issue(1, sim.Order{Kind: "move", Entities: workers[:1], Position: sim.Vec{X: 47500, Y: 87500}})
			r.wait("both stations owned when both required fields are secured", 10000, func() bool { return r.engine.Outcome().Finished })
			r.finish()
		})
	}
}

func reliabilityPublicRegion(r *authoredRun, id string) content.Region {
	r.t.Helper()
	for _, region := range r.gameMap.Regions {
		if region.ID == id {
			return region
		}
	}
	r.t.Fatalf("missing public authored region %s", id)
	return content.Region{}
}

func reliabilityInPublicRegion(point sim.Vec, region content.Region) bool {
	return point.X >= region.Min.X && point.X <= region.Max.X && point.Y >= region.Min.Y && point.Y <= region.Max.Y
}

func TestAuthoredOptionalReliabilityNetworkPreservation(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional service-capacity preservation successors")
	}
	for _, difficulty := range []string{"easy", "normal"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "ir-04-hold-the-network", difficulty, "")
			r.evidenceSuffix = "-optional-reliability-no-emergency-loss"
			r.requiredOptional = "no-emergency-loss"
			playReliabilityOptionalDefense(r)
		})
	}
}

func TestAuthoredOptionalReliabilityCleanInterception(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional marked-wave clean interception successor")
	}
	t.Run("normal", func(t *testing.T) {
		r := newAuthoredRun(t, "sa-04-intercept-window", "normal", "")
		r.evidenceSuffix = "-optional-reliability-clean-interception"
		r.requiredOptional = "clean-interception"
		playReliabilityOptionalDefense(r)
	})
}

func TestAuthoredOptionalReliabilityConnectedRoutes(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional connected-supply-route successor")
	}
	t.Run("easy", func(t *testing.T) {
		r := newAuthoredRun(t, "sa-06-shieldline", "easy", "")
		r.evidenceSuffix = "-optional-reliability-connected-routes"
		r.requiredOptional = "connected-routes"
		// Easy's main route already stations owned engineers in both public
		// corridors, but omitted the optional second supply-center purchase.
		r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1})
		r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 33500, Y: 108500})
		playCampaignAssault(r)
	})
}

func playReliabilityOptionalDefense(r *authoredRun) {
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".aa"})
	if r.faction == "IR" {
		for _, tag := range []string{"survey-one", "network-strike"} {
			r.issue(1, sim.Order{Kind: "return", Entities: r.ids(tag)})
		}
	}
	excluded := map[sim.ID]bool{}
	repair := func() {
		workers := r.ownedType(r.faction + ".engineer")
		tags := []string{"network-two", "home-service"}
		if r.faction == "SA" {
			tags = []string{"fixed-battery", "outpost-east"}
			var batteryScreen []sim.ID
			for _, kind := range []string{"SA.at", "SA.tank"} {
				ids := r.ownedType(kind)
				batteryScreen = append(batteryScreen, ids[:min(2, len(ids))]...)
			}
			if len(batteryScreen) > 0 && r.engine.Tick() >= 9000 {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: batteryScreen, Position: sim.Vec{X: 71500, Y: 60500}})
			}
		}
		for i, tag := range tags {
			if i < len(workers) && r.hasTag(tag) {
				r.tryIssue(sim.Order{Kind: "repair", Entities: workers[i : i+1], Target: r.tags[tag][0]})
			}
		}
	}
	r.tactical = r.assaultPolicy(excluded, repair, 0)
	if r.faction == "IR" {
		// Apply the successful hard-route defense of the original service sites
		// to easy/normal too; all returned drones keep their actual owned homes.
		r.tactical = r.withSiteDefense(r.tactical, excluded, []string{"network-two", "home-service"})
	}
	if r.faction == "SA" {
		mobile := r.ids("mobile-aegis")
		point := sim.Vec{X: 80500, Y: 69500}
		r.issue(1, sim.Order{Kind: "move", Entities: mobile, Position: point})
		r.wait("mobile interceptor reaches the eastern defense", 1800, func() bool {
			actor, ok := r.seen(mobile[0])
			if !ok {
				return false
			}
			dx, dy := int64(actor.Position.X-point.X), int64(actor.Position.Y-point.Y)
			return dx*dx+dy*dy < 1200*1200
		})
		r.issue(1, sim.Order{Kind: "deploy", Entities: mobile})
		r.wait("charged owned interceptor actually covers the marked outpost", 1000, func() bool {
			actor, ok := r.seen(mobile[0])
			target, exists := r.seen(r.tags["outpost-east"][0])
			if !ok || !exists || actor.Private == nil || actor.Private.Ranges == nil || actor.Private.Ranges.Interception == nil {
				return false
			}
			defense := actor.Private.Ranges.Interception
			dx, dy := int64(actor.Position.X-target.Position.X), int64(actor.Position.Y-target.Position.Y)
			return defense.Active && defense.Ready && dx*dx+dy*dy <= int64(defense.Radius)*int64(defense.Radius)
		})
	}
	halfway := sim.Tick(7300)
	if r.faction == "SA" {
		halfway = 6100
	}
	r.wait("optional preservation defense midpoint", halfway+1000, func() bool { return r.engine.Tick() >= halfway })
	r.checkpoint()
	r.wait("ordinary operational defense earns the actual optional award", 22000, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}
