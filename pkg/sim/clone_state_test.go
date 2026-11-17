package sim_test

import (
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

var errMissionCloneChanged = errors.New("mission clone changed while the original advanced")

// CloneState must capture a fully independent snapshot: marshaling the
// clone after the original engine advances must reproduce the save
// bytes taken at clone time, and Save must stay byte-identical.
func TestCloneStateIndependentSnapshot(t *testing.T) {
	c := content.MustBase()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "copper-junction.json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	e, err := sim.New(c, sim.Config{Map: battlefield, Seed: 7, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "A", Faction: "US", Team: 1},
		{ID: 2, Name: "B", Faction: "SY", Team: 2, AI: "normal"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 400; i++ {
		e.Advance()
	}
	want, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	clone := e.CloneState()
	gotNow, err := sim.MarshalState(clone)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(gotNow, want) {
		t.Fatal("MarshalState(CloneState) differs from Save at clone time")
	}
	// Mutate the original hard: ticks advance combat, production,
	// economy, paths, rubble and AI state across every slice family.
	for i := 0; i < 600; i++ {
		e.Advance()
	}
	gotLater, err := sim.MarshalState(clone)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(gotLater, want) {
		t.Fatal("clone changed after the original engine advanced: shared mutable state")
	}
	// And the reverse direction: mutating the clone must not leak back.
	if len(clone.Entities) > 0 && clone.Entities[0] != nil {
		clone.Entities[0].HP = -12345
	}
	if len(clone.Players) > 0 && clone.Players[0] != nil {
		clone.Players[0].Credits = -98765
	}
	after, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(after, []byte("-12345")) || bytes.Contains(after, []byte("-98765")) {
		t.Fatal("clone mutation leaked into the original engine")
	}
}

// Mission engines carry MissionState (definition, triggers, convoys)
// and telemetry; the clone must stay byte-stable there too.
func TestCloneStateMissionSnapshot(t *testing.T) {
	c := content.MustBase()
	mapRaw, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "twin-outposts.json"))
	if err != nil {
		t.Fatal(err)
	}
	m, err := content.DecodeMap(mapRaw)
	if err != nil {
		t.Fatal(err)
	}
	misRaw, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", "twin-outposts.json"))
	if err != nil {
		t.Fatal(err)
	}
	def, err := content.DecodeMission(misRaw, c, m)
	if err != nil {
		t.Fatal(err)
	}
	e, err := sim.NewMission(c, m, def, "normal", 19027)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		e.Advance()
	}
	want, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	wantHash := e.Hash()
	clone := e.CloneState()
	done := make(chan error, 1)
	go func() {
		for i := 0; i < 100; i++ {
			got, err := sim.MarshalState(clone)
			if err != nil {
				done <- err
				return
			}
			if !bytes.Equal(got, want) {
				done <- errMissionCloneChanged
				return
			}
		}
		done <- nil
	}()
	for i := 0; i < 4000; i++ {
		e.Advance()
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	restored, err := sim.Restore(c, want)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != wantHash {
		t.Fatalf("mission clone restored hash %s != clone-tick hash %s", restored.Hash(), wantHash)
	}
}

// Begin/Pack/Append must produce the same checkpoint bytes as the
// synchronous CaptureCheckpoint at the same tick, even when Pack runs
// after the engine advanced.
func TestBeginCheckpointOffLoopEquivalence(t *testing.T) {
	c := content.MustBase()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "copper-junction.json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	e, err := sim.New(c, sim.Config{Map: battlefield, Seed: 11, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "A", Faction: "US", Team: 1},
		{ID: 2, Name: "B", Faction: "SY", Team: 2, AI: "normal"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		e.Advance()
	}
	wantSave, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := replay.BeginCheckpoint(e)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 300; i++ {
		e.Advance()
	}
	save, packed, err := sim.PackCheckpoint(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(save, wantSave) {
		t.Fatal("packed save differs from synchronous save at begin tick")
	}
	if err := replay.AppendCheckpoint(snapshot.Tick, packed); err != nil {
		t.Fatal(err)
	}
	if len(replay.Checkpoints) != 1 || replay.Checkpoints[0].Tick != snapshot.Tick {
		t.Fatalf("checkpoint not recorded: %+v", replay.Checkpoints)
	}
	r, err := gzip.NewReader(bytes.NewReader(replay.Checkpoints[0].PackedSave))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, wantSave) {
		t.Fatal("recorded packed checkpoint does not decompress to the begin-tick save")
	}
}

// The off-loop contract: a clone marshaled on another goroutine while
// the engine keeps advancing restores to the clone-tick hash. Run with
// -race to catch shared mutable state.
func TestCloneStateConcurrentMarshalRestores(t *testing.T) {
	c := content.MustBase()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "copper-junction.json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	e, err := sim.New(c, sim.Config{Map: battlefield, Seed: 23, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "A", Faction: "US", Team: 1},
		{ID: 2, Name: "B", Faction: "SY", Team: 2, AI: "normal"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	type result struct {
		save []byte
		err  error
	}
	for round := 0; round < 12; round++ {
		for i := 0; i < 40; i++ {
			e.Advance()
		}
		wantHash := e.Hash()
		clone := e.CloneState()
		done := make(chan result, 1)
		go func() {
			b, err := sim.MarshalState(clone)
			done <- result{b, err}
		}()
		for i := 0; i < 40; i++ {
			e.Advance()
		}
		got := <-done
		if got.err != nil {
			t.Fatal(got.err)
		}
		restored, err := sim.Restore(c, got.save)
		if err != nil {
			t.Fatalf("round %d: restore off-loop save: %v", round, err)
		}
		if restored.Hash() != wantHash {
			t.Fatalf("round %d: restored hash %s != clone-tick hash %s", round, restored.Hash(), wantHash)
		}
	}
}

func BenchmarkSnapshotPaths(b *testing.B) {
	c := content.MustBase()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", "copper-junction.json"))
	if err != nil {
		b.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		b.Fatal(err)
	}
	e, err := sim.New(c, sim.Config{Map: battlefield, Seed: 29, Ruleset: "standard-v2", Players: []sim.PlayerConfig{
		{ID: 1, Name: "A", Faction: "US", Team: 1},
		{ID: 2, Name: "B", Faction: "SY", Team: 2, AI: "normal"},
	}})
	if err != nil {
		b.Fatal(err)
	}
	for i := 0; i < 1200; i++ {
		e.Advance()
	}
	b.Run("CloneState", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_ = e.CloneState()
		}
	})
	b.Run("Save", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, _ = e.Save()
		}
	})
	b.Run("StateCopy", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_ = e.StateCopy()
		}
	})
}
