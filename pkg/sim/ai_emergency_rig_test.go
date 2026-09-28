package sim

import "testing"

func TestAIEmergencyRigRequiresLegalOwnedProducer(t *testing.T) {
	for _, condition := range []string{"unfinished", "disabled", "complete"} {
		t.Run(condition, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "normal"
			p.Credits = 2000000
			for _, v := range e.state.Entities {
				if v.Owner == 1 {
					v.HP = 0
				}
			}
			factory := e.spawn("factory", 1, Vec{X: 18000, Y: 18000}, condition != "unfinished", 0)
			if condition == "disabled" {
				factory.Enabled = false
			}
			e.recalculate()
			e.updateFog()
			e.state.Tick = 40
			e.updateAI()
			var recovery []Order
			for _, batch := range e.state.Pending {
				for _, order := range batch.Orders {
					if order.Kind == "train" && order.Type == "US.rig" {
						recovery = append(recovery, order)
					}
				}
			}
			if condition != "complete" {
				if len(recovery) > 0 {
					t.Fatal("AI tried unavailable emergency production", condition, recovery)
				}
				return
			}
			if len(recovery) != 1 || recovery[0].Entities[0] != factory.ID {
				t.Fatal("legal emergency factory was ignored", recovery)
			}
			p.AI = ""
			e.Advance()
			if len(factory.Jobs) != 1 || !factory.Jobs[0].Emergency || !factory.Jobs[0].Started || p.Spent != 1200000 {
				t.Fatal("emergency rig did not use ordinary paid job", factory.Jobs, p.Spent)
			}
		})
	}
}
