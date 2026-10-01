package sim

import (
	"testing"

	"frontlinecommand/pkg/content"
)

// Exercise real retained intentions and ordinary Submit/Advance execution.
// A third surviving faction keeps the match active after a public surrender.
func TestAIQualityAirRecallFallbackSurvivesEarlierIntentions(t *testing.T) {
	for _, mode := range []string{"retired_target", "shared_energy", "accepted_recall"} {
		t.Run(mode, func(t *testing.T) {
			m := fixtureMap()
			m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 56000, Y: 8000}})
			e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "IR", Team: 1}, {ID: 2, Faction: "US", Team: 2}, {ID: 3, Faction: "SA", Team: 3}}})
			if err != nil {
				t.Fatal(err)
			}
			e.state.Countdown = 0
			baseInfrastructure(e, 1)
			p := e.player(1)
			p.Credits, p.RepairReserve = 0, 300000
			home := e.spawn("IR.drone_hub", 1, Vec{X: 23000, Y: 36000}, true, 0)
			drones := []*Entity{}
			for i := int32(0); i < 4; i++ {
				v := e.spawn("IR.strike", 1, Vec{X: 14000 + i*1500, Y: 30000}, true, 0)
				v.Home, v.Landed, v.HP, v.Endurance = home.ID, false, v.MaxHP/4, 1800
				drones = append(drones, v)
			}
			target := e.spawn("power", 2, Vec{X: 25000, Y: 30000}, true, 0)
			e.recalculate()
			e.updateFog()
			issue(t, e, 1, Order{Kind: "attack", Entities: []ID{drones[0].ID}, Target: target.ID})
			view, _ := e.PlayerView(1)
			e.aiObserve(p, view)
			if mode == "retired_target" {
				issue(t, e, 2, Order{Kind: "surrender"})
				if !e.player(2).Defeated || e.Outcome().Finished {
					t.Fatal("ordinary surrender did not leave a surviving opponent")
				}
			}
			var survey *Entity
			goal := Vec{X: 44000, Y: 38000}
			p.Energy = 45000
			if mode == "shared_energy" {
				survey = e.spawn("IR.isr", 1, Vec{X: 30000, Y: 38000}, true, 0)
				survey.Home, survey.Landed = home.ID, false
				p.Energy = 50000
				p.Explored[38*64+44] = true
			}
			p.AI = "hard"
			e.recalculate()
			e.updateFog()
			view, _ = e.PlayerView(1)
			own := aiOwnView(e, 1)
			prior := []Order{}
			switch mode {
			case "retired_target":
				prior = e.aiRetireDefeatedTargets(p, view)
				if len(prior) != 1 || prior[0].Kind != "stop" || len(prior[0].Entities) != 1 || prior[0].Entities[0] != drones[0].ID {
					t.Fatal("public defeat did not reserve the attacking drone's cancellation", prior)
				}
			case "shared_energy":
				prior = e.aiSpecialOrders(p, view, own, goal)
				if len(prior) != 1 || prior[0].Type != "relay_boost" || prior[0].Entities[0] != survey.ID {
					t.Fatal("ordinary useful relay did not reserve 35 of the 50 Energy", prior)
				}
			}
			planned := append(prior, e.aiAirRecoveryOrders(p, own)...)
			chosen := e.aiChooseOrders(p, own, planned, e.aiPlanningBudget(p, own))
			retained := map[ID]string{}
			recalls := 0
			for _, order := range chosen {
				if order.Type == "drone_recall" {
					recalls++
					if len(order.Entities) != 4 {
						t.Fatal("retained Recall was no longer one four-drone cast", order)
					}
				}
				for _, id := range order.Entities {
					if _, exists := retained[id]; exists {
						t.Fatal("actor retained more than one intention", id)
					}
					retained[id] = order.Kind
				}
			}
			for i, drone := range drones {
				want := "return"
				if mode == "accepted_recall" {
					want = "ability"
				} else if mode == "retired_target" && i == 0 {
					want = "stop"
				}
				if retained[drone.ID] != want {
					t.Fatal("rejected grouped Recall lost an unclaimed drone's ordinary recovery", mode, drone.ID, want, chosen)
				}
			}
			if (mode == "accepted_recall" && recalls != 1) || (mode != "accepted_recall" && recalls != 0) {
				t.Fatal("group rejection/acceptance changed the Recall selection", mode, recalls)
			}
			beforeEnergy := p.Energy
			beforeFuel := []uint32{}
			for _, drone := range drones {
				beforeFuel = append(beforeFuel, drone.Endurance)
			}
			p.AI = ""
			e.aiDispatchOrders(p, chosen)
			if len(e.state.Pending) != 1 {
				t.Fatal("retained intentions did not use ordinary Submit admission", e.state.Pending)
			}
			e.Advance()
			for _, result := range e.state.Results {
				if !result.Accepted {
					t.Fatal("composed ordinary recovery rejected", result)
				}
			}
			spent := int64(0)
			if mode == "shared_energy" {
				spent = 35000
				if !e.hasBuff(survey, "relay") {
					t.Fatal("higher-priority ordinary Relay was not cast")
				}
			} else if mode == "accepted_recall" {
				spent = 45000
			}
			// Advance can regenerate at most one tick's 25 Energy after casting.
			if p.Energy < beforeEnergy-spent || p.Energy > beforeEnergy-spent+25 || p.Credits != 0 {
				t.Fatal("Return fallbacks spent extra Energy/credits", mode, beforeEnergy, p.Energy, p.Credits)
			}
			for i, drone := range drones {
				if drone.Home != home.ID || drone.HP != drone.MaxHP/4 || drone.Ammo != 2 || drone.Endurance != beforeFuel[i]-1 || e.hasBuff(drone, "recall") != (mode == "accepted_recall") {
					t.Fatal("group/fallback changed retained service or aircraft resources", mode, drone.ID)
				}
				if mode == "retired_target" && i == 0 {
					if len(drone.Orders) != 0 {
						t.Fatal("earlier public cancellation was replaced", drone.Orders)
					}
				} else if len(drone.Orders) != 1 || drone.Orders[0].Kind != "return" {
					t.Fatal("ordinary recovery did not survive execution", mode, drone.ID, drone.Orders)
				}
			}
		})
	}
}
