package sim_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"testing"
)

// Explicit diagnostic after the original acceptance wait failed. No mission
// timer changes; all existing human orders and paid jobs continue without new
// human commands. A from-opening command reconstruction is the comparison twin.
func TestAuthoredTerritorySavedContinuation(t *testing.T) {
	input, out := os.Getenv("FRONTLINE_TERRITORY_CONTINUATION"), os.Getenv("FRONTLINE_TERRITORY_DIAGNOSTIC")
	if input == "" || out == "" {
		t.Skip("opt-in exact failed-save continuation")
	}
	read := func(name, want string) []byte {
		b, e := os.ReadFile(filepath.Join(input, name))
		if e != nil {
			t.Fatal(e)
		}
		h := sha256.Sum256(b)
		if hex.EncodeToString(h[:]) != want {
			t.Fatal("unexpected original artifact", name)
		}
		return b
	}
	data := read("state.save.json", "c45b404910f26d9fcdcb699cd0a69c455e682e8b3db7d168ad349688b8e82131")
	ledger := read("driver-orders.json", "bde5f2cf0b297c1c9f7910f170af6375eabc5fa276359a6233c33d476b59219b")
	var trace struct {
		Tick sim.Tick        `json:"tick"`
		Hash string          `json:"hash"`
		Rows []authoredOrder `json:"completed_batches"`
	}
	if err := json.Unmarshal(ledger, &trace); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(out, 0755); err != nil {
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
	saved, err := sim.Restore(r.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Tick() != trace.Tick || saved.Hash() != trace.Hash {
		t.Fatal("restored original boundary differs")
	}
	at := 0
	for r.engine.Tick() <= trace.Tick {
		tick := r.engine.Tick()
		for at < len(trace.Rows) && trace.Rows[at].Tick == tick {
			row := trace.Rows[at]
			if err = r.engine.Submit(row.Player, row.Sequence, row.Orders); err != nil {
				t.Fatal(err)
			}
			at++
		}
		if tick == trace.Tick {
			break
		}
		r.engine.Advance()
	}
	if at != len(trace.Rows) || r.engine.Hash() != saved.Hash() {
		t.Fatal("from-opening original trace differs")
	}
	type sample struct {
		Tick    sim.Tick         `json:"tick"`
		Hash    string           `json:"hash"`
		Mission *sim.MissionView `json:"mission"`
		Outcome sim.Outcome      `json:"outcome"`
	}
	samples := []sample{}
	capture := func() {
		hash := saved.Hash()
		v, ok := saved.PlayerView(1)
		if !ok {
			t.Fatal("owner view unavailable")
		}
		samples = append(samples, sample{saved.Tick(), hash, v.Mission, saved.Outcome()})
		if hash != saved.Hash() {
			t.Fatal("view mutated state")
		}
	}
	capture()
	firstCounterattack := sim.Tick(0)
	previousProgress := int64(1348)
	for saved.Tick() < trace.Tick+6000 && !saved.Outcome().Finished {
		saved.Advance()
		r.engine.Advance()
		if saved.Tick()%100 == 0 || saved.Outcome().Finished {
			if saved.Hash() != r.engine.Hash() {
				t.Fatal("continuation replay/restore mismatch")
			}
			capture()
			v, _ := saved.PlayerView(1)
			for _, o := range v.Mission.Objectives {
				if o.ID == "two-approaches" {
					if int64(o.Progress) < previousProgress && firstCounterattack == 0 {
						firstCounterattack = saved.Tick()
					}
					previousProgress = int64(o.Progress)
				}
			}
		}
	}
	if saved.Hash() != r.engine.Hash() {
		t.Fatal("final continuation branches differ")
	}
	capture()
	final, err := saved.Save()
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(out, "continued.save.json"), final, 0644); err != nil {
		t.Fatal(err)
	}
	restored, err := sim.Restore(r.catalog, final)
	if err != nil || restored.Hash() != saved.Hash() {
		t.Fatal("continued save invalid", err)
	}
	v, _ := saved.PlayerView(1)
	write("continued.owner-view.json", v)
	write("samples.json", samples)
	write("continuation.json", struct {
		OriginalTick            sim.Tick    `json:"original_failed_test_tick"`
		AdditionalTicks         sim.Tick    `json:"additional_ticks"`
		HumanCommands           int         `json:"additional_human_commands"`
		FirstHoldReset          sim.Tick    `json:"first_sampled_hold_reset"`
		FinalHash               string      `json:"final_hash"`
		Outcome                 sim.Outcome `json:"outcome"`
		OriginalGateStillFailed bool        `json:"original_gate_remains_failed"`
	}{trace.Tick, saved.Tick() - trace.Tick, 0, firstCounterattack, saved.Hash(), saved.Outcome(), true})
	t.Log(fmt.Sprintf("DIAGNOSTIC tick%d +%d outcome%+v hash%s; original acceptance still failed", saved.Tick(), saved.Tick()-trace.Tick, saved.Outcome(), saved.Hash()))
}
