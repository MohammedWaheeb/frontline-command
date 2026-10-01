package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

func authoredBorrowableCaptureGunner(view sim.View, guards map[sim.ID][]sim.ID, destination sim.Vec, armed func(string) bool) (sim.ID, sim.ID) {
	byID := map[sim.ID]sim.EntityView{}
	for _, actor := range view.Entities {
		byID[actor.ID] = actor
	}
	var chosen, chosenSite sim.ID
	closest := int64(1 << 62)
	for siteID, group := range guards {
		site, ok := byID[siteID]
		if !ok || site.Owner != 1 || !site.Complete || site.Health < 990 {
			continue
		}
		threatened := false
		for _, enemy := range view.Entities {
			if enemy.Owner != 2 && enemy.Owner != 4 || !armed(enemy.Type) {
				continue
			}
			dx, dy := int64(enemy.Position.X-site.Position.X), int64(enemy.Position.Y-site.Position.Y)
			if dx*dx+dy*dy <= 14000*14000 {
				threatened = true
				break
			}
		}
		if threatened {
			continue
		}
		for _, id := range group {
			actor, ok := byID[id]
			if !ok || actor.Owner != 1 || !actor.Complete || !actor.Enabled || actor.Health < 250 || actor.Private == nil || actor.Private.Container != 0 || actor.Type != "SY.at" && actor.Type != "SY.tank" {
				continue
			}
			orders := actor.Private.Orders
			if len(orders) > 0 && orders[0].Kind != "guard" {
				continue
			}
			dx, dy := int64(actor.Position.X-destination.X), int64(actor.Position.Y-destination.Y)
			d := dx*dx + dy*dy
			if d < closest || d == closest && (chosen == 0 || id < chosen || id == chosen && siteID < chosenSite) {
				chosen, chosenSite, closest = id, siteID, d
			}
		}
	}
	return chosen, chosenSite
}

func TestAuthoredCaptureGunnerReassignment(t *testing.T) {
	site := sim.EntityView{ID: 70, Owner: 1, Type: "radar", Complete: true, Health: 1000, Position: sim.Vec{X: 50500, Y: 82500}}
	at := sim.EntityView{ID: 977, Owner: 1, Type: "SY.at", Complete: true, Enabled: true, Health: 1000, Position: sim.Vec{X: 49000, Y: 81000}, Private: &sim.EntityPrivate{Orders: []sim.Order{{Kind: "guard", Target: 70}}}}
	tank := at
	tank.ID = 46
	tank.Type = "SY.tank"
	tank.Health = 8
	group := map[sim.ID][]sim.ID{70: {46, 977}}
	destination := sim.Vec{X: 103500, Y: 39500}
	armed := func(kind string) bool { return kind == "US.tank" }
	view := sim.View{Entities: []sim.EntityView{site, at, tank}}
	if id, site := authoredBorrowableCaptureGunner(view, group, destination, armed); id != 977 || site != 70 {
		t.Fatal(id, site)
	}
	view.Entities = append(view.Entities, sim.EntityView{ID: 5000, Owner: 2, Type: "US.tank", Position: sim.Vec{X: 55000, Y: 85000}})
	if id, _ := authoredBorrowableCaptureGunner(view, group, destination, armed); id != 0 {
		t.Fatal("borrowed from threatened site", id)
	}
	view.Entities = view.Entities[:3]
	view.Entities[0].Health = 600
	if id, _ := authoredBorrowableCaptureGunner(view, group, destination, armed); id != 0 {
		t.Fatal("borrowed from damaged site", id)
	}
	view.Entities[0].Health = 1000
	view.Entities[1].Owner = 2
	if id, _ := authoredBorrowableCaptureGunner(view, group, destination, armed); id != 0 {
		t.Fatal("borrowed foreign actor", id)
	}
}
