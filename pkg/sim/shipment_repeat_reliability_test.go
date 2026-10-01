package sim_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

func TestCanonicalShipmentSecondArrivalReusesCentralField(t *testing.T) {
	for _, tc := range []struct {
		name string
		ai   bool
	}{{"128_fields", false}, {"128_fields_max_id_allied_ai", true}} {
		t.Run(tc.name, func(t *testing.T) {
			m := shipmentCapacityMap(128)
			if tc.ai {
				// The public schema allows the full nonzero uint32 ID range.
				m.ID += "-max-id"
				m.Fields[len(m.Fields)-1].ID = ^uint32(0)
			}
			a := shipmentNewAudit(t, m, tc.ai)
			e := a.engine
			replay, err := sim.NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			hauler := a.paidOpening()
			for _, original := range m.Fields {
				a.issue(sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: sim.ID(original.ID)})
				a.wait(600, func(v sim.View) bool {
					for _, field := range v.Fields {
						if field.ID == original.ID {
							return field.Remaining == 0
						}
					}
					return false
				})
			}
			firstDue := a.countAt + sim.Tick(180*sim.TickRate)
			for e.Tick() < firstDue {
				a.step()
			}
			if a.arrived != firstDue {
				t.Fatal("first ordinary shipment missed its canonical deadline")
			}
			a.report["first_shipment_tick"] = a.arrived
			authored := map[uint32]sim.Vec{}
			for _, field := range m.Fields {
				authored[field.ID] = field.Position
			}
			central := uint32(0)
			firstState := e.StateCopy()
			for _, field := range firstState.Fields {
				if _, original := authored[field.ID]; !original {
					central = field.ID
				}
			}
			if central == 0 || len(firstState.Fields) != len(m.Fields)+1 {
				t.Fatal("first central shipment lacks a unique nonzero runtime identity")
			}
			if tc.ai && central != 128 {
				t.Fatal("maximum authored ID prevented deterministic free-ID selection", central)
			}
			a.report["central_id"] = central
			twins := []*sim.Engine{}
			addTwin := func(name string) {
				t.Helper()
				save := a.writeSave(name, e)
				twin, restoreErr := sim.Restore(content.MustBase(), save)
				if restoreErr != nil || twin.Hash() != e.Hash() {
					t.Fatal("canonical shipment snapshot cannot restore exactly", name, restoreErr)
				}
				twins = append(twins, twin)
			}
			addTwin("first-arrival")
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			order := sim.Order{Kind: "gather", Entities: []sim.ID{hauler}, Target: sim.ID(central)}
			view, _ := e.PlayerView(1)
			if err = twins[0].Submit(1, view.Economy.LastSequence+1, []sim.Order{order}); err != nil {
				t.Fatal(err)
			}
			a.issue(order)
			twins[0].Advance()
			deliveries := map[[2]uint32]bool{}
			step := func() {
				a.step()
				for _, twin := range twins {
					twin.Advance()
				}
				for _, player := range []sim.PlayerID{1, 2} {
					feedback, ok := e.PlayerFeedback(player)
					if !ok {
						continue
					}
					for _, event := range feedback.Events {
						if event.Kind == "cargo_delivered" && event.Tick > firstDue {
							deliveries[[2]uint32{uint32(event.Tick), uint32(event.Entity)}] = true
						}
					}
				}
			}
			centralStock := func(v sim.View) int64 {
				for _, field := range v.Fields {
					if field.ID == central {
						return field.Remaining
					}
				}
				t.Fatal("ordinary shared sight lost the central field")
				return -1
			}
			inFlight := false
			for range 1600 {
				view, _ = e.PlayerView(1)
				for _, entity := range view.Entities {
					if entity.ID == hauler && entity.Private != nil && entity.Private.Cargo > 0 && centralStock(view) > 0 {
						inFlight = true
					}
				}
				if inFlight {
					break
				}
				step()
			}
			if !inFlight {
				t.Fatal("ordinary central loading did not create carried cargo")
			}
			addTwin("central-in-flight")
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			delivered := false
			for range 16000 {
				view, _ = e.PlayerView(1)
				if centralStock(view) == 0 {
					income := int64(0)
					for _, player := range e.StateCopy().Players {
						income += player.Income
					}
					if income == 128*2000+6000000 {
						delivered = true
						break
					}
				}
				step()
			}
			if !delivered || len(deliveries) < 10 || a.countAt <= firstDue {
				t.Fatal("ordinary loading, repeated deliveries or second countdown did not complete", delivered, len(deliveries), a.countAt)
			}
			a.report["central_deliveries"] = len(deliveries)
			a.report["first_central_fully_delivered_tick"] = e.Tick()
			secondDue := a.countAt + sim.Tick(180*sim.TickRate)
			for e.Tick() < a.countAt+sim.Tick(90*sim.TickRate) {
				step()
			}
			addTwin("second-midpoint")
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			preArrivalCheckpoints := append([]sim.ReplayCheckpoint(nil), replay.Checkpoints...)
			for e.Tick() < secondDue {
				step()
			}
			secondState := e.StateCopy()
			view, _ = e.PlayerView(1)
			if a.arrived != secondDue || centralStock(view) != 6000000 || len(secondState.Fields) != len(m.Fields)+1 {
				t.Fatal("second arrival changed timing, amount or bounded field count", a.arrived, secondDue, len(secondState.Fields))
			}
			for _, field := range secondState.Fields {
				if position, original := authored[field.ID]; original {
					if field.Position != position || field.Remaining != 0 {
						t.Fatal("second shipment changed an exhausted authored field")
					}
				} else if field.ID != central || field.Position != m.Shipment {
					t.Fatal("second shipment changed its persistent identity")
				}
			}
			addTwin("second-arrival")
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			for range 80 {
				step()
			}
			for _, twin := range twins {
				if twin.Hash() != e.Hash() {
					t.Fatal("first-arrival/in-flight/second-midpoint native continuation diverged")
				}
			}
			if tc.ai {
				observed := e.StateCopy().Players[1].AIFields
				if len(observed) != len(m.Fields)+1 {
					t.Fatal("second shipment grew ordinary AI field memory", len(observed))
				}
				refreshed := false
				for _, field := range observed {
					if field.ID == central && field.Position == m.Shipment && field.Remaining > 0 {
						refreshed = true
					}
				}
				if !refreshed {
					t.Fatal("ordinary public observation did not refresh central remaining stock")
				}
				a.report["observed_ai_fields"] = len(observed)
			}
			addTwin("final")
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			for _, checkpoints := range [][]sim.ReplayCheckpoint{nil, preArrivalCheckpoints, replay.Checkpoints} {
				recording := *replay
				recording.Checkpoints = checkpoints
				played, seekErr := recording.Seek(content.MustBase(), e.Tick())
				if seekErr != nil || played.Hash() != e.Hash() {
					t.Fatal("ordinary second-shipment full/midpoint/postarrival replay diverged", seekErr)
				}
			}
			a.report["full_midpoint_and_postarrival_replay_hash"] = e.Hash()
			a.report["runtime_fields"] = len(secondState.Fields)
			recording, err := json.Marshal(replay)
			if err != nil {
				t.Fatal(err)
			}
			a.write("replay.json", recording)
			t.Logf("ordinary central shipments first=%d second=%d central_id=%d fields=%d deliveries=%d final_tick=%d hash=%s", firstDue, secondDue, central, len(secondState.Fields), len(deliveries), e.Tick(), e.Hash())
		})
	}
}

func TestShipmentRestoreRejectsNoncanonicalRuntimeFields(t *testing.T) {
	a := shipmentNewAudit(t, shipmentCapacityMap(2), false)
	for _, tc := range []struct {
		name   string
		mutate func(*sim.State)
	}{
		{"missing_original", func(s *sim.State) { s.Fields = s.Fields[1:] }},
		{"moved_original", func(s *sim.State) { s.Fields[0].Position.X += 1000 }},
		{"extra_away_from_center", func(s *sim.State) {
			s.Fields = append(s.Fields, &sim.ResourceField{ID: 3, Position: sim.Vec{X: 32000, Y: 32000}, Remaining: 6000000})
		}},
		{"two_center_fields", func(s *sim.State) {
			s.Fields = append(s.Fields, &sim.ResourceField{ID: 3, Position: s.Map.Shipment, Remaining: 0}, &sim.ResourceField{ID: 4, Position: s.Map.Shipment, Remaining: 6000000})
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := a.engine.StateCopy()
			tc.mutate(&state) // Corrupt only detached input offered to Restore.
			raw, err := json.Marshal(state)
			if err != nil {
				t.Fatal(err)
			}
			sum := sha256.Sum256(raw)
			save, err := json.Marshal(struct {
				Version uint32          `json:"version"`
				SHA256  string          `json:"sha256"`
				State   json.RawMessage `json:"state"`
			}{Version: 1, SHA256: hex.EncodeToString(sum[:]), State: raw})
			if err != nil {
				t.Fatal(err)
			}
			if _, err = sim.Restore(content.MustBase(), save); err == nil {
				t.Fatal("checksummed noncanonical runtime fields accepted")
			}
		})
	}
}
