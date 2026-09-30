package sim_test

// This boundary fixture uses only validated public input, paid build/gather
// orders and Advance. Small positive parcels shorten the authored test supply;
// no resource, speed, tick, AI-memory or live engine state is edited.
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

type shipmentAudit struct {
	t        *testing.T
	engine   *sim.Engine
	commands []sim.Scheduled
	dir      string
	report   map[string]any
	countAt  sim.Tick
	arrived  sim.Tick
}

func shipmentCapacityMap(count int) content.Map {
	m := content.Map{ID: fmt.Sprintf("shipment-boundary-%d", count), Title: "Positive parcel shipment boundary", Author: "backend audit", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64, Spawns: []content.Spawn{{Position: sim.Vec{X: 8000, Y: 8000}}, {Position: sim.Vec{X: 56000, Y: 56000}}}, Shipment: sim.Vec{X: 22500, Y: 11500}}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	for i := 0; i < count; i++ {
		// Distinct sub-tile positions are legal map points. Each parcel holds
		// two credits, all mined at the unchanged 40-credit/second rate.
		m.Fields = append(m.Fields, content.Field{ID: uint32(i + 1), Position: sim.Vec{X: 19000 + int32(i%16)*20, Y: 8000 + int32(i/16)*20}, Credits: 2000})
	}
	return m
}

func shipmentNewAudit(t *testing.T, m content.Map, allyAI bool) *shipmentAudit {
	t.Helper()
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	m, err = content.DecodeMap(raw)
	if err != nil {
		t.Fatal("fixture map does not pass the public decoder", err)
	}
	cfg := sim.Config{Map: m, Seed: 731100, Ruleset: "standard-v2", Players: []sim.PlayerConfig{{ID: 1, Name: "Human", Faction: "US", Team: 1}}}
	if allyAI {
		cfg.Players = append(cfg.Players, sim.PlayerConfig{ID: 2, Name: "Normal allied observer", Faction: "IR", Team: 1, AI: "normal"})
	}
	e, err := sim.New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	dir := os.Getenv("FRONTLINE_SHIPMENT_EVIDENCE")
	if dir == "" {
		dir = t.TempDir()
	}
	dir = filepath.Join(dir, strings.ReplaceAll(t.Name(), "/", "-"))
	if err = os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	a := &shipmentAudit{t: t, engine: e, dir: dir, report: map[string]any{"map_id": m.ID, "authored_fields": len(m.Fields), "ally_ai": allyAI, "metadata": e.Metadata(), "initial_hash": e.Hash()}}
	a.write("map.json", raw)
	a.writeSave("initial", e)
	t.Cleanup(func() {
		a.report["tick"] = a.engine.Tick()
		a.report["final_hash"] = a.engine.Hash()
		a.report["shipment_countdown_tick"] = a.countAt
		a.report["shipment_arrived_tick"] = a.arrived
		a.report["commands"] = a.commands
		a.report["failed"] = t.Failed()
		out, err := json.MarshalIndent(a.report, "", "  ")
		if err != nil {
			t.Error(err)
			return
		}
		a.write("receipt.json", out)
	})
	return a
}

func (a *shipmentAudit) write(name string, data []byte) {
	a.t.Helper()
	if err := os.WriteFile(filepath.Join(a.dir, name), data, 0644); err != nil {
		a.t.Fatal(err)
	}
}

func (a *shipmentAudit) writeSave(name string, e *sim.Engine) []byte {
	a.t.Helper()
	save, err := e.Save()
	if err != nil {
		a.t.Fatal("Save failed", name, err)
	}
	a.write(name+".save.json", save)
	sum := sha256.Sum256(save)
	a.report[name] = map[string]any{"tick": e.Tick(), "hash": e.Hash(), "save_sha256": hex.EncodeToString(sum[:]), "save_bytes": len(save)}
	return save
}

func (a *shipmentAudit) step() {
	a.t.Helper()
	prior := a.engine.Tick()
	a.engine.Advance()
	if a.engine.Tick() != prior+1 {
		a.t.Fatal("fixture finished before the canonical shipment", a.engine.Outcome())
	}
	feedback, ok := a.engine.PlayerFeedback(1)
	if !ok {
		a.t.Fatal("human feedback unavailable")
	}
	for _, event := range feedback.Events {
		if event.Kind == "shipment_countdown" {
			a.countAt = event.Tick
			if event.Value != int64(event.Tick+sim.Tick(180*sim.TickRate)) {
				a.t.Fatal("shipment countdown does not use the ordinary 180-second rule")
			}
		}
		if event.Kind == "shipment_arrived" {
			a.arrived = event.Tick
			if event.Value != 6000000 || event.Position != a.engine.MapBlueprint().Shipment {
				a.t.Fatal("shipment changed amount or public central position")
			}
		}
	}
}

func (a *shipmentAudit) issue(order sim.Order) {
	a.t.Helper()
	view, _ := a.engine.PlayerView(1)
	sequence := view.Economy.LastSequence + 1
	if err := a.engine.Submit(1, sequence, []sim.Order{order}); err != nil {
		a.t.Fatal("ordinary fixture intention rejected", order.Kind, err)
	}
	a.commands = append(a.commands, sim.Scheduled{Tick: a.engine.Tick() + 1, Player: 1, Sequence: sequence, Orders: []sim.Order{order}})
	a.step()
	feedback, _ := a.engine.PlayerFeedback(1)
	if len(feedback.Results) != 1 || !feedback.Results[0].Accepted {
		a.t.Fatal("ordinary fixture order failed execution", order, feedback.Results)
	}
}

func (a *shipmentAudit) wait(limit uint32, ready func(sim.View) bool) {
	a.t.Helper()
	for i := uint32(0); i < limit; i++ {
		view, _ := a.engine.PlayerView(1)
		if ready(view) {
			return
		}
		a.step()
	}
	a.writeSave("fixture-timeout", a.engine)
	a.t.Fatal("canonical fixture did not reach its declared boundary within", limit, "ticks")
}

func (a *shipmentAudit) paidOpening() sim.ID {
	a.t.Helper()
	a.wait(101, func(v sim.View) bool { return v.Countdown == 0 })
	view, _ := a.engine.PlayerView(1)
	var rig sim.ID
	for _, entity := range view.Entities {
		if entity.Owner == 1 && entity.Type == "US.rig" {
			rig = entity.ID
		}
	}
	if rig == 0 || view.Economy.Credits != 6000000 {
		a.t.Fatal("fixture lacks the standard rig/6000-credit opening")
	}
	a.issue(sim.Order{Kind: "build", Type: "power", Entities: []sim.ID{rig}, Position: sim.Vec{X: 14000, Y: 12000}})
	a.wait(2000, func(v sim.View) bool {
		for _, entity := range v.Entities {
			if entity.Owner == 1 && entity.Type == "power" && entity.Complete {
				return true
			}
		}
		return false
	})
	a.issue(sim.Order{Kind: "move", Entities: []sim.ID{rig}, Position: sim.Vec{X: 12000, Y: 6000}})
	a.wait(600, func(v sim.View) bool {
		for _, entity := range v.Entities {
			if entity.ID == rig {
				dx, dy := int64(entity.Position.X-12000), int64(entity.Position.Y-6000)
				return dx*dx+dy*dy <= 300*300
			}
		}
		return false
	})
	a.issue(sim.Order{Kind: "build", Type: "supply", Entities: []sim.ID{rig}, Position: sim.Vec{X: 15000, Y: 8500}})
	var hauler sim.ID
	a.wait(2000, func(v sim.View) bool {
		for _, entity := range v.Entities {
			if entity.Owner == 1 && entity.Type == "US.hauler" {
				hauler = entity.ID
				return true
			}
		}
		return false
	})
	state := a.engine.StateCopy()
	power, powerOK := content.MustBase().Building("power")
	supply, supplyOK := content.MustBase().Building("supply")
	expectedSpent := power.Cost + supply.Cost
	a.report["paid_opening_tick"] = a.engine.Tick()
	a.report["paid_opening_spent"] = state.Players[0].Spent
	a.report["paid_opening_credits"] = state.Players[0].Credits
	a.report["paid_opening_expected_costs"] = map[string]int64{"power": power.Cost, "supply": supply.Cost, "total": expectedSpent}
	if !powerOK || !supplyOK || state.Players[0].Spent != expectedSpent || state.Players[0].Credits != 6000000-expectedSpent || state.Metadata.Ruleset != "standard-v2" {
		a.t.Fatal("paid opening changed public catalog costs or enabled practice tools", state.Players[0].Spent, state.Players[0].Credits, expectedSpent)
	}
	return hauler
}

func TestCanonicalShipmentSaveRestoreBoundary(t *testing.T) {
	for _, tc := range []struct {
		name   string
		fields int
		ai     bool
	}{{"127_field_control", 127, false}, {"128_fields", 128, false}, {"128_fields_with_allied_ai", 128, true}} {
		t.Run(tc.name, func(t *testing.T) {
			a := shipmentNewAudit(t, shipmentCapacityMap(tc.fields), tc.ai)
			e := a.engine
			replay, err := sim.NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			hauler := a.paidOpening()
			// Pin consecutive visible, positive fields using ordinary commands.
			// Their combined cargo fits the ordinary600-credit hold, so no paid
			// stock is erased or granted and the final delivery takes three seconds.
			for id := uint32(1); id <= uint32(tc.fields); id++ {
				a.issue(sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: sim.ID(id)})
				a.wait(600, func(v sim.View) bool {
					for _, field := range v.Fields {
						if field.ID == id {
							return field.Remaining == 0
						}
					}
					return false
				})
			}
			if a.countAt == 0 || a.arrived != 0 {
				t.Fatal("fixture did not ordinarily mine every positive authored field")
			}
			due := a.countAt + sim.Tick(180*sim.TickRate)
			for e.Tick() < a.countAt+sim.Tick(90*sim.TickRate) {
				a.step()
			}
			midSave := a.writeSave("midpoint", e)
			midpoint, err := sim.Restore(content.MustBase(), midSave)
			if err != nil || midpoint.Hash() != e.Hash() {
				t.Fatal("valid pre-shipment midpoint cannot restore", err)
			}
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			for e.Tick() < due {
				a.step()
				midpoint.Advance()
			}
			if a.arrived != due || e.Hash() != midpoint.Hash() {
				t.Fatal("ordinary shipment timing or midpoint continuation diverged", a.arrived, due)
			}
			arrivalSave := a.writeSave("arrival", e)
			arriving, err := sim.Restore(content.MustBase(), arrivalSave)
			if err != nil {
				a.report["arrival_restore_error"] = err.Error()
				t.Error("normal first shipment creates a nonrestorable canonical save", err)
			} else if arriving.Hash() != e.Hash() {
				t.Error("arrival Restore changes the complete state hash")
			}
			for range 80 {
				a.step()
				midpoint.Advance()
				if arriving != nil {
					arriving.Advance()
				}
			}
			state := e.StateCopy()
			if len(state.Fields) != tc.fields+1 || e.Hash() != midpoint.Hash() || arriving != nil && e.Hash() != arriving.Hash() {
				t.Fatal("normal shipment field count or native continuation diverged")
			}
			if state.Players[0].Income != int64(tc.fields)*2000 {
				t.Fatal("ordinary parcel cargo was not delivered exactly once", state.Players[0].Income)
			}
			a.report["runtime_fields"] = len(state.Fields)
			a.report["ordinary_delivered_income"] = state.Players[0].Income
			if tc.ai {
				a.report["observed_ai_fields"] = len(state.Players[1].AIFields)
				if len(state.Players[1].AIFields) != tc.fields+1 {
					t.Fatal("normal allied AI did not observe the public shipment")
				}
			}
			finalSave := a.writeSave("final", e)
			final, restoreErr := sim.Restore(content.MustBase(), finalSave)
			if restoreErr != nil {
				a.report["final_restore_error"] = restoreErr.Error()
				t.Error("normal post-shipment state cannot restore", restoreErr)
			} else if final.Hash() != e.Hash() {
				t.Error("post-shipment Restore changes state")
			}
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			for _, checkpoints := range []bool{false, true} {
				recording := *replay
				if !checkpoints {
					recording.Checkpoints = nil
				}
				played, err := recording.Seek(content.MustBase(), e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("source-matched full/midpoint replay diverged", checkpoints, err)
				}
			}
			a.report["full_and_midpoint_replay_hash"] = e.Hash()
			replay.Checkpoints = append([]sim.ReplayCheckpoint(nil), replay.Checkpoints...)
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			played, checkpointErr := replay.Seek(content.MustBase(), e.Tick())
			if checkpointErr != nil {
				a.report["post_shipment_checkpoint_error"] = checkpointErr.Error()
				t.Error("ordinary post-shipment replay checkpoint cannot open", checkpointErr)
			} else if played.Hash() != e.Hash() {
				t.Error("post-shipment checkpoint changes state")
			}
			recording, err := json.Marshal(replay)
			if err != nil {
				t.Fatal(err)
			}
			a.write("replay.json", recording)
			t.Logf("normal first shipment tick=%d due=%d fields=%d ai_fields=%v hash=%s", a.arrived, due, len(state.Fields), a.report["observed_ai_fields"], e.Hash())
		})
	}
}

func TestCanonicalShipmentAuthoredMapControl(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "dry-river.json"))
	if err != nil {
		t.Fatal(err)
	}
	m, err := content.DecodeMap(raw)
	if err != nil {
		t.Fatal(err)
	}
	a := shipmentNewAudit(t, m, false)
	e := a.engine
	replay, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for range 600 {
		a.step()
	}
	if a.countAt != 0 || a.arrived != 0 || len(e.StateCopy().Fields) != len(m.Fields) {
		t.Fatal("unchanged authored default unexpectedly depleted or created a shipment")
	}
	save := a.writeSave("midpoint", e)
	restored, err := sim.Restore(content.MustBase(), save)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("unchanged authored default cannot restore", err)
	}
	if err = replay.Capture(e, true); err != nil {
		t.Fatal(err)
	}
	for range 80 {
		a.step()
		restored.Advance()
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("unchanged authored default continuation diverged")
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	for _, checkpoints := range []bool{false, true} {
		r := *replay
		if !checkpoints {
			r.Checkpoints = nil
		}
		played, err := r.Seek(content.MustBase(), e.Tick())
		if err != nil || played.Hash() != e.Hash() {
			t.Fatal("unchanged authored default replay diverged", checkpoints, err)
		}
	}
	a.writeSave("final", e)
	t.Logf("unchanged authored default fields=%d tick=%d hash=%s", len(m.Fields), e.Tick(), e.Hash())
}
