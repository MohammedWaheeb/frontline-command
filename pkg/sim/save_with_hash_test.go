package sim_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// F4: SaveWithHash must return exactly Save()'s envelope bytes and
// exactly Hash()'s digest, so callers never need to marshal the full
// state a second time just to obtain the hash of a save they made.
func TestSaveWithHashMatchesSaveAndHash(t *testing.T) {
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
	check := func(stage string) {
		t.Helper()
		gotData, gotHash, err := e.SaveWithHash()
		if err != nil {
			t.Fatalf("%s: SaveWithHash: %v", stage, err)
		}
		wantData, err := e.Save()
		if err != nil {
			t.Fatalf("%s: Save: %v", stage, err)
		}
		if !bytes.Equal(gotData, wantData) {
			t.Fatalf("%s: SaveWithHash bytes differ from Save bytes", stage)
		}
		if wantHash := e.Hash(); gotHash != wantHash {
			t.Fatalf("%s: SaveWithHash hash %s != Hash %s", stage, gotHash, wantHash)
		}
	}
	check("fresh")
	for i := 0; i < 137; i++ {
		e.Advance()
	}
	check("after 137 ticks")
	for i := 0; i < 463; i++ {
		e.Advance()
	}
	check("after 600 ticks")
	// A restored engine must produce the same pair for the same state.
	data2, hash2, err := e.SaveWithHash()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := sim.Restore(c, data2)
	if err != nil {
		t.Fatal(err)
	}
	data3, hash3, err := restored.SaveWithHash()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(data3, data2) || hash3 != hash2 {
		t.Fatal("restored SaveWithHash differs from live SaveWithHash")
	}
}
