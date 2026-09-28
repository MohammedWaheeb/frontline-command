package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// These are optional-objective command strategies on unchanged authored starts.
// The shared finish gate checks the actual at-end award before writing evidence.
func TestAuthoredOptionalMissileBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional missile-budget route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "ir-05-the-second-volley", difficulty, "")
			r.evidenceSuffix = "-optional-missile-budget"
			r.requiredOptional = "missile-budget"
			launchers := r.ids("volley-launchers")
			r.excludedArmy = map[sim.ID]bool{}
			for _, id := range launchers {
				r.excludedArmy[id] = true
			}
			// A normal move packs mobile launchers. Keep them in the rear while paid
			// conventional tanks and infantry assault the three military outposts.
			r.issue(1, sim.Order{Kind: "move", Entities: launchers, Position: sim.Vec{X: 7500, Y: 120500}}, sim.Order{Kind: "hold", Entities: launchers, Queued: true})
			if difficulty == "hard" {
				r.buildAt(r.ids("home-rig"), "turret", sim.Vec{X: 22500, Y: 110500})
			}
			playCampaignAssault(r)
		})
	}
}

func (r *authoredRun) captureOptionalStation(worker sim.ID, point sim.Vec) {
	r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{worker}, Position: point})
	var target sim.ID
	r.wait("optional engineer obtains current station vision", 3000, func() bool {
		for _, station := range r.view().Stations {
			if station.Position == point {
				target = station.ID
				return true
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "capture", Entities: []sim.ID{worker}, Target: target})
	r.wait("ordinary optional station capture", 2400, func() bool {
		for _, station := range r.view().Stations {
			if station.ID == target {
				return station.Owner == 1
			}
		}
		return false
	})
}

func TestAuthoredOptionalDistantStations(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional two-station route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "sa-03-distant-depots", difficulty, "")
			r.evidenceSuffix = "-optional-stations-together"
			r.requiredOptional = "stations-together"
			rifles, at := r.ids("starting-rifles"), r.ids("starting-at")
			west := append(append([]sim.ID{}, rifles...), at[0])
			east := append(append(r.ids("starting-armor"), at[1]), r.ids("starting-recon")...)
			r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "attack_move", Entities: west, Position: sim.Vec{X: 50500, Y: 81500}}, sim.Order{Kind: "attack_move", Entities: east, Position: sim.Vec{X: 85500, Y: 66500}}, sim.Order{Kind: "rally", Entities: r.ids("home-factory"), Position: r.region("site2")}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "SA.tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "SA.tank"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "SA.tank"}, sim.Order{Kind: "rally", Entities: r.ids("home-barracks"), Position: r.region("site1")}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "SA.rifle"}, sim.Order{Kind: "train", Entities: r.ids("home-barracks"), Type: "SA.rifle"})
			workers := r.ids("starting-engineers")
			r.issue(1, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}})
			r.tactical = r.assaultPolicy(nil, nil, 0)
			r.advance(500)
			r.checkpoint()
			// Delay the required second supply center until both neutral stations are
			// really owned; this avoids ending the mission before the optional channel.
			r.captureOptionalStation(workers[0], sim.Vec{X: 49500, Y: 85500})
			r.captureOptionalStation(workers[1], sim.Vec{X: 88500, Y: 62500})
			r.buildAt(r.ids("home-rig"), "supply", sim.Vec{X: 25500, Y: 117500})
			r.wait("both owned stations and two operational supply centers", 12000, func() bool { return r.engine.Outcome().Finished })
			r.finish()
		})
	}
}

func TestAuthoredOptionalTrailSalvage(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional hostile wreck salvage route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "sy-02-supply-trail", difficulty, "")
			r.evidenceSuffix = "-optional-limited-salvage"
			r.requiredOptional = "limited-salvage"
			collectors := append(r.ids("starting-engineers"), r.ids("starting-repair")...)
			r.issue(1, sim.Order{Kind: "move", Entities: collectors, Position: sim.Vec{X: 47500, Y: 87500}})
			next := r.engine.Tick()
			r.tactical = func() {
				if r.engine.Tick() < next {
					return
				}
				next = r.engine.Tick() + 20
				view := r.view()
				assigned := map[sim.ID]bool{}
				for _, id := range collectors {
					if actor, ok := r.seen(id); ok && actor.Private != nil && len(actor.Private.Orders) > 0 && actor.Private.Orders[0].Kind == "salvage" {
						assigned[actor.Private.Orders[0].Target] = true
					}
				}
				for _, id := range collectors {
					actor, ok := r.seen(id)
					if !ok || actor.Private == nil {
						continue
					}
					if len(actor.Private.Orders) > 0 && actor.Private.Orders[0].Kind == "salvage" {
						continue
					}
					var closest sim.ID
					distance := int64(1 << 62)
					for _, crate := range view.Salvage {
						if assigned[crate.ID] {
							continue
						}
						dx, dy := int64(actor.Position.X-crate.Position.X), int64(actor.Position.Y-crate.Position.Y)
						if d := dx*dx + dy*dy; d < distance {
							closest, distance = crate.ID, d
						}
					}
					if closest != 0 && r.tryIssue(sim.Order{Kind: "salvage", Entities: []sim.ID{id}, Target: closest}) {
						assigned[closest] = true
					}
				}
			}
			playCampaignEscort(r)
		})
	}
}

func (r *authoredRun) mechanicRetreat() func() {
	moved := map[sim.ID]bool{}
	return func() {
		for i, tag := range []string{"mechanics-west", "mechanics-east"} {
			for _, id := range r.tags[tag] {
				actor, owned := r.seen(id)
				if !owned || actor.Owner != 1 || moved[id] {
					continue
				}
				via, rear := sim.Vec{X: 25500, Y: 83500}, sim.Vec{X: 22500, Y: 120500}
				if i == 1 {
					via, rear = sim.Vec{X: 77500, Y: 113500}, sim.Vec{X: 26500, Y: 122500}
				}
				if r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: via}) &&
					r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: rear, Queued: true}) &&
					r.tryIssue(sim.Order{Kind: "hold", Entities: []sim.ID{id}, Queued: true}) {
					moved[id] = true
					r.t.Logf("original mechanic ordinary rear retreat tick%d actor%d", r.engine.Tick(), id)
				}
			}
		}
	}
}

func TestAuthoredOptionalMechanicTeams(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated preservation of all original recovered mechanics")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "sy-01-workshop-foothold", difficulty, "")
			r.evidenceSuffix = "-optional-mechanic-teams"
			r.requiredOptional = "mechanic-teams"
			if difficulty == "easy" {
				r.tactical = r.mechanicRetreat()
			}
			playWorkshopFoothold(r)
		})
	}
}

func (r *authoredRun) optionalObservationSafe(point sim.Vec) bool {
	view := r.view()
	if !view.Visible[(point.Y/1000)*r.gameMap.Width+point.X/1000] {
		return false
	}
	escorted := false
	for _, actor := range view.Entities {
		dx, dy := int64(actor.Position.X-point.X), int64(actor.Position.Y-point.Y)
		d := dx*dx + dy*dy
		if (actor.Owner == 2 || actor.Owner == 4) && d < 14000*14000 {
			return false
		}
		unit, ok := r.catalog.Unit(actor.Type)
		if actor.Owner == 1 && ok && unit.Weapon != "" && actor.Type != "IR.recon" && actor.Type != "IR.apc" && d < 9000*9000 {
			escorted = true
		}
	}
	return escorted
}

func (r *authoredRun) optionalObserversInSites() bool {
	for i, tag := range []string{"observer-west", "observer-east"} {
		if len(r.tags[tag]) != 1 {
			return false
		}
		actor, seen := r.seen(r.tags[tag][0])
		if !seen || actor.Owner != 1 || actor.Private == nil || actor.Private.Container != 0 {
			return false
		}
		region := "site1"
		if i == 1 {
			region = "site2"
		}
		inside := false
		for _, bounds := range r.gameMap.Regions {
			if bounds.ID == region && actor.Position.X >= bounds.Min.X && actor.Position.X <= bounds.Max.X && actor.Position.Y >= bounds.Min.Y && actor.Position.Y <= bounds.Max.Y {
				inside = true
			}
		}
		if !inside {
			return false
		}
	}
	return true
}

func TestAuthoredOptionalObserverNetwork(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated original observer preservation route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "ir-06-iron-signal", difficulty, "")
			r.evidenceSuffix = "-optional-observer-network"
			r.requiredOptional = "observer-network"
			r.excludedArmy = map[sim.ID]bool{}
			observers := append(r.ids("observer-west"), r.ids("observer-east")...)
			for _, id := range observers {
				r.excludedArmy[id] = true
			}
			r.issue(1, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "IR.apc"}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "IR.apc"})
			r.tactical = r.assaultPolicy(r.excludedArmy, nil, 0)
			r.wait("two paid observer APCs", 1800, func() bool {
				for _, id := range r.ownedType("IR.apc") {
					r.excludedArmy[id] = true
				}
				return len(r.ownedType("IR.apc")) >= 2
			})
			carriers := r.ownedType("IR.apc")[:2]
			for i, id := range observers {
				r.issue(1, sim.Order{Kind: "board", Entities: []sim.ID{id}, Target: carriers[i]})
			}
			r.wait("both originals board paid ground carriers", 1800, func() bool {
				for i, id := range observers {
					actor, ok := r.seen(id)
					if !ok || actor.Private == nil || actor.Private.Container != carriers[i] {
						return false
					}
				}
				return true
			})
			for i, carrier := range carriers {
				r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{carrier}, Position: sim.Vec{X: 16500, Y: 105500 + int32(i)*3000}})
			}
			next := r.engine.Tick()
			unloaded := map[sim.ID]bool{}
			escorts := map[int]map[string]sim.ID{}
			productionAt := r.engine.Tick()
			clearedProduction := map[sim.ID]bool{}
			lateArrivalReady := r.difficulty == "easy"
			escortRoles := []struct{ key, typ string }{{"tank", "IR.tank"}, {"rifle", "IR.rifle"}}
			if r.difficulty != "easy" {
				escortRoles = append(escortRoles, struct{ key, typ string }{"second-rifle", "IR.rifle"}, struct{ key, typ string }{"anti-armor", "IR.at"}, struct{ key, typ string }{"anti-air", "IR.aa"}, struct{ key, typ string }{"medic", "IR.medic"})
			}
			r.tactical = func() {
				if r.engine.Tick() < next {
					return
				}
				next = r.engine.Tick() + 20
				if !lateArrivalReady {
					// Delay exposed observation posts until normal combat has removed
					// the authored production buildings. Only current player sight and
					// remembered observations establish that a building was cleared.
					ready := true
					view := r.view()
					for _, tag := range []string{"enemy-barracks", "enemy-factory", "enemy-service"} {
						ids := r.tags[tag]
						if len(ids) != 1 {
							ready = false
							continue
						}
						id := ids[0]
						if !clearedProduction[id] {
							if actor, seen := r.seen(id); seen {
								clearedProduction[id] = actor.Owner == 1
							} else {
								for _, initial := range r.definition.Initial {
									if initial.Tag == tag {
										cell := initial.Position.Y/1000*r.gameMap.Width + initial.Position.X/1000
										clearedProduction[id] = view.Visible[cell]
									}
								}
							}
						}
						ready = ready && clearedProduction[id]
					}
					if ready {
						lateArrivalReady = true
						r.t.Logf("observer dispatch after visibly cleared enemy production tick%d", r.engine.Tick())
					}
				}
				if r.difficulty != "easy" && r.engine.Tick() >= productionAt {
					productionAt = r.engine.Tick() + 600
					if barracks := r.ownedType("barracks"); len(barracks) > 0 {
						for _, role := range []struct {
							typ   string
							count int
						}{{"IR.at", 4}, {"IR.medic", 2}} {
							if r.scheduledType(role.typ) < role.count {
								r.tryIssue(sim.Order{Kind: "train", Entities: barracks[:1], Type: role.typ})
							}
						}
					}
					if factory := r.ownedType("factory"); len(factory) > 0 && r.scheduledType("IR.aa") < 3 {
						r.tryIssue(sim.Order{Kind: "train", Entities: factory[:1], Type: "IR.aa"})
					}
				}
				for i, id := range observers {
					actor, ok := r.seen(id)
					carrier, carrierOK := r.seen(carriers[i])
					if !ok || actor.Private != nil && actor.Private.Container != 0 && !carrierOK {
						r.wait("original observer survives its real transport", 0, func() bool { return false })
					}
					if actor.Private == nil {
						continue
					}
					point := r.region("site1")
					if i == 1 {
						point = r.region("site2")
					}
					point.X -= 3000
					point.Y += 3000
					if r.difficulty != "easy" {
						point.X -= 1500
						point.Y += 1500
					}
					if r.engine.Tick() >= 1800 && lateArrivalReady {
						if escorts[i] == nil {
							escorts[i] = map[string]sim.ID{}
						}
						for _, role := range escortRoles {
							typ := role.typ
							guard, alive := r.seen(escorts[i][role.key])
							if !alive {
								var chosen sim.ID
								closest := int64(1 << 62)
								for _, own := range r.view().Entities {
									if own.Owner != 1 || own.Type != typ || r.excludedArmy[own.ID] {
										continue
									}
									dx, dy := int64(own.Position.X-point.X), int64(own.Position.Y-point.Y)
									if d := dx*dx + dy*dy; d < closest {
										chosen, closest = own.ID, d
									}
								}
								if chosen == 0 {
									continue
								}
								escorts[i][role.key] = chosen
								r.excludedArmy[chosen] = true
								guard, _ = r.seen(chosen)
							}
							if r.difficulty != "easy" && actor.Private.Container == 0 {
								if guard.Private != nil && (len(guard.Private.Orders) == 0 || guard.Private.Orders[0].Kind != "guard" || guard.Private.Orders[0].Target != id) {
									r.tryIssue(sim.Order{Kind: "guard", Entities: []sim.ID{guard.ID}, Target: id})
								}
								continue
							}
							if guard.Private != nil && (len(guard.Private.Orders) == 0 || guard.Private.Orders[0].Kind != "attack_move" || guard.Private.Orders[0].Position != point) {
								r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{guard.ID}, Position: point})
							}
						}
					}
					if actor.Private.Container == 0 {
						if !unloaded[id] {
							if !r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point}) {
								continue
							}
							r.tryIssue(sim.Order{Kind: "hold", Entities: []sim.ID{id}, Queued: true})
							unloaded[id] = true
							// Persistent escorts were assigned before the carrier advanced.
							r.t.Logf("original observer unloaded tick%d actor%d health%d", r.engine.Tick(), id, actor.Health)
						}
						continue
					}
					if !lateArrivalReady || r.difficulty == "hard" && r.engine.Tick() < 2800 || !r.optionalObservationSafe(point) {
						shelter := sim.Vec{X: 16500, Y: 105500 + int32(i)*3000}
						if len(carrier.Private.Orders) == 0 || carrier.Private.Orders[0].Kind != "move" || carrier.Private.Orders[0].Position != shelter {
							r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{carrier.ID}, Position: shelter})
						}
						continue
					}
					inside := false
					region := "site1"
					if i == 1 {
						region = "site2"
					}
					for _, bounds := range r.gameMap.Regions {
						if bounds.ID == region && carrier.Position.X >= bounds.Min.X+1000 && carrier.Position.X <= bounds.Max.X-1000 && carrier.Position.Y >= bounds.Min.Y+1000 && carrier.Position.Y <= bounds.Max.Y-1000 {
							inside = true
						}
					}
					if inside && r.difficulty != "easy" {
						orders := carrier.Private.Orders
						if carrier.ChannelUntil == 0 && (len(orders) == 0 || orders[0].Kind != "unload") {
							r.tryIssue(sim.Order{Kind: "unload", Entities: []sim.ID{carrier.ID}, Position: carrier.Position})
						}
						continue
					}
					dx, dy := int64(carrier.Position.X-point.X), int64(carrier.Position.Y-point.Y)
					if dx*dx+dy*dy <= 1200*1200 {
						orders := carrier.Private.Orders
						unloading := len(orders) > 0 && orders[0].Kind == "unload" && orders[0].Position == point
						if carrier.ChannelUntil == 0 && !unloading {
							r.tryIssue(sim.Order{Kind: "unload", Entities: []sim.ID{carrier.ID}, Position: point})
						}
					} else if len(carrier.Private.Orders) == 0 || carrier.Private.Orders[0].Kind != "move" || carrier.Private.Orders[0].Position != point {
						r.tryIssue(sim.Order{Kind: "move", Entities: []sim.ID{carrier.ID}, Position: point})
					}
				}
			}
			playCampaignAssault(r)
		})
	}
}

func TestAuthoredOptionalWingEvacuation(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated marked-wing combat, rebasing and paid service route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "us-04-broken-umbrella", difficulty, "")
			r.evidenceSuffix = "-optional-wing-evacuated"
			r.requiredOptional = "wing-evacuated"
			wings := append(r.ids("wing-one"), r.ids("wing-two")...)
			backup := r.ids("backup-airfield")[0]
			r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}}, sim.Order{Kind: "train", Entities: r.ids("home-factory"), Type: "US.aa"})
			backupScreen := sim.Vec{X: 57500, Y: 77500}
			defend := r.assaultPolicy(nil, func() {
				if army := r.army(); len(army) > 0 {
					r.tryIssue(sim.Order{Kind: "attack_move", Entities: army, Position: backupScreen})
				}
				for _, producer := range []string{"factory", "barracks"} {
					if ids := r.ownedType(producer); len(ids) > 0 {
						r.tryIssue(sim.Order{Kind: "rally", Entities: ids[:1], Position: backupScreen})
					}
				}
			}, 0)
			damaged := false
			nextSortie := map[sim.ID]sim.Tick{}
			rebased := map[sim.ID]bool{}
			nextDiagnostic := sim.Tick(0)
			r.tactical = func() {
				defend()
				for _, id := range wings {
					actor, ok := r.seen(id)
					if !ok || actor.Private == nil {
						r.wait("original wing lost before evacuation", 0, func() bool { return false })
					}
					if damaged && r.engine.Tick() >= nextDiagnostic {
						t.Logf("wing status tick%d actor%d hp%d pos%+v landed%v state%s endurance%d service%d home%d orders%+v", r.engine.Tick(), id, actor.Private.HP, actor.Position, actor.Landed, actor.State, actor.Private.Endurance, actor.Private.ServiceWork, actor.Private.Home, actor.Private.Orders)
						if id == wings[len(wings)-1] {
							nextDiagnostic = r.engine.Tick() + 200
						}
					}
					if !damaged && actor.Private.HP < actor.Private.MaxHP {
						damaged = true
						t.Logf("real hostile wing damage: tick%d actor%d hp%d/%d", r.engine.Tick(), id, actor.Private.HP, actor.Private.MaxHP)
					}
					if damaged {
						if !rebased[id] && actor.Private.ServiceWork == 0 && r.tryIssue(sim.Order{Kind: "return", Entities: []sim.ID{id}, Target: backup}) {
							rebased[id] = true
							t.Logf("accepted ordinary rebase: tick%d actor%d target%d", r.engine.Tick(), id, backup)
						}
					} else if r.engine.Tick() >= nextSortie[id] && actor.Private.ServiceWork == 0 && (actor.Landed || len(actor.Private.Orders) == 0) {
						if r.tryIssue(sim.Order{Kind: "attack_move", Entities: []sim.ID{id}, Position: r.region("site3")}) {
							nextSortie[id] = r.engine.Tick() + 300
						}
					}
				}
			}
			r.wait("genuine marked-wing combat damage and both backup assignments", 10000, func() bool { return damaged && len(rebased) == len(wings) })
			r.wait("both original aircraft finish actual service at backup", 3000, func() bool {
				for _, id := range wings {
					actor, ok := r.seen(id)
					if !ok || actor.Private == nil || actor.Private.Home != backup || !actor.Landed || actor.Private.ServiceWork != 0 || actor.Private.HP != actor.Private.MaxHP {
						return false
					}
				}
				return true
			})
			r.checkpoint()
			r.wait("original airfield survives authored twelve-minute defense", 16000, func() bool { return r.engine.Outcome().Finished })
			r.finish()
		})
	}
}

func TestAuthoredOptionalFactoryCapture(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated optional enemy factory capture route")
	}
	for _, difficulty := range []string{"normal", "easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			r := newAuthoredRun(t, "sy-05-relay-break", difficulty, "")
			r.evidenceSuffix = "-optional-factory-captured"
			r.requiredOptional = "factory-captured"
			playCampaignCapture(r)
		})
	}
}

// A player adjusts a defense site when moving actors occupy the first choice.
// Candidate legality comes exclusively from the real Go preview and Submit.
func (r *authoredRun) buildOptionalDefense(point sim.Vec) {
	rig := r.ids("home-rig")
	r.issue(1, sim.Order{Kind: "move", Entities: rig, Position: sim.Vec{X: point.X + 4000, Y: point.Y}})
	var foundation sim.ID
	r.wait("ordinary legal nearby defense placement", 2400, func() bool {
		if foundation != 0 {
			return true
		}
		orders := []sim.Order{}
		for _, dy := range []int32{0, 2000, -2000, 4000, -4000} {
			for _, dx := range []int32{0, 2000, -2000, 4000, -4000} {
				orders = append(orders, sim.Order{Kind: "build", Entities: rig, Type: "turret", Position: sim.Vec{X: point.X + dx, Y: point.Y + dy}})
			}
		}
		for i := range orders {
			// Leave a conservative movement margin around the planned footprint.
			// This is a player-side choice, not a placement-rule replacement:
			// Go still previews and validates the eventual order.
			building, _ := r.catalog.Building("turret")
			busy := false
			for _, actor := range r.view().Entities {
				rx, ry := int32(2000), int32(2000)
				if b, known := r.catalog.Building(actor.Type); known {
					rx, ry = b.Width*500+500, b.Height*500+500
				}
				dx, dy := actor.Position.X-orders[i].Position.X, actor.Position.Y-orders[i].Position.Y
				if dx > -building.Width*500-rx && dx < building.Width*500+rx && dy > -building.Height*500-ry && dy < building.Height*500+ry {
					busy = true
					break
				}
			}
			if busy {
				continue
			}
			if r.tryIssue(orders[i]) {
				for _, v := range r.view().Entities {
					if v.Owner == 1 && v.Type == "turret" && v.Position == orders[i].Position {
						foundation = v.ID
						return true
					}
				}
			}
		}
		return false
	})
	r.wait("paid defensive turret completes", 2400, func() bool { v, ok := r.seen(foundation); return ok && v.Complete })
}
