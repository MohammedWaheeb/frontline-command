package sim_test

import (
	"sort"
	"strings"
	"testing"

	"frontlinecommand/pkg/sim"
)

// buildAt uses a declared, visible base site and ordinary rig construction.
// It never creates actors or bypasses catalog, placement, cost, or power rules.
func (r *authoredRun) buildAt(rig []sim.ID, kind string, point sim.Vec) sim.ID {
	r.t.Helper()
	// Scout the entire foundation with the real rig before requesting it.
	// Placement still runs the normal Go visibility and collision validator.
	scout := sim.Vec{X: point.X + 4000, Y: point.Y}
	if r.definition.ID == "sy-01-workshop-foothold" {
		scout.X = point.X - 4000
		if r.difficulty == "hard" && kind == "supply" {
			scout.X = point.X + 4000
		}
	}
	r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: scout})
	r.wait("rig scouts "+kind+" foundation", 2400, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == rig[0] {
				dx, dy := int64(entity.Position.X-scout.X), int64(entity.Position.Y-scout.Y)
				return dx*dx+dy*dy < 1500*1500
			}
		}
		return false
	})
	before := map[sim.ID]bool{}
	for _, entity := range r.view().Entities {
		before[entity.ID] = true
	}
	r.issue(1, sim.Order{Kind: "build", Entities: rig, Type: kind, Position: point})
	var built sim.ID
	r.wait("paid "+kind+" construction", 3600, func() bool {
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && entity.Type == kind && entity.Complete && !before[entity.ID] {
				built = entity.ID
				return true
			}
		}
		return false
	})
	return built
}
func (r *authoredRun) ownedType(kind string) []sim.ID {
	var ids []sim.ID
	for _, entity := range r.view().Entities {
		if entity.Owner == 1 && entity.Type == kind {
			ids = append(ids, entity.ID)
		}
	}
	return ids
}
func (r *authoredRun) hasTag(tag string) bool {
	for _, entity := range r.view().Entities {
		if entity.Owner != 1 {
			continue
		}
		for _, id := range r.tags[tag] {
			if entity.ID == id {
				return true
			}
		}
	}
	return false
}
func (r *authoredRun) requireOptional(id string) {
	r.t.Helper()
	r.wait("successful mission awards optional "+id, 0, func() bool { return r.complete(id) })
}
func playOpeningSupply(r *authoredRun) {
	switch r.faction {
	case "US":
		r.issue(1, sim.Order{Kind: "attack_move", Entities: r.ids("starting-rifles"), Position: r.region("recovery1")}, sim.Order{Kind: "move", Entities: r.ids("starting-recon"), Position: r.region("recoveryRig")}, sim.Order{Kind: "attack_move", Entities: r.ids("starting-at"), Position: r.region("recovery2")})
		r.wait("original engineering rig and both ranger groups recovered", 1800, func() bool { return r.hasTag("intact-rig") && r.hasTag("ranger-west") && r.hasTag("ranger-east") })
		r.issue(1, sim.Order{Kind: "move", Entities: r.ids("intact-rig"), Position: sim.Vec{X: 17500, Y: 118500}}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 27500, Y: 103500}})
	case "IR":
		r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
	case "SA":
		if r.difficulty == "easy" {
			barracks := r.ids("home-barracks")
			r.issue(1, sim.Order{Kind: "rally", Entities: barracks, Position: r.region("site1")}, sim.Order{Kind: "train", Entities: barracks, Type: "SA.rifle"}, sim.Order{Kind: "train", Entities: barracks, Type: "SA.rifle"}, sim.Order{Kind: "train", Entities: barracks, Type: "SA.at"}, sim.Order{Kind: "train", Entities: barracks, Type: "SA.at"})
		}
		screen := append(append(r.ids("starting-rifles"), r.ids("starting-at")...), r.ids("starting-recon")...)
		r.issue(1, sim.Order{Kind: "attack_move", Entities: screen, Position: sim.Vec{X: 50500, Y: 73500}}, sim.Order{Kind: "move", Entities: r.ids("original-apcs"), Position: sim.Vec{X: 49500, Y: 87500}})
	}
	r.issue(1, sim.Order{Kind: "move", Entities: r.ids("starting-engineers"), Position: sim.Vec{X: 23500, Y: 100500}})
	r.advance(100)
	supply := r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 26500, Y: 96500})
	r.checkpoint()
	haulers := r.ownedType(r.faction + ".hauler")
	if len(haulers) == 0 {
		r.t.Fatal("completed supply center did not create its ordinary included hauler")
	}
	r.issue(1, sim.Order{Kind: "gather", Entities: haulers, Target: 1}, sim.Order{Kind: "train", Entities: []sim.ID{supply}, Type: r.faction + ".hauler"})
	if r.faction == "US" {
		r.wait("both recovered ranger teams and original engineering rig", 2400, func() bool { return r.hasTag("ranger-west") && r.hasTag("ranger-east") && r.hasTag("intact-rig") })
	}
	r.wait("opening campaign supply and field objective", 6000, func() bool { return r.engine.Outcome().Finished })
	optional := map[string]string{"US": "engineering-rescue", "IR": "recon-survives", "SA": "apcs-preserved"}[r.faction]
	r.requireOptional(optional)
	r.finish()
}
func (r *authoredRun) visibleGarrison(point sim.Vec) sim.ID {
	r.t.Helper()
	for _, entity := range r.view().Entities {
		if entity.Type == "map.garrison" && entity.Position == point {
			return entity.ID
		}
	}
	r.t.Fatalf("garrison at %+v not visible", point)
	return 0
}
func playWorkshopFoothold(r *authoredRun) {
	rifles := r.ids("starting-rifles")
	hqPoint, powerPoint, supplyPoint, barracksPoint, factoryPoint := sim.Vec{X: 33500, Y: 105500}, sim.Vec{X: 25500, Y: 108500}, sim.Vec{X: 26500, Y: 96500}, sim.Vec{X: 25500, Y: 115500}, sim.Vec{X: 33500, Y: 115500}
	field := sim.ID(1)
	r.issue(1, sim.Order{Kind: "attack_move", Entities: rifles[:2], Position: r.region("recoveryRig")}, sim.Order{Kind: "attack_move", Entities: append(rifles[2:], r.ids("starting-at")...), Position: r.region("recovery2")}, sim.Order{Kind: "move", Entities: r.ids("starting-recon"), Position: sim.Vec{X: 41500, Y: 72500}}, sim.Order{Kind: "move", Entities: r.ids("starting-engineers"), Position: sim.Vec{X: 39500, Y: 87500}})
	r.wait("recovery of original rig", 2400, func() bool { return r.hasTag("recovered-rig") })
	rig := r.ids("recovered-rig")
	r.issue(1, sim.Order{Kind: "move", Entities: r.ids("mechanics-west"), Position: sim.Vec{X: 25500, Y: 83500}}, sim.Order{Kind: "move", Entities: r.ids("mechanics-west"), Position: sim.Vec{X: 22500, Y: 120500}, Queued: true})
	r.wait("eastern mechanic recovery", 1200, func() bool { return r.hasTag("mechanics-east") })
	r.issue(1, sim.Order{Kind: "move", Entities: r.ids("mechanics-east"), Position: sim.Vec{X: 77500, Y: 113500}}, sim.Order{Kind: "move", Entities: r.ids("mechanics-east"), Position: sim.Vec{X: 26500, Y: 122500}, Queued: true}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 33500, Y: 92500}})
	if r.difficulty == "hard" {
		engineers := r.ids("starting-engineers")
		r.issue(1, sim.Order{Kind: "move", Entities: engineers[:1], Position: sim.Vec{X: 46500, Y: 85500}})
		r.wait("engineer sights western supply station", 900, func() bool { return r.view().Visible[85*r.gameMap.Width+49] })
		var station sim.ID
		for _, entry := range r.view().Stations {
			if entry.Position == (sim.Vec{X: 49500, Y: 85500}) {
				station = entry.ID
			}
		}
		r.issue(1, sim.Order{Kind: "capture", Entities: engineers[:1], Target: station})
	}
	r.checkpoint()
	nextGuard := r.engine.Tick()
	r.tactical = func() {
		if r.engine.Tick() < nextGuard {
			return
		}
		nextGuard = r.engine.Tick() + 100
		center := hqPoint
		target := sim.Vec{X: hqPoint.X, Y: hqPoint.Y - 7000}
		best := int64(25000 * 25000)
		for _, entity := range r.view().Entities {
			if entity.Owner != 2 && entity.Owner != 4 {
				continue
			}
			dx, dy := int64(entity.Position.X-center.X), int64(entity.Position.Y-center.Y)
			if d := dx*dx + dy*dy; d < best {
				best = d
				target = entity.Position
			}
		}
		if army := r.army(); len(army) > 0 {
			r.tryIssue(sim.Order{Kind: "attack_move", Entities: army, Position: target})
		}
	}

	r.buildAt(rig, "hq", hqPoint)
	r.buildAt(rig, "power", powerPoint)

	r.buildAt(rig, "supply", supplyPoint)
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ownedType("SY.hauler"), Target: field})
	barracks, _ := r.catalog.Building("barracks")
	r.wait("income funds real barracks construction", 3600, func() bool { return r.view().Economy.Credits >= barracks.Cost })
	r.buildAt(rig, "barracks", barracksPoint)
	workshop, _ := r.catalog.Building("factory")
	r.wait("income funds the workshop", 6000, func() bool { return r.view().Economy.Credits >= workshop.Cost })
	r.buildAt(rig, "factory", factoryPoint)
	r.wait("genuine recovered workshop economy", 100, func() bool { return r.engine.Outcome().Finished })
	// This completion route does not promise the preservation bonus. Compare
	// the actual original survivors with the debrief instead of awarding it.
	surviving := 0
	for _, entity := range r.view().Entities {
		if entity.Owner != 1 {
			continue
		}
		for _, tag := range []string{"mechanics-west", "mechanics-east"} {
			for _, id := range r.tags[tag] {
				if id == entity.ID {
					surviving++
				}
			}
		}
	}
	if r.complete("mechanic-teams") != (surviving == 4) {
		r.t.Fatal("mechanic preservation debrief does not match original survivors")
	}

	r.finish()
}

func TestAuthoredCampaignOpeningCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored campaign completion matrix; run without -short")
	}
	for _, id := range []string{"us-01-first-foothold", "ir-01-forward-signal", "sy-01-workshop-foothold", "sa-01-arrival-point"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) {
				run := newAuthoredRun(t, id, difficulty, "")
				if strings.HasPrefix(id, "sy-") {
					playWorkshopFoothold(run)
				} else {
					playOpeningSupply(run)
				}
			})
		}
	}
}

// The original observer is an optional preservation goal, not an irreplaceable
// mission key. This scenario uses normal enemy fire and paid replacement.
func TestAuthoredCampaignReplacementObserverCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored replacement-observer playthrough")
	}
	r := newAuthoredRun(t, "ir-01-forward-signal", "normal", "")
	r.evidenceSuffix = "-paid-replacement"
	original := r.ids("starting-recon")[0]
	r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{original}, Position: sim.Vec{X: 106500, Y: 22500}}, sim.Order{Kind: "attack_move", Entities: append(r.ids("starting-rifles"), r.ids("starting-at")...), Position: r.region("site1")}, sim.Order{Kind: "move", Entities: r.ids("starting-engineers"), Position: sim.Vec{X: 23500, Y: 100500}})
	r.advance(100)
	r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 26500, Y: 96500})
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ownedType("IR.hauler"), Target: 1}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.at"})
	r.wait("original observer lost to actual opposing weapons", 4000, func() bool { return !r.hasTag("starting-recon") })
	r.checkpoint()
	r.issue(1, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "IR.recon"})
	var replacement sim.ID
	r.wait("paid replacement observer", 1200, func() bool {
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && entity.Type == "IR.recon" && entity.ID != original {
				replacement = entity.ID
				return true
			}
		}
		return false
	})
	var screen []sim.ID
	for _, id := range r.army() {
		if id != replacement {
			screen = append(screen, id)
		}
	}
	r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{replacement}, Position: sim.Vec{X: 49500, Y: 87500}}, sim.Order{Kind: "attack_move", Entities: screen, Position: sim.Vec{X: 50500, Y: 73500}})
	r.wait("living replacement reaches the observation ridge", 1800, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == replacement {
				return entity.Position.X >= 44000 && entity.Position.X < 57000 && entity.Position.Y >= 76000 && entity.Position.Y < 89000
			}
		}
		return false
	})
	r.advance(400)
	for _, entity := range r.view().Entities {
		if entity.ID == replacement {
			t.Logf("replacement alive after observation interval tick%d: %+v", r.engine.Tick(), entity)
		}
	}
	if len(r.ownedType("IR.recon")) == 0 {
		t.Fatal("replacement observer did not survive its observation interval")
	}
	r.wait("replacement observer completes the ridge operation", 1000, func() bool { return r.engine.Outcome().Finished })
	if r.complete("recon-survives") {
		t.Fatal("lost original observer incorrectly earned preservation objective")
	}
	r.finish()
}

func (r *authoredRun) tagInRegion(tag, name string, count int) bool {
	var low, high sim.Vec
	for _, region := range r.gameMap.Regions {
		if region.ID == name {
			low, high = sim.Vec(region.Min), sim.Vec(region.Max)
		}
	}
	found := 0
	for _, entity := range r.view().Entities {
		if entity.Owner != 1 || entity.Position.X < low.X || entity.Position.X > high.X || entity.Position.Y < low.Y || entity.Position.Y > high.Y {
			continue
		}
		for _, id := range r.tags[tag] {
			if entity.ID == id {
				found++
			}
		}
	}
	return found >= count
}
func playCampaignEscort(r *authoredRun) {
	convoy := map[string]string{"US": "convoy", "IR": "launch-convoy", "SY": "trail-trucks", "SA": "shield-convoy"}[r.faction]
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "rally", Entities: r.ids("home-factory"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: r.faction + ".rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: r.faction + ".rifle"})
	if r.faction == "IR" {
		drones := append(r.ids("survey-one"), r.ids("survey-two")...)
		r.issue(1, sim.Order{Kind: "move", Entities: drones, Position: sim.Vec{X: 40500, Y: 94500}})
		r.advance(150)
		r.issue(1, sim.Order{Kind: "return", Entities: drones})
	}
	for stage, name := range []string{"site1", "site2", "exit"} {
		point := r.region(name)
		var screen []sim.ID
		for _, id := range r.army() {
			marked := false
			for _, truck := range r.tags[convoy] {
				if truck == id {
					marked = true
				}
			}
			if !marked {
				screen = append(screen, id)
			}
		}
		r.issue(1, sim.Order{Kind: "attack_move", Entities: screen, Position: sim.Vec{X: point.X, Y: point.Y - 5000}})
		r.advance(450)
		r.issue(1, sim.Order{Kind: "move", Entities: r.ids(convoy), Position: sim.Vec{X: point.X, Y: point.Y + 2000}})
		count := 1
		if r.faction == "IR" {
			count = 2
		}
		r.wait("escorted convoy reaches "+name, 3600, func() bool { return r.tagInRegion(convoy, name, count) })
		if stage == 0 {
			r.checkpoint()
		}
	}
	r.wait("authored escorted convoy outcome", 100, func() bool { return r.engine.Outcome().Finished })
	if optional := map[string]string{"US": "all-trucks", "SA": "repair-budget", "IR": "recover-drones"}[r.faction]; optional != "" {
		r.requireOptional(optional)
	}
	r.finish()
}
func TestAuthoredCampaignEscortCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored convoy playthroughs")
	}
	for _, id := range []string{"us-02-open-corridor", "ir-02-eyes-above", "sy-02-supply-trail", "sa-02-moving-shield"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCampaignEscort(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}

func playCampaignTerritory(r *authoredRun) {
	if r.faction == "SY" && r.difficulty == "hard" {
		r.issue(1, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}})
	}
	// Split the real starting force while normal queues reinforce each approach.
	rifles, at := r.ids("starting-rifles"), r.ids("starting-at")
	west := append(append([]sim.ID{}, rifles...), at[0])
	east := append(append(r.ids("starting-armor"), at[1]), r.ids("starting-recon")...)
	r.issue(1, sim.Order{Kind: "attack_move", Entities: west, Position: sim.Vec{X: 50500, Y: 81500}}, sim.Order{Kind: "attack_move", Entities: east, Position: sim.Vec{X: 85500, Y: 66500}}, sim.Order{Kind: "rally", Entities: r.ids("home-factory"), Position: r.region("site2")}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".tank"}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: r.faction + ".rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: r.faction + ".rifle"})
	if r.faction != "IR" {
		r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1})
	}
	if r.faction == "SY" || (r.faction == "SA" && r.difficulty == "hard") {
		excluded := map[sim.ID]bool{}
		for _, id := range r.tags["concealed-scout"] {
			excluded[id] = true
		}
		r.tactical = r.assaultPolicy(excluded, func() {
			workers := r.ownedType(r.faction + ".engineer")
			if len(workers) < 2 {
				if barracks := r.ownedType("barracks"); len(barracks) > 0 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".engineer"})
				}
			}
			for i, id := range workers[:min(2, len(workers))] {
				point := sim.Vec{X: 47500, Y: 87500}
				if i == 1 {
					point = sim.Vec{X: 81500, Y: 70500}
				}
				r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point})
			}
		})
	}
	r.advance(500)
	r.checkpoint()
	if r.faction == "SA" {
		r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 33500, Y: 108500})
	}
	r.wait("control both expansion regions", 22000, func() bool { return r.engine.Outcome().Finished })
	if r.faction == "SY" {
		r.requireOptional("scout-mark")
	}
	r.finish()
}
func TestAuthoredCampaignTerritoryCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored territory playthroughs")
	}
	for _, id := range []string{"ir-03-beyond-the-basin", "sa-03-distant-depots", "sy-03-three-crossings"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCampaignTerritory(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}

func (r *authoredRun) seen(id sim.ID) (sim.EntityView, bool) {
	for _, entity := range r.view().Entities {
		if entity.ID == id {
			return entity, true
		}
	}
	return sim.EntityView{}, false
}
func (r *authoredRun) captureRelay(tag string, screen []sim.ID, gunner, engineer sim.ID, usedWorkers map[sim.ID]bool, cohort func() []sim.ID) sim.ID {
	target := r.tags[tag][0]
	var point sim.Vec
	for _, actor := range r.definition.Initial {
		if actor.Tag == tag {
			point = sim.Vec(actor.Position)
		}
	}
	var live []sim.ID
	for _, id := range screen {
		if entity, ok := r.seen(id); ok && entity.Owner == 1 {
			live = append(live, id)
		}
	}
	r.issue(1, sim.Order{Kind: "attack_move", Entities: live, Position: point}, sim.Order{Kind: "move", Entities: []sim.ID{engineer}, Position: sim.Vec{X: point.X - 7000, Y: point.Y + 7000}})
	previousFire := r.tactical
	fireNext := r.engine.Tick()
	if r.faction == "SA" || r.faction == "SY" && r.difficulty == "hard" {
		r.tactical = func() {
			previousFire()
			if r.engine.Tick() >= fireNext {
				fireNext = r.engine.Tick() + 200
				live = cohort()
				if len(live) > 0 {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: live, Position: point})
				}
			}
		}
	}
	r.wait("capture fire-control threshold", 6000, func() bool { entity, ok := r.seen(target); return ok && entity.Health < 400 })
	r.tactical = previousFire
	// Force-fire on already explored empty rear ground gives an explicit target
	// away from the fragile relay, including for vehicles that fire while moving.
	empty := sim.Vec{X: point.X - 14000, Y: point.Y + 14000}
	var stop []sim.Order
	for _, id := range live {
		if _, ok := r.seen(id); ok {
			order := sim.Order{Kind: "force_fire", Entities: []sim.ID{id}, Position: empty}
			if p, _ := r.engine.PreviewOrders(1, []sim.Order{order}); len(p) == 1 && p[0].Accepted {
				stop = append(stop, order)
			} else {
				infantryPoint := sim.Vec{X: point.X + 11000, Y: point.Y - 10000}
				if r.faction == "SY" && r.difficulty == "normal" || r.faction == "SA" && r.difficulty == "easy" {
					infantryPoint = empty
				}
				stop = append(stop, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: infantryPoint})
			}
		}
	}
	r.issue(1, stop...)
	r.advance(60)
	if entity, ok := r.seen(target); ok && entity.Health >= 240 {
		next := r.engine.Tick()
		previous := r.tactical
		r.tactical = func() {
			if previous != nil {
				previous()
			}
			if r.engine.Tick() < next {
				return
			}
			next = r.engine.Tick() + 100
			if _, ok := r.seen(gunner); !ok {
				closest := int64(1 << 62)
				for _, e := range r.view().Entities {
					if e.Owner == 1 && e.Type == r.faction+".tank" {
						dx, dy := int64(e.Position.X-point.X), int64(e.Position.Y-point.Y)
						if d := dx*dx + dy*dy; d < closest {
							closest, gunner = d, e.ID
						}
					}
				}
			}
			r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{gunner}, Target: target})
		}
		r.wait("ordinary quarter-health capture threshold", 2400, func() bool { entity, ok := r.seen(target); return ok && entity.Health < 240 })
		r.tactical = previous
		r.tryIssue(sim.Order{Kind: "force_fire", Entities: []sim.ID{gunner}, Position: empty})
	}
	freeWorker := func() bool {
		if _, ok := r.seen(engineer); ok && !usedWorkers[engineer] {
			return true
		}
		for _, id := range r.ownedType(r.faction + ".engineer") {
			if !usedWorkers[id] {
				engineer = id
				return true
			}
		}
		return false
	}
	queueWorker := func() {
		// Completed engineers assigned to repair earlier relays are not
		// replacement capture workers. Count queued jobs separately.
		if r.scheduledType(r.faction+".engineer") > len(r.ownedType(r.faction+".engineer")) {
			return
		}
		if b := r.ownedType("barracks"); len(b) > 0 {
			r.tryIssue(sim.Order{Kind: "train", Entities: b[:1], Type: r.faction + ".engineer"})
		}
	}
	if !freeWorker() {
		queueWorker()
		r.wait("paid replacement capture engineer", 2400, freeWorker)
	}
	previousCapture := r.tactical
	nextCapture := r.engine.Tick()
	r.tactical = func() {
		if previousCapture != nil {
			previousCapture()
		}
		if r.engine.Tick() < nextCapture {
			return
		}
		nextCapture = r.engine.Tick() + 100
		if !freeWorker() {
			queueWorker()
			return
		}
		worker, _ := r.seen(engineer)
		// Capture legality includes current vision. A lost scout can clear the
		// old order, so approach through normal movement and retry visibly.
		if worker.State == "capture" || worker.Private != nil && len(worker.Private.Orders) > 0 && worker.Private.Orders[0].Kind == "capture" {
			return
		}
		if !r.tryIssue(sim.Order{Kind: "capture", Entities: []sim.ID{engineer}, Target: target}) {
			r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{engineer}, Position: sim.Vec{X: point.X - 3500, Y: point.Y + 3500}})
		}
	}
	r.wait("ordinary engineer captures "+tag, 6000, func() bool { entity, ok := r.seen(target); return ok && entity.Owner == 1 })
	r.tactical = previousCapture
	if r.engine.Outcome().Finished {
		return engineer
	}
	live = nil
	for _, id := range screen {
		if entity, ok := r.seen(id); ok && entity.Owner == 1 {
			live = append(live, id)
		}
	}
	if len(live) > 0 {
		r.issue(1, sim.Order{Kind: "attack_move", Entities: live, Position: sim.Vec{X: point.X, Y: point.Y - 5000}})
	}
	return engineer
}

func playCampaignCapture(r *authoredRun) {
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "rally", Entities: r.ids("home-factory"), Position: sim.Vec{X: 35500, Y: 94500}}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: sim.Vec{X: 35500, Y: 94500}})
	if r.faction == "SY" && r.difficulty == "hard" {
		r.issue(1, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "SY.hauler"}, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "SY.hauler"})
	}
	next := r.engine.Tick()
	rally := sim.Vec{X: 35500, Y: 94500}
	guards := map[sim.ID][]sim.ID{}
	repairers := map[sim.ID]sim.ID{}
	guardNext := r.engine.Tick()
	r.tactical = func() {
		if r.engine.Tick() >= guardNext {
			guardNext = r.engine.Tick() + 100
			targets := make([]sim.ID, 0, len(guards))
			for id := range guards {
				targets = append(targets, id)
			}
			sort.Slice(targets, func(i, j int) bool { return targets[i] < targets[j] })
			for _, siteID := range targets {
				site, ok := r.seen(siteID)
				if !ok || site.Owner != 1 {
					continue
				}
				if worker, alive := r.seen(repairers[siteID]); alive && site.Health < 990 {
					repairing := worker.Private != nil && len(worker.Private.Orders) > 0 && worker.Private.Orders[0].Kind == "repair"
					if !repairing {
						r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{worker.ID}, Target: siteID})
					}
				}
				point := sim.Vec{X: site.Position.X - 1000, Y: site.Position.Y + 2500}
				var enemyID sim.ID
				closest := int64(14000 * 14000)
				for _, enemy := range r.view().Entities {
					if enemy.Owner != 2 && enemy.Owner != 4 {
						continue
					}
					u, ok := r.catalog.Unit(enemy.Type)
					if !ok || u.Weapon == "" || u.Armor == "air" {
						continue
					}
					dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
					if d := dx*dx + dy*dy; d < closest {
						closest, enemyID, point = d, enemy.ID, enemy.Position
					}
				}
				var live, attackers []sim.ID
				for _, id := range guards[siteID] {
					e, ok := r.seen(id)
					if !ok || e.Owner != 1 {
						continue
					}
					live = append(live, id)
					if enemyID != 0 {
						preview, _ := r.engine.PreviewOrders(1, []sim.Order{{Kind: "attack", Entities: []sim.ID{id}, Target: enemyID}})
						if len(preview) == 1 && preview[0].Accepted {
							attackers = append(attackers, id)
						}
					}
				}
				if len(live) > 0 {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: live, Position: point})
				}
				if len(attackers) > 0 {
					r.tryIssue(sim.Order{Kind: "attack", Entities: attackers, Target: enemyID})
				}
			}
		}

		if r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 600
		if factory := r.ownedType("factory"); len(factory) > 0 {
			r.tryIssue(sim.Order{Kind: "rally", Entities: factory[:1], Position: rally})
			if r.scheduledType(r.faction+".aa") < 3 {
				r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".aa"})
			}
			for range 2 {
				r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".tank"})
			}
		}
		if aa := r.ownedType(r.faction + ".aa"); len(aa) > 0 {
			if r.hasTag("relay-1") && len(aa) > 1 {
				r.tryIssue(sim.Order{Kind: "move", Entities: aa[:1], Position: sim.Vec{X: 50500, Y: 81500}})
				aa = aa[1:]
			}
			aaPoint := rally
			if aaPoint.X == 71500 {
				aaPoint = sim.Vec{X: 82500, Y: 68500}
			}
			r.tryIssue(sim.Order{Kind: "move", Entities: aa, Position: aaPoint})
		}
		if barracks := r.ownedType("barracks"); len(barracks) > 0 {
			r.tryIssue(sim.Order{Kind: "rally", Entities: barracks[:1], Position: rally})
			if r.scheduledType(r.faction+".engineer") < 4 {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".engineer"})
			}
			for range 3 {
				if r.scheduledType(r.faction+".rifle") < 16 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".rifle"})
				}
			}
		}
	}
	r.tactical()
	reserve := map[sim.ID]bool{}
	cohort := func() []sim.ID {
		var ids []sim.ID
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && !reserve[entity.ID] && (entity.Type == r.faction+".rifle" || entity.Type == r.faction+".at" || entity.Type == r.faction+".tank") {
				ids = append(ids, entity.ID)
			}
		}
		return ids
	}
	clearGuards := func(tag string) {
		var point sim.Vec
		for _, actor := range r.definition.Initial {
			if actor.Tag == tag {
				point = sim.Vec(actor.Position)
			}
		}
		approach := "attack_move"
		if r.faction == "SY" || r.faction == "SA" || r.difficulty == "easy" {
			approach = "move"
		}
		r.issue(1, sim.Order{Kind: approach, Entities: cohort(), Position: point})
		previousApproach := r.tactical
		if r.faction == "SY" && r.difficulty == "hard" && tag == "relay-guard-3" {
			nextApproach := r.engine.Tick()
			r.tactical = func() {
				previousApproach()
				if r.engine.Tick() < nextApproach {
					return
				}
				nextApproach = r.engine.Tick() + 200
				if live := cohort(); len(live) > 0 {
					r.tryIssue(sim.Order{Kind: "move", Entities: live, Position: point})
					for _, target := range r.tags[tag] {
						if _, visible := r.seen(target); visible {
							for _, actor := range live {
								r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{actor}, Target: target})
							}
							break
						}
					}
				}
			}
		}
		defer func() { r.tactical = previousApproach }()
		for _, id := range r.tags[tag] {
			// Initially declared static guards are legitimate mission targets,
			// but explicit attacks still wait for current shared vision.
			r.wait("ground screen acquires relay guard", 6000, func() bool {
				_, ok := r.seen(id)
				return ok || r.view().Visible[(point.Y/1000)*r.gameMap.Width+point.X/1000]
			})
			if _, ok := r.seen(id); !ok {
				continue
			}
			for _, attacker := range cohort() {
				r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{attacker}, Target: id})
			}
			r.wait("mixed ground fire eliminates relay guard", 1800, func() bool { _, ok := r.seen(id); return !ok })
		}
	}
	usedWorkers := map[sim.ID]bool{}
	limit := 2
	if r.definition.ID != "us-03-relay-ridge" {
		limit = 3
	}
	for stage := 1; stage <= limit; stage++ {
		tag := []string{"relay-1", "relay-2", "relay-3"}[stage-1]
		guard := []string{"relay-guard-1", "relay-guard-2", "relay-guard-3"}[stage-1]
		var point sim.Vec
		for _, actor := range r.definition.Initial {
			if actor.Tag == tag {
				point = sim.Vec(actor.Position)
			}
		}
		if stage > 1 {
			rally = sim.Vec{X: point.X - 14000, Y: point.Y + 14000}
		}
		var worker sim.ID
		findWorker := func() bool {
			for _, id := range r.ownedType(r.faction + ".engineer") {
				if !usedWorkers[id] {
					worker = id
					return true
				}
			}
			return false
		}
		if !findWorker() {
			r.issue(1, sim.Order{Kind: "train", Entities: r.ownedType("barracks")[:1], Type: r.faction + ".engineer"})
			r.wait("paid independent capture engineer", 2400, findWorker)
		}
		clearGuards(guard)
		var tank sim.ID
		for _, id := range cohort() {
			e, ok := r.seen(id)
			if ok && e.Type == r.faction+".tank" {
				tank = id
				break
			}
		}
		if tank == 0 {
			r.t.Fatal("no surviving paid capture tank")
		}
		worker = r.captureRelay(tag, cohort(), tank, worker, usedWorkers, cohort)
		usedWorkers[worker] = true
		r.t.Logf("%s captured tick%d", tag, r.engine.Tick())
		if r.engine.Outcome().Finished {
			break
		}
		r.issue(1, sim.Order{Kind: "repair", Entities: []sim.ID{worker}, Target: r.tags[tag][0]})
		repairers[r.tags[tag][0]] = worker
		if stage == 1 {
			r.checkpoint()
			if r.faction == "SY" && r.difficulty == "hard" {
				r.buildAt(r.ids("home-rig"), "outpost", sim.Vec{X: 41500, Y: 88500})
				r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 43500, Y: 85500})
			}
		}
		if stage < limit {
			guards[r.tags[tag][0]] = cohort()
			rally = sim.Vec{X: point.X - 1000, Y: point.Y + 2500}
			r.wait("stabilize captured relay before advancing", 2400, func() bool { e, ok := r.seen(r.tags[tag][0]); return ok && e.Health >= 850 })
			if stage == 1 && r.faction == "SA" {
				for _, candidate := range r.ownedType(r.faction + ".engineer") {
					if usedWorkers[candidate] {
						continue
					}
					for _, station := range r.view().Stations {
						if station.Position == (sim.Vec{X: 49500, Y: 85500}) {
							r.issue(1, sim.Order{Kind: "capture", Entities: []sim.ID{candidate}, Target: station.ID})
							usedWorkers[candidate] = true
						}
					}
					break
				}
			}
			rifles, tanks := 0, 0
			var defenders []sim.ID
			for _, id := range cohort() {
				e, ok := r.seen(id)
				if !ok {
					continue
				}
				keep := false
				if e.Type == r.faction+".rifle" && rifles < 4 {
					rifles++
					keep = true
				}
				if e.Type == r.faction+".tank" && tanks < 1 {
					tanks++
					keep = true
				}
				if keep {
					reserve[id] = true
					defenders = append(defenders, id)
					r.issue(1, sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: sim.Vec{X: point.X - 1500, Y: point.Y + 3500}})
				}
			}
			guards[r.tags[tag][0]] = defenders
		} else {
			guards[r.tags[tag][0]] = cohort()
		}
	}
	r.wait("captured communication objective and hold", 7000, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}

func TestAuthoredCampaignCaptureCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored capture playthroughs")
	}
	for _, id := range []string{"us-03-relay-ridge", "sy-05-relay-break", "sa-05-three-positions"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCampaignCapture(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}

func (r *authoredRun) stagedAssault() bool {
	return r.definition.ID == "sy-06-open-road" && r.difficulty == "hard" || r.definition.ID == "sa-06-shieldline" && r.difficulty == "easy"
}
func (r *authoredRun) scheduledType(kind string) int {
	n := len(r.ownedType(kind))
	for _, e := range r.view().Entities {
		if e.Owner == 1 && e.Private != nil {
			for _, job := range e.Private.Jobs {
				if job.Type == kind {
					n++
				}
			}
		}
	}
	return n
}

// Ordinary paid mixed forces and visible-target focus, shared by long authored
// combat routes. This is a deterministic human-order driver, not engine AI.
func (r *authoredRun) assaultPolicy(excluded map[sim.ID]bool, after func(), defenseAt ...sim.Tick) func() {
	next := r.engine.Tick()
	wave := 0
	var objectiveTags []string
	if strings.Contains(r.definition.ID, "-05-") {
		objectiveTags = []string{"relay-1", "relay-2", "relay-3"}
	}
	if strings.Contains(r.definition.ID, "-06-") {
		objectiveTags = []string{"enemy-strategic", "forward-command", "forward-factory", "forward-barracks", "relay-1", "relay-2", "relay-3", "enemy-barracks", "enemy-factory", "enemy-service", "enemy-hq"}
	}
	if r.definition.ID == "sy-06-open-road" || r.definition.ID == "sa-06-shieldline" {
		objectiveTags = []string{"enemy-barracks", "enemy-factory", "enemy-service", "enemy-hq", "forward-barracks", "forward-factory", "forward-command"}
	}
	if r.difficulty == "hard" && r.definition.ID == "ir-05-the-second-volley" {
		objectiveTags = append([]string{"enemy-barracks", "enemy-factory", "enemy-service", "enemy-hq"}, objectiveTags...)
	}
	cleared := map[sim.ID]bool{}

	return func() {
		if r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 600
		wave++
		factory, barracks := r.ownedType("factory"), r.ownedType("barracks")
		if r.stagedAssault() {
			if radar := r.ownedType("radar"); len(radar) > 0 {
				r.tryIssue(sim.Order{Kind: "research", Entities: radar[:1], Type: "weapons_training"})
			}
			if tech := r.ownedType("tech"); len(tech) > 0 {
				r.tryIssue(sim.Order{Kind: "research", Entities: tech[:1], Type: "vehicle_armor"})
			}
			if len(factory) > 0 && r.scheduledType(r.faction+".aa") < 3 {
				r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".aa"})
			}
			if len(barracks) > 0 && r.scheduledType(r.faction+".at") < 4 {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".at"})
			}
		}
		if len(factory) > 0 {
			for _, kind := range []string{"tank", "tank", "artillery"} {
				r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + "." + kind})
			}
		}
		if len(barracks) > 0 && len(r.ownedType(r.faction+".rifle")) < 14 {
			for range 2 {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".rifle"})
			}
		}
		point := []sim.Vec{{X: 99500, Y: 29500}, {X: 106500, Y: 22500}, {X: 114500, Y: 29500}, {X: 118500, Y: 21500}}[wave%4]
		view := r.view()
		var target sim.ID
		for _, tag := range []string{"enemy-barracks", "enemy-hq", "enemy-factory", "enemy-service"} {
			for _, entity := range view.Entities {
				for _, id := range r.tags[tag] {
					if entity.Owner == 2 && entity.ID == id {
						target, point = entity.ID, entity.Position
					}
				}
			}
			if target != 0 {
				break
			}
		}
		objectivesDone := false
		if len(objectiveTags) > 0 {
			target = 0
			objectivesDone = true
			for _, tag := range objectiveTags {
				if len(r.tags[tag]) == 0 {
					continue
				}
				id := r.tags[tag][0]
				var initial sim.Vec
				for _, actor := range r.definition.Initial {
					if actor.Tag == tag {
						initial = sim.Vec(actor.Position)
					}
				}
				present := false
				for _, entity := range view.Entities {
					if entity.ID == id {
						present = true
						if entity.Owner == 1 {
							cleared[id] = true
						}
						break
					}
				}
				cell := (initial.Y/1000)*r.gameMap.Width + initial.X/1000
				if !present && view.Visible[cell] {
					cleared[id] = true
				}
				if cleared[id] {
					continue
				}
				objectivesDone = false
				point = initial
				for _, entity := range view.Entities {
					if entity.ID == id {
						target = entity.ID
						point = entity.Position
						break
					}
				}
				break
			}
		}
		nearest := int64(18000 * 18000)
		if r.definition.ID == "us-05-split-front" || r.definition.ID == "sy-06-open-road" && r.difficulty == "hard" {
			nearest = 0
		}
		for _, enemy := range view.Entities {
			if enemy.Owner != 2 && enemy.Owner != 4 {
				continue
			}
			unit, ok := r.catalog.Unit(enemy.Type)
			if !ok || unit.Weapon == "" {
				continue
			}
			for _, own := range view.Entities {
				if own.Owner != 1 || own.Position.Y > 70000 || excluded[own.ID] {
					continue
				}
				u, ok := r.catalog.Unit(own.Type)
				if !ok || u.Weapon == "" {
					continue
				}
				dx, dy := int64(own.Position.X-enemy.Position.X), int64(own.Position.Y-enemy.Position.Y)
				if d := dx*dx + dy*dy; d < nearest {
					nearest, target, point = d, enemy.ID, enemy.Position
				}
			}
		}
		if r.definition.ID == "sy-06-open-road" && r.difficulty != "hard" || r.definition.ID == "sa-06-shieldline" {
			closest := int64(22000 * 22000)
			for _, enemy := range r.view().Entities {
				if enemy.Owner != 2 && enemy.Owner != 4 {
					continue
				}
				u, ok := r.catalog.Unit(enemy.Type)
				if !ok || u.Weapon == "" {
					continue
				}
				dx, dy := int64(enemy.Position.X-20500), int64(enemy.Position.Y-104500)
				if d := dx*dx + dy*dy; d < closest {
					closest, target, point = d, enemy.ID, enemy.Position
				}
			}
		}
		if r.stagedAssault() && r.engine.Tick() < 2600 {
			point = sim.Vec{X: 31500, Y: 94500}
			target = 0
			closest := int64(18000 * 18000)
			for _, enemy := range r.view().Entities {
				if enemy.Owner != 2 && enemy.Owner != 4 {
					continue
				}
				u, ok := r.catalog.Unit(enemy.Type)
				if !ok || u.Weapon == "" {
					continue
				}
				dx, dy := int64(enemy.Position.X-point.X), int64(enemy.Position.Y-point.Y)
				if d := dx*dx + dy*dy; d < closest {
					closest, target, point = d, enemy.ID, enemy.Position
				}
			}
		}
		var army []sim.ID
		for _, id := range r.army() {
			if !excluded[id] {
				army = append(army, id)
			}
		}
		defeated := objectivesDone || len(defenseAt) > 0 && r.engine.Tick() >= defenseAt[0]
		for _, player := range view.Players {
			if len(objectiveTags) == 0 && player.ID == 2 && player.Defeated {
				defeated = true
			}
		}
		if defeated {
			split := len(army) / 2
			if r.faction == "SA" && len(defenseAt) > 0 && r.difficulty == "hard" {
				split = min(4, len(army))
			}
			for i, group := range [][]sim.ID{army[:split], army[split:]} {
				if len(group) > 0 {
					position := sim.Vec{X: 50500, Y: 77500}
					if i == 1 {
						position = sim.Vec{X: 85500, Y: 60500}
						if len(defenseAt) > 0 && r.faction != "SA" {
							position = sim.Vec{X: 31500, Y: 98500}
							if r.faction == "SY" && r.difficulty == "hard" {
								position = sim.Vec{X: 35500, Y: 102500}
							}
						}
					}
					if r.faction == "SY" && len(defenseAt) > 0 && r.difficulty == "hard" && i == 0 {
						position = sim.Vec{X: 50500, Y: 86500}
					}
					if objectivesDone && (r.definition.ID == "us-06-clear-horizon" || r.definition.ID == "sa-06-shieldline") {
						name := "corridor1"
						if i == 1 {
							name = "corridor2"
						}
						position = r.region(name)
					}
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: group, Position: position})
				}
			}
		} else {
			if len(factory) > 0 {
				r.tryIssue(sim.Order{Kind: "rally", Entities: factory[:1], Position: point})
			}
			if len(barracks) > 0 {
				r.tryIssue(sim.Order{Kind: "rally", Entities: barracks[:1], Position: point})
			}
			if len(army) > 0 {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: army, Position: point})
			}
			if target != 0 {
				var candidates []sim.Order
				var attackers []sim.ID
				for _, id := range r.army() {
					if excluded[id] {
						continue
					}
					candidates = append(candidates, sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
				}
				for offset := 0; offset < len(candidates); offset += 32 {
					batch := candidates[offset:min(offset+32, len(candidates))]
					preview, err := r.engine.PreviewCandidates(1, batch)
					if err != nil {
						r.t.Fatal(err)
					}
					for i, p := range preview {
						if p.Accepted {
							attackers = append(attackers, batch[i].Entities[0])
						}
					}
				}
				positions := map[sim.ID]sim.Vec{}
				for _, e := range view.Entities {
					positions[e.ID] = e.Position
				}
				distance := func(id sim.ID) int64 {
					p := positions[id]
					dx, dy := int64(p.X-point.X), int64(p.Y-point.Y)
					return dx*dx + dy*dy
				}
				sort.Slice(attackers, func(i, j int) bool {
					a, b := distance(attackers[i]), distance(attackers[j])
					if a == b {
						return attackers[i] < attackers[j]
					}
					return a < b
				})
				if len(attackers) > 0 {
					r.tryIssue(sim.Order{Kind: "attack", Entities: attackers[:min(8, len(attackers))], Target: target})
				}
			}
		}
		if after != nil {
			after()
		}
	}
}

func playCampaignDefense(r *authoredRun) {
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".aa"})
	excluded := map[sim.ID]bool{}
	if r.faction == "SY" {
		for _, id := range r.ids("evacuation-team") {
			excluded[id] = true
		}
		r.issue(1, sim.Order{Kind: "board", Entities: r.ids("evacuation-team"), Target: r.ids("safehouse-front")[0]})
		r.wait("marked infantry board original front safehouse", 1200, func() bool {
			for _, id := range r.ids("evacuation-team") {
				e, ok := r.seen(id)
				if !ok || e.Private.Container == 0 {
					return false
				}
			}
			return true
		})
		r.issue(1, sim.Order{Kind: "ability", Type: "transfer", Entities: r.ids("safehouse-front"), Target: r.ids("safehouse-rear")[0]})
		r.wait("safehouse network delivers original squads", 600, func() bool {
			for _, id := range r.ids("evacuation-team") {
				e, ok := r.seen(id)
				if !ok || e.Private.Container != 0 || e.Position.Y < 100000 {
					return false
				}
			}
			return true
		})
		for i, id := range r.ids("evacuation-team") {
			r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: sim.Vec{X: 40500 + int32(i)*2000, Y: 110500}}, sim.Order{Kind: "hold", Entities: []sim.ID{id}, Queued: true})
		}
	}
	for _, tag := range []string{"wing-one", "wing-two", "escort-fighter", "survey-one", "network-strike"} {
		if len(r.tags[tag]) > 0 {
			r.issue(1, sim.Order{Kind: "return", Entities: r.ids(tag)})
		}
	}
	defendAt := sim.Tick(6000)
	var repair func()
	if r.faction == "SY" {
		defendAt = 0
		repair = func() {
			workers := r.ownedType("SY.engineer")
			for i, tag := range []string{"safehouse-front", "safehouse-rear"} {
				if i < len(workers) && r.hasTag(tag) {
					r.tryIssue(sim.Order{Kind: "repair", Entities: workers[i : i+1], Target: r.tags[tag][0]})
				}
			}
		}
	}
	if r.faction == "SA" && r.difficulty == "hard" {
		defendAt = 0
		repair = func() {
			// The fixed missile battery has no ground weapon. Keep an ordinary
			// mixed screen on its northern approach as well as guarding outposts.
			var batteryScreen []sim.ID
			for _, kind := range []string{"SA.at", "SA.tank"} {
				ids := r.ownedType(kind)
				batteryScreen = append(batteryScreen, ids[:min(2, len(ids))]...)
			}
			if len(batteryScreen) > 0 && r.engine.Tick() >= 9000 {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: batteryScreen, Position: sim.Vec{X: 71500, Y: 60500}})
			}
			workers := r.ownedType("SA.engineer")
			for i, tag := range []string{"fixed-battery", "outpost-east"} {
				if i < len(workers) && r.hasTag(tag) {
					r.tryIssue(sim.Order{Kind: "repair", Entities: workers[i : i+1], Target: r.tags[tag][0]})
				}
			}
		}
	}
	r.tactical = r.assaultPolicy(excluded, repair, defendAt)
	if r.faction == "SA" {
		mobile := r.ids("mobile-aegis")
		r.issue(1, sim.Order{Kind: "move", Entities: mobile, Position: sim.Vec{X: 75500, Y: 69500}})
		r.wait("mobile interceptor covers the eastern defense", 1800, func() bool {
			for _, e := range r.view().Entities {
				if e.ID == mobile[0] {
					dx, dy := int64(e.Position.X-75500), int64(e.Position.Y-69500)
					return dx*dx+dy*dy < 1200*1200
				}
			}
			return false
		})
		r.issue(1, sim.Order{Kind: "deploy", Entities: mobile})
	}
	halfway := sim.Tick(7300)
	if r.faction == "SY" || r.faction == "SA" {
		halfway = 6100
	}
	r.wait("authored defense midpoint", halfway+1000, func() bool { return r.engine.Tick() >= halfway })
	r.checkpoint()
	r.wait("sustain real operational defense until the authored timer", 22000, func() bool { return r.engine.Outcome().Finished })
	if r.faction == "SY" {
		r.requireOptional("evacuation")
	}
	r.finish()
}
func TestAuthoredCampaignDefenseCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored ten/twelve minute defenses")
	}
	for _, id := range []string{"us-04-broken-umbrella", "ir-04-hold-the-network", "sy-04-open-doors", "sa-04-intercept-window"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCampaignDefense(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}

func playCampaignAssault(r *authoredRun) {
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
	if r.definition.ID == "sa-06-shieldline" && r.difficulty != "easy" {
		r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 33500, Y: 108500})
	}
	if r.stagedAssault() {
		r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 31500, Y: 94500}})
		r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 31500, Y: 98500})
		r.issue(1, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".aa"})
	}
	excluded := map[sim.ID]bool{}
	for _, tag := range []string{"observer-west", "observer-east"} {
		for _, id := range r.tags[tag] {
			excluded[id] = true
		}
	}
	r.tactical = r.assaultPolicy(excluded, func() {
		if r.definition.ID == "ir-06-iron-signal" {
			for i, tag := range []string{"observer-west", "observer-east"} {
				if r.hasTag(tag) {
					position := r.region("site1")
					if i == 1 {
						position = r.region("site2")
					}
					r.tryIssue(sim.Order{Kind: "move", Entities: r.ids(tag), Position: position})
				}
			}
		}
		if r.definition.ID == "us-06-clear-horizon" || r.definition.ID == "sa-06-shieldline" {
			workers := r.ownedType(r.faction + ".engineer")
			if len(workers) < 2 {
				if barracks := r.ownedType("barracks"); len(barracks) > 0 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".engineer"})
				}
			}
			for i, id := range workers[:min(2, len(workers))] {
				name := "corridor1"
				if i == 1 {
					name = "corridor2"
				}
				r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: r.region(name)})
			}
		}
	})
	r.wait("paid assault establishes its first command phase", 1400, func() bool { return r.engine.Tick() >= 1500 })
	r.checkpoint()
	r.wait("ordinary combined force neutralizes authored military objectives", 30000, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}
func TestAuthoredCampaignAssaultCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored assault playthroughs")
	}
	for _, id := range []string{"us-05-split-front", "ir-05-the-second-volley", "us-06-clear-horizon", "ir-06-iron-signal", "sy-06-open-road", "sa-06-shieldline"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCampaignAssault(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}

// Two independent human command streams; shared vision never grants command
// ownership, and both production queues spend their own mission resources.
func (r *authoredRun) playerView(player sim.PlayerID) sim.View {
	view, ok := r.engine.PlayerView(player)
	if !ok {
		r.t.Fatalf("missing player %d perspective", player)
	}
	return view
}
func (r *authoredRun) playerType(player sim.PlayerID, kind string) []sim.ID {
	var ids []sim.ID
	for _, e := range r.playerView(player).Entities {
		if e.Owner == player && e.Type == kind {
			ids = append(ids, e.ID)
		}
	}
	return ids
}
func (r *authoredRun) playerArmy(player sim.PlayerID) []sim.ID {
	var ids []sim.ID
	for _, e := range r.playerView(player).Entities {
		u, ok := r.catalog.Unit(e.Type)
		if e.Owner == player && ok && u.Weapon != "" && u.Armor != "air" && e.Private != nil && e.Private.Container == 0 {
			ids = append(ids, e.ID)
		}
	}
	return ids
}
func (r *authoredRun) tryPlayer(player sim.PlayerID, order sim.Order) bool {
	preview, err := r.engine.PreviewOrders(player, []sim.Order{order})
	if err != nil || len(preview) != 1 || !preview[0].Accepted {
		return false
	}
	r.issue(player, order)
	return true
}
func (r *authoredRun) coopPolicy(productionCleared *bool) func() {
	next := r.engine.Tick()
	cleared := map[sim.ID]bool{}
	return func() {
		if r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 400
		for _, player := range []sim.PlayerID{1, 2} {
			faction := "US"
			if player == 2 {
				faction = "SA"
			}
			view := r.playerView(player)
			var point sim.Vec
			var target sim.ID
			prefix := "opponent-west"
			if player == 2 || r.definition.ID == "convoy-union" {
				prefix = "opponent-east"
			}
			tags := []string{prefix + "-barracks", prefix + "-factory", prefix + "-service", prefix + "-hq"}
			for _, tag := range tags {
				id := r.tags[tag][0]
				var initial sim.Vec
				for _, a := range r.definition.Initial {
					if a.Tag == tag {
						initial = sim.Vec(a.Position)
					}
				}
				present := false
				for _, e := range view.Entities {
					if e.ID == id {
						present = true
						if e.Owner == 1 || e.Owner == 2 {
							cleared[id] = true
						}
						break
					}
				}
				if !present && view.Visible[(initial.Y/1000)*r.gameMap.Width+initial.X/1000] {
					cleared[id] = true
				}
				if cleared[id] {
					continue
				}
				point = initial
				for _, e := range view.Entities {
					if e.ID == id {
						target = e.ID
						point = e.Position
					}
				}
				break
			}
			if point == (sim.Vec{}) {
				if r.definition.ID == "convoy-union" {
					*productionCleared = true
					point = sim.Vec{X: 106500, Y: 22500}
					if player == 1 {
						point = sim.Vec{X: 31500, Y: 70500}
					}
				} else {
					point = r.region("central-connection")
				}
			}
			if r.definition.ID == "twin-outposts" && !r.complete("reconnection") {
				point = r.region("central-connection")
				target = 0
			}
			for _, kind := range []string{"factory", "barracks"} {
				if *productionCleared {
					break
				}
				producers := r.playerType(player, kind)
				if len(producers) == 0 {
					continue
				}
				r.tryPlayer(player, sim.Order{Kind: "rally", Entities: producers[:1], Position: point})
				unit := "tank"
				if kind == "barracks" {
					unit = "rifle"
				}
				for range 2 {
					r.tryPlayer(player, sim.Order{Kind: "train", Entities: producers[:1], Type: faction + "." + unit})
				}
				if kind == "factory" && len(r.playerType(player, faction+".aa")) < 2 {
					r.tryPlayer(player, sim.Order{Kind: "train", Entities: producers[:1], Type: faction + ".aa"})
				}
			}
			army := r.playerArmy(player)
			if len(army) > 0 {
				r.tryPlayer(player, sim.Order{Kind: "attack_move", Entities: army, Position: point})
			}
			if target != 0 {
				for _, id := range r.playerArmy(player) {
					r.tryPlayer(player, sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
				}
			}
		}
	}
}
func playCoopMission(r *authoredRun) {
	for _, player := range []sim.PlayerID{1, 2} {
		faction := "US"
		if player == 2 {
			faction = "SA"
		}
		r.issue(player, sim.Order{Kind: "gather", Entities: r.playerType(player, faction+".hauler"), Target: sim.ID(player)})
		foreign := r.playerType(3-player, map[sim.PlayerID]string{1: "SA", 2: "US"}[player]+".rig")
		if len(foreign) == 0 {
			r.t.Fatal("missing teammate command boundary fixture")
		}
		if preview, err := r.engine.PreviewOrders(player, []sim.Order{{Kind: "move", Entities: foreign, Position: r.region("central-connection")}}); err == nil && len(preview) == 1 && preview[0].Accepted {
			r.t.Fatal("allied ownership leaked")
		}
	}
	productionCleared := false
	r.tactical = r.coopPolicy(&productionCleared)
	if r.definition.ID == "twin-outposts" {
		r.wait("independent armies reconnect the two fronts", 7000, func() bool { return r.complete("reconnection") })
		r.checkpoint()
		r.wait("joint ordinary assault defeats both production bases", 25000, func() bool { return r.engine.Outcome().Finished })
		r.requireOptional("original-hqs")
	} else {
		r.wait("first authored convoy countdown", 600, func() bool {
			for _, c := range r.view().Mission.Convoys {
				if c.ID == "convoy-1" && c.Active {
					return true
				}
			}
			return false
		})
		r.issue(1, sim.Order{Kind: "convoy_hold", Type: "convoy-1"})
		r.wait("joint escort clears the declared hostile production base", 25000, func() bool { return productionCleared })
		r.checkpoint()
		for _, id := range []string{"convoy-1", "convoy-2", "convoy-3"} {
			r.wait("authored next convoy "+id, 2000, func() bool {
				for _, c := range r.view().Mission.Convoys {
					if c.ID == id && c.Active {
						return true
					}
				}
				return false
			})
			r.issue(1, sim.Order{Kind: "convoy_hold", Type: id})
			r.issue(1, sim.Order{Kind: "convoy_advance", Type: id, Index: 1})
			for _, c := range r.view().Mission.Convoys {
				if c.ID == id && !c.Held {
					r.t.Fatal("one commander bypassed convoy consensus")
				}
			}
			r.issue(2, sim.Order{Kind: "convoy_advance", Type: id, Index: 1})
			r.wait("real convoy traverses approved southern branch", 12000, func() bool {
				for _, c := range r.view().Mission.Convoys {
					if c.ID == id {
						return c.Completed
					}
				}
				return false
			})
		}
		r.requireOptional("all-convoy-trucks")
	}
	r.finish()
}
func TestAuthoredCoopCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated two-human authored co-op completion matrix")
	}
	for _, id := range []string{"twin-outposts", "convoy-union"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) { playCoopMission(newAuthoredRun(t, id, difficulty, "")) })
		}
	}
}
