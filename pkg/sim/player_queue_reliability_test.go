package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func playerQueueMap() content.Map {
	m := fixtureMap()
	m.Shipment = Vec{X: 44000, Y: 44000}
	return m
}

// Synthetic starting scenes declare prior damage, purchases, or occupancy.
// State changes after recording use ordinary Submit and Advance only.
func playerQueueFixture(t *testing.T, faction string, m content.Map) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: m, Seed: 93021, Players: []PlayerConfig{
		{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

func playerQueueSubmitTask(t *testing.T, r *channelContinuationRun, worker *Entity, kind string, target ID, goal Vec) {
	t.Helper()
	r.submit(worker.Owner,
		Order{Kind: kind, Entities: []ID{worker.ID}, Target: target},
		Order{Kind: "move", Entities: []ID{worker.ID}, Position: goal, Queued: true},
		Order{Kind: "hold", Entities: []ID{worker.ID}, Queued: true})
	r.step()
	if len(r.e.state.Results) != 3 {
		t.Fatal("fixture did not execute all three public intentions", r.e.state.Results)
	}
	for _, result := range r.e.state.Results {
		if !result.Accepted {
			t.Fatal("fixture public task/queue was rejected", result)
		}
	}
	if len(worker.Orders) != 3 || worker.Orders[0].Kind != kind || worker.Orders[1].Position != goal {
		t.Fatal("fixture did not retain the admitted task, move, and hold", worker.Orders)
	}
}

func playerQueueActivated(worker *Entity, goal Vec) bool {
	return len(worker.Orders) == 2 && worker.Orders[0].Kind == "move" && worker.Orders[0].Position == goal && worker.Orders[1].Kind == "hold"
}

func playerQueueReached(worker *Entity, goal Vec) bool {
	return worker.Container == 0 && worker.Channel == "" && len(worker.Orders) == 0 && worker.Stance == "hold" && distance(worker.Position, goal) <= 350
}

func TestPlayerQueueCaptureInvalidPreservesLaterOrders(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, stage := range []string{"channel", "approach"} {
			t.Run(faction+"/"+stage, func(t *testing.T) {
				e := playerQueueFixture(t, faction, playerQueueMap())
				target := e.spawn("factory", 2, Vec{X: 30000, Y: 30000}, true, 1800000)
				target.HP = target.MaxHP/4 - 3*1250
				target.EverDamaged = true // recent combat; repairs must wait three seconds
				rule, _ := e.catalog.Unit("IR.tank")
				target.Jobs = []Job{{Type: rule.ID, Paid: rule.Cost, Required: rule.BuildTicks * 2, Work: 50, Supply: rule.Supply, Started: true}}
				e.player(2).Credits -= rule.Cost
				e.player(2).Spent += rule.Cost
				position := Vec{X: 27300, Y: 30000}
				if stage == "approach" {
					position = Vec{X: 15000, Y: 26000}
					e.spawn(faction+".engineer", 1, Vec{X: 26000, Y: 24000}, true, 400000)
				}
				worker := e.spawn(faction+".engineer", 1, position, true, 400000)
				repairer := e.spawn("IR.engineer", 2, Vec{X: 32000, Y: 27000}, true, 400000)
				r := channelContinuationRecord(t, e)
				goal := Vec{X: 23000, Y: 35000}
				credits, spent, paid := e.player(2).Credits, e.player(2).Spent, target.Paid
				playerQueueSubmitTask(t, r, worker, "capture", target.ID, goal)
				r.issue(2, Order{Kind: "repair", Entities: []ID{repairer.ID}, Target: target.ID})
				r.to(20)
				if (worker.Channel == "capture") != (stage == "channel") || target.HP != target.MaxHP/4-3*1250 {
					t.Fatal("fixture stage or required combat-quiet delay changed", worker.Channel, target.HP)
				}
				r.checkpoint()
				cue := false
				for target.HP*4 < target.MaxHP && e.Tick() < 70 {
					r.step()
					for _, event := range e.state.Events {
						cue = cue || event.Kind == "capture_interrupted" && event.Owner == worker.Owner && event.Entity == worker.ID
					}
				}
				invalidAt := e.Tick()
				if target.HP*4 < target.MaxHP || invalidAt != 62 {
					t.Fatal("ordinary paid repair did not cross the capture threshold at the expected tick", target.HP, invalidAt)
				}
				r.issue(2, Order{Kind: "move", Entities: []ID{repairer.ID}, Position: Vec{X: 34000, Y: 22000}})
				for _, event := range e.state.Events {
					cue = cue || event.Kind == "capture_interrupted" && event.Owner == worker.Owner && event.Entity == worker.ID
				}
				activated := playerQueueActivated(worker, goal)
				r.to(240)
				r.finish()
				t.Logf("capture stage=%s invalid_tick=%d paid_repair=%d front_move_activated=%v final=%+v orders=%+v", stage, invalidAt, e.player(2).Spent-spent, activated, worker.Position, worker.Orders)
				if !activated || !playerQueueReached(worker, goal) {
					t.Fatal("invalid capture erased later accepted Move/Hold or failed normal queue activation")
				}
				if !cue || target.Owner != 2 || target.HP != target.MaxHP/4 || target.Paid != paid || len(target.Jobs) != 1 || target.Jobs[0].Paid != rule.Cost || e.player(2).Credits != credits-375 || e.player(2).Spent != spent+375 {
					t.Fatal("capture cancellation lost its owner cue, changed ownership, refunded a purchase, or changed paid repair accounting")
				}
			})
		}
	}
}

func playerQueueCarrier(e *Engine, typ string) *Entity {
	rule, _ := e.catalog.Unit(typ)
	carrier := e.spawn(typ, 1, Vec{X: 30000, Y: 30000}, true, rule.Cost)
	if typ == "US.airlift" {
		home := e.spawn("US.airfield", 1, Vec{X: 42000, Y: 30000}, true, 2200000)
		carrier.Home, carrier.Landed = home.ID, false
	}
	return carrier
}

func TestPlayerQueueBoardCapacityPreservesLaterOrders(t *testing.T) {
	for _, typ := range []string{"US.apc", "SY.apc", "US.airlift"} {
		for _, stage := range []string{"channel", "approach"} {
			t.Run(typ+"/"+stage, func(t *testing.T) {
				faction := typ[:2]
				e := playerQueueFixture(t, faction, playerQueueMap())
				carrier := playerQueueCarrier(e, typ)
				for i := int32(0); i < e.capacity(carrier)-1; i++ {
					passenger := e.spawn(faction+".engineer", 1, carrier.Position, true, 400000)
					passenger.Container, passenger.State = carrier.ID, "embarked"
					carrier.Passengers = append(carrier.Passengers, passenger.ID)
				}
				filler := e.spawn(faction+".engineer", 1, Vec{X: 30000, Y: 28400}, true, 400000)
				position := Vec{X: 28400, Y: 30000}
				if stage == "approach" {
					position = Vec{X: 14000, Y: 30000}
				}
				worker := e.spawn(faction+".engineer", 1, position, true, 400000)
				r := channelContinuationRecord(t, e)
				goal := Vec{X: 21000, Y: 24000}
				credits, spent := e.player(1).Credits, e.player(1).Spent
				r.issue(1, Order{Kind: "board", Entities: []ID{filler.ID}, Target: carrier.ID})
				fullAt := filler.ChannelUntil
				if filler.Channel != "board" {
					t.Fatal("fixture filler did not begin stationary boarding")
				}
				playerQueueSubmitTask(t, r, worker, "board", carrier.ID, goal)
				r.to(fullAt - 5)
				if (worker.Channel == "board") != (stage == "channel") {
					t.Fatal("fixture waiting boarder stage changed", worker.Channel, worker.Position)
				}
				r.checkpoint()
				r.to(fullAt + 1)
				if filler.Container != carrier.ID || len(carrier.Passengers) != int(e.capacity(carrier)) || worker.Container != 0 {
					t.Fatal("ordinary boarding did not fill the last legal seat")
				}
				activated := playerQueueActivated(worker, goal)
				r.to(fullAt + 160)
				r.finish()
				t.Logf("board carrier=%s stage=%s full_tick=%d front_move_activated=%v final=%+v orders=%+v", typ, stage, fullAt, activated, worker.Position, worker.Orders)
				if !activated || !playerQueueReached(worker, goal) {
					t.Fatal("invalid full-carrier Board erased later accepted Move/Hold or failed normal activation")
				}
				if len(filler.Orders) != 0 || carrier.Owner != 1 || len(carrier.Passengers) != int(e.capacity(carrier)) || e.player(1).Credits != credits || e.player(1).Spent != spent {
					t.Fatal("boarding cancellation altered containment, capacity, ownership, or purchase accounting")
				}
			})
		}
	}
}

func TestPlayerQueueBoardGarrisonOwnershipPreservesLaterOrders(t *testing.T) {
	for _, stage := range []string{"channel", "approach"} {
		t.Run(stage, func(t *testing.T) {
			m := playerQueueMap()
			m.Objects = []content.MapObject{{ID: 1, Class: "garrison", Position: Vec{X: 30500, Y: 30500}}}
			e := playerQueueFixture(t, "US", m)
			garrison := objectEntity(e, 1)
			filler := e.spawn("IR.engineer", 2, Vec{X: 30500, Y: 28000}, true, 400000)
			position := Vec{X: 28000, Y: 30500}
			if stage == "approach" {
				position = Vec{X: 16500, Y: 30500}
				e.spawn("US.engineer", 1, Vec{X: 28000, Y: 31500}, true, 400000)
			}
			worker := e.spawn("US.engineer", 1, position, true, 400000)
			r := channelContinuationRecord(t, e)
			goal := Vec{X: 23000, Y: 23000}
			r.issue(2, Order{Kind: "board", Entities: []ID{filler.ID}, Target: garrison.ID})
			ownedAt := filler.ChannelUntil
			playerQueueSubmitTask(t, r, worker, "board", garrison.ID, goal)
			r.to(ownedAt - 5)
			if garrison.Owner != 0 || (worker.Channel == "board") != (stage == "channel") {
				t.Fatal("neutral garrison stage fixture changed")
			}
			r.checkpoint()
			r.to(ownedAt + 1)
			if garrison.Owner != 2 || filler.Container != garrison.ID || len(garrison.Passengers) != 1 || worker.Container != 0 {
				t.Fatal("ordinary enemy boarding did not claim the neutral garrison")
			}
			activated := playerQueueActivated(worker, goal)
			r.to(ownedAt + 180)
			r.finish()
			t.Logf("board ownership stage=%s enemy_claim_tick=%d front_move_activated=%v final=%+v", stage, ownedAt, activated, worker.Position)
			if !activated || !playerQueueReached(worker, goal) || garrison.Owner != 2 || len(garrison.Passengers) != 1 {
				t.Fatal("newly hostile garrison Board erased later accepted Move/Hold or changed its occupants")
			}
		})
	}
}

func TestPlayerQueueMovingCarrierRetainsLegalRetry(t *testing.T) {
	for _, typ := range []string{"US.apc", "SY.apc", "US.airlift"} {
		t.Run(typ, func(t *testing.T) {
			faction := typ[:2]
			e := playerQueueFixture(t, faction, playerQueueMap())
			carrier := playerQueueCarrier(e, typ)
			worker := e.spawn(faction+".engineer", 1, Vec{X: 28400, Y: 30000}, true, 400000)
			r := channelContinuationRecord(t, e)
			goal := Vec{X: 21000, Y: 24000}
			playerQueueSubmitTask(t, r, worker, "board", carrier.ID, goal)
			if worker.Channel != "board" {
				t.Fatal("fixture did not begin boarding")
			}
			r.checkpoint()
			r.issue(1, Order{Kind: "move", Entities: []ID{carrier.ID}, Position: Vec{X: 33000, Y: 30000}})
			if worker.Channel != "" || worker.Container != 0 || len(worker.Orders) != 3 || worker.Orders[0].Kind != "board" || !e.canBoard(worker, carrier) {
				t.Fatal("carrier movement retired a still-legal boarding task or discarded its pending queue")
			}
			r.to(180)
			r.finish()
			if worker.Container != carrier.ID || len(worker.Orders) != 0 || len(carrier.Passengers) != 1 || worker.Position != carrier.Position || distance(worker.Position, goal) <= 350 {
				t.Fatal("legal stationary retry failed, or successful boarding invented a passenger itinerary")
			}
		})
	}
}

func TestPlayerQueueValidCaptureCompletesBeforeQueuedWork(t *testing.T) {
	e := playerQueueFixture(t, "US", playerQueueMap())
	target := e.spawn("factory", 2, Vec{X: 30000, Y: 30000}, true, 1800000)
	target.HP = target.MaxHP / 5
	worker := e.spawn("US.engineer", 1, Vec{X: 27300, Y: 30000}, true, 400000)
	r := channelContinuationRecord(t, e)
	goal := Vec{X: 23000, Y: 35000}
	playerQueueSubmitTask(t, r, worker, "capture", target.ID, goal)
	until, hp, paid := worker.ChannelUntil, target.HP, target.Paid
	r.to(80)
	r.checkpoint()
	r.to(until - 1)
	if worker.Channel != "capture" || len(worker.Orders) != 3 || target.Owner != 2 {
		t.Fatal("valid capture was retired before completion")
	}
	r.to(until)
	if target.Owner != 1 || !playerQueueActivated(worker, goal) {
		t.Fatal("successful capture missed ordinary next-order activation")
	}
	r.to(260)
	r.finish()
	if !playerQueueReached(worker, goal) || target.HP != hp || target.Paid != paid {
		t.Fatal("valid capture changed paid value/health or stranded later work")
	}
}

func TestPlayerQueuePaidRepairWaitsForOrdinaryIncome(t *testing.T) {
	e := playerQueueFixture(t, "US", playerQueueMap())
	e.player(1).Credits = 0
	target := e.spawn("outpost", 1, Vec{X: 25000, Y: 20000}, true, 1000000)
	target.HP -= 2500
	worker := e.spawn("US.engineer", 1, Vec{X: 23000, Y: 20000}, true, 400000)
	incomeWorker := e.spawn("US.engineer", 1, e.state.Stations[0].Position, true, 400000)
	r := channelContinuationRecord(t, e)
	goal := Vec{X: 20000, Y: 15000}
	playerQueueSubmitTask(t, r, worker, "repair", target.ID, goal)
	r.issue(1, Order{Kind: "capture", Entities: []ID{incomeWorker.ID}, Target: e.state.Stations[0].ID})
	r.to(60)
	r.checkpoint()
	r.to(120)
	if target.HP != target.MaxHP-2500 || len(worker.Orders) != 3 || worker.Orders[0].Kind != "repair" || e.player(1).Credits != 0 {
		t.Fatal("temporary lack of money retired valid unfinished repair")
	}
	r.to(260)
	r.finish()
	if target.HP != target.MaxHP || !playerQueueReached(worker, goal) || e.player(1).Spent != 250 || e.player(1).Credits+250 != e.player(1).Income {
		t.Fatal("ordinary station income did not fund exact paid repair and release queued work", target.HP, worker.Orders, e.player(1).Credits, e.player(1).Income)
	}
}

func TestPlayerQueueCaptureBlockedExitsRetainsValidTask(t *testing.T) {
	m := playerQueueMap()
	for y := int32(25); y <= 35; y++ {
		for x := int32(25); x <= 35; x++ {
			if x < 29 || x >= 31 || y < 29 || y >= 31 {
				m.Tiles[y*m.Width+x].Terrain = "blocked"
			}
		}
	}
	m.Tiles[29*m.Width+31].Terrain = "open"
	m.Tiles[30*m.Width+31].Terrain = "open"
	e := playerQueueFixture(t, "US", m)
	target := e.spawn("bunker", 2, Vec{X: 30000, Y: 30000}, true, 400000)
	target.HP = target.MaxHP / 5
	for range 2 {
		passenger := e.spawn("IR.engineer", 2, target.Position, true, 400000)
		passenger.Container, passenger.State = target.ID, "embarked"
		target.Passengers = append(target.Passengers, passenger.ID)
	}
	worker := e.spawn("US.engineer", 1, Vec{X: 31500, Y: 30000}, true, 400000)
	r := channelContinuationRecord(t, e)
	goal := Vec{X: 36000, Y: 30000}
	playerQueueSubmitTask(t, r, worker, "capture", target.ID, goal)
	r.to(170)
	if worker.State != "capture_exit_blocked" || !e.validCapture(worker, target.ID) {
		t.Fatal("fixture did not reach legal capture waiting for atomic exits", worker.State)
	}
	r.checkpoint()
	r.to(201)
	r.finish()
	if worker.Channel != "capture" || worker.State != "capture_exit_blocked" || len(worker.Orders) != 3 || worker.Orders[1].Position != goal || target.Owner != 2 || len(target.Passengers) != 2 {
		t.Fatal("temporarily blocked exits retired valid capture, erased later work, or transferred occupants")
	}
}
