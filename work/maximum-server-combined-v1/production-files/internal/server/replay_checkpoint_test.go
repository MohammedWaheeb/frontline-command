package server

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

func TestRecordReplayCheckpointPreservesSaveAndFailureFallback(t *testing.T) {
	for _, mode := range []string{"success", "metadata", "version", "recorded", "duplicate"} {
		t.Run(mode, func(t *testing.T) {
			e, err := sim.New(content.MustBase(), sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
			if err != nil {
				t.Fatal(err)
			}
			old, _ := sim.NewReplay(e)
			got, _ := sim.NewReplay(e)
			e.Advance()
			if mode == "duplicate" {
				if err := old.Capture(e, true); err != nil {
					t.Fatal(err)
				}
				if err := got.Capture(e, true); err != nil {
					t.Fatal(err)
				}
			}
			switch mode {
			case "metadata":
				old.Metadata.Simulation = "wrong"
				got.Metadata.Simulation = "wrong"
			case "version":
				old.Version = 0
				got.Version = 0
			case "recorded":
				old.Recorded++
				got.Recorded++
			}
			before := e.Hash()
			oldErr := old.Capture(e, true)
			want, err := e.Save() // Original server always attempts this even after capture error.
			if err != nil {
				t.Fatal(err)
			}
			save, gotErr := recordReplayCheckpoint(got, e)
			if (oldErr == nil) != (gotErr == nil) || oldErr != nil && oldErr.Error() != gotErr.Error() {
				t.Fatalf("error changed: %v / %v", oldErr, gotErr)
			}
			if mode != "success" && gotErr == nil {
				t.Fatal("missing expected recorder error")
			}
			if !bytes.Equal(want, save) || e.Hash() != before {
				t.Fatal("save bytes or state changed")
			}
			a, _ := json.Marshal(old)
			b, _ := json.Marshal(got)
			if !bytes.Equal(a, b) {
				t.Fatal("replay partial/success state changed")
			}
			if mode == "success" {
				a, _ = old.Encode()
				b, _ = got.Encode()
				if !bytes.Equal(a, b) {
					t.Fatal("complete replay bytes changed")
				}
			}
		})
	}
}
