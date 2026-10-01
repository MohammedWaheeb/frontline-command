package sim

import (
	"strconv"
	"testing"
)

// An unaffordable emergency builder cannot consume a detached planning budget
// and starve the ordinary collector that can restore the income to pay it.
func TestAIUnaffordableEmergencyBuilderRetainsCollectorBootstrap(t *testing.T) {
	for _, bank := range []int64{900000, 1199999} {
		t.Run(strconv.FormatInt(bank, 10), func(t *testing.T) {
			e := fixture(t)
			baseInfrastructure(e, 1)
			p := e.player(1)
			view, _ := e.PlayerView(1)
			if len(view.KnownFields) == 0 {
				t.Fatal("fixture did not earn public supply memory before HQ loss")
			}
			p.AI, p.Credits = "normal", bank
			e.entity(1).HP, e.entity(2).HP = 0, 0
			var collector Order
			for _, order := range aiQualityEconomyPlan(e) {
				if order.Kind == "train" && order.Type == "US.rig" {
					t.Fatal("unaffordable emergency builder was promised", order)
				}
				if order.Kind == "train" && order.Type == "US.hauler" {
					if collector.Kind != "" {
						t.Fatal("collector bootstrap duplicated an ordinary purchase")
					}
					collector = order
				}
			}
			if collector.Kind == "" || len(collector.Entities) != 1 {
				t.Fatal("unaffordable builder reservation blocked the funded first collector")
			}
			p.AI = ""
			e.Advance()
			producer := e.entity(collector.Entities[0])
			if len(producer.Jobs) != 1 || producer.Jobs[0].Type != "US.hauler" || !producer.Jobs[0].Started || producer.Jobs[0].Emergency || producer.Jobs[0].Paid != 900000 || p.Credits != bank-900000 || p.Spent != 900000 {
				t.Fatal("collector bootstrap did not retain ordinary job and payment", producer.Jobs, p.Credits, p.Spent)
			}
		})
	}
}
