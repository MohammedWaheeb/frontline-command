package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

// Prepared world geometry isolates sealed-depot reachability. This is not a
// paid construction/balance claim; public paid hauling/combat is tested apart.
func playerHaulerPrepared(t *testing.T) (*Engine, *Entity, *Entity, *Entity, *Entity) {
	t.Helper()
	m := fixtureMap()
	m.ID = "player-hauler-reachability"
	m.Spawns[1].Position = Vec{X: 8000, Y: 56000}
	m.Fields = []content.Field{{ID: 1, Position: Vec{X: 30000, Y: 29000}, Credits: 36000000}, {ID: 2, Position: Vec{X: 14000, Y: 56000}, Credits: 36000000}}
	m.Shipment = Vec{X: 24000, Y: 32000}
	m.Stations[0].Position = Vec{X: 24000, Y: 24000}
	for y := int32(0); y < m.Height; y++ {
		m.Tiles[y*m.Width+32] = content.Tile{Terrain: "cliff"}
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 731035, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Name: "Owner", Faction: "US", Team: 1}, {ID: 2, Name: "Hostile", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal("prepared map must pass canonical constructor", err)
	}
	e.state.Countdown = 0
	e.spawn("power", 1, Vec{X: 18000, Y: 20000}, true, 0)
	near := e.spawn("supply", 1, Vec{X: 37000, Y: 29000}, true, 0)
	far := e.spawn("supply", 1, Vec{X: 24000, Y: 44000}, true, 0)
	near.IncludedHauler, far.IncludedHauler = true, true
	v := e.spawn("US.hauler", 1, m.Fields[0].Position, true, 900000)
	v.Cargo = 240000
	enemy := e.spawn("IR.rifle", 2, Vec{X: 27500, Y: 29000}, true, 300000)
	e.recalculate()
	e.updateFog()
	if !e.clear(v.Position, e.radius(v), v.ID, false, true) || dist2(v.Position, near.Position) >= dist2(v.Position, far.Position) {
		t.Fatal("prepared near/far geometry is not legal or ordered")
	}
	return e, v, near, far, enemy
}

func TestPlayerHaulerReachableReturnPreparedGeometry(t *testing.T) {
	e, v, near, far, enemy := playerHaulerPrepared(t)
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	issue(t, e, 1, Order{Kind: "gather_depot", Entities: []ID{v.ID}, Target: near.ID})
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Position: Vec{X: 26000, Y: 29000}, Queued: true})
	issue(t, e, 1, Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 1})
	for i := 0; i < 80 && !v.HaulerRetreating; i++ {
		e.Advance()
	}
	if !v.HaulerRetreating || v.Depot != far.ID || v.PinnedDepot != near.ID || v.PinnedField != 1 || v.Cargo < 240000 || len(v.Orders) != 2 {
		t.Fatal("retreat selected sealed closest depot or lost chosen work/cargo", v.Depot, near.ID, far.ID, v)
	}
	f := e.field(1)
	if f.Loader == v.ID {
		t.Fatal("retreat retained the loader")
	}
	for _, id := range f.Queue {
		if id == v.ID {
			t.Fatal("retreat retained waiting reservation")
		}
	}
	feedback, _ := e.PlayerFeedback(1)
	alerts := 0
	for _, event := range feedback.Events {
		if event.Kind == "hauler_retreat" && event.Entity == v.ID && event.Scope == "owner" && event.Value == int64(far.ID) {
			alerts++
		}
	}
	if alerts != 1 {
		t.Fatal("owner must receive exactly one retreat alert")
	}
	// A real move removes the prepared attacker from range; cargo return remains
	// physical and uses the same unload timer as ordinary gathering.
	issue(t, e, 2, Order{Kind: "move", Entities: []ID{enemy.ID}, Position: Vec{X: 12000, Y: 29000}})
	cargo, income := v.Cargo, e.player(1).Income
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("retreat save not restorable", err)
	}
	unloadStarted := Tick(0)
	delivered := false
	for range 1600 {
		before := v.Position
		e.Advance()
		restored.Advance()
		if distance(before, v.Position) > 151 {
			t.Fatal("physical retreat exceeded normal movement")
		}
		if v.State == "unloading" && unloadStarted == 0 {
			unloadStarted = e.Tick()
			if e.edgeDistance(v, far) > 1200 {
				t.Fatal("unload began outside actual depot contact")
			}
		}
		for _, event := range e.state.Events {
			if event.Kind == "cargo_delivered" && event.Entity == v.ID {
				if unloadStarted == 0 || event.Tick-unloadStarted != seconds(3) {
					t.Fatal("retreat payment skipped the fresh three-second unload")
				}
				delivered = true
			}
			if event.Kind == "hauler_retreat" && event.Entity == v.ID {
				t.Fatal("repeated damage produced repeated retreat alerts")
			}
		}
		if delivered {
			break
		}
	}
	if !delivered || e.player(1).Income != income+cargo || v.HaulerRetreating || v.Cargo != 0 || v.PinnedDepot != near.ID || v.PinnedField != 1 || len(v.Orders) != 2 {
		t.Fatal("return did not pay once and resume chosen task/accepted queue", delivered, v)
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("reachable return continuation drift")
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("reachable return replay drift", err)
	}
}

func TestPlayerHaulerSettingsValidationAndManualOverride(t *testing.T) {
	e, v, near, _, _ := playerHaulerPrepared(t)
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	issue(t, e, 1, Order{Kind: "gather_depot", Entities: []ID{v.ID}, Target: near.ID})
	var rig ID
	for _, actor := range e.state.Entities {
		if actor.Owner == 1 && e.role(actor) == "rig" {
			rig = actor.ID
		}
	}
	orders := []Order{
		{Kind: "gather_depot", Entities: []ID{v.ID}, Target: e.state.Entities[2].ID},
		{Kind: "gather_depot", Entities: []ID{v.ID}, Target: 999999},
		{Kind: "gather_depot", Entities: []ID{v.ID}, Target: near.ID, Queued: true},
		{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 2},
		{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 1, Queued: true},
		{Kind: "gather", Entities: []ID{v.ID}, Target: 2}, // Never observed.
	}
	hash := e.Hash()
	results, err := e.PreviewCandidates(1, orders)
	if err != nil || e.Hash() != hash || len(results) != len(orders) {
		t.Fatal("independent settings preview failed/mutated source", err)
	}
	for i, result := range results {
		if result.Accepted {
			t.Fatal("illegal preference accepted by preview", i, result)
		}
	}
	for _, order := range orders {
		if err := e.Submit(1, e.player(1).LastSequence+1, []Order{order}); err != nil {
			t.Fatal("legal intention shape should receive execution rejection", err)
		}
		e.Advance()
		if len(e.state.Results) != 1 || e.state.Results[0].Accepted || v.PinnedDepot != near.ID || v.RetreatWhenAttacked {
			t.Fatal("executor/preview disagreed or invalid mixed selection partially applied", e.state.Results)
		}
	}
	// The user-approved mixed-selection contract supersedes the old all-role
	// rejection: apply to the hauler and retain every unsupported rig field.
	mixed := Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID, rig}, Index: 1}
	rigBefore, err := json.Marshal(e.entity(rig))
	if err != nil { t.Fatal(err) }
	hash = e.Hash()
	mixedPreview, err := e.PreviewCandidates(1, []Order{mixed})
	if err != nil || len(mixedPreview) != 1 || !mixedPreview[0].Accepted || mixedPreview[0].Code != "ok" || !reflect.DeepEqual(mixedPreview[0].EligibleEntities, []ID{v.ID}) || mixedPreview[0].AppliedCount != 0 || e.Hash() != hash {
		t.Fatal("mixed preference preview changed source or recipients", mixedPreview, err)
	}
	code, eligible, applied := e.executeWithSelection(1, mixed)
	rigAfter, err := json.Marshal(e.entity(rig))
	if err != nil || code != "ok" || !reflect.DeepEqual(eligible, []ID{v.ID}) || applied != 1 || !v.RetreatWhenAttacked || !reflect.DeepEqual(rigBefore, rigAfter) {
		t.Fatal("mixed preference failed or changed unsupported rig", code, eligible, applied, err)
	}
	issue(t, e, 1, Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 0})
	issue(t, e, 1, Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 1})
	e.retreatHauler(v) // Isolated override test; actual hostile trigger is tested separately.
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Queued: true, Position: Vec{X: 24000, Y: 29000}})
	if !v.HaulerRetreating || len(v.Orders) != 2 {
		t.Fatal("queued manual work interrupted active safety return")
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Position: Vec{X: 26000, Y: 29000}})
	if v.HaulerRetreating || v.Cargo == 0 || len(v.Orders) != 1 || v.Orders[0].Kind != "move" {
		t.Fatal("immediate manual override did not keep cargo/change chosen task")
	}
}

func TestPlayerHaulerInactiveDepotPinRetainedAndFreshUnload(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 1)
	v := e.entity(ids[0])
	var chosen *Entity
	for _, actor := range e.state.Entities {
		if actor.Owner == 1 && e.role(actor) == "supply" {
			chosen = actor
		}
	}
	alternate := e.spawn("supply", 1, Vec{X: 45000, Y: 40000}, true, 0)
	alternate.IncludedHauler = true
	v.Cargo = 600000 // Prepared cargo; power orders and delivery remain canonical.
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	issue(t, e, 1, Order{Kind: "gather_depot", Entities: []ID{v.ID}, Target: chosen.ID})
	for i := 0; i < 400 && v.State != "unloading"; i++ {
		e.Advance()
	}
	if v.State != "unloading" {
		t.Fatal("prepared physical return never began unloading")
	}
	income := e.player(1).Income
	issue(t, e, 1, Order{Kind: "power", Entities: []ID{chosen.ID}, Index: 0})
	if v.PinnedDepot != chosen.ID || v.Depot != alternate.ID || v.TaskUntil != 0 || v.Cargo != 600000 || e.player(1).Income != income {
		t.Fatal("temporary inactivity lost chosen pin or reused unloading timer", v)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal("temporarily inactive chosen pin was not restorable", err)
	}
	order := Order{Kind: "power", Entities: []ID{chosen.ID}, Index: 1}
	if err = restored.Submit(1, e.player(1).LastSequence+1, []Order{order}); err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, order)
	restored.Advance()
	if v.Depot != chosen.ID || v.PinnedDepot != chosen.ID {
		t.Fatal("reactivated chosen depot did not regain priority")
	}
	started, delivered := Tick(0), false
	for range 400 {
		if v.State == "unloading" && started == 0 {
			started = e.Tick()
		}
		e.Advance()
		restored.Advance()
		for _, event := range e.state.Events {
			if event.Entity == v.ID && event.Kind == "cargo_delivered" {
				if started == 0 || event.Tick-started != seconds(3) {
					t.Fatal("reactivated pin did not start a fresh unload timer")
				}
				delivered = true
			}
		}
		if delivered {
			break
		}
	}
	if !delivered || e.player(1).Income != income+600000 || e.Hash() != restored.Hash() {
		t.Fatal("inactive pin recovery payment/continuation failed")
	}
}

func TestPlayerHaulerManualTaskPrecedenceAndPreferenceOff(t *testing.T) {
	for _, kind := range []string{"hold", "stop", "move"} {
		t.Run(kind, func(t *testing.T) {
			e, v, _, _, _ := playerHaulerPrepared(t)
			issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
			issue(t, e, 1, Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 1})
			waitForReturn := func() {
				t.Helper()
				for i := 0; i < 80 && !v.HaulerRetreating; i++ {
					e.Advance()
				}
				if !v.HaulerRetreating {
					t.Fatal("real hostile fire did not trigger active Gather preference")
				}
			}
			waitForReturn()
			cargo := v.Cargo
			issue(t, e, 1, Order{Kind: kind, Entities: []ID{v.ID}, Position: Vec{X: 30500, Y: 29000}})
			if v.HaulerRetreating || !v.RetreatWhenAttacked || v.Cargo != cargo {
				t.Fatal("manual task did not override the return while retaining preference/cargo")
			}
			beforeHP := v.HP
			for i := 0; i < 80 && v.HP == beforeHP; i++ {
				e.Advance()
			}
			if v.HP >= beforeHP || v.HaulerRetreating {
				t.Fatal("subsequent real damage resumed safety automation over manual task")
			}
			issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{v.ID}, Queued: true, Position: Vec{X: 26000, Y: 29000}})
			waitForReturn()
			cargo, income := v.Cargo, e.player(1).Income
			issue(t, e, 1, Order{Kind: "retreat_when_attacked", Entities: []ID{v.ID}, Index: 0})
			if v.HaulerRetreating || v.RetreatWhenAttacked || v.Cargo < cargo || e.player(1).Income != income || len(v.Orders) != 2 || v.Orders[0].Kind != "gather" || v.Orders[1].Kind != "move" {
				t.Fatal("preference-off did not reactivate chosen Gather/cargo/accepted queue", v)
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, save)
			if err != nil || restored.Hash() != e.Hash() {
				t.Fatal("manual override/preference-off state was not restorable", err)
			}
			for range 80 {
				e.Advance()
				restored.Advance()
				if v.HaulerRetreating {
					t.Fatal("disabled preference restarted on later hostile damage")
				}
			}
			if restored.Hash() != e.Hash() {
				t.Fatal("manual precedence continuation drift")
			}
		})
	}
}

func TestPlayerHaulerKnownStockFogAndOwnerReservationPrivacy(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 3)
	loader, first, second := e.entity(ids[0]), e.entity(ids[1]), e.entity(ids[2])
	for _, v := range []*Entity{loader, first, second} {
		e.assign(v, Order{Kind: "gather", Target: 1})
		v.Depot = e.chooseDepot(v).ID
	}
	f := e.field(1)
	f.Loader, f.Queue = loader.ID, []ID{first.ID, second.ID}
	loader.State = "loading"
	enemyDepot := e.spawn("supply", 2, Vec{X: 46000, Y: 42000}, true, 0)
	enemyDepot.IncludedHauler = true
	enemy := e.spawn("IR.hauler", 2, Vec{X: 38000, Y: 32500}, true, 0)
	e.assign(enemy, Order{Kind: "gather", Target: 1})
	enemy.Depot = enemyDepot.ID
	f.Queue = []ID{enemy.ID, first.ID, second.ID}
	e.updateFog()
	view, _ := e.PlayerView(1)
	for _, v := range view.Entities {
		if v.ID == loader.ID && (v.Private.HarvestQueuePosition != 1 || v.Private.HarvestQueueLength != 3) || v.ID == first.ID && (v.Private.HarvestQueuePosition != 2 || v.Private.HarvestQueueLength != 3) || v.ID == second.ID && (v.Private.HarvestQueuePosition != 3 || v.Private.HarvestQueueLength != 3) {
			t.Fatal("reservation disclosure exposed global FIFO or lost own loader", v)
		}
		if v.Owner != 1 && v.Private != nil {
			t.Fatal("opponent received endpoint/private reservation data")
		}
	}
	observation := *e.knownField(e.player(1), 1)
	// Prepared fog comparison: preserve the same permitted memory while changing
	// hidden live stock and opponent queue. Automation must choose identically.
	for _, v := range e.state.Entities {
		if v.Owner == 1 {
			v.Enabled = false
			v.HP = 0
		}
	}
	e.computeVisibility()
	if e.canSee(1, f.Position) {
		t.Fatal("prepared field is still visible")
	}
	probe := &Entity{Type: "US.hauler", Owner: 1, Position: Vec{X: 22000, Y: 22000}}
	firstChoice := e.chooseField(probe)
	f.Remaining = 0
	f.Queue = nil
	e.observeFields(e.player(1))
	secondChoice := e.chooseField(probe)
	if firstChoice == nil || secondChoice == nil || firstChoice.ID != secondChoice.ID || !reflect.DeepEqual(observation, *e.knownField(e.player(1), 1)) {
		t.Fatal("hidden depletion refreshed stock or altered automatic selection")
	}
}

func TestPlayerHaulerSaveRejectsMalformedPreferencesAndObservation(t *testing.T) {
	e, v, near, _, _ := playerHaulerPrepared(t)
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	issue(t, e, 1, Order{Kind: "gather_depot", Entities: []ID{v.ID}, Target: near.ID})
	original := e.StateCopy()
	cases := []struct {
		name   string
		mutate func(*State)
	}{
		{"unknown_pinned_depot", func(s *State) { s.Entities[len(s.Entities)-2].PinnedDepot = 999999 }},
		{"unknown_pinned_field", func(s *State) { s.Entities[len(s.Entities)-2].PinnedField = 999999 }},
		{"nonhauler_flag", func(s *State) { s.Entities[0].RetreatWhenAttacked = true }},
		{"retreat_with_preference_off", func(s *State) {
			actor := s.Entities[len(s.Entities)-2]
			actor.HaulerRetreating = true
			actor.RetreatWhenAttacked = false
		}},
		{"retreat_over_manual_task", func(s *State) {
			actor := s.Entities[len(s.Entities)-2]
			actor.HaulerRetreating = true
			actor.Orders = []Order{{Kind: "move", Position: actor.Position}}
		}},
		{"future_observation", func(s *State) { s.Players[0].KnownFields[0].Seen = s.Tick + 1 }},
		{"wrong_observation_position", func(s *State) { s.Players[0].KnownFields[0].Position.X += 500 }},
		{"unknown_observation_identity", func(s *State) { s.Players[0].KnownFields[0].ID = 999999 }},
		{"duplicate_observation", func(s *State) {
			s.Players[0].KnownFields = append(s.Players[0].KnownFields, s.Players[0].KnownFields[0])
		}},
		{"unbounded_retry", func(s *State) { s.Entities[len(s.Entities)-2].DepotRetryAt = s.Tick + seconds(2) + 1 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data, _ := json.Marshal(original)
			var state State
			json.Unmarshal(data, &state)
			tc.mutate(&state)
			candidate := &Engine{catalog: e.catalog, state: state}
			save, err := candidate.Save()
			if err != nil {
				t.Fatal(err)
			}
			if _, err = Restore(e.catalog, save); err == nil {
				t.Fatal("malformed saved preference/observation accepted")
			}
		})
	}
}
