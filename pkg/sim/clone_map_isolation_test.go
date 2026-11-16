package sim

import (
	"bytes"
	"testing"
)

func TestCloneStateRequiredPacksAreDetached(t *testing.T) {
	e := fixture(t)
	e.state.Map.RequiredPacks = []string{"base", "desert"}
	before, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	beforeHash := e.Hash()
	snapshot := e.CloneState()
	snapshot.Map.RequiredPacks[0] = "snapshot-only"
	after, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, after) || e.Hash() != beforeHash {
		t.Fatal("mutating a snapshot's asset packs changed the live engine save/hash")
	}
	e.state.Map.RequiredPacks[1] = "live-only"
	if snapshot.Map.RequiredPacks[1] != "desert" {
		t.Fatal("mutating live asset packs changed an existing snapshot")
	}
}
