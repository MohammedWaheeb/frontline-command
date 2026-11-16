package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Regression for the append-only buff cliff: 300 rapid_sortie casts on one
// airfield (cooldown/energy reset per cast stands in for elapsed time, as in
// the original probe) leave 300 buff entries. Once they have all expired the
// save must restore with an equal hash and continue identically.
func TestRestoreAcceptsExpiredBuffHistoryBeyondOldCap(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.Tier = 3
	air := e.spawn("US.airfield", 1, Vec{X: 30000, Y: 30000}, true, 0)
	for i := 0; i < 300; i++ {
		p.Cooldowns, p.Energy = nil, 100000
		if code := e.cast(p, []*Entity{air}, Order{Kind: "ability", Type: "rapid_sortie"}); code != "ok" {
			t.Fatalf("cast %d: %s", i, code)
		}
	}
	if len(air.Buffs) != 300 {
		t.Fatalf("buffs = %d, want 300", len(air.Buffs))
	}
	ticks(e, 400) // rapid_sortie lasts 15s = 300 ticks; all entries now expired.
	for _, b := range air.Buffs {
		if b.Until > e.state.Tick {
			t.Fatalf("buff %+v still active at tick %d", b, e.state.Tick)
		}
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatalf("restore of expired buff history: %v", err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("restore changed state")
	}
	for i := 0; i < 200; i++ {
		e.Advance()
		restored.Advance()
		if restored.Hash() != e.Hash() {
			t.Fatalf("diverged at tick %d", e.Tick())
		}
	}
}

// Regression for the active-buff cliff found in review: designation is the
// one buff that stacks across casters, so three US players fielding 100
// one-Supply recons each (their full live Supply cap) can legally hold 300
// simultaneously active designated buffs on one enemy building. Each recon
// casts once through the real 1s channel; no cooldown is reset. The save
// must restore with an equal hash and continue identically.
func TestRestoreAcceptsStackedActiveDesignations(t *testing.T) {
	m := fixtureMap()
	m.Spawns = append(m.Spawns,
		content.Spawn{Position: Vec{X: 56000, Y: 8000}},
		content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{
		{ID: 1, Name: "Alpha", Faction: "US"},
		{ID: 2, Name: "Bravo", Faction: "US"},
		{ID: 3, Name: "Charlie", Faction: "US"},
		{ID: 4, Name: "Delta", Faction: "IR"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	target := e.spawn("factory", 4, Vec{X: 30000, Y: 30000}, true, 1800000)

	// Grid points at designation range (edge distance 4500-6500): inside the
	// 7000 cast limit, outside the recon weapon's 4000 range.
	probe := &Entity{Type: "US.recon"}
	var points []Vec
	for y := int32(20500); y <= 39500 && len(points) < 300; y += 500 {
		for x := int32(20500); x <= 39500 && len(points) < 300; x += 500 {
			probe.Position = Vec{X: x, Y: y}
			if d := e.edgeDistance(probe, target); d >= 4500 && d <= 6500 {
				points = append(points, probe.Position)
			}
		}
	}
	if len(points) != 300 {
		t.Fatalf("staging points = %d, want 300", len(points))
	}
	var recons []*Entity
	for i, pos := range points {
		recons = append(recons, e.spawn("US.recon", PlayerID(1+i/100), pos, true, 350000))
	}
	e.recalculate()
	e.updateFog()
	for id := PlayerID(1); id <= 3; id++ {
		if supply := e.player(id).Supply; supply != 100 {
			t.Fatalf("player %d supply = %d, want the live cap 100", id, supply)
		}
	}
	for i, r := range recons {
		if code := e.cast(e.player(r.Owner), []*Entity{r}, Order{Kind: "ability", Type: "designate", Target: target.ID}); code != "ok" {
			t.Fatalf("designate %d (player %d): %s", i, r.Owner, code)
		}
	}
	ticks(e, uint32(seconds(1))) // every 1s channel completes on the same tick.
	active := 0
	for _, b := range target.Buffs {
		if b.Kind == "designated" && b.Until > e.state.Tick {
			active++
		}
	}
	if active != 300 {
		t.Fatalf("active designated buffs = %d, want 300 from completed channels", active)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatalf("restore of 300 stacked designations: %v", err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("restore changed state")
	}
	for i := 0; i < 200; i++ {
		e.Advance()
		restored.Advance()
		if restored.Hash() != e.Hash() {
			t.Fatalf("diverged at tick %d", e.Tick())
		}
	}
}

// Kinds other than designated are self- or owner-only with cooldowns far
// longer than their durations, so they keep the long-standing 256
// simultaneous-active cap.
func TestRestoreRejectsMoreThan256ActiveNonDesignatedBuffs(t *testing.T) {
	e := fixture(t)
	s := e.StateCopy()
	target := s.Entities[0]
	for i := 0; i < 257; i++ {
		target.Buffs = append(target.Buffs, Buff{Kind: "rapid_sortie", Until: s.Tick + 1000, Source: target.ID})
	}
	if _, err := Restore(e.catalog, signedState(s)); err == nil {
		t.Fatal("restore accepted 257 active rapid_sortie buffs on one entity")
	}

	s = e.StateCopy()
	target = s.Entities[0]
	for i := 0; i < 256; i++ {
		target.Buffs = append(target.Buffs, Buff{Kind: "rapid_sortie", Until: s.Tick + 1000, Source: target.ID})
	}
	for i := 0; i < 44; i++ {
		target.Buffs = append(target.Buffs, Buff{Kind: "rapid_sortie", Until: s.Tick, Source: target.ID})
	}
	if _, err := Restore(e.catalog, signedState(s)); err != nil {
		t.Fatalf("restore rejected 256 active + 44 expired buffs: %v", err)
	}
}

// Active designated copies are bounded by 400 live recon Supply slots times
// at most 8 completed 20-tick channels per 160-tick buff window (practice
// remove/respawn recycle): 3200 accepted, 3201 rejected.
func TestRestoreActiveDesignatedBuffBound(t *testing.T) {
	e := fixture(t)
	s := e.StateCopy()
	target := s.Entities[0]
	for i := 0; i < 3200; i++ {
		target.Buffs = append(target.Buffs, Buff{Kind: "designated", Until: s.Tick + 1000, Source: target.ID})
	}
	if _, err := Restore(e.catalog, signedState(s)); err != nil {
		t.Fatalf("restore rejected 3200 active designated buffs: %v", err)
	}

	s = e.StateCopy()
	target = s.Entities[0]
	for i := 0; i < 3201; i++ {
		target.Buffs = append(target.Buffs, Buff{Kind: "designated", Until: s.Tick + 1000, Source: target.ID})
	}
	if _, err := Restore(e.catalog, signedState(s)); err == nil {
		t.Fatal("restore accepted 3201 active designated buffs on one entity")
	}
}

// The generous total cap still bounds buff history per entity. This
// exercises validateState directly so the forged multi-million-entry slice
// never has to round-trip through a giant JSON save.
func TestValidateBuffHistoryTotalCap(t *testing.T) {
	e := fixture(t)
	e.state.Entities[0].Buffs = make([]Buff, 2200000)
	if err := e.validateState(); err != nil {
		t.Fatalf("validate rejected buff history at the total cap: %v", err)
	}
	e.state.Entities[0].Buffs = make([]Buff, 2200001)
	if err := e.validateState(); err == nil {
		t.Fatal("validate accepted 2,200,001 buffs on one entity")
	}
}

func TestRestoreNextIDBound(t *testing.T) {
	e := fixture(t)
	s := e.StateCopy()
	s.NextID = 250000000
	if _, err := Restore(e.catalog, signedState(s)); err != nil {
		t.Fatalf("restore rejected NextID at the bound: %v", err)
	}
	s = e.StateCopy()
	s.NextID = 250000001
	if _, err := Restore(e.catalog, signedState(s)); err == nil {
		t.Fatal("restore accepted NextID above the bound")
	}
}
