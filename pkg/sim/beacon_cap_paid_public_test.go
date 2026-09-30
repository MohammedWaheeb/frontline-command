package sim_test

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

const beaconCapFee int64 = 200000

// This original-compatible course uses only normal public commands to create
// its actors and cast. Save contents are read for accounting assertions, never
// modified or used to select an enemy, manufacture an actor, or advance work.
type beaconCapCourse struct {
	t         *testing.T
	e         *sim.Engine
	catalog   *content.Catalog
	replay    *sim.Replay
	twin      *sim.Engine
	observers []sim.ID
}

func newBeaconCapCourse(t *testing.T) *beaconCapCourse {
	t.Helper()
	m := content.Map{
		ID: "backend-paid-beacon-cap", Title: "Paid beacon cap backend geometry",
		Author: "automated backend fixture", Version: "1", FormatVersion: 1,
		Ruleset: "standard-v2", Width: 64, Height: 64,
		Spawns: []content.Spawn{{Position: sim.Vec{X: 8000, Y: 8000}}, {Position: sim.Vec{X: 56000, Y: 56000}}},
		Shipment: sim.Vec{X: 32000, Y: 32000},
		Fields: []content.Field{
			{ID: 1, Position: sim.Vec{X: 14000, Y: 8000}, Credits: 36000000},
			{ID: 2, Position: sim.Vec{X: 49000, Y: 56000}, Credits: 36000000},
		},
	}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	if err := m.Validate(); err != nil {
		t.Fatal("normal match map validation", err)
	}
	catalog := content.MustBase()
	e, err := sim.New(catalog, sim.Config{Map: m, Seed: 27445, Players: []sim.PlayerConfig{
		{ID: 1, Name: "Paid observers", Faction: "IR", Team: 1, Controller: "human"},
		{ID: 2, Name: "Remote opponent", Faction: "US", Team: 2, Controller: "human"},
	}})
	if err != nil {
		t.Fatal("normal match", err)
	}
	replay, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal("initial replay", err)
	}
	c := &beaconCapCourse{t: t, e: e, catalog: catalog, replay: replay}
	if c.view().Countdown != 100 || c.view().Economy.Credits != 6000000 {
		t.Fatal("canonical opening changed")
	}
	c.advance(100)
	rig := c.only("IR.rig").ID
	c.build(rig, "power", sim.Vec{X: 12000, Y: 12000})
	c.build(rig, "barracks", sim.Vec{X: 14500, Y: 16000})
	c.move(rig, sim.Vec{X: 17500, Y: 11500})
	barracks := c.only("barracks").ID
	// V1's four normally paid actors crowded one shared rally before their
	// first departure. Produce and publicly move one observer out before the
	// next Train. The same four work points are visited farthest first so later
	// departures do not cross a parked predecessor; no actor is repositioned.
	points := []sim.Vec{{X: 24500, Y: 24500}, {X: 20500, Y: 24500}, {X: 24500, Y: 20500}, {X: 20500, Y: 20500}}
	known := map[sim.ID]bool{}
	for i, point := range points {
		c.mustOK(c.issue(sim.Order{Kind: "rally", Entities: []sim.ID{barracks}, Position: point}))
		c.mustOK(c.issue(sim.Order{Kind: "train", Type: "IR.recon", Entities: []sim.ID{barracks}}))
		c.wait(350, "next normally paid observer", func() bool {
			producer := c.entity(barracks)
			return len(c.owned("IR.recon")) == i+1 && producer.Private != nil && len(producer.Private.Jobs) == 0
		})
		newcomer := sim.ID(0)
		for _, observer := range c.owned("IR.recon") {
			if !known[observer.ID] {
				if newcomer != 0 { t.Fatal("more than one public paid newcomer") }
				newcomer = observer.ID
			}
		}
		if newcomer == 0 { t.Fatal("normal paid production did not yield a public newcomer") }
		known[newcomer] = true
		c.observers = append(c.observers, newcomer)
		c.move(newcomer, point)
	}
	if len(c.owned("IR.beacon")) != 0 || c.view().Economy.Credits != 3500000 || c.view().Economy.Income != 0 {
		t.Fatalf("paid fixture ledger/empty beacon precondition: %+v", c.view().Economy)
	}
	s := c.snapshot()
	if c.player(s).Spent != 2500000 || c.player(s).Credits != 6000000-c.player(s).Spent {
		t.Fatal("fixture must pay 500k power + 600k barracks + four 350k observers")
	}
	paidObservers := 0
	for _, actor := range s.Entities {
		if actor.Owner == 1 && actor.Type == "IR.recon" {
			if actor.Paid != 350000 || actor.Created == 0 || !actor.Complete || actor.HP != 180000 {
				t.Fatalf("observer is not a normal paid completed unit: %+v", actor)
			}
			paidObservers++
		}
	}
	if paidObservers != 4 {
		t.Fatal("expected four distinct paid real observers")
	}
	t.Logf("normal public paid fixture tick=%d observers=%v credits=%d spent=%d income=%d; canonical 100-tick countdown and 6M opening retained", e.Tick(), c.observers, c.player(s).Credits, c.player(s).Spent, c.player(s).Income)
	return c
}

func (c *beaconCapCourse) view() sim.View {
	c.t.Helper()
	v, ok := c.e.PlayerView(1)
	if !ok {
		c.t.Fatal("missing owned public view")
	}
	return v
}

func (c *beaconCapCourse) owned(typ string) []sim.EntityView {
	result := []sim.EntityView{}
	for _, actor := range c.view().Entities {
		if actor.Owner == 1 && actor.Type == typ {
			result = append(result, actor)
		}
	}
	return result
}

func (c *beaconCapCourse) only(typ string) sim.EntityView {
	c.t.Helper()
	actors := c.owned(typ)
	if len(actors) != 1 {
		c.t.Fatalf("need exactly one owned public %s, got %d", typ, len(actors))
	}
	return actors[0]
}

func (c *beaconCapCourse) entity(id sim.ID) sim.EntityView {
	c.t.Helper()
	for _, actor := range c.view().Entities {
		if actor.ID == id && actor.Owner == 1 {
			return actor
		}
	}
	c.t.Fatalf("owned public actor %d missing", id)
	return sim.EntityView{}
}

func (c *beaconCapCourse) advance(n sim.Tick) {
	c.t.Helper()
	for i := sim.Tick(0); i < n; i++ {
		c.e.Advance()
		if c.e.Outcome().Finished {
			c.t.Fatal("normal paid course unexpectedly finished", c.e.Outcome())
		}
		if c.twin != nil {
			c.twin.Advance()
			if i%20 == 0 || i+1 == n {
				if c.e.Hash() != c.twin.Hash() {
					c.t.Fatalf("mid-channel restore diverged at tick %d", c.e.Tick())
				}
			}
		}
		if c.e.Tick()%100 == 0 {
			if err := c.replay.Capture(c.e, false); err != nil {
				c.t.Fatal("ordinary replay capture", err)
			}
		}
	}
}

func (c *beaconCapCourse) wait(limit sim.Tick, label string, ready func() bool) {
	c.t.Helper()
	for i := sim.Tick(0); i < limit; i++ {
		if ready() {
			return
		}
		c.advance(1)
	}
	if !ready() {
		c.logOwnedObservers("public course deadline")
		c.t.Fatalf("ordinary public course did not reach %s within %d ticks at %d: %+v", label, limit, c.e.Tick(), c.view().Entities)
	}
}

func (c *beaconCapCourse) issue(orders ...sim.Order) []sim.OrderResult {
	c.t.Helper()
	sequence := c.view().Economy.LastSequence + 1
	if err := c.e.Submit(1, sequence, orders); err != nil {
		c.t.Fatal("ordinary public Submit", err)
	}
	if c.twin != nil {
		if err := c.twin.Submit(1, sequence, orders); err != nil {
			c.t.Fatal("same ordinary Submit on saved twin", err)
		}
	}
	c.advance(1)
	results := c.view().Results
	if len(results) != len(orders) {
		c.t.Fatalf("ordinary public receipt count: got %+v for %+v", results, orders)
	}
	for i, receipt := range results {
		if receipt.Player != 1 || receipt.Sequence != sequence || receipt.Index != int32(i) || receipt.Tick != c.e.Tick() {
			c.t.Fatalf("ordinary receipt identity: %+v", results)
		}
	}
	return results
}

func (c *beaconCapCourse) mustOK(receipts []sim.OrderResult) {
	c.t.Helper()
	for _, receipt := range receipts {
		if !receipt.Accepted || receipt.Code != "ok" {
			c.t.Fatalf("required ordinary paid setup/control order rejected: %+v", receipts)
		}
	}
}

func (c *beaconCapCourse) build(rig sim.ID, typ string, point sim.Vec) {
	c.t.Helper()
	c.mustOK(c.issue(sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: typ, Position: point}))
	c.wait(900, "paid "+typ+" completion", func() bool {
		actors := c.owned(typ)
		return len(actors) == 1 && actors[0].Complete
	})
}

func (c *beaconCapCourse) move(id sim.ID, point sim.Vec) {
	c.t.Helper()
	c.logOwnedObservers("before paid departure")
	c.mustOK(c.issue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point}))
	c.logOwnedObservers("after accepted public Move")
	c.wait(400, "public Move physical arrival", func() bool {
		actor := c.entity(id)
		dx, dy := int64(actor.Position.X-point.X), int64(actor.Position.Y-point.Y)
		return dx*dx+dy*dy <= 250*250 && actor.Private != nil && len(actor.Private.Orders) == 0
	})
}

// Preserve actual owned public Orders instead of printing Private pointers.
func (c *beaconCapCourse) logOwnedObservers(label string) {
	c.t.Helper()
	data, err := json.Marshal(c.owned("IR.recon"))
	if err != nil { c.t.Fatal("owned public observer JSON", err) }
	c.t.Logf("%s tick=%d owned-public-observers=%s", label, c.e.Tick(), data)
}

func (c *beaconCapCourse) cast(index int) sim.Order {
	actor := c.entity(c.observers[index])
	return sim.Order{Kind: "ability", Type: "beacon", Entities: []sim.ID{actor.ID}, Position: sim.Vec{X: actor.Position.X + 800, Y: actor.Position.Y}}
}

func (c *beaconCapCourse) snapshot() sim.State {
	c.t.Helper()
	save, err := c.e.Save()
	if err != nil {
		c.t.Fatal("read-only ordinary save", err)
	}
	var envelope struct { State json.RawMessage `json:"state"` }
	var s sim.State
	if err := json.Unmarshal(save, &envelope); err != nil {
		c.t.Fatal(err)
	}
	if err := json.Unmarshal(envelope.State, &s); err != nil {
		c.t.Fatal(err)
	}
	return s
}

func (c *beaconCapCourse) player(s sim.State) *sim.Player {
	c.t.Helper()
	for _, p := range s.Players {
		if p.ID == 1 {
			return p
		}
	}
	c.t.Fatal("saved paid owner missing")
	return nil
}

func (c *beaconCapCourse) assertPaid(before *sim.Player, accepted int) {
	c.t.Helper()
	after := c.player(c.snapshot())
	want := int64(accepted) * beaconCapFee
	if before.Credits-after.Credits != want || after.Spent-before.Spent != want || after.Income != before.Income {
		c.t.Errorf("accepted cast fees only, no refund/extra payment: before=%+v after=%+v want=%d", before, after, want)
	}
	c.t.Logf("actual fee ledger tick=%d accepted=%d creditsDelta=%d spentDelta=%d incomeDelta=%d", c.e.Tick(), accepted, before.Credits-after.Credits, after.Spent-before.Spent, after.Income-before.Income)
}

func (c *beaconCapCourse) assertCount(want int) {
	c.t.Helper()
	beacons := c.owned("IR.beacon")
	c.t.Logf("actual materialized owned beacon count tick=%d count=%d entities=%+v", c.e.Tick(), len(beacons), beacons)
	if len(beacons) != want {
		c.t.Errorf("one per observer and maximum three: got %d beacons, want %d", len(beacons), want)
	}
	seen := map[sim.ID]bool{}
	for _, actor := range c.snapshot().Entities {
		if actor.Type == "IR.beacon" && actor.Owner == 1 {
			if seen[actor.Builder] || actor.Builder == 0 || actor.Paid != beaconCapFee || actor.HP != 100000 || actor.TemporaryUntil != actor.Created+900 {
				c.t.Errorf("normal beacon identity/cost/health/lifetime violated: %+v", actor)
			}
			seen[actor.Builder] = true
		}
	}
}

func (c *beaconCapCourse) attachSavedTwin() {
	c.t.Helper()
	save, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	c.twin, err = sim.Restore(c.catalog, save)
	if err != nil || c.twin.Hash() != c.e.Hash() {
		c.t.Fatal("ordinary mid-channel Save/Restore", err)
	}
	c.t.Logf("ordinary mid-channel save restored identically at tick=%d hash=%s", c.e.Tick(), c.e.Hash())
}

func (c *beaconCapCourse) proveFullReplay() {
	c.t.Helper()
	if err := c.replay.Capture(c.e, false); err != nil {
		c.t.Fatal(err)
	}
	full := *c.replay
	full.Checkpoints = nil
	player, err := full.Open(c.catalog, c.e.Tick())
	if err != nil || player.Engine().Hash() != c.e.Hash() {
		c.t.Fatal("full normal initial replay differs", err)
	}
	save, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	restored, err := sim.Restore(c.catalog, save)
	if err != nil || restored.Hash() != c.e.Hash() {
		c.t.Fatal("completed beacon Save/Restore differs", err)
	}
	c.t.Logf("full normal initial replay and final save agree tick=%d hash=%s", c.e.Tick(), c.e.Hash())
}

func TestBeaconCapPaidPublic(t *testing.T) {
	t.Run("FourSimultaneousFreshObservers", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		receipts := c.issue(c.cast(0), c.cast(1), c.cast(2), c.cast(3))
		t.Logf("four distinct public simultaneous paid cast receipts: %+v", receipts)
		accepted := 0
		for i, receipt := range receipts {
			if receipt.Accepted { accepted++ }
			if i < 3 && (!receipt.Accepted || receipt.Code != "ok") {
				t.Errorf("first three simultaneous reservations must be accepted: %+v", receipt)
			}
		}
		if receipts[3].Accepted || receipts[3].Code != "beacon_limit" {
			t.Errorf("fourth simultaneous new observer must reject before payment: %+v", receipts[3])
		}
		c.assertPaid(before, accepted)
		if c.view().Economy.Credits != before.Credits-3*beaconCapFee {
			t.Error("three-slot rejection must spend exactly three accepted placement fees")
		}
		c.attachSavedTwin()
		c.advance(79)
		c.assertCount(0)
		c.advance(1)
		c.assertCount(3)
		c.assertPaid(before, accepted)
		c.proveFullReplay()
	})
	t.Run("ExistingThreeSlotsAndOwnReplacement", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		c.mustOK(c.issue(c.cast(0), c.cast(1), c.cast(2)))
		c.advance(80)
		c.assertCount(3)
		old := c.owned("IR.beacon")
		rejected := c.issue(c.cast(3))
		if rejected[0].Accepted || rejected[0].Code != "beacon_limit" {
			t.Errorf("completed full slots must reject fourth observer: %+v", rejected)
		}
		c.assertPaid(before, 3)
		replacement := c.cast(0)
		replacement.Position = sim.Vec{X: c.entity(c.observers[0]).Position.X, Y: c.entity(c.observers[0]).Position.Y + 800}
		c.mustOK(c.issue(replacement))
		c.assertPaid(before, 4)
		c.advance(79)
		c.assertCount(3)
		for i, actor := range c.owned("IR.beacon") {
			if actor.ID != old[i].ID { t.Error("replacement destroyed old beacon before four-second completion") }
		}
		c.advance(1)
		c.assertCount(3)
		for _, actor := range c.owned("IR.beacon") {
			if actor.ID == old[0].ID { t.Error("replacement kept same observer's old beacon") }
		}
		c.assertPaid(before, 4)
		c.proveFullReplay()
	})
	t.Run("PendingRecastCountsObserverOnce", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		c.mustOK(c.issue(c.cast(0), c.cast(1), c.cast(2)))
		firstStart := c.e.Tick()
		c.advance(20)
		c.mustOK(c.issue(c.cast(0)))
		recastStart := c.e.Tick()
		receipt := c.issue(c.cast(3))[0]
		if receipt.Accepted || receipt.Code != "beacon_limit" {
			t.Errorf("three pending distinct observers occupy three slots after own recast: %+v", receipt)
		}
		accepted := 4
		if receipt.Accepted { accepted++ }
		c.assertPaid(before, accepted)
		c.advance(firstStart + 80 - c.e.Tick())
		c.assertCount(2)
		c.advance(recastStart + 79 - c.e.Tick())
		c.assertCount(2)
		c.advance(1)
		c.assertCount(3)
		c.advance(2)
		c.assertCount(3)
		c.assertPaid(before, accepted)
		c.proveFullReplay()
	})
	t.Run("OrdinaryMoveInterruptsWithoutRefundAndReleasesSlot", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		c.mustOK(c.issue(c.cast(0), c.cast(1), c.cast(2)))
		c.advance(20)
		actor := c.entity(c.observers[1])
		c.mustOK(c.issue(sim.Order{Kind: "move", Entities: []sim.ID{actor.ID}, Position: sim.Vec{X: actor.Position.X, Y: actor.Position.Y + 1000}}))
		if c.entity(actor.ID).ChannelUntil != 0 {
			t.Fatal("ordinary Move did not interrupt pending beacon")
		}
		c.assertPaid(before, 3)
		c.mustOK(c.issue(c.cast(3)))
		c.attachSavedTwin()
		c.advance(80)
		c.assertCount(3)
		for _, beacon := range c.snapshot().Entities {
			if beacon.Type == "IR.beacon" && beacon.Owner == 1 && beacon.Builder == actor.ID {
				t.Error("interrupted observer materialized a beacon")
			}
		}
		c.assertPaid(before, 4)
		c.proveFullReplay()
	})
	t.Run("ReplacementHasFreshFortyFiveSecondLifetime", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		c.mustOK(c.issue(c.cast(0)))
		c.advance(80)
		old := c.only("IR.beacon").ID
		c.advance(100)
		replacement := c.cast(0)
		replacement.Position = sim.Vec{X: c.entity(c.observers[0]).Position.X, Y: c.entity(c.observers[0]).Position.Y + 800}
		c.mustOK(c.issue(replacement))
		c.advance(80)
		c.assertCount(1)
		if c.only("IR.beacon").ID == old { t.Fatal("ordinary replacement retained predecessor") }
		c.attachSavedTwin()
		c.advance(899)
		c.assertCount(1)
		c.advance(1)
		c.assertCount(0)
		c.assertPaid(before, 2)
		c.mustOK(c.issue(c.cast(3)))
		c.advance(80)
		c.assertCount(1)
		c.assertPaid(before, 3)
		c.proveFullReplay()
	})
	t.Run("PendingThreeSaveCheckpointAndFullInitialReplay", func(t *testing.T) {
		c := newBeaconCapCourse(t)
		before := c.player(c.snapshot())
		c.mustOK(c.issue(c.cast(0), c.cast(1), c.cast(2)))
		c.advance(40)
		midTick, midHash := c.e.Tick(), c.e.Hash()
		if err := c.replay.Capture(c.e, true); err != nil { t.Fatal("pending beacon replay checkpoint", err) }
		c.attachSavedTwin()
		c.advance(39)
		c.assertCount(0)
		c.advance(1)
		c.assertCount(3)
		c.assertPaid(before, 3)
		if err := c.replay.Capture(c.e, false); err != nil { t.Fatal(err) }
		mid, err := c.replay.Open(c.catalog, midTick)
		if err != nil || mid.Engine().Hash() != midHash { t.Fatal("pending checkpoint hash", err) }
		for !mid.Finished() {
			if err := mid.Advance(); err != nil { t.Fatal("pending checkpoint continuation", err) }
		}
		if mid.Engine().Hash() != c.e.Hash() { t.Fatal("pending checkpoint continuation final hash") }
		c.proveFullReplay()
	})
}
