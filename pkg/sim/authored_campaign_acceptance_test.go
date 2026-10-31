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
	if r.definition.ID == "sy-01-workshop-foothold" || r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
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
	// A foundation crossed by our own moving screen is legitimately
	// "occupied" at the instant the rig finishes scouting. Give ordinary
	// movement a bounded chance to clear the site first; only our own
	// mobile units delay the request, every other placement rule still
	// goes straight to the Go validator as before.
	if building, ok := r.catalog.Building(kind); ok {
		ownMobileInFoundation := func() bool {
			for _, entity := range r.view().Entities {
				if entity.Owner != 1 || entity.ID == rig[0] {
					continue
				}
				unit, isUnit := r.catalog.Unit(entity.Type)
				if !isUnit || unit.Armor == "air" && !entity.Landed {
					continue
				}
				dx, dy := entity.Position.X-point.X, entity.Position.Y-point.Y
				if dx < 0 {
					dx = -dx
				}
				if dy < 0 {
					dy = -dy
				}
				if int64(dx) < int64(building.Width)*500+int64(unit.Radius) && int64(dy) < int64(building.Height)*500+int64(unit.Radius) {
					return true
				}
			}
			return false
		}
		for waited := sim.Tick(0); waited < 900 && ownMobileInFoundation() && !r.engine.Outcome().Finished; waited += 10 {
			if r.tactical != nil {
				r.tactical()
			}
			r.advance(10)
		}
	}
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
	// Only the mechanic-preservation optional uses the defensive in-base
	// economy route. The plain easy completion route follows the normal
	// eastern layout, which survives the garrison AI measurably longer
	// (the in-base variant loses the rig during supply construction).
	defensiveEconomy := r.difficulty == "easy" && r.requiredOptional == "mechanic-teams"
	hqPoint, powerPoint, supplyPoint, barracksPoint, factoryPoint := sim.Vec{X: 33500, Y: 105500}, sim.Vec{X: 25500, Y: 108500}, sim.Vec{X: 26500, Y: 96500}, sim.Vec{X: 25500, Y: 115500}, sim.Vec{X: 33500, Y: 115500}
	if defensiveEconomy || r.difficulty == "hard" {
		// Establish inside the authored base region, with the workshop behind
		// the HQ instead of on the exposed eastern approach. On hard the
		// eastern HQ is destroyed by the garrison AI before the workshop is
		// placed, which also removes the only build-radius source. The
		// supply center also moves south beside the HQ: at the northern
		// site the garrison's AT squads (range 7000) kill the constructing
		// rig from beyond rifle range before the screen can close.
		hqPoint, factoryPoint = sim.Vec{X: 20500, Y: 104500}, sim.Vec{X: 19500, Y: 115500}
		supplyPoint = sim.Vec{X: 26500, Y: 96500}
	}
	if defensiveEconomy && r.tactical == nil {
		r.tactical = r.mechanicRetreat()
	}
	field := sim.ID(1)
	reconPoint := sim.Vec{X: 41500, Y: 72500}
	if defensiveEconomy {
		reconPoint = sim.Vec{X: 77500, Y: 87500}
	}
	r.issue(1, sim.Order{Kind: "attack_move", Entities: rifles[:2], Position: r.region("recoveryRig")}, sim.Order{Kind: "attack_move", Entities: append(rifles[2:], r.ids("starting-at")...), Position: r.region("recovery2")}, sim.Order{Kind: "move", Entities: r.ids("starting-recon"), Position: reconPoint}, sim.Order{Kind: "move", Entities: r.ids("starting-engineers"), Position: sim.Vec{X: 39500, Y: 87500}})
	r.wait("recovery of original rig", 2400, func() bool { return r.hasTag("recovered-rig") })
	rig := r.ids("recovered-rig")
	if !defensiveEconomy {
		r.issue(1, sim.Order{Kind: "move", Entities: r.ids("mechanics-west"), Position: sim.Vec{X: 25500, Y: 83500}}, sim.Order{Kind: "move", Entities: r.ids("mechanics-west"), Position: sim.Vec{X: 22500, Y: 120500}, Queued: true})
	}
	r.wait("eastern mechanic recovery", 1200, func() bool { return r.hasTag("mechanics-east") })
	if !defensiveEconomy {
		r.issue(1, sim.Order{Kind: "move", Entities: r.ids("mechanics-east"), Position: sim.Vec{X: 77500, Y: 113500}}, sim.Order{Kind: "move", Entities: r.ids("mechanics-east"), Position: sim.Vec{X: 26500, Y: 122500}, Queued: true}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 33500, Y: 92500}})
	} else {
		r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 33500, Y: 92500}})
	}
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
	optionalRecovery := r.tactical
	r.tactical = func() {
		if defensiveEconomy && optionalRecovery != nil {
			optionalRecovery()
		}
		if defensiveEconomy {
			// A normally paid second hauler must receive its real gathering
			// task after leaving production. No resources are granted.
			for _, id := range r.ownedType("SY.hauler") {
				actor, present := r.seen(id)
				if present && actor.Private != nil && len(actor.Private.Orders) == 0 {
					r.tryIssue(sim.Order{Kind: "gather", Entities: []sim.ID{id}, Target: field})
				}
			}
		}
		if r.engine.Tick() < nextGuard {
			return
		}
		nextGuard = r.engine.Tick() + 100
		if r.difficulty == "hard" {
			// Keep the screen at strength while income accrues for the
			// workshop. A single fixed queue attrits away on easy/hard and
			// the garrison then destroys the HQ (the build-radius source)
			// before the factory can be placed. Upkeep stays paused until
			// the factory is complete: every credit first rushes the
			// workshop, whose completion ends the rig-loss failure.
			factoryDone := false
			for _, id := range r.ownedType("factory") {
				if entity, ok := r.seen(id); ok && entity.Complete {
					factoryDone = true
				}
			}
			if barracks := r.ownedType("barracks"); len(barracks) > 0 && factoryDone {
				credits := r.view().Economy.Credits
				if r.scheduledType("SY.medic") < 2 && credits > 500000 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: "SY.medic"})
				} else if r.scheduledType("SY.at") < 4 && credits > 700000 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: "SY.at"})
				} else if r.scheduledType("SY.rifle") < 12 && credits > 400000 {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: "SY.rifle"})
				}
			}
		}
		center := hqPoint
		target := sim.Vec{X: hqPoint.X, Y: hqPoint.Y - 7000}
		if false { // superseded by the hard focus policy below; proved harmful on easy
			// Screen the northeastern approach the garrison AI uses to reach
			// the supply site, instead of the ground west of it.
			target = sim.Vec{X: 30500, Y: 91500}
		}
		best := int64(25000 * 25000)
		for _, entity := range r.view().Entities {
			if entity.Owner != 2 && entity.Owner != 4 {
				continue
			}
			if defensiveEconomy {
				unit, mobile := r.catalog.Unit(entity.Type)
				if mobile && unit.Weapon == "" {
					continue
				}
			}
			dx, dy := int64(entity.Position.X-center.X), int64(entity.Position.Y-center.Y)
			d := dx*dx + dy*dy
			if defensiveEconomy {
				if builder, ok := r.seen(rig[0]); ok {
					x, y := int64(entity.Position.X-builder.Position.X), int64(entity.Position.Y-builder.Position.Y)
					d = min(d, x*x+y*y)
				}
			}
			if d < best {
				best = d
				target = entity.Position
			}
		}
		// The irreplaceable rig cannot be repaired by engineers, so an armed
		// hostile in range of it outranks every other guard task: focus the
		// whole screen on the nearest such threat instead of letting each
		// unit chase its own preferred target while AT fire kills the rig.
		rigThreat := sim.ID(0)
		if false { // superseded by the hard focus policy below; proved harmful on easy
			if builder, ok := r.seen(rig[0]); ok {
				// The HQ is the only build-radius source and a required
				// building, so a threat to it ranks with a threat to the rig.
				hqPos, hqAlive := sim.Vec{}, false
				if hqs := r.ownedType("hq"); len(hqs) > 0 {
					if hq, seen := r.seen(hqs[0]); seen {
						hqPos, hqAlive = hq.Position, true
					}
				}
				closest, closestAT := int64(11000*11000), int64(11000*11000)
				rigThreatAT := sim.ID(0)
				for _, entity := range r.view().Entities {
					if entity.Owner != 2 && entity.Owner != 4 {
						continue
					}
					unit, known := r.catalog.Unit(entity.Type)
					if !known || unit.Weapon == "" {
						continue
					}
					dx, dy := int64(entity.Position.X-builder.Position.X), int64(entity.Position.Y-builder.Position.Y)
					d := dx*dx + dy*dy
					if hqAlive {
						hx, hy := int64(entity.Position.X-hqPos.X), int64(entity.Position.Y-hqPos.Y)
						if hd := hx*hx + hy*hy; hd < d {
							d = hd
						}
					}
					// Anti-armor squads are the rig and building killers
					// (small arms barely scratch structures); they outrank
					// a nearer rifle squad.
					if weapon, ok := r.catalog.Weapon(unit.Weapon); ok && weapon.Kind == "antiarmor" && d < closestAT {
						rigThreatAT, closestAT = entity.ID, d
					}
					if d < closest {
						rigThreat, closest = entity.ID, d
					}
				}
				if rigThreatAT != 0 {
					rigThreat = rigThreatAT
				}
			}
		}
		// Hard focus policy: the first garrison army (tank, AT, rifles)
		// outranges and outnumbers the starting screen, so split fire by
		// counter — SY.at kills armor (antiarmor does 0 vs infantry),
		// rifles kill the enemy AT first (the rig/building killer) — and
		// pull the irreplaceable rig off its foundation when armed
		// hostiles close in, resuming construction once clear.
		hardFocus := false
		if r.difficulty == "hard" || defensiveEconomy {
			hardFocus = true
			armedNear := func(point sim.Vec, radius int32) bool {
				for _, entity := range r.view().Entities {
					if entity.Owner != 2 && entity.Owner != 4 {
						continue
					}
					unit, known := r.catalog.Unit(entity.Type)
					if !known || unit.Weapon == "" {
						continue
					}
					dx, dy := int64(entity.Position.X-point.X), int64(entity.Position.Y-point.Y)
					if dx*dx+dy*dy < int64(radius)*int64(radius) {
						return true
					}
				}
				return false
			}
			if builder, ok := r.seen(rig[0]); ok && builder.Private != nil {
				var foundation *sim.EntityView
				for i := range r.view().Entities {
					entity := r.view().Entities[i]
					if entity.Owner == 1 && !entity.Complete {
						if _, isBuilding := r.catalog.Building(entity.Type); isBuilding {
							foundation = &entity
						}
					}
				}
				building := len(builder.Private.Orders) > 0 && builder.Private.Orders[0].Kind == "build"
				// The factory is the win condition: tolerate closer
				// threats there so its 900-tick build actually progresses
				// instead of starving in abandon/resume cycles.
				abandonRadius, resumeRadius := int32(7500), int32(9000)
				if foundation != nil && foundation.Type == "factory" {
					abandonRadius, resumeRadius = 4500, 5500
				}
				switch {
				case building && armedNear(builder.Position, abandonRadius):
					r.tryIssue(sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 9000}})
				case !building && foundation != nil && !armedNear(foundation.Position, resumeRadius):
					r.tryIssue(sim.Order{Kind: "resume", Entities: rig, Target: foundation.ID})
				}
			}
			var vehicle, antiArmor, infantry *sim.EntityView
			vehicleD, antiArmorD, infantryD := int64(1<<62), int64(1<<62), int64(1<<62)
			rigPos := hqPoint
			if builder, ok := r.seen(rig[0]); ok {
				rigPos = builder.Position
			}
			for i := range r.view().Entities {
				entity := r.view().Entities[i]
				if entity.Owner != 2 && entity.Owner != 4 {
					continue
				}
				unit, known := r.catalog.Unit(entity.Type)
				if !known || unit.Weapon == "" {
					continue
				}
				dx, dy := int64(entity.Position.X-rigPos.X), int64(entity.Position.Y-rigPos.Y)
				d := dx*dx + dy*dy
				weapon, _ := r.catalog.Weapon(unit.Weapon)
				switch {
				case unit.Armor == "heavy" || unit.Armor == "light":
					if d < vehicleD {
						vehicle, vehicleD = &entity, d
					}
				case weapon.Kind == "antiarmor":
					if d < antiArmorD {
						antiArmor, antiArmorD = &entity, d
					}
				default:
					if d < infantryD {
						infantry, infantryD = &entity, d
					}
				}
			}
			// Fill guard bunkers, AT infantry first; boarded units are
			// excluded from army() and fire from cover.
			for _, bunkerID := range r.ownedType("bunker") {
				bunker, ok := r.seen(bunkerID)
				if !ok || bunker.Private == nil || len(bunker.Private.Passengers) >= 2 {
					continue
				}
				for _, want := range []string{"SY.at", "SY.rifle"} {
					boarded := false
					for _, id := range r.army() {
						actor, present := r.seen(id)
						if !present || actor.Type != want || actor.Private == nil {
							continue
						}
						if len(actor.Private.Orders) > 0 && actor.Private.Orders[0].Kind == "board" {
							continue
						}
						if r.tryIssue(sim.Order{Kind: "board", Entities: []sim.ID{id}, Target: bunkerID}) {
							boarded = true
						}
						break
					}
					if boarded {
						break
					}
				}
			}
			guard := sim.Vec{X: rigPos.X + 4500, Y: rigPos.Y - 4500}
			for _, id := range r.army() {
				actor, present := r.seen(id)
				if !present {
					continue
				}
				switch {
				case actor.Type == "SY.at" && vehicle != nil:
					if !r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: vehicle.ID}) {
						r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: vehicle.Position})
					}
				case actor.Type != "SY.at" && antiArmor != nil:
					if !r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: antiArmor.ID}) {
						r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: antiArmor.Position})
					}
				case infantry != nil:
					if !r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: infantry.ID}) {
						r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: infantry.Position})
					}
				case vehicle != nil:
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: vehicle.Position})
				default:
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: guard})
				}
			}
		}
		if army := r.army(); len(army) > 0 && !hardFocus {
			if rigThreat != 0 {
				// Per-unit focus: squads whose weapon cannot damage the
				// threat's armor (SY.at versus infantry) still close on its
				// position instead of standing idle without orders.
				if threat, ok := r.seen(rigThreat); ok {
					for _, id := range army {
						if !r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: rigThreat}) {
							r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: threat.Position})
						}
					}
				}
			} else if defensiveEconomy {
				for _, id := range army {
					actor, present := r.seen(id)
					if !present {
						continue
					}
					var preferred sim.ID
					closest := int64(25000 * 25000)
					for _, hostile := range r.view().Entities {
						if hostile.Owner != 2 && hostile.Owner != 4 {
							continue
						}
						unit, known := r.catalog.Unit(hostile.Type)
						if !known || unit.Weapon == "" {
							continue
						}
						antiArmor := actor.Type == "SY.at"
						if antiArmor != (unit.Armor == "heavy" || unit.Armor == "light") {
							continue
						}
						dx, dy := int64(hostile.Position.X-actor.Position.X), int64(hostile.Position.Y-actor.Position.Y)
						if d := dx*dx + dy*dy; d < closest {
							preferred, closest = hostile.ID, d
						}
					}
					if preferred != 0 && r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: preferred}) {
						continue
					}
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: target})
				}
			} else {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: army, Position: target})
			}
		}
		if r.difficulty == "hard" {
			// Final stretch: once the factory foundation exists, starting
			// engineers keep the HQ/power pair alive under fire until it
			// completes (factory completion retires the rig-loss failure).
			factoryBuilding := false
			for _, id := range r.ownedType("factory") {
				if entity, ok := r.seen(id); ok && !entity.Complete {
					factoryBuilding = true
				}
			}
			if factoryBuilding {
				var worst *sim.EntityView
				for i := range r.view().Entities {
					entity := r.view().Entities[i]
					if entity.Owner != 1 || !entity.Complete || entity.Private == nil {
						continue
					}
					if (entity.Type == "hq" || entity.Type == "power") && entity.Private.HP < entity.Private.MaxHP {
						if worst == nil || entity.Private.HP < worst.Private.HP {
							worst = &entity
						}
					}
				}
				if worst != nil {
					for _, id := range r.tags["starting-engineers"] {
						worker, alive := r.seen(id)
						if !alive || worker.Owner != 1 || worker.Private == nil {
							continue
						}
						if len(worker.Private.Orders) == 0 || worker.Private.Orders[0].Kind != "repair" || worker.Private.Orders[0].Target != worst.ID {
							r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{id}, Target: worst.ID})
						}
					}
				}
			}
		}
		if defensiveEconomy || r.difficulty == "hard" {
			if hqs := r.ownedType("hq"); len(hqs) > 0 {
				for i := len(r.tags["starting-engineers"]) - 1; i >= 0; i-- {
					worker, alive := r.seen(r.tags["starting-engineers"][i])
					if !alive || worker.Owner != 1 || worker.Private == nil {
						continue
					}
					if len(worker.Private.Orders) == 0 || worker.Private.Orders[0].Kind != "repair" {
						r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{worker.ID}, Target: hqs[0]})
					}
					break
				}
			}
		}
	}

	r.buildAt(rig, "hq", hqPoint)
	if defensiveEconomy {
		r.issue(1, sim.Order{Kind: "repair_reserve", Index: 1800})
	}
	r.buildAt(rig, "power", powerPoint)

	if r.difficulty == "hard" {
		// The garrison's first produced army (tank, AT, rifles) reaches the
		// base around tick 3000 and kills the rig if it is caught building
		// the supply center. Hide the irreplaceable rig behind the HQ and
		// let the starting screen fight that army first; construct supply
		// only once no armed hostile is near the base.
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 9000}})
		r.wait("first garrison army repelled before supply construction", 6000, func() bool {
			if r.engine.Tick() < 3400 {
				return false
			}
			for _, entity := range r.view().Entities {
				if entity.Owner != 2 && entity.Owner != 4 {
					continue
				}
				unit, known := r.catalog.Unit(entity.Type)
				if !known || unit.Weapon == "" {
					continue
				}
				dx, dy := int64(entity.Position.X-hqPoint.X), int64(entity.Position.Y-hqPoint.Y)
				if dx*dx+dy*dy < 25000*25000 {
					return false
				}
			}
			return true
		})
	}

	r.buildAt(rig, "supply", supplyPoint)
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ownedType("SY.hauler"), Target: field})
	if r.difficulty == "hard" {
		// The irreplaceable rig must not idle at the exposed supply site
		// while income accrues; wait behind the HQ instead.
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 7000}})
	}
	if defensiveEconomy {
		// The only recovery rig waits behind the base while income accrues,
		// rather than idling beside the exposed supply approach.
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 7000}})
	}
	barracks, _ := r.catalog.Building("barracks")
	r.wait("income funds real barracks construction", 3600, func() bool { return r.view().Economy.Credits >= barracks.Cost })
	r.buildAt(rig, "barracks", barracksPoint)
	if r.difficulty == "hard" {
		barracks := r.ownedType("barracks")[:1]
		// A medic second in the queue: the starting infantry has no other
		// way to recover between garrison attacks, and unhealed attrition
		// is what eventually leaves the rig and buildings undefended.
		r.issue(1, sim.Order{Kind: "rally", Entities: barracks, Position: sim.Vec{X: hqPoint.X + 6000, Y: hqPoint.Y - 6000}},
			sim.Order{Kind: "train", Entities: barracks, Type: "SY.medic"}, sim.Order{Kind: "train", Entities: barracks, Type: "SY.at"}, sim.Order{Kind: "train", Entities: barracks, Type: "SY.rifle"})
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 7000}})
	}
	if defensiveEconomy {
		// A second hauler leaves the starting screen to die unhealed to
		// the garrison AI's produced pressure army; spend slightly less
		// on a medic-led paid screen and move the rig off the barracks
		// (the AI's attack goal) while factory income accrues.
		barracks := r.ownedType("barracks")[:1]
		r.issue(1, sim.Order{Kind: "rally", Entities: barracks, Position: sim.Vec{X: hqPoint.X + 6000, Y: hqPoint.Y - 6000}},
			sim.Order{Kind: "train", Entities: barracks, Type: "SY.medic"},
			sim.Order{Kind: "train", Entities: barracks, Type: "SY.rifle"},
			sim.Order{Kind: "train", Entities: barracks, Type: "SY.rifle"})
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: hqPoint.X, Y: hqPoint.Y + 7000}})
	}
	workshop, _ := r.catalog.Building("factory")
	if r.difficulty == "hard" && !defensiveEconomy {
		// The shared factory site sits beside the barracks rally ground;
		// on this timeline the rig's own scout approach ends inside the
		// footprint edge and placement is rejected as occupied. Use the
		// empty ground west of the HQ instead, and pre-position the rig
		// clear of the footprint before placing the foundation.
		factoryPoint = sim.Vec{X: 14500, Y: 115500}
		clearPoint := sim.Vec{X: factoryPoint.X - 8000, Y: factoryPoint.Y}
		r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: clearPoint})
		r.wait("rig clear of factory footprint", 1200, func() bool {
			seen, ok := r.seen(rig[0])
			if !ok {
				return false
			}
			dx, dy := int64(seen.Position.X-clearPoint.X), int64(seen.Position.Y-clearPoint.Y)
			return dx*dx+dy*dy < 1500*1500
		})
	}
	r.wait("income funds the workshop", 6000, func() bool {
		// On hard, barracks queue charges land during the rig's scout
		// approach; keep a buffer so placement cannot bounce on credits.
		buffer := int64(0)
		if r.difficulty == "hard" {
			buffer = 1000000
		}
		return r.view().Economy.Credits >= workshop.Cost+buffer
	})
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
	// The recon (240 build ticks) queues behind the four rifles and AT squad
	// ordered above (1,100 ticks of barracks work), so the wait must cover
	// the remaining queue drain after the original observer falls.
	r.wait("paid replacement observer", 3600, func() bool {
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
		if stage == 2 && r.requiredOptional == "limited-salvage" {
			r.wait("collect real hostile wreck salvage before convoy extraction", 5000, func() bool {
				for _, objective := range r.view().Mission.Objectives {
					if objective.ID == "limited-salvage" {
						return objective.Progress >= 300000
					}
				}
				return false
			})
		}
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
	if r.faction == "SY" && r.difficulty != "easy" {
		// With the army committed to both crossings, the paid turret is
		// the home base's standing defense against the scripted columns.
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
	territoryExcluded := map[sim.ID]bool{}
	// SA normal previously received no tactical policy at all: after the
	// opening split it issued no production or defense orders for the
	// whole 22,000-tick wait and the garrison wiped the undefended base
	// (no-command-assets). SA easy passes without it and is left alone.
	if r.faction == "SY" || r.faction == "SA" && r.difficulty != "easy" {
		excluded := territoryExcluded
		for _, id := range r.tags["concealed-scout"] {
			excluded[id] = true
		}
		territoryAfter := func() {
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
		}
		if r.faction == "SY" && r.difficulty == "normal" {
			// The assault posture sends the whole army at the enemy base
			// on its first cycle, abandoning both authored regions before
			// the 3,600-tick continuous hold can accumulate (hold progress
			// stayed 0 while the base was ground down). Use the hard
			// route's expansion defense instead: stable assigned squads
			// screen both crossings outside the hold boundary with a
			// sentinel inside each region.
			r.tactical = r.withExpansionDefense(nil, excluded)
		} else {
			r.tactical = r.assaultPolicy(excluded, territoryAfter)
		}
	}
	if r.faction == "SY" && r.difficulty == "hard" {
		excluded := territoryExcluded
		for _, id := range r.tags["concealed-scout"] {
			excluded[id] = true
		}
		r.issue(1, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "SY.at"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "SY.at"})
		r.tactical = r.withExpansionDefense(nil, excluded)
	}
	if r.faction == "IR" {
		// Beyond the Basin can complete before the generic 500-tick
		// midpoint, which would leave only a terminal checkpoint. Fork
		// the real midpoint branch now, while the mission is running.
		r.checkpoint()
		r.advance(500)
	} else {
		r.advance(500)
		r.checkpoint()
	}
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

// Route choice is separate from the acceptance objective. Main Hard can use
// the same ordinary factory-first route; finish still enforces an optional
// award whenever requiredOptional requests it. Nothing clears that assertion.
func (r *authoredRun) factoryCaptureRoute() bool {
	return r.requiredOptional == "factory-captured" || r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard"
}

func (r *authoredRun) captureRelay(tag string, screen []sim.ID, gunner, engineer sim.ID, usedWorkers map[sim.ID]bool, cohort func() []sim.ID, borrow ...func(sim.Vec) (sim.ID, bool)) sim.ID {
	target := r.tags[tag][0]
	var point sim.Vec
	for _, actor := range r.definition.Initial {
		if actor.Tag == tag {
			point = sim.Vec(actor.Position)
		}
	}
	freeWorker := func() bool {
		if actor, ok := r.seen(engineer); ok && actor.Owner == 1 && !usedWorkers[engineer] {
			return true
		}
		for _, id := range r.ownedType(r.faction + ".engineer") {
			if !usedWorkers[id] {
				engineer = id
				return true
			}
		}
		if len(borrow) > 0 {
			if candidate, ok := borrow[0](point); ok {
				engineer = candidate
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
	ensureWorker := func() {
		if !freeWorker() {
			queueWorker()
			r.wait("paid replacement capture engineer", 2400, freeWorker)
		}
	}
	ensureWorker()
	var live []sim.ID
	for _, id := range screen {
		if entity, ok := r.seen(id); ok && entity.Owner == 1 {
			live = append(live, id)
		}
	}
	r.issue(1, sim.Order{Kind: "attack_move", Entities: live, Position: point}, sim.Order{Kind: "move", Entities: []sim.ID{engineer}, Position: sim.Vec{X: point.X - 7000, Y: point.Y + 7000}})
	previousFire := r.tactical
	fireNext := r.engine.Tick()
	if r.faction == "SA" || r.faction == "SY" && (r.difficulty != "easy" || tag == "capture-factory") {
		r.tactical = func() {
			previousFire()
			if r.engine.Tick() >= fireNext {
				fireNext = r.engine.Tick() + 200
				live = cohort()
				if len(live) > 0 {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: live, Position: point})
				}
				// The gunner tank shells the relay itself: infantry small
				// arms do 10% against structure and the cohort otherwise
				// spends the whole threshold window fighting guards while
				// the relay stays above capture health. Replace a lost
				// gunner from the cohort so shelling does not stall.
				// SY only: SA's heavier screen does not need it and the
				// earlier relay-2 timeline it produced starved sa-05
				// easy's relay-3 capture (engineer timeout tick 8244).
				if r.faction != "SY" {
					return
				}
				if _, alive := r.seen(gunner); !alive {
					closest := int64(1 << 62)
					for _, id := range cohort() {
						entity, ok := r.seen(id)
						if !ok || entity.Type != r.faction+".tank" {
							continue
						}
						dx, dy := int64(entity.Position.X-point.X), int64(entity.Position.Y-point.Y)
						if d := dx*dx + dy*dy; d < closest {
							closest, gunner = d, id
						}
					}
				}
				if _, alive := r.seen(gunner); alive {
					r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{gunner}, Target: target})
				}
				if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && tag == "relay-3" {
					// Focus armor first: the hard guard tank beside
					// relay-3 otherwise wins sequential duels against
					// the screen while the gunner shells the relay.
					var focus sim.ID
					focusRank, focusDist := 99, int64(1<<62)
					for _, enemy := range r.view().Entities {
						if enemy.Owner != 2 && enemy.Owner != 4 {
							continue
						}
						u, known := r.catalog.Unit(enemy.Type)
						if !known || u.Weapon == "" {
							continue
						}
						dx, dy := int64(enemy.Position.X-point.X), int64(enemy.Position.Y-point.Y)
						d := dx*dx + dy*dy
						if d >= 14000*14000 {
							continue
						}
						rank := 5
						switch {
						case strings.HasSuffix(enemy.Type, ".tank"):
							rank = 1
						case strings.HasSuffix(enemy.Type, ".at"):
							rank = 2
						case strings.HasSuffix(enemy.Type, ".apc"), strings.HasSuffix(enemy.Type, ".car"):
							rank = 3
						case strings.HasSuffix(enemy.Type, ".rifle"):
							rank = 4
						}
						if rank < focusRank || rank == focusRank && d < focusDist {
							focus, focusRank, focusDist = enemy.ID, rank, d
						}
					}
					{
						var shooters []sim.ID
						for _, id := range live {
							if id == gunner {
								continue
							}
							if e, ok := r.seen(id); ok && e.Type == "SY.at" {
								shooters = append(shooters, id)
							}
						}
						if len(shooters) > 0 {
							// Focus armor when present; otherwise AT
							// crews help shell the relay itself.
							goal := focus
							if goal == 0 {
								goal = target
							}
							r.tryIssue(sim.Order{Kind: "attack", Entities: shooters, Target: goal})
						}
					}
					// Every cohort tank shells the relay: one gunner
					// cannot reach the capture threshold before the
					// hard guard tank kills it (~520 ticks), but two
					// can, while AT crews focus that guard tank.
					for _, id := range live {
						if e, ok := r.seen(id); ok && (e.Type == "SY.tank" || e.Type == "SY.buggy") {
							r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
						}
					}
				}
			}
		}
	}
	r.wait("capture fire-control threshold", 6000, func() bool { entity, ok := r.seen(target); return ok && entity.Health < 400 })
	r.tactical = previousFire
	// Force-fire on already explored empty rear ground gives an explicit target
	// away from the fragile relay, including for vehicles that fire while moving.
	empty := sim.Vec{X: point.X - 14000, Y: point.Y + 14000}
	southHold := r.faction == "SY" && r.difficulty == "hard" && tag == "relay-2"
	if southHold {
		// Hold south, on the US.at approach, not NW: same post as the
		// post-capture screen move below. The screen must actually
		// move there (force_fire would leave it stranded west).
		empty = sim.Vec{X: point.X, Y: point.Y - 5000}
	}
	var stop []sim.Order
	for _, id := range live {
		if _, ok := r.seen(id); ok {
			if southHold {
				stop = append(stop, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: empty})
				continue
			}
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
	if _, visible := r.seen(target); !visible || r.factoryCaptureRoute() {
		ensureWorker()
		r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{engineer}, Position: sim.Vec{X: point.X - 3500, Y: point.Y + 3500}})
		r.wait("engineer observes objective before quarter-health fire control", 1800, func() bool { _, visible := r.seen(target); return visible })
	}
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
			if _, visible := r.seen(target); !visible {
				if !freeWorker() {
					queueWorker()
					return
				}
				worker, _ := r.seen(engineer)
				orders := worker.Private.Orders
				post := sim.Vec{X: point.X - 3500, Y: point.Y + 3500}
				if len(orders) == 0 || orders[0].Kind != "move" || orders[0].Position != post {
					r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{engineer}, Position: post})
				}
			}
			if _, ok := r.seen(gunner); !ok {
				closest := int64(1 << 62)
				eligible := map[sim.ID]bool{}
				for _, id := range cohort() {
					eligible[id] = true
				}
				for _, e := range r.view().Entities {
					// SY normal: never steal a reserved relay-guard tank
					// as the relief gunner — the guard loop countermands
					// it back to its post every cycle and the tank
					// flip-flops idle while the capture stalls.
					cohortOnly := r.factoryCaptureRoute() || r.faction == "SY" && r.difficulty == "normal"
					if e.Owner == 1 && e.Type == r.faction+".tank" && (!cohortOnly || eligible[e.ID]) {
						dx, dy := int64(e.Position.X-point.X), int64(e.Position.Y-point.Y)
						if d := dx*dx + dy*dy; d < closest {
							closest, gunner = d, e.ID
						}
					}
				}
			}
			if _, alive := r.seen(gunner); !alive && len(borrow) > 1 {
				if candidate, ok := borrow[1](point); ok {
					gunner = candidate
				}
			}
			r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{gunner}, Target: target})
		}
		r.wait("ordinary quarter-health capture threshold", 2400, func() bool { entity, ok := r.seen(target); return ok && entity.Health < 240 })
		r.tactical = previous
		if !r.tryIssue(sim.Order{Kind: "force_fire", Entities: []sim.ID{gunner}, Position: empty}) && r.factoryCaptureRoute() {
			// Infantry AT cannot force-fire; an ordinary rear Move stops its
			// aimed fire while the engineer executes the real capture channel.
			r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{gunner}, Position: empty})
		}
	}
	// SY normal also needs the perimeter: without it the screen stands
	// disarmed on force-fire orders during the capture channel and the
	// first captured relay is destroyed behind it (tick 8611).
	if r.factoryCaptureRoute() || r.faction == "SY" && r.difficulty == "normal" || r.requiredOptional == "scout-preserved" {
		previousPerimeter := r.tactical
		defer func() { r.tactical = previousPerimeter }()
		perimeterThreats := func() []sim.EntityView {
			var threats []sim.EntityView
			for _, enemy := range r.view().Entities {
				if enemy.Owner != 2 && enemy.Owner != 4 {
					continue
				}
				u, known := r.catalog.Unit(enemy.Type)
				if !known || u.Weapon == "" {
					continue
				}
				dx, dy := int64(enemy.Position.X-point.X), int64(enemy.Position.Y-point.Y)
				radius := int64(14000)
				if r.faction == "SY" && r.difficulty == "hard" && tag == "relay-2" {
					radius = 9000
				}
				if dx*dx+dy*dy <= radius*radius {
					threats = append(threats, enemy)
				}
			}
			return threats
		}
		perimeterNext := r.engine.Tick()
		r.tactical = func() {
			if previousPerimeter != nil {
				previousPerimeter()
			}
			if r.engine.Tick() < perimeterNext {
				return
			}
			perimeterNext = r.engine.Tick() + 60
			threats := perimeterThreats()
			actors := append(cohort(), r.ownedType(r.faction+".aa")...)
			for _, id := range actors {
				actor, alive := r.seen(id)
				if !alive || actor.Private == nil {
					continue
				}
				var target sim.ID
				closest := int64(1 << 62)
				for _, enemy := range threats {
					preview, _ := r.engine.PreviewOrders(1, []sim.Order{{Kind: "attack", Entities: []sim.ID{id}, Target: enemy.ID}})
					if len(preview) != 1 || !preview[0].Accepted {
						continue
					}
					dx, dy := int64(actor.Position.X-enemy.Position.X), int64(actor.Position.Y-enemy.Position.Y)
					if d := dx*dx + dy*dy; d < closest {
						target, closest = enemy.ID, d
					}
				}
				if target != 0 && (len(actor.Private.Orders) == 0 || actor.Private.Orders[0].Kind != "attack" || actor.Private.Orders[0].Target != target) {
					// Keep fire off the fragile unowned relay when that hostile
					// dies: queue a real explored-ground fire intention behind it.
					if r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target}) {
						if !r.tryIssue(sim.Order{Kind: "force_fire", Entities: []sim.ID{id}, Position: empty, Queued: true}) {
							r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: empty, Queued: true})
						}
					}
				} else if target == 0 {
					orders := actor.Private.Orders
					if len(orders) > 0 && (orders[0].Kind == "move" || orders[0].Kind == "force_fire") && orders[0].Position == empty {
						continue
					}
					if southHold {
						r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: empty})
					} else if !r.tryIssue(sim.Order{Kind: "force_fire", Entities: []sim.ID{id}, Position: empty}) {
						r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: empty})
					}
				}
			}
		}
		r.wait("clear observed armed threats before optional-route capture", 6000, func() bool { return len(perimeterThreats()) == 0 })
	}
	ensureWorker()
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
	preserveCaptureForce := r.difficulty == "hard" && (r.faction == "SA" || r.faction == "SY" && r.factoryCaptureRoute()) || r.faction == "SY" && r.difficulty == "normal"
	// SA easy was excluded: its captured relay-2 guard attrited to zero
	// and enemy AT fire destroyed the relay at tick 9454 while the main
	// force worked on relay-3. SA normal passes without it, left alone.
	reinforceCaptured := r.difficulty == "hard" && (r.faction == "SY" || r.faction == "SA") || r.faction == "SY" && (r.difficulty == "normal" || r.factoryCaptureRoute()) || r.faction == "SA" && r.difficulty == "easy"
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "rally", Entities: r.ids("home-factory"), Position: sim.Vec{X: 35500, Y: 94500}}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: sim.Vec{X: 35500, Y: 94500}})
	if r.faction == "SY" && r.difficulty != "easy" {
		// One starting hauler against the garrison's two loses the
		// production race before relay-2; the 8M opening bank funds two
		// more haulers immediately.
		r.issue(1, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "SY.hauler"}, sim.Order{Kind: "train", Entities: r.ids("home-supply"), Type: "SY.hauler"})
	}
	if r.difficulty == "hard" && r.faction == "SA" || r.faction == "SY" && r.difficulty == "normal" {
		built := false
		for _, point := range []sim.Vec{{X: 21500, Y: 96500}, {X: 20500, Y: 97500}, {X: 21500, Y: 98500}, {X: 28500, Y: 100500}} {
			if r.tryIssue(sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: point}) {
				built = true
				break
			}
		}
		if !built {
			r.wait("legal paid field-defense turret site", 0, func() bool { return false })
		}
	}
	next := r.engine.Tick()
	rally := sim.Vec{X: 35500, Y: 94500}
	reserve := map[sim.ID]bool{}
	var homeGuards []sim.ID
	var homeEngineer sim.ID
	originalRifles := map[sim.ID]bool{}
	for _, id := range r.tags["starting-rifles"] {
		originalRifles[id] = true
	}
	forwardConstruction := false
	var forwardReserve int64
	usedWorkers := map[sim.ID]bool{}
	guards := map[sim.ID][]sim.ID{}
	guardCommitted := map[sim.ID]bool{}
	repairers := map[sim.ID]sim.ID{}
	guardNext := r.engine.Tick()
	var factoryTurretUntil sim.Tick
	var factoryTurretReserve int64
	factoryTurretDone := false
	r.tactical = func() {

		if r.engine.Tick() >= guardNext {
			guardNext = r.engine.Tick() + 100
			if factoryTurretUntil > 0 && !factoryTurretDone {
				rig := r.ownedType("SY.rig")
				building, known := r.catalog.Building("turret")
				if r.engine.Tick() >= factoryTurretUntil || len(rig) == 0 {
					factoryTurretDone, factoryTurretReserve = true, 0
					r.t.Logf("funded optional turret abandoned tick%d credits%d builders%d", r.engine.Tick(), r.view().Economy.Credits, len(rig))
				} else if known && r.view().Economy.Credits >= building.Cost {
					for _, point := range authoredExpansionSites(sim.Vec{X: 53500, Y: 85500}) {
						if !r.visibleFoundationLooksClear("turret", point) {
							continue
						}
						if r.tryIssue(sim.Order{Kind: "build", Entities: rig[:1], Type: "turret", Position: point}) {
							factoryTurretDone, factoryTurretReserve = true, 0
							r.t.Logf("funded optional turret accepted tick%d point%v builder%d", r.engine.Tick(), point, rig[0])
							break
						}
					}
				}
			}
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
				// Income is capped by one loader per field, not by the
				// number of haulers sharing it. Send the two trained
				// haulers to field 2 beside relay-1; the originals keep
				// field 1 saturated. No construction or rig exposure.
				homeHaulers := map[sim.ID]bool{}
				for _, id := range r.tags["home-haulers"] {
					homeHaulers[id] = true
				}
				for _, id := range r.ownedType("SY.hauler") {
					if homeHaulers[id] {
						continue
					}
					actor, alive := r.seen(id)
					if !alive || actor.Owner != 1 || actor.Private == nil {
						continue
					}
					if actor.Private.PinnedField != 2 {
						r.tryIssue(sim.Order{Kind: "gather", Entities: []sim.ID{id}, Target: 2})
					}
					if !actor.Private.RetreatWhenAttacked {
						r.tryIssue(sim.Order{Kind: "retreat_when_attacked", Entities: []sim.ID{id}, Index: 1})
					}
				}
			}
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && len(r.tags["relay-2"]) > 0 && len(r.tags["relay-1"]) > 0 && r.engine.Tick() >= 8550 {
				// Relay-1 is quiet late while relay-2's roster
				// attrits; transfer two surplus relay-1 guards
				// east once the relay-3 screen has dispatched.
				relay1ID, relay2ID := r.tags["relay-1"][0], r.tags["relay-2"][0]
				relay1, ok1 := r.seen(relay1ID)
				relay2, ok2 := r.seen(relay2ID)
				if ok1 && ok2 && relay1.Owner == 1 && relay2.Owner == 1 {
					alive2 := 0
					for _, id := range guards[relay2ID] {
						if _, ok := r.seen(id); ok {
							alive2++
						}
					}
					if alive2 < 5 {
						moved := 0
						kept := guards[relay1ID][:0]
						for _, id := range guards[relay1ID] {
							actor, alive := r.seen(id)
							if alive && moved < 2 && alive2 < 5 && (actor.Type == "SY.rifle" || actor.Type == "SY.at") {
								guards[relay2ID] = append(guards[relay2ID], id)
								moved++
								alive2++
								continue
							}
							kept = append(kept, id)
						}
						guards[relay1ID] = kept
					}
				}
			}

			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
				// Captured relays are left near death (the capture
				// threshold); idle capture engineers restore them
				// during lulls so a later column cannot one-shot
				// the objective through its guards.
				for _, tag := range []string{"relay-1", "relay-2"} {
					// Relay-1's engineers are busy with the factory
					// capture until it is owned.
					if tag == "relay-1" {
						factoryOwned := false
						if len(r.tags["optional-factory"]) > 0 {
							if f, ok := r.seen(r.tags["optional-factory"][0]); ok && f.Owner == 1 {
								factoryOwned = true
							}
						}
						if !factoryOwned {
							continue
						}
					}
					if len(r.tags[tag]) == 0 {
						continue
					}
					relay, ok := r.seen(r.tags[tag][0])
					if !ok || relay.Owner != 1 || relay.Health >= 990 {
						continue
					}
					best, bestDist := sim.ID(0), int64(1<<62)
					for _, id := range r.ownedType("SY.engineer") {
						actor, alive := r.seen(id)
						if !alive || actor.Private == nil || len(actor.Private.Orders) > 0 {
							continue
						}
						dx, dy := int64(actor.Position.X-relay.Position.X), int64(actor.Position.Y-relay.Position.Y)
						d := dx*dx + dy*dy
						if d < bestDist {
							best, bestDist = id, d
						}
					}
					if best != 0 && bestDist < 25000*25000 {
						r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{best}, Target: relay.ID})
					}
				}
			}

			// SY normal previously had no home guard at all: its supply
			// center was destroyed (haulers stranded, factory left at
			// prerequisite_lost) while the cohort worked the relays.
			if r.difficulty == "hard" && (r.faction == "SY" || r.faction == "SA") || r.faction == "SY" && r.difficulty == "normal" {
				var living []sim.ID
				for _, id := range homeGuards {
					if actor, ok := r.seen(id); ok && actor.Owner == 1 {
						living = append(living, id)
					}
				}
				homeGuards = living
				homeGuardLimit := 2
				if r.faction == "SY" && r.difficulty == "hard" {
					// Two rifles left the hard HQ at 209 permille health;
					// a third paid rifle holds the northern approach.
					homeGuardLimit = 3
				}
				for _, id := range r.ownedType(r.faction + ".rifle") {
					if len(homeGuards) >= homeGuardLimit {
						break
					}
					actor, alive := r.seen(id)
					if !alive || actor.Owner != 1 || actor.Private == nil {
						continue
					}
					if !reserve[id] && !originalRifles[id] {
						reserve[id] = true
						homeGuards = append(homeGuards, id)
					}
				}
				for _, id := range homeGuards {
					actor, alive := r.seen(id)
					if !alive || actor.Owner != 1 || actor.Private == nil {
						continue
					}
					orders := actor.Private.Orders
					post := sim.Vec{X: 21500, Y: 93500}
					if len(orders) == 0 || orders[0].Kind != "attack_move" || orders[0].Position != post {
						r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: post})
					}
				}
				var damaged sim.ID
				for _, tag := range []string{"home-supply", "home-hq", "home-factory"} {
					if len(r.tags[tag]) == 0 {
						continue
					}
					if site, ok := r.seen(r.tags[tag][0]); ok && site.Owner == 1 && site.Health < 950 {
						damaged = site.ID
						break
					}
				}
				if damaged != 0 {
					if worker, alive := r.seen(homeEngineer); !alive || worker.Owner != 1 {
						for _, id := range r.ownedType(r.faction + ".engineer") {
							worker, _ := r.seen(id)
							if usedWorkers[id] || worker.Private == nil || len(worker.Private.Orders) > 0 {
								continue
							}
							homeEngineer = id
							usedWorkers[id] = true
							break
						}
					}
					if worker, alive := r.seen(homeEngineer); alive && worker.Owner == 1 && worker.Private != nil {
						orders := worker.Private.Orders
						if len(orders) == 0 || orders[0].Kind != "repair" || orders[0].Target != damaged {
							r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{homeEngineer}, Target: damaged})
						}
					}
				}
			}
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
				liveGuards := 0
				for _, id := range guards[siteID] {
					if actor, alive := r.seen(id); alive && actor.Owner == 1 {
						liveGuards++
					}
				}
				// During the factory capture the cohort is reserved, but a
				// captured relay whose guard has attrited below three still
				// gets emergency replenishment: relay-1 was destroyed by a
				// tank at tick 3840 with its guard gone while this gate
				// withheld all replacements.
				if guardCommitted[siteID] && reinforceCaptured && (!r.factoryCaptureRoute() || r.hasTag("capture-factory") && siteID != r.tags["capture-factory"][0] || liveGuards < 3) {
					// Replenish losses at already captured required sites through
					// ordinary paid troops, without commandeering another site's screen.
					counts := map[string]int{}
					for _, id := range guards[siteID] {
						if actor, alive := r.seen(id); alive && actor.Owner == 1 {
							counts[actor.Type]++
						}
					}
					guardRifles := 4
					guardATs := 1
					if r.faction == "SY" {
						// SY rifles are the cheapest, most fragile line
						// infantry (250k HP vs the US garrison's 300k);
						// four-rifle relay guards lose straight trades.
						guardRifles = 6
						if r.difficulty != "easy" {
							guardATs = 2
						}
						if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && len(r.tags["relay-2"]) > 0 && siteID == r.tags["relay-2"][0] {
							guardATs = 4
						}
					}
					guardTanks := 1
					for _, role := range []struct {
						kind  string
						count int
					}{{"rifle", guardRifles}, {"tank", guardTanks}, {"at", guardATs}} {
						kind := r.faction + "." + role.kind
						for _, id := range r.ownedType(kind) {
							if counts[kind] >= role.count {
								break
							}
							if reserve[id] {
								continue
							}
							guardedElsewhere := false
							for otherSite, otherGuards := range guards {
								if otherSite == siteID {
									continue
								}
								for _, otherID := range otherGuards {
									if otherID == id {
										guardedElsewhere = true
									}
								}
							}
							if guardedElsewhere {
								continue
							}
							if preserveCaptureForce && role.kind == "tank" {
								_, freeTanks := authoredCaptureForce(r.view(), reserve, r.faction)
								if len(freeTanks) <= 1 {
									continue // Keep a completed free tank for the next real capture.
								}
							}
							reserve[id] = true
							guards[siteID] = append(guards[siteID], id)
							counts[kind]++
						}
					}
				}
				if worker, alive := r.seen(repairers[siteID]); !alive || worker.Owner != 1 {
					var replacement sim.ID
					closest := int64(1 << 62)
					for _, id := range r.ownedType(r.faction + ".engineer") {
						candidate, _ := r.seen(id)
						if usedWorkers[id] || candidate.Private == nil || len(candidate.Private.Orders) > 0 {
							continue
						}
						dx, dy := int64(candidate.Position.X-site.Position.X), int64(candidate.Position.Y-site.Position.Y)
						if d := dx*dx + dy*dy; d < closest {
							replacement, closest = id, d
						}
					}
					if replacement != 0 {
						usedWorkers[replacement] = true
						repairers[siteID] = replacement
					}
				}
				if worker, alive := r.seen(repairers[siteID]); alive && site.Health < 990 {
					repairing := worker.Private != nil && len(worker.Private.Orders) > 0 && worker.Private.Orders[0].Kind == "repair"
					if !repairing {
						r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{worker.ID}, Target: siteID})
					}
				}
				if r.faction == "SY" && r.difficulty == "hard" && r.factoryCaptureRoute() {
					if r.definition.ID == "sy-05-relay-break" && len(r.tags["relay-2"]) > 0 && siteID == r.tags["relay-2"][0] {
						// Forward posts: an enemy tank/AT halted at its
						// 7000 firing line from the relay is outside a
						// relay-anchored guard's 6000 leash, so AT crews
						// guard forward anchors that put that firing
						// line inside their own leash and range. Rifles
						// screen in front and only sortie vs AT crews.
						var rifleThreat sim.ID
						closestThreat := int64(8000 * 8000)
						for _, enemy := range r.view().Entities {
							if enemy.Owner != 2 && enemy.Owner != 4 {
								continue
							}
							u, known := r.catalog.Unit(enemy.Type)
							if !known || u.Weapon != "AT" {
								continue
							}
							dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
							if d := dx*dx + dy*dy; d < closestThreat {
								rifleThreat, closestThreat = enemy.ID, d
							}
						}
						atPosts := []sim.Vec{{X: 85500, Y: 60000}, {X: 83000, Y: 61000}, {X: 90500, Y: 63000}, {X: 85500, Y: 60000}}
						riflePosts := []sim.Vec{{X: 83500, Y: 62000}, {X: 87500, Y: 62000}}
						atIndex, rifleIndex := 0, 0
						for _, id := range guards[siteID] {
							actor, alive := r.seen(id)
							if !alive || actor.Owner != 1 || actor.Private == nil {
								continue
							}
							orders := actor.Private.Orders
							order := sim.Order{Kind: "guard", Entities: []sim.ID{id}, Target: siteID}
							{
								switch actor.Type {
								case "SY.at":
									order = sim.Order{Kind: "guard", Entities: []sim.ID{id}, Position: atPosts[atIndex%len(atPosts)]}
									atIndex++
								case "SY.tank":
									order = sim.Order{Kind: "guard", Entities: []sim.ID{id}, Position: sim.Vec{X: 88500, Y: 60500}}
								case "SY.rifle":
									post := riflePosts[rifleIndex%len(riflePosts)]
									rifleIndex++
									if rifleThreat != 0 {
										order = sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: rifleThreat}
									} else {
										order = sim.Order{Kind: "guard", Entities: []sim.ID{id}, Position: post}
									}
								}
							}
							if len(orders) == 0 || orders[0].Kind != order.Kind || orders[0].Target != order.Target || orders[0].Position != order.Position {
								r.tryIssue(order)
							}
						}
						continue
					}
					// Let ordinary Guard enforce its actual anchor leash instead of
					// repeatedly chasing distant threats with Attack Move/Attack.
					for _, id := range guards[siteID] {
						actor, alive := r.seen(id)
						if !alive || actor.Owner != 1 || actor.Private == nil {
							continue
						}
						orders := actor.Private.Orders
						order := sim.Order{Kind: "guard", Entities: []sim.ID{id}, Target: siteID}
						if actor.Type == "SY.rifle" || actor.Type == "SY.tank" && len(r.tags["relay-2"]) > 0 && siteID == r.tags["relay-2"][0] {
							// A captured relay sits at capture-threshold health
							// and cannot be repaired while under fire, so a
							// passive screen offset (outside rifle range of
							// the siege squads) lets AT fire finish it.
							// Attack the nearest structure-killing threat
							// directly; AT squads outrank other armed units.
							var threat, threatAT *sim.EntityView
							closest, closestAT := int64(12000*12000), int64(12000*12000)
							for _, enemy := range r.view().Entities {
								if enemy.Owner != 2 && enemy.Owner != 4 {
									continue
								}
								u, known := r.catalog.Unit(enemy.Type)
								if !known || u.Weapon == "" {
									continue
								}
								dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
								d := dx*dx + dy*dy
								if u.Weapon == "AT" && d < closestAT {
									copy := enemy
									threatAT, closestAT = &copy, d
								}
								if d < closest {
									copy := enemy
									threat, closest = &copy, d
								}
							}
							if threatAT != nil {
								threat = threatAT
							}
							if actor.Type == "SY.tank" && len(r.tags["relay-2"]) > 0 && siteID == r.tags["relay-2"][0] && actor.Position.Y > site.Position.Y-2000 {
								// Reach the south screen post first;
								// focus-attack only from south of the relay.
								order = sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: sim.Vec{X: site.Position.X, Y: site.Position.Y - 9000}}
							} else if threat != nil {
								order = sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: threat.ID}
							} else if actor.Type == "SY.tank" && len(r.tags["relay-2"]) > 0 && siteID == r.tags["relay-2"][0] {
								// Screen south of relay-2 as the nearest
								// armored target: diverting AT/tank fire
								// opens the quiet window repair needs.
								order = sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: sim.Vec{X: site.Position.X, Y: site.Position.Y - 9000}}
							}
						}
						if len(orders) == 0 || orders[0].Kind != order.Kind || orders[0].Target != order.Target || orders[0].Position != order.Position {
							r.tryIssue(order)
						}
					}
					continue
				}
				point := sim.Vec{X: site.Position.X - 1000, Y: site.Position.Y + 2500}
				if r.requiredOptional == "factory-captured" && r.difficulty == "easy" && len(r.tags["relay-1"]) > 0 && siteID == r.tags["relay-1"][0] && !r.hasTag("capture-factory") {
					// Hold north until the factory is captured (see
					// stage-1 assignment below).
					point = sim.Vec{X: site.Position.X - 1000, Y: site.Position.Y - 6500}
				}
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

		if factoryTurretReserve > 0 && !authoredCaptureConstructionCanSpend(r.view(), factoryTurretReserve) {
			return // Ordinary spending intention only; existing paid work continues.
		}
		if forwardConstruction && (!r.factoryCaptureRoute() || !authoredCaptureConstructionCanSpend(r.view(), forwardReserve)) {
			return
		}

		if r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 600
		if factory := r.ownedType("factory"); len(factory) > 0 {
			if r.factoryCaptureRoute() && r.hasTag("capture-factory") {
				// Only produce at the forward factory once it is
				// actually owned; before capture those train/rally
				// orders are rejected and the home factory idles.
				if captured := r.ids("capture-factory"); len(captured) > 0 {
					if e, ok := r.seen(captured[0]); ok && e.Owner == 1 {
						factory = captured
					}
				}
			}
			r.tryIssue(sim.Order{Kind: "rally", Entities: factory[:1], Position: rally})
			if r.faction == "SY" || r.faction == "SA" && r.difficulty == "hard" {
				// AA-first plus two unconditional tanks per cycle bloated
				// the factory queue with unpaid jobs (factory observed in
				// insufficient_credits while captured relays went
				// undefended). Armor first, capped, keeps a paid tank
				// stream the two-hauler economy can actually fund. Never
				// queue a job the current treasury cannot pay for: an
				// unpaid 1.25M tank at the head of the factory queue
				// stalled all vehicle production (zero tanks owned with
				// 1.18M credits on hand) while the screen attrited away.
				affordable := func(kind string) bool {
					unit, ok := r.catalog.Unit(kind)
					return ok && r.view().Economy.Credits >= unit.Cost
				}
				tankCap := 6
				if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
					// Only the two relay guard tanks plus the capture
					// gunner (and one spare after relay-2) are consumed;
					// extra SY tanks lose to US armor and starve the
					// barracks through committed-credit accounting.
					tankCap = 3
					if ids := r.tags["relay-2"]; len(ids) > 0 {
						if site, ok := r.seen(ids[0]); ok && site.Owner == 1 {
							tankCap = 6
						}
					}
				}
				for range 2 {
					if r.scheduledType(r.faction+".tank") < tankCap && affordable(r.faction+".tank") {
						r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".tank"})
					}
				}
				if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
					// Fast anti-armor escorts for the relay-3 push: the
					// buggy outruns the cohort and survives cannon fire
					// far better than AT infantry. Build them on both
					// factories once relay-2 is owned.
					if ids := r.tags["relay-2"]; len(ids) > 0 {
						if site, ok := r.seen(ids[0]); ok && site.Owner == 1 {
							for _, producer := range r.ownedType("factory") {
								if r.scheduledType("SY.buggy") >= 3 {
									break
								}
								if affordable("SY.buggy") {
									r.tryIssue(sim.Order{Kind: "train", Entities: []sim.ID{producer}, Type: "SY.buggy"})
								}
							}
						}
					}
				}
				// SY hard is a ground-only relay fight: discretionary AA
				// must leave two rifle costs in the treasury so captured
				// relay guards can actually be replenished next cycle.
				aaReserve := int64(0)
				if r.faction == "SY" && r.difficulty == "hard" {
					aaReserve = 500000
				}
				if !(r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard") && r.scheduledType(r.faction+".aa") < 3 && affordable(r.faction+".aa") && r.view().Economy.Credits >= 750000+aaReserve {
					r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".aa"})
				}
			} else {
				if r.scheduledType(r.faction+".aa") < 3 {
					r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".aa"})
				}
				for range 2 {
					r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".tank"})
				}
			}
		}
		if aa := r.ownedType(r.faction + ".aa"); len(aa) > 0 {
			if r.hasTag("relay-1") && len(aa) > 1 {
				cover := sim.Vec{X: 50500, Y: 81500}
				if r.factoryCaptureRoute() {
					cover.Y = 85500
				}
				r.tryIssue(sim.Order{Kind: "move", Entities: aa[:1], Position: cover})
				aa = aa[1:]
			}
			aaPoint := rally
			if aaPoint.X == 71500 {
				aaPoint = sim.Vec{X: 82500, Y: 68500}
			}
			r.tryIssue(sim.Order{Kind: "move", Entities: aa, Position: aaPoint})
		}
		if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
			if buggies := r.ownedType("SY.buggy"); len(buggies) > 0 {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: buggies, Position: rally})
			}
		}
		if barracks := r.ownedType("barracks"); len(barracks) > 0 {
			r.tryIssue(sim.Order{Kind: "rally", Entities: barracks[:1], Position: rally})
			// SY hard: unpaid jobs stall the producer queue head-of-line
			// (AT count sat at zero for 2400 ticks behind unaffordable
			// queued work while credits hovered under an AT crew's
			// 450k). Only queue what the treasury can pay for now.
			syHardAfford := func(kind string) bool {
				if r.faction != "SY" || r.difficulty != "hard" {
					return true
				}
				unit, ok := r.catalog.Unit(kind)
				if !ok {
					return false
				}
				// Count credits already committed to queued unstarted
				// jobs: checking the raw treasury per order let a whole
				// cycle of orders pass on the same credits and stall
				// the queue head unpaid.
				guardShortage := false
				for _, ids := range guards {
					if len(ids) == 0 {
						continue
					}
					live := 0
					for _, id := range ids {
						if actor, ok := r.seen(id); ok && actor.Owner == 1 {
							live++
						}
					}
					if live < 6 {
						guardShortage = true
					}
				}
				relay2RifleShortage := false
				if len(r.tags["relay-2"]) > 0 {
					if site, ok := r.seen(r.tags["relay-2"][0]); ok && site.Owner == 1 && site.Health < 850 {
						rifles := 0
						for _, id := range guards[site.ID] {
							if actor, ok := r.seen(id); ok && actor.Owner == 1 && actor.Type == r.faction+".rifle" {
								rifles++
							}
						}
						relay2RifleShortage = rifles < 6
					}
				}
				committed := int64(0)
				for _, e := range r.view().Entities {
					if e.Owner != 1 || e.Private == nil {
						continue
					}
					for _, job := range e.Private.Jobs {
						// Factory armor is discretionary while a relay
						// guard is under strength: unstarted AA/tank jobs
						// must not veto the barracks rifles that create
						// the repair window (barracks jobs pay first).
						if job.Started || job.Research || guardShortage && job.Type == r.faction+".aa" || relay2RifleShortage && job.Type == r.faction+".tank" {
							continue
						}
						if queued, known := r.catalog.Unit(job.Type); known {
							committed += queued.Cost
						}
					}
				}
				return r.view().Economy.Credits-committed >= unit.Cost
			}
			if r.scheduledType(r.faction+".engineer") < 4 && syHardAfford(r.faction+".engineer") {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".engineer"})
			}
			if reinforceCaptured && (!r.factoryCaptureRoute() || r.hasTag("capture-factory")) && r.scheduledType(r.faction+".at") < 4 && syHardAfford(r.faction+".at") {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".at"})
			}
			rifleCap := 16
			if r.faction == "SY" {
				// Six-rifle guards on two captured relays plus the
				// advancing cohort need a larger paid rifle pool.
				rifleCap = 22
			}
			if r.faction == "SY" && r.difficulty == "normal" {
				// US armor counterattacks decide this route: a SY rifle
				// deals 120/tick to heavy armor while a SY AT crew deals
				// 2333/tick, and SY tanks lose 1v1 to US tanks. But AT
				// crews deal zero to infantry, so they supplement the
				// rifle line instead of replacing it (an AT-first queue
				// left one rifle alive and relay-1 dead at tick 3775).
				rifleCap = 20
			}
			// Stage 3 lives or dies on its single gunner tank: once
			// relay-2 is held and fewer than two tanks exist, infantry
			// spending pauses so the treasury can reach the 1.25M a
			// replacement tank costs (credits otherwise plateau near
			// 1.0M and the factory affordability check never passes).
			fundTank := false
			if r.faction == "SY" && r.difficulty == "normal" && r.scheduledType(r.faction+".tank") < 2 {
				if ids := r.tags["relay-2"]; len(ids) > 0 {
					if e, ok := r.seen(ids[0]); ok && e.Owner == 1 {
						fundTank = true
					}
				}
			}
			rifleOrders := 3
			relay2Owned := false
			if ids := r.tags["relay-2"]; len(ids) > 0 {
				if e, ok := r.seen(ids[0]); ok && e.Owner == 1 {
					relay2Owned = true
				}
			}
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && relay2Owned {
				rifleOrders = 4
			}
			if r.faction == "SY" && r.difficulty == "hard" && !(r.definition.ID == "sy-05-relay-break" && relay2Owned) && r.engine.Tick() >= 6000 {
				// Keep the barracks queue shallow late: replacement
				// capture engineers must not wait behind a full
				// three-rifle batch while relay-2 is being taken.
				rifleOrders = 1
			}
			for range rifleOrders {
				// Garrisons keep first claim on the rifle pool: two
				// 6-rifle relay guards plus a small screen must stay
				// replaceable even while saving for the tank (a full
				// infantry pause let relay-2's guard attrit away and
				// the relay died at tick 13701).
				guardFloor := fundTank && r.scheduledType(r.faction+".rifle") >= 14
				if !guardFloor && r.scheduledType(r.faction+".rifle") < rifleCap && syHardAfford(r.faction+".rifle") {
					r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".rifle"})
				}
			}
			if !fundTank && r.faction == "SY" && r.difficulty == "normal" && r.scheduledType(r.faction+".at") < 10 {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".at"})
			}
			if r.faction == "SY" && r.difficulty == "hard" && r.scheduledType(r.faction+".at") < 8 && syHardAfford(r.faction+".at") {
				// Same armor math as normal: AT crews are the only
				// cost-effective answer to US tanks on this route.
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".at"})
			}
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && relay2Owned && r.scheduledType(r.faction+".at") < 8 && syHardAfford(r.faction+".at") {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: r.faction + ".at"})
			}
		}
	}
	r.tactical()
	cohort := func() []sim.ID {
		if preserveCaptureForce {
			ids, _ := authoredCaptureForce(r.view(), reserve, r.faction)
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
				// Buggies are paid anti-armor escorts on this route;
				// fold them into the screen instead of leaving them
				// idle at the factory rally.
				for _, entity := range r.view().Entities {
					if entity.Owner == 1 && !reserve[entity.ID] && entity.Type == "SY.buggy" && entity.Complete && entity.Enabled {
						ids = append(ids, entity.ID)
					}
				}
			}
			return ids
		}
		var ids []sim.ID
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && !reserve[entity.ID] && (entity.Type == r.faction+".rifle" || entity.Type == r.faction+".at" || entity.Type == r.faction+".tank") {
				ids = append(ids, entity.ID)
			}
		}
		return ids
	}
	clearGuards := func(tag string) {
		acquisitionDeadline := r.engine.Tick() + 6000
		captureReady := func() bool {
			ids, tanks := authoredCaptureForce(r.view(), reserve, r.faction)
			if r.faction == "SY" && r.difficulty == "normal" && tag == "relay-guard-2" {
				// A three-unit screen died on the road to relay-2 while
				// relay-1's reserved guards bled out behind it (credits
				// cratered to 83k, zero tanks left by tick 4329, relay-1
				// destroyed at 4538). Mass at the relay-1 rally first:
				// the assembling cohort is itself relay-1's defense
				// until it is strong enough to take and hold relay-2.
				return len(ids) >= 8 && len(tanks) >= 2
			}
			if r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && tag == "relay-guard-3" {
				ats := 0
				for _, id := range ids {
					if e, ok := r.seen(id); ok && e.Type == "SY.at" {
						ats++
					}
				}
				return len(ids) >= 6 && len(tanks) >= 1 && ats >= 2
			}
			if r.faction == "SY" && r.difficulty == "normal" && tag == "relay-guard-3" {
				// Two reserved relay garrisons cap the free pool, so
				// stage 3 masses a smaller but still real cohort; the
				// stage-2 bar left a permanent 2-unit cohort that never
				// dispatched (acquire timeout at tick 15553).
				return len(ids) >= 5 && len(tanks) >= 1
			}
			return len(ids) >= 3 && len(tanks) > 0
		}
		var point sim.Vec
		for _, actor := range r.definition.Initial {
			if actor.Tag == tag {
				point = sim.Vec(actor.Position)
			}
		}
		// Move, never attack-move, toward a relay guard: an attack-moving
		// screen auto-engages the fragile owner-4 relay beside the guard
		// and destroys the capture target before fire control begins
		// (us-03 normal/hard lost relay-1 at tick 650 this way). Guards
		// are then killed with explicit attack orders below.
		approach := "move"
		waitingForRelief := len(cohort()) == 0 || preserveCaptureForce && !captureReady()
		dispatched := false
		dispatch := func() {
			if dispatched || r.engine.Outcome().Finished {
				return
			}
			live := cohort()
			if len(live) == 0 {
				return
			}
			if waitingForRelief {
				// No current eligible force: let the existing paid production
				// supply a real relief screen and the tank needed for capture.
				// This runs inside the unchanged acquisition deadline below.
				hasTank := false
				for _, id := range live {
					actor, ok := r.seen(id)
					hasTank = hasTank || ok && actor.Type == r.faction+".tank"
				}
				if !hasTank && r.faction == "SY" && r.difficulty == "normal" && tag == "relay-guard-3" && len(r.ownedType("factory")) == 0 {
					// The home factory can be lost to base pressure
					// while the army works east; with no factory, no
					// cohort tank can ever be produced and stage 3
					// starves at the dispatch gate. Relay-1 keeps its
					// turret, outpost and infantry guard, so release
					// its guard tank into the cohort — properly, by
					// unreserving it, not by countermanding orders.
					if sites := r.tags["relay-1"]; len(sites) > 0 {
						site := sites[0]
						kept := guards[site][:0]
						for _, id := range guards[site] {
							actor, ok := r.seen(id)
							if ok && actor.Type == r.faction+".tank" && reserve[id] {
								delete(reserve, id)
								hasTank = true
								r.t.Logf("released relay-1 guard tank %d to stage-3 cohort tick%d", id, r.engine.Tick())
								continue
							}
							kept = append(kept, id)
						}
						guards[site] = kept
						live = cohort()
					}
				}
				if !hasTank || len(live) < 3 || preserveCaptureForce && !captureReady() {
					return
				}
			}
			r.issue(1, sim.Order{Kind: approach, Entities: live, Position: point})
			dispatched = true
			if waitingForRelief {
				r.t.Logf("paid relief screen dispatched tick%d target%s actors%v", r.engine.Tick(), tag, live)
			}
		}
		dispatch()
		previousApproach := r.tactical
		pressThird := r.faction == "SY" && r.difficulty == "hard" && tag == "relay-guard-3"
		if !dispatched || pressThird {
			nextApproach := r.engine.Tick()
			r.tactical = func() {
				previousApproach()
				dispatch()
				if !pressThird || r.engine.Outcome().Finished || r.engine.Tick() < nextApproach {
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
				if !dispatched {
					return false
				}
				if _, ok := r.seen(id); ok {
					return true
				}
				if r.view().Visible[(point.Y/1000)*r.gameMap.Width+point.X/1000] {
					return true
				}
				return false
			})
			if _, ok := r.seen(id); !ok {
				continue
			}
			for _, attacker := range cohort() {
				r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{attacker}, Target: id})
			}
			r.wait("mixed ground fire eliminates relay guard", 1800, func() bool { _, ok := r.seen(id); return !ok })
		}
		if preserveCaptureForce {
			// Guard combat can remove the tank after a legal initial dispatch.
			// Replenish through the existing paid queues, using only the time
			// still available in the original acquisition budget.
			r.wait("completed unreserved capture force after guards", authoredCaptureBudget(acquisitionDeadline, r.engine.Tick()), captureReady)
			ids, tanks := authoredCaptureForce(r.view(), reserve, r.faction)
			r.t.Logf("capture force ready tick%d target%s actors%v tanks%v", r.engine.Tick(), tag, ids, tanks)
		}
	}
	borrowCaptureEngineer := func(destination sim.Vec) (sim.ID, bool) {
		if r.faction != "SY" || (r.difficulty != "hard" && r.difficulty != "normal") || !r.factoryCaptureRoute() {
			return 0, false
		}
		chosen, site := authoredBorrowableCaptureEngineer(r.view(), repairers, destination, func(kind string) bool { u, ok := r.catalog.Unit(kind); return ok && u.Weapon != "" })
		if chosen == 0 || !r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{chosen}, Position: sim.Vec{X: destination.X - 7000, Y: destination.Y + 7000}}) {
			return 0, false
		}
		delete(repairers, site)
		delete(usedWorkers, chosen)
		r.t.Logf("mid-capture relief engineer%d reassigned fromsite%d tick%d", chosen, site, r.engine.Tick())
		return chosen, true
	}
	borrowCaptureGunner := func(destination sim.Vec) (sim.ID, bool) {
		if r.faction != "SY" || r.difficulty != "hard" || !r.factoryCaptureRoute() {
			return 0, false
		}
		chosen, site := authoredBorrowableCaptureGunner(r.view(), guards, destination, func(kind string) bool { u, ok := r.catalog.Unit(kind); return ok && u.Weapon != "" })
		if chosen == 0 || !r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{chosen}, Position: sim.Vec{X: destination.X - 3500, Y: destination.Y + 3500}}) {
			return 0, false
		}
		var remaining []sim.ID
		for _, id := range guards[site] {
			if id != chosen {
				remaining = append(remaining, id)
			}
		}
		guards[site] = remaining
		reserve[chosen] = true // Dedicated precision gunner, not a free guard replacement.
		r.t.Logf("mid-capture relief gunner%d reassigned fromsite%d tick%d", chosen, site, r.engine.Tick())
		return chosen, true
	}
	captureFactory := func() {
		if !r.factoryCaptureRoute() {
			return
		}
		var worker sim.ID
		for _, id := range r.ownedType(r.faction + ".engineer") {
			if !usedWorkers[id] {
				worker = id
				break
			}
		}
		if worker == 0 {
			// The relay-1 fortify window can consume every engineer
			// (capture + repair duty) before production resumes;
			// queue one more paid engineer instead of giving up.
			r.wait("paid independent optional factory engineer", 3600, func() bool {
				for _, id := range r.ownedType(r.faction + ".engineer") {
					if !usedWorkers[id] {
						worker = id
						return true
					}
				}
				kind := r.faction + ".engineer"
				if r.scheduledType(kind) == len(r.ownedType(kind)) {
					if barracks := r.ownedType("barracks"); len(barracks) > 0 {
						r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: kind})
					}
				}
				return false
			})
		}
		armor := r.ownedType(r.faction + ".tank")
		if len(armor) == 0 {
			// The relay-1 fortify window can cost every tank to
			// wave-1; wait for one paid replacement gunner instead
			// of indexing an empty armor list.
			r.wait("paid factory capture gunner tank", 4800, func() bool {
				armor = r.ownedType(r.faction + ".tank")
				if len(armor) > 0 {
					return true
				}
				if r.scheduledType(r.faction+".tank") == 0 {
					if factory := r.ownedType("factory"); len(factory) > 0 {
						if unit, ok := r.catalog.Unit(r.faction + ".tank"); ok && r.view().Economy.Credits >= unit.Cost {
							r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: r.faction + ".tank"})
						}
					}
				}
				return false
			})
		}
		worker = r.captureRelay("capture-factory", cohort(), armor[0], worker, usedWorkers, cohort, borrowCaptureEngineer, borrowCaptureGunner)
		usedWorkers[worker] = true
		factory := r.tags["capture-factory"][0]
		repairers[factory] = worker
		r.issue(1, sim.Order{Kind: "repair", Entities: []sim.ID{worker}, Target: factory})
		guards[factory] = nil
		// SY-05 hard: the funded factory turret never completes
		// (its builder dies en route) while its job cancellations
		// and rig displacement break the relay-2 cohort; the main
		// route already captures and preserves this factory.
		if r.faction == "SY" && r.difficulty == "hard" && r.requiredOptional == "factory-captured" && r.definition.ID != "sy-05-relay-break" {
			if rig := r.ownedType("SY.rig"); len(rig) > 0 {
				factoryTurretUntil = r.engine.Tick() + 3600
				building, _ := r.catalog.Building("turret")
				factoryTurretReserve = building.Cost
				r.tryIssue(sim.Order{Kind: "move", Entities: rig[:1], Position: sim.Vec{X: 47500, Y: 94500}})
				// Release only unpaid queues to accumulate the actual catalog
				// cost. Do not cancel or refund a paid unit or halt the army.
				for _, producer := range r.view().Entities {
					if producer.Owner != 1 || producer.Private == nil || producer.Type != "factory" && producer.Type != "barracks" {
						continue
					}
					for attempt := 0; attempt < 6; attempt++ {
						current, alive := r.seen(producer.ID)
						if !alive || current.Private == nil {
							break
						}
						index := -1
						for i := len(current.Private.Jobs) - 1; i >= 0; i-- {
							if !current.Private.Jobs[i].Started {
								index = i
								break
							}
						}
						if index < 0 || !r.tryIssue(sim.Order{Kind: "cancel", Entities: []sim.ID{producer.ID}, Index: int32(index)}) {
							break
						}
					}
				}
			}
		}
		r.t.Logf("optional factory captured tick%d actor%d", r.engine.Tick(), factory)
		// 850, not 900: observed hard repair stalls at 862 with the
		// engineer blocked in the AA cordon between relay and factory
		// while intermittent fire keeps resetting the out-of-combat
		// repair gate. This is driver staging only; the factory must
		// still be owned and operational for the finish gates.
		r.wait("repair captured factory behind the first relay", 4000, func() bool { v, ok := r.seen(factory); return ok && v.Owner == 1 && v.Health >= 850 })
	}
	// Optional Hard captures the nearby fragile factory before pausing for
	// paid fortification. Other routes preserve their existing task sequence.
	var fortifyCapture func()
	limit := 2
	if r.definition.ID != "us-03-relay-ridge" {
		limit = 3
	}
	captureOrder := []string{"relay-1", "relay-2", "relay-3"}
	guardOrder := []string{"relay-guard-1", "relay-guard-2", "relay-guard-3"}
	for stage := 1; stage <= limit; stage++ {
		tag := captureOrder[stage-1]
		guard := guardOrder[stage-1]
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
			if r.faction == "SY" && r.difficulty == "hard" && r.factoryCaptureRoute() {
				chosen, site := authoredBorrowableCaptureEngineer(r.view(), repairers, point, func(kind string) bool { u, ok := r.catalog.Unit(kind); return ok && u.Weapon != "" })
				if chosen != 0 {
					delete(repairers, site)
					delete(usedWorkers, chosen)
					worker = chosen
					r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{worker}, Position: sim.Vec{X: point.X - 7000, Y: point.Y + 7000}})
					r.t.Logf("reassigned completed repair engineer%d fromsite%d for%s tick%d", worker, site, tag, r.engine.Tick())
					return true
				}
			}
			return false
		}
		if !findWorker() {
			if r.faction == "SY" && r.difficulty == "hard" && r.factoryCaptureRoute() {
				r.wait("paid independent capture engineer", 2400, func() bool {
					if findWorker() {
						return true
					}
					kind := r.faction + ".engineer"
					if r.scheduledType(kind) == len(r.ownedType(kind)) {
						if barracks := r.ownedType("barracks"); len(barracks) > 0 {
							r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: kind})
						}
					}
					return findWorker()
				})
			} else {
				r.issue(1, sim.Order{Kind: "train", Entities: r.ownedType("barracks")[:1], Type: r.faction + ".engineer"})
				r.wait("paid independent capture engineer", 2400, findWorker)
			}
		}
		if stage == 3 && r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
			if buggies := r.ownedType("SY.buggy"); len(buggies) > 0 {
				var guardPoint sim.Vec
				for _, actor := range r.definition.Initial {
					if actor.Tag == guard {
						guardPoint = sim.Vec(actor.Position)
					}
				}
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: buggies, Position: guardPoint})
			}
		}
		if stage == 3 && r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" {
			if sites := r.tags["relay-1"]; len(sites) > 0 {
				site := sites[0]
				keptCounts := map[string]int{}
				var kept []sim.ID
				for _, id := range guards[site] {
					actor, ok := r.seen(id)
					if !ok || actor.Owner != 1 {
						delete(reserve, id)
						continue
					}
					limit := 0
					switch actor.Type {
					case "SY.rifle":
						limit = 4
					case "SY.at", "SY.tank":
						limit = 1
					}
					if keptCounts[actor.Type] < limit {
						keptCounts[actor.Type]++
						kept = append(kept, id)
						continue
					}
					delete(reserve, id)
				}
				guards[site] = kept
				guardCommitted[site] = false
			}
			if sites := r.tags["relay-2"]; len(sites) > 0 {
				// Stage-3 massing takes precedence: new production
				// must accumulate as a free force instead of being
				// fed one at a time into relay-2 guard slots.
				guardCommitted[sites[0]] = false
			}
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
		worker = r.captureRelay(tag, cohort(), tank, worker, usedWorkers, cohort, borrowCaptureEngineer, borrowCaptureGunner)
		usedWorkers[worker] = true
		if site, ok := r.seen(r.tags[tag][0]); ok {
			r.t.Logf("%s captured tick%d health%d", tag, r.engine.Tick(), site.Health)
		}
		if r.engine.Outcome().Finished {
			break
		}
		r.issue(1, sim.Order{Kind: "repair", Entities: []sim.ID{worker}, Target: r.tags[tag][0]})
		repairers[r.tags[tag][0]] = worker
		if r.faction == "SA" && r.difficulty == "hard" {
			economy := r.view().Economy
			ready := economy.Tier >= 2 && economy.Energy >= 50000
			for _, cooldown := range economy.Cooldowns {
				if cooldown.ID == "recovery_order" && cooldown.Until > r.engine.Tick() {
					ready = false
				}
			}
			if hq := r.ownedType("hq"); ready && len(hq) > 0 {
				r.tryIssue(sim.Order{Kind: "ability", Entities: hq[:1], Type: "recovery_order", Position: point})
			}
		}
		if forwardConstruction {
			guards[r.tags[tag][0]] = cohort()
		}
		if stage == 1 {
			r.checkpoint()
			if r.faction == "SY" && r.difficulty != "easy" {
				fortifyCapture = func() {
					// Protect the fresh relay with the full current cohort and reserve
					// future income for construction. Cancel only unpaid queued jobs;
					// paid production and every actual cost/work requirement continue.
					guards[r.tags[tag][0]] = cohort()
					forwardConstruction = true
					for _, producer := range r.view().Entities {
						if producer.Owner != 1 || producer.Private == nil || producer.Type != "factory" && producer.Type != "barracks" {
							continue
						}
						for attempt := 0; attempt < 5; attempt++ {
							current, alive := r.seen(producer.ID)
							if !alive || current.Private == nil {
								break
							}
							index := -1
							for i := len(current.Private.Jobs) - 1; i >= 0; i-- {
								if !current.Private.Jobs[i].Started {
									index = i
									break
								}
							}
							if index < 0 || !r.tryIssue(sim.Order{Kind: "cancel", Entities: []sim.ID{producer.ID}, Index: int32(index)}) {
								break
							}
						}
					}
					if r.factoryCaptureRoute() {
						r.buildVisibleCaptureDefense("outpost", sim.Vec{X: 41500, Y: 88500}, func(cost int64) { forwardReserve = cost })
						r.buildVisibleCaptureDefense("turret", sim.Vec{X: 53500, Y: 85500}, func(cost int64) { forwardReserve = cost })
					} else {
						r.buildAt(r.ids("home-rig"), "outpost", sim.Vec{X: 41500, Y: 88500})
						// Southwest of the relay: the northeastern site leaves
						// the rig exposed on the enemy approach while it builds.
						r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 50500, Y: 88500})
					}
					forwardConstruction = false
					next = r.engine.Tick()
				}
				if !r.factoryCaptureRoute() {
					fortifyCapture()
				}
			}
		}
		if stage < limit {
			if stage == 1 && r.requiredOptional == "factory-captured" && r.difficulty == "easy" {
				// Park the relay-1 cohort north of the relay, outside
				// auto-fire range of the optional factory to the south:
				// at the usual south guard point it destroys the
				// capture target itself during stabilization.
				guards[r.tags[tag][0]] = cohort()
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: guards[r.tags[tag][0]], Position: sim.Vec{X: point.X - 1000, Y: point.Y - 6500}})
			} else {
				guards[r.tags[tag][0]] = cohort()
				// Single guard ownership: a unit transferred to the
				// new relay must not keep receiving countermanding
				// guard orders from the previous relay's list.
				transferred := map[sim.ID]bool{}
				for _, id := range guards[r.tags[tag][0]] {
					transferred[id] = true
				}
				for siteID, ids := range guards {
					if siteID == r.tags[tag][0] {
						continue
					}
					kept := ids[:0]
					for _, id := range ids {
						if !transferred[id] {
							kept = append(kept, id)
						}
					}
					guards[siteID] = kept
				}
			}
			if tag == "relay-2" && r.faction == "SY" && r.difficulty == "hard" {
				// Replenish the relay-2 garrison during defense
				// construction and stabilization, not only after it.
				guardCommitted[r.tags[tag][0]] = true
			}
			rally = sim.Vec{X: point.X - 1000, Y: point.Y + 2500}
			if tag == "relay-2" && r.faction == "SY" && r.difficulty != "easy" {
				// Wave-3 (tick 10900) paths past relay-2 toward the
				// base; infantry guards alone let it through and the
				// relay died at tick 13701. Give relay-2 the same
				// outpost+turret anchor as relay-1, funded through the
				// existing construction reserve so production yields
				// instead of starving the build. Wave-2 enters from
				// the northwestern pass, so on hard the anchor sits
				// north of the relay, facing the actual approach.
				defenseY := point.Y + 3000
				if r.difficulty == "hard" {
					defenseY = point.Y - 3000
				}
				forwardConstruction = true
				r.buildVisibleCaptureDefense("outpost", sim.Vec{X: point.X - 6000, Y: defenseY}, func(cost int64) { forwardReserve = cost })
				r.buildVisibleCaptureDefense("turret", sim.Vec{X: point.X + 3000, Y: defenseY}, func(cost int64) { forwardReserve = cost })
				forwardConstruction = false
			}
			factoryCapturedEarly := false
			if stage == 1 && r.requiredOptional == "factory-captured" && r.difficulty == "easy" {
				// Take the adjacent factory immediately: during the
				// long relay-1 repair window the growing army's
				// auto-fire destroys it before capture can start.
				captureFactory()
				factoryCapturedEarly = true
			}
			if tag == "relay-2" && r.faction == "SY" && r.difficulty == "hard" {
				// Relay-2 cannot reach the repair gate under the
				// south pocket's fire cadence; advance at once so
				// the stage-3 force fights through it instead of
				// waiting out a driver-only stabilization gate.
				r.advance(600)
			} else {
				r.wait("stabilize captured relay before advancing", 2400, func() bool { e, ok := r.seen(r.tags[tag][0]); return ok && e.Health >= 850 })
			}
			if stage == 1 && r.factoryCaptureRoute() && !factoryCapturedEarly {
				captureFactory()
				// The optional factory is secure. Keep the paid mobile force
				// advancing rather than stage for discretionary forward buildings.
			}
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
			rifles, tanks, ats := 0, 0, 0
			guardRifles := 4
			guardATLimit := 0
			if r.faction == "SY" {
				guardRifles = 6
				if r.difficulty != "easy" {
					guardATLimit = 2
				}
				if r.difficulty == "normal" || r.definition.ID == "sy-05-relay-break" && r.difficulty == "hard" && stage == 2 {
					// Relay guards face US tanks: rifles cannot hurt
					// heavy armor, AT crews are the actual defense.
					guardATLimit = 4
				}
			}
			var defenders []sim.ID
			for _, id := range cohort() {
				e, ok := r.seen(id)
				if !ok {
					continue
				}
				keep := false
				if e.Type == r.faction+".rifle" && rifles < guardRifles {
					rifles++
					keep = true
				}
				if e.Type == r.faction+".at" && ats < guardATLimit {
					ats++
					keep = true
				}
				if e.Type == r.faction+".tank" && tanks < 1 {
					spare := true
					if preserveCaptureForce {
						_, freeTanks := authoredCaptureForce(r.view(), reserve, r.faction)
						spare = len(freeTanks) > 1
					}
					if spare {
						tanks++
						keep = true
					}
				}
				if keep {
					reserve[id] = true
					defenders = append(defenders, id)
					r.issue(1, sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: sim.Vec{X: point.X - 1500, Y: point.Y + 3500}})
				}
			}
			guards[r.tags[tag][0]] = defenders
			guardCommitted[r.tags[tag][0]] = true
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
	// sy-06 easy/normal and sa-06 hard lose every command asset at home
	// late in the unstaged posture (mission_failed ~12451-17629) while
	// the staged hard/easy siblings pass: the staged research, second
	// turret and initial hold are the difference. sa-06 normal already
	// passes unstaged and is left alone.
	return r.definition.ID == "sy-06-open-road" || r.definition.ID == "sa-06-shieldline" && r.difficulty != "normal" || r.requiredOptional == "observer-network" && r.difficulty == "hard"
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
				if r.requiredOptional == "observer-network" && tag == "enemy-hq" && !r.optionalObserversInSites() {
					point = r.region("site2")
					target = 0
					break
				}
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
		if r.definition.ID == "us-05-split-front" || r.definition.ID == "sy-06-open-road" {
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
		if r.definition.ID == "sy-06-open-road" && r.difficulty != "hard" || r.definition.ID == "sa-06-shieldline" || r.requiredOptional == "observer-network" && r.difficulty != "easy" || (r.definition.ID == "sy-03-three-crossings" || r.definition.ID == "sa-03-distant-depots") && r.difficulty != "easy" {
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
		// ir-05 easy: the reduced-credit garrison AI intercepts relay-2
		// with cheap infantry before paid replacements mass. Hold the
		// rally/attack point at relay-1 until the conventional force has
		// normal-route mass; the tick guard prevents a permanent stall.
		if r.definition.ID == "ir-05-the-second-volley" && r.requiredOptional == "missile-budget" && r.difficulty == "easy" && len(r.army()) < 16 && r.engine.Tick() < 3400 {
			point = sim.Vec{X: 50500, Y: 82500}
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
			if r.faction == "SA" && len(defenseAt) > 0 {
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
	if r.faction == "SA" && r.requireCampaignOptionals {
		// Clean-interception bait: the marked launcher (owner 4,
		// band 8000-28000, sight 9000) never spots a target in the
		// ordinary defense — waves die west of outpost-east and
		// its first shot came at tick 12015, after the 12100
		// timer could no longer credit an interception. Park the
		// recon beside outpost-east inside both the launcher band
		// (19723) and mobile-ABM coverage (8602 from 78500,69500);
		// waves bound for the outpost spot it for the launcher.
		for _, id := range r.ids("starting-recon") {
			excluded[id] = true
		}
		r.issue(1, sim.Order{Kind: "move", Entities: r.ids("starting-recon"), Position: sim.Vec{X: 83500, Y: 62500}}, sim.Order{Kind: "hold", Entities: r.ids("starting-recon"), Queued: true})
	}
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
	if r.faction == "IR" {
		// Two protected original sites satisfy the authored defense. Preserve
		// their real service/power state instead of opening with a base rush.
		defendAt = 0
		repair = func() {
			workers := r.ownedType("IR.engineer")
			for i, tag := range []string{"network-two", "home-service"} {
				if i < len(workers) && r.hasTag(tag) {
					r.tryIssue(sim.Order{Kind: "repair", Entities: workers[i : i+1], Target: r.tags[tag][0]})
				}
			}
		}
	}
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
	if r.faction == "SA" {
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
	if r.faction == "SY" && r.difficulty == "easy" {
		// Obtain ordinary vision on the eastern rear approach instead of
		// waiting for unseen artillery to destroy the rear safehouse.
		recon := r.ids("starting-recon")
		for _, id := range recon {
			excluded[id] = true
		}
		r.issue(1, sim.Order{Kind: "move", Entities: recon, Position: sim.Vec{X: 45500, Y: 101500}}, sim.Order{Kind: "hold", Entities: recon, Queued: true})
	}
	r.tactical = r.assaultPolicy(excluded, repair, defendAt)
	if r.faction == "IR" {
		// Easy also loses the network hold (mission_failed tick
		// 12533); the optional reliability route already applies this
		// hard-proved site defense on easy/normal.
		r.tactical = r.withSiteDefense(r.tactical, excluded, []string{"network-two", "home-service"})
	}
	if r.faction == "US" && r.difficulty == "hard" {
		// Hard destroys both original airfields (airfields-lost tick
		// 9506) while the generic policy is still postured forward.
		// Defend the two required airfield sites directly, as IR hard
		// defends its two network sites.
		r.tactical = r.withSiteDefense(r.tactical, excluded, []string{"home-service", "backup-airfield"})
	}
	if r.faction == "SY" {
		// Normal/hard lost a safehouse to the same ranged threats the
		// easy site-defense screen intercepts (doors-lost at tick 2988
		// hard / 7462 normal); the strategy is difficulty-independent.
		r.tactical = r.withSiteDefense(r.tactical, excluded, []string{"safehouse-front", "safehouse-rear"})
	}
	if r.faction == "SA" {
		mobile := r.ids("mobile-aegis")
		point := sim.Vec{X: 75500, Y: 69500}
		if r.requireCampaignOptionals {
			// Clean-interception needs the marked launcher's missile
			// intercepted over outpost-east: from 75500 the outpost
			// is 10770 away, outside the mobile radius of 10000, so
			// no interception event ever fired (optional sat at
			// 10/11 conditions). 78500 puts it 8062 away while
			// staying behind the outpost screen (80500 was overrun).
			point = sim.Vec{X: 78500, Y: 69500}
		}
		r.issue(1, sim.Order{Kind: "move", Entities: mobile, Position: point})
		r.wait("mobile interceptor covers the eastern defense", 1800, func() bool {
			for _, e := range r.view().Entities {
				if e.ID == mobile[0] {
					dx, dy := int64(e.Position.X-point.X), int64(e.Position.Y-point.Y)
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
	if r.definition.ID == "ir-05-the-second-volley" && r.difficulty == "hard" && r.requiredOptional != "missile-budget" {
		// The frozen optional route proved an ordinary conventional approach:
		// keep expensive launchers packed while paid troops take the actual
		// three outposts, and protect the home economy with a second turret.
		launchers := r.ids("volley-launchers")
		r.excludedArmy = map[sim.ID]bool{}
		for _, id := range launchers {
			r.excludedArmy[id] = true
		}
		r.issue(1, sim.Order{Kind: "move", Entities: launchers, Position: sim.Vec{X: 7500, Y: 120500}}, sim.Order{Kind: "hold", Entities: launchers, Queued: true})
		r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 22500, Y: 110500})
	}
	if r.requiredOptional == "observer-network" {
		r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
	} else {
		r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
	}
	if r.definition.ID == "sa-06-shieldline" && r.difficulty != "easy" {
		r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 33500, Y: 108500})
	}
	if r.definition.ID == "ir-05-the-second-volley" && r.difficulty == "easy" && r.requiredOptional != "missile-budget" {
		// Main-route easy loses command assets at home late while the
		// army is forward. The missile-budget route builds this same
		// turret before dispatch in its own setup (buildAt here would
		// orphan the 28500 foundation ordered above).
		r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 22500, Y: 110500})
	}
	if r.stagedAssault() {
		r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: sim.Vec{X: 31500, Y: 94500}})
		if r.requiredOptional == "observer-network" {
			r.buildOptionalDefense(sim.Vec{X: 19500, Y: 97500})
		} else {
			r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 31500, Y: 98500})
		}
		if r.requiredOptional == "observer-network" {
			r.tryIssue(sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".aa"})
		} else {
			r.issue(1, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: r.faction + ".aa"})
		}
	}
	excluded := map[sim.ID]bool{}
	for _, tag := range []string{"observer-west", "observer-east"} {
		for _, id := range r.tags[tag] {
			excluded[id] = true
		}
	}
	optionalPolicy := r.tactical
	r.tactical = r.assaultPolicy(excluded, func() {
		if r.definition.ID == "ir-06-iron-signal" && r.requiredOptional != "observer-network" {
			for i, tag := range []string{"observer-west", "observer-east"} {
				if r.hasTag(tag) {
					position := r.region("site1")
					if i == 1 {
						position = r.region("site2")
					}
					if r.requiredOptional == "observer-network" {
						position.X -= 3000
						position.Y += 4000
						if !r.optionalObservationSafe(position) {
							continue
						}
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
	if r.requiredOptional == "observer-network" && optionalPolicy != nil {
		macro := r.tactical
		if r.difficulty == "easy" || r.difficulty == "hard" {
			r.tactical = r.withRegionControl(func() { macro(); optionalPolicy() }, excluded, true)
		} else {
			// The armored carriers hold originals safely at home while the main
			// force clears enemy production. The ordinary assault policy gates
			// its final HQ attack on both original observers actually in region.
			r.tactical = func() { macro(); optionalPolicy() }
		}
	}
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
