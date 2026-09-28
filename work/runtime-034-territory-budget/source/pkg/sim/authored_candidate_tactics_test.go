package sim_test

import (
	"frontlinecommand/pkg/sim"
	"sort"
	"strings"
)

// withSiteDefense is a player-side command strategy, not simulation AI. It
// reacts only to currently visible armed enemies near currently owned sites.
// Ordinary attack-move, production rally and repair validation remain in Go.
func (r *authoredRun) withSiteDefense(macro func(), excluded map[sim.ID]bool, tags []string) func() {
	next := r.engine.Tick()
	return func() {
		macro()
		if r.engine.Outcome().Finished || r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 80
		view := r.view()
		groups := make([][]sim.ID, len(tags))
		counts := map[string]int{}
		for _, actor := range view.Entities {
			if actor.Owner != 1 || actor.Private == nil || actor.Private.Container != 0 || excluded[actor.ID] {
				continue
			}
			unit, ok := r.catalog.Unit(actor.Type)
			if !ok || unit.Weapon == "" || unit.Armor == "air" {
				continue
			}
			group := counts[actor.Type] % len(groups)
			if r.definition.ID == "ir-04-hold-the-network" && r.difficulty == "hard" && len(groups) == 2 {
				// Concentrate three quarters of each available role at the
				// exposed original network site; retain a home reserve.
				group = 0
				if counts[actor.Type]%4 == 3 {
					group = 1
				}
			}
			counts[actor.Type]++
			groups[group] = append(groups[group], actor.ID)
		}
		for index, tag := range tags {
			if len(r.tags[tag]) == 0 {
				continue
			}
			site, exists := r.seen(r.tags[tag][0])
			if !exists || site.Owner != 1 {
				continue
			}
			point := sim.Vec{X: site.Position.X, Y: site.Position.Y + 3500}
			closest := int64(22000 * 22000)
			var target sim.ID
			for _, enemy := range view.Entities {
				if enemy.Owner != 2 && enemy.Owner != 4 {
					continue
				}
				unit, known := r.catalog.Unit(enemy.Type)
				if !known || unit.Weapon == "" {
					continue
				}
				dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
				distance := dx*dx + dy*dy
				if distance >= 22000*22000 {
					continue
				}
				// Visible anti-armor and artillery squads threaten the required
				// structures at range. This is tactical priority, not hidden
				// target orders or a replacement for Go attack legality.
				if strings.HasSuffix(enemy.Type, ".at") || strings.HasSuffix(enemy.Type, ".artillery") || strings.HasSuffix(enemy.Type, ".launcher") {
					distance -= 22000 * 22000
				}
				if distance < closest {
					closest, point, target = distance, enemy.Position, enemy.ID
				}
			}
			var retask []sim.ID
			for _, id := range groups[index] {
				actor, alive := r.seen(id)
				if !alive || actor.Private == nil {
					continue
				}
				orders := actor.Private.Orders
				if target != 0 && len(orders) > 0 && orders[0].Kind == "attack" && orders[0].Target == target {
					continue
				}
				if len(orders) == 0 || orders[0].Kind != "attack_move" || orders[0].Position != point {
					retask = append(retask, id)
				}
			}
			for offset := 0; offset < len(retask); offset += 64 {
				r.tryIssue(sim.Order{Kind: "attack_move", Entities: retask[offset:min(offset+64, len(retask))], Position: point})
				if r.engine.Outcome().Finished {
					return
				}
			}
			if target != 0 {
				var candidates []sim.Order
				positions := map[sim.ID]sim.Vec{}
				for _, id := range groups[index] {
					actor, alive := r.seen(id)
					if !alive || actor.Private == nil {
						continue
					}
					positions[id] = actor.Position
					candidates = append(candidates, sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
				}
				var attackers []sim.ID
				for offset := 0; offset < len(candidates); offset += 32 {
					batch := candidates[offset:min(offset+32, len(candidates))]
					preview, err := r.engine.PreviewCandidates(1, batch)
					if err != nil {
						r.t.Fatal(err)
					}
					for i, legal := range preview {
						if legal.Accepted {
							attackers = append(attackers, batch[i].Entities[0])
						}
					}
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
				var changed []sim.ID
				for _, id := range attackers[:min(8, len(attackers))] {
					actor, alive := r.seen(id)
					if !alive || actor.Private == nil {
						continue
					}
					orders := actor.Private.Orders
					if len(orders) == 0 || orders[0].Kind != "attack" || orders[0].Target != target {
						changed = append(changed, id)
					}
				}
				if len(changed) > 0 {
					r.tryIssue(sim.Order{Kind: "attack", Entities: changed, Target: target})
				}
			}
		}
	}
}

// withRegionControl retains a mixed ground force at the public objective
// regions. It does not inspect enemy orders or undisclosed map occupancy.
func (r *authoredRun) withRegionControl(macro func(), excluded map[sim.ID]bool, onlyBeforeObservers bool) func() {
	next := r.engine.Tick()
	return func() {
		macro()
		if r.engine.Outcome().Finished || r.engine.Tick() < next || onlyBeforeObservers && r.optionalObserversInSites() {
			return
		}
		next = r.engine.Tick() + 100
		view := r.view()
		groups := make([][]sim.ID, 2)
		counts := map[string]int{}
		for _, actor := range view.Entities {
			if actor.Owner != 1 || actor.Private == nil || actor.Private.Container != 0 || excluded[actor.ID] || r.excludedArmy[actor.ID] {
				continue
			}
			u, ok := r.catalog.Unit(actor.Type)
			if !ok || u.Weapon == "" || u.Armor == "air" {
				continue
			}
			index := counts[actor.Type] % 2
			counts[actor.Type]++
			groups[index] = append(groups[index], actor.ID)
		}
		for i, region := range []string{"site1", "site2"} {
			point := r.region(region)
			var target sim.ID
			closest := int64(16000 * 16000)
			for _, hostile := range view.Entities {
				if hostile.Owner != 2 && hostile.Owner != 4 {
					continue
				}
				u, ok := r.catalog.Unit(hostile.Type)
				if !ok || u.Weapon == "" {
					continue
				}
				dx, dy := int64(hostile.Position.X-point.X), int64(hostile.Position.Y-point.Y)
				if d := dx*dx + dy*dy; d < closest {
					closest, target = d, hostile.ID
				}
			}
			for _, id := range groups[i] {
				actor, ok := r.seen(id)
				if !ok || actor.Private == nil {
					continue
				}
				orders := actor.Private.Orders
				if target != 0 {
					if len(orders) > 0 && orders[0].Kind == "attack" && orders[0].Target == target {
						continue
					}
					if r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target}) {
						continue
					}
				}
				if len(orders) == 0 || orders[0].Kind != "attack_move" || orders[0].Position != point {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: point})
				}
				if r.engine.Outcome().Finished {
					return
				}
			}
		}
	}
}

// withExpansionDefense keeps stable squads at the two announced crossings and
// a smaller home reserve. Existing groups do not swap posts when a squad dies.
func (r *authoredRun) withExpansionDefense(macro func(), excluded map[sim.ID]bool) func() {
	next := r.engine.Tick()
	assigned := map[sim.ID]int{}
	sentinels := map[int]sim.ID{}
	productionAt := r.engine.Tick()
	stage := 0
	var foundation sim.ID
	plan := []struct {
		kind  string
		point sim.Vec
	}{
		{"outpost", sim.Vec{X: 45500, Y: 85500}},
		{"turret", sim.Vec{X: 49500, Y: 80500}},
		{"outpost", sim.Vec{X: 87500, Y: 70500}},
		{"turret", sim.Vec{X: 86500, Y: 66500}},
	}
	var homeWorker sim.ID
	return func() {
		if r.engine.Tick() < next || r.engine.Outcome().Finished {
			return
		}
		next = r.engine.Tick() + 120
		if macro != nil {
			macro()
		}
		view := r.view()
		// A fixed ordinary field-construction plan uses only public objective
		// locations. Go validates sight, credits, foundation and build radius.
		if rigs := r.ownedType("SY.rig"); len(rigs) > 0 && stage < len(plan) {
			builder, alive := r.seen(rigs[0])
			if alive && builder.Private != nil {
				if foundation != 0 {
					if site, ok := r.seen(foundation); ok && site.Owner == 1 {
						if site.Complete {
							stage++
							foundation = 0
						} else if len(builder.Private.Orders) == 0 {
							r.tryIssue(sim.Order{Kind: "resume", Entities: rigs[:1], Target: site.ID})
						}
					} else {
						foundation = 0
					}
				} else if len(builder.Private.Orders) == 0 || builder.Private.Orders[0].Kind != "build" {
					step := plan[stage]
					for _, offset := range []sim.Vec{{X: 0, Y: 0}, {X: -2000, Y: 0}, {X: 2000, Y: 0}, {X: 0, Y: 2000}, {X: 0, Y: -2000}} {
						point := sim.Vec{X: step.point.X + offset.X, Y: step.point.Y + offset.Y}
						if !r.visibleFoundationLooksClear(step.kind, point) {
							continue
						}
						if r.tryIssue(sim.Order{Kind: "build", Entities: rigs[:1], Type: step.kind, Position: point}) {
							for _, actor := range r.view().Entities {
								if actor.Owner == 1 && actor.Type == step.kind && actor.Position == point {
									foundation = actor.ID
									break
								}
							}
							break
						}
					}
					if foundation == 0 {
						scout := sim.Vec{X: step.point.X - 4000, Y: step.point.Y + 2000}
						if len(builder.Private.Orders) == 0 || builder.Private.Orders[0].Kind != "move" || builder.Private.Orders[0].Position != scout {
							r.tryIssue(sim.Order{Kind: "move", Entities: rigs[:1], Position: scout})
						}
					}
				}
			}
		}
		if r.engine.Tick() >= productionAt {
			productionAt = r.engine.Tick() + 600
			// Reserve for a discretionary field foundation only while an own
			// usable rig can still build it. A lost builder must not leave the
			// surviving producers saving indefinitely for an impossible plan.
			canSpend := authoredExpansionCanSpend(view, stage < len(plan), foundation)
			r.t.Logf("expansion production decision tick%d credits%d stage%d foundation%d rigAvailable%t canSpend%t", r.engine.Tick(), view.Economy.Credits, stage, foundation, authoredExpansionRigAvailable(view), canSpend)
			if canSpend {
				if factory := r.ownedType("factory"); len(factory) > 0 {
					r.tryIssue(sim.Order{Kind: "rally", Entities: factory[:1], Position: r.region("site2")})
					for _, kind := range []string{"SY.tank", "SY.tank", "SY.aa"} {
						if kind != "SY.aa" || r.scheduledType(kind) < 3 {
							r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: kind})
						}
					}
				}
				if barracks := r.ownedType("barracks"); len(barracks) > 0 {
					r.tryIssue(sim.Order{Kind: "rally", Entities: barracks[:1], Position: r.region("site1")})
					for _, kind := range []string{"SY.rifle", "SY.rifle", "SY.at"} {
						if r.scheduledType(kind) < 14 {
							r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: kind})
						}
					}
				}
			}
		}
		// One real engineer stays with the supply/HQ instead of moving into
		// a contested region; normal paid repair keeps the economy functioning.
		if worker, alive := r.seen(homeWorker); !alive || worker.Owner != 1 {
			if workers := r.ownedType("SY.engineer"); len(workers) > 0 {
				homeWorker = workers[0]
				excluded[homeWorker] = true
			}
		}
		for _, tag := range []string{"home-supply", "home-hq", "home-factory"} {
			if len(r.tags[tag]) == 0 {
				continue
			}
			site, ok := r.seen(r.tags[tag][0])
			if !ok || site.Owner != 1 || site.Health >= 950 {
				continue
			}
			if worker, ok := r.seen(homeWorker); ok && worker.Private != nil {
				if orders := worker.Private.Orders; len(orders) == 0 || orders[0].Kind != "repair" || orders[0].Target != site.ID {
					r.tryIssue(sim.Order{Kind: "repair", Entities: []sim.ID{homeWorker}, Target: site.ID})
				}
			}
			break
		}
		if r.engine.Outcome().Finished {
			return
		}
		points := []sim.Vec{r.region("site1"), r.region("site2"), {X: 31500, Y: 98500}}
		view = r.view()
		groups := make([][]sim.ID, 3)
		counts := map[string][3]int{}
		for _, actor := range view.Entities {
			if actor.Owner != 1 || actor.Private == nil || actor.Private.Container != 0 || excluded[actor.ID] {
				continue
			}
			u, ok := r.catalog.Unit(actor.Type)
			if !ok || u.Weapon == "" || u.Armor == "air" {
				continue
			}
			if group, exists := assigned[actor.ID]; exists {
				groups[group] = append(groups[group], actor.ID)
				c := counts[actor.Type]
				c[group]++
				counts[actor.Type] = c
			}
		}
		for _, actor := range view.Entities {
			if _, ok := assigned[actor.ID]; ok {
				continue
			}
			if actor.Owner != 1 || actor.Private == nil || actor.Private.Container != 0 || excluded[actor.ID] {
				continue
			}
			u, ok := r.catalog.Unit(actor.Type)
			if !ok || u.Weapon == "" || u.Armor == "air" {
				continue
			}
			c := counts[actor.Type]
			group := 0
			if c[1] < c[group] {
				group = 1
			}
			if c[2]*2 < c[group] {
				group = 2
			}
			c[group]++
			counts[actor.Type] = c
			assigned[actor.ID] = group
			groups[group] = append(groups[group], actor.ID)
		}
		for index, point := range points {
			if index < 2 {
				if sentinel, alive := r.seen(sentinels[index]); !alive || sentinel.Owner != 1 {
					for _, id := range groups[index] {
						actor, alive := r.seen(id)
						if !alive || actor.Type != "SY.rifle" {
							continue
						}
						post := sim.Vec{X: point.X - 1500, Y: point.Y + 1500}
						if r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: post}) && r.tryIssue(sim.Order{Kind: "hold", Entities: []sim.ID{id}, Queued: true}) {
							sentinels[index] = id
							excluded[id] = true
						}
						break
					}
				}
			}
			for _, id := range groups[index] {
				if excluded[id] {
					continue
				}
				actor, alive := r.seen(id)
				if !alive || actor.Private == nil {
					continue
				}
				unit, _ := r.catalog.Unit(actor.Type)
				antiArmor := actor.Type == "SY.at" || actor.Type == "SY.tank" || actor.Type == "SY.artillery"
				var target sim.ID
				best := int64(1 << 62)
				for _, enemy := range view.Entities {
					if enemy.Owner != 2 && enemy.Owner != 4 {
						continue
					}
					hostile, ok := r.catalog.Unit(enemy.Type)
					if !ok && enemy.FootprintWidth == 0 || (ok && hostile.Armor == "air" && unit.Role != "aa") {
						continue
					}
					dx, dy := int64(enemy.Position.X-point.X), int64(enemy.Position.Y-point.Y)
					d := dx*dx + dy*dy
					if d > 16000*16000 {
						continue
					}
					heavy := hostile.Armor == "heavy" || hostile.Armor == "light"
					if antiArmor == heavy {
						d -= 16000 * 16000
					}
					if !antiArmor && (strings.HasSuffix(enemy.Type, ".at") || strings.HasSuffix(enemy.Type, ".medic")) {
						d -= 16000 * 16000
					}
					if d < best {
						best, target = d, enemy.ID
					}
				}
				orders := actor.Private.Orders
				if target != 0 {
					if len(orders) > 0 && orders[0].Kind == "attack" && orders[0].Target == target {
						continue
					}
					if r.tryIssue(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target}) {
						continue
					}
				}
				if len(orders) == 0 || orders[0].Kind != "attack_move" || orders[0].Position != point {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: point})
				}
				if r.engine.Outcome().Finished {
					return
				}
			}
		}
	}
}

// This player-side visual prefilter rejects visibly occupied sites before an
// advisory "indeterminate" build request. It is deliberately conservative;
// actual Go order execution remains the sole placement authority.
func (r *authoredRun) visibleFoundationLooksClear(kind string, point sim.Vec) bool {
	building, ok := r.catalog.Building(kind)
	if !ok {
		return false
	}
	view := r.view()
	left, right := point.X-building.Width*500, point.X+building.Width*500
	top, bottom := point.Y-building.Height*500, point.Y+building.Height*500
	if left < 0 || top < 0 || right > r.gameMap.Width*1000 || bottom > r.gameMap.Height*1000 {
		return false
	}
	for y := top / 1000; y <= (bottom-1)/1000; y++ {
		for x := left / 1000; x <= (right-1)/1000; x++ {
			cell := y*r.gameMap.Width + x
			tile := r.gameMap.TileAt(sim.Vec{X: x*1000 + 500, Y: y*1000 + 500})
			if !view.Visible[cell] || !tile.Passable() || tile.Mandatory {
				return false
			}
		}
	}
	absolute := func(v int32) int32 {
		if v < 0 {
			return -v
		}
		return v
	}
	for _, actor := range view.Entities {
		if actor.Private != nil && actor.Private.Container != 0 {
			continue
		}
		dx, dy := absolute(actor.Position.X-point.X), absolute(actor.Position.Y-point.Y)
		if actor.FootprintWidth > 0 {
			if dx < (building.Width+actor.FootprintWidth)*500+500 && dy < (building.Height+actor.FootprintHeight)*500+500 {
				return false
			}
			continue
		}
		unit, known := r.catalog.Unit(actor.Type)
		if !known || unit.Armor == "air" && !actor.Landed {
			continue
		}
		radius := unit.Radius + 500
		if actor.Landed {
			radius = max(radius, 3000)
		}
		x, y := max(int32(0), dx-building.Width*500), max(int32(0), dy-building.Height*500)
		if int64(x)*int64(x)+int64(y)*int64(y) < int64(radius)*int64(radius) {
			return false
		}
	}
	for _, field := range view.Fields {
		if absolute(field.Position.X-point.X) < building.Width*500+4000 && absolute(field.Position.Y-point.Y) < building.Height*500+4000 {
			return false
		}
	}
	for _, station := range view.Stations {
		if absolute(station.Position.X-point.X) < building.Width*500+2500 && absolute(station.Position.Y-point.Y) < building.Height*500+2500 {
			return false
		}
	}
	return true
}
