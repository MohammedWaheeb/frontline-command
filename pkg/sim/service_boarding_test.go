package sim

import "testing"

func candidateBoardReplay(t *testing.T, e *Engine, replay *Replay) {
	t.Helper()
	containerRestore(t, e)
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("boarding replay mismatch", err)
	}
}

func TestCandidateBoardingGroundedAndHoveringContact(t *testing.T) {
	for _, grounded := range []bool{true, false} {
		e, carrier, ids := containerValidationFixture(t, containerValidationCase{"US.airlift", "US", 2})
		carrier.Landed = grounded
		if !grounded {
			for _, id := range ids {
				v := e.entity(id)
				v.Position.X = carrier.Position.X - 1500
				v.LastPosition = v.Position
			}
		}
		e.updateFog()
		replay, err := NewReplay(e)
		if err != nil {
			t.Fatal(err)
		}
		first := e.entity(ids[0])
		combat := e.edgeDistance(first, carrier)
		if e.radius(carrier) != 600 || e.boardingDistance(first, carrier) != max(int32(0), combat-e.boardingRadiusExtra(carrier)) {
			t.Fatal("combat geometry changed")
		}
		if grounded && e.boardingRadiusExtra(carrier) != 1000 || !grounded && e.boardingRadiusExtra(carrier) != 0 {
			t.Fatal("wrong boarding body")
		}
		issue(t, e, 1, Order{Kind: "board", Entities: ids, Target: carrier.ID})
		for range 160 {
			for _, id := range ids {
				v := e.entity(id)
				if grounded && v.Container == 0 && distance(v.Position, carrier.Position) < serviceParkingRadius(carrier.Type)+serviceParkingMargin+e.radius(v) {
					t.Fatal("passenger crossed parked body")
				}
			}
			if len(carrier.Passengers) == len(ids) {
				break
			}
			e.Advance()
		}
		if len(carrier.Passengers) != len(ids) {
			t.Fatal("ordinary boarding failed", grounded, carrier.Passengers)
		}
		loaded := containerRestore(t, e)
		o := Order{Kind: "unload", Entities: []ID{carrier.ID}}
		issue(t, e, 1, o)
		issue(t, loaded, 1, o)
		for range 80 {
			e.Advance()
			loaded.Advance()
			if e.Hash() != loaded.Hash() {
				t.Fatal("loaded continuation mismatch")
			}
		}
		if len(carrier.Passengers) != 0 {
			t.Fatal("unload blocked")
		}
		for _, id := range ids {
			v := e.entity(id)
			if v.Container != 0 || v.HP <= 0 {
				t.Fatal("lost passenger")
			}
			if grounded && !e.clear(v.Position, e.radius(v), v.ID, false, true) {
				t.Fatal("unload overlaps operational body")
			}
			if e.edgeDistance(v, carrier) > 2000 {
				t.Fatal("unload exceeded original range")
			}
		}
		candidateBoardReplay(t, e, replay)
	}
}

func TestCandidateBoardingCancellationAndTransportMovement(t *testing.T) {
	for _, action := range []string{"stop-passenger", "move-transport", "rebase-transport"} {
		t.Run(action, func(t *testing.T) {
			e, carrier, ids := containerValidationFixture(t, containerValidationCase{"US.airlift", "US", 1})
			next := e.spawn("US.airfield", 1, Vec{X: 42000, Y: 28000}, true, 2200000)
			e.recalculate()
			e.updateFog()
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			v := e.entity(ids[0])
			issue(t, e, 1, Order{Kind: "board", Entities: ids, Target: carrier.ID})
			for range 100 {
				if v.Channel == "board" {
					break
				}
				e.Advance()
			}
			if v.Channel != "board" {
				t.Fatal("boarding channel not reached")
			}
			switch action {
			case "stop-passenger":
				issue(t, e, 1, Order{Kind: "stop", Entities: ids})
			case "move-transport":
				issue(t, e, 1, Order{Kind: "move", Entities: []ID{carrier.ID}, Position: Vec{X: 40000, Y: 19000}})
			case "rebase-transport":
				issue(t, e, 1, Order{Kind: "return", Entities: []ID{carrier.ID}, Target: next.ID})
			}
			if action != "stop-passenger" {
				for range 20 {
					if carrier.Position != carrier.LastPosition {
						break
					}
					e.Advance()
				}
			}
			if v.Channel != "" || v.Container != 0 {
				t.Fatalf("boarding continued during cancellation or movement %s channel=%s carrier=%+v", action, v.Channel, carrier)
			}
			if action != "stop-passenger" {
				if carrier.Landed || carrier.Position == carrier.LastPosition {
					t.Fatal("transport did not move")
				}
				issue(t, e, 1, Order{Kind: "stop", Entities: ids})
			}
			ticks(e, 90)
			if v.Container != 0 {
				t.Fatal("cancelled passenger embarked")
			}
			candidateBoardReplay(t, e, replay)
		})
	}
}

func TestCandidateBoardingLoadedRebaseAndLandingUnload(t *testing.T) {
	e, carrier, ids := containerValidationFixture(t, containerValidationCase{"US.airlift", "US", 2})
	next := e.spawn("US.airfield", 1, Vec{X: 42000, Y: 28000}, true, 2200000)
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	containerBoardAll(t, e, carrier, ids)
	issue(t, e, 1, Order{Kind: "return", Entities: []ID{carrier.ID}, Target: next.ID})
	if carrier.Landed || len(carrier.Passengers) != 2 {
		t.Fatal("loaded rebase did not depart normally")
	}
	restored := containerRestore(t, e)
	for range 1600 {
		e.Advance()
		restored.Advance()
		if e.Hash() != restored.Hash() {
			t.Fatal("loaded flight/service restore mismatch")
		}
		if carrier.Landed && carrier.ServiceWork == 0 && len(carrier.Passengers) == 0 {
			break
		}
	}
	if carrier.HP <= 0 || !carrier.Landed || carrier.ServiceWork != 0 || len(carrier.Passengers) != 0 || carrier.Home != next.ID {
		t.Fatal("loaded rebase/service/unload failed", carrier)
	}
	for _, id := range ids {
		v := e.entity(id)
		if v.HP <= 0 || v.Container != 0 || !e.clear(v.Position, e.radius(v), v.ID, false, true) {
			t.Fatal("landing unload failed or overlaps", v)
		}
	}
	candidateBoardReplay(t, e, replay)
}

func TestCandidateBoardingKeepsAlliedTransportOwnershipBoundary(t *testing.T) {
	for _, mode := range []string{"grounded", "hovering", "moving"} {
		e, carrier, ids := containerValidationFixture(t, containerValidationCase{"US.airlift", "US", 1})
		e.player(2).Team = e.player(1).Team
		carrier.Owner = 2
		e.entity(carrier.Home).Owner = 2
		carrier.Landed = mode == "grounded"
		e.recalculate()
		e.updateFog()
		if mode == "moving" {
			issue(t, e, 2, Order{Kind: "move", Entities: []ID{carrier.ID}, Position: Vec{X: 40000, Y: 19000}})
		}
		o := Order{Kind: "board", Entities: ids, Target: carrier.ID}
		if err := e.Submit(1, e.player(1).LastSequence+1, []Order{o}); err != nil {
			t.Fatal(err)
		}
		e.Advance()
		if len(e.state.Results) != 1 || e.state.Results[0].Code != "invalid_transport" || e.state.Results[0].Accepted || len(carrier.Passengers) != 0 {
			t.Fatal("allied ownership policy changed", mode, e.state.Results)
		}
	}
}
