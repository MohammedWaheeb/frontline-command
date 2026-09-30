package sim_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// These guards require the same-union Shahed content and flight implementation.
// Both humans receive a declared equal custom opening. Every added actor is paid
// for through ordinary construction/production, without injected state or HP.
type shahedGuardRun struct {
	t *testing.T
	c *content.Catalog
	e, twin *sim.Engine
	replay *sim.Replay
	sequence map[sim.PlayerID]uint32
	initialHash string
	midpoint sim.Tick
	archives map[string][]byte
	inputs []sim.Scheduled
	home, aircraft sim.ID
}

func newShahedGuardRun(t *testing.T) *shahedGuardRun {
	t.Helper()
	c := content.MustBase()
	if _, ok := c.Unit("IR.shahed"); !ok { t.Fatal("same-union IR.shahed catalog is required") }
	cfg := sim.Config{Map: aircraftServiceContactMap(), Seed: 737404, Ruleset: "custom-v1", StartingCredits: 12000000,
		Players: []sim.PlayerConfig{{ID: 1, Name: "Paid Shahed owner", Faction: "IR", Team: 1, Controller: "human"}, {ID: 2, Name: "Remote human", Faction: "US", Team: 2, Controller: "human"}}}
	e, err := sim.New(c, cfg)
	if err != nil { t.Fatal(err) }
	replay, err := sim.NewReplay(e)
	if err != nil { t.Fatal(err) }
	r := &shahedGuardRun{t: t, c: c, e: e, replay: replay, sequence: map[sim.PlayerID]uint32{}, initialHash: e.Hash(), archives: map[string][]byte{"initial.save.json": slices.Clone(replay.Initial)}}
	t.Cleanup(r.archive)
	r.advance(100)
	for _, owner := range []sim.PlayerID{1, 2} {
		if v := r.view(owner); v.Countdown != 0 || v.Economy.Credits != 12000000 || v.Economy.Income != 0 { t.Fatal("declared equal custom opening changed", owner, v.Economy) }
	}
	r.build("power", sim.Vec{X: 23000, Y: 22000})
	r.build("barracks", sim.Vec{X: 23500, Y: 25000})
	r.build("supply", sim.Vec{X: 18000, Y: 29500})
	hauler := r.typeID(1, "IR.hauler")
	if hauler == 0 { t.Fatal("ordinary included hauler absent") }
	r.accept(1, sim.Order{Kind: "stop", Entities: []sim.ID{hauler}})
	r.build("radar", sim.Vec{X: 27000, Y: 28500})
	r.home = r.build("IR.drone_hub", sim.Vec{X: 29000, Y: 22000})
	u, _ := c.Unit("IR.shahed")
	before := r.view(1).Economy.Credits
	r.accept(1, sim.Order{Kind: "train", Entities: []sim.ID{r.home}, Type: "IR.shahed"})
	if r.view(1).Economy.Credits != before-u.Cost { t.Fatal("normal Shahed fee not charged") }
	r.wait(900, "paid Shahed production", func() bool { return r.typeID(1, "IR.shahed") != 0 })
	r.aircraft = r.typeID(1, "IR.shahed")
	v := r.own(1, r.aircraft)
	if !v.Landed || v.Private.Home != r.home || v.Private.ShahedCommitted || v.Private.HP != u.HP || v.Private.Ammo != 1 || v.Private.Endurance != 2400 || v.Private.ServiceWork != 0 { t.Fatal("paid uncommitted aircraft resources changed", v) }
	if v := r.view(1); v.Economy.Credits != 5800000 || v.Economy.Income != 0 { t.Fatal("normal 6200-credit setup ledger changed", v.Economy) }
	return r
}

func (r *shahedGuardRun) view(owner sim.PlayerID) sim.View {
	r.t.Helper()
	v, ok := r.e.PlayerView(owner)
	if !ok { r.t.Fatal("public owner view unavailable", owner) }
	return v
}
func (r *shahedGuardRun) actor(owner sim.PlayerID, id sim.ID) (sim.EntityView, bool) {
	for _, v := range r.view(owner).Entities { if v.ID == id { return v, true } }
	return sim.EntityView{}, false
}
func (r *shahedGuardRun) own(owner sim.PlayerID, id sim.ID) sim.EntityView {
	r.t.Helper()
	v, ok := r.actor(owner, id)
	if !ok || v.Owner != owner || v.Private == nil { r.t.Fatal("current owned actor absent", owner, id, r.e.Tick()) }
	return v
}
func (r *shahedGuardRun) typeID(owner sim.PlayerID, typ string) sim.ID {
	for _, v := range r.view(owner).Entities { if v.Owner == owner && v.Type == typ && v.Complete { return v.ID } }
	return 0
}
func (r *shahedGuardRun) advance(n uint32) {
	r.t.Helper()
	for range n {
		before := r.e.Tick()
		r.e.Advance()
		if r.e.Tick()%600 == 0 { if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) } }
		if r.twin != nil {
			r.twin.Advance()
			if r.e.Hash() != r.twin.Hash() { r.t.Fatal("actual commitment continuation diverged", r.e.Tick()) }
		}
		if r.e.Tick() <= before || r.e.Tick() > 14000 { r.t.Fatal("fixed public course bound", before, r.e.Tick(), r.e.Outcome()) }
	}
}
func (r *shahedGuardRun) wait(limit uint32, label string, ready func() bool) {
	r.t.Helper()
	for n := uint32(0); n <= limit; n++ {
		if ready() { return }
		if n < limit { r.advance(1) }
	}
	r.t.Fatal(label, "did not complete within fixed ticks", limit, r.e.Tick())
}
func (r *shahedGuardRun) submit(owner sim.PlayerID, orders []sim.Order) uint32 {
	r.t.Helper()
	r.sequence[owner]++
	seq := r.sequence[owner]
	data, err := json.Marshal(orders)
	if err != nil { r.t.Fatal(err) }
	var copy []sim.Order
	if err = json.Unmarshal(data, &copy); err != nil { r.t.Fatal(err) }
	if err = r.e.Submit(owner, seq, copy); err != nil { r.t.Fatal("normal Submit", err) }
	if r.twin != nil { if err = r.twin.Submit(owner, seq, copy); err != nil { r.t.Fatal(err) } }
	r.inputs = append(r.inputs, sim.Scheduled{Tick: r.e.Tick()+1, Player: owner, Sequence: seq, Orders: copy})
	return seq
}
func (r *shahedGuardRun) receipts(owner sim.PlayerID, sequence uint32, count int, accepted bool) {
	r.t.Helper()
	seen := map[int32]bool{}
	for _, v := range r.view(owner).Results {
		if v.Player != owner || v.Sequence != sequence { continue }
		if v.Index < 0 || int(v.Index) >= count || seen[v.Index] || v.Accepted != accepted || accepted && v.Code != "ok" { r.t.Fatal("unexpected actual receipt", v) }
		seen[v.Index] = true
	}
	if len(seen) != count { r.t.Fatal("actual receipts missing", sequence, count, seen) }
}
func (r *shahedGuardRun) accept(owner sim.PlayerID, order sim.Order) {
	r.t.Helper()
	seq := r.submit(owner, []sim.Order{order})
	r.advance(1)
	r.receipts(owner, seq, 1, true)
}
func (r *shahedGuardRun) build(typ string, point sim.Vec) sim.ID {
	r.t.Helper()
	building, ok := r.c.Building(typ)
	rig := r.typeID(1, "IR.rig")
	if !ok || rig == 0 { r.t.Fatal("ordinary owned construction source/rule missing", typ) }
	before := r.view(1).Economy.Credits
	r.accept(1, sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: typ, Position: point})
	if r.view(1).Economy.Credits != before-building.Cost { r.t.Fatal("normal construction debit", typ) }
	r.wait(1800, "paid "+typ, func() bool { return r.typeID(1, typ) != 0 })
	return r.typeID(1, typ)
}
func (r *shahedGuardRun) point() sim.Vec {
	v := r.own(1, r.aircraft)
	point := sim.Vec{X: v.Position.X, Y: v.Position.Y+9500}
	view := r.view(1)
	index := int(point.Y/1000)*int(aircraftServiceContactMap().Width)+int(point.X/1000)
	if index < 0 || index >= len(view.Visible) || !view.Visible[index] { r.t.Fatal("point is not earned from current public sight", point) }
	return point
}
func (r *shahedGuardRun) commit(point sim.Vec) {
	r.accept(1, sim.Order{Kind: "force_fire", Entities: []sim.ID{r.aircraft}, Position: point})
	r.fixedFlight(point, r.home)
}
func (r *shahedGuardRun) fixedFlight(point sim.Vec, home sim.ID) sim.EntityView {
	r.t.Helper()
	v := r.own(1, r.aircraft)
	orders := v.Private.Orders
	if !v.Private.ShahedCommitted || v.Landed || v.Private.Home != home || v.Private.Ammo != 0 || v.Private.RepeatSortie || v.Private.ServiceWork != 0 || len(orders) != 1 || orders[0].Kind != "move" || orders[0].Target != 0 || orders[0].Position != point || orders[0].Queued { r.t.Fatal("fixed earned flight or owner marker changed", v) }
	return v
}
func (r *shahedGuardRun) checkpoint(name string) {
	r.t.Helper()
	if r.midpoint != 0 { r.t.Fatal("duplicate fixture checkpoint") }
	save, err := r.replay.CaptureCheckpoint(r.e)
	if err != nil { r.t.Fatal(err) }
	r.twin, err = sim.Restore(r.c, save)
	if err != nil || r.twin.Hash() != r.e.Hash() { r.t.Fatal("actual current-version commitment checkpoint Restore", err) }
	r.midpoint = r.e.Tick()
	r.archives[name] = slices.Clone(save)
}
func (r *shahedGuardRun) finish() {
	r.t.Helper()
	if r.midpoint == 0 || r.e.Tick() <= r.midpoint || r.twin == nil || r.e.Hash() != r.twin.Hash() { r.t.Fatal("nonvacuous commitment checkpoint continuation absent") }
	save, err := r.e.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.c, save)
	if err != nil || restored.Hash() != r.e.Hash() || restored.Metadata().Simulation != sim.Version { r.t.Fatal("final current-version Save/Restore", err) }
	if err = r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) }
	data, err := r.replay.Encode()
	if err != nil { r.t.Fatal(err) }
	decoded, err := sim.DecodeReplay(data)
	if err != nil || len(decoded.Checkpoints) != 1 || decoded.Checkpoints[0].Tick != r.midpoint { r.t.Fatal("exact commitment checkpoint missing", err) }
	for _, checkpoint := range []bool{false, true} {
		copy := *decoded
		if !checkpoint { copy.Checkpoints = nil }
		played, err := copy.Seek(r.c, r.e.Tick())
		if err != nil || played.Hash() != r.e.Hash() { r.t.Fatal("full/sole-checkpoint actual replay", checkpoint, err) }
	}
	before := restored.Hash()
	restarted, err := restored.Restart()
	if err != nil || restarted.Hash() != r.initialHash || restored.Hash() != before { r.t.Fatal("restart changed original opening or active source", err) }
	r.archives["final.save.json"], r.archives["actual.replay.json.gz"] = save, data
	r.t.Logf("paid Shahed guards/persistence complete: midpoint=%d final=%d hash=%s inputs=%d", r.midpoint, r.e.Tick(), r.e.Hash(), len(r.inputs))
}
func (r *shahedGuardRun) archive() {
	root := os.Getenv("FRONTLINE_SHAHED_GUARD_EVIDENCE")
	if root == "" { return }
	root = filepath.Join(root, strings.ReplaceAll(r.t.Name(), "/", "__"))
	if err := os.MkdirAll(root, 0700); err != nil { r.t.Error(err); return }
	write := func(name string, data []byte) { if err := os.WriteFile(filepath.Join(root, name), data, 0600); err != nil { r.t.Error(err) } }
	for name, data := range r.archives { write(name, data) }
	if save, err := r.e.Save(); err == nil { write("last.save.json", save) } else { r.t.Error(err) }
	for name, value := range map[string]any{"public-inputs.json": r.inputs, "last-public.json": []sim.View{r.view(1), r.view(2)}, "result.json": map[string]any{"failed": r.t.Failed(), "tick": r.e.Tick(), "midpoint": r.midpoint, "hash": r.e.Hash()}} {
		data, err := json.MarshalIndent(value, "", "  ")
		if err != nil { r.t.Error(err) } else { write(name, data) }
	}
}

func TestShahedCommitmentPublicPaidGuardsAndPersistence(t *testing.T) {
	r := newShahedGuardRun(t)
	optionsBefore, err := r.e.CommandAffordances(1, []sim.ID{r.aircraft})
	if err != nil || len(optionsBefore.Entities) != 1 || !slices.Contains(optionsBefore.Entities[0].Commands, "force_fire") || !slices.Contains(optionsBefore.Entities[0].Commands, "return") || !slices.Contains(optionsBefore.Entities[0].Commands, "repeat_sortie") { t.Fatal("precommit ordinary controls missing", optionsBefore, err) }
	// Preserve normal precommit service/repeat controls. An unseen point never
	// earns commitment merely because it is legal authored map geometry.
	r.accept(1, sim.Order{Kind: "repeat_sortie", Entities: []sim.ID{r.aircraft}, Index: 1})
	if !r.own(1, r.aircraft).Private.RepeatSortie { t.Fatal("precommit repeat preference lost") }
	r.accept(1, sim.Order{Kind: "repeat_sortie", Entities: []sim.ID{r.aircraft}, Index: 0})
	startOfSortie := r.own(1, r.aircraft).Position
	r.accept(1, sim.Order{Kind: "move", Entities: []sim.ID{r.aircraft}, Position: sim.Vec{X: startOfSortie.X+5000, Y: startOfSortie.Y}})
	r.wait(80, "ordinary uncommitted Move", func() bool { v := r.own(1, r.aircraft); return !v.Landed && len(v.Private.Orders) == 0 })
	if r.own(1, r.aircraft).Private.ShahedCommitted { t.Fatal("ordinary Move committed aircraft") }
	r.accept(1, sim.Order{Kind: "return", Entities: []sim.ID{r.aircraft}, Target: r.home})
	r.wait(500, "normal precommit owned-home service", func() bool { v := r.own(1, r.aircraft); return v.Landed && v.Private.ServiceWork == 0 && len(v.Private.Orders) == 0 })
	seq := r.submit(1, []sim.Order{{Kind: "force_fire", Entities: []sim.ID{r.aircraft}, Position: sim.Vec{X: 80000, Y: 80000}}})
	r.advance(1)
	r.receipts(1, seq, 1, false)
	if r.own(1, r.aircraft).Private.ShahedCommitted { t.Fatal("unseen point committed aircraft") }
	// A second human's ordinary unarmed rig physically earns sight of the
	// aircraft, so the opponent privacy assertion is not vacuous.
	rig := r.typeID(2, "US.rig")
	rule, _ := r.c.Unit("US.rig")
	start := r.own(1, r.aircraft).Position
	if rig == 0 || rule.Sight < 4000 { t.Fatal("ordinary observer rig missing") }
	r.accept(2, sim.Order{Kind: "move", Entities: []sim.ID{rig}, Position: sim.Vec{X: start.X+rule.Sight*2/3, Y: start.Y}})
	r.wait(1600, "ordinary opponent observation", func() bool { _, ok := r.actor(2, r.aircraft); return ok })
	point := r.point()
	r.commit(point)
	if v, ok := r.actor(2, r.aircraft); !ok || v.Private != nil { t.Fatal("visible opponent received owner commitment/private state", ok, v) }
	options, err := r.e.CommandAffordances(1, []sim.ID{r.aircraft})
	if err != nil || len(options.Entities) != 1 || len(options.Entities[0].Commands) != 0 || len(options.Entities[0].Abilities) != 0 { t.Fatal("committed aircraft advertised mutable tasks", options, err) }
	orders := []sim.Order{}
	for _, kind := range []string{"move", "attack_move", "patrol", "stop", "hold", "guard", "aggressive", "return", "force_fire", "cancel"} {
		order := sim.Order{Kind: kind, Entities: []sim.ID{r.aircraft}, Position: point}
		if kind == "patrol" { order.Points = []sim.Vec{start, point} }
		orders = append(orders, order)
	}
	orders = append(orders, sim.Order{Kind: "attack", Entities: []sim.ID{r.aircraft}, Target: rig}, sim.Order{Kind: "move", Entities: []sim.ID{r.aircraft}, Position: point, Queued: true}, sim.Order{Kind: "return", Entities: []sim.ID{r.aircraft}, Target: r.home}, sim.Order{Kind: "repeat_sortie", Entities: []sim.ID{r.aircraft}, Index: 1}, sim.Order{Kind: "ability", Type: "drone_recall", Entities: []sim.ID{r.aircraft}})
	before := r.view(1).Economy
	if before.Energy < 45000 { t.Fatal("normal economy has not funded Recall guard control", before.Energy) }
	seq = r.submit(1, orders)
	r.checkpoint("committed-pending.save.json")
	r.advance(1)
	r.receipts(1, seq, len(orders), false)
	r.fixedFlight(point, r.home)
	after := r.view(1).Economy
	if after.Credits != before.Credits || after.Energy < before.Energy || !slices.Equal(after.Cooldowns, before.Cooldowns) || after.Income != before.Income || after.Supply != before.Supply || after.ReservedSupply != before.ReservedSupply { t.Fatal("rejected commitment orders spent or reallocated resources", before, after) }
	r.wait(160, "ordinary fixed-point terminal retirement", func() bool { _, ok := r.actor(1, r.aircraft); return !ok })
	r.finish()
}

func TestShahedCommitmentPublicPaidHomeLoss(t *testing.T) {
	r := newShahedGuardRun(t)
	r.accept(1, sim.Order{Kind: "sell", Entities: []sim.ID{r.home}})
	r.advance(97)
	point := r.point()
	r.commit(point)
	r.checkpoint("committed-before-home-sale.save.json")
	before := r.own(1, r.aircraft).Private.Endurance
	started := r.e.Tick()
	r.wait(5, "genuine hub sale reconciles Home only", func() bool { return r.own(1, r.aircraft).Private.Home == 0 })
	v := r.fixedFlight(point, 0)
	if before-uint32(r.e.Tick()-started) != v.Private.Endurance || v.Private.Endurance <= 1200 { t.Fatal("hub loss clamped or reset committed flight endurance", before, v.Private.Endurance) }
	if _, ok := r.actor(1, r.home); ok { t.Fatal("sold hub still exists") }
	r.wait(160, "home-free fixed-point terminal retirement", func() bool { _, ok := r.actor(1, r.aircraft); return !ok })
	r.finish()
}

func TestShahedCommitmentPublicPaidSurrenderRestore(t *testing.T) {
	r := newShahedGuardRun(t)
	point := r.point()
	r.commit(point)
	r.checkpoint("committed-before-surrender.save.json")
	r.accept(1, sim.Order{Kind: "surrender"})
	v := r.own(1, r.aircraft)
	if !r.e.Outcome().Finished || r.e.Outcome().Draw || r.e.Outcome().WinningTeam != 2 || !v.Private.ShahedCommitted || len(v.Private.Orders) != 0 || v.State != "inactive" || v.Enabled || v.Private.Ammo != 0 { t.Fatal("genuine defeated living committed survivor law changed", r.e.Outcome(), v) }
	r.finish()
}

// Deliberately malformed checksum-valid serialized inputs are rejected. They
// never supply resources, actors or physics to a successful gameplay course.
func TestShahedCommitmentPublicPaidRejectsMalformedSave(t *testing.T) {
	r := newShahedGuardRun(t)
	r.commit(r.point())
	save, err := r.e.Save()
	if err != nil { t.Fatal(err) }
	type envelope struct { Version uint32 `json:"version"`; SHA256 string `json:"sha256"`; State json.RawMessage `json:"state"` }
	for _, change := range []map[string]any{{"type": "IR.rig"}, {"ammo": 1}, {"landed": true}, {"repeat_sortie": true}, {"service_work": 1}, {"target": r.home}, {"aim_until": r.e.Tick()+1}, {"channel": "observe"}, {"orders": []sim.Order{}}, {"orders": []sim.Order{{Kind: "return"}}}} {
		var env envelope
		if err := json.Unmarshal(save, &env); err != nil { t.Fatal(err) }
		var state map[string]json.RawMessage
		if err := json.Unmarshal(env.State, &state); err != nil { t.Fatal(err) }
		var entities []json.RawMessage
		if err := json.Unmarshal(state["entities"], &entities); err != nil { t.Fatal(err) }
		found := false
		for i, raw := range entities {
			var identity struct { ID sim.ID `json:"id"` }
			if err := json.Unmarshal(raw, &identity); err != nil { t.Fatal(err) }
			if identity.ID != r.aircraft { continue }
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(raw, &fields); err != nil { t.Fatal(err) }
			for key, value := range change { fields[key], err = json.Marshal(value); if err != nil { t.Fatal(err) } }
			entities[i], err = json.Marshal(fields)
			if err != nil { t.Fatal(err) }
			found = true
		}
		if !found { t.Fatal("real paid committed actor missing") }
		state["entities"], err = json.Marshal(entities)
		if err != nil { t.Fatal(err) }
		env.State, err = json.Marshal(state)
		if err != nil { t.Fatal(err) }
		sum := sha256.Sum256(env.State)
		env.SHA256 = hex.EncodeToString(sum[:])
		bad, err := json.Marshal(env)
		if err != nil { t.Fatal(err) }
		if restored, err := sim.Restore(r.c, bad); err == nil || restored != nil || !strings.Contains(err.Error(), "Shahed") { t.Fatal("malformed committed save admitted", change, err) }
	}
	current, err := r.e.Save()
	if err != nil || !bytes.Equal(current, save) { t.Fatal("negative saved-input checks mutated the active source", err) }
	r.checkpoint("valid-committed.save.json")
	r.advance(1)
	r.finish()
}
