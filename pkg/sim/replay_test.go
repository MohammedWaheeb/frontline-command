package sim

import "testing"

func TestReplaySeekMatchesLiveHash(t *testing.T) {
	e := fixture(t)
	r, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 20000, Y: 16000}})
	ticks(e, 99)
	if err = r.Capture(e, true); err != nil {
		t.Fatal(err)
	}
	mid := e.Hash()
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 22000, Y: 25000}})
	ticks(e, 149)
	if err = r.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	end := e.Hash()
	restored, err := r.Seek(e.catalog, 100)
	if err != nil || restored.Hash() != mid {
		t.Fatal("midpoint seek", err)
	}
	restored, err = r.Seek(e.catalog, 250)
	if err != nil || restored.Hash() != end {
		t.Fatal("end seek", err)
	}
	r.Checkpoints = nil
	restored, err = r.Seek(e.catalog, 250)
	if err != nil || restored.Hash() != end {
		t.Fatal("full replay", err)
	}
}

func TestReplayCompressedExportImport(t *testing.T) {
	e := fixture(t)
	r, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 19000, Y: 18000}})
	ticks(e, 69)
	if err = r.Capture(e, true); err != nil {
		t.Fatal(err)
	}
	data, err := r.Encode()
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := DecodeReplay(data)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := loaded.Seek(e.catalog, e.Tick())
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("replay export/import hash mismatch")
	}
	data[len(data)/2] ^= 0x7f
	if _, err := DecodeReplay(data); err == nil {
		t.Fatal("accepted corrupt compressed replay")
	}
}
