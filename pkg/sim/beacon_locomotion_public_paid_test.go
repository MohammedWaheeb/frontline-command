package sim_test

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// This new backend input is shared verbatim by the red and candidate overlays.
// It changes no shipping map. Both players start normally and pay for every
// actor beyond New's HQ/rig; no state mutation or practice command is used.
func beaconPublicPaidMap() content.Map {
	m := content.Map{
		ID: "beacon-public-paid-fixture", Title: "Beacon paid-command backend geometry",
		Author: "backend acceptance fixture", Version: "1", FormatVersion: 1,
		Ruleset: "standard-v2", Width: 64, Height: 64,
		Spawns: []content.Spawn{
			{Position: sim.Vec{X: 8000, Y: 8000}, Team: 1},
			{Position: sim.Vec{X: 8000, Y: 56000}, Team: 2},
		},
		Fields: []content.Field{
			{ID: 1, Position: sim.Vec{X: 32000, Y: 10000}, Credits: 36000000},
			{ID: 2, Position: sim.Vec{X: 32000, Y: 54000}, Credits: 36000000},
		},
		Shipment: sim.Vec{X: 32000, Y: 32000},
	}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	// Both starts and all mandatory map objects remain connected on the left.
	// The isolated right side supplies an ordinary unreachable Move intention.
	for y := int32(0); y < m.Height; y++ {
		m.Tiles[y*m.Width+36].Terrain = "cliff"
	}
	for y := int32(31); y <= 33; y++ {
		for x := int32(30); x <= 32; x++ {
			m.Tiles[y*m.Width+x].Terrain = "cover"
		}
	}
	return m
}

type beaconPublicPaidInput struct {
	Player sim.PlayerID `json:"player"`
	Sequence uint32 `json:"sequence"`
	Order sim.Order `json:"order"`
	Receipt sim.OrderResult `json:"receipt"`
}

type beaconPublicPaidRun struct {
	t *testing.T
	c *content.Catalog
	e *sim.Engine
	twin *sim.Engine
	replay *sim.Replay
	config sim.Config
	sequence map[sim.PlayerID]uint32
	inputs []beaconPublicPaidInput
	midpoint sim.Tick
	samples []sim.View
}

func newBeaconPublicPaidRun(t *testing.T) *beaconPublicPaidRun {
	t.Helper()
	c := content.MustBase()
	cfg := sim.Config{Map: beaconPublicPaidMap(), Seed: 390701, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "Paid observer", Faction: "IR", Team: 1, Controller: "human"},
		{ID: 2, Name: "Paid control", Faction: "SY", Team: 2, Controller: "human"},
	}}
	e, err := sim.New(c, cfg)
	if err != nil { t.Fatal(err) }
	replay, err := sim.NewReplay(e)
	if err != nil { t.Fatal(err) }
	r := &beaconPublicPaidRun{t: t, c: c, e: e, replay: replay, config: cfg, sequence: map[sim.PlayerID]uint32{}}
	t.Cleanup(r.writeEvidence)
	r.advance(100) // The ordinary five-second countdown is never bypassed.
	if r.view(1).Countdown != 0 || r.view(1).Economy.Credits != 6000000 {
		t.Fatal("normal countdown/start funds changed")
	}
	return r
}

func (r *beaconPublicPaidRun) view(player sim.PlayerID) sim.View {
	r.t.Helper()
	v, ok := r.e.PlayerView(player)
	if !ok { r.t.Fatalf("public player view %d absent", player) }
	return v
}

func (r *beaconPublicPaidRun) actor(player sim.PlayerID, id sim.ID) (sim.EntityView, bool) {
	for _, v := range r.view(player).Entities {
		if v.ID == id { return v, true }
	}
	return sim.EntityView{}, false
}

func (r *beaconPublicPaidRun) own(player sim.PlayerID, id sim.ID) sim.EntityView {
	r.t.Helper()
	v, ok := r.actor(player, id)
	if !ok || v.Owner != player || v.Private == nil { r.t.Fatalf("owned actor %d absent at tick %d", id, r.e.Tick()) }
	return v
}

func (r *beaconPublicPaidRun) typeID(player sim.PlayerID, kind string) sim.ID {
	for _, v := range r.view(player).Entities {
		if v.Owner == player && v.Type == kind && v.Complete { return v.ID }
	}
	return 0
}

func (r *beaconPublicPaidRun) advance(n uint32) {
	r.t.Helper()
	for range n {
		r.e.Advance()
		if r.twin != nil { r.twin.Advance() }
		if r.e.Tick()%600 == 0 {
			if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) }
			r.samples = append(r.samples, r.view(1), r.view(2))
		}
		if r.e.Outcome().Finished { r.t.Fatalf("unexpected match completion at tick %d", r.e.Tick()) }
	}
}

func (r *beaconPublicPaidRun) wait(limit uint32, description string, ready func() bool) {
	r.t.Helper()
	for i := uint32(0); i <= limit; i++ {
		if ready() { return }
		if i < limit { r.advance(1) }
	}
	r.t.Fatalf("%s did not complete within %d ordinary ticks (tick %d)", description, limit, r.e.Tick())
}

func (r *beaconPublicPaidRun) issue(player sim.PlayerID, order sim.Order) sim.OrderResult {
	r.t.Helper()
	r.sequence[player]++
	seq := r.sequence[player]
	// Detach all order slices for the auxiliary evidence stream as well.
	order.Entities = slices.Clone(order.Entities)
	order.Points = slices.Clone(order.Points)
	if err := r.e.Submit(player, seq, []sim.Order{order}); err != nil { r.t.Fatalf("Submit %s: %v", order.Kind, err) }
	if r.twin != nil {
		if err := r.twin.Submit(player, seq, []sim.Order{order}); err != nil { r.t.Fatal(err) }
	}
	r.advance(1)
	for _, result := range r.view(player).Results {
		if result.Player == player && result.Sequence == seq && result.Index == 0 {
			r.inputs = append(r.inputs, beaconPublicPaidInput{player, seq, order, result})
			return result
		}
	}
	r.t.Fatalf("missing receipt for player %d sequence %d", player, seq)
	return sim.OrderResult{}
}

func (r *beaconPublicPaidRun) accept(player sim.PlayerID, order sim.Order) sim.OrderResult {
	r.t.Helper()
	result := r.issue(player, order)
	if !result.Accepted || result.Code != "ok" { r.t.Fatalf("%s rejected: %+v", order.Kind, result) }
	return result
}

func (r *beaconPublicPaidRun) infrastructure(player sim.PlayerID) sim.ID {
	r.t.Helper()
	faction, y, by := "IR", int32(8000), int32(10000)
	if player == 2 { faction, y, by = "SY", 56000, 54000 }
	rig := r.typeID(player, faction+".rig")
	if rig == 0 { r.t.Fatal("normal starting rig absent") }
	for _, build := range []struct{ kind string; point sim.Vec }{
		{"power", sim.Vec{X: 13000, Y: y}},
		{"barracks", sim.Vec{X: 13500, Y: by}},
	} {
		before := r.view(player).Economy.Credits
		rule, ok := r.c.Building(build.kind)
		if !ok { r.t.Fatal("building rule absent") }
		r.accept(player, sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: build.kind, Position: build.point})
		if r.view(player).Economy.Credits != before-rule.Cost { r.t.Fatal("ordinary construction did not charge catalog cost") }
		r.wait(1200, "paid "+build.kind, func() bool { return r.typeID(player, build.kind) != 0 })
	}
	return r.typeID(player, "barracks")
}

func (r *beaconPublicPaidRun) train(player sim.PlayerID, producer sim.ID, kind string) sim.ID {
	r.t.Helper()
	before := r.view(player).Economy.Credits
	u, ok := r.c.Unit(kind)
	if !ok { r.t.Fatal("paid unit rule absent") }
	r.accept(player, sim.Order{Kind: "train", Entities: []sim.ID{producer}, Type: kind})
	if r.view(player).Economy.Credits != before-u.Cost { r.t.Fatal("ordinary training did not charge catalog cost") }
	r.wait(600, "paid "+kind, func() bool { return r.typeID(player, kind) != 0 })
	return r.typeID(player, kind)
}

func beaconPublicPaidDist2(a, b sim.Vec) int64 {
	dx, dy := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y)
	return dx*dx+dy*dy
}

func (r *beaconPublicPaidRun) move(player sim.PlayerID, id sim.ID, point sim.Vec, limit uint32) {
	r.t.Helper()
	r.accept(player, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point})
	r.wait(limit, "ordinary Move", func() bool {
		v := r.own(player, id)
		return len(v.Private.Orders) == 0 && beaconPublicPaidDist2(v.Position, point) < 250*250
	})
}

func (r *beaconPublicPaidRun) cast(observer sim.ID, point sim.Vec) (sim.ID, sim.Tick) {
	r.t.Helper()
	old := r.typeID(1, "IR.beacon")
	before := r.view(1).Economy.Credits
	receipt := r.accept(1, sim.Order{Kind: "ability", Entities: []sim.ID{observer}, Type: "beacon", Position: point})
	until := r.own(1, observer).ChannelUntil
	if until != receipt.Tick+80 || r.view(1).Economy.Credits != before-200000 { r.t.Fatal("paid four-second beacon channel changed") }
	r.wait(80, "paid beacon channel", func() bool { return r.e.Tick() == until })
	id := r.typeID(1, "IR.beacon")
	if id == 0 || id == old { r.t.Fatal("ordinary channel did not create/replace beacon") }
	b := r.own(1, id)
	if b.Position != point || b.FootprintWidth != 0 || b.FootprintHeight != 0 || b.Private.HP != 100000 || b.Private.MaxHP != 100000 {
		r.t.Fatalf("passive circular 100HP beacon changed: %+v", b)
	}
	u, _ := r.c.Unit(b.Type)
	if u.Radius != 300 || u.Speed != 0 || u.Cost != 200000 || u.Armor != "structure" || u.Weapon != "" { r.t.Fatal("passive combat definition changed") }
	ranges := b.Private.Ranges
	if ranges == nil || ranges.SightRadius != 5000 || ranges.DetectionRadius != 3000 || ranges.BuildRadius != 0 {
		r.t.Fatalf("beacon sight/generic proximity/build radius changed: %+v", ranges)
	}
	found := false
	for _, effect := range b.Effects {
		if effect.Kind == "temporary" && effect.Until == until+900 { found = true }
	}
	if !found || b.Concealed { r.t.Fatal("beacon temporary lifetime/concealment changed") }
	if r.view(1).Economy.Credits != before-200000 { r.t.Fatal("beacon channel refunded or generated income") }
	return id, until
}

func (r *beaconPublicPaidRun) checkpoint() {
	r.t.Helper()
	if r.midpoint != 0 { r.t.Fatal("duplicate actual midpoint") }
	save, err := r.replay.CaptureCheckpoint(r.e)
	if err != nil { r.t.Fatal(err) }
	r.midpoint = r.e.Tick()
	r.twin, err = sim.Restore(r.c, save)
	if err != nil || r.twin.Hash() != r.e.Hash() { r.t.Fatalf("actual midpoint restore: %v", err) }
}

func (r *beaconPublicPaidRun) finish() {
	r.t.Helper()
	if r.midpoint == 0 || r.midpoint >= r.e.Tick() { r.t.Error("nonvacuous actual midpoint continuation missing"); return }
	if r.twin.Hash() != r.e.Hash() { r.t.Error("midpoint Save/Restore continuation diverged") }
	save, err := r.e.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.c, save)
	if err != nil || restored.Hash() != r.e.Hash() { r.t.Fatalf("final Save/Restore: %v", err) }
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) }
	raw, err := r.replay.Encode()
	if err != nil { r.t.Fatal(err) }
	for _, mode := range []string{"full", "actual_midpoint"} {
		replay, err := sim.DecodeReplay(raw)
		if err != nil { r.t.Fatal(err) }
		if mode == "full" { replay.Checkpoints = nil } else {
			kept := []sim.ReplayCheckpoint{}
			for _, cp := range replay.Checkpoints { if cp.Tick == r.midpoint { kept = append(kept, cp) } }
			if len(kept) != 1 { r.t.Fatal("actual midpoint checkpoint missing") }
			replay.Checkpoints = kept
		}
		played, err := replay.Seek(r.c, r.e.Tick())
		if err != nil || played.Hash() != r.e.Hash() { r.t.Errorf("%s replay diverged: %v", mode, err) }
	}
	r.t.Logf("paid public inputs=%d actual midpoint=%d final tick=%d hash=%s", len(r.inputs), r.midpoint, r.e.Tick(), r.e.Hash())
}

func (r *beaconPublicPaidRun) writeEvidence() {
	dir := os.Getenv("FRONTLINE_BEACON_LOCOMOTION_EVIDENCE")
	if dir == "" { return }
	dir = filepath.Join(dir, strings.ReplaceAll(r.t.Name(), "/", "__"))
	if err := os.MkdirAll(dir, 0755); err != nil { r.t.Errorf("evidence directory: %v", err); return }
	write := func(name string, data []byte, err error) {
		if err != nil { r.t.Errorf("evidence %s: %v", name, err); return }
		if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil { r.t.Error(err) }
	}
	jsonWrite := func(name string, value any) { data, err := json.MarshalIndent(value, "", "  "); write(name, data, err) }
	jsonWrite("public-inputs.json", r.inputs)
	jsonWrite("config.json", r.config)
	jsonWrite("public-samples.json", r.samples)
	jsonWrite("final-public.json", []sim.View{r.view(1), r.view(2)})
	jsonWrite("result.json", map[string]any{"failed": r.t.Failed(), "tick": r.e.Tick(), "actual_midpoint": r.midpoint, "state_hash": r.e.Hash()})
	save, err := r.e.Save(); write("final.save.json", save, err)
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Error(err); return }
	replay, err := r.replay.Encode(); write("actual.replay.json", replay, err)
}

func TestBeaconLocomotionPublicPaidCasterAndTransit(t *testing.T) {
	r := newBeaconPublicPaidRun(t)
	producer := r.infrastructure(1)
	observer := r.train(1, producer, "IR.recon")
	peer := r.train(1, producer, "IR.rifle")
	r.move(1, observer, sim.Vec{X: 24000, Y: 24000}, 500)
	point := r.own(1, observer).Position
	beacon, spawned := r.cast(observer, point) // Accepted ordinary own-center cast.
	r.checkpoint()
	defer r.finish()
	r.move(1, observer, sim.Vec{X: point.X+4000, Y: point.Y}, 150)
	if beaconPublicPaidDist2(r.own(1, observer).Position, point) < 2500*2500 { t.Fatal("caster made no substantial physical departure") }
	// A separately purchased actor can end inside and depart through the circle.
	r.move(1, peer, point, 500)
	if beaconPublicPaidDist2(r.own(1, peer).Position, point) >= 250*250 { t.Fatal("third party could not enter beacon circle") }
	r.move(1, peer, sim.Vec{X: point.X-4000, Y: point.Y}, 150)
	if beaconPublicPaidDist2(r.own(1, peer).Position, point) < 2500*2500 { t.Fatal("third party made no physical departure") }
	if b := r.own(1, beacon); b.Position != point || b.Private.HP != 100000 { t.Fatal("walking through beacon changed its position/HP") }
	if r.e.Tick() >= spawned+899 { t.Fatal("movement witness overran lifetime boundary") }
	r.advance(uint32(spawned+899-r.e.Tick()))
	if _, ok := r.actor(1, beacon); !ok { t.Fatal("beacon expired before 45 seconds") }
	r.advance(1)
	if _, ok := r.actor(1, beacon); ok { t.Fatal("beacon survived exact 45-second expiry") }
}

// Inspect the owner save without mutating or restoring the live engine. These
// fields cover unsupported actors' task, aim, channel and stance; their ordinary
// lifetime effect remains governed by the unchanged paid course below.
func beaconPublicPaidSavedOrderState(t *testing.T, e *sim.Engine, id sim.ID) []byte {
	t.Helper()
	data, err := e.Save()
	if err != nil { t.Fatal(err) }
	var envelope struct { State json.RawMessage `json:"state"` }
	if err := json.Unmarshal(data, &envelope); err != nil { t.Fatal(err) }
	type actorOrders struct {
		ID sim.ID `json:"id"`
		Position sim.Vec `json:"position"`
		Orders []sim.Order `json:"orders"`
		Target sim.ID `json:"target"`
		AimUntil sim.Tick `json:"aim_until"`
		Channel string `json:"channel"`
		ChannelUntil sim.Tick `json:"channel_until"`
		Stance string `json:"stance"`
	}
	var state struct { Entities []actorOrders `json:"entities"` }
	if err := json.Unmarshal(envelope.State, &state); err != nil { t.Fatal(err) }
	for _, actor := range state.Entities {
		if actor.ID == id {
			encoded, err := json.Marshal(actor)
			if err != nil { t.Fatal(err) }
			return encoded
		}
	}
	t.Fatalf("saved order state for actor %d absent", id)
	return nil
}

func TestBeaconLocomotionPublicPaidImmobileOrders(t *testing.T) {
	r := newBeaconPublicPaidRun(t)
	observer := r.train(1, r.infrastructure(1), "IR.recon")
	r.move(1, observer, sim.Vec{X: 24000, Y: 24000}, 500)
	point := r.own(1, observer).Position
	beacon, _ := r.cast(observer, point)
	r.checkpoint()
	defer r.finish()
	affordances, err := r.e.CommandAffordances(1, []sim.ID{beacon, observer})
	if err != nil { t.Fatal(err) }
	for _, a := range affordances.Entities {
		if a.ID == beacon {
			for _, kind := range []string{"move", "attack_move", "patrol", "guard", "escort", "aggressive", "return"} {
				if slices.Contains(a.Commands, kind) { t.Errorf("passive sensor advertised impossible %s: %v", kind, a.Commands) }
			}
			for _, kind := range []string{"stop", "hold"} {
				if !slices.Contains(a.Commands, kind) { t.Errorf("passive sensor lost %s: %v", kind, a.Commands) }
			}
		} else if !slices.Contains(a.Commands, "move") || !slices.Contains(a.Commands, "patrol") {
			t.Fatal("ordinary observer lost movement affordances")
		}
	}
	goal := sim.Vec{X: point.X+3000, Y: point.Y}
	orders := []sim.Order{
		{Kind: "move", Entities: []sim.ID{beacon}, Position: goal},
		{Kind: "attack_move", Entities: []sim.ID{beacon}, Position: goal},
		{Kind: "patrol", Entities: []sim.ID{beacon}, Position: goal, Points: []sim.Vec{point, goal}},
		{Kind: "guard", Entities: []sim.ID{beacon}, Target: observer, Position: goal},
		{Kind: "escort", Entities: []sim.ID{beacon}, Target: observer},
		{Kind: "aggressive", Entities: []sim.ID{beacon}, Position: goal},
		{Kind: "move", Entities: []sim.ID{beacon}, Position: goal, Queued: true},
	}
	credits := r.view(1).Economy.Credits
	for _, order := range orders {
		beforeHash := r.e.Hash()
		preview, err := r.e.PreviewOrders(1, []sim.Order{order})
		if err != nil { t.Fatal(err) }
		if len(preview) != 1 || preview[0].Accepted || preview[0].Code != "immobile_unit" || len(preview[0].EligibleEntities) != 0 || preview[0].AppliedCount != 0 { t.Errorf("passive %s advice accepted/wrong reason: %+v", order.Kind, preview) }
		if r.e.Hash() != beforeHash { t.Fatal("advice mutated authoritative state") }
		beforeOrders := slices.Clone(r.own(1, observer).Private.Orders)
		beforePassive := beaconPublicPaidSavedOrderState(t, r.e, beacon)
		result := r.issue(1, order)
		if result.Accepted || result.Code != "immobile_unit" || len(result.EligibleEntities) != 0 || result.AppliedCount != 0 { t.Errorf("passive %s executor accepted/wrong reason: %+v", order.Kind, result) }
		if !reflect.DeepEqual(r.own(1, observer).Private.Orders, beforeOrders) || !reflect.DeepEqual(beaconPublicPaidSavedOrderState(t, r.e, beacon), beforePassive) {
			t.Error("single passive rejection changed actor orders, aim, channel or stance")
		}
		if r.own(1, beacon).Position != point || r.view(1).Economy.Credits != credits { t.Fatal("rejected passive order changed position or credits") }
	}
	for _, kind := range []string{"stop", "hold"} {
		r.accept(1, sim.Order{Kind: kind, Entities: []sim.ID{beacon}})
	}
	// The later user contract accepts capable actors in a mixed selection.
	// The passive beacon must retain the admitted Hold, aim, channel and stance.
	for _, order := range []sim.Order{
		{Kind: "move", Entities: []sim.ID{observer, beacon}, Position: goal},
		{Kind: "move", Entities: []sim.ID{beacon, observer}, Position: sim.Vec{X: goal.X+2000, Y: goal.Y}, Queued: true},
	} {
		beforeHash := r.e.Hash()
		beforePassive := beaconPublicPaidSavedOrderState(t, r.e, beacon)
		beforeOrders := slices.Clone(r.own(1, observer).Private.Orders)
		preview, err := r.e.PreviewOrders(1, []sim.Order{order})
		if err != nil { t.Fatal(err) }
		if len(preview) != 1 || !preview[0].Accepted || preview[0].Code != "ok" || !slices.Equal(preview[0].EligibleEntities, []sim.ID{observer}) || preview[0].AppliedCount != 0 {
			t.Fatalf("mixed mobile advice lost capable-only semantics: %+v", preview)
		}
		if r.e.Hash() != beforeHash { t.Fatal("mixed advice mutated authoritative state") }
		result := r.accept(1, order)
		if !slices.Equal(result.EligibleEntities, []sim.ID{observer}) || result.AppliedCount != 1 { t.Fatalf("mixed mobile receipt included passive actor: %+v", result) }
		orders := r.own(1, observer).Private.Orders
		if len(orders) == 0 || orders[len(orders)-1].Kind != "move" || orders[len(orders)-1].Position != order.Position || orders[len(orders)-1].Queued != order.Queued {
			t.Fatal("capable observer did not receive the exact mixed movement intention", orders)
		}
		if order.Queued && (len(orders) != len(beforeOrders)+1 || !reflect.DeepEqual(orders[:len(beforeOrders)], beforeOrders)) { t.Fatal("mixed queued movement discarded capable actor's earlier task", beforeOrders, orders) }
		if !reflect.DeepEqual(beaconPublicPaidSavedOrderState(t, r.e, beacon), beforePassive) || r.own(1, beacon).Position != point || r.view(1).Economy.Credits != credits {
			t.Fatal("mixed movement changed unsupported beacon's order, aim, channel, stance, position or credits")
		}
	}
	r.move(1, observer, goal, 150)
}

func TestBeaconLocomotionPublicPaidRealBarriers(t *testing.T) {
	r := newBeaconPublicPaidRun(t)
	producer := r.infrastructure(1)
	observer := r.train(1, producer, "IR.recon")
	peer := r.train(1, producer, "IR.rifle")
	r.move(1, observer, sim.Vec{X: 24000, Y: 24000}, 500)
	anchor := r.own(1, observer).Position
	r.accept(1, sim.Order{Kind: "hold", Entities: []sim.ID{observer}})
	r.checkpoint()
	defer r.finish()
	start := r.own(1, peer).Position
	r.accept(1, sim.Order{Kind: "move", Entities: []sim.ID{peer}, Position: anchor})
	for range 500 {
		r.advance(1)
		if beaconPublicPaidDist2(r.own(1, peer).Position, r.own(1, observer).Position) < 700*700 {
			t.Fatal("real infantry circular footprints overlapped")
		}
	}
	if beaconPublicPaidDist2(r.own(1, peer).Position, start) < 3000*3000 { t.Fatal("real footprint control made no progress") }
	// An ordinary route crosses the HQ/power centerline without entering either.
	r.move(1, peer, sim.Vec{X: 4000, Y: 8000}, 600)
	r.accept(1, sim.Order{Kind: "move", Entities: []sim.ID{peer}, Position: sim.Vec{X: 18000, Y: 8000}})
	for range 400 {
		r.advance(1)
		point := r.own(1, peer).Position
		for _, b := range r.view(1).Entities {
			if b.Owner != 1 || b.FootprintWidth == 0 { continue }
			dx, dy := int64(point.X-b.Position.X), int64(point.Y-b.Position.Y)
			if dx < 0 { dx = -dx }; if dy < 0 { dy = -dy }
			dx = max(0, dx-int64(b.FootprintWidth)*500)
			dy = max(0, dy-int64(b.FootprintHeight)*500)
			if dx*dx+dy*dy < 350*350 { t.Fatalf("real structure footprint entered: %s", b.Type) }
		}
	}
	if beaconPublicPaidDist2(r.own(1, peer).Position, sim.Vec{X: 18000, Y: 8000}) >= 250*250 { t.Fatal("structure barrier route did not finish") }
	r.accept(1, sim.Order{Kind: "move", Entities: []sim.ID{peer}, Position: sim.Vec{X: 45000, Y: 32500}})
	for range 80 {
		r.advance(1)
		if r.own(1, peer).Position.X+350 > 36000 { t.Fatal("cliff barrier crossed") }
	}
	if len(r.own(1, peer).Private.Orders) == 0 { t.Fatal("unreachable terrain control lost its intended Move") }
}

func TestBeaconLocomotionPublicPaidCombatGeometry(t *testing.T) {
	for _, margin := range []int32{0, 80} {
		name := "radius300_boundary_hit"
		if margin != 0 { name = "outside_radius300_no_hit" }
		t.Run(name, func(t *testing.T) {
			r := newBeaconPublicPaidRun(t)
			observer := r.train(1, r.infrastructure(1), "IR.recon")
			rifle := r.train(2, r.infrastructure(2), "SY.rifle")
			r.move(2, rifle, sim.Vec{X: 30500, Y: 24500}, 650)
			r.accept(2, sim.Order{Kind: "hold", Entities: []sim.ID{rifle}})
			q := r.own(2, rifle).Position
			u, _ := r.c.Unit("SY.rifle")
			w, _ := r.c.Weapon(u.Weapon)
			b, _ := r.c.Unit("IR.beacon")
			point := sim.Vec{X: q.X-w.MaxRange-u.Radius-b.Radius-margin, Y: q.Y}
			r.move(1, observer, sim.Vec{X: point.X-800, Y: point.Y}, 550)
			beacon, spawned := r.cast(observer, point)
			r.checkpoint()
			defer r.finish()
			r.advance(10)
			wantHP := int64(100000)
			if margin == 0 { wantHP -= w.Damage*int64(r.c.Multiplier(w.Kind, b.Armor))/1000 }
			if hp := r.own(1, beacon).Private.HP; hp != wantHP { t.Fatalf("combat circle boundary HP=%d want=%d", hp, wantHP) }
			if r.own(2, rifle).Position != q { t.Fatal("Hold moved shooter at combat boundary") }
			if margin == 0 {
				// Ordinary direct fire removes the 100HP target before its expiry.
				r.wait(840, "ordinary destruction of 100HP beacon", func() bool { _, alive := r.actor(1, beacon); return !alive })
				if r.e.Tick() >= spawned+900 { t.Fatal("combat destruction confused with lifetime expiry") }
			} else {
				r.advance(30)
				if r.own(1, beacon).Private.HP != 100000 { t.Fatal("out-of-range passive target took damage") }
			}
		})
	}
}

func TestBeaconLocomotionPublicPaidGenericProximity(t *testing.T) {
	for _, separation := range []int32{2500, 3500} {
		name := "inside_three_tiles_revealed"
		if separation > 3000 { name = "outside_three_tiles_concealed" }
		t.Run(name, func(t *testing.T) {
			r := newBeaconPublicPaidRun(t)
			observer := r.train(1, r.infrastructure(1), "IR.recon")
			rifle := r.train(2, r.infrastructure(2), "SY.rifle")
			point := sim.Vec{X: 28000, Y: 32500}
			r.move(1, observer, sim.Vec{X: point.X-1000, Y: point.Y}, 650)
			// Target is an exact public position within the accepted 1000 range.
			// Use the observed caster X if the last 180 units were rounded away.
			point.X = r.own(1, observer).Position.X+1000
			point.Y = r.own(1, observer).Position.Y
			beacon, _ := r.cast(observer, point)
			r.checkpoint()
			defer r.finish()
			r.move(1, observer, sim.Vec{X: 16000, Y: 32500}, 350)
			r.move(2, rifle, sim.Vec{X: point.X+separation, Y: point.Y}, 650)
			q := r.own(2, rifle).Position
			if !r.config.Map.TileAt(q).Cover() { t.Fatal("paid concealment control did not enter authored fixture cover") }
			// Infantry Move forbids firing. The cliff leaves it stationary without
			// erasing the normal Move, so gunfire cannot contaminate this witness.
			r.accept(2, sim.Order{Kind: "move", Entities: []sim.ID{rifle}, Position: sim.Vec{X: 45000, Y: point.Y}})
			r.advance(160)
			actual := r.own(2, rifle)
			if actual.Position != q || len(actual.Private.Orders) == 0 || actual.Private.Orders[0].Kind != "move" {
				t.Fatal("stationary ordinary Move control changed")
			}
			wantConcealed := separation > 3000
			if actual.Concealed != wantConcealed { t.Fatalf("generic three-tile proximity concealed=%v want=%v", actual.Concealed, wantConcealed) }
			_, disclosed := r.actor(1, rifle)
			if disclosed == wantConcealed { t.Fatalf("public beacon perspective disclosure=%v concealed=%v", disclosed, wantConcealed) }
			for _, source := range r.view(1).Entities {
				if source.Owner != 1 || source.ID == beacon || source.Private == nil || source.Private.Ranges == nil { continue }
				radius := source.Private.Ranges.DetectionRadius
				if beaconPublicPaidDist2(source.Position, q) <= int64(radius)*int64(radius) { t.Fatalf("different own detector contaminated proximity witness: %s", source.Type) }
			}
			if r.own(1, beacon).Private.HP != 100000 { t.Fatal("stationary enemy fired during concealment control") }
		})
	}
}

func TestBeaconLocomotionPublicPaidReplacementAndInterruption(t *testing.T) {
	r := newBeaconPublicPaidRun(t)
	observer := r.train(1, r.infrastructure(1), "IR.recon")
	r.move(1, observer, sim.Vec{X: 24000, Y: 24000}, 500)
	point := r.own(1, observer).Position
	first, _ := r.cast(observer, point)
	r.checkpoint()
	defer r.finish()
	second, spawned := r.cast(observer, point)
	if first == second { t.Fatal("paid replacement reused old beacon") }
	if _, ok := r.actor(1, first); ok { t.Fatal("same observer retained its replaced beacon") }
	count := 0
	for _, b := range r.view(1).Entities { if b.Owner == 1 && b.Type == "IR.beacon" { count++ } }
	if count != 1 { t.Fatal("one beacon per observer changed") }
	credits := r.view(1).Economy.Credits
	r.accept(1, sim.Order{Kind: "ability", Entities: []sim.ID{observer}, Type: "beacon", Position: point})
	r.advance(20)
	r.move(1, observer, sim.Vec{X: point.X+4000, Y: point.Y}, 150)
	r.advance(80)
	if r.view(1).Economy.Credits != credits-200000 { t.Fatal("movement-interrupted cast refunded its ordinary paid cost") }
	if r.typeID(1, "IR.beacon") != second || r.own(1, second).Position != point { t.Fatal("interrupted channel replaced existing beacon") }
	if r.e.Tick() >= spawned+900 { t.Fatal("interruption witness overran replacement lifetime") }
}
