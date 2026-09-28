package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// Player-side recall from permitted current observations. No remembered/hidden
// enemies or enemy orders are read; ordinary Go commands still decide legality.
func authoredExpansionHomeThreat(view sim.View, home sim.Vec, armed func(string) bool) (sim.ID, bool) {
	var target sim.ID
	best := int64(1 << 62)
	for _, enemy := range view.Entities {
		if enemy.Owner != 2 && enemy.Owner != 4 || !armed(enemy.Type) {
			continue
		}
		threatens := false
		for _, site := range view.Entities {
			if site.Owner != 1 || site.Type != "hq" && site.Type != "factory" && site.Type != "barracks" && site.Type != "supply" {
				continue
			}
			hx, hy := int64(site.Position.X-home.X), int64(site.Position.Y-home.Y)
			if hx*hx+hy*hy > 24000*24000 {
				continue
			}
			dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
			if dx*dx+dy*dy <= 20000*20000 {
				threatens = true
				break
			}
		}
		dx, dy := int64(enemy.Position.X-home.X), int64(enemy.Position.Y-home.Y)
		d := dx*dx + dy*dy
		if threatens && (d < best || d == best && enemy.ID < target) {
			target, best = enemy.ID, d
		}
	}
	return target, target != 0
}
func TestAuthoredExpansionResponseCurrentArmedThreatOnly(t *testing.T) {
	home := sim.Vec{X: 20500, Y: 104500}
	site := sim.EntityView{ID: 1, Owner: 1, Type: "factory", Position: sim.Vec{X: 28500, Y: 111500}}
	enemy := sim.EntityView{ID: 2, Owner: 2, Type: "US.tank", Position: sim.Vec{X: 45878, Y: 100999}}
	armed := func(k string) bool { return k == "US.tank" }
	v := sim.View{Entities: []sim.EntityView{site, enemy}}
	// This exact observed enemy is just beyond20k of the factory; no fabricated range.
	if _, ok := authoredExpansionHomeThreat(v, home, armed); ok {
		t.Fatal("far threat recalled force")
	}
	v.Entities[1].Position.X = 44000
	if id, ok := authoredExpansionHomeThreat(v, home, armed); !ok || id != 2 {
		t.Fatal("visible approaching armed actor ignored", id, ok)
	}
	for _, owner := range []sim.PlayerID{0, 1, 3} {
		v.Entities[1].Owner = owner
		if _, ok := authoredExpansionHomeThreat(v, home, armed); ok {
			t.Fatal("neutral/own/ally treated as hostile")
		}
	}
	v.Entities[1].Owner = 2
	v.Entities[1].Type = "US.engineer"
	if _, ok := authoredExpansionHomeThreat(v, home, armed); ok {
		t.Fatal("unarmed actor caused recall")
	}
	v.Entities = v.Entities[:1]
	if _, ok := authoredExpansionHomeThreat(v, home, armed); ok {
		t.Fatal("disappeared enemy retained as live threat")
	}
}
