package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// These are synthetic backend lifecycle seams, not normal production or an
// ordinary bot-match proof. New retains the canonical countdown and opening
// bank; observers are source-spawned for isolation. Anonymous sensors and HP=0
// death seams are explicitly authored state. Every cast/interruption thereafter
// uses public Submit, actual execution receipts, and normal placement payment.
// The original six paid-production leaves are independent and remain untouched.
type beaconCapEdgeReviewCourse struct {
	t         *testing.T
	e         *Engine
	twin      *Engine
	observers []ID
	credits   int64
	spent     int64
	income    int64
}

func newBeaconCapEdgeReviewCourse(t *testing.T) *beaconCapEdgeReviewCourse {
	t.Helper()
	m := fixtureMap()
	m.ID = "backend-synthetic-beacon-cap-edges"
	m.Title = "Synthetic beacon lifecycle seams"
	e, err := New(content.MustBase(), Config{Map: m, Seed: 28643, Players: []PlayerConfig{
		{ID: 1, Name: "Synthetic observer owner", Faction: "IR", Team: 1, Controller: "human"},
		{ID: 2, Name: "Remote human control", Faction: "US", Team: 2, Controller: "human"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	c := &beaconCapEdgeReviewCourse{t: t, e: e}
	c.advance(100)
	for _, point := range []Vec{{X: 24500, Y: 24500}, {X: 20500, Y: 24500}, {X: 24500, Y: 20500}, {X: 20500, Y: 20500}} {
		// Synthetic setup only: no paid Train or production claim.
		observer := e.spawn("IR.recon", 1, point, true, 0)
		c.observers = append(c.observers, observer.ID)
	}
	c.advance(1)
	p := e.player(1)
	c.credits, c.spent, c.income = p.Credits, p.Spent, p.Income
	if e.state.Countdown != 0 || c.credits != 6000000 || c.spent != 0 || c.income != 0 {
		t.Fatal("synthetic seam must retain canonical countdown and unspent opening bank")
	}
	t.Logf("synthetic observers=%v; public paid casts begin at tick=%d", c.observers, e.Tick())
	return c
}

func (c *beaconCapEdgeReviewCourse) advance(n Tick) {
	c.t.Helper()
	for i := Tick(0); i < n; i++ {
		c.e.Advance()
		if c.e.Outcome().Finished {
			c.t.Fatal("synthetic seam unexpectedly ended", c.e.Outcome())
		}
		if c.twin != nil {
			c.twin.Advance()
			if c.e.Hash() != c.twin.Hash() {
				c.t.Fatalf("saved synthetic seam diverged at tick=%d", c.e.Tick())
			}
		}
	}
}

func (c *beaconCapEdgeReviewCourse) cast(index int) Order {
	c.t.Helper()
	view, ok := c.e.PlayerView(1)
	if !ok {
		c.t.Fatal("owned view missing")
	}
	for _, actor := range view.Entities {
		if actor.Owner == 1 && actor.ID == c.observers[index] {
			return Order{Kind: "ability", Type: "beacon", Entities: []ID{actor.ID}, Position: Vec{X: actor.Position.X + 800, Y: actor.Position.Y}}
		}
	}
	c.t.Fatal("owned synthetic observer missing")
	return Order{}
}

func (c *beaconCapEdgeReviewCourse) issue(orders ...Order) []OrderResult {
	c.t.Helper()
	sequence := c.e.player(1).LastSequence + 1
	if err := c.e.Submit(1, sequence, orders); err != nil {
		c.t.Fatal("public Submit", err)
	}
	if c.twin != nil {
		if err := c.twin.Submit(1, sequence, orders); err != nil {
			c.t.Fatal("same public Submit on saved seam", err)
		}
	}
	c.advance(1)
	view, ok := c.e.PlayerView(1)
	if !ok || len(view.Results) != len(orders) {
		c.t.Fatal("public receipt count", view.Results)
	}
	for i, receipt := range view.Results {
		if receipt.Player != 1 || receipt.Sequence != sequence || receipt.Index != int32(i) || receipt.Tick != c.e.Tick() {
			c.t.Fatal("public receipt identity", view.Results)
		}
	}
	c.t.Logf("normal paid receipts tick=%d: %+v", c.e.Tick(), view.Results)
	return view.Results
}

func (c *beaconCapEdgeReviewCourse) expect(receipt OrderResult, code string) {
	c.t.Helper()
	if receipt.Code != code || receipt.Accepted != (code == "ok") {
		c.t.Fatalf("receipt=%+v, want code=%s", receipt, code)
	}
}

func (c *beaconCapEdgeReviewCourse) fees(accepted int64) {
	c.t.Helper()
	p := c.e.player(1)
	if p.Credits != c.credits-accepted*200000 || p.Spent != c.spent+accepted*200000 || p.Income != c.income {
		c.t.Fatalf("accepted placement fees/no refund: accepted=%d credits=%d spent=%d income=%d", accepted, p.Credits, p.Spent, p.Income)
	}
}

func (c *beaconCapEdgeReviewCourse) sensors() []*Entity {
	var result []*Entity
	for _, actor := range c.e.state.Entities {
		// Own diagnostic identity only; never an enemy selector or AI input.
		if actor.Owner == 1 && actor.Type == "IR.beacon" && actor.HP > 0 {
			result = append(result, actor)
		}
	}
	return result
}

func (c *beaconCapEdgeReviewCourse) sensor(observer ID) *Entity {
	c.t.Helper()
	var found *Entity
	for _, actor := range c.sensors() {
		if actor.Builder == observer {
			if found != nil {
				c.t.Fatal("more than one materialized sensor for observer", observer)
			}
			found = actor
		}
	}
	if found == nil {
		c.t.Fatal("materialized sensor missing for observer", observer)
	}
	return found
}

func (c *beaconCapEdgeReviewCourse) anonymous(index int) *Entity {
	// Synthetic authored sensor, not a cast, purchase, or mission-runtime proof.
	v := c.e.spawn("IR.beacon", 1, Vec{X: 30000 + int32(index)*2000, Y: 30000}, true, 0)
	if v.Builder != 0 || v.TemporaryUntil != 0 {
		c.t.Fatal("authored sensor should have no observer or expiry")
	}
	return v
}

func (c *beaconCapEdgeReviewCourse) savedTwin() {
	c.t.Helper()
	data, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	c.twin, err = Restore(c.e.catalog, data)
	if err != nil || c.e.Hash() != c.twin.Hash() {
		c.t.Fatal("saved synthetic seam changed state", err)
	}
}

func TestBeaconCapEdgeReview(t *testing.T) {
	t.Run("DeadPendingCasterReleasesOnlyItsClaim", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		for _, receipt := range c.issue(c.cast(0), c.cast(1), c.cast(2)) {
			c.expect(receipt, "ok")
		}
		// Synthetic death between phases, before canonical cleanup. A living
		// sensor does not exist yet; only this pending component should vanish.
		c.e.entity(c.observers[0]).HP = 0
		c.expect(c.issue(c.cast(3))[0], "ok")
		if c.e.entity(c.observers[0]) != nil {
			t.Fatal("dead pending caster was not retired")
		}
		c.savedTwin()
		c.advance(80)
		if len(c.sensors()) != 3 {
			t.Fatal("surviving paid channels should create three sensors")
		}
		for _, sensor := range c.sensors() {
			if sensor.Builder == c.observers[0] {
				t.Fatal("dead pending caster materialized a sensor")
			}
		}
		c.fees(4)
	})
	t.Run("LivingSensorRetainsSlotAfterCasterDeath", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		c.expect(c.issue(c.cast(0))[0], "ok")
		c.advance(80)
		old := c.sensor(c.observers[0])
		oldID, oldExpiry := old.ID, old.TemporaryUntil
		// Synthetic death, while the ordinarily paid completed sensor is alive.
		c.e.entity(c.observers[0]).HP = 0
		receipts := c.issue(c.cast(1), c.cast(2), c.cast(3))
		c.expect(receipts[0], "ok")
		c.expect(receipts[1], "ok")
		c.expect(receipts[2], "beacon_limit")
		if c.e.entity(c.observers[0]) != nil {
			t.Fatal("synthetic caster death should reach ordinary cleanup")
		}
		c.savedTwin()
		c.advance(80)
		old = c.e.entity(oldID)
		if old == nil || old.HP != 100000 || old.TemporaryUntil != oldExpiry || len(c.sensors()) != 3 {
			t.Fatal("caster death must not retire sensor or release its living slot")
		}
		c.fees(3)
	})
	t.Run("PaidAdmissionOnExactExpiryTickBeforeCleanup", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		c.expect(c.issue(c.cast(0))[0], "ok")
		c.advance(80)
		old := c.sensor(c.observers[0])
		oldID, expiry := old.ID, old.TemporaryUntil
		if expiry != old.Created+900 {
			t.Fatal("normal paid sensor lifetime changed")
		}
		c.anonymous(0)
		c.anonymous(1)
		c.advance(expiry - c.e.Tick() - 2)
		c.savedTwin()
		c.expect(c.issue(c.cast(3))[0], "beacon_limit")
		if c.e.Tick() != expiry-1 || c.e.entity(oldID) == nil || c.e.entity(oldID).HP != 100000 {
			t.Fatal("control requires living predecessor one tick before expiry")
		}
		c.fees(1)
		// Submit schedules the next tick. The predecessor is alive now; orders
		// execute on its exact expiry tick before cleanup retires it that tick.
		c.expect(c.issue(c.cast(3))[0], "ok")
		if c.e.Tick() != expiry || c.e.entity(oldID) != nil || c.e.entity(c.observers[3]).ChannelUntil != expiry+80 {
			t.Fatal("expiry admission/cleanup/channel boundary differs")
		}
		c.advance(80)
		if len(c.sensors()) != 3 {
			t.Fatal("two authored sensors plus one normally paid successor expected")
		}
		c.fees(2)
	})
	t.Run("ExistingAndPendingReplacementDoNotConsumeTwoSlots", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		for _, receipt := range c.issue(c.cast(0), c.cast(1)) {
			c.expect(receipt, "ok")
		}
		c.advance(80)
		oldID := c.sensor(c.observers[0]).ID
		replacement := c.cast(0)
		replacement.Position = Vec{X: 24500, Y: 25300}
		receipts := c.issue(replacement, c.cast(2), c.cast(3))
		c.expect(receipts[0], "ok")
		c.expect(receipts[1], "ok")
		c.expect(receipts[2], "beacon_limit")
		c.savedTwin()
		c.advance(79)
		if c.e.entity(oldID) == nil || len(c.sensors()) != 2 {
			t.Fatal("old sensor should survive the pending replacement")
		}
		c.advance(1)
		if c.e.entity(oldID) != nil || len(c.sensors()) != 3 || c.sensor(c.observers[0]).Position != replacement.Position {
			t.Fatal("replacement and the third observer should materialize once")
		}
		c.fees(4)
	})
	t.Run("AnonymousAuthoredSensorsOccupyDistinctSlots", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		first := c.anonymous(0)
		c.anonymous(1)
		c.anonymous(2)
		c.expect(c.issue(c.cast(0))[0], "beacon_limit")
		c.fees(0)
		// Synthetic sensor death before cleanup releases that sensor's slot.
		first.HP = 0
		c.expect(c.issue(c.cast(0))[0], "ok")
		c.savedTwin()
		c.advance(80)
		if len(c.sensors()) != 3 || c.sensor(c.observers[0]).Paid != 200000 {
			t.Fatal("two anonymous sensors plus one paid observer sensor expected")
		}
		c.fees(1)
	})
	t.Run("ChangedOccupancyCompletionKeepsPredecessorAndFee", func(t *testing.T) {
		c := newBeaconCapEdgeReviewCourse(t)
		c.expect(c.issue(c.cast(0))[0], "ok")
		c.advance(80)
		old := c.sensor(c.observers[0])
		oldID, oldPosition, oldExpiry := old.ID, old.Position, old.TemporaryUntil
		replacement := c.cast(0)
		replacement.Position = Vec{X: 24500, Y: 25300}
		c.expect(c.issue(replacement)[0], "ok")
		completion := c.e.entity(c.observers[0]).ChannelUntil
		// Authored additions deliberately overclaim the owner's state AFTER
		// paid admission. This is not normal production or a cap-invariant claim.
		c.anonymous(0)
		c.anonymous(1)
		c.anonymous(2)
		c.advance(1)
		c.savedTwin()
		c.advance(completion - c.e.Tick())
		old = c.e.entity(oldID)
		observer := c.e.entity(c.observers[0])
		if old == nil || old.HP != 100000 || old.Position != oldPosition || old.TemporaryUntil != oldExpiry {
			t.Fatal("invalid completion killed or changed the predecessor")
		}
		if len(c.sensors()) != 4 || c.sensor(c.observers[0]).ID != oldID || observer.Channel != "" || observer.ChannelUntil != 0 || observer.State != "idle" {
			t.Fatal("invalid completion must add no sensor and must clear the accepted channel")
		}
		c.fees(2)
	})
	t.Run("CurrentChannelInterruptionRespectsBatchOrder", func(t *testing.T) {
		for _, interruptFirst := range []bool{true, false} {
			name := "CastBeforeMove"
			if interruptFirst {
				name = "MoveBeforeCast"
			}
			t.Run(name, func(t *testing.T) {
				c := newBeaconCapEdgeReviewCourse(t)
				for _, receipt := range c.issue(c.cast(0), c.cast(1), c.cast(2)) {
					c.expect(receipt, "ok")
				}
				move := Order{Kind: "move", Entities: []ID{c.observers[0]}, Position: Vec{X: 25500, Y: 24500}}
				newCast := c.cast(3)
				orders := []Order{newCast, move}
				if interruptFirst {
					orders = []Order{move, newCast}
				}
				receipts := c.issue(orders...)
				accepted := int64(3)
				if interruptFirst {
					c.expect(receipts[0], "ok")
					c.expect(receipts[1], "ok")
					accepted++
				} else {
					c.expect(receipts[0], "beacon_limit")
					c.expect(receipts[1], "ok")
				}
				if c.e.entity(c.observers[0]).Channel != "" {
					t.Fatal("ordinary Move did not clear current channel")
				}
				c.fees(accepted)
				c.advance(80)
				want := 2
				if interruptFirst {
					want = 3
				}
				if len(c.sensors()) != want {
					t.Fatal("materialization did not follow actual ordered channel state")
				}
				for _, sensor := range c.sensors() {
					if sensor.Builder == c.observers[0] {
						t.Fatal("interrupted caster materialized a sensor")
					}
				}
				c.fees(accepted)
			})
		}
	})
}
