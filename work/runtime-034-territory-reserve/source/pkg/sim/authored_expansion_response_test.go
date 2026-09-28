package sim_test

import (
	"frontlinecommand/pkg/sim"
	"sort"
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

// Fixed bounded role budget from actual owned complete unembarked actors, nearest
// first. Sentinels and explicitly excluded support stay out of the recall.
func authoredExpansionResponseForce(view sim.View, excluded map[sim.ID]bool, home sim.Vec) map[sim.ID]bool {
	candidates := []sim.EntityView{}
	for _, e := range view.Entities {
		if e.Owner != 1 || excluded[e.ID] || !e.Complete || !e.Enabled || e.Private == nil || e.Private.Container != 0 {
			continue
		}
		if e.Type == "SY.tank" || e.Type == "SY.rifle" || e.Type == "SY.at" {
			candidates = append(candidates, e)
		}
	}
	distance := func(e sim.EntityView) int64 {
		dx, dy := int64(e.Position.X-home.X), int64(e.Position.Y-home.Y)
		return dx*dx + dy*dy
	}
	sort.Slice(candidates, func(i, j int) bool {
		a, b := distance(candidates[i]), distance(candidates[j])
		if a == b {
			return candidates[i].ID < candidates[j].ID
		}
		return a < b
	})
	limits := map[string]int{"SY.tank": 2, "SY.rifle": 4, "SY.at": 2}
	selected := map[sim.ID]bool{}
	for _, e := range candidates {
		if limits[e.Type] > 0 {
			selected[e.ID] = true
			limits[e.Type]--
		}
	}
	return selected
}
func TestAuthoredExpansionResponseReserveIsBounded(t *testing.T) {
	var v sim.View
	for i := 1; i <= 8; i++ {
		for j, kind := range []string{"SY.tank", "SY.rifle", "SY.at"} {
			v.Entities = append(v.Entities, sim.EntityView{ID: sim.ID(i*10 + j), Owner: 1, Type: kind, Complete: true, Enabled: true, Position: sim.Vec{X: int32(i * 1000)}, Private: &sim.EntityPrivate{}})
		}
	}
	excluded := map[sim.ID]bool{10: true, 11: true, 12: true}
	got := authoredExpansionResponseForce(v, excluded, sim.Vec{})
	if len(got) != 8 || got[10] || got[11] || got[12] || !got[20] || !got[21] || !got[22] || got[60] {
		t.Fatal("unbounded or distant reserve", got)
	}
	v.Entities[3].Owner = 2
	got = authoredExpansionResponseForce(v, excluded, sim.Vec{})
	if got[v.Entities[3].ID] {
		t.Fatal("foreign entity recalled")
	}
}
