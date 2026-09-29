package sim

import (
	"fmt"
	"strings"
	"testing"
)

func TestCandidateServiceRejectsMalformedReservations(t *testing.T) {
	for _, kind := range []string{"wrong_home", "out_of_bounds", "inside_home", "overlap", "not_returning", "landed", "future_retry", "ground_retry", "old_version"} {
		t.Run(kind, func(t *testing.T) {
			e, home, planes := serviceCandidateScene(t, serviceScenes[0])
			ids := []ID{}
			for _, v := range planes {
				ids = append(ids, v.ID)
			}
			issue(t, e, 1, Order{Kind: "return", Entities: ids})
			v := planes[0]
			switch kind {
			case "wrong_home":
				v.Landing.Home = 1
			case "out_of_bounds":
				v.Landing.Position.X = -1
			case "inside_home":
				v.Landing.Position = home.Position
			case "overlap":
				v.Landing.Position = planes[1].Landing.Position
			case "not_returning":
				v.Orders = nil
			case "landed":
				v.Landed = true
			case "future_retry":
				v.ParkingRetryAt = e.Tick() + 21
			case "ground_retry":
				e.entity(2).ParkingRetryAt = e.Tick() + 1
			case "old_version":
				e.state.Metadata.Simulation = "0.3.3"
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = Restore(e.catalog, saved); err == nil {
				t.Fatal("accepted invalid reservation", kind)
			}
			if kind == "old_version" && !strings.Contains(err.Error(), "incompatible simulation") {
				t.Fatal(err)
			}
		})
	}
}

func TestCandidateGroundRouteBridgeAndConstructionRespectReservation(t *testing.T) {
	e, _, planes := serviceCandidateScene(t, serviceScenes[0])
	v := planes[0]
	issue(t, e, 1, Order{Kind: "return", Entities: []ID{v.ID}})
	point := v.Landing.Position
	worker := e.spawn("US.rig", 1, Vec{X: point.X - 6000, Y: point.Y - 1000}, true, 0)
	e.spawn("outpost", 1, Vec{X: 28000, Y: 27000}, true, 0)
	e.recalculate()
	e.updateFog()
	if got := e.validPlacement(1, Vec{X: point.X, Y: point.Y - 200}, 2, 2); got != "occupied" && got != "snap_to_grid" {
		t.Fatal("placement reservation", got)
	}
	// Snap a real2x2 foundation through the reservation, retaining ordinary fog.
	snapped := Vec{X: point.X / 500 * 500, Y: point.Y / 500 * 500}
	if got := e.validPlacement(1, snapped, 2, 2); got != "occupied" {
		t.Fatal("exact placement did not reject pad", got)
	}
	build := Order{Kind: "build", Entities: []ID{worker.ID}, Type: "power", Position: snapped}
	beforeAdvice := e.Hash()
	advice, err := e.PreviewOrders(1, []Order{build})
	if err != nil || len(advice) != 1 || advice[0].Code != "indeterminate" || e.Hash() != beforeAdvice {
		t.Fatal("build advice must remain fog-safe and not promise geometry", advice, err)
	}
	if err = e.Submit(1, e.player(1).LastSequence+1, []Order{build}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 || e.state.Results[0].Code != "occupied" || e.state.Results[0].Accepted {
		t.Fatal("actual build entered parking reservation", e.state.Results)
	}

	e.pathBudget = 12
	goal := Vec{X: point.X + 6000, Y: worker.Position.Y}
	if e.navigationBridgeClear(worker, goal, true) {
		t.Fatal("swept bridge tunneled through operational area")
	}
	path := e.findPath(worker, goal, true)
	if len(path) == 0 {
		t.Fatal("ground path could not go around exterior pad")
	}
	for _, p := range path {
		if !e.mobileClear(p, e.radius(worker), worker.ID) {
			t.Fatal("dynamic A* entered reserved pad", p)
		}
	}
	before := worker.Position
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{worker.ID}, Position: goal})
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	minDistance := int32(100000)
	for range 600 {
		e.Advance()
		restored.Advance()
		minDistance = min(minDistance, distance(worker.Position, point))
		if len(worker.Orders) == 0 {
			break
		}
	}
	if worker.Position == before || distance(worker.Position, goal) > 1500 {
		t.Fatalf("actual ground movement blocked worker=%+v goal=%+v aircraft=%+v minimum=%d radius=%d", worker, goal, v, minDistance, e.radius(worker))
	}
	if minDistance < e.radius(worker)+serviceParkingRadius(v.Type)+serviceParkingMargin {
		t.Fatal("actual movement entered aircraft area", minDistance)
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("ground service reroute restore divergence")
	}
	recorder.Capture(e, false)
	played, err := recorder.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("ground service reroute replay", err)
	}
}

func TestCandidateServiceAllocationBudgetRetryAndLegalRecovery(t *testing.T) {
	e := fixture(t)
	homes := []*Entity{}
	for _, point := range []Vec{{X: 20000, Y: 40000}, {X: 40000, Y: 40000}} {
		homes = append(homes, e.spawn("US.airfield", 1, point, true, 0))
	}
	planes := []*Entity{}
	for _, home := range homes {
		for i := range 6 {
			v := e.spawn("US.fighter", 1, Vec{X: home.Position.X - 7000 + int32(i%3)*3000, Y: home.Position.Y - 7000 + int32(i/3)*14000}, true, 0)
			v.Home = home.ID
			v.Landed = false
			v.Orders = []Order{{Kind: "return"}}
			planes = append(planes, v)
		}
	}
	e.recalculate()
	e.updateFog()
	e.updateServiceParking()
	count := 0
	for _, v := range planes {
		if v.Landing != nil {
			count++
		}
	}
	if e.parkingMetrics.MaxAttempts != 8 || count != 8 {
		t.Fatal("allocation cap", count, e.parkingMetrics)
	}
	e.state.Tick++
	e.updateServiceParking()
	count = 0
	for _, v := range planes {
		if v.Landing != nil {
			count++
		}
	}
	if count != 12 {
		t.Fatal("later actor IDs starved", count)
	}
	// A saturated exterior apron keeps a paid slot and money without spawning.
	e2 := fixture(t)
	baseInfrastructure(e2, 1)
	home := e2.spawn("US.airfield", 1, Vec{X: 35000, Y: 40000}, true, 0)
	blockers := []*Entity{}
	for y := int32(34000); y <= 46000; y += 1000 {
		for x := int32(28000); x <= 42000; x += 1000 {
			blockers = append(blockers, e2.spawn("US.rifle", 1, Vec{X: x, Y: y}, true, 0))
		}
	}
	home.Jobs = []Job{{Type: "US.fighter", Started: true, Paid: 1000000, Supply: 4, Service: home.ID, Required: 20, Work: 20}}
	e2.recalculate()
	credits := e2.player(1).Credits
	next := e2.state.NextID
	e2.updateJobs(e2.player(1), home)
	if home.State != "exit_blocked" || e2.state.NextID != next || len(home.Jobs) != 1 || home.Jobs[0].Paid != 1000000 || home.Jobs[0].Service != home.ID || credits != e2.player(1).Credits {
		t.Fatal("blocked paid completion changed accounting")
	}
	attempts := e2.parkingMetrics.Attempts
	for _, v := range blockers {
		v.HP = 0
	}
	e2.updateJobs(e2.player(1), home)
	if e2.parkingMetrics.Attempts != attempts {
		t.Fatal("same-tick retry ignored cadence")
	}
	e2.state.Tick += 20
	e2.updateJobs(e2.player(1), home)
	v := e2.entity(next)
	if v == nil || !v.Landed || len(home.Jobs) != 0 || !e2.serviceParkingClear(v, home, v.Position, nil) {
		t.Fatal("paid production did not recover legally")
	}
}

func TestCandidateDenseHomeExhaustiveLocalDiagnostic(t *testing.T) {
	e, ids := maximumAirReturnFixture(t)
	v := e.entity(ids[0])
	home := e.entity(v.Home)
	obstacles := e.parkingObstacles(v, home)
	legal := 0
	// Exhaustive100mt grid of the full home+2600 contact envelope, not only
	// allocator candidates. Continuous-space proof is separate from sampling.
	for y := home.Position.Y - 4600; y <= home.Position.Y+4600; y += 100 {
		for x := home.Position.X - 4600; x <= home.Position.X+4600; x += 100 {
			if e.serviceParkingClear(v, home, Vec{X: x, Y: y}, obstacles) {
				legal++
			}
		}
	}
	t.Logf("dense home%d, full contact envelope100mt-grid legal positions=%d; candidate=%d", home.ID, legal, len(e.serviceCandidates(v, home)))
	if legal != 0 {
		t.Fatal("allocator missed sampled legal positions; investigate", legal)
	}
}

func TestCandidateTransientFoundationClearsReservationBeforeSave(t *testing.T) {
	e, home, planes := serviceCandidateScene(t, serviceScenes[0])
	v := planes[0]
	issue(t, e, 1, Order{Kind: "return", Entities: []ID{v.ID}})
	point := v.Landing.Position
	// Simulate an authoritative final-stage foundation/mission spawn, not a
	// player build (which must reject the reserved footprint). Prune must make
	// that same tick's save restorable, without allocating a second point.
	e.spawn("power", 1, point, true, 0)
	attempts := e.parkingMetrics.Attempts
	e.pruneServiceParking()
	if v.Landing != nil || v.Home != home.ID || e.parkingMetrics.Attempts != attempts {
		t.Fatal("boundary prune reallocated or lost home")
	}
	e.recalculate()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("authoritative boundary no longer reloads", err)
	}
}

func TestCandidateBalancedRingCoverageFindsFarSidePocket(t *testing.T) {
	e, home, planes := serviceCandidateScene(t, serviceScenes[0])
	v := planes[0]
	// All default pads and nearer perimeter are occupied by legal static
	// circles. The right exterior2600-offset center remains available.
	goal := Vec{X: home.Position.X + home.FootprintWidth*500 + 2600, Y: home.Position.Y}
	for _, point := range e.serviceCandidates(v, home) {
		if distance(point, goal) < 3300 {
			continue
		}
		e.spawn("US.rifle", 2, point, true, 0)
	}
	if !e.serviceParkingClear(v, home, goal, nil) {
		t.Fatal("test pocket unexpectedly obstructed")
	}
	point, ok := e.serviceLandingPosition(v, home)
	if !ok {
		t.Fatal("late side/ring pocket omitted")
	}
	if !e.serviceParkingClear(v, home, point, nil) {
		t.Fatal("allocator returned illegal pocket")
	}
	if len(e.serviceCandidates(v, home)) > 128 {
		t.Fatal("candidate bound exceeded")
	}
	t.Logf("available far-side pocket%+v, selected%+v, candidates%d", goal, point, len(e.serviceCandidates(v, home)))
}

func TestCandidateTangentSubgridStartAndNarrowPassage(t *testing.T) {
	for _, offset := range []int32{0, 1, 119} {
		t.Run(fmt.Sprint(offset), func(t *testing.T) {
			e, home, planes := serviceCandidateScene(t, serviceScenes[0])
			plane := planes[0]
			p, ok := e.serviceLandingPosition(plane, home)
			if !ok {
				t.Fatal("pad")
			}
			plane.Position = p
			plane.Landed = true
			//2300is the exact operational+rig boundary.125mt planning padding must
			// not prevent a valid physical unit inside that padding from leaving.
			unit := e.spawn("US.rig", 1, Vec{X: p.X, Y: p.Y - 2300 - offset}, true, 0)
			e.recalculate()
			e.updateFog()
			if !e.clear(unit.Position, e.radius(unit), unit.ID, false, true) {
				t.Fatal("physical tangent start was rejected")
			}
			goal := Vec{X: unit.Position.X, Y: unit.Position.Y - 4000}
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{unit.ID}, Position: goal})
			ticks(e, 250)
			if distance(unit.Position, goal) > 1000 {
				t.Fatal("conservative raster trapped tangent start", unit.Position, goal)
			}
		})
	}
	// A corridor250mt wider than true diameter admits the125mt-per-side
	// planning envelope exactly; actual clearance is not widened.
	e := fixture(t)
	a := e.spawn("US.airlift", 1, Vec{X: 30000, Y: 30000}, true, 0)
	b := e.spawn("US.airlift", 1, Vec{X: 30000, Y: 35000}, true, 0)
	unit := e.spawn("US.rig", 1, Vec{X: 26000, Y: 32500}, true, 0)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{unit.ID}, Position: Vec{X: 34000, Y: 32500}})
	ticks(e, 400)
	if unit.Position.X < 33000 {
		t.Fatal("otherwise-valid narrow corridor blocked", unit.Position, a.ID, b.ID)
	}
}

func TestCandidatePreviewIsReadOnlyAndReservationFogSafe(t *testing.T) {
	e, _, planes := serviceCandidateScene(t, serviceScenes[0])
	v := planes[0]
	issue(t, e, 1, Order{Kind: "return", Entities: []ID{v.ID}})
	before, attempts := e.Hash(), e.parkingMetrics.Attempts
	orders := []Order{{Kind: "return", Entities: []ID{v.ID}}}
	first, err := e.PreviewOrders(1, orders)
	if err != nil {
		t.Fatal(err)
	}
	if e.Hash() != before || e.parkingMetrics.Attempts != attempts {
		t.Fatal("preview consumed live parking work")
	}
	// Adversary reservations are never copied into this owner's public view.
	for _, shown := range func() []EntityView { view, _ := e.PlayerView(2); return view.Entities }() {
		if shown.ID == v.ID && shown.Private != nil {
			t.Fatal("opponent received private actor data")
		}
	}
	home2 := e.spawn("IR.drone_hub", 2, Vec{X: 53000, Y: 44000}, true, 0)
	hidden := e.spawn("IR.isr", 2, Vec{X: 57000, Y: 44000}, true, 0)
	hidden.Home = home2.ID
	hidden.Landed = false
	hidden.Orders = []Order{{Kind: "return"}}
	e.recalculate()
	e.updateFog()
	if e.canSeeEntity(1, hidden) {
		t.Fatal("foreign reservation fixture was visible")
	}
	e.updateServiceParking()
	second, err := e.PreviewOrders(1, orders)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != len(second) || first[0].Code != second[0].Code || first[0].Accepted != second[0].Accepted {
		t.Fatal("preview exposed foreign service reservations", first, second)
	}
}

func TestCandidateNarrowPhysicalPassageRemainsRoutable(t *testing.T) {
	e := fixture(t)
	for y := int32(0); y < 64; y++ {
		if y >= 28 && y < 37 {
			continue
		}
		for x := int32(0); x < 64; x++ {
			e.state.Map.Tiles[y*64+x].Terrain = "cliff"
		}
	}
	e.state.NavigationRevision++
	e.spawn("US.airlift", 1, Vec{X: 32000, Y: 30000}, true, 0)
	e.spawn("US.airlift", 1, Vec{X: 32000, Y: 34800}, true, 0)
	unit := e.spawn("US.rig", 1, Vec{X: 26000, Y: 32500}, true, 0)
	e.pathBudget = 12
	for x := int32(26000); x <= 38000; x += 100 {
		if !e.clear(Vec{X: x, Y: 32500}, 600, unit.ID, false, true) {
			t.Fatal("fixture passage is not physically legal", x)
		}
	}
	path := e.findPath(unit, Vec{X: 38000, Y: 32500}, true)
	if len(path) == 0 {
		t.Fatal("planning clearance closed physically legal200mt gap")
	}
}

func TestCandidateAutomaticReturnLastTick(t *testing.T) {
	e, home := droneServiceFixture(t)
	v := droneFixtureActor(e, home, "IR.isr")
	v.Landed = false
	v.Endurance = 1
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if v.HP <= 0 || !v.Landed || v.Endurance != 0 {
		t.Fatal("automatic Return lost last-tick legal landing", v.HP, v.Landed, v.Endurance)
	}
	replay.Capture(e, false)
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("automatic final-tick replay", err)
	}
}
