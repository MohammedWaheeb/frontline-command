package sim

import (
	"bytes"
	"encoding/json"
	"errors"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

func checkpointSameReplay(t *testing.T, want, got *Replay) {
	t.Helper()
	a, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("replay fields differ from original Capture")
	}
}

func TestCaptureCheckpointOriginalBytesAndDetachedSave(t *testing.T) {
	e := fixture(t)
	old, _ := NewReplay(e)
	wrapped, _ := NewReplay(e)
	reused, _ := NewReplay(e)
	for phase := 0; phase < 5; phase++ {
		issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: int32(18000 + phase*1000), Y: 16000}})
		ticks(e, 3)
		checkpoint := phase%2 == 0
		before := e.Hash()
		wantSave, _ := e.Save()
		if err := old.legacyCheckpointCapture(e, checkpoint); err != nil {
			t.Fatal(err)
		}
		if err := wrapped.Capture(e, checkpoint); err != nil {
			t.Fatal(err)
		}
		if checkpoint {
			save, err := reused.CaptureCheckpoint(e)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(wantSave, save) {
				t.Fatal("returned persistence save differs")
			}
			checkpointSameReplay(t, old, reused)
			save[len(save)/2] ^= 0xff
			checkpointSameReplay(t, old, reused)
		} else if err := reused.Capture(e, false); err != nil {
			t.Fatal(err)
		}
		checkpointSameReplay(t, old, wrapped)
		checkpointSameReplay(t, old, reused)
		if e.Hash() != before {
			t.Fatal("capturing or mutating returned save changed engine")
		}
	}
	a, _ := old.Encode()
	b, _ := reused.Encode()
	if !bytes.Equal(a, b) {
		t.Fatal("complete compressed replay bytes differ")
	}
	seek, err := reused.Seek(e.catalog, e.Tick())
	if err != nil || seek.Hash() != e.Hash() {
		t.Fatal("checkpoint seek", err)
	}
	reused.Checkpoints = nil
	seek, err = reused.Seek(e.catalog, e.Tick())
	if err != nil || seek.Hash() != e.Hash() {
		t.Fatal("full replay", err)
	}
}

func TestCaptureCheckpointOriginalErrorContract(t *testing.T) {
	for _, mode := range []string{"metadata", "version", "backwards", "missed_window", "duplicate"} {
		t.Run(mode, func(t *testing.T) {
			e := fixture(t)
			old, _ := NewReplay(e)
			wrapped, _ := NewReplay(e)
			reused, _ := NewReplay(e)
			issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 18000, Y: 16000}})
			for _, r := range []*Replay{old, wrapped, reused} {
				switch mode {
				case "metadata":
					r.Metadata.Simulation = "wrong"
				case "version":
					r.Version = 0
				case "backwards":
					r.Recorded = 999
				case "duplicate":
					r.Checkpoints = []ReplayCheckpoint{{Tick: e.Tick()}}
				}
			}
			if mode == "missed_window" {
				e.state.LogBase = 1
			}
			want := old.legacyCheckpointCapture(e, true)
			wrapErr := wrapped.Capture(e, true)
			save, got := reused.CaptureCheckpoint(e)
			if want == nil || wrapErr == nil || got == nil || want.Error() != wrapErr.Error() || want.Error() != got.Error() || save != nil {
				t.Fatalf("error/save contract: %v / %v / %v", want, wrapErr, got)
			}
			checkpointSameReplay(t, old, wrapped)
			checkpointSameReplay(t, old, reused)
		})
	}
}

func TestCaptureCheckpointActual688Artifact(t *testing.T) {
	input, output := os.Getenv("FRONTLINE_CHECKPOINT_INPUT"), os.Getenv("FRONTLINE_CHECKPOINT_OUTPUT")
	if input == "" || output == "" {
		t.Skip("explicit actual688 artifact paths required")
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	e, err := Restore(content.MustBase(), raw)
	if err != nil {
		t.Fatal(err)
	}
	if e.Tick() != 600 || len(e.state.Entities) != 688 || e.Hash() != "71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1" {
		t.Fatal("actual server boundary identity changed")
	}
	old, _ := NewReplay(e)
	reused, _ := NewReplay(e)
	if err := old.legacyCheckpointCapture(e, true); err != nil {
		t.Fatal(err)
	}
	save, err := reused.CaptureCheckpoint(e)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, save) {
		t.Fatal("actual original persistence bytes changed")
	}
	checkpointSameReplay(t, old, reused)
	a, err := old.Encode()
	if err != nil {
		t.Fatal(err)
	}
	b, err := reused.Encode()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("actual replay bytes changed")
	}
	if err := os.Mkdir(output, 0700); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"boundary.save.json": save, "boundary.replay.gz": b, "checkpoint.gz": reused.Checkpoints[0].PackedSave} {
		if err := os.WriteFile(filepath.Join(output, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

// Exact 3d49 Capture implementation retained as a byte/error oracle.
func (r *Replay) legacyCheckpointCapture(e *Engine, checkpoint bool) error {
	if r.Metadata != e.Metadata() || r.Version != 2 || r.Recorded < e.state.LogBase {
		return errors.New("replay recorder missed its bounded command window")
	}
	end := e.state.LogBase + uint64(len(e.state.Log))
	if r.Recorded > end {
		return errors.New("replay recorder moved backwards")
	}
	for _, cmd := range e.state.Log[r.Recorded-e.state.LogBase:] {
		cmd.Orders = cloneOrders(cmd.Orders)
		r.Commands = append(r.Commands, cmd)
	}
	r.Recorded = end
	r.FinalTick = e.Tick()
	if len(r.Commands) >= 1024 || checkpoint || e.Outcome().Finished {
		if err := r.flush(); err != nil {
			return err
		}
	}
	if checkpoint {
		if len(r.Checkpoints) > 0 && r.Checkpoints[len(r.Checkpoints)-1].Tick >= e.Tick() {
			return errors.New("checkpoint ticks must increase")
		}
		save, err := e.Save()
		if err != nil {
			return err
		}
		packed, err := compressReplay(save)
		if err != nil {
			return err
		}
		r.Checkpoints = append(r.Checkpoints, ReplayCheckpoint{Tick: e.Tick(), PackedSave: packed})
	}
	return nil
}
