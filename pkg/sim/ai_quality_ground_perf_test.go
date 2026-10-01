package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"runtime"
	"testing"
)

func aiGroundPerfSubmit(t testing.TB, e *Engine, orders []Order) {
	t.Helper()
	for len(orders) > 0 {
		n := min(32, len(orders))
		if err := e.Submit(1, e.player(1).LastSequence+1, orders[:n]); err != nil {
			t.Fatal(err)
		}
		orders = orders[n:]
	}
}

// Only infrastructure and treasury are seeded. Every measured infantry actor
// is ordinarily queued, paid, built and sent to its public assembly rally.
func aiGroundPerfPaidArmy(t testing.TB, typ string) (*Engine, []ID, Vec) {
	t.Helper()
	m := fixtureMap()
	m.Width, m.Height = 256, 256
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	p := e.player(1)
	p.Credits = 60000000
	rule, ok := e.catalog.Unit(typ)
	if !ok || rule.Supply <= 0 || rule.Weapon == "" || rule.Armor != "infantry" {
		t.Fatal("invalid paid infantry fixture", typ)
	}
	count := int(100 / rule.Supply)
	for i := int32(0); i < 5; i++ {
		e.spawn("power", 1, Vec{X: 6000 + i*4000, Y: 40000}, true, 0)
	}
	producers := make([]ID, 0, count/2)
	rallies, jobs := []Order{}, []Order{}
	for i := 0; i < count/2; i++ {
		producer := e.spawn("barracks", 1, Vec{X: 6500 + int32(i%10)*4000, Y: 16000 + int32(i/10)*4000}, true, 0)
		producers = append(producers, producer.ID)
		rally := Vec{X: 26500 + int32(i%10)*700, Y: 43500 + int32(i/10)*1400}
		rallies = append(rallies, Order{Kind: "rally", Entities: []ID{producer.ID}, Position: rally})
		jobs = append(jobs, Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ}, Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ})
	}
	e.recalculate()
	if p.LowPower() || len(producers)+6 > 60 {
		t.Fatal("illegal seeded infrastructure")
	}
	aiGroundPerfSubmit(t, e, rallies)
	aiGroundPerfSubmit(t, e, jobs)
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("paid assembly command rejected", result)
		}
	}
	if p.Credits != 60000000-int64(count/2)*rule.Cost || p.ReservedSupply != int32(count/2)*rule.Supply {
		t.Fatal("ordinary first jobs did not debit and reserve", p.Credits, p.ReservedSupply)
	}
	for _, id := range producers {
		v := e.entity(id)
		if len(v.Jobs) != 2 || !v.Jobs[0].Started || v.Jobs[0].Paid != rule.Cost || v.Jobs[0].Work != 2 || v.Jobs[1].Started {
			t.Fatal("ordinary queue progress changed", v.Jobs)
		}
	}
	goal := Vec{X: 33000, Y: 46500}
	threatPosition := goal
	// Complete the ordinary paid queues before the separate measured layout.
	for e.Tick() < Tick(rule.BuildTicks*2+1) {
		e.Advance()
	}
	army := []ID{}
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Type == typ && v.HP > 0 {
			if v.Paid != rule.Cost {
				t.Fatal("actor bypassed ordinary paid production", v.ID, v.Paid)
			}
			army = append(army, v.ID)
		}
	}
	if len(army) != count || p.Supply != 100 || p.ReservedSupply != 0 || p.Credits != 60000000-int64(count)*rule.Cost || p.Spent != int64(count)*rule.Cost {
		t.Fatal("paid legal maximum army incomplete", len(army), p.Supply, p.ReservedSupply, p.Credits, p.Spent)
	}
	// Distinct tile-center destinations leave actual public cover cells between
	// paid actors. These are admitted ordinary Moves, never position injection.
	columns := []int32{26500, 28500, 29500, 30500, 32500, 33500, 35500, 36500, 37500, 39500}
	rows := []int32{40500, 41500, 43500, 44500, 45500, 47500, 48500, 49500, 51500, 52500}
	destinations := map[ID]Vec{}
	moves := []Order{}
	for i, id := range army {
		row := i / 10
		if count == 50 {
			row *= 2
		}
		point := Vec{X: columns[i%10], Y: rows[row]}
		destinations[id] = point
		moves = append(moves, Order{Kind: "move", Entities: []ID{id}, Position: point})
	}
	aiGroundPerfSubmit(t, e, moves)
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("individual paid layout Move rejected", result)
		}
	}
	// The performance contract needs paid actors inside the public threat area,
	// not exact clicks: ordinary navigation may finish at an adjusted clear node.
	// Stop actual reached/in-flight positions after at most500 layout ticks.
	layoutUntil := e.Tick() + 500
	for e.Tick() < layoutUntil {
		ready := 0
		for _, id := range army {
			v := e.entity(id)
			if v.Active(e.Tick()) && v.HP == v.MaxHP && v.Channel == "" && v.Container == 0 && distance(v.Position, goal) < 10000 && (len(v.Orders) == 0 || len(v.Orders) == 1 && v.Orders[0].Kind == "move" && !v.Orders[0].Queued && v.Orders[0].Position == destinations[id]) {
				ready++
			}
		}
		if ready == count {
			break
		}
		e.Advance()
	}
	stops := []Order{}
	settled := map[ID]Vec{}
	for _, id := range army {
		v := e.entity(id)
		if !v.Active(e.Tick()) || v.HP != v.MaxHP || v.Channel != "" || v.Container != 0 || distance(v.Position, goal) >= 10000 || len(v.Orders) > 1 || len(v.Orders) == 1 && (v.Orders[0].Kind != "move" || v.Orders[0].Queued || v.Orders[0].Position != destinations[id]) {
			t.Fatal("bounded individual Move did not place healthy unqueued actor inside public threat area", id, v.Position, v.Orders)
		}
		settled[id] = v.Position
		stops = append(stops, Order{Kind: "stop", Entities: []ID{id}})
	}
	aiGroundPerfSubmit(t, e, stops)
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("ordinary assembly Stop rejected", result)
		}
	}
	for _, id := range army {
		v := e.entity(id)
		if len(v.Orders) != 0 || v.Position != settled[id] {
			t.Fatal("assembly Stop failed to settle actual position", id, v.Position, settled[id], v.Orders)
		}
	}
	// The 100-recon case uses a full normal command window for each batch.
	// Let that ordinary window expire before the separate attack intentions.
	for range 20 {
		e.Advance()
	}
	assaults := []Order{}
	for _, id := range army {
		v := e.entity(id)
		if len(v.Orders) != 0 || distance(v.Position, goal) >= 10000 {
			t.Fatal("bounded ordinary assembly did not reach threat area", id, v.Position)
		}
		assaults = append(assaults, Order{Kind: "attack_move", Entities: []ID{id}, Position: goal})
	}
	aiGroundPerfSubmit(t, e, assaults)
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("ordinary assault rejected", result)
		}
	}
	for y := int32(37); y <= 56; y++ {
		for x := int32(23); x <= 42; x++ {
			if (x+y)%2 == 0 {
				e.state.Map.Tiles[y*m.Width+x].Terrain = "cover"
			}
		}
	}
	for _, id := range army {
		pos := e.entity(id).Position
		e.state.Map.Tiles[pos.Y/1000*m.Width+pos.X/1000].Terrain = "open"
	}
	threat := e.spawn("IR.rifle", 2, threatPosition, true, 0)
	p.AI, p.AIStage = "hard", 4
	e.recalculate()
	e.updateFog()
	if !e.canSeeEntity(1, threat) {
		t.Fatal("public threat fixture is unseen")
	}
	e.aiObserve(p, func() View { view, _ := e.PlayerView(1); return view }())
	positions, _ := json.Marshal(settled)
	t.Logf("paid_fixture type=%s actors=%d Supply=%d spent=%d setup_ticks=%d public_tiles=%d seeded_structures=%d positions_after_admitted_Stop=%s", typ, len(army), p.Supply, p.Spent, e.Tick(), len(m.Tiles), len(producers)+6, positions)
	return e, army, goal
}

func aiGroundPerfRestore(t testing.TB, e *Engine) *Engine {
	t.Helper()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	if twin.Hash() != e.Hash() {
		t.Fatal("restore changed state")
	}
	return twin
}

func aiGroundPerfAllocation(t *testing.T, e *Engine, own []EntityView, goal Vec) {
	t.Helper()
	old := e.aiGroundPerfRecoveryReference(e.player(1), own, goal)
	fresh := e.aiRecoveryOrders(e.player(1), own, goal)
	if !reflect.DeepEqual(old, fresh) {
		t.Fatal("allocation workloads have different ordered output")
	}
	measure := func(call func() []Order) (uint64, uint64) {
		runtime.GC()
		var before, after runtime.MemStats
		runtime.ReadMemStats(&before)
		retained := 0
		for range 2 {
			retained += len(call())
		}
		runtime.ReadMemStats(&after)
		if retained != 2*len(old) {
			t.Fatal("allocation query changed output count")
		}
		return (after.TotalAlloc - before.TotalAlloc) / 2, (after.Mallocs - before.Mallocs) / 2
	}
	oldBytes, oldAllocs := measure(func() []Order { return e.aiGroundPerfRecoveryReference(e.player(1), own, goal) })
	newBytes, newAllocs := measure(func() []Order { return e.aiRecoveryOrders(e.player(1), own, goal) })
	t.Logf("allocation_receipt ordered_intentions=%d old_bytes_per_pass=%d new_bytes_per_pass=%d old_allocations_per_pass=%d new_allocations_per_pass=%d samples=2 no_hardware_speed_claim", len(old), oldBytes, newBytes, oldAllocs, newAllocs)
	if newBytes*4 >= oldBytes || newAllocs*4 >= oldAllocs {
		t.Fatal("shared eligible geometry did not remove repeated view construction", oldBytes, newBytes, oldAllocs, newAllocs)
	}
}

func TestAIQualityGroundPerfPaidMaximumSupplyEquivalent(t *testing.T) {
	for _, typ := range []string{"US.rifle", "US.recon"} {
		t.Run(typ, func(t *testing.T) {
			e, army, goal := aiGroundPerfPaidArmy(t, typ)
			hash := e.Hash()
			view, _ := e.PlayerView(1)
			var shared *Engine
			referenceContexts, sharedContexts, useful := 0, 0, 0
			for _, id := range army {
				want, ok := e.aiGroundPerfCoverCountedReference(e.player(1), e.entity(id), goal, &referenceContexts)
				prior := shared
				got, good := e.aiCoverPositionWithGeometry(e.player(1), e.entity(id), goal, &shared)
				if prior == nil && shared != nil {
					sharedContexts++
				}
				if prior != nil && prior != shared {
					t.Fatal("shared geometry was rebuilt during an unchanged pass")
				}
				if ok {
					useful++
				}
				direct, directOK := e.aiCoverPosition(e.player(1), e.entity(id), goal)
				if good != ok || directOK != ok || got != want || direct != want {
					t.Fatal("paid actor cover result differs", id, want, ok, got, good, direct, directOK)
				}
			}
			if useful < 2 || referenceContexts != len(army) || sharedContexts != 1 {
				t.Fatal("paid corpus lacks meaningful eligible cover queries or expected context reuse", useful, referenceContexts, sharedContexts, len(army))
			}
			t.Logf("geometry_receipt actors=%d actual_useful_cover=%d eager_reference_contexts=%d shared_contexts=%d", len(army), useful, referenceContexts, sharedContexts)
			expected := e.aiPlacementKnowledge(e.player(1))
			if shared == nil || !reflect.DeepEqual(shared.state.Entities, expected.state.Entities) || !reflect.DeepEqual(shared.state.Fields, expected.state.Fields) || !reflect.DeepEqual(shared.state.Stations, expected.state.Stations) || !reflect.DeepEqual(shared.state.Map, expected.state.Map) {
				t.Fatal("shared public proxies or map differ")
			}
			current, _ := e.PlayerView(1)
			if hash != e.Hash() || !reflect.DeepEqual(view, current) {
				t.Fatal("cover queries mutated state or authorized view")
			}
			own := aiOwnView(e, 1)
			aiGroundPerfAllocation(t, e, own, goal)
			oracle := aiGroundPerfRestore(t, e)
			e.updateAI()
			oracle.aiGroundPerfUpdateReference()
			a, _ := json.Marshal(e.state.Pending)
			b, _ := json.Marshal(oracle.state.Pending)
			if !bytes.Equal(a, b) || e.Hash() != oracle.Hash() {
				t.Fatal("complete chosen/submitted plans, cursors or resources differ")
			}
			t.Logf("exact_dispatch_hash=%s batches=%d", e.Hash(), len(e.state.Pending))
			if typ == "US.rifle" {
				restored := aiGroundPerfRestore(t, e)
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				for i := 0; i < 240; i++ {
					e.Advance()
					oracle.aiGroundPerfAdvanceReference()
					restored.Advance()
					if e.Hash() != oracle.Hash() || e.Hash() != restored.Hash() {
						t.Fatal("ordinary reference/restore continuation drift", e.Tick())
					}
					if err := replay.Capture(e, false); err != nil {
						t.Fatal(err)
					}
					if i == 119 {
						restored = aiGroundPerfRestore(t, e)
					}
				}
				played, err := replay.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("full replay differs", err)
				}
				t.Logf("ordinary_reference_restore_replay_ticks=240 final_tick=%d final_hash=%s", e.Tick(), e.Hash())
			}
		})
	}
}

func aiGroundPerfSmall(t testing.TB) (*Engine, *Entity, Vec) {
	t.Helper()
	e := fixture(t)
	e.state.Tick = seconds(20)
	unit := e.spawn("US.rifle", 1, Vec{X: 20500, Y: 20500}, true, 0)
	goal := Vec{X: 24500, Y: 20500}
	p := e.player(1)
	p.AI = "hard"
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.rifle", Position: goal, Seen: e.Tick()}}
	for _, point := range []Vec{{X: 19500, Y: 20500}, {X: 21500, Y: 20500}} {
		e.state.Map.Tiles[point.Y/1000*e.state.Map.Width+point.X/1000].Terrain = "cover"
	}
	e.recalculate()
	e.updateFog()
	return e, unit, goal
}

func TestAIQualityGroundPerfLazyEligibilityAndTie(t *testing.T) {
	for _, condition := range []string{"tie", "open", "unseen", "out_of_range", "already_cover", "no_threat", "unarmed", "blocked"} {
		t.Run(condition, func(t *testing.T) {
			e, unit, goal := aiGroundPerfSmall(t)
			wantGeometry := true
			switch condition {
			case "open":
				for i := range e.state.Map.Tiles {
					e.state.Map.Tiles[i].Terrain = "open"
				}
				wantGeometry = false
			case "unseen":
				for i := range e.visible[1] {
					e.visible[1][i] = false
				}
				wantGeometry = false
			case "out_of_range":
				goal = Vec{X: 40000, Y: 20500}
				wantGeometry = false
			case "already_cover":
				e.state.Map.Tiles[20*e.state.Map.Width+20].Terrain = "cover"
				wantGeometry = false
			case "no_threat":
				e.player(1).AIKnowledge = nil
				wantGeometry = false
			case "unarmed":
				unit.Type = "US.medic"
				wantGeometry = false
			case "blocked":
				e.spawn("power", 2, Vec{X: 18500, Y: 20500}, true, 0)
				e.spawn("power", 2, Vec{X: 22500, Y: 20500}, true, 0)
				e.updateFog()
			}
			want, ok := e.aiGroundPerfCoverReference(e.player(1), unit, goal)
			var known *Engine
			got, good := e.aiCoverPositionWithGeometry(e.player(1), unit, goal, &known)
			if got != want || good != ok || (known != nil) != wantGeometry {
				t.Fatal("lazy eligibility or exact cover result differs", got, good, want, ok, known != nil, wantGeometry)
			}
			if condition == "tie" && (!good || got != (Vec{X: 19500, Y: 20500})) {
				t.Fatal("strict y/x equal-dist2 tie changed", got, good)
			}
			if condition == "blocked" && good {
				t.Fatal("visible geometry did not reject blocked cover")
			}
			if known != nil {
				first := known
				e.aiCoverPositionWithGeometry(e.player(1), unit, goal, &known)
				if first != known {
					t.Fatal("same-pass geometry rebuilt")
				}
			}
		})
	}
}

func TestAIQualityGroundPerfHiddenGeometryAndFreshPass(t *testing.T) {
	e, unit, goal := aiGroundPerfSmall(t)
	for i := range e.state.Map.Tiles {
		e.state.Map.Tiles[i].Terrain = "open"
	}
	cover := Vec{X: 23500, Y: 23500}
	index := cover.Y/1000*e.state.Map.Width + cover.X/1000
	e.state.Map.Tiles[index].Terrain = "cover"
	e.state.Map.Tiles[index].SightBlocker = true
	// Authored fixture geometry changed before cloning. Invalidate the same
	// derived fog/navigation revision used by ordinary terrain changes.
	e.state.NavigationRevision++
	e.updateFog()
	hidden := aiGroundPerfRestore(t, e)
	collider := hidden.spawn("power", 2, Vec{X: 24500, Y: 24500}, true, 0)
	hidden.player(2).Credits = 90000000
	hidden.entity(3).Jobs = []Job{{Type: "IR.rig"}}
	hidden.updateFog()
	if hidden.canSee(1, collider.Position) || hidden.canSeeEntity(1, collider) || !hidden.canSee(1, cover) {
		t.Fatal("hidden collision fixture is observed")
	}
	hidden.pathBudget = 1
	hidden.findPath(hidden.entity(unit.ID), goal, true)
	hiddenHash := hidden.Hash()
	av, _ := e.PlayerView(1)
	bv, _ := hidden.PlayerView(1)
	if !reflect.DeepEqual(av, bv) {
		t.Fatal("hidden twins differ in authorized view")
	}
	a := e.aiRecoveryOrders(e.player(1), aiOwnView(e, 1), goal)
	b := hidden.aiRecoveryOrders(hidden.player(1), aiOwnView(hidden, 1), goal)
	old := hidden.aiGroundPerfRecoveryReference(hidden.player(1), aiOwnView(hidden, 1), goal)
	if !reflect.DeepEqual(a, b) || !reflect.DeepEqual(b, old) || hidden.Hash() != hiddenHash {
		t.Fatal("concealed collider or warmed full-world cache affected public recovery")
	}
	if hidden.navigationBridgeClear(hidden.entity(unit.ID), cover, false) {
		t.Fatal("hidden collider does not actually obstruct ordinary geometry")
	}
	e.updateAI()
	hidden.updateAI()
	if !reflect.DeepEqual(e.state.Pending, hidden.state.Pending) || e.player(1).Credits != hidden.player(1).Credits || e.player(1).AIScout != hidden.player(1).AIScout {
		t.Fatal("complete chosen plan used hidden opponent state")
	}
	before, _ := aiUnitOrder(b, unit.ID)
	hidden.player(1).AI = ""
	issue(t, hidden, 1, Order{Kind: "move", Entities: []ID{unit.ID}, Position: Vec{X: 22500, Y: 24500}})
	for i := 0; i < 180 && len(hidden.entity(unit.ID).Orders) > 0; i++ {
		hidden.Advance()
	}
	if len(hidden.entity(unit.ID).Orders) > 0 {
		t.Fatal("ordinary observer movement did not finish")
	}
	hidden.player(1).AI = "hard"
	hidden.updateFog()
	if !hidden.canSeeEntity(1, collider) {
		t.Fatal("ordinary later observer movement did not reveal collision")
	}
	after := hidden.aiRecoveryOrders(hidden.player(1), aiOwnView(hidden, 1), goal)
	afterOld := hidden.aiGroundPerfRecoveryReference(hidden.player(1), aiOwnView(hidden, 1), goal)
	changed, ok := aiUnitOrder(after, unit.ID)
	if !reflect.DeepEqual(after, afterOld) || ok || before.Position != cover {
		t.Fatal("new visible collision pass reused stale geometry", before, changed, ok)
	}
}

func TestAIQualityGroundPerfPlayerAndTransportSeparation(t *testing.T) {
	e, unit, goal := aiGroundPerfSmall(t)
	var first *Engine
	e.aiCoverPositionWithGeometry(e.player(1), unit, goal, &first)
	original := append([]*Entity(nil), first.state.Entities...)
	e.player(1).AI = ""
	carrier := e.spawn("US.apc", 1, Vec{X: 30000, Y: 20000}, true, 0)
	passenger := e.spawn("US.rifle", 1, carrier.Position, true, 0)
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{passenger.ID}, Target: carrier.ID})
	for i := 0; i < 180 && passenger.Container == 0; i++ {
		e.Advance()
	}
	if passenger.Container != carrier.ID {
		t.Fatal("ordinary passenger did not embark")
	}
	transport := e.aiGroundGeometry(e.player(1), aiOwnView(e, 1))
	if transport == first || !reflect.DeepEqual(first.state.Entities, original) {
		t.Fatal("transport appended proxies into cover geometry")
	}
	p2 := e.player(2)
	p2.AI = "hard"
	other := e.spawn("IR.rifle", 2, Vec{X: 48500, Y: 48500}, true, 0)
	otherGoal := Vec{X: 52500, Y: 48500}
	p2.AIKnowledge = []AIObservation{{ID: 900, Owner: 1, Type: "US.rifle", Position: otherGoal, Seen: e.Tick()}}
	p2.AIFields = []FieldView{{ID: 77, Position: Vec{X: 55000, Y: 48000}, Remaining: 1000000}}
	e.state.Map.Tiles[48*e.state.Map.Width+49].Terrain = "cover"
	e.updateFog()
	var second *Engine
	got, ok := e.aiCoverPositionWithGeometry(p2, other, otherGoal, &second)
	want, good := e.aiGroundPerfCoverReference(p2, other, otherGoal)
	if !ok || got != want || good != ok || second == nil || second == first || reflect.DeepEqual(first.state.Fields, second.state.Fields) {
		t.Fatal("separate player geometry/known fields were shared", got, want, ok, good)
	}
}

func TestAIQualityGroundPerfRecoveryPriorityEquivalent(t *testing.T) {
	for _, condition := range []string{"low_health", "deployed_retreat", "working_guard", "orphan_guard", "channel", "boarding", "queued", "disabled", "easy"} {
		t.Run(condition, func(t *testing.T) {
			e, unit, goal := aiGroundPerfSmall(t)
			medic := e.spawn("US.medic", 1, Vec{X: 20000, Y: 22000}, true, 0)
			switch condition {
			case "low_health":
				unit.HP = unit.MaxHP / 4
			case "deployed_retreat":
				unit.HP = unit.MaxHP / 4
				unit.Type = "US.artillery"
				unit.Deployed = true
			case "working_guard":
				unit.HP = unit.MaxHP / 2
				e.assign(unit, Order{Kind: "guard", Target: medic.ID, Position: medic.Position})
			case "orphan_guard":
				e.assign(unit, Order{Kind: "guard", Target: medic.ID, Position: medic.Position})
				medic.HP = 0
			case "channel":
				unit.Channel = "capture"
			case "boarding":
				carrier := e.spawn("US.apc", 1, Vec{X: 24000, Y: 22000}, true, 0)
				e.assign(unit, Order{Kind: "board", Target: carrier.ID})
			case "queued":
				e.assign(unit, Order{Kind: "attack_move", Position: goal})
				unit.Orders = append(unit.Orders, Order{Kind: "hold", Queued: true})
			case "disabled":
				unit.DisabledUntil = e.Tick() + seconds(10)
			case "easy":
				e.player(1).AI = "easy"
			}
			e.recalculate()
			e.updateFog()
			own := aiOwnView(e, 1)
			var queued []Order
			if condition == "queued" {
				queued = cloneOrders(unit.Orders)
			}
			hash := e.Hash()
			old := e.aiGroundPerfRecoveryReference(e.player(1), own, goal)
			fresh := e.aiRecoveryOrders(e.player(1), own, goal)
			if condition == "queued" && hash != e.Hash() {
				t.Fatal("queued recovery planning changed saved state")
			}
			if condition == "queued" && !reflect.DeepEqual(queued, unit.Orders) {
				t.Fatal("queued recovery planning changed prior work", queued, unit.Orders)
			}
			if condition == "queued" {
				// The frozen primary overwrote this queue with optional cover.
				// The admitted paid queue regression covers ordinary continuation.
				wantOld := []Order{{Kind: "guard", Entities: []ID{unit.ID}, Position: Vec{X: 19500, Y: 20500}}}
				if !reflect.DeepEqual(old, wantOld) || len(fresh) != 0 {
					t.Fatal("queued optional cover contract differs", old, fresh)
				}
				return
			}
			if !reflect.DeepEqual(old, fresh) || hash != e.Hash() {
				t.Fatal("existing recovery priority or saved state changed", old, fresh)
			}
		})
	}
}

// These four test-only methods retain the sealed primary implementation. Only
// method names/calls are redirected, so complete candidate selection and
// ordinary continuation can be compared without a production test hook.
func (e *Engine) aiGroundPerfCoverReference(p *Player, unit *Entity, goal Vec) (Vec, bool) {
	if e.armor(unit) != "infantry" || e.state.Map.TileAt(unit.Position).Cover() || !e.aiThreatNear(p, unit.Position, 10000) {
		return Vec{}, false
	}
	best, score := Vec{}, int64(1<<62)
	weapon, armed := e.weapon(unit)
	if !armed {
		return Vec{}, false
	}
	known := e.aiPlacementKnowledge(p)
	for y := unit.Position.Y/1000 - 3; y <= unit.Position.Y/1000+3; y++ {
		for x := unit.Position.X/1000 - 3; x <= unit.Position.X/1000+3; x++ {
			point := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			if !e.state.Map.InBounds(point) || !e.canSee(p.ID, point) || !e.state.Map.TileAt(point).Cover() || !e.state.Map.TileAt(point).Passable() || distance(point, goal) > weapon.MaxRange+2000 || distance(point, goal) > distance(unit.Position, goal)+2000 {
				continue
			}
			// Nearby cover is optional. Do not trade a working assault for a
			// guard across a known wall or structure; use view-only swept geometry.
			if !known.navigationBridgeClear(unit, point, false) {
				continue
			}
			candidate := dist2(unit.Position, point)
			if candidate < score {
				best, score = point, candidate
			}
		}
	}
	return best, score < int64(1<<62)
}

func (e *Engine) aiGroundPerfRecoveryReference(p *Player, own []EntityView, goal Vec) []Order {
	if p.AI == "easy" {
		return nil
	}
	orders := e.aiAirRecoveryOrders(p, own)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if v.Building || v.Container != 0 || v.Channel != "" || !v.Active(e.state.Tick) || e.role(v) == "rig" || e.role(v) == "hauler" {
			continue
		}
		if e.isAircraft(v) {
			continue
		}
		if v.DeployUntil > 0 || v.PackingUntil > 0 {
			continue
		}
		if v.HP*100 < v.MaxHP*35 {
			if v.Deployed {
				orders = append(orders, Order{Kind: "pack", Entities: []ID{v.ID}})
				continue
			}
			if source := e.aiRepairAnchor(p, v, own); source != nil {
				if len(v.Orders) == 0 || v.Orders[0].Kind != "guard" || v.Orders[0].Target != source.ID {
					orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Target: source.ID, Position: source.Position})
				}
				continue
			}
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target != 0 {
			target := e.aiOwnEntity(own, v.Orders[0].Target)
			recovered := target != nil && e.repairRate(target, v) > 0 && v.HP*100 >= v.MaxHP*85
			// Mobile medics/repair teams are recovery destinations too. Leaving
			// their healed followers parked forever creates reciprocal guard
			// clusters. A lost owned destination likewise cannot remain a task;
			// critically damaged units still use the normal HQ retreat below.
			orphaned := (target == nil || !target.Active(e.Tick())) && v.HP*3 >= v.MaxHP
			if recovered || orphaned {
				kind := "stop"
				if _, armed := e.weapon(v); armed {
					kind = "attack_move"
				}
				orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}, Position: goal})
				continue
			}
		}
		if len(v.Orders) > 0 && v.Orders[0].Kind == "guard" && v.Orders[0].Target == 0 && !e.aiThreatNear(p, v.Position, 12000) {
			kind := "stop"
			if _, armed := e.weapon(v); armed {
				kind = "attack_move"
			}
			orders = append(orders, Order{Kind: kind, Entities: []ID{v.ID}, Position: goal})
			continue
		}
		if weapon, ok := e.weapon(v); ok && weapon.Kind != "tactical" && (len(v.Orders) == 0 || v.Orders[0].Kind == "attack_move") {
			if point, ok := e.aiGroundPerfCoverReference(p, v, goal); ok {
				orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Position: point})
			}
		}
	}
	return orders
}

func (e *Engine) aiGroundPerfUpdateReference() {
	for _, p := range e.state.Players {
		if p.AI == "" || p.Defeated {
			continue
		}
		period := seconds(2)
		if p.AI == "easy" {
			period = seconds(4)
		}
		if p.AI == "hard" {
			period = seconds(1)
		}
		if e.state.Tick-p.AILast < period {
			continue
		}
		p.AILast = e.state.Tick
		view, _ := e.PlayerView(p.ID)
		// Retire known hostile targets before observation drops defeated owners.
		// Cancellation is an ordinary command and wins the per-actor priority.
		orders := e.aiRetireDefeatedTargets(p, view)
		e.aiObserve(p, view)
		budget := p.Credits
		own := []EntityView{}
		counts := map[string]int32{}
		var rig *Entity
		var hq *Entity
		for _, v := range view.Entities {
			if v.Owner != p.ID {
				continue
			}
			own = append(own, v)
			unit := e.entity(v.ID)
			counts[e.role(unit)]++
			for _, job := range unit.Jobs {
				if u, ok := e.catalog.Unit(job.Type); ok {
					counts[u.Role]++
				}
			}
			if e.role(unit) == "rig" && len(unit.Orders) == 0 && unit.Channel == "" {
				rig = unit
			}
			if e.role(unit) == "hq" {
				hq = unit
			}
		}
		budget = e.aiPlanningBudget(p, own)
		planningCredits := budget
		needSupplyScout := true
		for _, field := range p.AIFields {
			if field.Remaining > 0 {
				needSupplyScout = false
				break
			}
		}
		replacementProducer := ID(0)
		if counts["hq"] > 0 && counts["supply"] > 0 && counts["power"] > 0 && e.aiPowerMargin(p, own) >= 35 {
			if replacement, ok := e.aiReplacementHauler(p, own, &budget); ok {
				orders = append(orders, replacement)
				replacementProducer = replacement.Entities[0]
				counts["hauler"]++
			}
		}
		serviceMargin := e.aiServiceMargin(own)
		plannedSupply := p.Supply + p.ReservedSupply
		for _, v := range own {
			for _, job := range e.entity(v.ID).Jobs {
				if !job.Started && !job.Research {
					u, _ := e.catalog.Unit(job.Type)
					plannedSupply += u.Supply
				}
			}
		}
		// A moving builder or an existing rig job already provides recovery.
		// Conversely, a paid HQ foundation cannot produce its own replacement.
		if !e.has(p.ID, "hq") && counts["rig"] == 0 {
			for _, v := range own {
				if e.role(e.entity(v.ID)) == "factory" && len(v.Private.Jobs) == 0 {
					order := Order{Kind: "train", Entities: []ID{v.ID}, Type: p.Faction + ".rig"}
					producer := e.entity(v.ID)
					job, code := e.productionJob(p, producer, order)
					if code != "ok" || !e.jobReady(p, producer, &job) {
						continue
					}
					orders = append(orders, order)
					budget = max(int64(0), budget-1200000)
					break
				}
			}
		}
		buildType := ""
		expansion, expand := e.aiExpansion(p, own)
		var buildCenter Vec
		if hq != nil {
			buildCenter = hq.Position
		} else if rig != nil {
			buildCenter = rig.Position
		}
		if rig != nil {
			// Resume paid foundations after losing their original builder.
			for _, v := range own {
				foundation := e.entity(v.ID)
				if !foundation.Building || foundation.Complete {
					continue
				}
				builder := e.aiOwnEntity(own, foundation.Builder)
				working := builder != nil && builder.HP > 0 && len(builder.Orders) > 0 && builder.Orders[0].Target == foundation.ID
				if !working {
					orders = append(orders, Order{Kind: "resume", Entities: []ID{rig.ID}, Target: foundation.ID})
					rig = nil
					break
				}
			}
		}
		if rig != nil {
			switch {
			case counts["hq"] == 0:
				buildType = "hq"
			case e.aiPowerMargin(p, own) < 35:
				buildType = "power"
			case counts["power"] == 0:
				buildType = "power"
			case counts["supply"] == 0:
				buildType = "supply"
				for _, field := range p.AIFields {
					if field.Remaining > 0 && distance(field.Position, buildCenter) < 14000 {
						buildCenter = field.Position
						break
					}
				}
			case counts["barracks"] == 0:
				buildType = "barracks"
			case needSupplyScout && counts["recon"] == 0:
				// Sight must precede optional infrastructure when no supplies
				// are known. Otherwise the last credits can strand both haulers
				// and prevent buying the ordinary scout that would find income.
			case counts["factory"] == 0:
				buildType = "factory"
			case expand:
				buildCenter = expansion
				buildType = "supply"
				if !e.aiInBuildRadius(p, "supply", expansion) {
					buildType = "outpost"
				}
			case counts["radar"] == 0:
				buildType = "radar"
			case counts["airfield"]+counts["drone_hub"]+counts["workshop_air"] == 0 && p.Supply >= 18 || serviceMargin < 0:
				buildType = content.AirProducer(p.Faction)
			case counts["tech"] == 0 && p.Supply >= 28:
				buildType = "tech"
			case counts["depot"] == 0 && p.Credits > 1600000:
				buildType = "depot"
			case counts["abm"] == 0 && p.Tier >= 2 && p.Credits > 2200000:
				buildType = "abm"
			case counts["strategic"] == 0 && p.Tier == 3 && p.Credits > 5500000:
				buildType = "strategic"
			case p.Faction == "SY" && p.Tier >= 2 && counts["safehouse"] < 2 && p.Credits > 1600000:
				buildType = "SY.safehouse"
				if counts["safehouse"] > 0 {
					for _, v := range own {
						if v.Type == "outpost" && distance(v.Position, p.AIGoal) < distance(buildCenter, p.AIGoal) {
							buildCenter = v.Position
						}
					}
				}
			}
			if buildType != "" {
				b, _ := e.buildingRule(buildType)
				// Save toward legal future purchases, including when the current
				// bank is short. An impossible cap/prerequisite goal must not
				// consume the budget available to ordinary production.
				planning := *p
				planning.Credits = max(planning.Credits, b.Cost)
				if _, code := e.buildingCatalogRequirements(&planning, rig, buildType); code == "ok" {
					if pos, ok := e.aiConstructionPosition(p, buildType, buildCenter); ok {
						if budget >= b.Cost {
							orders = append(orders, Order{Kind: "build", Entities: []ID{rig.ID}, Type: buildType, Position: pos})
						}
						// Save toward an affordable, visible construction goal instead
						// of spending each arriving shipment on another infantry squad.
						budget = max(int64(0), budget-b.Cost)
					} else if expand && budget >= b.Cost && distance(rig.Position, expansion) > 5000 {
						orders = append(orders, Order{Kind: "move", Entities: []ID{rig.ID}, Position: expansion})
					}
				}
			}
		}
		earlyUsed := map[ID]bool{}
		for _, order := range orders {
			for _, id := range order.Entities {
				earlyUsed[id] = true
			}
		}
		// The sole builder restores construction. Save its ordinary HQ cost
		// before a charged operation or optional purchases claim those credits.
		if counts["rig"] == 0 {
			for _, v := range own {
				producer := e.entity(v.ID)
				if e.role(producer) != "hq" || !producer.Active(e.Tick()) || len(producer.Jobs) != 0 || earlyUsed[producer.ID] {
					continue
				}
				order := Order{Kind: "train", Entities: []ID{producer.ID}, Type: p.Faction + ".rig"}
				job, code := e.productionJob(p, producer, order)
				if code != "ok" || !e.jobReady(p, producer, &job) {
					continue
				}
				cost, supply, _, code := e.productionAllocation(p, &job)
				if code != "ok" && code != "insufficient_credits" || plannedSupply+supply > 100 {
					continue
				}
				if budget >= cost {
					orders = append(orders, order)
					earlyUsed[producer.ID] = true
					counts["rig"]++
					plannedSupply += supply
					p.AIStage++
				}
				budget = max(int64(0), budget-cost)
				break
			}
		}
		// A legal charged operation gets the remaining construction/recovery
		// budget before routine research and army production can consume it.
		for _, v := range own {
			site := e.entity(v.ID)
			if e.role(site) != "strategic" || !site.Active(e.Tick()) {
				continue
			}
			if order, ok := e.aiStrategicOrder(p, view, own, site, p.AIGoal, earlyUsed, max(int32(0), 100-plannedSupply)); ok {
				cost, _, supply := e.aiOrderReservation(p, &order)
				if budget >= cost && plannedSupply+supply <= 100 {
					orders = append(orders, order)
					budget -= cost
					plannedSupply += supply
				}
			}
			break
		}
		if !needSupplyScout {
			orders = append(orders, e.aiResearchOrders(p, own, &budget)...)
		}
		enemyAir, enemyArmor := false, false
		enemyAirCount := int32(0)
		for _, v := range p.AIKnowledge {
			if !aiActiveOpponent(p, view, v.Owner) || e.Tick()-v.Seen > seconds(30) {
				continue
			}
			u, ok := e.catalog.Unit(v.Type)
			if ok && u.Weapon != "" {
				if u.Armor == "air" {
					enemyAir = true
					enemyAirCount++
				}
				if u.Armor == "heavy" {
					enemyArmor = true
				}
			}
		}
		committedAirSupply := e.aiCommittedAirSupply(own)
		plannedAirSlots := map[string]int32{}
		knownAirThreat := e.aiKnownAirThreat(p)
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building && unit.Active(e.state.Tick) && len(unit.Jobs) == 0 && unit.ID != replacementProducer {
				role := e.role(unit)
				typ := ""
				switch role {
				case "supply":
					if (!needSupplyScout || counts["hauler"] == 0) && counts["hauler"] < min(int32(6), max(int32(2), counts["supply"]*2)) {
						typ = p.Faction + ".hauler"
					}
				case "hq":
					if counts["rig"] < 1 {
						typ = p.Faction + ".rig"
					}
				case "barracks":
					choose := []string{"rifle", "at", "rifle", "recon", "medic"}[p.AIStage%5]
					if choose == "medic" && counts["medic"] >= 2 || choose == "recon" && counts["recon"] >= 2 {
						choose = "rifle"
					}
					// Counters supplement the infantry screen; an unarmed hauler
					// or old sighting must not erase scouting and rifle production.
					if enemyArmor && p.AIStage%2 == 0 && counts["at"] < max(int32(1), (counts["rifle"]+counts["elite"]+1)/2) {
						choose = "at"
					}
					if choose == "at" && counts["at"] > 0 && counts["at"] >= counts["rifle"]+counts["elite"] {
						choose = "rifle"
					}
					if counts["recon"] == 0 {
						choose = "recon"
					} else if counts["engineer"] == 0 {
						choose = "engineer"
					}
					typ = p.Faction + "." + choose
				case "factory":
					if needSupplyScout && counts["recon"] == 0 {
						break
					}
					choose := []string{"car", "tank", "aa", "apc", "tank", "repair"}[p.AIStage%6]
					// Keep a small ordinary AA reserve, and scale a bounded
					// supplement to recent armed air evidence instead of replacing
					// every factory purchase with the same damage layer.
					aaLimit := max(int32(1), min(int32(4), enemyAirCount))
					if enemyAir && counts["aa"] < aaLimit {
						choose = "aa"
					}
					if choose == "aa" && counts["aa"] >= aaLimit {
						choose = "tank"
					}
					if p.Tier >= 2 && p.AIStage%7 == 6 {
						choose = "artillery"
					}
					if choose == "repair" && counts["repair"] >= 2 {
						choose = "tank"
					}
					if counts["repair"] == 0 && p.Supply >= 24 && (!enemyAir || counts["aa"] > 0) {
						choose = "repair"
					}
					if p.Tier >= 3 && p.AIStage%9 == 8 && counts["launcher"] < 2 {
						choose = "launcher"
					}
					if p.Faction == "SA" && p.Tier >= 2 && counts["mobile_abm"] == 0 && p.Supply >= 35 {
						choose = "mobile_abm"
					}
					typ = p.Faction + "." + choose
				case "airfield", "drone_hub", "workshop_air":
					if needSupplyScout && counts["recon"] == 0 || e.aiRapidSortieUseful(p, unit, own) {
						break
					}
					choose := "strike"
					if p.Faction == "SY" {
						choose = "scout_drone"
					} else if p.Faction == "IR" && counts["isr"] == 0 {
						choose = "isr"
					} else if p.AIStage%3 == 0 && (knownAirThreat || counts["fighter"] == 0) {
						choose = "fighter"
					} else if p.AIStage%3 == 2 {
						choose = "gunship"
					}
					typ = p.Faction + "." + choose
					air, valid := e.catalog.Unit(typ)
					if !valid || committedAirSupply+air.Supply > 28 || (choose == "strike" || choose == "gunship") && (e.aiAirDanger(p, p.AIGoal) || e.aiAirRouteDanger(p, unit.Position, p.AIGoal)) {
						typ = ""
					}
				}
				if typ != "" {
					u, valid := e.catalog.Unit(typ)
					if valid && u.Tier <= p.Tier && (u.Armor != "air" || e.aiAirProductionMargin(own, u.Producer)-plannedAirSlots[u.Producer] > 0) && budget >= u.Cost+300000 && plannedSupply+u.Supply <= 100 {
						orders = append(orders, Order{Kind: "train", Entities: []ID{unit.ID}, Type: typ})
						budget -= u.Cost
						plannedSupply += u.Supply
						if u.Armor == "air" {
							plannedAirSlots[u.Producer]++
							committedAirSupply += u.Supply
						}
						counts[u.Role]++
						p.AIStage++
					}
				}
			}
		}
		goal, haveGoal := e.aiGoal(p, view)
		p.AIGoal = goal
		orders = append(orders, e.aiGroundPerfRecoveryReference(p, own, goal)...)
		orders = append(orders, e.aiTransportOrders(p, own, goal)...)
		orders = append(orders, e.aiEscortOrders(p, own)...)
		orders = append(orders, e.aiSpecialOrdersWithBudget(p, view, own, goal, budget)...)
		if needSupplyScout && counts["recon"] == 0 {
			if scout, ok := e.aiSupplyScoutOrder(p, own, orders, period); ok {
				orders = append(orders, scout)
			}
		}
		var scoutTerrain *aiScoutTerrain
		for _, v := range own {
			unit := e.entity(v.ID)
			if unit.Building || unit.Container != 0 {
				continue
			}
			role := e.role(unit)
			u, _ := e.catalog.Unit(v.Type)
			if role == "hauler" && (len(unit.Orders) == 0 || !needSupplyScout && unit.Blocked && len(unit.Orders) == 1 && unit.Orders[0].Kind == "move" && e.Tick()-unit.StationarySince >= seconds(12)) {
				orders = append(orders, Order{Kind: "gather", Entities: []ID{v.ID}})
			}
			if unit.Channel != "" || unit.DeployUntil > 0 || unit.PackingUntil > 0 {
				continue
			}
			if recovery, ok := e.aiStalledRallyOrder(unit, own, goal); ok {
				orders = append(orders, recovery)
				continue
			}
			if e.isAircraft(unit) && (!e.aiAirReady(unit, own) || len(unit.Orders) > 0 && unit.Orders[0].Kind == "return") {
				continue
			}
			if role == "fighter" {
				if len(unit.Orders) > 0 && unit.Orders[0].Kind == "attack" && !e.aiFighterAttackVisible(p, view, unit.Orders[0].Target) {
					kind := "return"
					if unit.Landed {
						kind = "stop"
					}
					orders = append(orders, Order{Kind: kind, Entities: []ID{unit.ID}})
				} else if len(unit.Orders) == 0 {
					if target, ok := e.aiFighterTarget(p, view, unit); ok {
						orders = append(orders, Order{Kind: "attack", Entities: []ID{unit.ID}, Target: target.ID})
					} else if !unit.Landed {
						orders = append(orders, Order{Kind: "return", Entities: []ID{unit.ID}})
					}
				}
				continue
			}
			if role == "recon" || role == "isr" || role == "scout_drone" {
				failed := len(unit.Orders) == 1 && unit.Orders[0].Kind == "move" && unit.Blocked && e.Tick()-unit.StationarySince >= seconds(12)
				if (len(unit.Orders) == 0 || failed) && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
					if !e.isAircraft(unit) && scoutTerrain == nil {
						scoutTerrain = e.aiScoutTerrainKnowledge(p)
					}
					avoid := Vec{}
					if failed {
						avoid = unit.Orders[0].Position
					}
					if scout, ok := e.aiScoutWaypoint(p, unit.Position, avoid, failed, e.isAircraft(unit), scoutTerrain); ok {
						orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: scout})
					}
				}
				continue
			}
			if u.Weapon == "" {
				continue
			}
			if !e.isAircraft(unit) && !unit.Active(e.Tick()) {
				continue
			}
			if e.isAircraft(unit) && (e.aiAirDanger(p, goal) || e.aiAirRouteDanger(p, unit.Position, goal)) {
				continue
			}
			if unit.Deployed {
				continue
			}
			if unit.HP*3 < unit.MaxHP && hq != nil && p.AI != "easy" {
				if len(unit.Orders) > 0 && unit.Orders[0].Kind == "guard" {
					if source := e.aiOwnEntity(own, unit.Orders[0].Target); source != nil && source.Active(e.Tick()) && source.Channel == "" && e.repairRate(source, unit) > 0 {
						continue
					}
				}
				if len(unit.Orders) == 0 || unit.Orders[0].Kind != "move" {
					orders = append(orders, Order{Kind: "move", Entities: []ID{unit.ID}, Position: hq.Position})
				}
				continue
			}
			// A fresh observed defense goal can preempt a single AI assault
			// waypoint. Preserve queued work and units currently dealing damage;
			// ordinary movement still enforces its shared route-work budget.
			if !e.isAircraft(unit) && p.AIIntent == "defend" && len(unit.Orders) == 1 && unit.Orders[0].Kind == "attack_move" && distance(unit.Orders[0].Position, goal) > 4000 && (!unit.EverDealt || e.Tick()-unit.LastDealt >= seconds(3)) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
				continue
			}
			if haveGoal && (p.Supply >= 12 || p.AIIntent == "defend") && len(unit.Orders) == 0 && (!e.isAircraft(unit) || unit.ServiceWork == 0) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{unit.ID}, Position: goal})
			}
		}

		e.aiDispatchOrders(p, e.aiChooseOrders(p, own, orders, planningCredits))
	}
}

// Rebuild the first lost collector before optional spending can consume a
// trickle of station income. All knowledge and producer state are our own;
// the shared production checks and normal train order retain real costs/limits.
func (e *Engine) aiGroundPerfAdvanceReference() {
	if e.state.Outcome.Finished {
		return
	}
	if e.state.Telemetry == nil || len(e.state.Telemetry.Players) > 0 && len(e.state.Telemetry.Players[0].Timeline) == 0 {
		e.sampleTelemetry(true)
	}
	e.state.Tick++
	e.state.Events = nil
	e.state.Results = nil
	e.damages = nil
	e.pathBudget = 12
	if e.state.Countdown > 0 {
		e.state.Countdown--
		return
	}
	e.recalculate()
	e.updateFog()
	e.executePending()
	e.aiGroundPerfUpdateReference()
	e.recalculate()
	e.updateEconomy()
	e.updateMovement()
	e.updateFog()
	e.updateAircraft()
	e.updateCombat()
	e.updateProjectiles()
	e.resolveDamage()
	e.updateSupport()
	e.updateSpecial()
	e.cleanup()
	e.recalculate()
	e.updateFog()
	e.updateMission()
	e.pruneServiceParking()
	e.updateVictory()
	e.sampleTelemetry(false)
}

// The retained cover body plus a test-local constructor counter. No engine
// fields, globals or persistent cache are introduced by this oracle receipt.
func (e *Engine) aiGroundPerfCoverCountedReference(p *Player, unit *Entity, goal Vec, contexts *int) (Vec, bool) {
	if e.armor(unit) != "infantry" || e.state.Map.TileAt(unit.Position).Cover() || !e.aiThreatNear(p, unit.Position, 10000) {
		return Vec{}, false
	}
	best, score := Vec{}, int64(1<<62)
	weapon, armed := e.weapon(unit)
	if !armed {
		return Vec{}, false
	}
	(*contexts)++
	known := e.aiPlacementKnowledge(p)
	for y := unit.Position.Y/1000 - 3; y <= unit.Position.Y/1000+3; y++ {
		for x := unit.Position.X/1000 - 3; x <= unit.Position.X/1000+3; x++ {
			point := Vec{X: x*1000 + 500, Y: y*1000 + 500}
			if !e.state.Map.InBounds(point) || !e.canSee(p.ID, point) || !e.state.Map.TileAt(point).Cover() || !e.state.Map.TileAt(point).Passable() || distance(point, goal) > weapon.MaxRange+2000 || distance(point, goal) > distance(unit.Position, goal)+2000 {
				continue
			}
			// Nearby cover is optional. Do not trade a working assault for a
			// guard across a known wall or structure; use view-only swept geometry.
			if !known.navigationBridgeClear(unit, point, false) {
				continue
			}
			candidate := dist2(unit.Position, point)
			if candidate < score {
				best, score = point, candidate
			}
		}
	}
	return best, score < int64(1<<62)
}
