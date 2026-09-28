package sim

import "testing"

func rebaseFixture(t *testing.T, typ string) (*Engine, *Entity, *Entity, *Entity) {
	t.Helper()
	e := fixture(t)
	e.player(1).Faction = typ[:2]
	homeType := map[string]string{"US": "US.airfield", "IR": "IR.drone_hub", "SY": "SY.workshop_air", "SA": "SA.airfield"}[typ[:2]]
	home := e.spawn(homeType, 1, Vec{X: 24000, Y: 24000}, true, 0)
	next := e.spawn(homeType, 1, Vec{X: 36000, Y: 24000}, true, 0)
	v := droneFixtureActor(e, home.ID, typ)
	e.recalculate()
	e.updateFog()
	return e, home, next, v
}

func TestRebaseAllAircraftOrdinaryFlightSaveReplay(t *testing.T) {
	for _, typ := range []string{"US.fighter", "US.strike", "US.gunship", "US.airlift", "IR.fighter", "IR.strike", "IR.gunship", "IR.isr", "SY.scout_drone", "SA.fighter", "SA.strike", "SA.gunship"} {
		t.Run(typ, func(t *testing.T) {
			e, old, next, v := rebaseFixture(t, typ)
			initial := v.Position
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			order := Order{Kind: "return", Entities: []ID{v.ID}, Target: next.ID}
			before := e.Hash()
			advice, err := e.PreviewOrders(1, []Order{order})
			if err != nil || len(advice) != 1 || !advice[0].Accepted || advice[0].Code != "indeterminate" || e.Hash() != before {
				t.Fatal("grounded fog-safe advice", advice, err)
			}
			if err = e.Submit(1, 1, []Order{order}); err != nil {
				t.Fatal(err)
			}
			e.Advance()
			if !e.state.Results[0].Accepted || v.Home != next.ID || v.Landed || v.Position == next.Position || distance(initial, v.Position) > 1000 {
				t.Fatalf("invalid departure: %+v %+v", v, e.state.Results)
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			for range 1800 {
				e.Advance()
				restored.Advance()
				if v.Landed && len(v.Orders) == 0 {
					break
				}
			}
			if !v.Landed || len(v.Orders) != 0 || v.Home != next.ID || v.HP <= 0 || distance(v.Position, old.Position) < 5000 {
				t.Fatalf("rebase failed: %+v", v)
			}
			if e.Hash() != restored.Hash() {
				t.Fatal("midflight restore diverged")
			}
			replay.Capture(e, false)
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("rebase replay diverged", err)
			}
		})
	}
}

func TestRebaseReservationsAtomicAndPaidJobs(t *testing.T) {
	e, old, next, a := rebaseFixture(t, "US.fighter")
	b := droneFixtureActor(e, old.ID, "US.fighter")
	rule, _ := e.buildingRule(next.Type)
	for range rule.ServiceSlots - 1 {
		droneFixtureActor(e, next.ID, "US.fighter")
	}
	order := Order{Kind: "return", Entities: []ID{a.ID, b.ID}, Target: next.ID}
	before := e.Hash()
	if code := e.execute(1, order); code != "service_full" || e.Hash() != before {
		t.Fatal("partial reservation", code)
	}
	// A started job owns the last slot even before its aircraft exists.
	next.Jobs = []Job{{Started: true, Service: next.ID}}
	order.Entities = []ID{a.ID}
	before = e.Hash()
	if code := e.execute(1, order); code != "service_full" || e.Hash() != before {
		t.Fatal("stole paid reservation", code)
	}
	next.Jobs = nil
	a.Landed = false
	before = e.Hash()
	advice, err := e.PreviewOrders(1, []Order{order, {Kind: "return", Entities: []ID{b.ID}, Target: next.ID}})
	if err != nil || len(advice) != 2 || advice[0].Code != "ok" || advice[1].Code != "service_full" || e.Hash() != before {
		t.Fatal("sequential capacity advice", advice, err)
	}
	hp, ammo, endurance, pos := a.HP, a.Ammo, a.Endurance, a.Position
	if code := e.execute(1, order); code != "ok" {
		t.Fatal(code)
	}
	if a.HP != hp || a.Ammo != ammo || a.Endurance != endurance || a.Position != pos {
		t.Fatal("rebase supplied free service or movement")
	}
	if code := e.execute(1, order); code != "ok" {
		t.Fatal("already reserved slot double counted", code)
	}
}

func TestRebaseContextCandidatesDoNotConsumeReservations(t *testing.T) {
	e, old, next, a := rebaseFixture(t, "US.fighter")
	b := droneFixtureActor(e, old.ID, "US.fighter")
	rule, _ := e.buildingRule(next.Type)
	for range rule.ServiceSlots - 1 {
		droneFixtureActor(e, next.ID, "US.fighter")
	}
	a.Landed, b.Landed = false, false
	orders := []Order{{Kind: "return", Entities: []ID{a.ID}, Target: next.ID}, {Kind: "return", Entities: []ID{b.ID}, Target: next.ID}}
	before := e.Hash()
	advice, err := e.PreviewCandidates(1, orders)
	if err != nil || len(advice) != 2 || advice[0].Code != "ok" || advice[1].Code != "ok" || e.Hash() != before {
		t.Fatal("independent context probes changed a reservation", advice, err)
	}
	combined := Order{Kind: "return", Entities: []ID{a.ID, b.ID}, Target: next.ID}
	advice, err = e.PreviewOrders(1, []Order{combined})
	if err != nil || len(advice) != 1 || advice[0].Code != "service_full" || e.Hash() != before {
		t.Fatal("combined context group exceeded available slots", advice, err)
	}
}

func TestRebaseRejectsUnavailableTargetsAndService(t *testing.T) {
	for _, scenario := range []string{"unknown", "enemy", "allied", "incomplete", "disabled", "selling", "incompatible", "servicing", "recovering", "queued"} {
		t.Run(scenario, func(t *testing.T) {
			e, _, next, v := rebaseFixture(t, "US.fighter")
			o := Order{Kind: "return", Entities: []ID{v.ID}, Target: next.ID}
			want := "service_unavailable"
			switch scenario {
			case "unknown":
				o.Target = 99999
				want = "owned_service_required"
			case "enemy":
				next.Owner = 2
				want = "owned_service_required"
			case "allied":
				next.Owner = 2
				e.player(2).Team = e.player(1).Team
				want = "owned_service_required"
			case "incomplete":
				next.Complete = false
			case "disabled":
				next.Enabled = false
			case "selling":
				next.Channel = "sell"
			case "incompatible":
				next.Type = "IR.drone_hub"
				want = "incompatible_service"
			case "servicing":
				v.ServiceWork = 1
				want = "aircraft_servicing"
			case "recovering":
				v.EmergencyTakeoffUntil = e.Tick() + 40
				want = "aircraft_recovering"
			case "queued":
				o.Queued = true
				want = "rebase_not_queueable"
			}
			before := e.Hash()
			if code := e.validateRebase(1, o, []*Entity{v}); code != want {
				t.Fatal(code, want)
			}
			if code := e.execute(1, o); code != want || e.Hash() != before {
				t.Fatal("execution changed rejected state", code, want)
			}
			if code := e.previewKnowledge(e.player(1), o); code != want || e.Hash() != before {
				t.Fatal("advice leaked or mutated", code, want)
			}
		})
	}
}

func TestRebaseBlockedTakeoffDoesNotMoveGroupReservations(t *testing.T) {
	e, old, next, a := rebaseFixture(t, "US.fighter")
	b := droneFixtureActor(e, old.ID, "US.fighter")
	blocker := e.spawn("US.fighter", 2, a.Position, true, 0)
	blocker.Landed = false
	o := Order{Kind: "return", Entities: []ID{a.ID, b.ID}, Target: next.ID}
	before := e.Hash()
	if code := e.previewKnowledge(e.player(1), o); code != "indeterminate" {
		t.Fatal("hidden obstacle disclosed", code)
	}
	if code := e.execute(1, o); code != "takeoff_blocked" || e.Hash() != before {
		t.Fatal("blocked group partially rebased", code)
	}
}

func TestRebaseHomeLossUpdatesExplicitReturnTarget(t *testing.T) {
	e, old, next, v := rebaseFixture(t, "US.fighter")
	v.Landed = false
	if code := e.execute(1, Order{Kind: "return", Entities: []ID{v.ID}, Target: next.ID}); code != "ok" {
		t.Fatal(code)
	}
	// Actual lethal impact invokes normal lost-service reservation recovery.
	droneLethalImpact(e, next.ID, e.Tick()+1)
	for range 3 {
		e.Advance()
	}
	if v.Home != old.ID || len(v.Orders) == 0 || v.Orders[0].Kind != "return" || v.Orders[0].Target != old.ID {
		t.Fatalf("stale return after home loss %+v", v)
	}
}
