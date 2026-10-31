package sim

import (
	"bytes"
	"encoding/json"
	"fmt"
	"testing"
)

func TestHUDEconomyAndSellRefundMatchExecution(t *testing.T) {
	for _, tc := range []struct {
		typ              string
		paid, hp, refund int64
	}{{"power", 500000, 1000, 250000}, {"supply", 1800000, 1000, 450000}, {"power", 500000, 500, 125000}, {"hq", 0, 1000, 0}, {"power", 9000000, 1000, 250000}} {
		t.Run(fmt.Sprintf("%s-paid%d-hp%d", tc.typ, tc.paid, tc.hp), func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(tc.typ, 1, Vec{X: 20000, Y: 20000}, true, tc.paid)
			v.IncludedHauler = true
			v.HP = v.MaxHP * tc.hp / 1000
			e.recalculate()
			a, err := e.CommandAffordances(1, []ID{v.ID})
			if err != nil {
				t.Fatal(err)
			}
			if a.Economy.SupplyCap != 100 || a.Entities[0].SellRefund != tc.refund {
				t.Fatalf("affordance %+v", a)
			}
			data, _ := json.Marshal(a)
			var decoded struct {
				Economy struct {
					SupplyCap int32 `json:"supply_cap"`
				}
				Entities []struct {
					Refund int64 `json:"sell_refund"`
				}
			}
			if err = json.Unmarshal(data, &decoded); err != nil || decoded.Economy.SupplyCap != 100 || decoded.Entities[0].Refund != tc.refund {
				t.Fatal("JSON decoder", err, string(data))
			}
			before := e.player(1).Credits
			issue(t, e, 1, Order{Kind: "sell", Entities: []ID{v.ID}})
			ticks(e, 100)
			if got := e.player(1).Credits - before; got != tc.refund {
				t.Fatalf("execution refund %d want %d", got, tc.refund)
			}
		})
	}
	e := fixture(t)
	if _, err := e.CommandAffordances(2, []ID{1}); err == nil {
		t.Fatal("foreign refund exposed")
	}
	a, err := e.CommandAffordances(1, []ID{2})
	if err != nil || a.Entities[0].SellRefund != 0 {
		t.Fatal("unit has sell refund", err)
	}
}
func TestHUDConstructionStallUsesTicksAndResetsOnProgress(t *testing.T) {
	e := fixture(t)
	site := e.spawn("power", 1, Vec{X: 20000, Y: 20000}, false, 500000)
	e.observeConstructionProgress()
	before := e.Hash()
	save, _ := e.Save()
	stalled := func(want bool) {
		t.Helper()
		a, err := e.CommandAffordances(1, []ID{site.ID})
		if err != nil || a.Entities[0].ConstructionStalled != want {
			t.Fatalf("tick %d stalled=%+v want %v err=%v", e.Tick(), a, want, err)
		}
	}
	stalled(false)
	if e.Hash() != before {
		t.Fatal("query mutated sim hash")
	}
	same, _ := e.Save()
	if !bytes.Equal(save, same) {
		t.Fatal("presentation observation changed save")
	}
	ticks(e, 59)
	stalled(false)
	ticks(e, 1)
	stalled(true)
	// Work is the authoritative measure; a builder approaching without work
	// cannot clear the indicator. Any actual work clears it at the same tick.
	rig := e.entity(2)
	rig.Position = Vec{X: 18000, Y: 20000}
	site.Builder = rig.ID
	e.assign(rig, Order{Kind: "build", Target: site.ID, Type: "power", Position: site.Position})
	e.Advance()
	if site.Work == 0 {
		t.Fatal("fixture builder did not progress")
	}
	stalled(false)
	e.assign(rig, Order{Kind: "stop"})
	ticks(e, 59)
	stalled(false)
	ticks(e, 1)
	stalled(true)
	saved, _ := e.Save()
	hash := e.Hash()
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != hash {
		t.Fatal("restore changed authoritative state", err)
	}
	a, _ := restored.CommandAffordances(1, []ID{site.ID})
	if a.Entities[0].ConstructionStalled {
		t.Fatal("restore invented pre-load observation history")
	}
	ticks(restored, 60)
	a, _ = restored.CommandAffordances(1, []ID{site.ID})
	if !a.Entities[0].ConstructionStalled {
		t.Fatal("restore did not resume conservative tick observation")
	}
	site.Complete = true
	stalled(false)
	site.Complete = false
	site.HP = 0
	stalled(false)
}
func TestHUDConstructionObservationDoesNotChangeReplayHashes(t *testing.T) {
	e := fixture(t)
	issue(t, e, 1, Order{Kind: "build", Entities: []ID{2}, Type: "power", Position: Vec{X: 15000, Y: 12000}})
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 160)
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatalf("presentation changed replay %v", err)
	}
	played.constructionProgress = nil
	if played.Hash() != e.Hash() {
		t.Fatal("cache participates in authoritative hash")
	}
}

func TestHUDAbsentEconomyDoesNotInventZeroCap(t *testing.T) {
	data, err := json.Marshal(CommandAffordances{})
	if err != nil || bytes.Contains(data, []byte(`"economy"`)) {
		t.Fatalf("unavailable-selection advice must omit absent economy: %s %v", data, err)
	}
}
