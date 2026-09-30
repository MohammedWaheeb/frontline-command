package sim

import (
	"reflect"
	"os"
	"frontlinecommand/pkg/content"
	"testing"
)

// Controlled synthetic policy fixtures, not paid army/full-match evidence.
// The separately named canonical isolation course supplies that runtime gate.
func publicHoldFixture(t *testing.T, faction, difficulty string, count int) (*Engine, *Player, View, []EntityView) {
	t.Helper()
	e := fixture(t)
	p := e.player(1)
	p.Faction, p.AI, p.Controller = faction, difficulty, "ai"
	for i := 0; i < count; i++ { e.spawn(faction+".rifle", 1, Vec{X:16000+int32(i)*1800,Y:14000}, true, 0) }
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	view.Mission = &MissionView{ID:"public-policy-fixture", Version:"1", Objectives:[]ObjectiveView{{ID:"hold",Required:600}}, PublicTasks:[]MissionTaskView{{ID:"shown-hold", Objective:"hold", Kind:"hold_region", Marker:"shown", Region:"declared-public-area", Team:p.Team, Min:Vec{X:32000,Y:22000}, Max:Vec{X:50000,Y:36000}}}}
	own := []EntityView{}
	for _, actor := range view.Entities { if actor.Owner == p.ID { own = append(own, actor) } }
	return e, p, view, own
}

func TestAIPublicHoldBoundedAcrossFactionsAndDifficulties(t *testing.T) {
	for _, faction := range []string{"US","IR","SY","SA"} {
		for _, difficulty := range []string{"easy","normal","hard"} {
			t.Run(faction+"/"+difficulty, func(t *testing.T) {
				e, p, view, own := publicHoldFixture(t, faction, difficulty, 6)
				intent, goal := p.AIIntent, p.AIGoal
				plan := e.aiPublicHoldOrders(p, view, own, nil)
				if len(plan.actors) != 3 || len(plan.orders) != 3 { t.Fatal("detachment cap/ordinary task orders", plan) }
				positions := map[Vec]bool{}
				for _, order := range plan.orders {
					if order.Kind != "move" || len(order.Entities) != 1 || e.entity(order.Entities[0]).Owner != p.ID || !aiPublicTaskContains(view.Mission.PublicTasks[0], order.Position, e.radius(e.entity(order.Entities[0]))) || positions[order.Position] { t.Fatal("invalid or overlapping public duty", order) }
					positions[order.Position] = true
				}
				if p.AIIntent != intent || p.AIGoal != goal { t.Fatal("task changed global/nonparticipant goal") }
			})
		}
	}
}

func TestAIPublicHoldSteadyMoveGuardAndRecovery(t *testing.T) {
	e, p, view, own := publicHoldFixture(t, "US", "normal", 6)
	plan := e.aiPublicHoldOrders(p, view, own, nil)
	for _, order := range plan.orders { e.assign(e.entity(order.Entities[0]), order) }
	moving := e.aiPublicHoldOrders(p, view, own, nil)
	if len(moving.orders) != 0 || !reflect.DeepEqual(moving.actors, plan.actors) { t.Fatal("in-flight Move reset or detachment churn", moving) }
	for _, order := range plan.orders { e.entity(order.Entities[0]).Position = order.Position }
	guarding := e.aiPublicHoldOrders(p, view, own, nil)
	if len(guarding.orders) != 3 { t.Fatal("arrived detachment lacks Guard", guarding) }
	for _, order := range guarding.orders { if order.Kind != "guard" { t.Fatal(order) }; e.assign(e.entity(order.Entities[0]), order) }
	steady := e.aiPublicHoldOrders(p, view, own, nil)
	if len(steady.orders) != 0 || !reflect.DeepEqual(steady.actors, guarding.actors) { t.Fatal("steady Guard was reset", steady) }
	for _, order := range e.aiRecoveryOrders(p, own, Vec{X:55000,Y:45000}, steady.reserved) { for _, id := range order.Entities { if steady.reserved[id] { t.Fatal("quiet recovery retired public Guard", order) } } }
	wounded := e.entity(steady.actors[0])
	wounded.HP = wounded.MaxHP/4
	e.spawn("US.medic", 1, Vec{X:wounded.Position.X+2000,Y:wounded.Position.Y}, true, 0)
	e.recalculate(); e.updateFog()
	own = aiOwnView(e, 1)
	recovery := e.aiRecoveryOrders(p, own, Vec{X:55000,Y:45000}, steady.reserved)
	found := false
	for _, order := range recovery { if len(order.Entities) == 1 && order.Entities[0] == wounded.ID && order.Kind == "guard" && order.Target != 0 { found = true } }
	if !found { t.Fatal("actual critical recovery did not win the stale lease", recovery) }
}

func TestAIPublicHoldRecentCombatAndPriorWorkWin(t *testing.T) {
	for _, kind := range []string{"idle", "move", "guard", "queued", "hold", "channel", "prior"} {
		t.Run(kind, func(t *testing.T) {
			e, p, view, own := publicHoldFixture(t, "US", "normal", 1)
			var v *Entity
			for _, actor := range own { if actor.Type == "US.rifle" { v = e.entity(actor.ID) } }
			if v == nil { t.Fatal("fixture rifle missing") }
			// Off-grid ordinary work is not an existing public-task duty.
			point := Vec{X:42500,Y:30000}
			var prior []Order
			switch kind {
			case "move", "guard": e.assign(v, Order{Kind:kind,Entities:[]ID{v.ID},Position:point})
			case "queued": v.Orders = []Order{{Kind:"attack_move",Position:point},{Kind:"move",Position:point}}
			case "hold": e.assign(v, Order{Kind:"hold",Entities:[]ID{v.ID}})
			case "channel": v.Channel = "repair"
			case "prior": prior = []Order{{Kind:"guard",Entities:[]ID{v.ID},Position:Vec{X:14000,Y:14000}}}
			}
			if kind == "idle" || kind == "move" || kind == "guard" { v.EverDealt, v.LastDealt = true, e.Tick() }
			if kind != "prior" && e.aiPublicHoldEligible(v,view.Mission.PublicTasks[0]) { t.Fatal("protected actor became a new-assignment candidate") }
			plan := e.aiPublicHoldOrders(p, view, own, prior)
			if plan.reserved[v.ID] || len(plan.orders) != 0 { t.Fatal("duty overwrote protected own work", plan) }
		})
	}
}

func TestAIPublicHoldTinyForceCompletionAndPublicTeam(t *testing.T) {
	for _, row := range []struct{count,want int}{{1,1},{2,1},{3,2}} {
		count, want := row.count, row.want
		t.Run(string(rune('0'+count)), func(t *testing.T) {
			e, p, view, own := publicHoldFixture(t, "SA", "easy", count)
			plan := e.aiPublicHoldOrders(p, view, own, nil)
			if len(plan.actors) != want { t.Fatal("small-force cap", len(plan.actors), want) }
			for _, order := range plan.orders { v := e.entity(order.Entities[0]); v.Position = order.Position; e.assign(v, Order{Kind:"guard",Entities:order.Entities,Position:order.Position}) }
			view.Mission.Objectives[0].Complete = true
			done := e.aiPublicHoldOrders(p, view, own, nil)
			if len(done.reserved) != 0 || len(done.orders) != want { t.Fatal("Easy completed duty remains permanently leased", done) }
			for _, order := range done.orders { if order.Kind != "stop" { t.Fatal("nonordinary completion handoff", order) } }
			view.Mission.Objectives[0].Complete = false
			view.Mission.PublicTasks[0].Team = 2
			foreign := e.aiPublicHoldOrders(p, view, own, nil)
			if len(foreign.orders) != 0 || len(foreign.actors) != 0 { t.Fatal("foreign public team claimed", foreign) }
		})
	}
}

func TestAIPublicHoldVisibleRetainedFootprintAndHiddenTwin(t *testing.T) {
	e, p, view, own := publicHoldFixture(t, "US", "normal", 6)
	task := view.Mission.PublicTasks[0]
	structure := EntityView{ID:9003,Owner:2,Type:"supply",Position:Vec{X:41000,Y:29000},FootprintWidth:4,FootprintHeight:3,Health:0,Complete:true,Enabled:true}
	shown := view
	shown.Entities = append(append([]EntityView(nil), view.Entities...), structure)
	known := e.aiPlanningMap(p)
	if aiPublicHoldClear(task, Vec{X:42500,Y:29000}, 250, known, shown) { t.Fatal("living quantized-zero four-tile footprint treated as millimeters") }
	if !aiPublicHoldClear(task, Vec{X:44000,Y:29000}, 250, known, shown) { t.Fatal("outside visible retained footprint incorrectly blocked") }
	before := e.aiPublicHoldOrders(p, view, own, nil)
	e.spawn("supply", 2, structure.Position, true, 0)
	after := e.aiPublicHoldOrders(p, view, own, nil)
	if !reflect.DeepEqual(before, after) { t.Fatal("unobserved private structure changed public hold plan", before, after) }
}

func TestAIPublicHoldArmedDefenseBeforePassivePressure(t *testing.T) {
	e, p, view, own := publicHoldFixture(t, "US", "normal", 6)
	var hq Vec
	for _, actor := range own { if actor.Type == "hq" { hq = actor.Position } }
	view.Entities = append(view.Entities, EntityView{ID:9001,Owner:2,Type:"radar",Position:Vec{X:hq.X+8000,Y:hq.Y},Health:1000,Complete:true,Enabled:true})
	if len(e.aiPublicHoldOrders(p, view, own, nil).actors) == 0 { t.Fatal("passive observed structure starved published task") }
	// Current-view presence proves life even when tiny HP quantizes to zero.
	for i := range view.Entities { if view.Entities[i].Owner == 1 && view.Entities[i].Type == "hq" { view.Entities[i].Health = 0 } }
	view.Entities = append(view.Entities, EntityView{ID:9002,Owner:2,Type:"IR.rifle",Position:Vec{X:hq.X+7000,Y:hq.Y},Health:0,Complete:true,Enabled:true})
	if len(e.aiPublicHoldOrders(p, view, own, nil).actors) != 0 { t.Fatal("current armed compatible defense lost priority") }
}

func TestAIPublicHoldNoTaskFullCycleMatchesExactCore16Oracle(t *testing.T) {
	for _, faction := range []string{"US","IR","SY","SA"} {
		for _, difficulty := range []string{"easy","normal","hard"} {
			t.Run(faction+"/"+difficulty, func(t *testing.T) {
				e := fixture(t)
				p := e.player(1)
				p.Faction, p.AI, p.Controller = faction, difficulty, "ai"
				// Explicit synthetic clock setup: a due strategic cycle, not a
				// zero-tick identity or a canonical course state intervention.
				e.state.Tick = seconds(4)
				data, err := e.Save()
				if err != nil { t.Fatal(err) }
				legacy, err := Restore(e.catalog, data)
				if err != nil { t.Fatal(err) }
				e.updateAI()
				legacy.updateAILegacyCore16PublicHoldControl()
				if p.AILast != e.Tick() || legacy.player(1).AILast != legacy.Tick() || len(e.state.Pending) == 0 || len(legacy.state.Pending) == 0 { t.Fatal("comparison did not execute a due ordinary AI planning cycle") }
				if e.Hash() != legacy.Hash() { t.Fatal("no-task full-cycle scheduled plans/state differ from the exact Core16 oracle") }
			})
		}
	}
}

func TestAIPublicHoldActiveForceShrinkRetainsSurvivor(t *testing.T) {
	e, p, view, own := publicHoldFixture(t, "SA", "normal", 6)
	first := e.aiPublicHoldOrders(p,view,own,nil)
	if len(first.actors) != 3 { t.Fatal("initial bounded detachment missing") }
	keep := first.actors[0]
	for _, order := range first.orders { v := e.entity(order.Entities[0]); v.Position = order.Position; e.assign(v,Order{Kind:"guard",Entities:order.Entities,Position:order.Position}) }
	// Synthetic attrition control, never a canonical acceptance intervention.
	for _, actor := range own { if actor.Type == "SA.rifle" && actor.ID != keep { e.entity(actor.ID).HP = 0 } }
	e.recalculate(); e.updateFog()
	current, _ := e.PlayerView(1)
	current.Mission = view.Mission
	shrunk := e.aiPublicHoldOrders(p,current,aiOwnView(e,1),nil)
	if len(shrunk.actors) != 1 || shrunk.actors[0] != keep || len(shrunk.orders) != 0 || !shrunk.reserved[keep] { t.Fatal("force shrink reset/replaced a surviving steady duty",shrunk) }
}

func TestAIPublicHoldEasyCompletedTaskDispatchesOrdinaryStop(t *testing.T) {
	mapBytes, err := os.ReadFile("../../content/maps/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	m, err := content.DecodeMap(mapBytes)
	if err != nil { t.Fatal(err) }
	missionBytes, err := os.ReadFile("../../content/missions/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	definition, err := content.DecodeMission(missionBytes,content.MustBase(),m)
	if err != nil { t.Fatal(err) }
	definition.Players[1].Controller, definition.Players[1].AI = "ai", "easy"
	e, err := NewMission(content.MustBase(),m,definition,"normal",19027)
	if err != nil { t.Fatal(err) }
	// Explicit due-cycle/progress controls isolate the completed-task handoff;
	// this is not autonomous paid mission-completion evidence.
	e.state.Countdown, e.state.Tick = 0, seconds(4)
	v := e.spawn("SA.rifle",2,Vec{X:64999,Y:67499},true,0)
	e.assign(v,Order{Kind:"guard",Entities:[]ID{v.ID},Position:v.Position})
	for i := range e.state.Mission.Objectives { if e.state.Mission.Objectives[i].ID == "reconnection" { e.state.Mission.Objectives[i].Complete = true } }
	e.recalculate(); e.updateFog()
	e.updateAI()
	found := false
	for _, batch := range e.state.Pending { if batch.Player == 2 { for _, order := range batch.Orders { if order.Kind == "stop" && len(order.Entities) == 1 && order.Entities[0] == v.ID { found = true } } } }
	if !found || e.player(2).AILast != e.Tick() { t.Fatal("Easy completed task was not handed off through ordinary Submit",e.state.Pending) }
	e.Advance()
	if len(v.Orders) != 0 { t.Fatal("ordinary completion Stop did not execute",v.Orders) }
}
