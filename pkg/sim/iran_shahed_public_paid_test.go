package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

// Reusable by the disjoint AI owner as a paid infrastructure intake only. This
// fixture has human controllers and makes no autonomous-bot competence claim.
type shahedPaidNewV1 struct {
	t *testing.T
	e *Engine
	replay *Replay
	twin *Engine
	config Config
	sequence map[PlayerID]uint32
	inputs []Scheduled
	receipts []OrderResult
	midSave []byte
	midTick Tick
	proofs map[string]bool
}

func newShahedPaidNewV1(t *testing.T) *shahedPaidNewV1 {
	t.Helper()
	m := content.Map{ID: "iran-shahed-paid-public-v1", Title: "Paid Shahed lifecycle backend input", Author: "backend acceptance fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 96, Height: 96,
		Spawns: []content.Spawn{{Position: Vec{X: 18000, Y: 22000}, Team: 1}, {Position: Vec{X: 18000, Y: 78000}, Team: 2}},
		Fields: []content.Field{{ID: 1, Position: Vec{X: 11000, Y: 22000}, Credits: 36000000}, {ID: 2, Position: Vec{X: 11000, Y: 78000}, Credits: 36000000}}, Shipment: Vec{X: 70000, Y: 48000}}
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles { m.Tiles[i].Terrain = "open" }
	cfg := Config{Map: m, Seed: 933047, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Name: "Paid Shahed owner", Faction: "IR", Team: 1, Controller: "human"}, {ID: 2, Name: "Paid ground target owner", Faction: "US", Team: 2, Controller: "human"}}}
	e, err := New(content.MustBase(), cfg)
	if err != nil { t.Fatal(err) }
	replay, err := NewReplay(e)
	if err != nil { t.Fatal(err) }
	r := &shahedPaidNewV1{t: t, e: e, replay: replay, config: cfg, sequence: map[PlayerID]uint32{}, proofs: map[string]bool{}}
	t.Cleanup(r.evidence)
	r.advance(100)
	if r.view(1).Economy.Credits != 6000000 || r.view(2).Economy.Credits != 6000000 || r.view(1).Countdown != 0 { t.Fatal("ordinary default-funded New/countdown changed") }
	return r
}

func (r *shahedPaidNewV1) view(p PlayerID) View {
	r.t.Helper()
	v, ok := r.e.PlayerView(p)
	if !ok { r.t.Fatal("owner public view absent") }
	return v
}

func (r *shahedPaidNewV1) own(p PlayerID, id ID) (EntityView, bool) {
	for _, v := range r.view(p).Entities { if v.ID == id && v.Owner == p && v.Private != nil { return v, true } }
	return EntityView{}, false
}

func (r *shahedPaidNewV1) typeID(p PlayerID, typ string) ID {
	for _, v := range r.view(p).Entities { if v.Owner == p && v.Type == typ && v.Complete { return v.ID } }
	return 0
}

func (r *shahedPaidNewV1) advance(n uint32) {
	r.t.Helper()
	for range n {
		r.e.Advance()
		if r.twin != nil { r.twin.Advance(); if r.twin.Hash() != r.e.Hash() { r.t.Fatal("committed midpoint continuation diverged") } }
		if r.e.Tick()%400 == 0 { if err := r.replay.Capture(r.e, false); err != nil { r.t.Fatal(err) } }
		if r.e.Tick() > 18000 || r.e.Outcome().Finished { r.t.Fatal("paid public course exceeded bound or ended unexpectedly") }
	}
}

func (r *shahedPaidNewV1) wait(n uint32, label string, ready func() bool) {
	r.t.Helper()
	for i := uint32(0); i <= n; i++ { if ready() { return }; if i < n { r.advance(1) } }
	r.t.Fatalf("%s did not complete within %d ticks at %d", label, n, r.e.Tick())
}

func (r *shahedPaidNewV1) submit(p PlayerID, order Order, accepted bool) {
	r.t.Helper()
	r.sequence[p]++
	seq := r.sequence[p]
	if err := r.e.Submit(p, seq, []Order{order}); err != nil { r.t.Fatalf("public Submit %s: %v", order.Kind, err) }
	if r.twin != nil { if err := r.twin.Submit(p, seq, []Order{order}); err != nil { r.t.Fatal(err) } }
	r.inputs = append(r.inputs, Scheduled{Tick: r.e.Tick()+1, Player: p, Sequence: seq, Orders: []Order{order}})
	r.advance(1)
	for _, result := range r.view(p).Results {
		if result.Player == p && result.Sequence == seq && result.Index == 0 {
			r.receipts = append(r.receipts, result)
			if result.Accepted != accepted || accepted && result.Code != "ok" || !accepted && result.Code != "shahed_committed" { r.t.Fatalf("wrong public receipt for %s: %+v", order.Kind, result) }
			return
		}
	}
	r.t.Fatal("public order result absent")
}

func (r *shahedPaidNewV1) build(p PlayerID, typ string, point Vec) ID {
	r.t.Helper()
	rule, ok := r.e.catalog.Building(typ)
	if !ok { r.t.Fatal("catalog building absent") }
	r.wait(2400, "earned construction funds", func() bool { return r.view(p).Economy.Credits >= rule.Cost })
	before := r.view(p).Economy
	rig := r.typeID(p, r.e.player(p).Faction+".rig")
	r.submit(p, Order{Kind: "build", Entities: []ID{rig}, Type: typ, Position: point}, true)
	after := r.view(p).Economy
	if before.Credits+(after.Income-before.Income)-after.Credits != rule.Cost { r.t.Fatal("construction did not pay its catalog debit from actual own income/bank") }
	r.wait(1800, "paid building", func() bool { return r.typeID(p, typ) != 0 })
	return r.typeID(p, typ)
}

// The returned hub and trained drone use real default funds, harvesting,
// prerequisites, placement, travel, queues and slots. No state/funds/tier edits.
func (r *shahedPaidNewV1) opening() (ID, ID) {
	r.t.Helper()
	r.build(1, "power", Vec{X: 23000, Y: 22000})
	r.build(1, "barracks", Vec{X: 23500, Y: 25000})
	r.build(1, "supply", Vec{X: 18000, Y: 29500})
	r.build(1, "radar", Vec{X: 27000, Y: 28500})
	home := r.build(1, "IR.drone_hub", Vec{X: 30000, Y: 22000})
	r.wait(2400, "earned Shahed funds", func() bool { return r.view(1).Economy.Credits >= 400000 })
	hauler := r.typeID(1, "IR.hauler")
	if hauler == 0 || r.view(1).Economy.Income < 200000 { r.t.Fatal("ordinary 6200-credit opening did not earn its required income") }
	r.submit(1, Order{Kind: "stop", Entities: []ID{hauler}}, true)
	before, income, start := r.view(1).Economy.Credits, r.view(1).Economy.Income, r.e.Tick()
	r.submit(1, Order{Kind: "train", Entities: []ID{home}, Type: "IR.shahed"}, true)
	if r.view(1).Economy.Credits != before-400000 || r.view(1).Economy.Income != income || r.view(1).Economy.ReservedSupply != 1 { r.t.Fatal("real paid Shahed job did not debit400/reserve1 without extra income") }
	r.wait(360, "paid 18-second Shahed", func() bool { return r.typeID(1, "IR.shahed") != 0 })
	drone := r.typeID(1, "IR.shahed")
	v, _ := r.own(1, drone)
	if r.e.Tick() != start+360 || v.Private.Home != home || v.Private.HP != 140000 || v.Private.Ammo != 1 || v.Private.Endurance != 2400 || !v.Landed || v.Private.ShahedCommitted || r.e.player(1).Spent != 6200000 { r.t.Fatal("actual paid initial actor/resources/prices changed") }
	r.proofs["default_new_paid_6200_with_real_income"] = true
	return home, drone
}

func (r *shahedPaidNewV1) move(id ID, point Vec) {
	r.t.Helper()
	r.submit(1, Order{Kind: "move", Entities: []ID{id}, Position: point}, true)
	r.wait(400, "ordinary uncommitted flight", func() bool { v, ok := r.own(1, id); return ok && len(v.Private.Orders) == 0 && distance(v.Position, point) <= 250 })
	v, _ := r.own(1, id)
	if v.Landed || v.Private.ShahedCommitted || v.Private.Ammo != 1 { r.t.Fatal("normal Move committed/spent the physical payload") }
}

func TestIranShahedPublicPaidReturnRecallCommitImpactAndReplay(t *testing.T) {
	r := newShahedPaidNewV1(t)
	home, drone := r.opening()
	r.build(2, "power", Vec{X: 23000, Y: 78000})
	target := r.build(2, "barracks", Vec{X: 23500, Y: 75000})
	staging := Vec{X: 32000, Y: 75000}
	r.move(drone, staging)
	r.submit(1, Order{Kind: "return", Entities: []ID{drone}, Target: home}, true)
	r.wait(1000, "precommit owned-home Return/service", func() bool { v, ok := r.own(1, drone); return ok && v.Landed && v.Private.ServiceWork == 0 && v.Private.Endurance == 2400 })
	r.move(drone, staging)
	r.submit(1, Order{Kind: "ability", Type: "drone_recall", Entities: []ID{drone}}, true)
	r.wait(1000, "precommit Recall/service", func() bool { v, ok := r.own(1, drone); return ok && v.Landed && v.Private.ServiceWork == 0 && v.Private.Endurance == 2400 })
	r.move(drone, staging)
	r.submit(1, Order{Kind: "repeat_sortie", Entities: []ID{drone}, Index: 1}, true)
	targetView, ok := r.own(2, target)
	if !ok { t.Fatal("paid ground target absent") }
	point, hp := targetView.Position, targetView.Private.HP
	r.submit(1, Order{Kind: "attack", Entities: []ID{drone}, Target: target}, true)
	v, ok := r.own(1, drone)
	if !ok || !v.Private.ShahedCommitted || v.Landed || v.Private.Ammo != 0 || v.Private.RepeatSortie || v.Private.Home != home || len(v.Private.Orders) != 1 || v.Private.Orders[0].Kind != "move" || v.Private.Orders[0].Position != point { t.Fatal("actual visible attack did not lock the physical point/resources") }
	for _, order := range []Order{{Kind: "stop"}, {Kind: "move", Position: staging}, {Kind: "return", Target: home}, {Kind: "repeat_sortie", Index: 1}, {Kind: "ability", Type: "drone_recall"}, {Kind: "attack", Target: target}, {Kind: "force_fire", Position: point}} {
		order.Entities = []ID{drone}
		r.submit(1, order, false)
		v, ok = r.own(1, drone)
		if !ok || !v.Private.ShahedCommitted || v.Private.Ammo != 0 || v.Private.Home != home || v.Private.Orders[0].Position != point { t.Fatal("rejected command reset the committed payload") }
	}
	for _, foreign := range r.view(2).Entities { if foreign.ID == drone && foreign.Private != nil { t.Fatal("foreign view exposed owned commitment/private orders") } }
	var err error
	r.midSave, err = r.replay.CaptureCheckpoint(r.e)
	if err != nil { t.Fatal(err) }
	r.midTick = r.e.Tick()
	r.twin, err = Restore(r.e.catalog, r.midSave)
	if err != nil || r.twin.Hash() != r.e.Hash() { t.Fatalf("actual committed Save/Restore: %v", err) }
	var impacts int
	for i := 0; i < 100; i++ {
		if _, ok := r.own(1, drone); !ok { break }
		r.advance(1)
		for _, event := range r.e.state.Events { if event.Kind == "impact" && event.Combat != nil && event.Combat.Weapon == "IR_SHAHED" { impacts++; if event.Position != point { t.Fatal("terminal point changed") } } }
		shahedNoProjectileV1(t, r.e)
	}
	if _, ok := r.own(1, drone); ok { t.Fatal("physical payload did not reach terminal impact") }
	after, _ := r.own(2, target)
	if impacts != 1 || after.Private.HP != hp-220000 || r.view(1).Economy.Supply != 0 || r.e.player(1).Lost != 400000 || r.e.player(1).Spent != 6200000 { t.Fatal("real paid terminal effect/loss/Supply/debit was not exact once") }
	r.advance(40)
	after, _ = r.own(2, target)
	if after.Private.HP != hp-220000 { t.Fatal("terminal payload hit a second time") }
	r.proofs["precommit_return_recall_free_service"] = true
	r.proofs["postcommit_public_commands_rejected"] = true
	r.proofs["owner_only_private_commitment"] = true
	r.proofs["one_physical_220_structure_hit_and_400_loss"] = true
	if err := r.replay.Capture(r.e, false); err != nil { t.Fatal(err) }
	raw, err := r.replay.Encode()
	if err != nil { t.Fatal(err) }
	for _, mode := range []string{"full_initial", "actual_committed_midpoint"} {
		played, err := DecodeReplay(raw)
		if err != nil { t.Fatal(err) }
		if mode == "full_initial" { played.Checkpoints = nil } else {
			kept := []ReplayCheckpoint{}
			for _, cp := range played.Checkpoints { if cp.Tick == r.midTick { kept = append(kept, cp) } }
			if len(kept) != 1 { t.Fatal("actual committed checkpoint absent") }; played.Checkpoints = kept
		}
		replayed, err := played.Seek(r.e.catalog, r.e.Tick())
		if err != nil || replayed.Hash() != r.e.Hash() { t.Fatalf("%s replay: %v", mode, err) }
		r.proofs[mode+"_replay"] = true
	}
	r.proofs["actual_committed_restore_continuation"] = true
	t.Logf("ordinary paid Shahed final=%d midpoint=%d damage220 cost400 one_way=true hash=%s", r.e.Tick(), r.midTick, r.e.Hash())
}

func (r *shahedPaidNewV1) evidence() {
	dir := os.Getenv("FRONTLINE_SHAHED_EVIDENCE")
	if dir == "" { return }
	dir = filepath.Join(dir, r.t.Name())
	if err := os.MkdirAll(dir, 0755); err != nil { r.t.Error(err); return }
	write := func(name string, value any) { data, err := json.MarshalIndent(value, "", "  "); if err != nil { r.t.Error(err); return }; if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil { r.t.Error(err) } }
	write("config.json", r.config); write("public-inputs.json", r.inputs); write("actual-receipts.json", r.receipts)
	write("final-public.json", []View{r.view(1), r.view(2)})
	write("result.json", map[string]any{"failed": r.t.Failed(), "tick": r.e.Tick(), "midpoint": r.midTick, "hash": r.e.Hash(), "proofs": r.proofs})
	for name, data := range map[string][]byte{"initial.save.json": r.replay.Initial, "actual-midpoint.save.json": r.midSave} { if len(data)>0 { if err := os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil { r.t.Error(err) } } }
	save, err := r.e.Save(); if err == nil { err = os.WriteFile(filepath.Join(dir, "final.save.json"), save, 0644) }; if err != nil { r.t.Error(err) }
	if err := r.replay.Capture(r.e, false); err != nil { r.t.Error(err); return }
	raw, err := r.replay.Encode(); if err == nil { err = os.WriteFile(filepath.Join(dir, "actual.replay.json"), raw, 0644) }; if err != nil { r.t.Error(err) }
}
