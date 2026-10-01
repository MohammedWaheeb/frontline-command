package sim

import "testing"

func returningEvents(e *Engine) int {
	n := 0
	for _, event := range e.state.Events {
		if event.Kind == "aircraft_returning" {
			n++
		}
	}
	return n
}

func TestCandidateAutomaticReturnNaturalThresholdAndTaskBoundary(t *testing.T) {
	for _, initial := range []uint32{602, 601, 1, 0} {
		for _, task := range []bool{false, true} {
			e, home := droneServiceFixture(t)
			v := droneFixtureActor(e, home, "IR.isr")
			v.Landed = false
			v.Endurance = initial
			if task {
				v.TaskUntil = e.Tick() + 100
			}
			e.recalculate()
			e.updateFog()
			before := v.Position
			e.Advance()
			shouldReturn := initial <= 601 && (!task || initial <= 1)
			if returningEvents(e) != func() int {
				if shouldReturn {
					return 1
				}
				return 0
			}() {
				t.Fatal("automatic event boundary", initial, task, e.state.Events)
			}
			if shouldReturn {
				if !v.Landed || v.HP <= 0 || v.ServiceWork != 1 || v.Endurance != func() uint32 {
					if initial > 0 {
						return initial - 1
					}
					return 0
				}() {
					t.Fatal("legal final tick/automatic service boundary", initial, task, v)
				}
				e.Advance()
				if returningEvents(e) != 0 {
					t.Fatal("duplicate return notification")
				}
			} else if v.Landed || v.Endurance != initial-1 || v.Position != before {
				t.Fatal("premature automatic service", initial, task, v)
			}
		}
	}
}

func TestCandidateAutomaticReturnPreservesQueuesAndEmergencyExpiry(t *testing.T) {
	for _, kind := range []string{"return", "unload-return"} {
		e, home := droneServiceFixture(t)
		v := droneFixtureActor(e, home, "IR.isr")
		v.Landed = false
		v.Endurance = 601
		v.Orders = []Order{{Kind: "return"}, {Kind: "move", Position: Vec{X: 30000, Y: 30000}}}
		if kind == "unload-return" {
			v.Orders = append([]Order{{Kind: "unload", Position: Vec{X: 16000, Y: 35000}}}, v.Orders...)
		}
		before := cloneOrders(v.Orders)
		e.prepareAircraftReturns()
		if returningEvents(e) != 0 || len(v.Orders) != len(before) {
			t.Fatal("duplicated internal Return queue", kind, v.Orders)
		}
		for i, o := range before {
			if o.Kind != v.Orders[i].Kind || o.Position != v.Orders[i].Position {
				t.Fatal("changed queued work", kind)
			}
		}
	}
	e, home := droneServiceFixture(t)
	v := droneFixtureActor(e, home, "IR.isr")
	v.Endurance = 1
	v.EmergencyTakeoffUntil = e.Tick() + 2
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if !v.Landed || v.Endurance != 1 || v.EmergencyTakeoffUntil == 0 {
		t.Fatal("emergency occupancy released early")
	}
	if _, _, ok := e.groundObstacle(v); !ok {
		t.Fatal("emergency ground footprint missing")
	}
	e.Advance()
	if v.HP <= 0 || !v.Landed || v.Endurance != 0 || v.ServiceWork != 1 || v.EmergencyTakeoffUntil != 0 {
		t.Fatal("emergency deadline did not release and use legal final landing", v)
	}
	replay.Capture(e, false)
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("emergency save/replay", err)
	}
}
