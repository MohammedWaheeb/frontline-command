package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// Select an actual owned repairer only from a healthy site with no currently
// visible armed opponent nearby. It does not read fog memory or engine state.
func authoredBorrowableCaptureEngineer(view sim.View, repairers map[sim.ID]sim.ID, destination sim.Vec, armed func(string) bool) (sim.ID, sim.ID) {
	byID := map[sim.ID]sim.EntityView{}
	for _, actor := range view.Entities {
		byID[actor.ID] = actor
	}
	var chosen, chosenSite sim.ID
	closest := int64(1 << 62)
	for siteID, workerID := range repairers {
		site, ok := byID[siteID]
		if !ok || site.Owner != 1 || site.Health < 990 || !site.Complete {
			continue
		}
		worker, ok := byID[workerID]
		if !ok || worker.Owner != 1 || worker.Type != "SY.engineer" || !worker.Complete || !worker.Enabled || worker.Private == nil || worker.Private.Container != 0 {
			continue
		}
		orders := worker.Private.Orders
		if len(orders) > 0 && (orders[0].Kind != "repair" || orders[0].Target != siteID) {
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
		dx, dy := int64(worker.Position.X-destination.X), int64(worker.Position.Y-destination.Y)
		distance := dx*dx + dy*dy
		if distance < closest || distance == closest && (chosen == 0 || workerID < chosen || workerID == chosen && siteID < chosenSite) {
			closest, chosen, chosenSite = distance, workerID, siteID
		}
	}
	return chosen, chosenSite
}

func TestAuthoredCaptureRepairerReassignment(t *testing.T) {
	site := sim.EntityView{ID: 70, Owner: 1, Type: "radar", Complete: true, Health: 1000, Position: sim.Vec{X: 50500, Y: 82500}}
	worker := sim.EntityView{ID: 44, Owner: 1, Type: "SY.engineer", Complete: true, Enabled: true, Private: &sim.EntityPrivate{Orders: []sim.Order{{Kind: "repair", Target: 70}}}, Position: sim.Vec{X: 47998, Y: 84205}}
	repairers := map[sim.ID]sim.ID{70: 44}
	armed := func(kind string) bool { return kind == "US.tank" }
	view := sim.View{Entities: []sim.EntityView{site, worker}}
	to := sim.Vec{X: 103500, Y: 39500}
	if id, home := authoredBorrowableCaptureEngineer(view, repairers, to, armed); id != 44 || home != 70 {
		t.Fatal("healthy quiet repairer not reusable", id, home)
	}
	view.Entities[0].Health = 862
	if id, _ := authoredBorrowableCaptureEngineer(view, repairers, to, armed); id != 0 {
		t.Fatal("active damaged relay stripped", id)
	}
	view.Entities[0] = site
	view.Entities = append(view.Entities, sim.EntityView{ID: 99, Owner: 2, Type: "US.tank", Position: sim.Vec{X: 52000, Y: 84000}})
	if id, _ := authoredBorrowableCaptureEngineer(view, repairers, to, armed); id != 0 {
		t.Fatal("threatened site stripped", id)
	}
	view.Entities = view.Entities[:2]
	view.Entities[1].Owner = 2
	if id, _ := authoredBorrowableCaptureEngineer(view, repairers, to, armed); id != 0 {
		t.Fatal("foreign engineer selected", id)
	}
	view.Entities[1] = worker
	view.Entities[1].Private = &sim.EntityPrivate{Orders: []sim.Order{{Kind: "capture", Target: 73}}}
	if id, _ := authoredBorrowableCaptureEngineer(view, repairers, to, armed); id != 0 {
		t.Fatal("working capture engineer stolen", id)
	}
}
