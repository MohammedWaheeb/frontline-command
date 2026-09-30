package sim_test

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Original-only regression. Every foundation, weapon and later intention uses
// the normal public API from the standard6M HQ+rig opening. Save is read only
// for accounting and proof; no engine state or saved field is manufactured.
type foundationQueuePaidInput struct {
	Sequence uint32            `json:"sequence"`
	Orders   []sim.Order       `json:"orders"`
	Results  []sim.OrderResult `json:"results"`
}
type foundationQueuePaidRun struct {
	t                        *testing.T
	e                        *sim.Engine
	catalog                  *content.Catalog
	replay                   *sim.Replay
	twin                     *sim.Engine
	checkpoint               sim.Tick
	inputs                   []foundationQueuePaidInput
	events                   []sim.Event
	checkpointSave, lossSave []byte
	hq, rig, factory         sim.ID
}

func newFoundationQueuePaidRun(t *testing.T) *foundationQueuePaidRun {
	t.Helper()
	m := content.Map{ID: "backend-destroyed-foundation-paid-queue", Title: "Paid foundation loss and queued intentions", Author: "backend acceptance fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64,
		Spawns: []content.Spawn{{Position: sim.Vec{X: 8000, Y: 8000}}, {Position: sim.Vec{X: 56000, Y: 56000}}}, Shipment: sim.Vec{X: 32000, Y: 32000},
		Fields: []content.Field{{ID: 1, Position: sim.Vec{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: sim.Vec{X: 49000, Y: 56000}, Credits: 36000000}}}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	if err := m.Validate(); err != nil {
		t.Fatal(err)
	}
	catalog := content.MustBase()
	e, err := sim.New(catalog, sim.Config{Map: m, Seed: 39523, Players: []sim.PlayerConfig{{ID: 1, Name: "Paid builder queue", Faction: "US", Team: 1, Controller: "human"}, {ID: 2, Name: "Remote human opponent", Faction: "IR", Team: 2, Controller: "human"}}})
	if err != nil {
		t.Fatal(err)
	}
	recorder, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	c := &foundationQueuePaidRun{t: t, e: e, catalog: catalog, replay: recorder}
	t.Cleanup(c.archive)
	view := c.view()
	if view.Countdown != 100 || view.Economy.Credits != 6000000 || view.Economy.Income != 0 || c.spent() != 0 || e.Metadata().Simulation != sim.Version {
		t.Fatal("normal unchanged opening unavailable", view.Economy)
	}
	c.hq, c.rig = c.only("hq").ID, c.only("US.rig").ID
	c.advance(100)
	c.build("power", sim.Vec{X: 12000, Y: 12000})
	c.build("barracks", sim.Vec{X: 14500, Y: 16000})
	c.move(c.rig, sim.Vec{X: 19500, Y: 11500})
	c.build("supply", sim.Vec{X: 22000, Y: 8000})
	c.wait(100, "included ordinary hauler", func() bool { return len(c.owned("US.hauler")) == 1 })
	c.build("factory", sim.Vec{X: 19000, Y: 16000})
	c.factory = c.only("factory").ID
	c.move(c.rig, sim.Vec{X: 24500, Y: 12500})
	c.ok(c.issue(sim.Order{Kind: "rally", Entities: []sim.ID{c.factory}, Position: sim.Vec{X: 26500, Y: 19500}}))
	c.ledger(4700000)
	c.fund(1400000)
	c.build("radar", sim.Vec{X: 12000, Y: 21000})
	c.ledger(6100000)
	if view = c.view(); view.Economy.Tier != 2 || view.Economy.PowerCapacity != 140 || view.Economy.PowerDemand != 75 {
		t.Fatal("paid ordinary artillery prerequisites unavailable", view.Economy)
	}
	c.move(c.rig, sim.Vec{X: 35000, Y: 12500})
	c.log("paid base; healthy rig physically remote")
	return c
}
func (c *foundationQueuePaidRun) view() sim.View {
	c.t.Helper()
	view, ok := c.e.PlayerView(1)
	if !ok {
		c.t.Fatal("current owner view missing")
	}
	return view
}
func (c *foundationQueuePaidRun) owned(typ string) []sim.EntityView {
	var actors []sim.EntityView
	for _, actor := range c.view().Entities {
		if actor.Owner == 1 && actor.Type == typ && actor.Private != nil && actor.Private.HP > 0 {
			actors = append(actors, actor)
		}
	}
	return actors
}
func (c *foundationQueuePaidRun) only(typ string) sim.EntityView {
	c.t.Helper()
	actors := c.owned(typ)
	if len(actors) != 1 {
		c.t.Fatal("need one current public owned actor", typ, len(actors))
	}
	return actors[0]
}
func (c *foundationQueuePaidRun) entity(id sim.ID) sim.EntityView {
	c.t.Helper()
	for _, actor := range c.view().Entities {
		if actor.ID == id && actor.Owner == 1 && actor.Private != nil {
			return actor
		}
	}
	c.t.Fatal("current owned actor missing", id)
	return sim.EntityView{}
}
func (c *foundationQueuePaidRun) advance(n sim.Tick) {
	c.t.Helper()
	for i := sim.Tick(0); i < n; i++ {
		if c.e.Tick() >= 12000 {
			c.t.Fatal("fixed paid course horizon exhausted")
		}
		c.e.Advance()
		if feedback, ok := c.e.PlayerFeedback(1); ok {
			c.events = append(c.events, feedback.Events...)
		} else {
			c.t.Fatal("current public owner feedback missing")
		}
		if c.e.Outcome().Finished {
			c.t.Fatal("ordinary controlled match unexpectedly ended", c.e.Outcome())
		}
		if c.twin != nil {
			c.twin.Advance()
			if i%20 == 0 || i+1 == n {
				if c.twin.Hash() != c.e.Hash() || c.twin.Metadata() != c.e.Metadata() {
					c.t.Fatal("unchanged pending save continuation diverged", c.e.Tick())
				}
			}
		}
		if c.e.Tick()%200 == 0 {
			if err := c.replay.Capture(c.e, false); err != nil {
				c.t.Fatal(err)
			}
		}
	}
}
func (c *foundationQueuePaidRun) wait(limit sim.Tick, label string, ready func() bool) {
	c.t.Helper()
	for step := sim.Tick(0); step < limit && !ready(); step++ {
		c.advance(1)
	}
	if !ready() {
		c.log("fixed deadline")
		c.t.Fatal("paid setup deadline (not a stale Build product reproduction)", label, limit, c.e.Tick())
	}
}
func (c *foundationQueuePaidRun) stage(orders ...sim.Order) uint32 {
	c.t.Helper()
	sequence := c.view().Economy.LastSequence + 1
	if err := c.e.Submit(1, sequence, orders); err != nil {
		c.t.Fatal(err)
	}
	if c.twin != nil {
		if err := c.twin.Submit(1, sequence, orders); err != nil {
			c.t.Fatal(err)
		}
	}
	return sequence
}
func (c *foundationQueuePaidRun) receipts(sequence uint32, orders []sim.Order) []sim.OrderResult {
	c.t.Helper()
	results := c.view().Results
	if len(results) != len(orders) {
		c.t.Fatal("receipt count mismatch", results)
	}
	for i, result := range results {
		if result.Player != 1 || result.Sequence != sequence || result.Index != int32(i) || result.Tick != c.e.Tick() {
			c.t.Fatal("normal receipt identity mismatch", results)
		}
	}
	c.inputs = append(c.inputs, foundationQueuePaidInput{sequence, orders, append([]sim.OrderResult(nil), results...)})
	c.t.Logf("FOUNDATION_QUEUE_RECEIPTS tick=%d results=%+v", c.e.Tick(), results)
	return results
}
func (c *foundationQueuePaidRun) issue(orders ...sim.Order) []sim.OrderResult {
	sequence := c.stage(orders...)
	c.advance(1)
	return c.receipts(sequence, orders)
}
func (c *foundationQueuePaidRun) ok(results []sim.OrderResult) {
	c.t.Helper()
	for _, result := range results {
		if !result.Accepted || result.Code != "ok" {
			c.log("rejected required public control")
			c.t.Fatal("required ordinary order rejected", results)
		}
	}
}
func (c *foundationQueuePaidRun) build(typ string, point sim.Vec) {
	c.t.Helper()
	rule, ok := c.catalog.Building(typ)
	if !ok {
		c.t.Fatal("catalog building unavailable")
	}
	c.ok(c.issue(sim.Order{Kind: "build", Entities: []sim.ID{c.rig}, Type: typ, Position: point}))
	c.wait(sim.Tick(rule.BuildTicks)+400, "paid "+typ+" completion", func() bool { return len(c.owned(typ)) == 1 && c.only(typ).Complete })
	state := c.snapshot()
	for _, actor := range state.Entities {
		if actor.ID == c.only(typ).ID {
			if actor.Paid != rule.Cost || !actor.Complete || actor.Created == 0 || actor.CompletedAt <= actor.Created {
				c.t.Fatal("foundation was not built and paid ordinarily")
			}
			return
		}
	}
	c.t.Fatal("ordinary paid completed foundation missing")
}
func (c *foundationQueuePaidRun) move(id sim.ID, point sim.Vec) {
	c.ok(c.issue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point}))
	c.wait(400, "physical public Move arrival", func() bool {
		actor := c.entity(id)
		dx, dy := int64(actor.Position.X-point.X), int64(actor.Position.Y-point.Y)
		return dx*dx+dy*dy <= 250*250 && len(actor.Private.Orders) == 0
	})
}

// Read-only accounting/proof data. These bytes never select a gameplay order.
func (c *foundationQueuePaidRun) snapshot() sim.State {
	c.t.Helper()
	data, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	var envelope struct {
		State json.RawMessage `json:"state"`
	}
	if err = json.Unmarshal(data, &envelope); err != nil {
		c.t.Fatal(err)
	}
	var state sim.State
	if err = json.Unmarshal(envelope.State, &state); err != nil {
		c.t.Fatal(err)
	}
	return state
}
func (c *foundationQueuePaidRun) spent() int64 {
	c.t.Helper()
	for _, player := range c.snapshot().Players {
		if player.ID == 1 {
			return player.Spent
		}
	}
	c.t.Fatal("paid owner accounting missing from unchanged Save")
	return 0
}
func (c *foundationQueuePaidRun) ledger(spent int64) {
	c.t.Helper()
	view := c.view()
	if c.spent() != spent || view.Economy.Credits != 6000000+view.Economy.Income-spent {
		c.t.Fatal("ordinary income/purchase ledger diverged", view.Economy, spent)
	}
}
func (c *foundationQueuePaidRun) fund(credits int64) {
	c.wait(6000, "canonical included-hauler funding", func() bool { return c.view().Economy.Credits >= credits })
}
func (c *foundationQueuePaidRun) pendingCheckpoint() {
	c.t.Helper()
	if c.twin != nil {
		c.t.Fatal("proof checkpoint must be unique")
	}
	data, err := c.replay.CaptureCheckpoint(c.e)
	if err != nil {
		c.t.Fatal(err)
	}
	c.twin, err = sim.Restore(c.catalog, data)
	if err != nil || c.twin.Hash() != c.e.Hash() || c.twin.Metadata() != c.e.Metadata() {
		c.t.Fatal("unchanged pending-command save did not restore exactly", err)
	}
	c.checkpoint = c.e.Tick()
	c.checkpointSave = append([]byte(nil), data...)
	if len(c.replay.Checkpoints) != 1 || c.replay.Checkpoints[0].Tick != c.checkpoint {
		c.t.Fatal("exact pending checkpoint was not recorded")
	}
	c.log("pending saved checkpoint")
}
func (c *foundationQueuePaidRun) finish() {
	c.t.Helper()
	data, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	restored, err := sim.Restore(c.catalog, data)
	if err != nil || restored.Hash() != c.e.Hash() || restored.Metadata() != c.e.Metadata() {
		c.t.Fatal("final nonterminal ordinary Save/Restore differs", err)
	}
	if c.twin == nil || c.twin.Hash() != c.e.Hash() {
		c.t.Fatal("pending save twin was not continued to final state")
	}
	if err = c.replay.Capture(c.e, false); err != nil {
		c.t.Fatal(err)
	}
	encoded, err := c.replay.Encode()
	if err != nil {
		c.t.Fatal(err)
	}
	full, err := sim.DecodeReplay(encoded)
	if err != nil {
		c.t.Fatal(err)
	}
	full.Checkpoints = nil
	played, err := full.Open(c.catalog, c.e.Tick())
	if err != nil || played.Engine().Hash() != c.e.Hash() || played.Engine().Metadata() != c.e.Metadata() {
		c.t.Fatal("full-initial normal-order replay differs", err)
	}
	if len(c.replay.Checkpoints) != 1 || c.replay.Checkpoints[0].Tick != c.checkpoint {
		c.t.Fatal("no exact sole pending checkpoint")
	}
	fromCheckpoint, err := c.replay.Open(c.catalog, c.e.Tick())
	if err != nil || fromCheckpoint.Engine().Hash() != c.e.Hash() || fromCheckpoint.Engine().Metadata() != c.e.Metadata() {
		c.t.Fatal("actual pending-foundation/checkpoint continuation differs", err)
	}
	c.log("final saved/replayed public state")
}
func (c *foundationQueuePaidRun) log(label string) {
	data, err := json.Marshal(map[string]any{"label": label, "tick": c.e.Tick(), "hash": c.e.Hash(), "view": c.view()})
	if err != nil {
		c.t.Fatal(err)
	}
	c.t.Logf("FOUNDATION_QUEUE_PUBLIC %s", data)
}
func (c *foundationQueuePaidRun) archive() {
	directory := os.Getenv("FRONTLINE_DESTROYED_FOUNDATION_EVIDENCE")
	if directory == "" {
		return
	}
	if err := os.MkdirAll(directory, 0755); err != nil {
		c.t.Errorf("evidence directory: %v", err)
		return
	}
	prefix := filepath.Join(directory, strings.ReplaceAll(c.t.Name(), "/", "-"))
	data, err := c.e.Save()
	if err != nil {
		c.t.Errorf("evidence save: %v", err)
		return
	}
	if err = os.WriteFile(prefix+".save.json", data, 0644); err != nil {
		c.t.Errorf("evidence save: %v", err)
	}
	for name, saved := range map[string][]byte{"pending": c.checkpointSave, "loss": c.lossSave} {
		if len(saved) > 0 {
			if err = os.WriteFile(prefix+"."+name+".save.json", saved, 0644); err != nil {
				c.t.Errorf("evidence checkpoint/loss save: %v", err)
			}
		}
	}
	if err = c.replay.Capture(c.e, false); err != nil {
		c.t.Errorf("evidence capture: %v", err)
		return
	}
	encoded, err := c.replay.Encode()
	if err != nil {
		c.t.Errorf("evidence replay: %v", err)
		return
	}
	if err = os.WriteFile(prefix+".replay.json.gz", encoded, 0644); err != nil {
		c.t.Errorf("evidence replay: %v", err)
	}
	data, err = json.MarshalIndent(map[string]any{"failed": c.t.Failed(), "hash": c.e.Hash(), "metadata": c.e.Metadata(), "view": c.view(), "inputs": c.inputs, "checkpoint": c.checkpoint, "events": c.events}, "", "  ")
	if err != nil {
		c.t.Errorf("evidence ledger: %v", err)
		return
	}
	if err = os.WriteFile(prefix+".json", append(data, '\n'), 0644); err != nil {
		c.t.Errorf("evidence ledger: %v", err)
	}
}

func (c *foundationQueuePaidRun) trainHowitzer(point sim.Vec) sim.ID {
	c.t.Helper()
	rule, ok := c.catalog.Unit("US.artillery")
	if !ok || rule.Cost != 1100000 || rule.BuildTicks != 600 || rule.Tier != 2 || rule.Weapon != "ART" {
		c.t.Fatal("ordinary howitzer catalog contract changed")
	}
	c.fund(rule.Cost)
	before := c.owned(rule.ID)
	c.ok(c.issue(sim.Order{Kind: "train", Entities: []sim.ID{c.factory}, Type: rule.ID}))
	jobs := c.entity(c.factory).Private.Jobs
	if len(jobs) != 1 || !jobs[0].Started || jobs[0].Paid != rule.Cost || jobs[0].Work != 2 || jobs[0].Emergency {
		c.t.Fatal("howitzer did not start as an ordinary paid factory job", jobs)
	}
	c.wait(sim.Tick(rule.BuildTicks)+400, "paid howitzer output", func() bool { return len(c.owned(rule.ID)) == len(before)+1 })
	var newcomer sim.ID
	for _, actor := range c.owned(rule.ID) {
		known := false
		for _, old := range before {
			known = known || old.ID == actor.ID
		}
		if !known {
			if newcomer != 0 {
				c.t.Fatal("multiple unrequested howitzers appeared")
			}
			newcomer = actor.ID
		}
	}
	if newcomer == 0 {
		c.t.Fatal("public owned paid howitzer newcomer missing")
	}
	for _, actor := range c.snapshot().Entities {
		if actor.ID == newcomer && (actor.Paid != rule.Cost || actor.HP != rule.HP) {
			c.t.Fatal("howitzer output payment/health is not ordinary")
		}
	}
	c.move(newcomer, point)
	return newcomer
}
func foundationQueueWithin(a, b sim.Vec, radius int64) bool {
	dx, dy := int64(a.X-b.X), int64(a.Y-b.Y)
	return dx*dx+dy*dy <= radius*radius
}

func TestDestroyedFoundationPaidQueueRecovery(t *testing.T) {
	c := newFoundationQueuePaidRun(t)
	// One-at-a-time ordinary paid production/departure avoids a mass rally
	// setup seam. These legal open-map points are inside actual ART range.
	gunPoints := []sim.Vec{{X: 14500, Y: 20000}, {X: 17500, Y: 20500}, {X: 22000, Y: 19000}}
	var guns []sim.ID
	for _, point := range gunPoints {
		guns = append(guns, c.trainHowitzer(point))
	}
	c.ledger(9400000)
	c.fund(500000)
	rigBefore := c.entity(c.rig)
	if rigBefore.Private.HP != 600000 || rigBefore.Private.MaxHP != 600000 || len(rigBefore.Private.Orders) != 0 || !foundationQueueWithin(rigBefore.Position, sim.Vec{X: 35000, Y: 12500}, 250) {
		t.Fatal("original healthy rig did not complete its ordinary remote Move")
	}
	site := sim.Vec{X: 17000, Y: 11500}
	weapon, ok := c.catalog.Weapon("ART")
	if !ok || weapon.Kind != "shell" || weapon.Damage != 140000 || weapon.Splash != 2000 || weapon.MinRange != 4000 || weapon.MaxRange != 14000 {
		t.Fatal("normal paid shell contract unavailable")
	}
	for _, id := range guns {
		gun := c.entity(id)
		if foundationQueueWithin(gun.Position, site, int64(weapon.MinRange)+600) || !foundationQueueWithin(gun.Position, site, int64(weapon.MaxRange)+600) || gun.Private.HP != gun.Private.MaxHP {
			t.Fatal("paid gun not physically in its actual ordinary ground fire range", gun.Position)
		}
	}
	c.ok(c.issue(sim.Order{Kind: "build", Entities: []sim.ID{c.rig}, Type: "power", Position: site}))
	c.ledger(9900000)
	orders := c.entity(c.rig).Private.Orders
	if len(orders) != 1 || orders[0].Kind != "build" {
		t.Fatal("ordinary paid foundation did not establish the rig's actual Build intention")
	}
	foundationID := orders[0].Target
	foundation := c.entity(foundationID)
	if foundation.Type != "power" || foundation.Position != site || foundation.Complete || foundation.Progress != 0 || foundation.Private.HP != 150000 {
		t.Fatal("real fresh500k power foundation was not at10percent with zero construction work", foundation)
	}
	for _, actor := range c.snapshot().Entities {
		if actor.ID == foundationID && (actor.Paid != 500000 || actor.Work != 0 || actor.Complete || actor.Created == 0) {
			t.Fatal("foundation purchase/work accounting is not ordinary")
		}
	}
	movePoint, guardPoint := sim.Vec{X: 34000, Y: 17000}, sim.Vec{X: 38000, Y: 17000}
	batch := []sim.Order{{Kind: "move", Entities: []sim.ID{c.rig}, Position: movePoint, Queued: true}, {Kind: "guard", Entities: []sim.ID{c.rig}, Position: guardPoint, Queued: true}}
	for _, id := range guns {
		batch = append(batch, sim.Order{Kind: "force_fire", Entities: []sim.ID{id}, Position: site})
	}
	sequence := c.stage(batch...)
	c.pendingCheckpoint() // actual accepted pending public orders; no manufactured checkpoint
	c.advance(1)
	c.ok(c.receipts(sequence, batch))
	orders = c.entity(c.rig).Private.Orders
	if len(orders) != 3 || orders[0].Kind != "build" || orders[0].Target != foundationID || orders[1].Kind != "move" || orders[1].Position != movePoint || !orders[1].Queued || orders[2].Kind != "guard" || orders[2].Position != guardPoint || !orders[2].Queued {
		t.Fatal("normal Build/queuedMove/queuedGuard intentions not retained before real damage", orders)
	}
	c.log("real paid foundation and accepted queued intentions before ordinary shell damage")
	var lostAt sim.Tick
	for step := 0; step < 90; step++ {
		c.advance(1)
		for _, event := range c.view().Events {
			if event.Kind == "destroyed" && event.Owner == 1 && event.Entity == foundationID {
				lostAt = c.e.Tick()
			}
		}
		rig := c.entity(c.rig)
		if rig.Private.HP != rigBefore.Private.HP || foundationQueueWithin(rig.Position, site, 5000) {
			c.log("damage setup not sufficiently remote")
			t.Fatal("paid destruction setup reached/damaged rig; this is not missing-target queue evidence")
		}
		if lostAt != 0 {
			break
		}
		actor := c.entity(foundationID)
		if actor.Complete || actor.Progress != 0 {
			t.Fatal("foundation was worked/completed before damage; this is not the intended original reproduction")
		}
	}
	if lostAt == 0 {
		c.log("no real paid foundation loss")
		t.Fatal("ordinary three paid howitzers failed to destroy real foundation within90ticks; no stale Build product red")
	}
	for _, actor := range c.view().Entities {
		if actor.ID == foundationID {
			t.Fatal("ordinary destruction event did not remove the owned foundation")
		}
	}
	fired := map[sim.ID]bool{}
	impacts, actualDamage := 0, int64(0)
	for _, event := range c.events {
		if event.Owner == 1 && event.Kind == "weapon_fired" && event.Combat != nil && event.Combat.Weapon == "ART" {
			for _, id := range guns {
				if event.Entity == id {
					fired[id] = true
				}
			}
		}
		if event.Owner == 1 && event.Kind == "impact" && event.Position == site && event.Combat != nil && event.Combat.Weapon == "ART" {
			impacts++
		}
		if event.Owner == 1 && event.Kind == "under_attack" && event.Entity == foundationID {
			actualDamage += event.Value
		}
	}
	if len(fired) != 3 || impacts < 3 || actualDamage != 150000 {
		t.Fatal("public feedback does not prove three actual paid friendly shells destroyed the fresh foundation", len(fired), impacts, actualDamage)
	}
	c.log("actual paid shell destruction public feedback")
	var err error
	c.lossSave, err = c.e.Save()
	if err != nil {
		t.Fatal("actual loss Save unavailable", err)
	}
	lossRestored, err := sim.Restore(c.catalog, c.lossSave)
	if err != nil || lossRestored.Hash() != c.e.Hash() || lossRestored.Metadata() != c.e.Metadata() {
		t.Fatal("unchanged actual loss Save/Restore differs", err)
	}
	// Stop only the gunners after the actual casualty. The rig receives no
	// replacement, Stop, Resume or cancel workaround to the accepted queue.
	c.ok(c.issue(sim.Order{Kind: "stop", Entities: guns}))
	c.log("actual missing foundation; healthy original rig and untouched accepted tail")
	if orders = c.entity(c.rig).Private.Orders; len(orders) > 0 && orders[0].Kind == "build" && orders[0].Target == foundationID {
		t.Errorf("destroyed paid foundation leaves stale Build blocking accepted Move/Guard after next ordinary tick: tick=%d orders=%+v", c.e.Tick(), orders)
	}
	moveSeen, visitedMove, guardSeen := false, false, false
	var guardStart sim.Vec
	for step := 0; step < 400; step++ {
		c.advance(1)
		rig := c.entity(c.rig)
		orders = rig.Private.Orders
		if len(orders) == 2 && orders[0].Kind == "move" && orders[0].Position == movePoint && orders[1].Kind == "guard" && orders[1].Position == guardPoint {
			moveSeen = true
		}
		if foundationQueueWithin(rig.Position, movePoint, 250) {
			visitedMove = true
		}
		if len(orders) == 1 && orders[0].Kind == "guard" && orders[0].Position == guardPoint && !guardSeen {
			guardSeen, guardStart = true, rig.Position
		}
		if rig.Private.HP != rigBefore.Private.HP {
			t.Fatal("original remote healthy rig changed HP during queue course")
		}
	}
	rig := c.entity(c.rig)
	if !moveSeen || !visitedMove || !guardSeen || len(rig.Private.Orders) != 1 || rig.Private.Orders[0].Kind != "guard" || rig.Private.Orders[0].Position != guardPoint || !foundationQueueWithin(rig.Position, guardPoint, 1000) || foundationQueueWithin(rig.Position, guardStart, 1999) {
		t.Errorf("destroyed foundation did not activate both admitted later commands through real400tick physical course: loss_tick=%d move=%v visited=%v guard=%v start=%+v current=%+v orders=%+v", lostAt, moveSeen, visitedMove, guardSeen, guardStart, rig.Position, rig.Private.Orders)
	}
	c.ledger(9900000) // no loss refund, second foundation charge or hidden income
	for _, player := range c.snapshot().Players {
		if player.ID == 1 && player.Lost != 500000 {
			t.Fatal("loss course charged/refunded or destroyed more than the actual500k foundation", player.Lost)
		}
	}
	if len(c.owned("power")) != 1 || !c.only("power").Complete || c.view().Economy.PowerCapacity != 140 || c.view().Economy.PowerDemand != 75 {
		t.Fatal("ordinary loss changed the surviving paid base power contract")
	}
	c.finish() // normative red remains nonfatal so stalled original persistence is retained
}
