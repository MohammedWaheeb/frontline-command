package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// These are synthetic acceptance scenarios, never shipping maps or an alternate
// combat/economy implementation. Fixture grants and prepared assets are explicit
// in the evidence. Every command after the initial save goes through Submit.
type balanceRun struct {
	t       *testing.T
	e       *Engine
	replay  *Replay
	name    string
	initial []byte
}

func balanceMap() content.Map {
	m := content.Map{ID: "balance-acceptance-fixture", Title: "Synthetic balance acceptance", Author: "Go automated tests", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 96, Height: 96,
		Spawns: []content.Spawn{{Position: Vec{X: 10000, Y: 10000}}, {Position: Vec{X: 86000, Y: 86000}}},
		Fields: []content.Field{{ID: 1, Position: Vec{X: 17000, Y: 10000}, Credits: 36000000}, {ID: 2, Position: Vec{X: 79000, Y: 86000}, Credits: 36000000}}, Shipment: Vec{X: 48000, Y: 48000}}
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}

func balanceEngine(t *testing.T, m content.Map, a, b string) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: m, Seed: 2505, Players: []PlayerConfig{{ID: 1, Name: "Fixture A", Faction: a, Team: 1}, {ID: 2, Name: "Fixture B", Faction: b, Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func balanceRecord(t *testing.T, e *Engine, name string) *balanceRun {
	t.Helper()
	e.recalculate()
	e.updateFog()
	for _, v := range e.state.Entities {
		if !v.Building {
			continue
		}
		b, _ := e.buildingRule(v.Type)
		if !e.prerequisites(e.player(v.Owner), b.Prerequisites) || !e.aiInBuildRadius(e.player(v.Owner), v.Type, v.Position) {
			t.Fatalf("fixture structure lacks normal prerequisites/build zone: %s %+v", v.Type, v.Position)
		}
		placement := *e
		placement.state = e.state
		placement.state.Entities = nil
		for _, other := range e.state.Entities {
			if other.ID != v.ID {
				placement.state.Entities = append(placement.state.Entities, other)
			}
		}
		if code := placement.validPlacement(v.Owner, v.Position, b.Width, b.Height); code != "ok" {
			t.Fatalf("fixture structure violates normal placement (%s): %s %+v", code, v.Type, v.Position)
		}
	}
	r, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	copy, err := Restore(e.catalog, r.Initial)
	if err != nil {
		t.Fatalf("invalid initial fixture: %v", err)
	}
	if copy.Hash() != e.Hash() {
		t.Fatal("initial fixture failed exact restore")
	}
	return &balanceRun{t: t, e: e, replay: r, name: name, initial: append([]byte(nil), r.Initial...)}
}

func (r *balanceRun) submit(p PlayerID, orders ...Order) {
	r.t.Helper()
	if err := r.e.Submit(p, r.e.player(p).LastSequence+1, orders); err != nil {
		r.t.Fatalf("tick %d player %d commands %+v: %v", r.e.Tick(), p, orders, err)
	}
}

func (r *balanceRun) step() {
	r.t.Helper()
	r.e.Advance()
	for _, result := range r.e.state.Results {
		if !result.Accepted {
			r.t.Fatalf("tick %d rejected fixture command: %+v", r.e.Tick(), result)
		}
	}
	for _, p := range r.e.state.Players {
		if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
			r.t.Fatalf("economic invariant: %+v", p)
		}
	}
	if r.e.Tick()%400 == 0 {
		if err := r.replay.Capture(r.e, false); err != nil {
			r.t.Fatal(err)
		}
	}
}

func (r *balanceRun) finish(measurements any) {
	r.t.Helper()
	if err := r.replay.Capture(r.e, false); err != nil {
		r.t.Fatal(err)
	}
	packed, err := r.replay.Encode()
	if err != nil {
		r.t.Fatal(err)
	}
	replay, err := DecodeReplay(packed)
	if err != nil {
		r.t.Fatal(err)
	}
	// No checkpoints: seeking the end must re-execute the complete command trace.
	copy, err := replay.Seek(r.e.catalog, r.e.Tick())
	if err != nil {
		r.t.Fatal(err)
	}
	if copy.Hash() != r.e.Hash() {
		r.t.Fatalf("full replay diverged: %s != %s", copy.Hash(), r.e.Hash())
	}
	result, err := json.MarshalIndent(struct {
		Scenario       string   `json:"scenario"`
		Metadata       Metadata `json:"metadata"`
		FinalTick      Tick     `json:"final_tick"`
		FinalHash      string   `json:"final_hash"`
		ReplayVerified bool     `json:"replay_verified"`
		Measurements   any      `json:"measurements"`
	}{r.name, r.e.Metadata(), r.e.Tick(), r.e.Hash(), true, measurements}, "", "  ")
	if err != nil {
		r.t.Fatal(err)
	}
	r.t.Log(string(result))
	if root := os.Getenv("FRONTLINE_BALANCE_EVIDENCE"); root != "" {
		dir := filepath.Join(root, r.name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			r.t.Fatal(err)
		}
		commands, err := json.MarshalIndent(r.e.state.Log, "", "  ")
		if err != nil {
			r.t.Fatal(err)
		}
		for name, data := range map[string][]byte{"initial.save.json": r.initial, "commands.json": commands, "result.json": result, "replay.fcr": packed} {
			if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil {
				r.t.Fatal(err)
			}
		}
	}
}

func balanceOwned(e *Engine, p PlayerID, typ string) []*Entity {
	var result []*Entity
	for _, v := range e.state.Entities {
		if v.Owner == p && v.Type == typ && v.HP > 0 {
			result = append(result, v)
		}
	}
	return result
}

// Prepared infrastructure is paid from an explicit fixture grant. The bundled
// supply hauler exists but is parked; it cannot silently finance army comparisons.
func balancePrepared(e *Engine, p PlayerID, air bool) (int64, ID) {
	types := []string{"power", "supply", "barracks", "outpost", "factory"}
	positions := []Vec{{X: 5000, Y: 18000}, {X: 13000, Y: 20000}, {X: 21000, Y: 18000}, {X: 16000, Y: 30000}, {X: 22000, Y: 27000}}
	if air {
		types = append(types, "radar", "US.airfield")
		positions = append(positions, Vec{X: 12000, Y: 27000}, Vec{X: 12000, Y: 35000})
	}
	var cost int64
	var service ID
	for i, typ := range types {
		pos := positions[i]
		if p == 2 {
			pos = Vec{X: 96000 - pos.X, Y: 96000 - pos.Y}
		}
		b, _ := e.buildingRule(typ)
		v := e.spawn(typ, p, pos, true, b.Cost)
		cost += b.Cost
		if typ == "supply" {
			v.IncludedHauler = true
			h := e.spawn(e.player(p).Faction+".hauler", p, Vec{X: pos.X, Y: pos.Y + 4000}, true, 900000)
			h.Orders = []Order{{Kind: "hold"}}
		}
		if b.ServiceSlots > 0 {
			service = v.ID
		}
	}
	e.player(p).Spent += cost
	return cost, service
}

type balanceArmy struct {
	Player          PlayerID `json:"player"`
	Type            string   `json:"type"`
	Count           int      `json:"initial_count"`
	InitialSupply   int32    `json:"initial_supply"`
	ArmyCost        int64    `json:"army_cost_milli_credits"`
	Surplus         int64    `json:"surplus_milli_credits"`
	Remaining       int      `json:"remaining_count"`
	RemainingHP     int64    `json:"remaining_milli_hp"`
	RemainingValue  int64    `json:"remaining_full_unit_value_milli_credits"`
	SurvivingSupply int32    `json:"surviving_supply"`
	LostValue       int64    `json:"lost_value_milli_credits"`
}

func TestBalanceGroundCompositions(t *testing.T) {
	if testing.Short() {
		t.Skip("measured balance matrix; run explicitly without -short")
	}
	families := []struct {
		name, a, b string
		budget     int64
		supply     int32
	}{
		{"rifles-versus-cars", "US.rifle", "IR.car", 3000000, 12},
		{"at-versus-tanks", "US.at", "SA.tank", 2800000, 8},
	}
	for _, f := range families {
		for _, constraint := range []string{"equal-credit", "equal-supply"} {
			for _, cover := range []bool{false, true} {
				for _, mirror := range []bool{false, true} {
					name := fmt.Sprintf("ground-%s-%s-cover-%t-mirror-%t", f.name, constraint, cover, mirror)
					t.Run(name, func(t *testing.T) {
						m := balanceMap()
						if cover {
							for y := 30; y < 66; y++ {
								for x := 24; x < 72; x++ {
									m.Tiles[y*96+x].Terrain = "cover"
								}
							}
						}
						e := balanceEngine(t, m, strings.Split(f.a, ".")[0], strings.Split(f.b, ".")[0])
						var armies [2]balanceArmy
						var ids [2][]ID
						var infrastructure int64
						for side, typ := range []string{f.a, f.b} {
							p := PlayerID(side + 1)
							infrastructure, _ = balancePrepared(e, p, false)
							u, _ := e.catalog.Unit(typ)
							count := int(f.budget / u.Cost)
							if constraint == "equal-supply" {
								count = int(f.supply / u.Supply)
							}
							spent := int64(count) * u.Cost
							e.player(p).Credits = f.budget - spent
							e.player(p).Spent += spent
							armies[side] = balanceArmy{Player: p, Type: typ, Count: count, InitialSupply: int32(count) * u.Supply, ArmyCost: spent, Surplus: f.budget - spent}
							x := int32(38000 + side*20000)
							if mirror {
								x = 96000 - x
							}
							for i := 0; i < count; i++ {
								pos := Vec{X: x + int32(i%3-1)*1600, Y: 48000 + int32(i/3)*1600 - 2400}
								v := e.spawn(typ, p, pos, true, u.Cost)
								ids[side] = append(ids[side], v.ID)
							}
						}
						r := balanceRecord(t, e, name)
						for e.state.Countdown > 0 {
							r.step()
						}
						start := e.Tick()
						for side := range armies {
							x := int32(58000 - side*20000)
							if mirror {
								x = 96000 - x
							}
							r.submit(PlayerID(side+1), Order{Kind: "attack_move", Entities: ids[side], Position: Vec{X: x, Y: 48000}})
						}
						winner := "combat-timeout"
						for e.Tick()-start < 3600 {
							// Re-form on visible enemy positions every five seconds;
							// without sight, search the agreed arena center. A single
							// passing attack-move can leave separated survivors idle.
							if elapsed := e.Tick() - start; elapsed > 0 && elapsed%100 == 0 {
								for side, a := range armies {
									var liveIDs []ID
									for _, v := range balanceOwned(e, a.Player, a.Type) {
										liveIDs = append(liveIDs, v.ID)
									}
									pos := Vec{X: 48000, Y: 48000}
									var x, y, count int32
									other := armies[1-side]
									for _, v := range balanceOwned(e, other.Player, other.Type) {
										if e.canSeeEntity(a.Player, v) {
											x += v.Position.X
											y += v.Position.Y
											count++
										}
									}
									if count > 0 {
										pos = Vec{X: x / count, Y: y / count}
									}
									r.submit(a.Player, Order{Kind: "attack_move", Entities: liveIDs, Position: pos})
								}
							}
							r.step()
							a, b := len(balanceOwned(e, 1, f.a)), len(balanceOwned(e, 2, f.b))
							if a == 0 || b == 0 {
								winner = "mutual-elimination"
								if a > 0 {
									winner = "player-1"
								}
								if b > 0 {
									winner = "player-2"
								}
								break
							}
						}
						casualties := 0
						for side := range armies {
							a := &armies[side]
							survivors := balanceOwned(e, a.Player, a.Type)
							u, _ := e.catalog.Unit(a.Type)
							a.Remaining = len(survivors)
							a.RemainingValue = int64(len(survivors)) * u.Cost
							a.SurvivingSupply = int32(len(survivors)) * u.Supply
							a.LostValue = a.ArmyCost - a.RemainingValue
							for _, v := range survivors {
								a.RemainingHP += v.HP
							}
							casualties += a.Count - a.Remaining
							if e.player(a.Player).Income != 0 || e.player(a.Player).Credits != a.Surplus {
								t.Fatal("isolated army scenario acquired hidden income or spending")
							}
						}
						if casualties == 0 {
							t.Fatal("armies did not engage")
						}
						if winner == "combat-timeout" {
							t.Fatal("regrouped armies failed to resolve within three minutes")
						}
						r.finish(map[string]any{"constraint": constraint, "cover": cover, "mirror": mirror, "army_budget_milli_credits_each": f.budget, "prepared_infrastructure_cost_milli_credits_each": infrastructure, "fixture_credit_grant_each": infrastructure + f.budget, "setup": "Prepared paid assets; standard HP, weapons, fog, movement and Supply; no harvesting or reinforcements.", "command_policy": "Initial opposing-center attack-move; every five seconds attack-move to the visible enemy centroid, or arena center when no enemy is visible.", "combat_ticks": e.Tick() - start, "combat_outcome": winner, "armies": armies})
					})
				}
			}
		}
	}
}

type balanceMilestone struct {
	Tick     Tick     `json:"tick"`
	Player   PlayerID `json:"player"`
	Kind     string   `json:"kind"`
	Type     string   `json:"type"`
	Position Vec      `json:"position"`
	Credits  int64    `json:"credits_milli"`
	Income   int64    `json:"income_milli"`
	Spent    int64    `json:"spent_milli"`
}

type balanceOpening struct {
	Player                                  PlayerID `json:"player"`
	Name                                    string   `json:"name"`
	Structures                              []string `json:"build_sequence"`
	Unit                                    string   `json:"target_unit,omitempty"`
	ExtraHauler                             bool     `json:"extra_hauler"`
	Scout                                   bool     `json:"scout"`
	Ready                                   Tick     `json:"ready_tick"`
	ReadyCredits                            int64    `json:"ready_credits_milli"`
	ReadyIncome                             int64    `json:"ready_income_milli"`
	ReadySpent                              int64    `json:"ready_spent_milli"`
	BuilderTravel                           int64    `json:"builder_travel_fixed_units"`
	CashWaitTicks                           uint32   `json:"foundation_cash_wait_ticks"`
	QueueCashWaitTicks                      uint32   `json:"unit_queue_cash_wait_ticks"`
	LowPowerTicks                           uint32   `json:"low_power_ticks"`
	next                                    int
	current                                 ID
	haulerQueued, scoutQueued, targetQueued bool
}

func balanceFindRole(e *Engine, p PlayerID, role string) *Entity {
	for _, v := range e.state.Entities {
		if v.Owner == p && v.HP > 0 && v.Complete && e.role(v) == role {
			return v
		}
	}
	return nil
}

func balancePlacement(e *Engine, p PlayerID, typ string, center Vec) (Vec, bool) {
	b, _ := e.buildingRule(typ)
	for r := int32(4000); r <= 14000; r += 1000 {
		for _, d := range neighbors {
			pos := Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500}
			if e.aiInBuildRadius(e.player(p), typ, pos) && e.validPlacement(p, pos, b.Width, b.Height) == "ok" {
				return pos, true
			}
		}
	}
	return Vec{}, false
}

func (o *balanceOpening) plan(r *balanceRun) {
	e := r.e
	p := e.player(o.Player)
	if o.Ready != 0 || e.state.Countdown > 0 {
		return
	}
	if o.current != 0 {
		if v := e.entity(o.current); v.Complete {
			o.next++
			o.current = 0
		}
	}
	var orders []Order
	if o.ExtraHauler && !o.haulerQueued {
		if v := balanceFindRole(e, o.Player, "supply"); v != nil {
			orders = append(orders, Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".hauler"})
			o.haulerQueued = true
		}
	}
	if o.Scout && !o.scoutQueued {
		if v := balanceFindRole(e, o.Player, "barracks"); v != nil {
			orders = append(orders, Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".recon"})
			o.scoutQueued = true
		}
	}
	if o.Unit != "" && !o.targetQueued {
		u, _ := e.catalog.Unit(o.Unit)
		if v := balanceFindRole(e, o.Player, u.Producer); v != nil && p.Tier >= u.Tier {
			orders = append(orders, Order{Kind: "train", Entities: []ID{v.ID}, Type: o.Unit})
			o.targetQueued = true
		}
	}
	if o.current == 0 && o.next < len(o.Structures) {
		typ := o.Structures[o.next]
		b, _ := e.buildingRule(typ)
		if p.Credits < b.Cost {
			o.CashWaitTicks++
		} else {
			center := balanceFindRole(e, o.Player, "hq").Position
			if typ == "supply" {
				center = e.state.Map.Fields[int(o.Player)-1].Position
			}
			if pos, ok := balancePlacement(e, o.Player, typ, center); ok {
				rig := balanceFindRole(e, o.Player, "rig")
				orders = append(orders, Order{Kind: "build", Entities: []ID{rig.ID}, Type: typ, Position: pos})
				// Execute assigns the next globally unique entity ID. Do not guess
				// it here: both players may place in the same authoritative tick.
			}
		}
	}
	if len(orders) > 0 {
		r.submit(o.Player, orders...)
	}
}

func (o *balanceOpening) observe(e *Engine, oldRig Vec) {
	if o.Ready != 0 {
		return
	}
	p := e.player(o.Player)
	if rig := balanceFindRole(e, o.Player, "rig"); rig != nil {
		o.BuilderTravel += int64(distance(oldRig, rig.Position))
	}
	if p.PowerDemand > p.PowerCapacity {
		o.LowPowerTicks++
	}
	for _, v := range e.state.Entities {
		if v.Owner != o.Player {
			continue
		}
		if !v.Complete && o.next < len(o.Structures) && v.Type == o.Structures[o.next] {
			o.current = v.ID
		}
		if v.State == "insufficient_credits" {
			o.QueueCashWaitTicks++
		}
	}
	ready := false
	if o.Unit != "" {
		ready = len(balanceOwned(e, o.Player, o.Unit)) > 0
	} else if o.next == len(o.Structures)-1 && o.current != 0 {
		ready = e.entity(o.current).Complete
	}
	if ready {
		o.Ready = e.Tick()
		o.ReadyCredits = p.Credits
		o.ReadyIncome = p.Income
		o.ReadySpent = p.Spent
	}
}

func TestBalanceLegalAirAndAAOpenings(t *testing.T) {
	if testing.Short() {
		t.Skip("measured balance matrix; run explicitly without -short")
	}
	airPlans := []struct{ faction, service, unit string }{
		{"US", "US.airfield", "US.strike"}, {"IR", "IR.drone_hub", "IR.strike"}, {"SY", "SY.workshop_air", "SY.scout_drone"}, {"SA", "SA.airfield", "SA.strike"},
	}
	for _, a := range airPlans {
		for _, profile := range []string{"economy-scout-air", "rush-one-hauler", "rush-two-haulers"} {
			for _, response := range []string{"urgent-static-aa", "urgent-portable-aa", "economy-mobile-aa"} {
				name := "opening-" + a.unit + "-" + profile + "-versus-" + response
				t.Run(name, func(t *testing.T) {
					defender := "IR"
					if response == "urgent-portable-aa" {
						defender = "SY"
					}
					e := balanceEngine(t, balanceMap(), a.faction, defender)
					r := balanceRecord(t, e, name)
					air := balanceOpening{Player: 1, Name: profile, Structures: []string{"power", "supply", "barracks", "radar", a.service}, Unit: a.unit, ExtraHauler: profile != "rush-one-hauler", Scout: profile == "economy-scout-air"}
					aa := balanceOpening{Player: 2, Name: response, Structures: []string{"power", "barracks", "aa_post"}}
					if response == "urgent-portable-aa" {
						aa.Structures = []string{"power", "barracks"}
						aa.Unit = "SY.portable_aa"
					}
					if response == "economy-mobile-aa" {
						aa.Structures = []string{"power", "supply", "barracks", "factory"}
						aa.Unit = "IR.aa"
						aa.ExtraHauler = true
					}
					var milestones []balanceMilestone
					for e.Tick() < 18000 && (air.Ready == 0 || aa.Ready == 0) {
						oldA, oldB := balanceFindRole(e, 1, "rig").Position, balanceFindRole(e, 2, "rig").Position
						air.plan(r)
						aa.plan(r)
						r.step()
						air.observe(e, oldA)
						aa.observe(e, oldB)
						for _, event := range e.state.Events {
							if event.Kind != "construction_started" && event.Kind != "construction_complete" && event.Kind != "unit_ready" {
								continue
							}
							v := e.entity(event.Entity)
							if v == nil {
								continue
							}
							p := e.player(event.Owner)
							milestones = append(milestones, balanceMilestone{e.Tick(), event.Owner, event.Kind, v.Type, event.Position, p.Credits, p.Income, p.Spent})
						}
					}
					if air.Ready == 0 || aa.Ready == 0 {
						t.Fatalf("opening did not complete: air=%+v AA=%+v players=%+v", air, aa, e.state.Players)
					}
					for _, p := range e.state.Players {
						if p.Credits+p.Spent != 6000000+p.Income {
							t.Fatal("opening violates exact initial-credit/income/spending conservation")
						}
					}
					if air.BuilderTravel == 0 || aa.BuilderTravel == 0 {
						t.Fatal("opening bypassed builder travel")
					}
					if air.ReadySpent > 6000000 && air.ReadyIncome == 0 {
						t.Fatal("expensive opening bypassed earned income")
					}
					if profile == "economy-scout-air" && a.faction == "US" && air.ReadySpent != 9550000 {
						t.Fatal("US design reference opening cost changed")
					}
					for _, typ := range air.Structures {
						v := balanceOwned(e, 1, typ)
						if len(v) != 1 || !v[0].Complete {
							t.Fatalf("missing completed prerequisite %s", typ)
						}
					}
					if air.Ready <= aa.Ready {
						t.Fatalf("tested response unexpectedly became ready after tested air opening: air=%d AA=%d", air.Ready, aa.Ready)
					}
					plane := balanceOwned(e, 1, a.unit)[0]
					defenseType := aa.Unit
					if defenseType == "" {
						defenseType = "aa_post"
					}
					defense := balanceOwned(e, 2, defenseType)[0]
					departure := e.Tick()
					departurePos := plane.Position
					r.submit(1, Order{Kind: "move", Entities: []ID{plane.ID}, Position: defense.Position})
					var contact Tick
					for e.Tick()-departure < 1200 && plane.HP > 0 {
						r.step()
						if e.canSeeEntity(1, defense) {
							contact = e.Tick()
							break
						}
					}
					if contact == 0 {
						t.Fatal("completed aircraft never reached ordinary visual contact with prepared AA")
					}
					r.finish(map[string]any{"setup": "Untouched standard start: 6000 credits, HQ, one rig, five-second countdown. No fixture grants or prepared prerequisites.", "timing_claim": "Measured legal scripted openings; no claim of globally optimal placement/build order.", "air": air, "aa": aa, "aa_lead_ticks": air.Ready - aa.Ready, "milestones": milestones, "departure_tick": departure, "first_visual_contact_tick": contact, "departure_defense_distance": distance(departurePos, defense.Position), "unit_note": map[bool]string{true: "Unarmed scout: readiness is information capability, not strike damage.", false: "Armed strike aircraft."}[a.faction == "SY"]})
				})
			}
		}
	}
}

func TestBalanceAircraftSorties(t *testing.T) {
	if testing.Short() {
		t.Skip("measured balance matrix; run explicitly without -short")
	}
	for _, route := range []struct {
		name     string
		distance int32
	}{{"short", 16000}, {"medium", 32000}, {"long", 52000}} {
		for aaCount := 1; aaCount <= 3; aaCount++ {
			for _, policy := range []string{"expend-ammo", "recall-after-first-shot"} {
				name := fmt.Sprintf("sortie-%s-%d-aa-%s", route.name, aaCount, policy)
				t.Run(name, func(t *testing.T) {
					e := balanceEngine(t, balanceMap(), "US", "IR")
					ownInfrastructure, homeID := balancePrepared(e, 1, true)
					defenderInfrastructure, _ := balancePrepared(e, 2, false)
					home := e.entity(homeID)
					targetPos := Vec{X: home.Position.X + route.distance, Y: home.Position.Y}
					paidBuilding := func(typ string, pos Vec) *Entity {
						b, _ := e.buildingRule(typ)
						v := e.spawn(typ, 2, pos, true, b.Cost)
						e.player(2).Spent += b.Cost
						defenderInfrastructure += b.Cost
						return v
					}
					target := paidBuilding("power", targetPos)
					paidBuilding("outpost", Vec{X: targetPos.X, Y: targetPos.Y + 8000})
					aaPositions := []Vec{{X: targetPos.X - 2500, Y: targetPos.Y - 3000}, {X: targetPos.X - 2500, Y: targetPos.Y + 3000}, {X: targetPos.X + 3000, Y: targetPos.Y}}
					var aaIDs []ID
					for i := 0; i < aaCount; i++ {
						aaIDs = append(aaIDs, paidBuilding("aa_post", aaPositions[i]).ID)
					}
					// A paid ground scout provides ordinary sight for the explicit
					// target order. No reveal-map flag or hidden-target attack is used.
					scoutRule, _ := e.catalog.Unit("US.recon")
					scout := e.spawn("US.recon", 1, Vec{X: targetPos.X + 4000, Y: targetPos.Y - 5000}, true, scoutRule.Cost)
					scout.Orders = []Order{{Kind: "hold"}}
					e.player(1).Spent += scoutRule.Cost
					jetRule, _ := e.catalog.Unit("US.strike")
					e.player(1).Credits = jetRule.Cost + 2000000
					e.player(2).Credits = 1000000
					r := balanceRecord(t, e, name)
					if e.player(1).LowPower() || e.player(2).LowPower() {
						t.Fatal("prepared sortie infrastructure lacks power")
					}
					for e.state.Countdown > 0 {
						r.step()
					}
					r.submit(1, Order{Kind: "train", Entities: []ID{homeID}, Type: "US.strike"})
					for len(balanceOwned(e, 1, "US.strike")) == 0 && e.Tick() < 2000 {
						r.step()
					}
					jets := balanceOwned(e, 1, "US.strike")
					if len(jets) != 1 {
						t.Fatal("legal aircraft production never completed")
					}
					jet := jets[0]
					jetID := jet.ID
					if jet.Home != homeID || !jet.Landed || jet.Endurance != 2400 || jet.Ammo != 2 {
						t.Fatal("production did not create a normally serviced aircraft")
					}
					if !e.canSeeEntity(1, target) {
						t.Fatal("paid scout did not provide target sight")
					}
					launch := e.Tick()
					launchPosition := jet.Position
					launchCredits := e.player(1).Credits
					r.submit(1, Order{Kind: "attack", Entities: []ID{jetID}, Target: target.ID, Position: target.Position})
					var firstShot, firstDamage, recall, landing, serviced, lost Tick
					var damage int64
					var travel int64
					minHP := jet.HP
					lastAmmo := jet.Ammo
					shots := 0
					firedAA := map[ID]bool{}
					var aaShots []struct {
						Tick   Tick `json:"tick"`
						Source ID   `json:"source"`
					}
					var trajectory []struct {
						Tick      Tick   `json:"tick"`
						Position  Vec    `json:"position"`
						HP        int64  `json:"hp_milli"`
						Ammo      int32  `json:"ammo"`
						Endurance uint32 `json:"endurance"`
					}
					lastHP := target.HP
					for e.Tick()-launch < 3600 {
						oldPos := jet.Position
						if policy == "recall-after-first-shot" && firstShot != 0 && recall == 0 && jet.HP > 0 && !jet.Landed {
							r.submit(1, Order{Kind: "return", Entities: []ID{jetID}})
							recall = e.Tick() + 1
						}
						r.step()
						travel += int64(distance(oldPos, jet.Position))
						if jet.Ammo < lastAmmo {
							shots += int(lastAmmo - jet.Ammo)
							if firstShot == 0 {
								firstShot = e.Tick()
							}
						}
						lastAmmo = jet.Ammo
						if jet.HP < minHP {
							minHP = max(int64(0), jet.HP)
							if firstDamage == 0 {
								firstDamage = e.Tick()
							}
						}
						if target.HP < lastHP {
							damage += lastHP - max(int64(0), target.HP)
						}
						lastHP = max(int64(0), target.HP)
						for _, id := range aaIDs {
							v := e.entity(id)
							if v != nil && v.EverDealt {
								firedAA[id] = true
							}
						}
						if jet.Landed && e.Tick() > launch+1 && landing == 0 {
							landing = e.Tick()
						}
						for _, event := range e.state.Events {
							if event.Kind == "weapon_fired" && event.Owner == 2 {
								aaShots = append(aaShots, struct {
									Tick   Tick `json:"tick"`
									Source ID   `json:"source"`
								}{e.Tick(), event.Entity})
							}
							if event.Kind == "aircraft_serviced" && event.Entity == jetID {
								serviced = e.Tick()
							}
						}
						if (e.Tick()-launch)%20 == 0 {
							trajectory = append(trajectory, struct {
								Tick      Tick   `json:"tick"`
								Position  Vec    `json:"position"`
								HP        int64  `json:"hp_milli"`
								Ammo      int32  `json:"ammo"`
								Endurance uint32 `json:"endurance"`
							}{e.Tick(), jet.Position, max(int64(0), jet.HP), jet.Ammo, jet.Endurance})
						}
						if jet.HP <= 0 || e.entity(jetID) == nil {
							lost = e.Tick()
							break
						}
						if serviced != 0 {
							break
						}
					}
					if firstShot == 0 {
						t.Fatal("aircraft never executed a real shot")
					}
					if serviced == 0 && lost == 0 {
						t.Fatal("sortie neither lost aircraft nor completed actual service")
					}
					if firstDamage == 0 || len(firedAA) != aaCount {
						t.Fatal("not every configured AA source contributed real damage")
					}
					if e.player(1).Income != 0 || e.player(2).Income != 0 {
						t.Fatal("sortie repair was silently funded by fixture income")
					}
					repairCost := launchCredits - e.player(1).Credits
					if serviced != 0 && (jet.Ammo != 2 || jet.Endurance != 2400 || !jet.Landed || repairCost <= 0) {
						t.Fatal("service/paid repair contract was not exercised")
					}
					r.finish(map[string]any{
						"setup": "Prepared, paid and powered service infrastructure and defended outpost; paid ground scout supplies ordinary sight. Aircraft is produced by the normal queue. One sortie; no upgrades, escorts, abilities, repeat-sortie or hidden income.",
						"route": route.name, "nominal_home_target_distance": route.distance, "actual_launch_target_distance": distance(launchPosition, targetPos), "policy": policy, "aa_count": aaCount, "aa_sources_dealing_damage": len(firedAA), "aa_type": "aa_post", "aircraft_type": "US.strike", "aircraft_cost_milli_credits": jetRule.Cost, "scout_cost_milli_credits": scoutRule.Cost,
						"prepared_attacker_infrastructure_milli_credits": ownInfrastructure, "prepared_defender_infrastructure_milli_credits": defenderInfrastructure, "launch_tick": launch, "first_shot_tick": firstShot, "first_aircraft_damage_tick": firstDamage, "manual_recall_tick": recall, "landing_tick": landing, "service_complete_tick": serviced, "aircraft_lost_tick": lost,
						"fixture_attacker_credit_grant": ownInfrastructure + scoutRule.Cost + jetRule.Cost + 2000000, "fixture_defender_credit_grant": defenderInfrastructure + 1000000,
						"flight_path_fixed_units": travel, "shots_fired": shots, "target_damage_milli_hp": damage, "target_max_milli_hp": target.MaxHP, "target_remaining_milli_hp": max(int64(0), target.HP), "aircraft_min_milli_hp": minHP, "aircraft_final_milli_hp": max(int64(0), jet.HP), "paid_repair_milli_credits": repairCost, "aircraft_lost_value_milli_credits": map[bool]int64{true: jetRule.Cost, false: 0}[lost != 0],
						"aa_shot_trace": aaShots, "one_second_flight_samples": trajectory,
					})
				})
			}
		}
	}
}
