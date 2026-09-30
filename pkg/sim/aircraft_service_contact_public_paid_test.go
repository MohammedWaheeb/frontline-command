package sim_test

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// A new public backend input, not a changed shipping map or a seeded state.
// Both humans use normal New funds, countdown, HQ and rig. Every other actor
// comes from catalog-priced construction or training through Submit.
func aircraftServiceContactMap() content.Map {
	m := content.Map{
		ID: "aircraft-service-contact-public-paid", Title: "Paid scout service contact",
		Author: "backend acceptance fixture", Version: "1", FormatVersion: 1,
		Ruleset: "standard-v2", Width: 96, Height: 96,
		Spawns: []content.Spawn{
			{Position: sim.Vec{X: 18000, Y: 22000}, Team: 1},
			{Position: sim.Vec{X: 18000, Y: 78000}, Team: 2},
		},
		Fields: []content.Field{
			{ID: 1, Position: sim.Vec{X: 70000, Y: 12000}, Credits: 36000000},
			{ID: 2, Position: sim.Vec{X: 70000, Y: 84000}, Credits: 36000000},
		},
		Shipment: sim.Vec{X: 70000, Y: 48000},
	}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles { m.Tiles[i].Terrain = "open" }
	return m
}

type aircraftServiceContactInput struct {
	Player sim.PlayerID `json:"player"`
	Sequence uint32 `json:"sequence"`
	Order sim.Order `json:"order"`
	Receipt sim.OrderResult `json:"receipt"`
}

type aircraftServiceContactSample struct {
	Label string `json:"label"`
	Views []sim.View `json:"views"`
}

type aircraftServiceContactRun struct {
	t *testing.T
	c *content.Catalog
	e, twin *sim.Engine
	replay *sim.Replay
	config sim.Config
	sequence map[sim.PlayerID]uint32
	inputs []aircraftServiceContactInput
	samples []aircraftServiceContactSample
	midpoint sim.Tick
	midSave []byte
	proofs map[string]bool
}

func newAircraftServiceContactRun(t *testing.T) *aircraftServiceContactRun {
	t.Helper()
	c := content.MustBase()
	cfg := sim.Config{Map: aircraftServiceContactMap(), Seed: 482007, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "Paid scout owner", Faction: "SY", Team: 1, Controller: "human"},
		{ID: 2, Name: "Paid grounded-air attacker", Faction: "SY", Team: 2, Controller: "human"},
	}}
	e, err := sim.New(c, cfg)
	if err != nil { t.Fatal(err) }
	replay, err := sim.NewReplay(e)
	if err != nil { t.Fatal(err) }
	r := &aircraftServiceContactRun{t: t, c: c, e: e, replay: replay, config: cfg, sequence: map[sim.PlayerID]uint32{}, proofs: map[string]bool{}}
	t.Cleanup(r.writeEvidence)
	r.advance(100)
	for _, p := range []sim.PlayerID{1, 2} {
		if r.view(p).Countdown != 0 || r.view(p).Economy.Credits != 6000000 { t.Fatal("normal start changed") }
	}
	r.sample("normal_start")
	return r
}

func (r *aircraftServiceContactRun) view(player sim.PlayerID) sim.View {
	r.t.Helper()
	v, ok := r.e.PlayerView(player)
	if !ok { r.t.Fatalf("public view %d absent", player) }
	return v
}

func (r *aircraftServiceContactRun) actor(player sim.PlayerID, id sim.ID) (sim.EntityView, bool) {
	for _, v := range r.view(player).Entities { if v.ID == id { return v, true } }
	return sim.EntityView{}, false
}

func (r *aircraftServiceContactRun) own(player sim.PlayerID, id sim.ID) sim.EntityView {
	r.t.Helper()
	v, ok := r.actor(player, id)
	if !ok || v.Owner != player || v.Private == nil { r.t.Fatalf("owned actor %d absent at %d", id, r.e.Tick()) }
	return v
}

func (r *aircraftServiceContactRun) typeID(player sim.PlayerID, typ string) sim.ID {
	for _, v := range r.view(player).Entities { if v.Owner == player && v.Type == typ && v.Complete { return v.ID } }
	return 0
}

func (r *aircraftServiceContactRun) sample(label string) {
	r.samples = append(r.samples, aircraftServiceContactSample{label, []sim.View{r.view(1), r.view(2)}})
}

func (r *aircraftServiceContactRun) advance(n uint32) {
	r.t.Helper()
	for range n {
		r.e.Advance()
		if r.twin != nil { r.twin.Advance() }
		if r.e.Tick()%600 == 0 { if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) } }
		if r.e.Tick() > 16000 || r.e.Outcome().Finished { r.t.Fatalf("course bound or unexpected outcome at %d", r.e.Tick()) }
	}
}

func (r *aircraftServiceContactRun) wait(limit uint32, label string, ready func() bool) {
	r.t.Helper()
	for i := uint32(0); i <= limit; i++ {
		if ready() { return }
		if i < limit { r.advance(1) }
	}
	r.t.Fatalf("%s did not finish within %d ticks; current tick %d", label, limit, r.e.Tick())
}

func (r *aircraftServiceContactRun) accept(player sim.PlayerID, order sim.Order) sim.OrderResult {
	r.t.Helper()
	r.sequence[player]++
	sequence := r.sequence[player]
	order.Entities = slices.Clone(order.Entities)
	order.Points = slices.Clone(order.Points)
	if err := r.e.Submit(player, sequence, []sim.Order{order}); err != nil { r.t.Fatalf("Submit %s: %v", order.Kind, err) }
	if r.twin != nil { if err := r.twin.Submit(player, sequence, []sim.Order{order}); err != nil { r.t.Fatal(err) } }
	r.advance(1)
	for _, result := range r.view(player).Results {
		if result.Player == player && result.Sequence == sequence && result.Index == 0 {
			r.inputs = append(r.inputs, aircraftServiceContactInput{player, sequence, order, result})
			if !result.Accepted || result.Code != "ok" { r.t.Fatalf("%s rejected: %+v", order.Kind, result) }
			return result
		}
	}
	r.t.Fatal("ordinary order receipt missing")
	return sim.OrderResult{}
}

func aircraftServiceContactDist2(a, b sim.Vec) int64 {
	dx, dy := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y)
	return dx*dx+dy*dy
}

func (r *aircraftServiceContactRun) move(player sim.PlayerID, id sim.ID, point sim.Vec, limit uint32) {
	r.t.Helper()
	r.accept(player, sim.Order{Kind: "move", Entities: []sim.ID{id}, Position: point})
	r.wait(limit, "ordinary Move", func() bool {
		v := r.own(player, id)
		return len(v.Private.Orders) == 0 && aircraftServiceContactDist2(v.Position, point) < 250*250
	})
}

func (r *aircraftServiceContactRun) build(player sim.PlayerID, typ string, point sim.Vec) sim.ID {
	r.t.Helper()
	rig := r.typeID(player, "SY.rig")
	rule, ok := r.c.Building(typ)
	if !ok || rig == 0 { r.t.Fatal("normal building rule/rig absent") }
	before := r.view(player).Economy.Credits
	r.accept(player, sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: typ, Position: point})
	if r.view(player).Economy.Credits != before-rule.Cost { r.t.Fatal("construction did not charge its catalog cost") }
	r.wait(1400, "paid "+typ, func() bool { return r.typeID(player, typ) != 0 })
	return r.typeID(player, typ)
}

func (r *aircraftServiceContactRun) train(player sim.PlayerID, producer sim.ID, typ string) sim.ID {
	r.t.Helper()
	rule, ok := r.c.Unit(typ)
	if !ok { r.t.Fatal("normal unit rule absent") }
	before := r.view(player).Economy.Credits
	r.accept(player, sim.Order{Kind: "train", Entities: []sim.ID{producer}, Type: typ})
	if r.view(player).Economy.Credits != before-rule.Cost { r.t.Fatal("training did not charge its catalog cost") }
	r.wait(800, "paid "+typ, func() bool { return r.typeID(player, typ) != 0 })
	return r.typeID(player, typ)
}

func (r *aircraftServiceContactRun) checkpoint() {
	r.t.Helper()
	save, err := r.replay.CaptureCheckpoint(r.e)
	if err != nil { r.t.Fatal(err) }
	r.twin, err = sim.Restore(r.c, save)
	if err != nil || r.twin.Hash() != r.e.Hash() { r.t.Fatalf("actual Return midpoint Save/Restore: %v", err) }
	r.midSave, r.midpoint = slices.Clone(save), r.e.Tick()
	r.sample("actual_return_midpoint")
}

func (r *aircraftServiceContactRun) finish() {
	r.t.Helper()
	if r.midpoint == 0 || r.midpoint >= r.e.Tick() || r.twin == nil { r.t.Fatal("nonvacuous Return midpoint absent") }
	if r.twin.Hash() != r.e.Hash() { r.t.Fatal("actual midpoint continuation diverged") }
	r.proofs["actual_midpoint_save_restore_continuation"] = true
	save, err := r.e.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.c, save)
	if err != nil || restored.Hash() != r.e.Hash() { r.t.Fatalf("final Save/Restore: %v", err) }
	r.proofs["final_save_restore"] = true
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
		if err != nil || played.Hash() != r.e.Hash() { r.t.Fatalf("%s replay diverged: %v", mode, err) }
		r.proofs[mode+"_replay"] = true
	}
	r.sample("all_assertions_and_persistence_complete")
	r.t.Logf("public paid scout service/landed repair; inputs=%d midpoint=%d final=%d hash=%s", len(r.inputs), r.midpoint, r.e.Tick(), r.e.Hash())
}

func (r *aircraftServiceContactRun) writeEvidence() {
	dir := os.Getenv("FRONTLINE_AIRCRAFT_SERVICE_CONTACT_EVIDENCE")
	if dir == "" { return }
	dir = filepath.Join(dir, strings.ReplaceAll(r.t.Name(), "/", "__"))
	if err := os.MkdirAll(dir, 0755); err != nil { r.t.Errorf("evidence directory: %v", err); return }
	write := func(name string, data []byte, err error) {
		if err != nil { r.t.Errorf("evidence %s: %v", name, err); return }
		if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil { r.t.Error(err) }
	}
	jsonWrite := func(name string, value any) { data, err := json.MarshalIndent(value, "", "  "); write(name, data, err) }
	jsonWrite("config.json", r.config)
	jsonWrite("public-inputs.json", r.inputs)
	jsonWrite("public-samples.json", r.samples)
	jsonWrite("final-public.json", []sim.View{r.view(1), r.view(2)})
	jsonWrite("result.json", map[string]any{"failed": r.t.Failed(), "tick": r.e.Tick(), "actual_midpoint": r.midpoint, "state_hash": r.e.Hash(), "in_memory_assertions": r.proofs})
	write("initial.save.json", r.replay.Initial, nil)
	if len(r.midSave) > 0 { write("actual-midpoint.save.json", r.midSave, nil) }
	save, err := r.e.Save(); write("final.save.json", save, err)
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Error(err); return }
	replay, err := r.replay.Encode(); write("actual.replay.json", replay, err)
}

func TestAircraftServiceContactPublicPaidScoutReturnAndLandedRepair(t *testing.T) {
	r := newAircraftServiceContactRun(t)
	r.build(1, "power", sim.Vec{X: 23000, Y: 22000})
	r.build(1, "barracks", sim.Vec{X: 23500, Y: 25000})
	r.build(1, "supply", sim.Vec{X: 18000, Y: 29500})
	// The included, normally paid-for hauler is stopped before any income. This
	// keeps the repair debit observable against the ordinary 6000-credit budget.
	hauler := r.typeID(1, "SY.hauler")
	if hauler == 0 { t.Fatal("ordinary included supply hauler absent") }
	r.accept(1, sim.Order{Kind: "stop", Entities: []sim.ID{hauler}})
	r.build(1, "radar", sim.Vec{X: 27000, Y: 28500})
	home := r.build(1, "SY.workshop_air", sim.Vec{X: 30000, Y: 22000})
	drone := r.train(1, home, "SY.scout_drone")
	if r.view(1).Economy.Credits != 200000 || r.view(1).Economy.Income != 0 { t.Fatal("paid 5800-credit aircraft setup changed") }
	u, _ := r.c.Unit("SY.scout_drone")
	v := r.own(1, drone)
	if u.Weapon != "" || u.Speed != 5000 || !v.Landed || v.Private.Home != home || v.Private.HP != u.HP || v.Private.Endurance != 2400 || v.Private.ServiceWork != 0 {
		t.Fatal("normal grounded unarmed scout resources changed")
	}
	affordances, err := r.e.CommandAffordances(1, []sim.ID{drone})
	if err != nil { t.Fatal(err) }
	if len(affordances.Entities) != 1 || !slices.Contains(affordances.Entities[0].Commands, "move") || !slices.Contains(affordances.Entities[0].Commands, "return") {
		t.Fatal("a grounded mobile scout lost ordinary Move/Return")
	}
	r.accept(1, sim.Order{Kind: "repair_reserve", Index: 1000000})
	start := v.Position
	r.move(1, drone, sim.Vec{X: 38000, Y: 22000}, 160)
	r.advance(120)
	v = r.own(1, drone)
	if v.Landed || v.Private.Endurance >= 2400 || v.Private.HP != u.HP || aircraftServiceContactDist2(start, v.Position) < 4000*4000 { t.Fatal("ordinary sortie supplied no physical/depleted-endurance witness") }
	r.sample("actual_depleted_endurance_sortie")
	r.accept(1, sim.Order{Kind: "return", Entities: []sim.ID{drone}, Target: home})
	if r.own(1, drone).Landed { t.Fatal("manual Return teleported an airborne scout") }
	r.checkpoint()
	r.wait(240, "ordinary owned-home touchdown", func() bool { v := r.own(1, drone); return v.Landed && v.Private.ServiceWork > 0 })
	touchdown := r.e.Tick()
	v = r.own(1, drone)
	if v.Private.Endurance >= 2400 || v.Private.Home != home { t.Fatal("touchdown gave an instant endurance refill or changed home") }
	parked := v.Position
	h := r.own(1, home)
	dx, dy := int64(parked.X)-int64(h.Position.X), int64(parked.Y)-int64(h.Position.Y)
	if dx < 0 { dx = -dx }; if dy < 0 { dy = -dy }
	dx = max(int64(0), dx-int64(h.FootprintWidth)*500)
	dy = max(int64(0), dy-int64(h.FootprintHeight)*500)
	if dx*dx+dy*dy < 600*600 || dx*dx+dy*dy > 2600*2600 { t.Fatal("normal landed scout lacks legal circular home service contact") }
	r.sample("landed_service_started")
	r.advance(359)
	v = r.own(1, drone)
	if !v.Landed || v.Private.ServiceWork == 0 || v.Private.Endurance >= 2400 { t.Fatal("18-second scout service completed early") }
	r.advance(1)
	v = r.own(1, drone)
	if r.e.Tick() != touchdown+360 || !v.Landed || v.Position != parked || v.Private.ServiceWork != 0 || v.Private.Endurance != 2400 || len(v.Private.Orders) != 0 || r.view(1).Economy.Credits != 200000 {
		t.Fatal("ordinary scout service failed to finish/refill for free and wait at home")
	}
	r.sample("full_service_waiting_at_home")
	// Paid ground fire damages a real already-landed, ServiceWork==0 craft.
	// The hostile approach is a declared map point; Attack uses only player2's
	// currently visible hostile drone, never a hidden-ID target admission.
	r.build(2, "power", sim.Vec{X: 23000, Y: 78000})
	barracks := r.build(2, "barracks", sim.Vec{X: 23500, Y: 75000})
	rifle := r.train(2, barracks, "SY.rifle")
	if r.view(2).Economy.Credits != 4650000 { t.Fatal("ordinary hostile rifle/setup costs changed") }
	r.move(2, rifle, sim.Vec{X: 34000, Y: 22000}, 1200)
	seen, ok := r.actor(2, drone)
	if !ok || seen.Owner != 1 || seen.Type != "SY.scout_drone" || !seen.Landed { t.Fatal("hostile ground shooter has no current grounded-aircraft target view") }
	r.accept(2, sim.Order{Kind: "attack", Entities: []sim.ID{rifle}, Target: seen.ID})
	r.wait(180, "actual ground-weapon hit on landed light-armor scout", func() bool { return r.own(1, drone).Private.HP < u.HP })
	r.accept(2, sim.Order{Kind: "move", Entities: []sim.ID{rifle}, Position: sim.Vec{X: 55000, Y: 22000}})
	r.wait(400, "ordinary hostile disengagement", func() bool {
		a := r.own(2, rifle)
		return len(a.Private.Orders) == 0 && aircraftServiceContactDist2(a.Position, r.own(1, drone).Position) > 12000*12000
	})
	r.advance(80)
	v = r.own(1, drone)
	damagedHP := v.Private.HP
	if damagedHP <= 0 || damagedHP >= u.HP || !v.Landed || v.Position != parked || v.Private.ServiceWork != 0 { t.Fatal("no living grounded damaged ServiceWork-zero witness") }
	blockedCredits := r.view(1).Economy.Credits
	r.sample("actual_landed_damage_reserve_blocks_repair")
	r.accept(1, sim.Order{Kind: "return", Entities: []sim.ID{drone}, Target: home})
	r.advance(80)
	v = r.own(1, drone)
	if !v.Landed || v.Position != parked || v.Private.HP != damagedHP || v.Private.ServiceWork != 0 || r.view(1).Economy.Credits != blockedCredits { t.Fatal("already-landed Return bypassed the paid repair reserve or moved/refilled the scout") }
	r.sample("already_landed_return_respects_paid_reserve")
	r.accept(1, sim.Order{Kind: "repair_reserve", Index: 0})
	r.wait(240, "ordinary paid owned-home repair contact", func() bool { return r.own(1, drone).Private.HP == u.HP })
	v = r.own(1, drone)
	wantCost := (u.HP-damagedHP+9)/10
	if r.view(1).Economy.Income != 0 || blockedCredits-r.view(1).Economy.Credits != wantCost || wantCost <= 0 || !v.Landed || v.Position != parked || v.Private.ServiceWork != 0 || v.Private.Home != home || v.Private.Endurance != 2400 {
		t.Fatal("landed service contact did not restore HP for its exact ordinary repair debit")
	}
	r.sample("already_landed_paid_home_repair_complete")
	for _, kind := range []string{"stop", "hold"} {
		r.accept(1, sim.Order{Kind: kind, Entities: []sim.ID{drone}})
		r.advance(20)
		v = r.own(1, drone)
		if !v.Landed || v.Position != parked || len(v.Private.Orders) != 0 || v.Private.HP != u.HP || v.Private.ServiceWork != 0 { t.Fatal("grounded unarmed scout Stop/Hold changed its contact/resources") }
	}
	r.proofs["normal_paid_construction_training"] = true
	r.proofs["real_sortie_and_owned_home_return"] = true
	r.proofs["full_18_second_service_and_endurance_refill"] = true
	r.proofs["actual_landed_ground_weapon_damage"] = true
	r.proofs["landed_return_respects_reserve_then_paid_repair"] = true
	r.proofs["grounded_mobile_affordances_and_stop_hold"] = true
	r.finish()
}
