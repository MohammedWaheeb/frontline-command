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
	"reflect"
	"slices"
	"testing"
)

// Fresh ordinary matches: New provides its canonical HQ/rig and 6M credits.
// Every later actor is paid through Build/Train. The other human's own public
// controls establish a quiet concealed target; no AI or hidden state is driven.
func radarPulsePublicMap() content.Map {
	m := content.Map{
		ID: "radar-pulse-paid-public", Title: "RadarPulse paid public fixture",
		Author: "backend acceptance fixture", Version: "1", FormatVersion: 1,
		Ruleset: "standard-v2", Width: 96, Height: 96,
		Spawns: []content.Spawn{
			{Position: sim.Vec{X: 18500, Y: 64500}, Team: 1},
			{Position: sim.Vec{X: 77500, Y: 17500}, Team: 2},
			{Position: sim.Vec{X: 77500, Y: 77500}, Team: 1},
		},
		Fields: []content.Field{
			{ID: 1, Position: sim.Vec{X: 34500, Y: 74500}, Credits: 36000000},
			{ID: 2, Position: sim.Vec{X: 89500, Y: 22500}, Credits: 36000000},
		},
		Shipment: sim.Vec{X: 47500, Y: 47500},
	}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles { m.Tiles[i].Terrain = "open" }
	for y := int32(39); y <= 43; y++ {
		for x := int32(18); x <= 22; x++ { m.Tiles[y*m.Width+x].Terrain = "cover" }
	}
	return m
}

type radarPulsePublicInput struct {
	Player sim.PlayerID `json:"player"`
	Sequence uint32 `json:"sequence"`
	Orders []sim.Order `json:"orders"`
	Receipts []sim.OrderResult `json:"receipts"`
}

type radarPulsePublicRun struct {
	t *testing.T
	c *content.Catalog
	e *sim.Engine
	twin *sim.Engine
	replay *sim.Replay
	config sim.Config
	sequence map[sim.PlayerID]uint32
	paid map[sim.PlayerID]int64
	inputs []radarPulsePublicInput
	samples []sim.View
	initial, pendingSave, midpointSave, replayBytes []byte
	midpoint sim.Tick
	proof bool
}

func newRadarPulsePublicRun(t *testing.T) *radarPulsePublicRun {
	t.Helper()
	c := content.MustBase()
	cfg := sim.Config{Map: radarPulsePublicMap(), Seed: 390703, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "Radar operator", Faction: "US", Team: 1, Controller: "human"},
		{ID: 2, Name: "Concealed own control", Faction: "SY", Team: 2, Controller: "human"},
		{ID: 3, Name: "Remote allied observer", Faction: "IR", Team: 1, Controller: "human"},
	}}
	e, err := sim.New(c, cfg)
	if err != nil { t.Fatal(err) }
	initial, err := e.Save()
	if err != nil { t.Fatal(err) }
	replay, err := sim.NewReplay(e)
	if err != nil { t.Fatal(err) }
	r := &radarPulsePublicRun{t: t, c: c, e: e, replay: replay, config: cfg, initial: initial,
		sequence: map[sim.PlayerID]uint32{}, paid: map[sim.PlayerID]int64{}}
	t.Cleanup(r.writeEvidence)
	if e.Metadata().Simulation != sim.Version { t.Fatal("fresh source version is not sim.Version") }
	r.advance(100)
	for _, player := range []sim.PlayerID{1, 2, 3} {
		v := r.view(player)
		if v.Countdown != 0 || v.Economy.Credits != 6000000 || v.Economy.Energy != 0 { t.Fatal("normal countdown, funds or initial energy changed") }
	}
	return r
}

func (r *radarPulsePublicRun) view(player sim.PlayerID) sim.View {
	r.t.Helper()
	v, ok := r.e.PlayerView(player)
	if !ok { r.t.Fatalf("player %d public view absent", player) }
	return v
}

func (r *radarPulsePublicRun) actor(player sim.PlayerID, id sim.ID) (sim.EntityView, bool) {
	for _, v := range r.view(player).Entities { if v.ID == id { return v, true } }
	return sim.EntityView{}, false
}

func (r *radarPulsePublicRun) own(player sim.PlayerID, id sim.ID) sim.EntityView {
	r.t.Helper()
	v, ok := r.actor(player, id)
	if !ok || v.Owner != player || v.Private == nil || v.Private.HP <= 0 { r.t.Fatalf("owned living actor %d absent at %d", id, r.e.Tick()) }
	return v
}

func (r *radarPulsePublicRun) typeID(player sim.PlayerID, kind string) sim.ID {
	for _, v := range r.view(player).Entities {
		if v.Owner == player && v.Type == kind && v.Complete && v.Private != nil && v.Private.HP > 0 { return v.ID }
	}
	return 0
}

func (r *radarPulsePublicRun) siteID(player sim.PlayerID, kind string, point sim.Vec) sim.ID {
	for _, v := range r.view(player).Entities {
		if v.Owner == player && v.Type == kind && v.Position == point && v.Private != nil && v.Private.HP > 0 { return v.ID }
	}
	return 0
}

func (r *radarPulsePublicRun) advance(n uint32) {
	r.t.Helper()
	for range n {
		if r.e.Tick() >= 20000 { r.t.Fatal("paid feature fixture exceeded its absolute 20000-tick budget") }
		r.e.Advance()
		if r.twin != nil { r.twin.Advance() }
		if r.e.Tick()%600 == 0 {
			if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) }
			r.samples = append(r.samples, r.view(1), r.view(2), r.view(3))
		}
		if r.e.Outcome().Finished { r.t.Fatalf("unexpected ordinary match terminal at %d", r.e.Tick()) }
	}
}

func (r *radarPulsePublicRun) wait(limit uint32, text string, ready func() bool) {
	r.t.Helper()
	for i := uint32(0); i <= limit; i++ {
		if ready() { return }
		if i < limit { r.advance(1) }
	}
	r.t.Fatalf("%s did not reach its public condition within %d ticks, at %d", text, limit, r.e.Tick())
}

func (r *radarPulsePublicRun) batch(player sim.PlayerID, orders []sim.Order, pendingRestore bool) []sim.OrderResult {
	r.t.Helper()
	r.sequence[player]++
	seq := r.sequence[player]
	if err := r.e.Submit(player, seq, orders); err != nil { r.t.Fatalf("public Submit: %v", err) }
	if pendingRestore {
		if r.twin != nil || len(r.pendingSave) != 0 { r.t.Fatal("duplicate pending continuation") }
		var err error
		r.pendingSave, err = r.e.Save()
		if err != nil { r.t.Fatal(err) }
		r.twin, err = sim.Restore(r.c, r.pendingSave)
		if err != nil || r.twin.Hash() != r.e.Hash() { r.t.Fatalf("pending paid command Save/Restore: %v", err) }
	} else if r.twin != nil {
		if err := r.twin.Submit(player, seq, orders); err != nil { r.t.Fatal(err) }
	}
	r.advance(1)
	results := make([]sim.OrderResult, len(orders))
	found := make([]bool, len(orders))
	for _, result := range r.view(player).Results {
		if result.Player == player && result.Sequence == seq && result.Index >= 0 && int(result.Index) < len(orders) {
			results[result.Index], found[result.Index] = result, true
		}
	}
	for _, ok := range found { if !ok { r.t.Fatal("ordinary execution receipt absent") } }
	b, err := json.Marshal(orders)
	if err != nil { r.t.Fatal(err) }
	var copied []sim.Order
	if err := json.Unmarshal(b, &copied); err != nil { r.t.Fatal(err) }
	r.inputs = append(r.inputs, radarPulsePublicInput{player, seq, copied, results})
	return results
}

func (r *radarPulsePublicRun) accept(player sim.PlayerID, order sim.Order) sim.OrderResult {
	r.t.Helper()
	result := r.batch(player, []sim.Order{order}, false)[0]
	if !result.Accepted || result.Code != "ok" { r.t.Fatalf("%s/%s rejected: %+v", order.Kind, order.Type, result) }
	return result
}

func radarPulsePublicDist2(a, b sim.Vec) int64 {
	dx, dy := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y)
	return dx*dx + dy*dy
}

func (r *radarPulsePublicRun) move(player sim.PlayerID, id sim.ID, point sim.Vec, limit uint32) {
	r.t.Helper()
	r.accept(player, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point})
	r.wait(limit, "ordinary observed Move", func() bool {
		v := r.own(player, id)
		return len(v.Private.Orders) == 0 && radarPulsePublicDist2(v.Position, point) < 250*250
	})
}

func (r *radarPulsePublicRun) foundation(player sim.PlayerID, rig sim.ID, kind string, point, approach sim.Vec) sim.ID {
	r.t.Helper()
	r.move(player, rig, approach, 1600)
	before := r.view(player).Economy
	rule, ok := r.c.Building(kind)
	if !ok { r.t.Fatal("canonical building rule absent") }
	r.accept(player, sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: kind, Position: point})
	after := r.view(player).Economy
	if after.Credits != before.Credits-rule.Cost+after.Income-before.Income { r.t.Fatal("Build did not debit its canonical price exactly once") }
	r.paid[player] += rule.Cost
	id := r.siteID(player, kind, point)
	if id == 0 || r.own(player, id).Complete { r.t.Fatal("actual paid incomplete foundation absent") }
	return id
}

func (r *radarPulsePublicRun) complete(player sim.PlayerID, id sim.ID) {
	r.t.Helper()
	r.wait(2400, "ordinary paid structure completion", func() bool { return r.own(player, id).Complete })
}

func (r *radarPulsePublicRun) infrastructure() (sim.ID, sim.ID, sim.ID) {
	r.t.Helper()
	rig := r.typeID(1, "US.rig")
	if rig == 0 { r.t.Fatal("New's ordinary rig absent") }
	var power, barracks sim.ID
	for _, site := range []struct{kind string; point, approach sim.Vec; cost int64}{
		{"power", sim.Vec{X: 14500, Y: 69500}, sim.Vec{X: 19500, Y: 69500}, 500000},
		{"supply", sim.Vec{X: 27500, Y: 69500}, sim.Vec{X: 32500, Y: 69500}, 1800000},
		{"barracks", sim.Vec{X: 27500, Y: 60500}, sim.Vec{X: 32500, Y: 60500}, 600000},
	} {
		b, ok := r.c.Building(site.kind)
		if !ok || b.Cost != site.cost { r.t.Fatal("canonical fixture structure cost changed") }
		id := r.foundation(1, rig, site.kind, site.point, site.approach)
		r.complete(1, id)
		if site.kind == "power" { power = id }
		if site.kind == "barracks" { barracks = id }
	}
	return rig, power, barracks
}

func (r *radarPulsePublicRun) radar(rig sim.ID, second bool, finish bool) sim.ID {
	r.t.Helper()
	point, approach := sim.Vec{X: 14500, Y: 58500}, sim.Vec{X: 14500, Y: 63500}
	if second { point, approach = sim.Vec{X: 10500, Y: 57500}, sim.Vec{X: 5500, Y: 57500} }
	b, ok := r.c.Building("radar")
	if !ok || b.Cost != 1400000 || b.BuildTicks != 700 { r.t.Fatal("canonical radar price/time changed") }
	id := r.foundation(1, rig, "radar", point, approach)
	if finish { r.complete(1, id) }
	return id
}

func (r *radarPulsePublicRun) pulse(center sim.Vec, ids ...sim.ID) sim.Order {
	return sim.Order{Kind: "ability", Type: "radar_pulse", Entities: ids, Position: center}
}

func radarPulsePublicCooldown(v sim.EntityView) sim.Tick {
	if v.Private == nil { return 0 }
	for _, c := range v.Private.Cooldowns { if c.ID == "radar_pulse" { return c.Until } }
	return 0
}

func (r *radarPulsePublicRun) energyAfter(before int64, cost int64) int64 {
	v := r.view(1)
	gain := int64(0)
	for _, actor := range v.Entities {
		if actor.Owner == 1 && actor.Type == "hq" && actor.Complete && actor.Enabled {
			gain = 25
			if v.Economy.PowerDemand > v.Economy.PowerCapacity && v.Tick%2 != 0 { gain = 0 }
			break
		}
	}
	return min(int64(100000), before-cost+gain)
}

func (r *radarPulsePublicRun) assertCast(before int64, result sim.OrderResult, id sim.ID, point sim.Vec) {
	r.t.Helper()
	if !result.Accepted || result.Code != "ok" || r.view(1).Economy.Energy != r.energyAfter(before, 25000) { r.t.Fatal("Pulse did not accept and debit exactly 25 Energy once") }
	if radarPulsePublicCooldown(r.own(1, id)) != result.Tick+1600 { r.t.Fatal("chosen radar did not receive exactly 80 seconds cooldown") }
	found := 0
	for _, event := range r.view(1).Events {
		if event.Kind != "radar_pulse" { continue }
		found++
		if event.Owner != 1 || event.Entity != id || event.Position != point || event.Scope != "team" || event.Tick != result.Tick || event.Value != 12000 || event.Text != "" || event.Combat != nil { r.t.Fatal("actual Pulse event contract changed") }
	}
	if found != 1 { r.t.Fatal("one cast must emit one actual team event") }
	if !r.zone(1, point, result.Tick, result.Tick+120) { r.t.Fatal("immediate six-second 12-tile scan absent") }
}

func (r *radarPulsePublicRun) zone(player sim.PlayerID, point sim.Vec, start, until sim.Tick) bool {
	for _, z := range r.view(player).Zones {
		if z.Kind == "scan" && z.Owner == 1 && z.Position == point && z.Radius == 12000 && z.Start == start && z.Until == until { return true }
	}
	return false
}

func radarPulsePublicTile(v sim.View, point sim.Vec, explored bool) bool {
	i := int((point.Y/1000)*96+point.X/1000)
	if explored { return i >= 0 && i < len(v.Explored) && v.Explored[i] }
	return i >= 0 && i < len(v.Visible) && v.Visible[i]
}

func (r *radarPulsePublicRun) reject(order sim.Order, code string) {
	r.t.Helper()
	before := r.view(1)
	cooldowns := map[sim.ID][]sim.Cooldown{}
	for _, v := range before.Entities { if v.Owner == 1 && v.Type == "radar" && v.Private != nil { cooldowns[v.ID] = slices.Clone(v.Private.Cooldowns) } }
	result := r.batch(1, []sim.Order{order}, false)[0]
	if result.Accepted || result.Code != code { r.t.Fatalf("Pulse rejection wanted %s: %+v", code, result) }
	if r.view(1).Economy.Energy != r.energyAfter(before.Economy.Energy, 0) { r.t.Fatal("rejected Pulse spent Energy") }
	for id, old := range cooldowns { if !reflect.DeepEqual(r.own(1, id).Private.Cooldowns, old) { r.t.Fatal("rejected Pulse changed cooldown") } }
	if !reflect.DeepEqual(r.view(1).Zones, before.Zones) { r.t.Fatal("rejected Pulse created/changed a scan") }
	for _, event := range r.view(1).Events { if event.Kind == "radar_pulse" { r.t.Fatal("rejected Pulse emitted a success event") } }
}

func (r *radarPulsePublicRun) checkpoint() {
	r.t.Helper()
	if r.midpoint != 0 { r.t.Fatal("duplicate midpoint") }
	if r.twin != nil && r.twin.Hash() != r.e.Hash() { r.t.Fatal("pending Save/Restore continuation diverged") }
	var err error
	r.midpointSave, err = r.replay.CaptureCheckpoint(r.e)
	if err != nil { r.t.Fatal(err) }
	r.midpoint = r.e.Tick()
	r.twin, err = sim.Restore(r.c, r.midpointSave)
	if err != nil || r.twin.Hash() != r.e.Hash() { r.t.Fatalf("actual midpoint Save/Restore: %v", err) }
}

func (r *radarPulsePublicRun) finish() {
	r.t.Helper()
	if r.midpoint == 0 || r.midpoint >= r.e.Tick() || r.twin == nil || r.twin.Hash() != r.e.Hash() { r.t.Fatal("nonvacuous saved twin continuation missing/diverged") }
	for _, player := range []sim.PlayerID{1, 2, 3} {
		v := r.view(player)
		if v.Economy.Credits != 6000000+v.Economy.Income-r.paid[player] { r.t.Fatalf("player %d paid ledger does not reconcile", player) }
	}
	save, err := r.e.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.c, save)
	if err != nil || restored.Hash() != r.e.Hash() { r.t.Fatalf("final Save/Restore: %v", err) }
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) }
	r.replayBytes, err = r.replay.Encode()
	if err != nil { r.t.Fatal(err) }
	for _, checkpoint := range []bool{false, true} {
		decoded, err := sim.DecodeReplay(r.replayBytes)
		if err != nil { r.t.Fatal(err) }
		if !bytes.Equal(decoded.Initial, r.initial) { r.t.Fatal("compact replay Initial differs from the exact fresh New Save") }
		if checkpoint {
			kept := []sim.ReplayCheckpoint{}
			for _, cp := range decoded.Checkpoints { if cp.Tick == r.midpoint { kept = append(kept, cp) } }
			if len(kept) != 1 || len(kept[0].PackedSave) == 0 { r.t.Fatal("actual midpoint checkpoint missing") }
			decoded.Checkpoints = kept
		} else { decoded.Checkpoints = nil }
		played, err := decoded.Seek(r.c, r.e.Tick())
		if err != nil || played.Hash() != r.e.Hash() { r.t.Fatalf("native full/checkpoint replay checkpoint=%v: %v", checkpoint, err) }
	}
	restarted, err := r.e.Restart()
	if err != nil { r.t.Fatal(err) }
	newAgain, err := sim.New(r.c, r.config)
	if err != nil || restarted.Hash() != newAgain.Hash() { r.t.Fatalf("ordinary fresh restart: %v", err) }
	r.proof = true
	r.t.Logf("paid=%d actual midpoint=%d final=%d native hash=%s", r.paid[1], r.midpoint, r.e.Tick(), r.e.Hash())
}

func radarPulsePublicSHA(data []byte) string {
	s := sha256.Sum256(data)
	return hex.EncodeToString(s[:])
}

func (r *radarPulsePublicRun) writeEvidence() {
	dir := os.Getenv("FRONTLINE_RADAR_PULSE_EVIDENCE")
	if dir == "" { return } // Optional archival only; no assertion is skipped.
	dir = filepath.Join(dir, r.t.Name())
	if err := os.MkdirAll(dir, 0755); err != nil { r.t.Error(err); return }
	write := func(name string, data []byte, err error) {
		if err != nil { r.t.Errorf("archive %s: %v", name, err); return }
		if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil { r.t.Error(err) }
	}
	jsonWrite := func(name string, value any) { b, err := json.MarshalIndent(value, "", "  "); write(name, b, err) }
	jsonWrite("public-commands.json", r.inputs)
	jsonWrite("config.json", r.config)
	jsonWrite("public-samples.json", r.samples)
	jsonWrite("final-public.json", []sim.View{r.view(1), r.view(2), r.view(3)})
	write("initial.save.json", r.initial, nil)
	if len(r.pendingSave) != 0 { write("pending.save.json", r.pendingSave, nil) }
	if len(r.midpointSave) != 0 { write("midpoint.save.json", r.midpointSave, nil) }
	final, err := r.e.Save()
	write("final.save.json", final, err)
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Error(err); return }
	replay, err := r.replay.Encode()
	write("actual.replay.gz", replay, err) // Keep compact bytes; never pretty-print embedded native Saves.
	jsonWrite("proof.json", map[string]any{"failed": r.t.Failed(), "native_proofs_passed": r.proof, "simulation": sim.Version,
		"tick": r.e.Tick(), "midpoint": r.midpoint, "hash": r.e.Hash(), "paid": r.paid,
		"initial_save_sha256": radarPulsePublicSHA(r.initial), "pending_save_sha256": radarPulsePublicSHA(r.pendingSave),
		"midpoint_save_sha256": radarPulsePublicSHA(r.midpointSave), "final_save_sha256": radarPulsePublicSHA(final),
		"compact_replay_sha256": radarPulsePublicSHA(replay)})
}

func TestRadarPulsePublicPaidScanAndPersistence(t *testing.T) {
	r := newRadarPulsePublicRun(t)
	rig, _, _ := r.infrastructure()
	radar := r.radar(rig, false, true)
	otherRig := r.typeID(2, "SY.rig")
	power := r.foundation(2, otherRig, "power", sim.Vec{X: 73500, Y: 22500}, sim.Vec{X: 78500, Y: 22500})
	r.complete(2, power)
	barracks := r.foundation(2, otherRig, "barracks", sim.Vec{X: 83500, Y: 13500}, sim.Vec{X: 83500, Y: 18500})
	r.complete(2, barracks)
	before := r.view(2).Economy
	u, ok := r.c.Unit("SY.rifle")
	if !ok || u.Cost != 250000 { t.Fatal("canonical concealed control price changed") }
	r.accept(2, sim.Order{Kind: "train", Entities: []sim.ID{barracks}, Type: "SY.rifle"})
	after := r.view(2).Economy
	if after.Credits != before.Credits-u.Cost+after.Income-before.Income { t.Fatal("real concealed control Train not paid") }
	r.paid[2] += u.Cost
	r.wait(600, "ordinary paid rifle", func() bool { return r.typeID(2, "SY.rifle") != 0 })
	rifle := r.typeID(2, "SY.rifle")
	r.move(2, rifle, sim.Vec{X: 20500, Y: 41500}, 2400)
	r.accept(2, sim.Order{Kind: "hold", Entities: []sim.ID{rifle}})
	r.move(2, otherRig, sim.Vec{X: 14500, Y: 42500}, 2400)
	r.wait(160, "natural SY cover concealment", func() bool { return r.own(2, rifle).Concealed })
	center := sim.Vec{X: 14500, Y: 44500}
	for _, player := range []sim.PlayerID{1, 3} {
		v := r.view(player)
		if radarPulsePublicTile(v, center, false) || radarPulsePublicTile(v, center, true) { t.Fatal("unknown-center precondition absent; setup exposed it") }
		if _, found := r.actor(player, otherRig); found { t.Fatal("ordinary target already visible before scan") }
		if _, found := r.actor(player, rifle); found { t.Fatal("concealed target already disclosed") }
	}
	hpRig, hpRifle := r.own(2, otherRig).Private.HP, r.own(2, rifle).Private.HP
	energy := r.view(1).Economy.Energy
	result := r.batch(1, []sim.Order{r.pulse(center, radar)}, true)[0]
	r.assertCast(energy, result, radar, center)
	for _, player := range []sim.PlayerID{1, 3} {
		if !radarPulsePublicTile(r.view(player), center, false) || !radarPulsePublicTile(r.view(player), sim.Vec{X: 14500, Y: 32500}, false) || radarPulsePublicTile(r.view(player), sim.Vec{X: 14500, Y: 31500}, false) { t.Fatal("team scan disk boundary changed") }
		if _, found := r.actor(player, otherRig); !found { t.Fatal("scan did not reveal an ordinary unseen actor to the living team") }
		if _, found := r.actor(player, rifle); found { t.Fatal("scan granted concealment detection") }
		if !r.zone(player, center, result.Tick, result.Tick+120) { t.Fatal("team scan effect absent") }
	}
	if !r.zone(2, center, result.Tick, result.Tick+120) { t.Fatal("nearby opponent did not receive existing local scan effect") }
	for _, event := range r.view(2).Events { if event.Kind == "radar_pulse" { t.Fatal("team cast source leaked to enemy event stream") } }
	if r.own(2, otherRig).Private.HP != hpRig || r.own(2, rifle).Private.HP != hpRifle { t.Fatal("Pulse caused damage") }
	r.advance(60)
	r.checkpoint()
	r.advance(59)
	if !r.zone(1, center, result.Tick, result.Tick+120) { t.Fatal("scan expired before six seconds") }
	r.advance(1)
	for _, player := range []sim.PlayerID{1, 3} {
		if r.zone(player, center, result.Tick, result.Tick+120) || radarPulsePublicTile(r.view(player), center, false) || !radarPulsePublicTile(r.view(player), center, true) { t.Fatal("scan duration or explored-memory preservation changed") }
		if _, found := r.actor(player, otherRig); found { t.Fatal("scan left permanent targeting vision") }
		if _, found := r.actor(player, rifle); found { t.Fatal("concealed actor leaked after scan") }
	}
	if r.own(2, otherRig).Private.HP != hpRig || r.own(2, rifle).Private.HP != hpRifle { t.Fatal("scan lifetime caused damage") }
	r.finish()
}

func TestRadarPulsePublicPaidReadySourceAndGuards(t *testing.T) {
	r := newRadarPulsePublicRun(t)
	rig, power, _ := r.infrastructure()
	first := r.radar(rig, false, true)
	second := r.radar(rig, true, false)
	center := sim.Vec{X: 14500, Y: 44500}
	r.reject(r.pulse(center, second), "radar_inactive")
	r.complete(1, second)
	r.wait(4000, "ordinary Energy cap", func() bool { return r.view(1).Economy.Energy == 100000 })
	if first >= second { t.Fatal("public creation order did not provide stable source IDs") }
	hq := r.typeID(1, "hq")
	advertised, err := r.e.CommandAffordances(1, []sim.ID{rig, first, second})
	if err != nil { t.Fatal(err) }
	for _, a := range advertised.Entities {
		want := a.ID == first || a.ID == second
		if slices.Contains(a.Abilities, "radar_pulse") != want { t.Fatal("static radar ability support changed") }
	}
	mixed := r.pulse(center, second, rig, hq, first)
	hash := r.e.Hash()
	preview, err := r.e.PreviewOrders(1, []sim.Order{mixed})
	if err != nil || len(preview) != 1 || !preview[0].Accepted { t.Fatalf("integrated mixed first-ready Preview failed: %+v %v", preview, err) }
	if r.e.Hash() != hash { t.Fatal("owned readiness advice mutated the live engine") }
	energy := r.view(1).Economy.Energy
	result := r.accept(1, mixed)
	r.assertCast(energy, result, first, center)
	if radarPulsePublicCooldown(r.own(1, second)) != 0 { t.Fatal("one cast cooled every selected radar") }
	energy = r.view(1).Economy.Energy
	result = r.accept(1, r.pulse(center, first, second))
	r.assertCast(energy, result, second, center)
	r.reject(r.pulse(center, first), "cooldown")
	// The combined mixed-group normalizer rejects an incapable-only source
	// before the radar-specific readiness helper runs.
	r.reject(r.pulse(center, rig), "unsupported_ability")
	r.reject(r.pulse(sim.Vec{X: 14500, Y: 44499}, first), "out_of_range")
	r.reject(r.pulse(sim.Vec{X: -1, Y: 44500}, first), "invalid_target")
	invalid := r.pulse(center, first)
	invalid.Target = hq
	r.reject(invalid, "invalid_target")
	invalid = r.pulse(center, first)
	invalid.Points = []sim.Vec{center}
	r.reject(invalid, "invalid_target")
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{first}, Index: 0})
	r.reject(r.pulse(center, first), "radar_inactive")
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{first}, Index: 1})
	until := radarPulsePublicCooldown(r.own(1, first))
	if until <= r.e.Tick()+1 { t.Fatal("nonvacuous cooldown boundary absent") }
	r.advance(uint32(until-r.e.Tick()-1))
	energy = r.view(1).Economy.Energy
	result = r.accept(1, r.pulse(center, first))
	if result.Tick != until { t.Fatal("cooldown was not tested at its exact ordinary boundary") }
	r.assertCast(energy, result, first, center)
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{first}, Index: 0})
	oldFirst := radarPulsePublicCooldown(r.own(1, first))
	energy = r.view(1).Economy.Energy
	result = r.accept(1, r.pulse(center, first, second))
	r.assertCast(energy, result, second, center)
	if radarPulsePublicCooldown(r.own(1, first)) != oldFirst { t.Fatal("disabled source displaced/cooldown-mutated the later ready radar") }
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{first}, Index: 1})
	// Both orders execute before recalculate. This must use current structures,
	// not stale cached LowPower from the beginning of the same command packet.
	before := r.view(1)
	oldCD := slices.Clone(r.own(1, first).Private.Cooldowns)
	results := r.batch(1, []sim.Order{{Kind: "power", Entities: []sim.ID{power}, Index: 0}, r.pulse(center, first)}, false)
	if !results[0].Accepted || results[1].Accepted || results[1].Code != "insufficient_power" { t.Fatalf("same-packet Power-off then Pulse used stale power: %+v", results) }
	if r.view(1).Economy.PowerDemand <= r.view(1).Economy.PowerCapacity { t.Fatal("actual low-power fixture precondition absent") }
	if r.view(1).Economy.Energy != r.energyAfter(before.Economy.Energy, 0) || !reflect.DeepEqual(r.own(1, first).Private.Cooldowns, oldCD) || !reflect.DeepEqual(r.view(1).Zones, before.Zones) { t.Fatal("power-rejected Pulse mutated its payment/cooldown/scan") }
	for _, event := range r.view(1).Events { if event.Kind == "radar_pulse" { t.Fatal("power-rejected Pulse emitted success") } }
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{power}, Index: 1})
	r.advance(60)
	r.checkpoint()
	r.advance(180)
	r.finish()
}

func TestRadarPulsePublicPaidEnergyAndLegacyScan(t *testing.T) {
	r := newRadarPulsePublicRun(t)
	rig, _, _ := r.infrastructure()
	first, second := r.radar(rig, false, true), r.radar(rig, true, true)
	r.wait(4000, "ordinary Energy cap", func() bool { return r.view(1).Economy.Energy == 100000 })
	hq := r.typeID(1, "hq")
	before := r.view(1).Economy.Energy
	legacy := r.accept(1, sim.Order{Kind: "ability", Entities: []sim.ID{hq}, Type: "recon_sweep", Position: r.own(1, hq).Position})
	if r.view(1).Economy.Energy != r.energyAfter(before, 35000) { t.Fatal("legacy ReconSweep cost changed") }
	found := false
	for _, zone := range r.view(1).Zones {
		if zone.Kind == "scan" && zone.Radius == 9000 && zone.Start == legacy.Tick+40 && zone.Until == legacy.Tick+200 { found = true }
	}
	if !found { t.Fatal("legacy delayed scan timing changed") }
	center := sim.Vec{X: 14500, Y: 44500}
	before = r.view(1).Economy.Energy
	result := r.accept(1, r.pulse(center, first))
	r.assertCast(before, result, first, center)
	before = r.view(1).Economy.Energy
	result = r.accept(1, r.pulse(center, second))
	r.assertCast(before, result, second, center)
	r.accept(1, sim.Order{Kind: "power", Entities: []sim.ID{hq}, Index: 0})
	energy := r.view(1).Economy.Energy
	if energy >= 25000 || r.view(1).Economy.PowerDemand > r.view(1).Economy.PowerCapacity { t.Fatal("naturally spent fully-powered energy rejection fixture absent") }
	until := max(radarPulsePublicCooldown(r.own(1, first)), radarPulsePublicCooldown(r.own(1, second)))
	r.advance(uint32(until-r.e.Tick()))
	if r.view(1).Economy.Energy != energy { t.Fatal("disabled HQ still regenerated Energy") }
	r.reject(r.pulse(center, first, second), "insufficient_energy")
	r.checkpoint()
	r.advance(180)
	r.finish()
}
