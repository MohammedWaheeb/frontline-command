package sim

import "testing"

func TestAIStationCaptureUsesPublicOwnerStatus(t *testing.T) {
	for _, scenario := range []string{"neutral", "active_enemy", "defeated_enemy", "allied", "owned", "defeated_with_neutral_alternative"} {
		t.Run(scenario, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "normal"
			worker := e.spawn("US.engineer", 1, Vec{X: 30000, Y: 24000}, true, 0)
			station := e.state.Stations[0]
			station.Owner = 2
			want := station.ID
			switch scenario {
			case "neutral":
				station.Owner = 0
			case "defeated_enemy", "defeated_with_neutral_alternative":
				e.defeat(e.player(2))
				want = 0
			case "allied":
				e.player(2).Team = p.Team
				want = 0
			case "owned":
				station.Owner = p.ID
				want = 0
			}
			if scenario == "defeated_with_neutral_alternative" {
				e.state.Stations = append(e.state.Stations, &ObjectiveStation{ID: 9001, Position: Vec{X: 33000, Y: 25000}})
				want = 9001
			}
			e.recalculate()
			e.updateFog()
			view, _ := e.PlayerView(1)
			if scenario == "defeated_enemy" || scenario == "defeated_with_neutral_alternative" {
				// Exercise a stale public station observation against current public
				// player status. Defeat now releases the live station to neutral;
				// its fresh-view capture is covered by the surrender lifecycle test.
				for i := range view.Stations {
					if view.Stations[i].ID == station.ID {
						view.Stations[i].Owner = 2
					}
				}
			}
			e.aiObserve(p, view)
			orders := e.aiSpecialOrders(p, view, aiOwnView(e, 1), Vec{X: 40000, Y: 25000})
			var chosen Order
			for _, order := range orders {
				if order.Kind == "capture" && len(order.Entities) == 1 && order.Entities[0] == worker.ID {
					if chosen.Kind != "" {
						t.Fatal("multiple station intentions", orders)
					}
					chosen = order
				}
			}
			if chosen.Target != want {
				t.Fatalf("station target=%d want=%d, public players=%+v", chosen.Target, want, view.Players)
			}
			if want != 0 {
				p.AI = ""
				issue(t, e, 1, chosen)
			}
		})
	}
}
