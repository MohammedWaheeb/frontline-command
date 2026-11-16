package sim

import "testing"

// F1 (hidden-bug-hunt 2026-11-09): a busy rig queues each further foundation
// behind its current one with no length check in startBuilding, so a live rig
// can legitimately hold far more than the 10-order queue cap for ordinary
// orders. Save must round-trip through Restore for every such live state.
func TestRigBuildQueueRestores(t *testing.T) {
	e := fixture(t)
	p, rig, hq := rigQueueFixture(t, e)
	accepted := 0
	for i := 0; i < 81 && accepted < 16; i++ {
		pos := Vec{X: hq.Position.X - 10000 + int32(i%9)*2500, Y: hq.Position.Y - 10000 + int32(i/9)*2500}
		if code := e.executeSelected(p.ID, Order{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: pos, Queued: true}); code == "ok" {
			accepted++
		}
	}
	if accepted < 16 {
		t.Fatalf("fixture rig accepted only %d queued builds, want at least 16", accepted)
	}
	e.Advance()
	if len(rig.Orders) <= 12 {
		t.Fatalf("rig holds %d orders after %d accepted builds, want more than the old 12-order Restore bound", len(rig.Orders), accepted)
	}
	rigQueueRoundTrip(t, e, len(rig.Orders))
}

// Review r1, finding 1: queued "resume" orders are converted to "build" and
// appended with no queue cap, and validateResume only inspects the builder's
// head order. A rig building foundation A can therefore accumulate duplicate
// build orders for a queued foundation B far beyond the 60-structure cap.
func TestRigResumeQueueAboveStructureCapRestores(t *testing.T) {
	e := fixture(t)
	p, rig, hq := rigQueueFixture(t, e)
	targets := []ID{}
	for i := 0; i < 81 && len(targets) < 2; i++ {
		pos := Vec{X: hq.Position.X - 10000 + int32(i%9)*2500, Y: hq.Position.Y - 10000 + int32(i/9)*2500}
		if code := e.executeSelected(p.ID, Order{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: pos, Queued: true}); code == "ok" {
			targets = append(targets, rig.Orders[len(rig.Orders)-1].Target)
		}
	}
	if len(targets) < 2 {
		t.Fatalf("fixture rig accepted only %d foundations, want 2", len(targets))
	}
	for i := 0; i < 59; i++ {
		if code := e.executeSelected(p.ID, Order{Kind: "resume", Entities: []ID{rig.ID}, Target: targets[1], Queued: true}); code != "ok" {
			t.Fatalf("queued resume %d for the second foundation rejected: %s", i, code)
		}
	}
	builds := 0
	for _, o := range rig.Orders {
		if o.Kind == "build" {
			builds++
		}
	}
	if builds != 61 {
		t.Fatalf("rig holds %d build orders (%d total), want 61 build orders from 2 foundations and 59 queued resumes", builds, len(rig.Orders))
	}
	e.Advance()
	rigQueueRoundTrip(t, e, len(rig.Orders))
}

func rigQueueFixture(t *testing.T, e *Engine) (*Player, *Entity, *Entity) {
	t.Helper()
	p := e.state.Players[0]
	p.Credits = 50_000_000
	var rig, hq *Entity
	for _, v := range e.state.Entities {
		if v.Owner != p.ID {
			continue
		}
		switch e.role(v) {
		case "rig":
			rig = v
		case "hq":
			hq = v
		}
	}
	if rig == nil || hq == nil {
		t.Fatal("fixture lacks a rig or HQ; the F1 regression cannot run")
	}
	return p, rig, hq
}

func rigQueueRoundTrip(t *testing.T, e *Engine, orders int) {
	t.Helper()
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatalf("Restore rejected a live rig build queue of %d orders: %v", orders, err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatalf("restored hash %s != live hash %s", restored.Hash(), e.Hash())
	}
	for i := 0; i < 200; i++ {
		e.Advance()
		restored.Advance()
		if restored.Hash() != e.Hash() {
			t.Fatalf("hashes diverged %d ticks after restore: restored %s != live %s", i+1, restored.Hash(), e.Hash())
		}
	}
}
