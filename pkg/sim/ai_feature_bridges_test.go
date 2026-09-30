package sim

import (
	"reflect"
	"testing"
)

func TestAIFeatureShahedCompositionKeepsISRAndFighter(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	p.Tier, p.AIStage = 2, 1
	for _, control := range []struct {
		choice string
		counts map[string]int32
		want   string
	}{
		{"strike", map[string]int32{"isr": 1}, "shahed"},
		{"gunship", map[string]int32{"isr": 1}, "shahed"},
		{"isr", map[string]int32{}, "isr"},
		{"fighter", map[string]int32{"isr": 1}, "fighter"},
		{"strike", map[string]int32{"isr": 1, "shahed": 2}, "strike"},
	} {
		if got := e.aiAirFeatureChoice(p, control.counts, control.choice); got != control.want {
			t.Fatalf("choice=%s counts=%v got=%s want=%s", control.choice, control.counts, got, control.want)
		}
	}
	p.Tier = 1
	if got := e.aiAirFeatureChoice(p, map[string]int32{"isr": 1}, "strike"); got != "strike" {
		t.Fatal("Shahed chosen without ordinary tier prerequisite", got)
	}
}

func TestAIFeatureCommittedShahedKeepsFixedOrder(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	p.AI, p.Energy, p.Tier = "hard", 100000, 2
	home := e.spawn("IR.drone_hub", 2, Vec{X: 44000, Y: 46000}, true, 0)
	drone := e.spawn("IR.shahed", 2, Vec{X: 46000, Y: 46000}, true, 0)
	drone.Home, drone.ShahedCommitted, drone.Landed, drone.Ammo = home.ID, true, false, 0
	drone.LastTarget = Vec{X: 25000, Y: 25000}
	drone.Orders = []Order{{Kind: "move", Position: drone.LastTarget}}
	drone.HP, drone.Endurance = drone.MaxHP/4, 200
	e.updateFog()
	own := aiOwnView(e, 2)
	before := append([]Order(nil), drone.Orders...)
	if e.aiAirReady(drone, own) {
		t.Fatal("committed terminal payload admitted as ready reusable aircraft")
	}
	if order, ok := e.aiAirReturnOrder(p, drone, own, map[ID]int32{}); ok {
		t.Fatal("committed terminal payload returned/rebased", order)
	}
	for _, order := range e.aiAirRecoveryOrders(p, own) {
		for _, id := range order.Entities {
			if id == drone.ID {
				t.Fatal("recovery attempted to recall/return committed payload", order)
			}
		}
	}
	view, _ := e.PlayerView(2)
	for _, order := range e.aiSpecialOrders(p, view, own, drone.LastTarget) {
		for _, id := range order.Entities {
			if id == drone.ID {
				t.Fatal("optional tactic addressed committed payload", order)
			}
		}
	}
	if !reflect.DeepEqual(before, drone.Orders) || drone.LastTarget != before[0].Position || drone.Ammo != 0 {
		t.Fatal("AI planning mutated fixed commitment")
	}
}

func TestAIFeatureShahedTargetUsesVisiblePublicGroundAndKnownAA(t *testing.T) {
	e := fixture(t)
	p := e.player(2)
	drone := e.spawn("IR.shahed", 2, Vec{X: 45000, Y: 45000}, true, 0)
	rifle := e.spawn("US.rifle", 1, Vec{X: 46000, Y: 45000}, true, 0)
	plane := e.spawn("US.fighter", 1, Vec{X: 44000, Y: 45000}, true, 0)
	plane.Landed = false
	hidden := e.spawn("US.tank", 1, Vec{X: 10000, Y: 30000}, true, 0)
	e.updateFog()
	view, _ := e.PlayerView(2)
	for _, actor := range view.Entities {
		if actor.ID == hidden.ID {
			t.Fatal("hidden target fixture disclosed")
		}
	}
	target, ok := e.aiShahedTarget(p, view, drone, rifle.Position)
	if !ok || target.ID != rifle.ID {
		t.Fatal("did not choose earned visible ground target", target, ok)
	}
	hidden.Position, hidden.HP, hidden.Type = rifle.Position, 1, "hq"
	again, ok := e.aiShahedTarget(p, view, drone, rifle.Position)
	if !ok || again.ID != target.ID {
		t.Fatal("hidden live state changed frozen public target decision", again, ok)
	}
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 1, Type: "US.aa", Position: rifle.Position, Seen: e.Tick()}}
	if target, ok := e.aiShahedTarget(p, view, drone, rifle.Position); ok {
		t.Fatal("committed through known public AA", target)
	}
}

func TestAIFeatureObservePreservesProductiveScouts(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	scout := e.spawn("US.recon", 1, Vec{X: 18000, Y: 18000}, true, 0)
	scout.LastPosition = scout.Position
	p.AIFields = []FieldView{{ID: 1, Position: Vec{X: 14000, Y: 8000}, Remaining: 1000000}}
	sight := e.sightRange(scout)
	ring := Vec{X: scout.Position.X + sight + 500, Y: scout.Position.Y}
	if distance(scout.Position, ring) <= sight || distance(scout.Position, ring) > sight+reconObserveSightBonus {
		t.Fatal("Observe fixture must be outside ordinary sight and inside earned additional sight")
	}
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "IR.rifle", Position: ring, Seen: e.Tick()}}
	e.updateFog()
	view, _ := e.PlayerView(1)
	if !e.aiReconObserveUseful(p, view, scout) {
		t.Fatal("idle stationary scout cannot Observe threat in earned additional sight ring")
	}
	p.AIKnowledge[0].Position = Vec{X: scout.Position.X + sight - 500, Y: scout.Position.Y}
	if e.aiReconObserveUseful(p, view, scout) {
		t.Fatal("Observe replaced ordinary recon work for an already visible-range threat")
	}
	p.AIKnowledge[0].Position = ring
	for _, kind := range []string{"move", "guard", "attack", "capture"} {
		scout.Orders = []Order{{Kind: kind, Position: Vec{X: 20000, Y: 18000}}}
		if e.aiReconObserveUseful(p, view, scout) {
			t.Fatal("Observe preempted existing scout duty", kind)
		}
	}
	scout.Orders = nil
	scout.Channel = "designate"
	if e.aiReconObserveUseful(p, view, scout) {
		t.Fatal("Observe preempted accepted channel")
	}
	scout.Channel = ""
	p.AIFields = nil
	if e.aiReconObserveUseful(p, view, scout) {
		t.Fatal("Observe stranded resource exploration")
	}
}

func TestAIFeatureRadarStableReadySourcePaysOnce(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Energy = "hard", 50000
	e.spawn("power", 1, Vec{X: 26000, Y: 30000}, true, 0)
	first := e.spawn("radar", 1, Vec{X: 30000, Y: 30000}, true, 0)
	second := e.spawn("radar", 1, Vec{X: 31000, Y: 31000}, true, 0)
	goal := Vec{X: 43000, Y: 30000}
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "factory", Position: goal, Seen: e.Tick()}}
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	if e.canSee(1, goal) {
		t.Fatal("Radar fixture goal must be hidden")
	}
	own := aiOwnView(e, 1)
	for i, j := 0, len(own)-1; i < j; i, j = i+1, j-1 {
		own[i], own[j] = own[j], own[i]
	}
	order, ok := e.aiRadarPulseOrder(p, view, own, goal, nil)
	if !ok || len(order.Entities) != 1 || order.Entities[0] != first.ID {
		t.Fatal("lowest ready source selection changed with input order", order, ok)
	}
	credits, energy, supply := e.aiOrderReservation(p, &order)
	if credits != 0 || energy != 25000 || supply != 0 {
		t.Fatal("Pulse missing single energy reservation", credits, energy, supply)
	}
	before := p.Energy
	if code := e.execute(1, order); code != "ok" || p.Energy != before-25000 || !cooldown(first.Cooldowns, "radar_pulse", e.Tick()) {
		t.Fatal("ordinary Pulse did not charge source once", code, p.Energy)
	}
	fallback, ok := e.aiRadarPulseOrder(p, view, own, goal, nil)
	if !ok || fallback.Entities[0] != second.ID {
		t.Fatal("cooling source displaced ready source", fallback, ok)
	}
	second.Enabled = false
	if order, ok := e.aiRadarPulseOrder(p, view, own, goal, nil); ok {
		t.Fatal("inactive/cooling radars admitted", order)
	}
}

func TestAIFeatureRadarUnknownAndUsedSourceRemainUnchosen(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Energy = "hard", 50000
	e.spawn("power", 1, Vec{X: 26000, Y: 30000}, true, 0)
	radar := e.spawn("radar", 1, Vec{X: 30000, Y: 30000}, true, 0)
	goal := Vec{X: 43000, Y: 30000}
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	own := aiOwnView(e, 1)
	if order, ok := e.aiRadarPulseOrder(p, view, own, goal, nil); ok {
		t.Fatal("arbitrary hidden goal consumed energy", order)
	}
	p.AIKnowledge = []AIObservation{{ID: 900, Owner: 2, Type: "factory", Position: goal, Seen: e.Tick()}}
	if order, ok := e.aiRadarPulseOrder(p, view, own, goal, map[ID]bool{radar.ID: true}); ok {
		t.Fatal("Pulse displaced retained prior source duty", order)
	}
	p.Energy = 24999
	if order, ok := e.aiRadarPulseOrder(p, view, own, goal, nil); ok {
		t.Fatal("Pulse admitted below actual cost", order)
	}
}
