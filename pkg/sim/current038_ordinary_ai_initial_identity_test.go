package sim

import (
	"encoding/json"
	"testing"

	"frontlinecommand/pkg/content"
)

// Diagnostic only: bind the actual current initial identity before updating the
// longer ordinary course's version-specific oracle. No advances or state edits.
func TestCurrent038OrdinaryAIInitialIdentityDiagnostic(t *testing.T) {
	battlefield, _ := aiCompetenceMap(t, "copper-junction")
	cfg := Config{Map: battlefield, Seed: 28001, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Name: "US normal bot 1", Faction: "US", Team: 1, AI: "normal"}, {ID: 2, Name: "IR normal bot 2", Faction: "IR", Team: 2, AI: "normal"}}}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := json.Marshal(e.Metadata())
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("actual_initial_hash=%s metadata=%s tick=%d countdown=%d", e.Hash(), metadata, e.Tick(), e.state.Countdown)
	if Version != "0.3.8" || e.Metadata().Simulation != "0.3.8" || e.Tick() != 0 || e.state.Countdown != 100 {
		t.Fatal("diagnostic must observe current 0.3.8 unmodified New state", Version, e.Metadata(), e.Tick(), e.state.Countdown)
	}
}
