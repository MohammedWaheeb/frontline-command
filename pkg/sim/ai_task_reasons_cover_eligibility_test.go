package sim

import (
	"reflect"
	"testing"
)

// These are bounded synthetic owned-state controls for the optional planner.
// Seeded actors, injuries and launch/aim flags are not paid production, elapsed
// healing, damage or match competence evidence. The separate unchanged paid
// queue diagnostic covers ordinary Train, movement, combat, Hold and replay.
func TestAI48GroundCoverEligibilityControls(t *testing.T) {
	for _, tc := range []struct {
		name string
		want string
	}{
		{name: "idle_cover", want: "cover"},
		{name: "sole_nonqueued_attack_move", want: "cover"},
		{name: "queued_hold_tail"},
		{name: "queued_front_attack_move"},
		{name: "canonical_manual_hold"},
		{name: "current_ordinary_aim"},
		{name: "recent_launch_before_quiet_boundary"},
		{name: "launch_at_quiet_boundary", want: "cover"},
		{name: "useful_targeted_guard"},
		{name: "critical_queued_attack_and_recent_aim", want: "repair"},
		{name: "critical_manual_hold_and_recent_launch", want: "repair"},
		{name: "critical_deployed_vehicle", want: "pack"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := fixture(t)
			e.state.Tick = seconds(10)
			p := e.player(1)
			p.AI = "normal"
			goal, cover := Vec{X: 26000, Y: 17000}, Vec{X: 22500, Y: 16500}
			e.state.Map.Tiles[16*e.state.Map.Width+22].Terrain = "cover"
			unitType, sourceType, leaderType := "US.rifle", "US.medic", "US.tank"
			if tc.name == "critical_deployed_vehicle" {
				p.Faction = "SA"
				unitType, sourceType, leaderType = "SA.tank", "depot", "SA.tank"
			}
			unit := e.spawn(unitType, 1, Vec{X: 21000, Y: 17000}, true, 0)
			source := e.spawn(sourceType, 1, Vec{X: 12000, Y: 17000}, true, 0)
			leader := e.spawn(leaderType, 1, Vec{X: 15000, Y: 26000}, true, 0)
			threat := e.spawn("IR.rifle", 2, goal, true, 0)
			p.Credits, p.RepairReserve = 1000000, 300000
			e.updateFog()
			view, ok := e.PlayerView(1)
			if !ok {
				t.Fatal("synthetic owner view unavailable")
			}
			e.aiObserve(p, view)
			if unitType == "US.rifle" {
				point, useful := e.aiCoverPosition(p, unit, goal)
				if !useful || point != cover {
					t.Fatal("synthetic control lacks exact useful public cover", point, useful)
				}
			}
			e.assign(unit, Order{Kind: "attack_move", Position: goal})
			switch tc.name {
			case "idle_cover":
				e.assign(unit, Order{Kind: "stop"})
			case "queued_hold_tail":
				e.assign(unit, Order{Kind: "hold", Queued: true})
			case "queued_front_attack_move":
				// An ordinary queued waypoint retains this bit when promoted.
				e.assign(unit, Order{Kind: "stop"})
				e.assign(unit, Order{Kind: "attack_move", Position: goal, Queued: true})
			case "canonical_manual_hold":
				e.assign(unit, Order{Kind: "hold"})
			case "current_ordinary_aim":
				unit.Target, unit.LastTarget = threat.ID, threat.Position
				unit.AimUntil, unit.State = e.Tick()+3, "aiming"
			case "recent_launch_before_quiet_boundary":
				unit.EverDealt, unit.LastDealt = true, e.Tick()-seconds(3)+1
			case "launch_at_quiet_boundary":
				unit.EverDealt, unit.LastDealt = true, e.Tick()-seconds(3)
			case "useful_targeted_guard":
				e.assign(unit, Order{Kind: "guard", Target: leader.ID, Position: leader.Position})
			case "critical_queued_attack_and_recent_aim":
				unit.HP = unit.MaxHP / 4
				e.assign(unit, Order{Kind: "hold", Queued: true})
				unit.Target, unit.LastTarget = threat.ID, threat.Position
				unit.AimUntil, unit.State = e.Tick()+3, "aiming"
				unit.EverDealt, unit.LastDealt = true, e.Tick()
			case "critical_manual_hold_and_recent_launch":
				unit.HP = unit.MaxHP / 4
				e.assign(unit, Order{Kind: "hold"})
				unit.EverDealt, unit.LastDealt = true, e.Tick()
			case "critical_deployed_vehicle":
				unit.HP, unit.Deployed = unit.MaxHP/4, true
			}
			before := append([]Order(nil), unit.Orders...)
			beforeHash := e.Hash()
			orders := e.aiRecoveryOrders(p, aiOwnView(e, 1), goal)
			if !reflect.DeepEqual(unit.Orders, before) || beforeHash != e.Hash() {
				t.Fatal("recovery planning mutated controlled prior work", before, unit.Orders)
			}
			order, found := aiUnitOrder(orders, unit.ID)
			if tc.want == "" {
				if found {
					t.Fatal("optional cover displaced a protected healthy obligation", order)
				}
				return
			}
			if !found || len(order.Entities) != 1 || order.Entities[0] != unit.ID || order.Queued {
				t.Fatal("expected one ordinary recovery intent", orders)
			}
			switch tc.want {
			case "cover":
				if order.Kind != "guard" || order.Target != 0 || order.Position != cover {
					t.Fatal("ordinary quiet cover eligibility was lost", order)
				}
			case "repair":
				if order.Kind != "guard" || order.Target != source.ID || order.Position != source.Position || !source.Active(e.Tick()) || e.repairRate(source, unit) == 0 || p.Credits <= p.RepairReserve || e.aiThreatNear(p, source.Position, 6000) {
					t.Fatal("optional eligibility suppressed an available funded critical recovery", order, source)
				}
			case "pack":
				if order.Kind != "pack" {
					t.Fatal("optional deployed guard suppressed critical packing", order)
				}
			}
			if code := e.execute(1, order); code != "ok" {
				t.Fatal("recovery intent failed the ordinary executor", code, order)
			}
			if tc.want == "pack" && (unit.Deployed || unit.PackingUntil <= e.Tick()) {
				t.Fatal("critical packing failed to begin ordinary transition", unit)
			}
		})
	}
}
