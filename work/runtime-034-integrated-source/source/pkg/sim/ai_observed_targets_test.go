package sim

import (
	"reflect"
	"testing"
)

func aiTargetOrders(e *Engine, source ID) []Order {
	view, _ := e.PlayerView(1)
	e.aiObserve(e.player(1), view)
	all := e.aiSpecialOrders(e.player(1), view, aiOwnView(e, 1), Vec{X: 32000, Y: 32000})
	var result []Order
	for _, o := range all {
		for _, id := range o.Entities {
			if id == source {
				result = append(result, o)
				break
			}
		}
	}
	return result
}

func TestAIDesignationSkipsVisibleInfantryAndUsesValidAlternative(t *testing.T) {
	for _, alternative := range []string{"", "IR.car", "IR.tank", "power"} {
		t.Run(alternative, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "normal"
			recon := e.spawn("US.recon", 1, Vec{X: 16000, Y: 14000}, true, 0)
			bad := e.spawn("IR.rifle", 2, Vec{X: 18000, Y: 14000}, true, 0)
			var good *Entity
			if alternative != "" {
				good = e.spawn(alternative, 2, Vec{X: 20000, Y: 16000}, true, 0)
			}
			e.recalculate()
			e.updateFog()
			if !e.canSeeEntity(1, bad) {
				t.Fatal("invalid candidate must be observed")
			}
			orders := aiTargetOrders(e, recon.ID)
			if good == nil {
				if len(orders) != 0 {
					t.Fatal("infantry cannot be designated", orders)
				}
				return
			}
			if len(orders) != 1 || orders[0].Type != "designate" || orders[0].Target != good.ID {
				t.Fatal("missed legal observed alternative", orders)
			}
			p.AI = ""
			issue(t, e, 1, orders[0])
		})
	}
}

func TestAICaptureSkipsVisibleFoundationAndUsesCompletedAlternative(t *testing.T) {
	for _, haveAlternative := range []bool{false, true} {
		t.Run(map[bool]string{false: "foundation_only", true: "completed_alternative"}[haveAlternative], func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "normal"
			engineer := e.spawn("US.engineer", 1, Vec{X: 16000, Y: 14000}, true, 0)
			foundation := e.spawn("power", 2, Vec{X: 18000, Y: 14000}, false, 0)
			var good *Entity
			if haveAlternative {
				good = e.spawn("power", 2, Vec{X: 20000, Y: 16000}, true, 0)
				good.HP = good.MaxHP / 5
			}
			e.recalculate()
			e.updateFog()
			if !e.canSeeEntity(1, foundation) {
				t.Fatal("foundation must be observed")
			}
			orders := aiTargetOrders(e, engineer.ID)
			if good == nil {
				if len(orders) != 0 {
					t.Fatal("incomplete building cannot be captured", orders)
				}
				return
			}
			if len(orders) != 1 || orders[0].Kind != "capture" || orders[0].Target != good.ID {
				t.Fatal("missed completed observed alternative", orders)
			}
			p.AI = ""
			issue(t, e, 1, orders[0])
		})
	}
}

func TestAIObservedTargetFilteringIgnoresHiddenAlternatives(t *testing.T) {
	e := fixture(t)
	e.player(1).AI = "normal"
	recon := e.spawn("US.recon", 1, Vec{X: 16000, Y: 14000}, true, 0)
	engineer := e.spawn("US.engineer", 1, Vec{X: 16000, Y: 18000}, true, 0)
	e.spawn("IR.rifle", 2, Vec{X: 18000, Y: 14000}, true, 0)
	e.spawn("power", 2, Vec{X: 20000, Y: 17000}, false, 0)
	hidden := e.spawn("IR.tank", 2, Vec{X: 58000, Y: 12000}, true, 0)
	hiddenBuilding := e.spawn("power", 2, Vec{X: 52000, Y: 12000}, false, 0)
	e.recalculate()
	e.updateFog()
	if e.canSeeEntity(1, hidden) || e.canSeeEntity(1, hiddenBuilding) {
		t.Fatal("hidden controls unexpectedly visible")
	}
	beforeRecon, beforeEngineer := aiTargetOrders(e, recon.ID), aiTargetOrders(e, engineer.ID)
	hidden.Type = "IR.rifle"
	hiddenBuilding.Complete = true
	hiddenBuilding.HP = hiddenBuilding.MaxHP / 5
	e.updateFog()
	afterRecon, afterEngineer := aiTargetOrders(e, recon.ID), aiTargetOrders(e, engineer.ID)
	if !reflect.DeepEqual(beforeRecon, afterRecon) || !reflect.DeepEqual(beforeEngineer, afterEngineer) {
		t.Fatal("unseen target eligibility changed decisions", beforeRecon, afterRecon, beforeEngineer, afterEngineer)
	}
	if len(afterRecon) != 1 || afterRecon[0].Target == hidden.ID || len(afterEngineer) != 0 {
		t.Fatal("observed building designation or hidden capture filtering wrong", afterRecon, afterEngineer)
	}
}
