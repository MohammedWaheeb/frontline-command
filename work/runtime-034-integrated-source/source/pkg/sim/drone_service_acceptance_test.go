package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

// Canonical drone-service test setup, with explicit prepared infrastructure.
// The ordinary research/production prerequisites and collision geometry remain
// valid. This is a synthetic mechanics fixture, not a claim about opening time.
func droneServiceFixture(t *testing.T) (*Engine, ID) {
	t.Helper()
	e := balanceEngine(t, balanceMap(), "IR", "US")
	ticks(e, 100)
	balancePrepared(e, 1, false)
	for _, entry := range []struct {
		typ      string
		position Vec
	}{
		{"radar", Vec{X: 12000, Y: 27000}},
		{"IR.drone_hub", Vec{X: 12000, Y: 35000}},
	} {
		rule, _ := e.buildingRule(entry.typ)
		e.spawn(entry.typ, 1, entry.position, true, rule.Cost)
		e.player(1).Spent += rule.Cost
	}
	e.recalculate()
	e.updateFog()
	return e, e.state.Entities[len(e.state.Entities)-1].ID
}

func droneFixtureActor(e *Engine, home ID, typ string) *Entity {
	rule, _ := e.catalog.Unit(typ)
	unit := e.spawn(typ, 1, Vec{}, true, rule.Cost)
	unit.Home = home
	unit.Position, _ = e.serviceLandingPosition(unit, e.entity(home))
	unit.LastPosition, unit.Anchor = unit.Position, unit.Position
	return unit
}

// Existing landed aircraft legitimately occupy their completed service structure's
// footprint. Validate the saved runtime state rather than re-testing construction
// placement against those occupants; all commands after this snapshot are real.
func droneRecord(t *testing.T, e *Engine, name string) *balanceRun {
	t.Helper()
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, replay.Initial)
	if err != nil {
		t.Fatalf("invalid drone fixture: %v", err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("drone fixture restore diverged")
	}
	return &balanceRun{t: t, e: e, replay: replay, name: name, initial: append([]byte(nil), replay.Initial...)}
}

func TestDroneLastEnduranceTickCanLandOnLegalReservedPad(t *testing.T) {
	for _, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr"} {
		t.Run(typ, func(t *testing.T) {
			e, home := droneServiceFixture(t)
			drone := droneFixtureActor(e, home, typ)
			drone.Landed, drone.Endurance = false, 1
			e.recalculate()
			e.updateFog()
			r := droneRecord(t, e, "drone-final-tick-"+typ)
			r.submit(1, Order{Kind: "return", Entities: []ID{drone.ID}})
			r.step()
			if e.entity(drone.ID) == nil || !drone.Landed || drone.Endurance != 0 || drone.ServiceWork == 0 {
				t.Fatal("aircraft was lost despite a legal reserved landing on its last endurance tick")
			}
			r.finish(map[string]any{"type": typ, "initial_endurance": 1, "landed": drone.Landed, "remaining_endurance": drone.Endurance})
		})
	}
}

func TestDroneHubLossPreservesLiveAircraftBeforeRemotePaidProduction(t *testing.T) {
	e, home := droneServiceFixture(t)
	rule, _ := e.buildingRule("IR.drone_hub")
	alternate := e.spawn("IR.drone_hub", 1, Vec{X: 24000, Y: 35000}, true, rule.Cost)
	e.player(1).Spent += rule.Cost
	for range 5 {
		droneFixtureActor(e, alternate.ID, "IR.isr")
	}
	returning := droneFixtureActor(e, home, "IR.isr")
	returning.Landed = false
	returning.Position = Vec{X: 36000, Y: 35000}
	returning.LastPosition, returning.Anchor = returning.Position, returning.Position
	returning.Endurance = 2000
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{alternate.ID}, Type: "IR.isr"})
	if len(alternate.Jobs) != 1 || !alternate.Jobs[0].Started || alternate.Jobs[0].Service != home {
		t.Fatal("remote production did not reserve the original owned hub")
	}
	paid := alternate.Jobs[0].Paid
	droneLethalImpact(e, home, e.Tick()+1)
	droneLethalImpact(e, returning.ID, e.Tick()+5)
	r := droneRecord(t, e, "drone-hub-loss-live-before-paid-queue")
	r.step()
	if e.entity(home) != nil || e.entity(returning.ID) == nil {
		t.Fatal("hub destruction or surviving flying drone missing", e.entity(home), e.entity(returning.ID))
	}
	r.step()
	if returning.Home != alternate.ID || alternate.Jobs[0].Service != 0 || alternate.Jobs[0].Paid != paid || alternate.State != "service_full" {
		t.Fatal("paid queue stole the live aircraft's replacement service reservation", returning.Home, alternate.Jobs[0], alternate.State)
	}
	blockedAt := e.Tick()
	blockedWork := alternate.Jobs[0].Work
	credits, spent := e.player(1).Credits, e.player(1).Spent
	for range 4 {
		r.step()
	}
	if e.entity(returning.ID) != nil || alternate.Jobs[0].Service != alternate.ID || alternate.Jobs[0].Work <= blockedWork || alternate.Jobs[0].Paid != paid || credits != e.player(1).Credits || spent != e.player(1).Spent {
		t.Fatal("blocked paid job failed retained-cost recovery after live slot released")
	}
	r.finish(map[string]any{"survivor_home_before_attrition": returning.Home, "paid_job_blocked_tick": blockedAt, "paid_job_blocked_work": blockedWork, "paid_job_resumed_tick": e.Tick(), "paid_job_resumed_work": alternate.Jobs[0].Work, "paid_job_home": alternate.Jobs[0].Service, "paid_job_retained": alternate.Jobs[0].Paid})
}

func droneRestoreContinuation(t *testing.T, e *Engine, steps uint32) {
	t.Helper()
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	copy, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	baseline, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if copy.Hash() != e.Hash() {
		t.Fatal("drone boundary restore changed state")
	}
	for range steps {
		copy.Advance()
		baseline.Advance()
		next, err := copy.Save()
		if err != nil {
			t.Fatal(err)
		}
		copy, err = Restore(e.catalog, next)
		if err != nil {
			t.Fatal(err)
		}
	}
	if copy.Hash() != baseline.Hash() {
		t.Fatal("drone save continuation diverged")
	}
}

func droneFarFromHome(v *Entity) {
	v.Landed = false
	v.Position = Vec{X: 60000, Y: 35000}
	v.LastPosition, v.Anchor = v.Position, v.Position
}

func droneLowPower(e *Engine) {
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Building && e.role(v) == "power" {
			v.Enabled = false
		}
	}
	e.recalculate()
}

func TestDroneEnduranceWarningAutomaticReturnAndPowerBoundaries(t *testing.T) {
	for _, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr"} {
		for _, low := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/low-power=%t", typ, low), func(t *testing.T) {
				e, home := droneServiceFixture(t)
				if low {
					droneLowPower(e)
				}
				if e.player(1).LowPower() != low {
					t.Fatal("power fixture incorrect")
				}
				v := droneFixtureActor(e, home, typ)
				droneFarFromHome(v)
				v.Endurance = 902
				r := droneRecord(t, e, fmt.Sprintf("drone-thresholds-%s-low-power-%t", typ, low))
				var warnings, returns int
				var warningTick, returnTick Tick
				for remaining := uint32(901); remaining >= 599; remaining-- {
					r.step()
					if v.Endurance != remaining || v.Landed {
						t.Fatalf("airborne clock changed: want %d got %d landed=%t", remaining, v.Endurance, v.Landed)
					}
					for _, event := range e.state.Events {
						if event.Entity != v.ID {
							continue
						}
						switch event.Kind {
						case "aircraft_return_soon":
							warnings++
							warningTick = e.Tick()
							if remaining != 900 || event.Scope != "owner" {
								t.Fatal("warning threshold/privacy changed", event)
							}
						case "aircraft_returning":
							returns++
							returnTick = e.Tick()
							if remaining != 600 || event.Scope != "owner" {
								t.Fatal("return threshold/privacy changed", event)
							}
						}
					}
					if remaining > 600 && len(v.Orders) > 0 {
						t.Fatal("automatic return started too early", remaining)
					}
					if remaining <= 600 && (len(v.Orders) == 0 || v.Orders[0].Kind != "return") {
						t.Fatal("automatic return missing")
					}
					if remaining == 901 || remaining == 900 || remaining == 601 || remaining == 600 {
						droneRestoreContinuation(t, e, 2)
					}
				}
				if warnings != 1 || returns != 1 {
					t.Fatal("duplicate/missing return events", warnings, returns)
				}
				r.finish(map[string]any{"type": typ, "low_power": low, "warning_tick": warningTick, "automatic_return_tick": returnTick, "warning_count": warnings, "automatic_return_count": returns, "remaining_endurance": v.Endurance})
			})
		}
	}
}

func TestDroneZeroEnduranceCannotReachReservedHome(t *testing.T) {
	for _, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr"} {
		t.Run(typ, func(t *testing.T) {
			e, home := droneServiceFixture(t)
			v := droneFixtureActor(e, home, typ)
			droneFarFromHome(v)
			v.Endurance = 1
			r := droneRecord(t, e, "drone-zero-loss-"+typ)
			r.submit(1, Order{Kind: "return", Entities: []ID{v.ID}})
			before := e.player(1).Lost
			r.step()
			if e.entity(v.ID) != nil || e.player(1).Lost-before != v.Paid {
				t.Fatal("zero endurance did not produce exactly one normal aircraft loss")
			}
			if e.freeService(1) != home {
				t.Fatal("lost aircraft kept its reservation")
			}
			r.finish(map[string]any{"type": typ, "lost_tick": e.Tick(), "lost_value": e.player(1).Lost - before})
		})
	}
}

func TestDroneServiceDurationIndependentSlotsAndNoPrematureRefill(t *testing.T) {
	for _, low := range []bool{false, true} {
		for _, upgraded := range []bool{false, true} {
			t.Run(fmt.Sprintf("low-power=%t/upgraded=%t", low, upgraded), func(t *testing.T) {
				e, home := droneServiceFixture(t)
				if low {
					droneLowPower(e)
				}
				if upgraded {
					e.player(1).Upgrades = append(e.player(1).Upgrades, "IR.drone_servicing")
				}
				types := []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr", "IR.fighter", "IR.isr"}
				var drones []*Entity
				expected := map[ID]uint32{}
				for _, typ := range types {
					v := droneFixtureActor(e, home, typ)
					v.Landed = true
					v.Endurance = 321
					v.Ammo = 0
					v.ServiceWork = 1
					v.Orders = []Order{{Kind: "return"}}
					drones = append(drones, v)
					sec := uint32(18)
					if typ == "IR.fighter" {
						sec = 20
					}
					if typ == "IR.strike" || typ == "IR.gunship" {
						sec = 24
					}
					work := sec * 40
					if upgraded {
						work = work * 85 / 100
					}
					rate := uint32(2)
					if low {
						rate = 1
					}
					expected[v.ID] = (work + rate - 1) / rate
				}
				r := droneRecord(t, e, fmt.Sprintf("drone-six-independent-services-low-power-%t-upgraded-%t", low, upgraded))
				start := e.Tick()
				credits, spent := e.player(1).Credits, e.player(1).Spent
				completion := map[ID]Tick{}
				for offset := uint32(1); offset <= 960; offset++ {
					r.step()
					for _, v := range drones {
						if !v.Landed || v.Home != home || v.HP != v.MaxHP {
							t.Fatal("service altered position/home/health")
						}
						if offset < expected[v.ID] {
							if v.Endurance != 321 || v.Ammo != 0 || v.ServiceWork == 0 {
								t.Fatal("service refilled early", v.Type, offset)
							}
						} else {
							if v.Endurance != 2400 || v.ServiceWork != 0 || len(v.Orders) != 0 {
								t.Fatal("service failed exact duration", v.Type, offset, expected[v.ID])
							}
							if weapon, armed := e.weapon(v); armed && v.Ammo != weapon.Ammo {
								t.Fatal("service ammunition missing")
							}
						}
					}
					for _, event := range e.state.Events {
						if event.Kind == "aircraft_serviced" {
							if completion[event.Entity] != 0 {
								t.Fatal("duplicate service event")
							}
							completion[event.Entity] = e.Tick()
						}
					}
					if offset == 305 || offset == 407 || offset == 719 {
						droneRestoreContinuation(t, e, 2)
					}
					if len(completion) == len(drones) {
						break
					}
				}
				if len(completion) != 6 || credits != e.player(1).Credits || spent != e.player(1).Spent {
					t.Fatal("service charged credits or failed independent slots")
				}
				for id, at := range completion {
					if at != start+Tick(expected[id]) {
						t.Fatal("wrong service boundary")
					}
				}
				r.finish(map[string]any{"low_power": low, "upgraded": upgraded, "start_tick": start, "service_ticks": expected, "completed_ticks": completion, "service_credit_cost": 0, "final_endurance": 2400})
			})
		}
	}
}

func droneLethalImpact(e *Engine, target ID, at Tick) {
	transportImpact(e, target, at, true)
	// Explicit hostile projectile fixture: one direct hit, no splash. Its
	// damage exceeds the full structure HP after the normal armor multiplier.
	e.state.Projectiles[len(e.state.Projectiles)-1].Damage = 100000000
}

func TestDroneHubLossEmergencyClampAndGroundLiftBoundaries(t *testing.T) {
	for _, landed := range []bool{false, true} {
		for _, endurance := range []uint32{2400, 1201, 1200, 901, 900, 601, 600, 2, 1, 0} {
			t.Run(fmt.Sprintf("landed=%t/endurance=%d", landed, endurance), func(t *testing.T) {
				e, home := droneServiceFixture(t)
				v := droneFixtureActor(e, home, "IR.isr")
				v.Landed = landed
				v.Endurance = endurance
				v.HP = v.MaxHP / 2
				if !landed {
					droneFarFromHome(v)
				}
				hp, ammo := v.HP, v.Ammo
				droneLethalImpact(e, home, e.Tick()+1)
				r := droneRecord(t, e, fmt.Sprintf("drone-emergency-landed-%t-endurance-%d", landed, endurance))
				start := e.Tick()
				r.step()
				if e.entity(home) != nil {
					t.Fatal("hub survived fixture direct hit")
				}
				if !landed && endurance <= 1 {
					if e.entity(v.ID) != nil {
						t.Fatal("already empty aircraft survived")
					}
					r.finish(map[string]any{"landed": landed, "initial_endurance": endurance, "lost_tick": e.Tick()})
					return
				}
				if e.entity(v.ID) == nil {
					t.Fatal("hub loss deleted its aircraft immediately")
				}
				r.step()
				expected := min(endurance, uint32(1200))
				if !landed {
					expected = min(endurance-1, uint32(1200)) - 1
				}
				if v.Endurance != expected || v.Home != 0 || v.HP != hp && expected != 0 {
					t.Fatal("emergency cap changed HP/endurance/home", v.Endurance, expected, v.Home, v.HP)
				}
				lostEvents := 0
				for _, event := range e.state.Events {
					if event.Kind == "service_lost" && event.Entity == v.ID {
						lostEvents++
						if event.Scope != "owner" {
							t.Fatal("emergency countdown not private")
						}
					}
				}
				if lostEvents != 1 {
					t.Fatal("missing one-time emergency countdown")
				}
				if landed {
					lift := start + 42
					if v.EmergencyTakeoffUntil != lift {
						t.Fatal("emergency takeoff duration", v.EmergencyTakeoffUntil, lift)
					}
					for e.Tick() < lift-1 {
						r.step()
						if !v.Landed || v.Endurance != expected || v.HP != hp || v.Ammo != ammo {
							t.Fatal("ground emergency changed retained state")
						}
					}
					droneRestoreContinuation(t, e, 2)
					r.step()
					if v.Landed || v.EmergencyTakeoffUntil != 0 {
						t.Fatal("emergency lift missed two-second boundary")
					}
					if expected <= 1 {
						if e.entity(v.ID) != nil {
							t.Fatal("empty emergency aircraft survived lift")
						}
					} else if v.Endurance != expected-1 || v.HP != hp || v.Ammo != ammo {
						t.Fatal("lift reset retained aircraft stats")
					}
				}
				r.finish(map[string]any{"landed_at_loss": landed, "initial_endurance": endurance, "clamped_endurance": expected, "remaining_endurance": v.Endurance, "hp": v.HP, "emergency_lift_tick": start + 42, "survived": e.entity(v.ID) != nil})
			})
		}
	}
}

func TestDroneFullServiceQueuesAttritionReassignmentAndLoss(t *testing.T) {
	e, home := droneServiceFixture(t)
	b, _ := e.buildingRule("IR.drone_hub")
	alt := e.spawn("IR.drone_hub", 1, Vec{X: 24000, Y: 35000}, true, b.Cost)
	e.player(1).Spent += b.Cost
	var source, occupants []*Entity
	for i, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr", "IR.fighter", "IR.isr"} {
		v := droneFixtureActor(e, home, typ)
		v.Endurance = 2400
		if i < 4 {
			droneFarFromHome(v)
			v.Position.X = 35000 + int32(i)*2500
			v.Anchor = v.Position
			v.LastPosition = v.Position
		} else {
			v.Landed = true
		}
		source = append(source, v)
	}
	for range 6 {
		v := droneFixtureActor(e, alt.ID, "IR.isr")
		v.Landed = true
		occupants = append(occupants, v)
	}
	droneLethalImpact(e, home, e.Tick()+3)
	droneLethalImpact(e, occupants[0].ID, e.Tick()+10)
	droneLethalImpact(e, occupants[1].ID, e.Tick()+11)
	r := droneRecord(t, e, "drone-full-queues-hub-loss-and-two-attrition-slots")
	start := e.Tick()
	credits, spent := e.player(1).Credits, e.player(1).Spent
	for _, producer := range []ID{home, alt.ID} {
		for range 6 {
			r.submit(1, Order{Kind: "train", Entities: []ID{producer}, Type: "IR.isr"})
		}
	}
	r.step()
	for _, producer := range []*Entity{e.entity(home), alt} {
		if len(producer.Jobs) != 6 || producer.Jobs[0].Started || producer.State != "service_full" {
			t.Fatal("full slot queue did not stay unpaid", producer.State, len(producer.Jobs))
		}
	}
	if e.player(1).Credits != credits || e.player(1).Spent != spent {
		t.Fatal("full queue charged for nonexistent slot")
	}
	var serviceLosses, unassignedLosses int
	var reassignments = map[ID]Tick{}
	var losses = map[ID]Tick{}
	warnings, automaticReturns := map[ID]Tick{}, map[ID]Tick{}
	for e.Tick() < start+1260 {
		r.step()
		for _, v := range source {
			if v.Home == alt.ID && reassignments[v.ID] == 0 {
				reassignments[v.ID] = e.Tick()
			}
			if e.entity(v.ID) == nil && losses[v.ID] == 0 {
				losses[v.ID] = e.Tick()
				unassignedLosses++
			}
		}
		for _, event := range e.state.Events {
			if event.Kind == "service_lost" {
				serviceLosses++
			}
			if event.Kind == "aircraft_return_soon" {
				if warnings[event.Entity] != 0 {
					t.Fatal("duplicate emergency warning")
				}
				warnings[event.Entity] = e.Tick()
			}
			if event.Kind == "aircraft_returning" {
				if automaticReturns[event.Entity] != 0 {
					t.Fatal("duplicate emergency automatic return")
				}
				automaticReturns[event.Entity] = e.Tick()
			}
		}
		if e.Tick() == start+4 || e.Tick() == start+9 || e.Tick() == start+11 || e.Tick() == start+1202 {
			droneRestoreContinuation(t, e, 3)
		}
		if len(alt.Jobs) != 6 || alt.Jobs[0].Started || e.player(1).Spent != spent {
			t.Fatal("waiting production displaced live returning aircraft")
		}
	}
	if serviceLosses != 6 || len(reassignments) != 2 || unassignedLosses != 4 {
		t.Fatal("fleet loss/reassignment accounting", serviceLosses, reassignments, losses)
	}
	if reassignments[source[0].ID] != start+11 || reassignments[source[1].ID] != start+12 {
		t.Fatal("released slots did not go to stable live-aircraft priority", reassignments)
	}
	for _, v := range source[:2] {
		if e.entity(v.ID) == nil || !v.Landed || v.Endurance != 2400 {
			t.Fatal("reassigned aircraft failed ordinary return and service", v.Type, v.State, v.Position, v.Endurance)
		}
	}
	if e.freeService(1) != 0 {
		t.Fatal("six final aircraft failed to reserve all slots")
	}
	for i, v := range source[2:] {
		expected := start + 1203
		if i >= 2 {
			expected = start + 1243
		}
		if losses[v.ID] != expected {
			t.Fatal("unassigned attrition missed exact airborne/grounded expiry", v.ID, losses[v.ID], expected)
		}
		if warnings[v.ID] != expected-900 || automaticReturns[v.ID] != expected-600 {
			t.Fatal("emergency flight skipped exact warning/automatic return", v.ID, warnings[v.ID], automaticReturns[v.ID])
		}
	}
	r.finish(map[string]any{"initial_aircraft": 12, "initial_queued_orders": 12, "hub_loss_tick": start + 3, "service_loss_notifications": serviceLosses, "replacement_slot_claim_ticks": reassignments, "unassigned_loss_ticks": losses, "emergency_warning_ticks": warnings, "emergency_automatic_return_ticks": automaticReturns, "final_live_aircraft": len(balanceOwned(e, 1, "IR.isr")) + len(balanceOwned(e, 1, "IR.fighter")) + len(balanceOwned(e, 1, "IR.strike")), "surviving_unpaid_queue": len(alt.Jobs), "new_production_cost": e.player(1).Spent - spent})
}

func TestDroneRepeatedHubLossDoesNotRestartEmergencyLiftOrRefill(t *testing.T) {
	for _, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr"} {
		t.Run(typ, func(t *testing.T) {
			e, home := droneServiceFixture(t)
			b, _ := e.buildingRule("IR.drone_hub")
			alt := e.spawn("IR.drone_hub", 1, Vec{X: 24000, Y: 35000}, true, b.Cost)
			final := e.spawn("IR.drone_hub", 1, Vec{X: 36000, Y: 35000}, true, b.Cost)
			e.player(1).Spent += b.Cost * 2
			v := droneFixtureActor(e, home, typ)
			v.Landed = true
			v.Endurance = 1400
			v.HP = v.MaxHP / 2
			if v.Ammo > 0 {
				v.Ammo--
			}
			hp, ammo := v.HP, v.Ammo
			start := e.Tick()
			droneLethalImpact(e, home, start+1)
			droneLethalImpact(e, alt.ID, start+20)
			r := droneRecord(t, e, "drone-repeated-loss-"+typ)
			var notifications int
			for e.Tick() < start+42 {
				r.step()
				for _, event := range e.state.Events {
					if event.Kind == "service_lost" && event.Entity == v.ID {
						notifications++
					}
				}
				if e.Tick() == start+2 && v.Home != alt.ID {
					t.Fatal("first rebase missing")
				}
				if e.Tick() >= start+21 && v.Home != final.ID {
					t.Fatal("second rebase missing")
				}
				if e.Tick() < start+42 && (v.HP != hp || v.Ammo != ammo || !v.Landed || e.Tick() >= start+2 && v.Endurance != 1200) {
					t.Fatal("emergency setup altered HP/ammo/ground clock")
				}
				if e.Tick() == start+21 || e.Tick() == start+41 {
					droneRestoreContinuation(t, e, 2)
				}
			}
			if notifications != 2 || v.Landed || v.Endurance != 1199 || v.HP != hp || v.Ammo != ammo || v.EmergencyTakeoffUntil != 0 {
				t.Fatal("repeated loss restarted lift or changed retained stats", notifications, v)
			}
			r.finish(map[string]any{"type": typ, "hub_loss_ticks": []Tick{start + 1, start + 20}, "takeoff_tick": e.Tick(), "service_loss_count": notifications, "remaining_endurance": v.Endurance, "hp": v.HP, "ammo": v.Ammo})
		})
	}
}

func TestDronePaidReservationReplacementCompletionAndWaitingQueue(t *testing.T) {
	e, home := droneServiceFixture(t)
	b, _ := e.buildingRule("IR.drone_hub")
	alt := e.spawn("IR.drone_hub", 1, Vec{X: 24000, Y: 35000}, true, b.Cost)
	e.player(1).Spent += b.Cost
	for range 5 {
		v := droneFixtureActor(e, alt.ID, "IR.isr")
		v.Landed = true
	}
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{alt.ID}, Type: "IR.isr"})
	if !alt.Jobs[0].Started || alt.Jobs[0].Service != home {
		t.Fatal("initial remote paid slot missing")
	}
	paid, work := alt.Jobs[0].Paid, alt.Jobs[0].Work
	droneLethalImpact(e, home, e.Tick()+1)
	r := droneRecord(t, e, "drone-paid-reservation-rebase-complete-full-queue")
	start := e.Tick()
	credits, spent := e.player(1).Credits, e.player(1).Spent
	for range 5 {
		r.submit(1, Order{Kind: "train", Entities: []ID{alt.ID}, Type: "IR.isr"})
	}
	r.step()
	r.step()
	if alt.Jobs[0].Service != alt.ID || alt.Jobs[0].Paid != paid || alt.Jobs[0].Work <= work {
		t.Fatal("paid reservation failed replacement/resume")
	}
	var ready Tick
	var created ID
	for e.Tick() < start+800 {
		r.step()
		for _, event := range e.state.Events {
			if event.Kind == "unit_ready" {
				ready = e.Tick()
				created = event.Entity
			}
		}
		if ready != 0 {
			break
		}
	}
	if ready == 0 || created == 0 {
		t.Fatal("paid replacement never completed")
	}
	if e.entity(created).Endurance != 2400 || !e.entity(created).Landed || e.entity(created).Home != alt.ID {
		t.Fatal("new drone did not receive its full ordinary 120-second endurance and reserved home")
	}
	r.step()
	if len(alt.Jobs) != 5 || alt.Jobs[0].Started || alt.State != "service_full" || e.freeService(1) != 0 || len(balanceOwned(e, 1, "IR.isr")) != 6 || credits != e.player(1).Credits || spent != e.player(1).Spent {
		t.Fatal("completion lost reservation or let waiting queue oversubscribe")
	}
	droneRestoreContinuation(t, e, 2)
	r.finish(map[string]any{"paid_job_cost": paid, "retained_initial_progress": work, "completion_tick": ready, "created_drone": created, "unpaid_waiting_jobs": len(alt.Jobs), "additional_cost": e.player(1).Spent - spent})
}

func TestDroneManualReturnDoesNotRestartAtAutomaticThreshold(t *testing.T) {
	e, home := droneServiceFixture(t)
	v := droneFixtureActor(e, home, "IR.isr")
	droneFarFromHome(v)
	v.Endurance = 602
	r := droneRecord(t, e, "drone-manual-return-at-automatic-threshold")
	r.submit(1, Order{Kind: "return", Entities: []ID{v.ID}})
	r.submit(1, Order{Kind: "move", Entities: []ID{v.ID}, Position: Vec{X: 32000, Y: 50000}, Queued: true})
	for range 4 {
		r.step()
		if len(v.Orders) != 2 || v.Orders[0].Kind != "return" || v.Orders[1].Kind != "move" {
			t.Fatal("automatic threshold replaced manual return/queued command")
		}
		for _, event := range e.state.Events {
			if event.Kind == "aircraft_returning" && event.Entity == v.ID {
				t.Fatal("already returning aircraft repeated automatic notification")
			}
		}
	}
	r.finish(map[string]any{"remaining_endurance": v.Endurance, "preserved_orders": v.Orders})
}

func TestDroneCapturedHubPrioritizesOwnedSurvivorOverPaidRemoteJob(t *testing.T) {
	e, home := droneServiceFixture(t)
	b, _ := e.buildingRule("IR.drone_hub")
	alt := e.spawn("IR.drone_hub", 1, Vec{X: 24000, Y: 35000}, true, b.Cost)
	e.player(1).Spent += b.Cost
	for range 5 {
		v := droneFixtureActor(e, alt.ID, "IR.isr")
		v.Landed = true
	}
	v := droneFixtureActor(e, home, "IR.isr")
	droneFarFromHome(v)
	e.entity(home).HP = e.entity(home).MaxHP / 5
	engineer := e.spawn("US.engineer", 2, Vec{X: 12000, Y: 32000}, true, 500000)
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{alt.ID}, Type: "IR.isr"})
	paid := alt.Jobs[0].Paid
	if alt.Jobs[0].Service != home {
		t.Fatal("remote reservation missing")
	}
	r := droneRecord(t, e, "drone-captured-hub-live-priority-over-paid-queue")
	r.submit(2, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: home})
	for e.entity(home).Owner == 1 && e.Tick() < 500 {
		r.step()
	}
	if e.entity(home).Owner != 2 || v.Owner != 1 || v.Home != alt.ID || v.Endurance > 1200 || alt.Jobs[0].Service != 0 || alt.Jobs[0].Paid != paid {
		t.Fatal("capture transferred drone, retained hostile home, or lost paid job")
	}
	captured := e.Tick()
	droneRestoreContinuation(t, e, 2)
	r.step()
	if alt.State != "service_full" || alt.Jobs[0].Started != true || e.freeService(1) != 0 {
		t.Fatal("paid job used new enemy capacity or displaced survivor")
	}
	r.finish(map[string]any{"capture_tick": captured, "converted_type": e.entity(home).Type, "drone_owner": v.Owner, "drone_home": v.Home, "emergency_endurance": v.Endurance, "paid_job_retained": alt.Jobs[0].Paid, "paid_job_service": alt.Jobs[0].Service})
}

func TestDroneReturningReservationCannotBeStolenByNewProduction(t *testing.T) {
	e, home := droneServiceFixture(t)
	for range 5 {
		v := droneFixtureActor(e, home, "IR.isr")
		v.Landed = true
	}
	v := droneFixtureActor(e, home, "IR.strike")
	droneFarFromHome(v)
	r := droneRecord(t, e, "drone-returning-slot-blocks-production")
	credits := e.player(1).Credits
	r.submit(1, Order{Kind: "return", Entities: []ID{v.ID}})
	r.submit(1, Order{Kind: "train", Entities: []ID{home}, Type: "IR.isr"})
	for range 100 {
		r.step()
		producer := e.entity(home)
		if producer.Jobs[0].Started || producer.State != "service_full" || e.freeService(1) != 0 || e.player(1).Credits != credits {
			t.Fatal("production stole returning slot")
		}
	}
	r.finish(map[string]any{"returning_drone": v.ID, "reserved_home": v.Home, "waiting_queue": e.entity(home).Jobs, "production_cost": credits - e.player(1).Credits})
}

func TestDroneRecallFourUnitsUsesOrdinaryEnduranceAndCannotFire(t *testing.T) {
	e, home := droneServiceFixture(t)
	e.player(1).Energy = 100000
	var ids []ID
	ammo := map[ID]int32{}
	for i, typ := range []string{"IR.fighter", "IR.strike", "IR.gunship", "IR.isr"} {
		v := droneFixtureActor(e, home, typ)
		droneFarFromHome(v)
		v.Position.X = 80000
		v.Position.Y += int32(i) * 2000
		v.Anchor = v.Position
		v.LastPosition = v.Position
		v.Endurance = 1800
		ids = append(ids, v.ID)
		ammo[v.ID] = v.Ammo
	}
	// Visible valid air/ground opposition gives the no-fire rule a real target.
	enemyHome := e.spawn("US.airfield", 2, Vec{X: 92000, Y: 37000}, true, 2000000)
	air := e.spawn("US.fighter", 2, Vec{X: 84000, Y: 33500}, true, 1200000)
	air.Home = enemyHome.ID
	air.Landed = false
	e.spawn("US.rig", 2, Vec{X: 80500, Y: 39000}, true, 1200000)
	r := droneRecord(t, e, "drone-recall-four-no-fire-no-endurance-reset")
	start := e.Tick()
	r.submit(1, Order{Kind: "ability", Type: "drone_recall", Entities: ids})
	for offset := uint32(1); offset <= 160; offset++ {
		r.step()
		for _, id := range ids {
			v := e.entity(id)
			if v == nil {
				t.Fatal("recall fixture drone destroyed before expiry")
			}
			if v.Endurance != 1800-offset || v.Landed || v.Ammo != ammo[id] || !e.hasBuff(v, "recall") {
				t.Fatal("recall refilled endurance/ammo, fired, or ended early", v.Type, offset, v.Endurance, v.Ammo)
			}
		}
		for _, event := range e.state.Events {
			if event.Kind == "weapon_fired" && event.Owner == 1 {
				t.Fatal("recalled drone fired")
			}
		}
	}
	if !cooldown(e.player(1).Cooldowns, "drone_recall", e.Tick()) {
		t.Fatal("recall cooldown missing")
	}
	r.step()
	for _, id := range ids {
		if e.hasBuff(e.entity(id), "recall") {
			t.Fatal("recall lasted past eight seconds")
		}
	}
	r.finish(map[string]any{"activation_tick": start + 1, "buff_expiry_tick": start + 161, "selected_drones": ids, "remaining_endurance": e.entity(ids[0]).Endurance, "ammo": ammo, "energy_cost": 45000})
}

func TestDroneServiceIsOwnedRatherThanAlliedOrEnemyCapacity(t *testing.T) {
	m := balanceMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 86000, Y: 10000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 2505, Players: []PlayerConfig{{ID: 1, Faction: "IR", Team: 1}, {ID: 2, Faction: "IR", Team: 1}, {ID: 3, Faction: "IR", Team: 3}}})
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 100)
	b, _ := e.buildingRule("IR.drone_hub")
	ally := e.spawn("IR.drone_hub", 2, Vec{X: 24000, Y: 35000}, true, b.Cost)
	enemy := e.spawn("IR.drone_hub", 3, Vec{X: 40000, Y: 35000}, true, b.Cost)
	u, _ := e.catalog.Unit("IR.isr")
	v := e.spawn("IR.isr", 1, Vec{X: 28000, Y: 35000}, true, u.Cost)
	v.Landed = false
	v.Endurance = 800
	r := droneRecord(t, e, "drone-owned-only-service-with-allied-and-hostile-spare-slots")
	r.submit(1, Order{Kind: "return", Entities: []ID{v.ID}})
	for range 40 {
		r.step()
		if v.Home != 0 || v.Landed || e.freeService(1) != 0 || e.freeService(2) != ally.ID || e.freeService(3) != enemy.ID {
			t.Fatal("aircraft stole foreign compatible slot")
		}
	}
	if v.Endurance != 760 {
		t.Fatal("foreign capacity paused or refilled fuel")
	}
	r.finish(map[string]any{"allied_free_home": ally.ID, "enemy_free_home": enemy.ID, "owned_free_home": e.freeService(1), "aircraft_home": v.Home, "remaining_endurance": v.Endurance})
}
