package sim_test

// Failure-only acceptance-harness diagnostics. This is never a mission tactic,
// simulation feature, successful route or replacement for a missing old artifact.
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"frontlinecommand/pkg/sim"
)

type authoredAttempt struct {
	authoredOrder
	Stage string `json:"stage"`
	Error string `json:"error,omitempty"`
}
type authoredFailureArtifact struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}
type authoredFailureManifest struct {
	Format          int                                `json:"format"`
	Test            string                             `json:"test"`
	Mission         string                             `json:"mission"`
	Difficulty      string                             `json:"difficulty"`
	Faction         string                             `json:"faction"`
	StateAvailable  bool                               `json:"state_available"`
	Tick            sim.Tick                           `json:"tick"`
	StateHash       string                             `json:"state_hash,omitempty"`
	SourceUnchanged bool                               `json:"source_unchanged"`
	Artifacts       map[string]authoredFailureArtifact `json:"artifacts"`
	Errors          []string                           `json:"errors"`
}

func copyDiagnosticOrders(orders []sim.Order) []sim.Order {
	out := append([]sim.Order(nil), orders...)
	for i := range out {
		out[i].Entities = append([]sim.ID(nil), out[i].Entities...)
		out[i].Points = append([]sim.Vec(nil), out[i].Points...)
	}
	return out
}
func diagnosticName(value string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, value)
}
func (r *authoredRun) captureFatalDiagnostics() {
	directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE")
	if directory == "" {
		return
	}
	if err := os.MkdirAll(directory, 0755); err != nil {
		r.t.Logf("failure diagnostics unavailable: %v", err)
		return
	}
	prefix := diagnosticName(r.definition.ID + "-" + r.faction + "-" + r.difficulty + r.evidenceSuffix)
	target, err := os.MkdirTemp(directory, prefix+".fatal-")
	if err != nil {
		r.t.Logf("failure diagnostics unavailable: %v", err)
		return
	}
	manifest := authoredFailureManifest{Format: 1, Test: r.t.Name(), Mission: r.definition.ID, Difficulty: r.difficulty, Faction: r.faction, Artifacts: map[string]authoredFailureArtifact{}, Errors: []string{}}
	write := func(name string, data []byte, err error) {
		if err != nil {
			manifest.Errors = append(manifest.Errors, name+": "+err.Error())
			return
		}
		if err = os.WriteFile(filepath.Join(target, name), data, 0644); err != nil {
			manifest.Errors = append(manifest.Errors, name+": "+err.Error())
			return
		}
		sum := sha256.Sum256(data)
		manifest.Artifacts[name] = authoredFailureArtifact{name, hex.EncodeToString(sum[:]), len(data)}
	}
	if r.engine == nil {
		manifest.Errors = append(manifest.Errors, "No authoritative engine exists: initialization failed before a live state was available.")
	} else {
		manifest.StateAvailable = true
		manifest.Tick = r.engine.Tick()
		manifest.StateHash = r.engine.Hash()
		saved, saveErr := r.engine.Save()
		write("state.save.json", saved, saveErr)
		view, ok := r.engine.PlayerView(1)
		if !ok {
			manifest.Errors = append(manifest.Errors, "Owner1 view unavailable")
		} else {
			data, e := json.MarshalIndent(view, "", "  ")
			write("owner.view.json", data, e)
		}
		ledger := struct {
			Tick      sim.Tick         `json:"tick"`
			Hash      string           `json:"hash"`
			Completed []authoredOrder  `json:"completed_batches"`
			Attempted *authoredAttempt `json:"attempted_batch,omitempty"`
		}{manifest.Tick, manifest.StateHash, r.orders, r.diagnosticAttempt}
		data, e := json.MarshalIndent(ledger, "", "  ")
		write("driver-orders.json", data, e)
		manifest.SourceUnchanged = r.engine.Tick() == manifest.Tick && r.engine.Hash() == manifest.StateHash
		if !manifest.SourceUnchanged {
			manifest.Errors = append(manifest.Errors, "Diagnostic capture changed source state")
		}
	}
	data, e := json.MarshalIndent(manifest, "", "  ")
	if e == nil {
		e = os.WriteFile(filepath.Join(target, "manifest.json"), append(data, '\n'), 0644)
	}
	if e != nil {
		r.t.Logf("failure diagnostic manifest unavailable: %v", e)
	} else {
		r.t.Logf("failure diagnostics: %s (state available=%t, unchanged=%t)", target, manifest.StateAvailable, manifest.SourceUnchanged)
	}
}
func (r *authoredRun) diagnosticAttemptError(stage string, err any) {
	if r.diagnosticAttempt != nil {
		r.diagnosticAttempt.Stage = stage
		r.diagnosticAttempt.Error = fmt.Sprint(err)
	}
}
