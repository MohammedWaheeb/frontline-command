package sim

import "testing"

// This is an ordinary public command journey from the standard starting rig;
// the only prepared content is the existing synthetic, open fixture map.
func TestQueuedMovementVisitsEveryWaypointAndActivatesHold(t *testing.T) {
	for _, tc := range []struct {
		name, kind string
		first      Vec
		patrol     bool
	}{
		{"move/direct-arrival", "move", Vec{X: 20500, Y: 9500}, false},
		{"move/adjusted-grid-endpoint", "move", Vec{X: 20750, Y: 9750}, false},
		{"attack-move/direct-arrival", "attack_move", Vec{X: 20500, Y: 9500}, false},
		{"attack-move/adjusted-grid-endpoint", "attack_move", Vec{X: 20750, Y: 9750}, false},
		{"patrol/queued-exit", "patrol", Vec{X: 20500, Y: 9500}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := fixture(t)
			var rig *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && e.role(v) == "rig" {
					rig = v
					break
				}
			}
			if rig == nil {
				t.Fatal("missing starting rig")
			}
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			second, third := Vec{X: 28500, Y: 9500}, Vec{X: 28500, Y: 18000}
			firstOrder := Order{Kind: tc.kind, Entities: []ID{rig.ID}, Position: tc.first}
			if tc.patrol {
				firstOrder.Points = []Vec{tc.first, {X: 20500, Y: 14000}}
			}
			if err := e.Submit(1, 1, []Order{
				firstOrder,
				{Kind: "move", Entities: []ID{rig.ID}, Position: second, Queued: true},
				{Kind: "move", Entities: []ID{rig.ID}, Position: third, Queued: true},
				{Kind: "hold", Entities: []ID{rig.ID}, Queued: true},
			}); err != nil {
				t.Fatal(err)
			}
			var restored *Engine
			visitedFirst, visitedSecond, visitedPatrolEnd := false, false, false
			var finishedAt Tick
			var heldAt Vec
			for range 1000 {
				e.Advance()
				if restored != nil {
					restored.Advance()
				}
				for _, result := range e.state.Results {
					if !result.Accepted {
						t.Fatalf("ordinary queue rejected: %+v", result)
					}
				}
				if distance(rig.Position, tc.first) < 750 {
					visitedFirst = true
				}
				if tc.patrol && distance(rig.Position, firstOrder.Points[1]) < 750 {
					visitedPatrolEnd = true
				}
				if distance(rig.Position, second) < 750 {
					if !visitedFirst || tc.patrol && !visitedPatrolEnd {
						t.Fatal("later waypoint reached before first route completed")
					}
					visitedSecond = true
				}
				// Save during the second leg, after the first endpoint has been
				// consumed. A restored queue must execute all remaining orders.
				if restored == nil && len(rig.Orders) == 3 && len(rig.Path) > 0 {
					data, err := e.Save()
					if err != nil {
						t.Fatal(err)
					}
					restored, err = Restore(e.catalog, data)
					if err != nil {
						t.Fatal(err)
					}
				}
				if finishedAt == 0 && len(rig.Orders) == 0 {
					if !visitedFirst || !visitedSecond || distance(rig.Position, third) > 250 {
						t.Fatalf("queued waypoint skipped: first=%v second=%v final=%+v goal=%+v", visitedFirst, visitedSecond, rig.Position, third)
					}
					if rig.Stance != "hold" || rig.PathResolved || len(rig.Path) != 0 || rig.NextRouteAt != 0 {
						t.Fatalf("queued hold did not activate cleanly: stance=%s path=%v resolved=%v retry=%d", rig.Stance, rig.Path, rig.PathResolved, rig.NextRouteAt)
					}
					finishedAt, heldAt = e.Tick(), rig.Position
				}
				if finishedAt != 0 && rig.Position != heldAt {
					t.Fatal("held rig moved after completing its queue")
				}
				if e.Tick()%100 == 0 {
					if err := replay.Capture(e, false); err != nil {
						t.Fatal(err)
					}
				}
			}
			if finishedAt == 0 || restored == nil {
				t.Fatalf("queue did not finish with a restorable second leg: pos=%+v orders=%+v", rig.Position, rig.Orders)
			}
			if restored.Hash() != e.Hash() {
				t.Fatal("queued movement changed after midpoint restoration")
			}
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("queued movement full replay drift", err)
			}
			t.Logf("finished_tick=%d final=%+v hash=%s", finishedAt, heldAt, e.Hash())
		})
	}
}

func TestQueuedMovementActivatesGuardAndPreservesOrdersAfterStop(t *testing.T) {
	e := fixture(t)
	var rig *Entity
	for _, actor := range e.state.Entities {
		if actor.Owner == 1 && e.role(actor) == "rig" {
			rig = actor
		}
	}
	first, guarded := Vec{X: 20500, Y: 9500}, Vec{X: 28500, Y: 18000}
	if err := e.Submit(1, 1, []Order{
		{Kind: "move", Entities: []ID{rig.ID}, Position: first},
		{Kind: "stop", Entities: []ID{rig.ID}, Queued: true},
		{Kind: "guard", Entities: []ID{rig.ID}, Position: guarded, Queued: true},
	}); err != nil {
		t.Fatal(err)
	}
	for range 500 {
		e.Advance()
		for _, result := range e.state.Results {
			if !result.Accepted {
				t.Fatalf("queue rejected: %+v", result)
			}
		}
	}
	if rig.Stance != "guard" || rig.Anchor != guarded || distance(rig.Position, guarded) > 1000 || len(rig.Orders) != 1 || rig.Orders[0].Kind != "guard" {
		t.Fatalf("queued guard not initialized after stop: stance=%s anchor=%+v pos=%+v orders=%+v", rig.Stance, rig.Anchor, rig.Position, rig.Orders)
	}
}

func TestQueuedHoldAfterAircraftService(t *testing.T) {
	e, _, jet := airOrderFixture(t)
	runQueuedTaskWithReplay(t, e, []Order{{Kind: "return", Entities: []ID{jet.ID}}, {Kind: "hold", Entities: []ID{jet.ID}, Queued: true}})
	if !jet.Landed || jet.ServiceWork != 0 || jet.Stance != "hold" || len(jet.Orders) != 0 {
		t.Fatalf("service did not activate queued hold: landed=%v work=%d stance=%s orders=%+v", jet.Landed, jet.ServiceWork, jet.Stance, jet.Orders)
	}
}

func TestQueuedHoldAfterEmptyTransportUnload(t *testing.T) {
	e := fixture(t)
	carrier := e.spawn("US.apc", 1, Vec{X: 22000, Y: 22000}, true, 0)
	e.recalculate()
	e.updateFog()
	runQueuedTaskWithReplay(t, e, []Order{{Kind: "unload", Entities: []ID{carrier.ID}}, {Kind: "hold", Entities: []ID{carrier.ID}, Queued: true}})
	if carrier.Stance != "hold" || len(carrier.Orders) != 0 {
		t.Fatalf("unload did not activate queued hold: stance=%s orders=%+v", carrier.Stance, carrier.Orders)
	}
}

func TestQueuedMovementAfterStationCapture(t *testing.T) {
	e := fixture(t)
	worker := e.spawn("US.engineer", 1, Vec{X: 32000, Y: 24000}, true, 0)
	e.recalculate()
	e.updateFog()
	goal := Vec{X: 24000, Y: 24000}
	runQueuedTaskWithReplay(t, e, []Order{{Kind: "capture", Entities: []ID{worker.ID}, Target: e.state.Stations[0].ID}, {Kind: "move", Entities: []ID{worker.ID}, Position: goal, Queued: true}, {Kind: "hold", Entities: []ID{worker.ID}, Queued: true}})
	if e.state.Stations[0].Owner != 1 {
		t.Fatal("station capture failed")
	}
	if distance(worker.Position, goal) > 250 || worker.Stance != "hold" {
		t.Fatalf("capture discarded queued movement/hold: pos=%+v stance=%s orders=%+v", worker.Position, worker.Stance, worker.Orders)
	}
}

// Prepared fixtures below isolate individual finite task completions. Commands,
// travel, task channels, payment and queue activation all use the public engine.
func runQueuedTaskWithReplay(t *testing.T, e *Engine, orders []Order) {
	t.Helper()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.Submit(1, e.player(1).LastSequence+1, orders); err != nil {
		t.Fatal(err)
	}
	for range 25 {
		e.Advance()
		for _, result := range e.state.Results {
			if !result.Accepted {
				t.Fatalf("task queue rejected: %+v", result)
			}
		}
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for range 1600 {
		e.Advance()
		restored.Advance()
		if e.Tick()%100 == 0 {
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("task queue changed after restoration")
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("task queue full replay drift", err)
	}
}

func TestQueuedHoldAfterFixedWingMove(t *testing.T) {
	e, _, jet := airOrderFixture(t)
	runQueuedTaskWithReplay(t, e, []Order{
		{Kind: "move", Entities: []ID{jet.ID}, Position: Vec{X: 31000, Y: 23000}},
		{Kind: "hold", Entities: []ID{jet.ID}, Queued: true},
	})
	// Fixed-wing hold flies its ordinary holding circuit; it does not hover.
	if jet.Stance != "hold" || len(jet.Orders) != 0 || jet.Landed {
		t.Fatalf("fixed-wing move did not activate queued hold: stance=%s landed=%v orders=%+v", jet.Stance, jet.Landed, jet.Orders)
	}
}

func TestQueuedMovementAfterPaidConstruction(t *testing.T) {
	e := fixture(t)
	var rig *Entity
	for _, actor := range e.state.Entities {
		if actor.Owner == 1 && e.role(actor) == "rig" {
			rig = actor
		}
	}
	goal := Vec{X: 24000, Y: 18000}
	runQueuedTaskWithReplay(t, e, []Order{
		{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: Vec{X: 13000, Y: 13000}},
		{Kind: "move", Entities: []ID{rig.ID}, Position: goal, Queued: true},
		{Kind: "hold", Entities: []ID{rig.ID}, Queued: true},
	})
	if !e.has(1, "power") || e.player(1).Spent == 0 {
		t.Fatal("ordinary paid construction did not finish")
	}
	if distance(rig.Position, goal) > 250 || rig.Stance != "hold" || len(rig.Orders) != 0 {
		t.Fatalf("construction discarded queued move/hold: pos=%+v stance=%s orders=%+v", rig.Position, rig.Stance, rig.Orders)
	}
}

func TestQueuedMovementAfterSalvageCollection(t *testing.T) {
	e := fixture(t)
	worker := e.spawn("SY.engineer", 1, Vec{X: 22000, Y: 22000}, true, 0)
	crateID := e.newID()
	e.state.Salvage = append(e.state.Salvage, Salvage{ID: crateID, Owner: 2, Position: worker.Position, Value: 120000, Until: 900})
	e.recalculate()
	e.updateFog()
	goal := Vec{X: 28000, Y: 22000}
	runQueuedTaskWithReplay(t, e, []Order{
		{Kind: "salvage", Entities: []ID{worker.ID}, Target: crateID},
		{Kind: "move", Entities: []ID{worker.ID}, Position: goal, Queued: true},
		{Kind: "hold", Entities: []ID{worker.ID}, Queued: true},
	})
	if e.player(1).SalvageTotal != 120000 {
		t.Fatal("ordinary salvage payment did not occur")
	}
	if distance(worker.Position, goal) > 250 || worker.Stance != "hold" || len(worker.Orders) != 0 {
		t.Fatalf("salvage discarded queued move/hold: pos=%+v stance=%s orders=%+v", worker.Position, worker.Stance, worker.Orders)
	}
}

func TestQueuedMovementAfterLoadedTransportUnload(t *testing.T) {
	e := fixture(t)
	carrier := e.spawn("US.apc", 1, Vec{X: 22000, Y: 22000}, true, 0)
	passenger := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 22000}, true, 0)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{passenger.ID}, Target: carrier.ID})
	ticks(e, 100)
	if passenger.Container != carrier.ID {
		t.Fatal("ordinary boarding failed")
	}
	goal := Vec{X: 28500, Y: 22000}
	runQueuedTaskWithReplay(t, e, []Order{
		{Kind: "unload", Entities: []ID{carrier.ID}},
		{Kind: "move", Entities: []ID{carrier.ID}, Position: goal, Queued: true},
		{Kind: "hold", Entities: []ID{carrier.ID}, Queued: true},
	})
	if passenger.Container != 0 || len(carrier.Passengers) != 0 {
		t.Fatal("ordinary unloading did not finish")
	}
	if distance(carrier.Position, goal) > 250 || carrier.Stance != "hold" || len(carrier.Orders) != 0 {
		t.Fatalf("unload discarded queued move/hold: pos=%+v stance=%s orders=%+v", carrier.Position, carrier.Stance, carrier.Orders)
	}
}
