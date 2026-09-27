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

func TestReplayAcrossBoundedHistory(t *testing.T) {
	e := fixture(t)
	r, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	// More than the entire live order window, at the maximum allowed steady
	// command rate. A replay must still seek before and after log pruning.
	batch := make([]Order, 32)
	for i := range batch {
		batch[i] = Order{Kind: "repair_reserve", Index: int32(i)}
	}
	var midpoint string
	for n := 0; n < 1100; n++ {
		if err = e.Submit(1, uint32(n+1), batch); err != nil {
			t.Fatal(n, err)
		}
		ticks(e, 4)
		if n == 549 {
			midpoint = e.Hash()
		}
		if (n+1)%25 == 0 {
			if err = r.Capture(e, n == 749); err != nil {
				t.Fatal(err)
			}
		}
	}
	if e.state.LogBase == 0 || e.state.LogOrders > 32768 {
		t.Fatal("history did not remain bounded", e.state.LogBase, e.state.LogOrders)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if restored, err := Restore(e.catalog, save); err != nil || restored.Hash() != e.Hash() {
		t.Fatal("bounded-history save restore", err)
	}
	data, err := r.Encode()
	if err != nil {
		t.Fatal(err)
	}
	r, err = DecodeReplay(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		tick Tick
		hash string
	}{{2200, midpoint}, {e.Tick(), e.Hash()}} {
		restored, err := r.Seek(e.catalog, check.tick)
		if err != nil || restored.Hash() != check.hash {
			t.Fatal("chunked seek mismatch", check.tick, err)
		}
	}
	r.Checkpoints = nil
	if restored, err := r.Seek(e.catalog, e.Tick()); err != nil || restored.Hash() != e.Hash() {
		t.Fatal("full replay after pruning", err)
	}
	missed, err := NewReplay(fixture(t))
	if err != nil {
		t.Fatal(err)
	}
	if err = missed.Capture(e, false); err == nil {
		t.Fatal("accepted a recorder that missed its command window")
	}
}

func TestCommandRateLimitAndSaveRestore(t *testing.T) {
	e := fixture(t)
	orders := make([]Order, 32)
	for i := range orders {
		orders[i] = Order{Kind: "repair_reserve", Index: 500}
	}
	for sequence := uint32(1); sequence <= 5; sequence++ {
		if err := e.Submit(1, sequence, orders); err != nil {
			t.Fatal(err)
		}
	}
	if err := e.Submit(1, 6, orders[:1]); err == nil {
		t.Fatal("accepted more than 160 orders in one second")
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if err = restored.Submit(1, 6, orders[:1]); err == nil {
		t.Fatal("restore reset command budget")
	}
	ticks(restored, 20)
	if err = restored.Submit(1, 6, orders); err != nil {
		t.Fatal("budget did not recover", err)
	}
}
