package sim_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// Each deliberately failing child is a harness probe, not a mission route.
func TestAuthoredFatalProbeChild(t *testing.T) {
	mode := os.Getenv("FRONTLINE_FATAL_PROBE")
	if mode == "" {
		t.Skip("subprocess diagnostic probe only")
	}
	var r *authoredRun
	// Registered first, so this runs after the harness's failure capture.
	t.Cleanup(func() {
		if r == nil || r.engine == nil || !t.Failed() {
			return
		}
		data, _ := json.Marshal(map[string]any{"hash": r.engine.Hash(), "tick": r.engine.Tick()})
		if err := os.WriteFile(os.Getenv("FRONTLINE_FATAL_VERIFY"), data, 0644); err != nil {
			t.Log(err)
		}
	})
	if mode == "setup" {
		newAuthoredRun(t, "missing-authored-diagnostic-probe", "normal", "US")
		t.Fatal("setup unexpectedly succeeded")
	}
	r = newAuthoredRun(t, "tutorial-1-give-an-order", "normal", "")
	units := r.ids("starting-rifles")
	r.issue(1, sim.Order{Kind: "stop", Entities: units})
	switch mode {
	case "direct", "disabled":
		t.Fatal("deliberate driver cohort failure")
	case "helper":
		r.ids("missing-diagnostic-tag")
	case "submit":
		r.issue(1, sim.Order{Kind: "stop", Entities: []sim.ID{999999}})
	case "rejected":
		r.issue(1, sim.Order{Kind: "gather", Entities: units[:1], Target: 1}, sim.Order{Kind: "stop", Entities: units})
	case "success":
		return
	default:
		t.Fatal("unknown diagnostic probe")
	}
	t.Fatal("probe failed to stop at expected fatal")
}
func TestAuthoredFatalDiagnostics(t *testing.T) {
	if os.Getenv("FRONTLINE_TEST_FATAL_DIAGNOSTICS") != "1" {
		t.Skip("explicit small diagnostic test only")
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"direct", "helper", "submit", "rejected", "setup", "success", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			directory := t.TempDir()
			if preserved := os.Getenv("FRONTLINE_FATAL_PROBE_EVIDENCE_ROOT"); preserved != "" {
				if err := os.MkdirAll(preserved, 0755); err != nil {
					t.Fatal(err)
				}
				var err error
				directory, err = os.MkdirTemp(preserved, mode+"-")
				if err != nil {
					t.Fatal(err)
				}
			}
			evidence := filepath.Join(directory, "evidence")
			verify := filepath.Join(directory, "after.json")
			command := exec.Command(executable, "-test.run=^TestAuthoredFatalProbeChild$", "-test.count=1", "-test.v")
			env := []string{}
			for _, item := range os.Environ() {
				if !strings.HasPrefix(item, "FRONTLINE_FATAL_") && !strings.HasPrefix(item, "FRONTLINE_MISSION_EVIDENCE=") {
					env = append(env, item)
				}
			}
			env = append(env, "FRONTLINE_FATAL_PROBE="+mode, "FRONTLINE_FATAL_VERIFY="+verify)
			if mode != "disabled" {
				env = append(env, "FRONTLINE_MISSION_EVIDENCE="+evidence)
			}
			command.Env = env
			output, runErr := command.CombinedOutput()
			if err := os.WriteFile(filepath.Join(directory, "child.log"), output, 0644); err != nil {
				t.Fatal(err)
			}
			if mode == "success" {
				if runErr != nil {
					t.Fatalf("success probe failed: %v\n%s", runErr, output)
				}
			} else if runErr == nil {
				t.Fatal("intentional fatal child unexpectedly passed")
			}
			manifests, err := filepath.Glob(filepath.Join(evidence, "*.fatal-*", "manifest.json"))
			if err != nil {
				t.Fatal(err)
			}
			if mode == "success" || mode == "disabled" {
				if len(manifests) != 0 {
					t.Fatal("failure diagnostics emitted without failure/opt-in")
				}
				return
			}
			if len(manifests) != 1 {
				t.Fatalf("expected one failure manifest, got %d; %s", len(manifests), output)
			}
			raw, err := os.ReadFile(manifests[0])
			if err != nil {
				t.Fatal(err)
			}
			var manifest authoredFailureManifest
			if err = json.Unmarshal(raw, &manifest); err != nil {
				t.Fatal(err)
			}
			if mode == "setup" {
				if manifest.StateAvailable || len(manifest.Artifacts) != 0 || len(manifest.Errors) != 1 {
					t.Fatal("setup failure falsely claimed a state", manifest)
				}
				return
			}
			if !manifest.StateAvailable || !manifest.SourceUnchanged || len(manifest.Errors) != 0 || len(manifest.Artifacts) != 3 {
				t.Fatal("incomplete diagnostics", manifest)
			}
			var after struct {
				Hash string   `json:"hash"`
				Tick sim.Tick `json:"tick"`
			}
			raw, err = os.ReadFile(verify)
			if err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(raw, &after); err != nil {
				t.Fatal(err)
			}
			if after.Hash != manifest.StateHash || after.Tick != manifest.Tick {
				t.Fatal("cleanup changed source engine")
			}
			folder := filepath.Dir(manifests[0])
			for name, artifact := range manifest.Artifacts {
				data, err := os.ReadFile(filepath.Join(folder, name))
				if err != nil {
					t.Fatal(err)
				}
				sum := sha256.Sum256(data)
				if artifact.File != name || artifact.Bytes != len(data) || artifact.SHA256 != hex.EncodeToString(sum[:]) {
					t.Fatal("artifact receipt differs from bytes", name)
				}
			}
			saved, err := os.ReadFile(filepath.Join(folder, "state.save.json"))
			if err != nil {
				t.Fatal(err)
			}
			restored, err := sim.Restore(content.MustBase(), saved)
			if err != nil {
				t.Fatal(err)
			}
			if restored.Hash() != manifest.StateHash || restored.Tick() != manifest.Tick {
				t.Fatal("preserved save does not restore exactly")
			}
			raw, err = os.ReadFile(filepath.Join(folder, "owner.view.json"))
			if err != nil {
				t.Fatal(err)
			}
			var captured sim.View
			if err = json.Unmarshal(raw, &captured); err != nil {
				t.Fatal(err)
			}
			actual, ok := restored.PlayerView(1)
			a, _ := json.Marshal(actual)
			b, _ := json.Marshal(captured)
			if !ok || string(a) != string(b) {
				t.Fatal("captured owner view differs from exact restored view")
			}
			raw, err = os.ReadFile(filepath.Join(folder, "driver-orders.json"))
			if err != nil {
				t.Fatal(err)
			}
			var ledger struct {
				Completed []authoredOrder  `json:"completed_batches"`
				Attempt   *authoredAttempt `json:"attempted_batch"`
			}
			if err = json.Unmarshal(raw, &ledger); err != nil {
				t.Fatal(err)
			}
			if len(ledger.Completed) != 1 || len(ledger.Completed[0].Results) != 1 || !ledger.Completed[0].Results[0].Accepted {
				t.Fatal("completed ordinary command missing")
			}
			switch mode {
			case "direct", "helper":
				if ledger.Attempt != nil {
					t.Fatal("invented in-flight command")
				}
			case "submit":
				if ledger.Attempt == nil || ledger.Attempt.Stage != "submit" || ledger.Attempt.Error != "not_owner" || len(ledger.Attempt.Results) != 0 {
					t.Fatal("failed submission missing", ledger.Attempt)
				}
			case "rejected":
				if ledger.Attempt == nil || ledger.Attempt.Stage != "execution_rejected" || len(ledger.Attempt.Results) != 2 || ledger.Attempt.Results[0].Accepted || !ledger.Attempt.Results[1].Accepted {
					t.Fatal("failed execution receipt missing", ledger.Attempt)
				}
			}
			t.Logf("%s: final tick %d hash %s, exact save/view/ledger and unchanged source", mode, manifest.Tick, manifest.StateHash)
		})
	}
}
