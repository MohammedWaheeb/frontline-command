package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

func aiEndgameFixture(t *testing.T, count int) *Engine {
	t.Helper()
	cfg := botMatrixConfig(count, false)
	for i := range cfg.Players {
		cfg.Players[i].AI = ""
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}
func TestAIPublicDefeatRetiresVisibleAndRememberedWrecks(t *testing.T) {
	for _, count := range []int{3, 4} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			e := aiEndgameFixture(t, count)
			p := e.player(1)
			dead := e.spawn("IR.aa", 2, Vec{X: 11000, Y: 10000}, true, 0)
			hiddenDead := e.spawn("factory", 2, Vec{X: 50000, Y: 45000}, true, 0)
			active := e.spawn("power", 3, Vec{X: 21000, Y: 8000}, true, 0)
			e.spawn("US.recon", 1, Vec{X: 16000, Y: 8000}, true, 0)
			e.recalculate()
			e.updateFog()
			before, _ := e.PlayerView(1)
			e.aiObserve(p, before)
			p.AIKnowledge = append(p.AIKnowledge, AIObservation{ID: hiddenDead.ID, Owner: 2, Type: hiddenDead.Type, Position: hiddenDead.Position, Seen: e.Tick()})
			e.defeat(e.player(2))
			e.updateFog()
			view, _ := e.PlayerView(1)
			e.aiObserve(p, view)
			for _, known := range p.AIKnowledge {
				if known.Owner == 2 {
					t.Fatalf("AI retained publicly defeated owner: %+v", known)
				}
			}
			if e.aiAirDanger(p, dead.Position) {
				t.Fatal("inactive AA still prevents sorties")
			}
			goal, ok := e.aiGoal(p, view)
			if !ok || goal != active.Position {
				t.Fatal("AI selected inactive wreck instead of active opponent", goal, p.AIIntent)
			}
		})
	}
}

func TestAIStopsPreviouslyKnownDefeatedTargetsThroughNormalOrders(t *testing.T) {
	for _, count := range []int{3, 4} {
		for _, visible := range []bool{false, true} {
			t.Run(fmt.Sprintf("%d-visible-%v", count, visible), func(t *testing.T) {
				e := aiEndgameFixture(t, count)
				p := e.player(1)
				p.AI, p.Controller = "normal", "ai"
				unit := e.spawn("US.car", 1, Vec{X: 12000, Y: 10000}, true, 0)
				position := Vec{X: 14000, Y: 10000}
				if !visible {
					position = Vec{X: 48000, Y: 45000}
				}
				target := e.spawn("IR.tank", 2, position, true, 0)
				unit.Orders = []Order{{Kind: "attack", Entities: []ID{unit.ID}, Target: target.ID}}
				p.AIKnowledge = []AIObservation{{ID: target.ID, Owner: 2, Type: target.Type, Position: position}}
				e.state.Tick = seconds(2)
				e.defeat(e.player(2))
				e.recalculate()
				e.updateFog()
				e.updateAI()
				stopped := false
				for _, batch := range e.state.Pending {
					for _, order := range batch.Orders {
						if len(order.Entities) == 1 && order.Entities[0] == unit.ID {
							if order.Kind != "stop" {
								t.Fatal("AI replaced cancellation with another intention", order)
							}
							stopped = true
						}
					}
				}
				if !stopped || len(unit.Orders) != 1 || unit.Orders[0].Kind != "attack" {
					t.Fatal("AI must enqueue an ordinary stop without mutating the live order", stopped, unit.Orders)
				}
				e.Advance()
				if len(unit.Orders) != 0 {
					t.Fatal("normal execution did not release the retired attack", unit.Orders)
				}
			})
		}
	}
}
func TestAISpecialOrdersDoNotTargetPubliclyDefeatedActors(t *testing.T) {
	e := aiEndgameFixture(t, 3)
	p := e.player(1)
	p.AI = "normal"
	recon := e.spawn("US.recon", 1, Vec{X: 13000, Y: 10000}, true, 0)
	launcher := e.spawn("US.launcher", 1, Vec{X: 14000, Y: 10000}, true, 0)
	launcher.Deployed = true
	engineer := e.spawn("US.engineer", 1, Vec{X: 12000, Y: 10000}, true, 0)
	dead := e.spawn("power", 2, Vec{X: 15000, Y: 10000}, true, 0)
	dead.HP = dead.MaxHP / 5
	e.recalculate()
	e.defeat(e.player(2))
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	orders := e.aiSpecialOrders(p, view, aiOwnView(e, 1), Vec{X: 40000, Y: 20000})
	for _, order := range orders {
		if order.Target == dead.ID {
			t.Fatalf("inactive wreck targeted by source %d: %+v (recon%d launcher%d engineer%d)", order.Entities[0], order, recon.ID, launcher.ID, engineer.ID)
		}
	}
}

func TestAIExploredMapRevisitsFogInsteadOfReturningOnlyCenter(t *testing.T) {
	e := aiEndgameFixture(t, 3)
	p := e.player(1)
	for i := range p.Explored {
		p.Explored[i] = true
	}
	seen := map[Vec]bool{}
	center := Vec{X: e.state.Map.Width * 500, Y: e.state.Map.Height * 500}
	for range 8 {
		seen[e.aiExplore(p, center)] = true
	}
	if len(seen) < 4 {
		t.Fatal("fully explored map collapsed to repeated center scouting", seen)
	}
}
func TestAIPublicStructurePulseGuidesMovementWithoutGrantingVision(t *testing.T) {
	e := aiEndgameFixture(t, 3)
	p := e.player(1)
	e.state.Tick = seconds(35 * 60)
	e.defeat(e.player(2))
	e.updateFog()
	view, _ := e.PlayerView(1)
	var active Vec
	for _, v := range view.Indicators {
		if v.Owner == 3 {
			active = v.Position
		}
	}
	if active == (Vec{}) || e.canSee(1, active) {
		t.Fatal("indicator fixture not hidden")
	}
	e.aiObserve(p, view)
	goal, ok := e.aiGoal(p, view)
	if !ok || goal != active || e.canSee(1, active) {
		t.Fatal("public pulse did not guide a vision-safe search", goal, active)
	}
	if len(p.AIKnowledge) != 0 {
		t.Fatal("position-only pulse invented a target identity")
	}
}

func TestAIRetiredTargetCancellationUsesOnlyAuthorizedIdentity(t *testing.T) {
	e := aiEndgameFixture(t, 4)
	p := e.player(1)
	unit := e.spawn("US.car", 1, Vec{X: 12000, Y: 10000}, true, 0)
	target := e.spawn("IR.tank", 2, Vec{X: 45000, Y: 48000}, true, 0)
	unit.Orders = []Order{{Kind: "attack", Target: target.ID}}
	e.defeat(e.player(2))
	e.updateFog()
	view, _ := e.PlayerView(1)
	if e.canSeeEntity(1, target) {
		t.Fatal("target must be hidden for the identity noninterference test")
	}
	if orders := e.aiRetireDefeatedTargets(p, view); len(orders) != 0 {
		t.Fatal("unknown hidden identity influenced cancellation", orders)
	}
	p.AIKnowledge = []AIObservation{{ID: target.ID, Owner: 2, Type: target.Type, Position: target.Position}}
	first, _ := json.Marshal(e.aiRetireDefeatedTargets(p, view))
	// Change private enemy ownership without changing the authorized view. The
	// planner must use its old observation, not look up the target in live state.
	target.Owner = 3
	second, _ := json.Marshal(e.aiRetireDefeatedTargets(p, view))
	if string(first) != string(second) || string(first) == "[]" {
		t.Fatal("hidden state changed cancellation", string(first), string(second))
	}
	target.Position = Vec{X: 14000, Y: 10000}
	e.updateFog()
	view, _ = e.PlayerView(1)
	if !e.canSeeEntity(1, target) {
		t.Fatal("new public owner must be visible")
	}
	if orders := e.aiRetireDefeatedTargets(p, view); len(orders) != 0 {
		t.Fatal("newly observed active owner did not override stale identity", orders)
	}
	// Hostile channels are released as well, without touching unrelated channels.
	unit.Orders = nil
	target.Owner = 2
	e.updateFog()
	view, _ = e.PlayerView(1)
	for _, channel := range []string{"capture", "sabotage", "designate", "board"} {
		unit.Channel, unit.ChannelTarget = channel, target.ID
		orders := e.aiRetireDefeatedTargets(p, view)
		if (len(orders) == 1) != (channel != "board") {
			t.Fatal("unexpected channel cancellation", channel, orders)
		}
	}
}

func TestAIDefeatedTargetCancellationFitsPlanningBudgetForLargeForce(t *testing.T) {
	e := aiEndgameFixture(t, 4)
	p := e.player(1)
	p.AI, p.Controller = "normal", "ai"
	target := e.entity(3) // Player 2's hidden, previously observed headquarters.
	p.AIKnowledge = []AIObservation{{ID: target.ID, Owner: target.Owner, Type: target.Type, Position: target.Position}}
	want := map[ID]bool{}
	for i := int32(0); i < 40; i++ {
		unit := e.spawn("US.rifle", 1, Vec{X: 16000 + i%8*1000, Y: 12000 + i/8*1000}, true, 0)
		unit.Orders = []Order{{Kind: "attack", Target: target.ID}}
		want[unit.ID] = true
	}
	e.state.Tick = seconds(2)
	e.defeat(e.player(2))
	e.recalculate()
	e.updateFog()
	e.updateAI()
	for _, batch := range e.state.Pending {
		if len(batch.Orders) > 32 {
			t.Fatal("AI exceeded its order budget")
		}
		for _, order := range batch.Orders {
			if order.Kind != "stop" {
				continue
			}
			if len(order.Entities) > 64 {
				t.Fatal("AI exceeded the command actor limit")
			}
			for _, id := range order.Entities {
				delete(want, id)
			}
		}
	}
	if len(want) != 0 {
		t.Fatal("retired target memory was dropped before the whole force could cancel", len(want))
	}
}

func TestAIDefeatedThreatDoesNotBlockTransportToActiveOpponent(t *testing.T) {
	e := aiEndgameFixture(t, 4)
	p := e.player(1)
	p.AI = "normal"
	carrier := e.spawn("US.apc", 1, Vec{X: 14000, Y: 12000}, true, 0)
	passenger := e.spawn("US.rifle", 1, Vec{X: 15000, Y: 12000}, true, 0)
	dead := e.spawn("IR.aa", 2, Vec{X: 13000, Y: 12000}, true, 0)
	active := e.entity(5) // Previously observed player 3 headquarters.
	p.AIKnowledge = []AIObservation{{ID: active.ID, Owner: active.Owner, Type: active.Type, Position: active.Position}}
	e.defeat(e.player(2))
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	goal, ok := e.aiGoal(p, view)
	if !ok || goal != active.Position || p.AIIntent != "pressure" || e.aiThreatNear(p, dead.Position, 9000) {
		t.Fatal("inactive threat prevented the active objective", goal, p.AIIntent)
	}
	orders := e.aiTransportOrders(p, aiOwnView(e, 1), goal)
	board := false
	for _, order := range orders {
		board = board || order.Kind == "board" && order.Target == carrier.ID && len(order.Entities) == 1 && order.Entities[0] == passenger.ID
	}
	if !board {
		t.Fatal("inactive wreck blocked transport collection", orders)
	}
}

func TestAIVisibleDefeatedAircraftDoNotChangeProduction(t *testing.T) {
	a, b := aiEndgameFixture(t, 3), aiEndgameFixture(t, 3)
	for _, e := range []*Engine{a, b} {
		baseInfrastructure(e, 1)
		e.player(1).AI, e.player(1).Controller = "normal", "ai"
		e.player(1).AIStage = 2 // The ordinary composition cycle will choose an APC.
		e.state.Tick = seconds(2)
	}
	b.spawn("IR.fighter", 2, Vec{X: 13000, Y: 10000}, true, 0)
	for _, e := range []*Engine{a, b} {
		e.defeat(e.player(2))
		e.recalculate()
		e.updateFog()
		e.updateAI()
	}
	first, _ := json.Marshal(a.state.Pending)
	second, _ := json.Marshal(b.state.Pending)
	if string(first) != string(second) {
		t.Fatal("defeated aircraft altered production or tactical intentions", string(first), string(second))
	}
	factoryOrder := false
	for _, batch := range b.state.Pending {
		for _, order := range batch.Orders {
			if order.Kind == "train" && len(order.Entities) == 1 && b.role(b.entity(order.Entities[0])) == "factory" {
				factoryOrder = true
				if order.Type == "US.aa" {
					t.Fatal("inactive aircraft caused an anti-air purchase")
				}
			}
		}
	}
	if !factoryOrder {
		t.Fatal("fixture did not exercise factory composition", b.state.Pending)
	}
}

func TestAIEndgameScoutingAndPublicDefeatRestoreDeterministically(t *testing.T) {
	for _, count := range []int{3, 4} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			e := aiEndgameFixture(t, count)
			for _, p := range e.state.Players {
				p.AI, p.Controller = "normal", "ai"
				for i := range p.Explored {
					p.Explored[i] = true
				}
			}
			e.state.Tick = seconds(35 * 60)
			e.defeat(e.player(2))
			e.spawn("US.recon", 1, Vec{X: 22000, Y: 22000}, true, 0)
			e.recalculate()
			e.updateFog()
			for range 7 {
				e.aiExplore(e.player(1), Vec{X: 22000, Y: 22000})
			}
			if e.player(1).AIScout == 0 {
				t.Fatal("fixture did not progress the persisted scout cursor")
			}
			data, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, data)
			if err != nil {
				t.Fatal(err)
			}
			for range 420 {
				e.Advance()
				restored.Advance()
			}
			if e.Hash() != restored.Hash() || e.player(1).LastSequence == 0 {
				t.Fatal("endgame AI state or ordinary orders diverged across restore")
			}
		})
	}
}
