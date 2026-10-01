package sim_test

import (
	"encoding/json"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
)

// This additive acceptance gate retains the original full replay and midpoint
// continuation gates. It checks a real nonterminal recorded checkpoint and
// archive bytes; it never edits actors, rules, economy, orders or deadlines.
func (r *authoredRun) verifyWinningCheckpointPersistence() {
	r.t.Helper()
	finalSave, err := r.engine.Save()
	if err != nil {
		r.t.Fatal(err)
	}
	restored, err := sim.Restore(r.catalog, finalSave)
	if err != nil {
		r.t.Fatal("winning final save restore", err)
	}
	if restored.Hash() != r.engine.Hash() || restored.Outcome() != r.engine.Outcome() {
		r.t.Fatal("winning final save restore hash/outcome differs")
	}
	archive, err := r.replay.Encode()
	if err != nil {
		r.t.Fatal("winning replay archive", err)
	}
	recorded, err := sim.DecodeReplay(archive)
	if err != nil {
		r.t.Fatal("winning replay archive decode", err)
	}
	var checkpoint sim.ReplayCheckpoint
	for _, candidate := range recorded.Checkpoints {
		if candidate.Tick > 0 && candidate.Tick < r.engine.Tick() {
			checkpoint = candidate
		}
	}
	if checkpoint.Tick == 0 {
		r.t.Fatal("winning replay lacks real nonterminal checkpoint")
	}
	// With no initial save and exactly this checkpoint, Open must use its saved
	// state. A full initial replay independently determines the checkpoint hash.
	fromCheckpoint := *recorded
	fromCheckpoint.Initial = nil
	fromCheckpoint.Checkpoints = []sim.ReplayCheckpoint{checkpoint}
	fromInitial := *recorded
	fromInitial.Checkpoints = nil
	expected, err := fromInitial.Open(r.catalog, checkpoint.Tick)
	if err != nil {
		r.t.Fatal("full replay to actual checkpoint", err)
	}
	checkpointPlayer, err := fromCheckpoint.Open(r.catalog, checkpoint.Tick)
	if err != nil {
		r.t.Fatal("actual checkpoint restore", err)
	}
	if checkpointPlayer.Engine().Hash() != expected.Engine().Hash() {
		r.t.Fatal("actual checkpoint differs from full replay at same tick")
	}
	seeked, err := fromCheckpoint.Open(r.catalog, r.engine.Tick())
	if err != nil {
		r.t.Fatal("winning checkpoint replay suffix", err)
	}
	if seeked.Engine().Hash() != r.engine.Hash() || seeked.Engine().Outcome() != r.engine.Outcome() {
		r.t.Fatal("winning checkpoint replay hash/outcome differs")
	}
	if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
		if err := os.MkdirAll(directory, 0755); err != nil {
			r.t.Fatal(err)
		}
		prefix := filepath.Join(directory, r.definition.ID+"-"+r.faction+"-"+r.difficulty+r.evidenceSuffix+".winning-persistence")
		if err := os.WriteFile(prefix+".save.json", finalSave, 0644); err != nil {
			r.t.Fatal(err)
		}
		if err := os.WriteFile(prefix+".replay.json.gz", archive, 0644); err != nil {
			r.t.Fatal(err)
		}
		receipt, err := json.MarshalIndent(struct {
			CheckpointTick sim.Tick     `json:"checkpoint_tick"`
			CheckpointHash string       `json:"checkpoint_hash"`
			FinalTick      sim.Tick     `json:"final_tick"`
			FinalHash      string       `json:"final_hash"`
			Metadata       sim.Metadata `json:"metadata"`
		}{checkpoint.Tick, expected.Engine().Hash(), r.engine.Tick(), r.engine.Hash(), r.engine.Metadata()}, "", "  ")
		if err != nil {
			r.t.Fatal(err)
		}
		if err := os.WriteFile(prefix+".receipt.json", append(receipt, '\n'), 0644); err != nil {
			r.t.Fatal(err)
		}
	}
	r.t.Logf("WINNING_CHECKPOINT_PERSISTENCE tick=%d checkpoint=%d final_hash=%s", r.engine.Tick(), checkpoint.Tick, r.engine.Hash())
}
