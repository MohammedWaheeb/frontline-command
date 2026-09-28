package sim_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/sim"
)

// Replays only the preserved accepted player commands. It introduces no new
// tactic or mutable fixture state. Selected outputs are authorized owner views.
func TestAuthoredProgressDiagnosis(t *testing.T) {
	ledger := os.Getenv("FRONTLINE_TERRITORY_LEDGER")
	out := os.Getenv("FRONTLINE_TERRITORY_DIAGNOSTIC")
	if ledger == "" || out == "" {
		t.Skip("opt-in exact failed commander replay")
	}
	data, err := os.ReadFile(ledger)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(data)
	if hex.EncodeToString(digest[:]) != "fde56b26ee6caeab2a3944e8befcaab6a8cfe8b18936fcaacd26407fb8f607f0" {
		t.Fatal("unexpected failed run ledger")
	}
	var trace struct {
		Tick sim.Tick        `json:"tick"`
		Hash string          `json:"hash"`
		Rows []authoredOrder `json:"completed_batches"`
	}
	if err = json.Unmarshal(data, &trace); err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(out, 0755); err != nil {
		t.Fatal(err)
	}
	write := func(name string, value any) {
		b, e := json.MarshalIndent(value, "", "  ")
		if e != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(filepath.Join(out, name), append(b, '\n'), 0644); e != nil {
			t.Fatal(e)
		}
	}
	r := newAuthoredRun(t, "sy-03-three-crossings", "hard", "")
	selected := map[sim.Tick]bool{2000:true,4000:true,6000:true,8000:true,10000:true,12000:true,16000:true,20000:true}
	at := 0
	for r.engine.Tick() <= trace.Tick {
		tick := r.engine.Tick()
		if selected[tick] {
			hash := r.engine.Hash()
			view := r.view()
			write(fmt.Sprintf("tick-%d.owner-view.json", tick), view)
			if r.engine.Hash() != hash {
				t.Fatal("view or advice changed replay state")
			}
		}
		for at < len(trace.Rows) && trace.Rows[at].Tick == tick {
			row := trace.Rows[at]
			if err = r.engine.Submit(row.Player, row.Sequence, row.Orders); err != nil {
				t.Fatalf("preserved batch %d at %d: %v", at, tick, err)
			}
			at++
		}
		if tick == trace.Tick {
			break
		}
		if r.engine.Outcome().Finished {
			t.Fatal("replay ended before original final tick")
		}
		r.engine.Advance()
	}
	if at != len(trace.Rows) || r.engine.Hash() != trace.Hash {
		t.Fatalf("failed trace reconstruction differs: rows%d/%d hash%s expected%s", at, len(trace.Rows), r.engine.Hash(), trace.Hash)
	}
	write("reconstruction.json", struct {
		Tick    sim.Tick    `json:"tick"`
		Hash    string      `json:"hash"`
		Outcome sim.Outcome `json:"outcome"`
		Batches int         `json:"batches"`
	}{r.engine.Tick(), r.engine.Hash(), r.engine.Outcome(), at})
	t.Logf("Exact failed trace reconstructed tick%d hash%s; eight owner-view boundaries unchanged", r.engine.Tick(), r.engine.Hash())
}
