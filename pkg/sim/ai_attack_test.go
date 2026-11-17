package sim

import (
	"reflect"
	"testing"
)

func aiWaveFixture(t *testing.T, difficulty string, count int) (*Engine, []*Entity, Vec) {
	t.Helper()
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Controller, p.Credits = difficulty, "ai", 0
	e.state.Tick = seconds(180)
	goal := e.entity(3).Position
	rally := e.aiWaveRally(p, aiOwnView(e, 1), goal)
	army := []*Entity{}
	for i := 0; i < count; i++ {
		v := e.spawn("US.tank", 1, Vec{X: rally.X + int32(i%3)*500, Y: rally.Y + int32(i/3)*500}, true, 0)
		army = append(army, v)
	}
	e.recalculate()
	e.updateFog()
	return e, army, goal
}

func aiWaveGroups(orders []Order) int {
	count := 0
	for _, o := range orders {
		if o.Kind == "attack_move" && len(o.Entities) >= 3 {
			count++
		}
	}
	return count
}

func TestAIBetaWaveExpiredPaidAssaultContinuesWhileReinforcementsStage(t *testing.T) {
	e := fixture(t)
	// Declared infrastructure only; all seven measured AT teams pay and finish
	// ordinary production. The deadline jump below isolates the policy boundary,
	// rather than claiming this checkpoint is a natural-start match.
	e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 0)
	producer := e.spawn("barracks", 1, Vec{X: 12000, Y: 20000}, true, 0)
	e.recalculate()
	e.updateFog()
	p := e.player(1)
	p.Controller = "ai"
	p.AI = "normal"
	goal := e.entity(3).Position
	rally := e.aiWaveRally(p, aiOwnView(e, 1), goal)
	p.AI = ""
	issue(t, e, 1, Order{Kind: "rally", Entities: []ID{producer.ID}, Position: rally})
	for i := 0; i < 6; i++ {
		issue(t, e, 1, Order{Kind: "train", Entities: []ID{producer.ID}, Type: "US.at"})
	}
	for len(producer.Jobs) > 0 && e.Tick() < seconds(300) {
		e.Advance()
	}
	var army []*Entity
	rule, _ := e.catalog.Unit("US.at")
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Type == "US.at" {
			if v.Paid != rule.Cost {
				t.Fatal("assault actor was not ordinarily paid", v.ID, v.Paid)
			}
			army = append(army, v)
		}
	}
	if len(army) != 6 || p.Spent != 6*rule.Cost {
		t.Fatal("paid cohort did not complete", len(army), p.Spent)
	}
	// Let the final paid team reach the ordinary rendezvous.
	ticks(e, 100)
	p.AI = "normal"
	orders, _ := e.aiWaveOrders(p, aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) != 1 {
		t.Fatal("paid cohort did not release", orders)
	}
	e.aiDispatchOrders(p, orders)
	p.AI = ""
	e.Advance()
	var veteran *Entity
	deadline := Tick(0)
	for _, v := range army {
		for _, c := range v.Cooldowns {
			if c.ID == "ai_wave_member" && c.Until > 0 {
				veteran, deadline = v, c.Until
			}
		}
	}
	if veteran == nil || len(veteran.Orders) != 1 || veteran.Orders[0].Kind != "attack_move" {
		t.Fatal("ordinary paid assault did not begin")
	}
	issue(t, e, 1, Order{Kind: "rally", Entities: []ID{producer.ID}, Position: Vec{X: 30000, Y: 20000}})
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{producer.ID}, Type: "US.at"})
	for len(producer.Jobs) > 0 {
		e.Advance()
	}
	var reinforcement *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Type == "US.at" && v.ID > army[len(army)-1].ID {
			reinforcement = v
		}
	}
	if reinforcement == nil || reinforcement.Paid != rule.Cost || p.Spent != 7*rule.Cost {
		t.Fatal("reinforcement did not pay normally")
	}
	// Only the clock boundary is prepared. Positions, HP, ordinary attack and
	// production orders remain the real execution state from the paid course.
	e.state.Tick = deadline + 1
	p.AI = "normal"
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	orders, _ = e.aiWaveOrders(p, aiOwnView(e, 1), goal, true, nil)
	twinOrders, _ := twin.aiWaveOrders(twin.player(1), aiOwnView(twin, 1), goal, true, nil)
	if !reflect.DeepEqual(orders, twinOrders) || e.Hash() != twin.Hash() {
		t.Fatal("expiry planning diverged after restore", orders, twinOrders)
	}
	staged := false
	for _, o := range orders {
		for _, id := range o.Entities {
			if id == veteran.ID {
				t.Fatal("bookkeeping expiry withdrew a healthy ordinary assault", o)
			}
			if id == reinforcement.ID {
				if o.Kind != "move" {
					t.Fatal("new reinforcement bypassed staging", o)
				}
				staged = true
			}
		}
	}
	if !staged || cooldown(reinforcement.Cooldowns, "ai_wave_member", e.Tick()) {
		t.Fatal("fresh reinforcement did not remain staged", orders)
	}
	defender, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	defender.player(1).AIIntent = "defend"
	defenseGoal := defender.entity(1).Position
	defense, _ := defender.aiWaveOrders(defender.player(1), aiOwnView(defender, 1), defenseGoal, true, nil)
	redirected := false
	for _, o := range defense {
		for _, id := range o.Entities {
			redirected = redirected || id == veteran.ID && o.Kind == "attack_move" && o.Position == defenseGoal
		}
	}
	if !redirected {
		t.Fatal("expired assault ignored immediate defense", defense)
	}
	e.aiDispatchOrders(p, orders)
	twin.aiDispatchOrders(twin.player(1), twinOrders)
	p.AI, twin.player(1).AI = "", ""
	before, hp := distance(veteran.Position, goal), e.entity(3).HP
	for range 80 {
		e.Advance()
		twin.Advance()
		if e.Hash() != twin.Hash() {
			t.Fatal("ordinary expiry continuation diverged", e.Tick())
		}
	}
	if distance(veteran.Position, goal) >= before && e.entity(3).HP >= hp {
		t.Fatal("retained assault made neither ordinary progress nor damage")
	}
	t.Logf("paid expiry continuation: spent=%d actors=7 deadline=%d progress=%d->%d target_hp=%d->%d restored_hash=%s", p.Spent, deadline, before, distance(veteran.Position, goal), hp, e.entity(3).HP, e.Hash())
}

func TestAIBetaWaveCombatThresholdAndRendezvous(t *testing.T) {
	e, army, goal := aiWaveFixture(t, "normal", 3)
	for i := 0; i < 12; i++ {
		e.spawn("US.recon", 1, Vec{X: 10000, Y: 16000}, true, 0)
		e.spawn("US.engineer", 1, Vec{X: 11000, Y: 16000}, true, 0)
	}
	e.recalculate()
	e.updateFog()
	orders, claimed := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) != 0 {
		t.Fatal("support/scout supply released undersized combat wave", orders)
	}
	for _, v := range army {
		if !claimed[v.ID] {
			t.Fatal("combat actor not claimed")
		}
	}
	// A fourth healthy combat actor completes the threshold at the rendezvous.
	rally := e.aiWaveRally(e.player(1), aiOwnView(e, 1), goal)
	army = append(army, e.spawn("US.tank", 1, rally, true, 0))
	e.recalculate()
	e.updateFog()
	orders, _ = e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) != 1 || len(orders[len(orders)-1].Entities) != 4 {
		t.Fatal("ready mixed-capable cohort did not release", orders)
	}
	t.Logf("combat-only release: %d members despite %d total Supply", len(orders[len(orders)-1].Entities), e.player(1).Supply)
}

func TestAIBetaWaveReinforcementsStageAndLossesRegroup(t *testing.T) {
	e, army, goal := aiWaveFixture(t, "hard", 7)
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) != 1 {
		t.Fatal("missing first wave", orders)
	}
	e.aiDispatchOrders(e.player(1), orders)
	e.state.Tick++
	e.executePending()
	rally := e.aiWaveRally(e.player(1), aiOwnView(e, 1), goal)
	reinforcement := e.spawn("US.tank", 1, Vec{X: rally.X - 8000, Y: rally.Y}, true, 0)
	e.recalculate()
	e.updateFog()
	orders, _ = e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if cooldown(reinforcement.Cooldowns, "ai_wave_member", e.Tick()) {
		t.Fatal("reinforcement joined active wave")
	}
	for _, o := range orders {
		for _, id := range o.Entities {
			if id == reinforcement.ID && o.Kind == "attack_move" {
				t.Fatal("reinforcement trickled into assault", o)
			}
		}
	}
	// Leave two of the six released members alive; own losses trigger regroup.
	for _, v := range army[2:6] {
		v.HP = 0
	}
	e.recalculate()
	e.updateFog()
	orders, _ = e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if !cooldown(e.player(1).Cooldowns, "ai_wave_regroup", e.Tick()) {
		t.Fatal("heavy losses did not start regroup cooldown", orders)
	}
	retreats := 0
	for _, o := range orders {
		if o.Kind == "move" {
			retreats++
		}
	}
	if retreats == 0 {
		t.Fatal("survivors did not receive rendezvous movement", orders)
	}
	t.Logf("reinforcement excluded from active cohort; %d regroup movement orders after losses", retreats)
}

func TestAIBetaWaveReadinessDefenseAndMissionGate(t *testing.T) {
	e, army, goal := aiWaveFixture(t, "normal", 5)
	for _, v := range army {
		v.Position = Vec{X: 40000, Y: 15000}
	}
	e.recalculate()
	e.updateFog()
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) > 0 {
		t.Fatal("scattered unready force released", orders)
	}
	e.player(1).AIIntent = "defend"
	orders, _ = e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	attacks := 0
	for _, o := range orders {
		if o.Kind == "attack_move" {
			attacks++
		}
	}
	if attacks != 5 {
		t.Fatal("immediate defense could not preempt staging", orders)
	}
	e.state.Mission = &MissionState{}
	orders, claimed := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if len(orders) != 0 || len(claimed) != 0 {
		t.Fatal("strategic wave planner changed authored mission")
	}
}

func TestAIBetaWaveSaveRestoreReplayAndFogHonesty(t *testing.T) {
	e, _, goal := aiWaveFixture(t, "normal", 6)
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	e.aiDispatchOrders(e.player(1), orders)
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	if e.Hash() != twin.Hash() {
		t.Fatal("wave cooldown state not saved")
	}
	// Enemy bank and orders cannot alter the same authorized planner view.
	twin.player(2).Credits += 1000000
	left, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	right, _ := twin.aiWaveOrders(twin.player(1), aiOwnView(twin, 1), goal, true, nil)
	if !reflect.DeepEqual(left, right) {
		t.Fatal("hidden state changed wave decisions", left, right)
	}
	twin.player(2).Credits -= 1000000
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for range 85 {
		e.Advance()
		twin.Advance()
		if e.Hash() != twin.Hash() {
			t.Fatal("wave restore continuation diverged", e.Tick())
		}
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("wave replay differs", err)
	}
	t.Logf("live/restore/replay wave hash tick %d: %s", e.Tick(), e.Hash())
}

func TestAIBetaWaveRallyAvoidsKnownOccupiedFootprint(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	goal := e.entity(3).Position
	first := e.aiWaveRally(p, aiOwnView(e, 1), goal)
	e.spawn("factory", 1, first, true, 0)
	tank := e.spawn("US.tank", 1, Vec{X: 10000, Y: 16000}, true, 0)
	e.recalculate()
	e.updateFog()
	rally := e.aiWaveRally(p, aiOwnView(e, 1), goal)
	if rally == first || e.haulerRoutingFor(tank).component(rally) == 0 {
		t.Fatal("rendezvous ignored known footprint or vehicle clearance", first, rally)
	}
}

func TestAIBetaWaveAirOnlyWeaponsCannotReleaseGroundAssault(t *testing.T) {
	e, army, goal := aiWaveFixture(t, "normal", 6)
	for _, v := range army {
		v.HP = 0
		e.spawn("US.aa", 1, v.Position, true, 0)
	}
	e.recalculate()
	e.updateFog()
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	if aiWaveGroups(orders) != 0 {
		t.Fatal("air-only counter force triggered ground assault", orders)
	}
}

func TestAIBetaWaveHardRetreatsDamagedVehicleWithoutRepairSource(t *testing.T) {
	e, army, _ := aiWaveFixture(t, "hard", 1)
	unit := army[0]
	unit.HP = unit.MaxHP * 2 / 5
	e.updateAI()
	order, ok := aiQualityGroundPendingOrder(e, unit.ID)
	if !ok || order.Kind != "move" || order.Position != e.entity(1).Position {
		t.Fatal("Hard failed to withdraw damaged vehicle without a paid repair source", order, ok)
	}
}

func aiWaveLossFixture(t *testing.T) (*Engine, *Entity, Vec) {
	t.Helper()
	e, army, goal := aiWaveFixture(t, "normal", 5)
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	e.aiDispatchOrders(e.player(1), orders)
	e.state.Tick++
	e.executePending()
	for _, v := range army[2:] {
		v.HP = 0
	}
	e.recalculate()
	e.updateFog()
	return e, army[1], goal
}

func TestAIBetaWaveRegroupPreservesSurvivorDuties(t *testing.T) {
	for _, duty := range []string{"healing", "queued", "deployed", "channel", "hold", "firing", "explicit_move", "patrol"} {
		t.Run(duty, func(t *testing.T) {
			e, v, goal := aiWaveLossFixture(t)
			switch duty {
			case "explicit_move":
				v.Orders = []Order{{Kind: "move", Position: Vec{X: 20000, Y: 20000}}}
			case "patrol":
				v.Orders = []Order{{Kind: "patrol", Position: Vec{X: 20000, Y: 20000}}}
			case "healing":
				v.Orders = []Order{{Kind: "guard", Target: 1, Position: e.entity(1).Position}}
				v.HP = v.MaxHP / 4
			case "queued":
				v.Orders = append(v.Orders, Order{Kind: "move", Position: Vec{X: 20000, Y: 20000}, Queued: true})
			case "deployed":
				v.Deployed = true
			case "channel":
				v.Channel = "board"
			case "hold":
				v.Stance = "hold"
			case "firing":
				v.EverDealt = true
				v.LastDealt = e.Tick()
			}
			orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
			if o, ok := aiUnitOrder(orders, v.ID); ok {
				t.Fatal("loss regroup replaced existing survivor duty", duty, o)
			}
		})
	}
}

func TestAIBetaWaveDefenseWinsDuringLossRegroup(t *testing.T) {
	e, v, goal := aiWaveLossFixture(t)
	v.Orders = nil
	e.player(1).AIIntent = "defend"
	orders, _ := e.aiWaveOrders(e.player(1), aiOwnView(e, 1), goal, true, nil)
	chosen := e.aiChooseOrders(e.player(1), aiOwnView(e, 1), orders, e.player(1).Credits)
	if order, ok := aiUnitOrder(chosen, v.ID); !ok || order.Kind != "attack_move" || order.Position != goal {
		t.Fatal("regroup beat immediate defense arbitration", chosen)
	}
}

func TestAIBetaWaveCommitsOnlyAfterOrdinaryAdmission(t *testing.T) {
	for _, blocked := range []string{"own_window", "global_backlog"} {
		t.Run(blocked, func(t *testing.T) {
			e, army, goal := aiWaveFixture(t, "normal", 5)
			p := e.player(1)
			if blocked == "own_window" {
				p.CommandWindow = e.Tick()
				p.CommandCount = 160
			} else {
				for i := 0; i < 128; i++ {
					e.state.Pending = append(e.state.Pending, Scheduled{Tick: e.Tick() + seconds(1), Player: 2, Sequence: uint32(i + 1), Orders: []Order{{Kind: "repair_reserve", Index: 300}}})
				}
			}
			orders, _ := e.aiWaveOrders(p, aiOwnView(e, 1), goal, true, nil)
			e.aiDispatchOrders(p, e.aiChooseOrders(p, aiOwnView(e, 1), orders, p.Credits))
			for _, v := range army {
				if cooldown(v.Cooldowns, "ai_wave_member", e.Tick()) {
					t.Fatal("failed admission committed a phantom wave", blocked, v.ID)
				}
			}
			e.state.Pending = nil
			e.state.Tick += seconds(1)
			orders, _ = e.aiWaveOrders(p, aiOwnView(e, 1), goal, true, nil)
			if aiWaveGroups(orders) != 1 {
				t.Fatal("capacity recovery trickled instead of retrying a group", orders)
			}
			e.aiDispatchOrders(p, e.aiChooseOrders(p, aiOwnView(e, 1), orders, p.Credits))
			marked := 0
			for _, v := range army {
				if cooldown(v.Cooldowns, "ai_wave_member", e.Tick()) {
					marked++
				}
			}
			if marked != 4 {
				t.Fatal("successful ordinary admission did not commit exact cohort", marked)
			}
		})
	}
}
