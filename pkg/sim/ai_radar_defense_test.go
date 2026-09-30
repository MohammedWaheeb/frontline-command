package sim

import (
	"reflect"
	"testing"
)

// Controlled policy checks complement the pinned, uninjected ordinary saved
// course. These are not full-game competence evidence.
func aiRadarDefenseControl(t *testing.T) (*Engine, View, []EntityView, *Entity) {
	t.Helper()
	e := fixture(t)
	p := e.player(1)
	p.Credits = 1000000
	e.spawn("power", 1, Vec{X: 10000, Y: 15000}, true, 0)
	e.spawn("supply", 1, Vec{X: 8000, Y: 21000}, true, 0)
	e.spawn("barracks", 1, Vec{X: 16000, Y: 15000}, true, 0)
	factory := e.spawn("factory", 1, Vec{X: 20000, Y: 15000}, true, 0)
	e.recalculate()
	e.updateFog()
	job, code := e.productionJob(p, factory, Order{Kind: "train", Entities: []ID{factory.ID}, Type: "US.car"})
	if code != "ok" || !e.jobReady(p, factory, &job) {
		t.Fatalf("control fixture lacks ordinary factory/car prerequisites: %s", code)
	}
	view, _ := e.PlayerView(1)
	own := []EntityView{}
	for _, actor := range view.Entities {
		if actor.Owner == 1 {
			own = append(own, actor)
		}
	}
	// Public enemy facts are deliberately supplied separately from private
	// full State: the planner must neither resolve nor inspect that fake ID.
	view.Entities = append(view.Entities, EntityView{ID: 9001, Owner: 2, Type: "IR.rifle", Position: Vec{X: 10000, Y: 10000}, Complete: true, Enabled: true, Health: 1000})
	return e, view, own, factory
}

func TestAIFirstRadarDefenseResourceAndProducerControls(t *testing.T) {
	for _, mode := range []string{"normal", "reserve_boundary", "below_reserve", "planned_supply", "busy_producers", "committed_defender", "reserved_producers", "foreign_own_record"} {
		t.Run(mode, func(t *testing.T) {
			e, view, own, factory := aiRadarDefenseControl(t)
			budget, supply := int64(1000000), int32(0)
			prior := []Order{}
			want := mode == "normal" || mode == "reserve_boundary"
			switch mode {
			case "reserve_boundary":
				budget = 600000
			case "below_reserve":
				budget = 599999
			case "planned_supply":
				supply = 100
			case "busy_producers":
				for _, actor := range own {
					if v := e.entity(actor.ID); v.Building {
						v.Jobs = []Job{{Type: "US.rifle"}}
					}
				}
			case "committed_defender":
				factory.Jobs = []Job{{Type: "US.car"}}
			case "reserved_producers":
				for _, actor := range own {
					prior = append(prior, Order{Kind: "stop", Entities: []ID{actor.ID}})
				}
			case "foreign_own_record":
				own = []EntityView{{Owner: 1}}
				// Substitute an actual foreign actor, rather than trusting the
				// caller's claimed Owner in the owned subset.
				for _, v := range e.state.Entities {
					if v.Owner == 2 {
						own[0].ID = v.ID
						break
					}
				}
			}
			before := e.Hash()
			order, cost, allocated, ok := e.aiFirstRadarDefense(e.player(1), view, own, prior, budget, supply)
			if ok != want || e.Hash() != before {
				t.Fatalf("wrong resource/capability decision or mutated planning state: %+v cost=%d supply=%d ok=%t", order, cost, allocated, ok)
			}
			if ok {
				unit, _ := e.catalog.Unit(order.Type)
				if cost != unit.Cost || allocated != unit.Supply || cost+300000 > budget || len(order.Entities) != 1 {
					t.Fatal("defender did not preserve ordinary costs/reserve/supply", order, cost, allocated)
				}
				if mode == "normal" && (order.Type != "US.car" || order.Entities[0] != factory.ID) || mode == "reserve_boundary" && order.Type != "US.rifle" {
					t.Fatal("legal factory-first or affordable infantry fallback changed", order)
				}
			}
		})
	}
}

func TestAIFirstRadarDefenseCurrentPublicThreatAndPrivateState(t *testing.T) {
	for _, mode := range []string{"normal", "hidden", "passive", "disabled", "distant", "ally", "defeated"} {
		t.Run(mode, func(t *testing.T) {
			e, view, own, _ := aiRadarDefenseControl(t)
			last := len(view.Entities) - 1
			switch mode {
			case "hidden":
				view.Entities = view.Entities[:last]
			case "passive":
				view.Entities[last].Type = "IR.hauler"
			case "disabled":
				view.Entities[last].Enabled = false
			case "distant":
				view.Entities[last].Position = Vec{X: 60000, Y: 60000}
			case "ally":
				view.Players[1].Team = view.Players[0].Team
			case "defeated":
				view.Players[1].Defeated = true
			}
			before := e.Hash()
			order, cost, supply, ok := e.aiFirstRadarDefense(e.player(1), view, own, nil, 1000000, 0)
			if ok != (mode == "normal") || e.Hash() != before {
				t.Fatal("non-current/nonarmed/nonhostile evidence affected defensive spending", mode, order)
			}
			// Alter unseen opponent credits/queues/orders; unchanged public
			// facts and our real bank must produce exactly the same proposal.
			e.player(2).Credits = 1
			for _, actor := range e.state.Entities {
				if actor.Owner == 2 {
					actor.Orders = []Order{{Kind: "move", Position: Vec{X: 42000, Y: 42000}}}
					actor.Jobs = []Job{{Type: "IR.car"}}
				}
			}
			twinOrder, twinCost, twinSupply, twinOK := e.aiFirstRadarDefense(e.player(1), view, own, nil, 1000000, 0)
			if !reflect.DeepEqual(order, twinOrder) || cost != twinCost || supply != twinSupply || ok != twinOK {
				t.Fatal("hidden opponent private state changed the public defensive choice")
			}
		})
	}
}
