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

// Original and candidate use these identical bytes. Every investment and toggle
// follows the normal public API from the standard6M HQ+rig opening. Save is read
// for accounting/proof only; no saved field or engine state is manufactured.
type emergencyHQPaidInput struct {
	Sequence uint32            `json:"sequence"`
	Orders   []sim.Order       `json:"orders"`
	Results  []sim.OrderResult `json:"results"`
}
type emergencyHQPaidRun struct {
	t                *testing.T
	e                *sim.Engine
	catalog          *content.Catalog
	replay           *sim.Replay
	twin             *sim.Engine
	checkpoint       sim.Tick
	inputs           []emergencyHQPaidInput
	hq, rig, factory sim.ID
}

func newEmergencyHQPaidRun(t *testing.T) *emergencyHQPaidRun {
	t.Helper()
	m := content.Map{ID: "backend-emergency-hq-survival-paid", Title: "Paid HQ survival and recovery backend geometry", Author: "backend acceptance fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64,
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
	e, err := sim.New(catalog, sim.Config{Map: m, Seed: 39423, Players: []sim.PlayerConfig{{ID: 1, Name: "Paid HQ recovery", Faction: "US", Team: 1, Controller: "human"}, {ID: 2, Name: "Remote human opponent", Faction: "IR", Team: 2, Controller: "human"}}})
	if err != nil {
		t.Fatal(err)
	}
	recorder, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	c := &emergencyHQPaidRun{t: t, e: e, catalog: catalog, replay: recorder}
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
	if view = c.view(); view.Economy.PowerCapacity != 140 || view.Economy.PowerDemand != 55 || view.Economy.ReservedSupply != 0 {
		t.Fatal("paid base must have ordinary sufficient power", view.Economy)
	}
	c.log("paid base")
	return c
}
func (c *emergencyHQPaidRun) view() sim.View {
	c.t.Helper()
	view, ok := c.e.PlayerView(1)
	if !ok {
		c.t.Fatal("current owner view missing")
	}
	return view
}
func (c *emergencyHQPaidRun) owned(typ string) []sim.EntityView {
	var actors []sim.EntityView
	for _, actor := range c.view().Entities {
		if actor.Owner == 1 && actor.Type == typ && actor.Private != nil && actor.Private.HP > 0 {
			actors = append(actors, actor)
		}
	}
	return actors
}
func (c *emergencyHQPaidRun) only(typ string) sim.EntityView {
	c.t.Helper()
	actors := c.owned(typ)
	if len(actors) != 1 {
		c.t.Fatal("need one current public owned actor", typ, len(actors))
	}
	return actors[0]
}
func (c *emergencyHQPaidRun) entity(id sim.ID) sim.EntityView {
	c.t.Helper()
	for _, actor := range c.view().Entities {
		if actor.ID == id && actor.Owner == 1 && actor.Private != nil {
			return actor
		}
	}
	c.t.Fatal("current owned actor missing", id)
	return sim.EntityView{}
}
func (c *emergencyHQPaidRun) advance(n sim.Tick) {
	c.t.Helper()
	for i := sim.Tick(0); i < n; i++ {
		if c.e.Tick() >= 12000 {
			c.t.Fatal("fixed paid course horizon exhausted")
		}
		c.e.Advance()
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
func (c *emergencyHQPaidRun) to(tick sim.Tick) {
	c.t.Helper()
	if tick < c.e.Tick() {
		c.t.Fatal("ordinary course cannot move time backward")
	}
	c.advance(tick - c.e.Tick())
}
func (c *emergencyHQPaidRun) wait(limit sim.Tick, label string, ready func() bool) {
	c.t.Helper()
	for step := sim.Tick(0); step < limit && !ready(); step++ {
		c.advance(1)
	}
	if !ready() {
		c.log("fixed deadline")
		c.t.Fatal("public paid setup/control deadline", label, limit, c.e.Tick())
	}
}
func (c *emergencyHQPaidRun) stage(orders ...sim.Order) uint32 {
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
func (c *emergencyHQPaidRun) receipts(sequence uint32, orders []sim.Order) []sim.OrderResult {
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
	c.inputs = append(c.inputs, emergencyHQPaidInput{sequence, orders, append([]sim.OrderResult(nil), results...)})
	c.t.Logf("EMERGENCY_HQ_RECEIPTS tick=%d results=%+v", c.e.Tick(), results)
	return results
}
func (c *emergencyHQPaidRun) issue(orders ...sim.Order) []sim.OrderResult {
	sequence := c.stage(orders...)
	c.advance(1)
	return c.receipts(sequence, orders)
}
func (c *emergencyHQPaidRun) ok(results []sim.OrderResult) {
	c.t.Helper()
	for _, result := range results {
		if !result.Accepted || result.Code != "ok" {
			c.log("rejected required public control")
			c.t.Fatal("required ordinary order rejected", results)
		}
	}
}
func (c *emergencyHQPaidRun) build(typ string, point sim.Vec) {
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
func (c *emergencyHQPaidRun) move(id sim.ID, point sim.Vec) {
	c.ok(c.issue(sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point}))
	c.wait(400, "physical public Move arrival", func() bool {
		actor := c.entity(id)
		dx, dy := int64(actor.Position.X-point.X), int64(actor.Position.Y-point.Y)
		return dx*dx+dy*dy <= 250*250 && len(actor.Private.Orders) == 0
	})
}

// Read-only accounting/proof data. These bytes never select a gameplay order.
func (c *emergencyHQPaidRun) snapshot() sim.State {
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
func (c *emergencyHQPaidRun) spent() int64 {
	c.t.Helper()
	for _, player := range c.snapshot().Players {
		if player.ID == 1 {
			return player.Spent
		}
	}
	c.t.Fatal("paid owner accounting missing from unchanged Save")
	return 0
}
func (c *emergencyHQPaidRun) ledger(spent int64) {
	c.t.Helper()
	view := c.view()
	if c.spent() != spent || view.Economy.Credits != 6000000+view.Economy.Income-spent {
		c.t.Fatal("ordinary income/purchase ledger diverged", view.Economy, spent)
	}
}
func (c *emergencyHQPaidRun) fund(credits int64) {
	c.wait(6000, "canonical included-hauler funding", func() bool { return c.view().Economy.Credits >= credits })
}
func (c *emergencyHQPaidRun) preview(order sim.Order, want string, fatal bool) {
	c.t.Helper()
	before := c.e.Hash()
	results, err := c.e.PreviewOrders(1, []sim.Order{order})
	if err != nil || before != c.e.Hash() || len(results) != 1 {
		c.t.Fatal("pure public preview unavailable or mutated engine", results, err)
	}
	if results[0].Code != want || results[0].Accepted != (want == "ok") {
		if fatal {
			c.t.Fatal("public preview disagreed with legal producer", results, want)
		}
		c.t.Errorf("surviving manually disabled HQ must keep factory rig preview %s, got %+v", want, results)
	}
}
func (c *emergencyHQPaidRun) menu(id sim.ID, wanted bool, code, waiting string, fatal bool) {
	c.t.Helper()
	before := c.e.Hash()
	menu, err := c.e.CommandAffordances(1, []sim.ID{id})
	if err != nil || before != c.e.Hash() || len(menu.Entities) != 1 {
		c.t.Fatal("read-only public production menu unavailable", menu, err)
	}
	listed, found := false, false
	for _, typ := range menu.Entities[0].Trains {
		if typ == "US.rig" {
			listed = true
		}
	}
	for _, status := range menu.Entities[0].Production {
		if status.Kind == "train" && status.Type == "US.rig" {
			found = true
			if status.Code != code || status.WaitsFor != waiting {
				if fatal {
					c.t.Fatal("rig start/admission guidance differs", status, code, waiting)
				}
				c.t.Errorf("surviving HQ factory rig guidance differs: %+v", status)
			}
		}
	}
	if listed != wanted || found != wanted {
		if fatal {
			c.t.Fatal("rig menu does not reflect actual owned HQ survival", menu)
		}
		c.t.Errorf("manually disabled surviving HQ must exclude factory emergency menu: %+v", menu.Entities[0])
	}
}
func (c *emergencyHQPaidRun) pendingCheckpoint() {
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
	if len(c.replay.Checkpoints) != 1 || c.replay.Checkpoints[0].Tick != c.checkpoint {
		c.t.Fatal("exact pending checkpoint was not recorded")
	}
	c.log("pending saved checkpoint")
}
func (c *emergencyHQPaidRun) finish() {
	c.t.Helper()
	data, err := c.e.Save()
	if err != nil {
		c.t.Fatal(err)
	}
	restored, err := sim.Restore(c.catalog, data)
	if err != nil || restored.Hash() != c.e.Hash() || restored.Metadata() != c.e.Metadata() {
		c.t.Fatal("terminal ordinary Save/Restore differs", err)
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
		c.t.Fatal("actual pending-checkpoint continuation differs", err)
	}
	c.log("final saved/replayed public state")
}
func (c *emergencyHQPaidRun) log(label string) {
	data, err := json.Marshal(map[string]any{"label": label, "tick": c.e.Tick(), "hash": c.e.Hash(), "view": c.view()})
	if err != nil {
		c.t.Fatal(err)
	}
	c.t.Logf("EMERGENCY_HQ_PUBLIC %s", data)
}
func (c *emergencyHQPaidRun) archive() {
	directory := os.Getenv("FRONTLINE_EMERGENCY_HQ_EVIDENCE")
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
	data, err = json.MarshalIndent(map[string]any{"failed": c.t.Failed(), "hash": c.e.Hash(), "metadata": c.e.Metadata(), "view": c.view(), "inputs": c.inputs, "checkpoint": c.checkpoint}, "", "  ")
	if err != nil {
		c.t.Errorf("evidence ledger: %v", err)
		return
	}
	if err = os.WriteFile(prefix+".json", append(data, '\n'), 0644); err != nil {
		c.t.Errorf("evidence ledger: %v", err)
	}
}

func TestEmergencyHQSurvivalPublicPaid(t *testing.T) {
	t.Run("SurvivingPoweredOffHQ", func(t *testing.T) {
		c := newEmergencyHQPaidRun(t)
		c.fund(1200000)
		hq := c.entity(c.hq)
		c.menu(c.factory, false, "", "", true)
		activeProbe := sim.Order{Kind: "train", Entities: []sim.ID{c.factory}, Type: "US.rig"}
		c.preview(activeProbe, "wrong_producer", true)
		if result := c.issue(activeProbe)[0]; result.Accepted || result.Code != "wrong_producer" {
			t.Fatal("living active HQ unexpectedly opened emergency factory admission", result)
		}
		c.ledger(4700000)
		c.ok(c.issue(sim.Order{Kind: "power", Entities: []sim.ID{c.hq}, Index: 0}))
		off := c.entity(c.hq)
		if off.Complete != hq.Complete || off.Private.HP != hq.Private.HP || off.Enabled || off.Private.HP <= 0 {
			t.Fatal("ordinary Power0 must preserve the same living complete owned HQ")
		}
		c.preview(sim.Order{Kind: "train", Entities: []sim.ID{c.hq}, Type: "US.rig"}, "producer_disabled", true)
		c.menu(c.hq, true, "producer_disabled", "", true)
		c.menu(c.factory, false, "", "", false)
		probe := sim.Order{Kind: "train", Entities: []sim.ID{c.factory}, Type: "US.rig"}
		c.preview(probe, "wrong_producer", false)
		before := c.view().Economy
		spentBefore := c.spent()
		result := c.issue(probe)[0]
		acceptedAt := c.e.Tick()
		if result.Accepted || result.Code != "wrong_producer" {
			t.Errorf("living manually powered-off HQ is not actual HQ loss; factory rig receipt=%+v", result)
		}
		if c.spent() != spentBefore || len(c.entity(c.factory).Private.Jobs) != 0 {
			t.Errorf("ineligible factory recovery must not create a job or debit a fee: before=%+v after=%+v", before, c.view().Economy)
		}
		// Continue even on original incorrect admission to preserve the actual
		// fee, progress and600tick output, rather than failing before evidence.
		if result.Accepted {
			jobs := c.entity(c.factory).Private.Jobs
			if len(jobs) != 1 || !jobs[0].Emergency || !jobs[0].Started || jobs[0].Paid != 1200000 || jobs[0].Required != 1200 || jobs[0].Work != 2 {
				t.Fatal("original unexpected recovery admission did not retain its ordinary paid600tick job", jobs)
			}
		}
		orders := []sim.Order{{Kind: "power", Entities: []sim.ID{c.hq}, Index: 1}}
		sequence := c.stage(orders...)
		c.pendingCheckpoint()
		c.advance(1)
		c.ok(c.receipts(sequence, orders))
		c.to(acceptedAt + 598)
		if len(c.owned("US.rig")) != 1 {
			t.Fatal("unexpected recovery rig completed before its normal600tick boundary")
		}
		c.advance(1)
		c.log("living-HQ admission/output boundary")
		if len(c.owned("US.rig")) != 1 || c.spent() != spentBefore {
			t.Errorf("powered-off HQ incorrectly produced/debited factory emergency rig at ordinary600tick boundary: rigs=%d economy=%+v", len(c.owned("US.rig")), c.view().Economy)
		}
		c.finish()
	})
	t.Run("NormalHQUnpaidFIFOAndPause", func(t *testing.T) {
		c := newEmergencyHQPaidRun(t)
		c.fund(1600000)
		c.menu(c.hq, true, "ok", "", true)
		c.menu(c.factory, false, "", "", true)
		orders := []sim.Order{{Kind: "train", Entities: []sim.ID{c.hq}, Type: "US.rig"}, {Kind: "train", Entities: []sim.ID{c.hq}, Type: "US.rig"}}
		sequence := c.stage(orders...)
		c.pendingCheckpoint()
		c.advance(1)
		c.ok(c.receipts(sequence, orders))
		jobs := c.entity(c.hq).Private.Jobs
		if len(jobs) != 2 || jobs[0].Paid != 800000 || !jobs[0].Started || jobs[0].Emergency || jobs[0].Required != 800 || jobs[0].Work != 2 || jobs[1].Started || jobs[1].Paid != 0 || jobs[1].Emergency || jobs[1].Work != 0 {
			t.Fatal("normal800k/400tick rig head and unpaid FIFO tail diverged", jobs)
		}
		c.ledger(5500000)
		c.advance(20)
		work := c.entity(c.hq).Private.Jobs[0].Work
		c.ok(c.issue(sim.Order{Kind: "power", Entities: []sim.ID{c.hq}, Index: 0}))
		c.advance(40)
		jobs = c.entity(c.hq).Private.Jobs
		if len(jobs) != 2 || jobs[0].Work != work || jobs[1].Started || jobs[1].Paid != 0 {
			t.Fatal("ordinary disabled HQ changed paid work or unpaid FIFO", jobs)
		}
		c.menu(c.hq, true, "producer_disabled", "", true)
		c.preview(orders[0], "producer_disabled", true)
		if result := c.issue(orders[0])[0]; result.Accepted || result.Code != "producer_disabled" {
			t.Fatal("disabled normal HQ production became active", result)
		}
		c.ledger(5500000)
		c.ok(c.issue(sim.Order{Kind: "power", Entities: []sim.ID{c.hq}, Index: 1}))
		work = c.entity(c.hq).Private.Jobs[0].Work
		remaining := sim.Tick((800 - work) / 2)
		c.advance(remaining - 1)
		if len(c.owned("US.rig")) != 1 {
			t.Fatal("normal rig finished before400 active ticks")
		}
		c.advance(1)
		if len(c.owned("US.rig")) != 2 || len(c.entity(c.hq).Private.Jobs) != 1 || c.entity(c.hq).Private.Jobs[0].Paid != 0 {
			t.Fatal("normal head completion charged FIFO follower early")
		}
		c.menu(c.hq, true, "ok", "queued", true)
		c.advance(1)
		jobs = c.entity(c.hq).Private.Jobs
		if len(jobs) != 1 || jobs[0].Paid != 800000 || !jobs[0].Started || jobs[0].Work != 2 || jobs[0].Emergency {
			t.Fatal("normal FIFO follower did not start/pay once on next tick", jobs)
		}
		c.advance(398)
		if len(c.owned("US.rig")) != 2 {
			t.Fatal("normal FIFO follower finished before400 active ticks")
		}
		c.advance(1)
		if len(c.owned("US.rig")) != 3 || len(c.entity(c.hq).Private.Jobs) != 0 {
			t.Fatal("normal FIFO rigs did not finish at400 ticks each")
		}
		c.ledger(6300000)
		c.finish()
	})
	t.Run("ActualHQSaleEmergencyFIFOAndPause", func(t *testing.T) {
		c := newEmergencyHQPaidRun(t)
		c.fund(2400000)
		c.menu(c.factory, false, "", "", true)
		c.ok(c.issue(sim.Order{Kind: "sell", Entities: []sim.ID{c.hq}}))
		sellingAt := c.e.Tick()
		c.advance(99)
		if len(c.owned("hq")) != 1 || !c.entity(c.hq).Complete {
			t.Fatal("actual HQ disappeared before normal100tick sale")
		}
		c.menu(c.factory, false, "", "", true)
		c.advance(1)
		if c.e.Tick() != sellingAt+100 || len(c.owned("hq")) != 0 {
			t.Fatal("normal sale did not remove owned complete HQ on its100tick boundary")
		}
		c.ledger(4700000) // canonical initial HQ Paid0 yields no fabricated refund
		opponentView, ok := c.e.PlayerView(2)
		foreignHQ := false
		for _, actor := range opponentView.Entities {
			if actor.Owner == 2 && actor.Type == "hq" && actor.Complete && actor.Private != nil && actor.Private.HP > 0 {
				foreignHQ = true
			}
		}
		if !ok || !foreignHQ {
			t.Fatal("a living non-owned HQ must remain present as the ownership control")
		}
		c.menu(c.factory, true, "ok", "", true)
		probe := sim.Order{Kind: "train", Entities: []sim.ID{c.factory}, Type: "US.rig"}
		c.preview(probe, "ok", true)
		orders := []sim.Order{probe, probe}
		sequence := c.stage(orders...)
		c.pendingCheckpoint()
		c.advance(1)
		c.ok(c.receipts(sequence, orders))
		jobs := c.entity(c.factory).Private.Jobs
		if len(jobs) != 2 || !jobs[0].Emergency || jobs[0].Paid != 1200000 || !jobs[0].Started || jobs[0].Required != 1200 || jobs[0].Work != 2 || !jobs[1].Emergency || jobs[1].Started || jobs[1].Paid != 0 || jobs[1].Work != 0 {
			t.Fatal("actual HQ loss emergency1200k/600tick head/unpaid FIFO diverged", jobs)
		}
		c.ledger(5900000)
		c.advance(20)
		work := c.entity(c.factory).Private.Jobs[0].Work
		c.ok(c.issue(sim.Order{Kind: "power", Entities: []sim.ID{c.factory}, Index: 0}))
		c.advance(40)
		jobs = c.entity(c.factory).Private.Jobs
		if len(jobs) != 2 || jobs[0].Work != work || jobs[1].Started || jobs[1].Paid != 0 {
			t.Fatal("disabled factory changed paid recovery work or FIFO", jobs)
		}
		c.menu(c.factory, true, "producer_disabled", "", true)
		c.preview(probe, "producer_disabled", true)
		if result := c.issue(probe)[0]; result.Accepted || result.Code != "producer_disabled" {
			t.Fatal("emergency exception enabled a disabled factory", result)
		}
		c.ledger(5900000)
		c.ok(c.issue(sim.Order{Kind: "power", Entities: []sim.ID{c.factory}, Index: 1}))
		work = c.entity(c.factory).Private.Jobs[0].Work
		remaining := sim.Tick((1200 - work) / 2)
		c.advance(remaining - 1)
		if len(c.owned("US.rig")) != 1 {
			t.Fatal("emergency head finished before600 active ticks")
		}
		c.advance(1)
		if len(c.owned("US.rig")) != 2 || len(c.entity(c.factory).Private.Jobs) != 1 || c.entity(c.factory).Private.Jobs[0].Paid != 0 {
			t.Fatal("emergency head completion charged follower early")
		}
		c.advance(1)
		jobs = c.entity(c.factory).Private.Jobs
		if len(jobs) != 1 || !jobs[0].Emergency || jobs[0].Paid != 1200000 || jobs[0].Work != 2 {
			t.Fatal("emergency FIFO follower did not start once next tick", jobs)
		}
		c.advance(598)
		if len(c.owned("US.rig")) != 2 {
			t.Fatal("emergency follower finished before600 active ticks")
		}
		c.advance(1)
		if len(c.owned("US.rig")) != 3 || len(c.entity(c.factory).Private.Jobs) != 0 {
			t.Fatal("actual HQ loss paid emergency rigs did not complete at600 ticks each")
		}
		c.ledger(7100000)
		c.finish()
	})
}
