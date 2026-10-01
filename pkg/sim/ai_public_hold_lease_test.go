package sim

import (
	"reflect"
	"testing"
)

// These are controlled synthetic geometry/actor fixtures, not paid production
// or mission competence. Fire witnesses below come from normal accepted Guard,
// Advance/combat and owner feedback. Health/attrition controls are labeled.
func publicHoldLeaseView(t *testing.T, e *Engine, p *Player, mission *MissionView) (View, []EntityView) {
	t.Helper()
	e.recalculate()
	e.updateFog()
	view, ok := e.PlayerView(p.ID)
	if !ok { t.Fatal("owner view missing") }
	view.Mission = mission
	own := []EntityView{}
	for _, actor := range view.Entities { if actor.Owner == p.ID { own = append(own,actor) } }
	e.aiObserve(p,view)
	return view, own
}

// Disable only the test fixture's automatic strategic scheduling while normal
// movement/combat executes. No canonical course uses this controlled helper.
func publicHoldLeaseAdvance(e *Engine, p *Player) {
	controller, difficulty := p.Controller,p.AI
	p.Controller,p.AI = "human",""
	e.Advance()
	p.Controller,p.AI = controller,difficulty
}

func publicHoldLeaseSubmit(t *testing.T, e *Engine, p *Player, orders []Order) {
	t.Helper()
	if err := e.Submit(p.ID,p.LastSequence+1,orders); err != nil { t.Fatal(err) }
	publicHoldLeaseAdvance(e,p)
	feedback, ok := e.PlayerFeedback(p.ID)
	if !ok || len(feedback.Results) != len(orders) { t.Fatal("ordinary receipt count",feedback) }
	for _, result := range feedback.Results { if !result.Accepted { t.Fatal("ordinary control rejected",result) } }
}

func publicHoldLeaseGuards(t *testing.T, e *Engine, p *Player, view View, own []EntityView) aiPublicHoldPlan {
	t.Helper()
	first := e.aiPublicHoldOrders(p,view,own,nil)
	if len(first.actors) != 3 || len(first.orders) != 3 { t.Fatal("initial detachment",first) }
	orders := []Order{}
	for _, order := range first.orders {
		// Synthetic initial geometry isolates duty accounting from travel time.
		v := e.entity(order.Entities[0])
		v.Position = order.Position
		orders = append(orders,Order{Kind:"guard",Entities:[]ID{v.ID},Position:order.Position})
	}
	e.updateFog()
	publicHoldLeaseSubmit(t,e,p,orders)
	return first
}

func publicHoldLeaseCount(e *Engine, own []EntityView, task MissionTaskView) int {
	count := 0
	for _, actor := range own { if e.aiPublicHoldDebt(e.entity(actor.ID),task) { count++ } }
	return count
}

func TestAIPublicHoldActualFiringGuardsCountBeforeRecruits(t *testing.T) {
	for _, faction := range []string{"US","IR","SY","SA"} {
		for _, difficulty := range []string{"easy","normal","hard"} {
			t.Run(faction+"/"+difficulty,func(t *testing.T) {
				e,p,view,own := publicHoldFixture(t,faction,difficulty,6)
				first := publicHoldLeaseGuards(t,e,p,view,own)
				for _, id := range first.actors {
					point := e.entity(id).Orders[0].Position
					e.spawn("IR.rig",2,Vec{X:point.X,Y:point.Y+3000},true,0)
				}
				fired := map[ID]bool{}
				for step := Tick(0); step < seconds(1) && len(fired) != 3; step++ {
					publicHoldLeaseAdvance(e,p)
					feedback,ok := e.PlayerFeedback(p.ID)
					if !ok { t.Fatal("owner feedback missing") }
					for _, event := range feedback.Events {
						if event.Kind == "weapon_fired" && event.Owner == p.ID {
						for _, id := range first.actors { if event.Entity == id { fired[id] = true } }
						}
					}
				}
				if len(fired) != 3 { t.Fatal("not all ordinary Guards actually fired",fired) }
				before := map[ID][]Order{}
				for _, id := range first.actors {
					v := e.entity(id)
					if !v.EverDealt || !e.aiPublicHoldRecent(v) { t.Fatal("actual shot lacks recent combat state",id) }
					before[id] = cloneOrders(v.Orders)
				}
				// Multiple policy cycles with continuing real combat must keep the
				// same three duties, rather than accumulating replacement Move.
				for cycle := 0; cycle < 16; cycle++ {
					view,own = publicHoldLeaseView(t,e,p,view.Mission)
					plan := e.aiPublicHoldOrders(p,view,own,nil)
					if plan.debt != 3 || plan.quota != 3 || len(plan.actors) != 3 || len(plan.orders) != 0 { t.Fatal("firing-duty saturation or reset",cycle,plan) }
					for _, id := range first.actors {
						if !plan.reserved[id] || !reflect.DeepEqual(before[id],e.entity(id).Orders) { t.Fatal("useful existing duty lost or retargeted",cycle,id) }
					}
					legacy := e.aiPublicHoldOrdersPredecessorV1Control(p,view,own,nil)
					if len(legacy.actors) != 2 || len(legacy.orders) != 2 { t.Fatal("preserved predecessor no longer exposes replacement recruitment",legacy) }
					for _, order := range legacy.orders { if before[order.Entities[0]] != nil { t.Fatal("predecessor control selected an existing firing holder") } }
					for step := 0; step < 5; step++ { publicHoldLeaseAdvance(e,p) }
				}
				view,own = publicHoldLeaseView(t,e,p,view.Mission)
				legacyPlan := e.aiPublicHoldOrdersPredecessorV1Control(p,view,own,nil)
				data,err := e.Save()
				if err != nil { t.Fatal(err) }
				legacy,err := Restore(e.catalog,data)
				if err != nil { t.Fatal(err) }
				lp := legacy.player(p.ID)
				publicHoldLeaseSubmit(t,legacy,lp,legacyPlan.orders)
				_,legacyOwn := publicHoldLeaseView(t,legacy,lp,view.Mission)
				if publicHoldLeaseCount(legacy,legacyOwn,view.Mission.PublicTasks[0]) != 5 { t.Fatal("accepted predecessor replacement orders did not create five persistent duties") }
				if publicHoldLeaseCount(e,own,view.Mission.PublicTasks[0]) != 3 { t.Fatal("new planner changed the observed three-duty state") }
			})
		}
	}
}

func TestAIPublicHoldActualUsefulGuardSurvivesMissingNearThreat(t *testing.T) {
	e,p,view,own := publicHoldFixture(t,"US","normal",6)
	first := publicHoldLeaseGuards(t,e,p,view,own)
	guard := e.entity(first.actors[0])
	foe := e.spawn("IR.rig",2,Vec{X:guard.Position.X,Y:guard.Position.Y+3000},true,0)
	fired := false
	for step := Tick(0); step < seconds(1) && !fired; step++ {
		publicHoldLeaseAdvance(e,p)
		feedback,_ := e.PlayerFeedback(p.ID)
		for _, event := range feedback.Events { if event.Kind == "weapon_fired" && event.Entity == guard.ID && event.Owner == p.ID { fired = true } }
	}
	if !fired || !guard.EverDealt || !e.aiPublicHoldRecent(guard) { t.Fatal("ordinary useful Guard did not fire") }
	// Explicit synthetic disappearance after the actual shot. This does not
	// fake LastDealt, fire feedback or an executed ordinary casualty.
	foe.HP = 0
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	if e.aiThreatNear(p,guard.Position,12000) { t.Fatal("controlled removed foe retained a near public observation") }
	plan := e.aiPublicHoldOrders(p,view,own,nil)
	if !plan.reserved[guard.ID] { t.Fatal("useful existing duty lost its lease after the foe disappeared",plan) }
	for _, order := range plan.orders { for _, id := range order.Entities { if id == guard.ID { t.Fatal("recent Guard was reissued or retargeted",order) } } }
	for _, order := range e.aiRecoveryOrders(p,own,Vec{X:55000,Y:45000},plan.reserved) { for _, id := range order.Entities { if id == guard.ID { t.Fatal("quiet recovery overrode actual recent useful Guard",order) } } }
	legacy := e.aiPublicHoldOrdersPredecessorV1Control(p,view,own,nil)
	retired := false
	for _, order := range e.aiRecoveryOrders(p,own,Vec{X:55000,Y:45000},legacy.reserved) { for _, id := range order.Entities { if id == guard.ID && order.Kind == "attack_move" { retired = true } } }
	if !retired { t.Fatal("preserved predecessor no longer exposes the recent-fire recovery seam") }
}

func TestAIPublicHoldActualArtilleryShotThenPublicFoeBeyond12k(t *testing.T) {
	for _, faction := range []string{"US","SA"} {
		t.Run(faction,func(t *testing.T) {
			e,p,view,own := publicHoldFixture(t,faction,"normal",5)
			point := aiPublicHoldPoints(view.Mission.PublicTasks[0])[0]
			guard := e.spawn(faction+".artillery",1,point,true,0)
			// Legitimate owned recon supplies continuing sight of the departing
			// enemy. Guard first acquires within its ordinary6k combat leash.
			e.spawn(faction+".recon",1,Vec{X:point.X+13000,Y:point.Y+6000},true,0)
			foe := e.spawn("IR.car",2,Vec{X:point.X+5800,Y:point.Y},true,0)
			publicHoldLeaseSubmit(t,e,p,[]Order{{Kind:"guard",Entities:[]ID{guard.ID},Position:point}})
			fired := false
			for step := Tick(0); step < seconds(1) && !fired; step++ {
				publicHoldLeaseAdvance(e,p)
				feedback,_ := e.PlayerFeedback(p.ID)
				for _, event := range feedback.Events { if event.Kind == "weapon_fired" && event.Owner == p.ID && event.Entity == guard.ID { fired = true } }
			}
			if !fired || !guard.EverDealt { t.Fatal("ordinary artillery Guard failed to fire inside its acquisition leash") }
			lastShot := guard.LastDealt
			if err := e.Submit(2,e.player(2).LastSequence+1,[]Order{{Kind:"move",Entities:[]ID{foe.ID},Position:Vec{X:point.X+13000,Y:point.Y}}}); err != nil { t.Fatal(err) }
			publicHoldLeaseAdvance(e,p)
			feedback,_ := e.PlayerFeedback(2)
			if len(feedback.Results) != 1 || !feedback.Results[0].Accepted { t.Fatal("ordinary departing enemy Move rejected",feedback) }
			for e.Tick()-lastShot < seconds(3) && distance(guard.Position,foe.Position) <= 12000 { publicHoldLeaseAdvance(e,p) }
			view,own = publicHoldLeaseView(t,e,p,view.Mission)
			seen := false
			for _, actor := range view.Entities { if actor.ID == foe.ID { seen = true } }
			if !seen || distance(guard.Position,foe.Position) <= 12000 || !e.aiPublicHoldRecent(guard) || e.aiThreatNear(p,guard.Position,12000) { t.Fatal("ordinary shot/departure did not establish a recent-fire public beyond12k seam",guard.Position,foe.Position,e.Tick(),lastShot) }
			plan := e.aiPublicHoldOrders(p,view,own,nil)
			if !plan.reserved[guard.ID] || len(plan.actors) > 3 || len(plan.orders) > 3 { t.Fatal("recent ranged duty was replaced or detachment exceeded cap",plan) }
			for _, order := range plan.orders { for _, id := range order.Entities { if id == guard.ID { t.Fatal("existing useful ranged Guard was reissued",order) } } }
			for _, order := range e.aiRecoveryOrders(p,own,Vec{X:55000,Y:45000},plan.reserved) { for _, id := range order.Entities { if id == guard.ID { t.Fatal("legacy12k retirement overrode the recent actual shot",order) } } }
			legacy := e.aiPublicHoldOrdersPredecessorV1Control(p,view,own,nil)
			retired := false
			for _, order := range e.aiRecoveryOrders(p,own,Vec{X:55000,Y:45000},legacy.reserved) { for _, id := range order.Entities { if id == guard.ID && order.Kind == "attack_move" { retired = true } } }
			if !retired { t.Fatal("predecessor failed to expose beyond12k recovery regression") }
		})
	}
}

func TestAIPublicHoldWoundedExistingDebtBlocksRecruitment(t *testing.T) {
	for _, faction := range []string{"US","IR","SY","SA"} {
		for _, difficulty := range []string{"easy","normal","hard"} {
			t.Run(faction+"/"+difficulty,func(t *testing.T) {
				e,p,view,own := publicHoldFixture(t,faction,difficulty,6)
				first := publicHoldLeaseGuards(t,e,p,view,own)
				wounded := e.entity(first.actors[0])
				// Explicit health control: alive50%, below recruitment's2/3 but
				// above legacy critical healing35%. A public nearby passive foe
				// allows its existing ordinary Guard to remain without recovery.
				wounded.HP = wounded.MaxHP/2
				e.spawn("IR.rig",2,Vec{X:wounded.Position.X,Y:wounded.Position.Y+3000},true,0)
				view,own = publicHoldLeaseView(t,e,p,view.Mission)
				if !e.aiThreatNear(p,wounded.Position,12000) { t.Fatal("near public fixture observation missing") }
				plan := e.aiPublicHoldOrders(p,view,own,nil)
				if plan.debt != 3 || plan.quota != 3 || len(plan.actors) != 2 || len(plan.orders) != 0 || plan.reserved[wounded.ID] { t.Fatal("wounded existing debt recruited replacements or gained shielding",plan) }
				for _, id := range first.actors { if id != wounded.ID && !plan.reserved[id] { t.Fatal("healthy existing duty lost",id) } }
				legacy := e.aiPublicHoldOrdersPredecessorV1Control(p,view,own,nil)
				if len(legacy.actors) != 3 || len(legacy.orders) != 1 { t.Fatal("wounded-debt predecessor control no longer recruits a fourth physical duty",legacy) }
			})
		}
	}
}

func TestAIPublicHoldCriticalRecoveryRetiresDebtBeforeRecruitment(t *testing.T) {
	for _, difficulty := range []string{"normal","hard"} {
		t.Run(difficulty,func(t *testing.T) {
			e,p,view,own := publicHoldFixture(t,"US",difficulty,6)
			first := publicHoldLeaseGuards(t,e,p,view,own)
			wounded := e.entity(first.actors[0])
			wounded.HP = wounded.MaxHP/4 // explicit synthetic critical health
			medic := e.spawn("US.medic",1,Vec{X:wounded.Position.X+2000,Y:wounded.Position.Y},true,0)
			view,own = publicHoldLeaseView(t,e,p,view.Mission)
			plan := e.aiPublicHoldOrders(p,view,own,nil)
			if plan.debt != 3 || plan.reserved[wounded.ID] || len(plan.orders) != 0 { t.Fatal("critical duty was shielded/stopped or its debt borrowed before recovery",plan) }
			var recovery Order
			for _, order := range e.aiRecoveryOrders(p,own,Vec{X:55000,Y:45000},plan.reserved) {
				if len(order.Entities) == 1 && order.Entities[0] == wounded.ID && order.Kind == "guard" && order.Target == medic.ID { recovery = order }
			}
			if recovery.Kind == "" { t.Fatal("actual normal/hard critical recovery did not win") }
			publicHoldLeaseSubmit(t,e,p,[]Order{recovery})
			view,own = publicHoldLeaseView(t,e,p,view.Mission)
			next := e.aiPublicHoldOrders(p,view,own,nil)
			if next.debt != 2 || len(next.orders) != 1 || len(next.actors) != 3 || next.reserved[wounded.ID] { t.Fatal("replacement did not wait for the actual ordinary recovery handoff",next) }
			if next.orders[0].Kind != "move" { t.Fatal("replacement bypassed ordinary Move",next.orders) }
		})
	}
}

func TestAIPublicHoldQueuedChannelAndPriorDebtIsNotBorrowed(t *testing.T) {
	for _, kind := range []string{"queued","channel","prior"} {
		t.Run(kind,func(t *testing.T) {
			e,p,view,own := publicHoldFixture(t,"US","normal",6)
			first := publicHoldLeaseGuards(t,e,p,view,own)
			v := e.entity(first.actors[0])
			var prior []Order
			switch kind {
			case "queued": v.Orders = append(v.Orders,Order{Kind:"move",Queued:true,Position:Vec{X:16000,Y:14000}})
			case "channel": v.Channel = "repair"
			case "prior": prior = []Order{{Kind:"move",Entities:[]ID{v.ID},Position:Vec{X:16000,Y:14000}}}
			}
			before := cloneOrders(v.Orders)
			view,own = publicHoldLeaseView(t,e,p,view.Mission)
			plan := e.aiPublicHoldOrders(p,view,own,prior)
			if plan.debt != 3 || plan.reserved[v.ID] || len(plan.orders) != 0 || len(plan.actors) != 2 || !reflect.DeepEqual(before,v.Orders) { t.Fatal("temporarily ineligible duty debt was borrowed or commandeered",kind,plan) }
		})
	}
}

func TestAIPublicHoldQuietAttritionRebalancesByOrdinaryStop(t *testing.T) {
	e,p,view,own := publicHoldFixture(t,"SA","normal",6)
	first := publicHoldLeaseGuards(t,e,p,view,own)
	for _, actor := range own {
		if actor.Type != "SA.rifle" { continue }
		kept := false
		for _, id := range first.actors { if actor.ID == id { kept = true } }
		if !kept { e.entity(actor.ID).HP = 0 } // explicit synthetic attrition
	}
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	plan := e.aiPublicHoldOrders(p,view,own,nil)
	if plan.debt != 3 || plan.quota != 2 || len(plan.actors) != 2 || len(plan.orders) != 1 || plan.orders[0].Kind != "stop" { t.Fatal("quiet attrition did not use a bounded ordinary shrink",plan) }
	if publicHoldLeaseCount(e,own,view.Mission.PublicTasks[0]) != 3 { t.Fatal("proposed Stop mutated the current duty count") }
	publicHoldLeaseSubmit(t,e,p,plan.orders)
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	next := e.aiPublicHoldOrders(p,view,own,nil)
	if next.debt != 2 || next.quota != 2 || len(next.actors) != 2 || len(next.orders) != 0 { t.Fatal("quiet rebalance churned after ordinary Stop",next) }
}

func TestAIPublicHoldRecentAttritionDebtDoesNotRetarget(t *testing.T) {
	e,p,view,own := publicHoldFixture(t,"SA","normal",6)
	first := publicHoldLeaseGuards(t,e,p,view,own)
	// Explicit recent-fire state control for the attrition quota transition;
	// actual ordinary-fire witnesses are separately exercised above.
	for _, id := range first.actors { v := e.entity(id); v.EverDealt,v.LastDealt = true,e.Tick() }
	for _, actor := range own {
		if actor.Type != "SA.rifle" { continue }
		kept := false
		for _, id := range first.actors { if actor.ID == id { kept = true } }
		if !kept { e.entity(actor.ID).HP = 0 }
	}
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	plan := e.aiPublicHoldOrders(p,view,own,nil)
	if plan.debt != 3 || plan.quota != 2 || len(plan.actors) != 3 || len(plan.orders) != 0 { t.Fatal("recent attrition incorrectly asserted a strict half-force occupation or retargeted useful duty",plan) }
	for _, id := range first.actors { if !plan.reserved[id] { t.Fatal("recent useful commitment lost",id) } }
}

func TestAIPublicHoldInteriorOffGridGuardIsNotTaskIdentity(t *testing.T) {
	e,p,view,own := publicHoldFixture(t,"US","normal",6)
	var ordinary *Entity
	for _, actor := range own { if actor.Type == "US.rifle" { ordinary = e.entity(actor.ID); break } }
	point := Vec{X:42500,Y:30000}
	e.assign(ordinary,Order{Kind:"guard",Entities:[]ID{ordinary.ID},Position:point})
	before := cloneOrders(ordinary.Orders)
	if !aiPublicTaskContains(view.Mission.PublicTasks[0],point,e.radius(ordinary)) || e.aiPublicHoldDebt(ordinary,view.Mission.PublicTasks[0]) { t.Fatal("off-grid identity control invalid") }
	plan := e.aiPublicHoldOrders(p,view,own,nil)
	if plan.reserved[ordinary.ID] || !reflect.DeepEqual(before,ordinary.Orders) { t.Fatal("public task commandeered unrelated interior Guard",plan) }
	for _, order := range plan.orders { for _, id := range order.Entities { if id == ordinary.ID { t.Fatal("public task emitted an order for unrelated Guard",order) } } }
	view.Mission.Objectives[0].Complete = true
	done := e.aiPublicHoldOrders(p,view,own,nil)
	for _, order := range done.orders { for _, id := range order.Entities { if id == ordinary.ID { t.Fatal("task completion stopped unrelated interior Guard",order) } } }
}

func TestAIPublicHoldCompletionAndQuietShrinkShareOneOrderBudget(t *testing.T) {
	e,p,view,own := publicHoldFixture(t,"US","normal",9)
	activeTask := view.Mission.PublicTasks[0]
	doneTask := activeTask
	doneTask.ID,doneTask.Objective,doneTask.Marker,doneTask.Region = "shown-complete","done","shown-done","declared-done-area"
	doneTask.Min,doneTask.Max = Vec{X:7000,Y:32000},Vec{X:25000,Y:46000}
	view.Mission.PublicTasks = append(view.Mission.PublicTasks,doneTask)
	view.Mission.Objectives = append(view.Mission.Objectives,ObjectiveView{ID:"done",Required:600,Complete:true})
	activeIDs := []ID{}
	index := 0
	for _, actor := range own {
		if actor.Type != "US.rifle" || index >= 6 { continue }
		task := activeTask
		if index < 3 { task = doneTask } else { activeIDs = append(activeIDs,actor.ID) }
		point := aiPublicHoldPoints(task)[index%3]
		v := e.entity(actor.ID)
		v.Position = point
		e.assign(v,Order{Kind:"guard",Entities:[]ID{v.ID},Position:point})
		index++
	}
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	plan := e.aiPublicHoldOrders(p,view,own,nil)
	if plan.debt != 6 || len(plan.orders) != 3 || len(plan.actors) != 3 { t.Fatal("completion and quiet debt did not share the global helper budget",plan) }
	for _, order := range plan.orders { if order.Kind != "stop" { t.Fatal("full release budget emitted additional duty commands",order) } }
	for _, id := range activeIDs { if !plan.reserved[id] || e.entity(id).Orders[0].Kind != "guard" { t.Fatal("deferred quiet rebalance reset or released beyond the order budget",id) } }
	publicHoldLeaseSubmit(t,e,p,plan.orders)
	view,own = publicHoldLeaseView(t,e,p,view.Mission)
	next := e.aiPublicHoldOrders(p,view,own,nil)
	if next.debt != 3 || next.quota != 3 || len(next.actors) != 3 || len(next.orders) != 0 { t.Fatal("completed debt was not recomputed after the ordinary handoff",next) }
}
