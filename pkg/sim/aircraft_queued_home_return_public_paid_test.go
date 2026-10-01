package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// Depends on the exact frozen aircraft service paid fixture (78fb7692).
// Both variants purchase and physically operate the same normal scout. Naming
// its already reserved home changes no reservation and is not a queued rebase.
func TestAircraftQueuedHomeReturnPublicPaid(t *testing.T) {
	for _, variant := range []string{"targetless_control", "reserved_home_target"} {
		t.Run(variant, func(t *testing.T) {
			r := newAircraftServiceContactRun(t)
			r.build(1, "power", sim.Vec{X: 23000, Y: 22000})
			r.build(1, "barracks", sim.Vec{X: 23500, Y: 25000})
			r.build(1, "supply", sim.Vec{X: 18000, Y: 29500})
			hauler := r.typeID(1, "SY.hauler")
			if hauler == 0 { t.Fatal("ordinary paid supply hauler absent") }
			r.accept(1, sim.Order{Kind: "stop", Entities: []sim.ID{hauler}})
			r.build(1, "radar", sim.Vec{X: 27000, Y: 28500})
			home := r.build(1, "SY.workshop_air", sim.Vec{X: 30000, Y: 22000})
			drone := r.train(1, home, "SY.scout_drone")
			if r.view(1).Economy.Credits != 200000 || r.view(1).Economy.Income != 0 {
				t.Fatal("normal catalog-priced 5800-credit setup changed")
			}
			u, ok := r.c.Unit("SY.scout_drone")
			v := r.own(1, drone)
			if !ok || u.Weapon != "" || v.Private.Home != home || !v.Landed || v.Private.HP != u.HP || v.Private.ServiceWork != 0 {
				t.Fatal("normal owned mobile unarmed scout missing")
			}
			start := v.Position
			r.move(1, drone, sim.Vec{X: 38000, Y: 22000}, 160)
			r.advance(120)
			v = r.own(1, drone)
			if v.Landed || v.Private.Endurance >= 2400 || aircraftServiceContactDist2(start, v.Position) < 4000*4000 {
				t.Fatal("ordinary sortie did not travel and consume endurance")
			}
			// Keep an actual Move active, so Queued means append rather than
			// immediately starting Return on an idle craft.
			r.accept(1, sim.Order{Kind: "move", Entities: []sim.ID{drone}, Position: sim.Vec{X: 42000, Y: 24000}})
			if orders := r.own(1, drone).Private.Orders; len(orders) != 1 || orders[0].Kind != "move" {
				t.Fatal("preceding ordinary Move was not active")
			}
			order := sim.Order{Kind: "return", Entities: []sim.ID{drone}, Queued: true}
			if variant == "reserved_home_target" { order.Target = r.own(1, drone).Private.Home }
			if variant == "reserved_home_target" && order.Target != home { t.Fatal("current reserved home changed") }
			before := r.e.Hash()
			advice, err := r.e.PreviewOrders(1, []sim.Order{order})
			if err != nil || len(advice) != 1 || r.e.Hash() != before { t.Fatal("read-only ordinary Return advice failed", err) }
			t.Logf("queued reserved-home Return advice: variant=%s tick=%d target=%d accepted=%t code=%s", variant, r.e.Tick(), order.Target, advice[0].Accepted, advice[0].Code)
			r.sample("before_queued_return_admission")
			// Submit even if advice rejects, retaining the actual failed receipt
			// in the unchanged fixture's public-inputs/final-save/replay archive.
			r.accept(1, order)
			if !advice[0].Accepted || advice[0].Code != "ok" { t.Fatal("accepted Return disagreed with advice", advice) }
			points := []sim.Vec{{X: 42000, Y: 26000}, {X: 42000, Y: 30000}}
			r.accept(1, sim.Order{Kind: "patrol", Entities: []sim.ID{drone}, Points: points, Queued: true})
			v = r.own(1, drone)
			if len(v.Private.Orders) != 3 || v.Private.Orders[0].Kind != "move" || v.Private.Orders[1].Kind != "return" || v.Private.Orders[2].Kind != "patrol" || v.Private.Home != home || v.Private.HP != u.HP || r.view(1).Economy.Credits != 200000 {
				t.Fatal("accepted queue changed task order, home reservation, HP or paid ledger")
			}
			r.checkpoint()
			r.wait(300, "queued owned-home Return touchdown", func() bool {
				v := r.own(1, drone)
				return v.Landed && v.Private.ServiceWork > 0
			})
			touchdown := r.e.Tick()
			v = r.own(1, drone)
			parked := v.Position
			if len(v.Private.Orders) != 2 || v.Private.Orders[0].Kind != "return" || v.Private.Orders[1].Kind != "patrol" || v.Private.Home != home || v.Private.Endurance >= 2400 {
				t.Fatal("queued Return did not start normal service while retaining Patrol")
			}
			r.sample("queued_return_actual_touchdown")
			r.advance(359)
			v = r.own(1, drone)
			if !v.Landed || v.Position != parked || v.Private.ServiceWork == 0 || v.Private.Endurance >= 2400 || len(v.Private.Orders) != 2 {
				t.Fatal("queued useful work departed or refilled before full 18-second service")
			}
			r.advance(1)
			v = r.own(1, drone)
			if r.e.Tick() != touchdown+360 || !v.Landed || v.Position != parked || v.Private.ServiceWork != 0 || v.Private.Endurance != 2400 || v.Private.Home != home || len(v.Private.Orders) != 1 || v.Private.Orders[0].Kind != "patrol" || r.view(1).Economy.Credits != 200000 {
				t.Fatal("service did not activate exactly the preserved Patrol without free HP or charge")
			}
			r.sample("service_complete_preserved_patrol_active")
			visited := map[int]bool{}
			r.wait(240, "useful queued Patrol rejoin after service", func() bool {
				v := r.own(1, drone)
				if !v.Landed && aircraftServiceContactDist2(parked, v.Position) >= 4000*4000 {
					for i, point := range points { if aircraftServiceContactDist2(v.Position, point) < 600*600 { visited[i] = true } }
				}
				return len(visited) == 2
			})
			v = r.own(1, drone)
			if v.Landed || v.Private.Home != home || v.Private.HP != u.HP || v.Private.ServiceWork != 0 || len(v.Private.Orders) != 1 || v.Private.Orders[0].Kind != "patrol" || r.view(1).Economy.Credits != 200000 || r.view(1).Economy.Income != 0 {
				t.Fatal("rejoined Patrol did not preserve ordinary craft resources and paid ledger")
			}
			r.proofs["normal_paid_catalog_setup"] = true
			r.proofs["queued_return_advice_and_actual_receipt"] = true
			r.proofs["same_home_no_reservation_change"] = true
			r.proofs["full_18_second_service_preserves_patrol"] = true
			r.proofs["useful_patrol_physical_rejoin_both_points"] = true
			r.finish()
		})
	}
}
