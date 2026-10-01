package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
)

// A cycle-local reservation, never an actor tag, scripted order or persisted
// alternative goal. Nonparticipants retain the ordinary strategic goal.
type aiPublicHoldPlan struct {
	orders   []Order
	reserved map[ID]bool
	actors   []ID
	debt     int // all living exact declared duties, even temporarily ineligible
	quota    int // recruitment/quiet-rebalance quota, not physical occupation
}

func aiPublicTaskContains(task MissionTaskView, point Vec, radius int32) bool {
	return point.X-radius >= task.Min.X && point.Y-radius >= task.Min.Y && point.X+radius <= task.Max.X && point.Y+radius <= task.Max.Y
}

func aiPublicHoldPoints(task MissionTaskView) []Vec {
	center := Vec{X:(task.Min.X+task.Max.X)/2,Y:(task.Min.Y+task.Max.Y)/2}
	points := []Vec{}
	for _, offset := range []Vec{{}, {X:-4000}, {X:4000}, {Y:-4000}, {Y:4000}, {X:-4000,Y:-4000}, {X:4000,Y:4000}, {X:-4000,Y:4000}, {X:4000,Y:-4000}} { points = append(points,Vec{X:center.X+offset.X,Y:center.Y+offset.Y}) }
	return points
}

// Exact derived destinations distinguish this duty from an unrelated interior
// Move/Guard. Debt reads only our own living current first intention. Queued or
// unhealthy holders count against recruitment but gain no control override.
func (e *Engine) aiPublicHoldDebt(v *Entity, task MissionTaskView) bool {
	if v == nil || v.HP <= 0 || len(v.Orders) == 0 || v.Orders[0].Target != 0 { return false }
	order := v.Orders[0]
	if order.Kind != "move" && order.Kind != "guard" || !aiPublicTaskContains(task,order.Position,e.radius(v)) { return false }
	for _, point := range aiPublicHoldPoints(task) { if point == order.Position { return true } }
	return false
}

func (e *Engine) aiPublicHoldCommitted(v *Entity, task MissionTaskView) bool {
	return v != nil && len(v.Orders) == 1 && !v.Orders[0].Queued && e.aiPublicHoldDebt(v,task)
}

func (e *Engine) aiPublicHoldRecent(v *Entity) bool {
	return v.EverDealt && e.Tick()-v.LastDealt < seconds(3)
}

// Only current public armed threats compatible with the allied asset suppress
// the duty. The legacy global goal can still defend an incidental passive
// opponent; that must not permanently starve an explicitly published hold.
func (e *Engine) aiPublicHoldDefense(p *Player, view View) bool {
	for _, enemy := range view.Entities {
		if !aiActiveOpponent(p, view, enemy.Owner) || !enemy.Complete || !enemy.Enabled {
			continue
		}
		weapon := ""
		if unit, ok := e.catalog.Unit(enemy.Type); ok {
			weapon = unit.Weapon
		} else if building, ok := e.buildingRule(enemy.Type); ok {
			weapon = building.Weapon
		}
		rule, armed := e.catalog.Weapon(weapon)
		if !armed {
			continue
		}
		for _, asset := range view.Entities {
			if !aiActiveAlly(p, view, asset.Owner) {
				continue
			}
			role, armor := "", ""
			if building, ok := e.buildingRule(asset.Type); ok {
				role, armor = building.Role, "structure"
			} else if unit, ok := e.catalog.Unit(asset.Type); ok {
				role, armor = unit.Role, unit.Armor
			}
			if (role == "hq" || role == "supply" || role == "hauler") && distance(asset.Position, enemy.Position) < 14000 && (rule.Kind == "tactical" || e.catalog.Multiplier(rule.Kind, armor) > 0) {
				return true
			}
		}
	}
	return false
}

// Common control guards apply to both preservation and new assignment. Recent
// fire is handled separately: it forbids new work, but an exact existing duty
// remains protected without any reissue or retarget while it is useful.
func (e *Engine) aiPublicHoldControllable(v *Entity) bool {
	if v == nil || v.Building || !v.Active(e.Tick()) || v.Container != 0 || len(v.Passengers) > 0 || v.Channel != "" || v.Deployed || v.DeployUntil > 0 || v.PackingUntil > 0 || v.Stance == "hold" || v.HP*3 < v.MaxHP*2 || e.isAircraft(v) || len(v.Orders) > 1 { return false }
	unit, valid := e.catalog.Unit(v.Type)
	if !valid || unit.Role == "rig" || unit.Role == "hauler" || unit.Role == "recon" || unit.Role == "engineer" || unit.Role == "repair" || unit.Role == "medic" { return false }
	weapon, armed := e.catalog.Weapon(unit.Weapon)
	return armed && weapon.Kind != "tactical" && (e.catalog.Multiplier(weapon.Kind,"infantry") > 0 || e.catalog.Multiplier(weapon.Kind,"heavy") > 0 || e.catalog.Multiplier(weapon.Kind,"structure") > 0)
}

func (e *Engine) aiPublicHoldEligible(v *Entity, task MissionTaskView) bool {
	if !e.aiPublicHoldControllable(v) || e.aiPublicHoldRecent(v) { return false }
	if e.aiPublicHoldCommitted(v,task) || len(v.Orders) == 0 { return true }
	return v.Orders[0].Kind == "attack_move" && !v.Orders[0].Queued
}

// Public terrain/rubble and currently observed building footprints only. No
// full-engine navigation cache, hidden occupant or allied private state enters
// this bounded destination check; normal movement validates the actual route.
func aiPublicHoldClear(task MissionTaskView, point Vec, radius int32, known content.Map, view View) bool {
	if !aiPublicTaskContains(task, point, radius) {
		return false
	}
	for y := (point.Y-radius)/1000; y <= (point.Y+radius)/1000; y++ {
		for x := (point.X-radius)/1000; x <= (point.X+radius)/1000; x++ {
			if !known.TileAt(content.Point{X: x*1000+500, Y: y*1000+500}).Passable() {
				return false
			}
		}
	}
	for _, actor := range view.Entities {
		// Current view already excludes dead actors. Quantized Health can be
		// zero for a living structure; its retained footprint still blocks.
		if actor.FootprintWidth <= 0 || actor.FootprintHeight <= 0 {
			continue
		}
		if point.X+radius > actor.Position.X-actor.FootprintWidth*500 && point.X-radius < actor.Position.X+actor.FootprintWidth*500 && point.Y+radius > actor.Position.Y-actor.FootprintHeight*500 && point.Y-radius < actor.Position.Y+actor.FootprintHeight*500 {
			return false
		}
	}
	return true
}

func (e *Engine) aiPublicHoldOrders(p *Player, view View, own []EntityView, prior []Order) aiPublicHoldPlan {
	plan := aiPublicHoldPlan{}
	if p.Controller != "ai" || view.Mission == nil || len(view.Mission.PublicTasks) == 0 { return plan }
	defense := e.aiPublicHoldDefense(p,view)
	plan.orders = e.aiPublicHoldRelease(p,view,own,prior,defense)
	used := map[ID]bool{}
	for _, order := range prior { for _, id := range order.Entities { used[id] = true } }
	for _, order := range plan.orders { for _, id := range order.Entities { used[id] = true } }
	tasks := []MissionTaskView{}
	active := map[string]bool{}
	var recruitTask MissionTaskView
	for _, task := range view.Mission.PublicTasks {
		if task.Kind != "hold_region" || task.Team != p.Team { continue }
		for _, goal := range view.Mission.Objectives {
			if goal.ID != task.Objective || goal.Optional || goal.Failure { continue }
			tasks = append(tasks,task)
			active[task.ID] = !goal.Complete
			if !goal.Complete && recruitTask.ID == "" { recruitTask = task }
			break
		}
	}
	type commitment struct { actor *Entity; task MissionTaskView }
	recent, quiet := []commitment{}, []commitment{}
	recruits := []*Entity{}
	for _, observed := range own {
		if observed.Owner != p.ID { continue }
		v := e.entity(observed.ID) // ownership established by the current view
		var duty MissionTaskView
		for _, task := range tasks { if e.aiPublicHoldDebt(v,task) { duty = task; break } }
		if duty.ID != "" {
			// Current debt still occupies a slot until an ordinary prior/recovery
			// command actually changes it. No low-HP/queue/channel shielding.
			plan.debt++
			if used[v.ID] || !e.aiPublicHoldControllable(v) || !e.aiPublicHoldCommitted(v,duty) { continue }
			if e.aiPublicHoldRecent(v) { recent = append(recent,commitment{v,duty}) } else if active[duty.ID] && !defense { quiet = append(quiet,commitment{v,duty}) }
			continue
		}
		if !used[observed.ID] && !defense && recruitTask.ID != "" && e.aiPublicHoldEligible(v,recruitTask) { recruits = append(recruits,v) }
	}
	lessCommitment := func(a,b commitment) bool {
		ai, bi := aiPublicTaskContains(a.task,a.actor.Position,e.radius(a.actor)), aiPublicTaskContains(b.task,b.actor.Position,e.radius(b.actor))
		if ai != bi { return ai }
		ac := Vec{X:(a.task.Min.X+a.task.Max.X)/2,Y:(a.task.Min.Y+a.task.Max.Y)/2}
		bc := Vec{X:(b.task.Min.X+b.task.Max.X)/2,Y:(b.task.Min.Y+b.task.Max.Y)/2}
		ad, bd := dist2(a.actor.Position,ac), dist2(b.actor.Position,bc)
		if ad != bd { return ad < bd }
		return a.actor.ID < b.actor.ID
	}
	sort.SliceStable(recent,func(i,j int) bool { return lessCommitment(recent[i],recent[j]) })
	sort.SliceStable(quiet,func(i,j int) bool { return lessCommitment(quiet[i],quiet[j]) })
	center := Vec{X:(recruitTask.Min.X+recruitTask.Max.X)/2,Y:(recruitTask.Min.Y+recruitTask.Max.Y)/2}
	sort.SliceStable(recruits,func(i,j int) bool {
		a,b := recruits[i],recruits[j]
		ai,bi := aiPublicTaskContains(recruitTask,a.Position,e.radius(a)),aiPublicTaskContains(recruitTask,b.Position,e.radius(b))
		if ai != bi { return ai }
		ad,bd := dist2(a.Position,center),dist2(b.Position,center)
		if ad != bd { return ad < bd }
		return a.ID < b.ID
	})
	plan.quota = min(3,(plan.debt+len(recruits)+1)/2)
	positions, radii := []Vec{}, []int32{}
	plan.reserved = map[ID]bool{}
	reserve := func(v *Entity,point Vec) {
		plan.actors,plan.reserved[v.ID] = append(plan.actors,v.ID),true
		positions,radii = append(positions,point),append(radii,e.radius(v))
	}
	// Recent useful exact duty consumes a slot before any new assignment. This
	// preserves actual Move/Guard even if a prior foe just disappeared or moved
	// beyond the legacy12k threat test; no new Move/Guard is emitted here.
	for _, duty := range recent { reserve(duty.actor,duty.actor.Orders[0].Position) }
	uncontrolled := plan.debt-len(recent)-len(quiet)
	keepQuiet := max(0,plan.quota-uncontrolled-len(recent))
	known := e.aiPlanningMap(p)
	separate := func(v *Entity,point Vec) bool {
		for i,taken := range positions { margin := int64(e.radius(v)+radii[i]+500); if dist2(point,taken) < margin*margin { return false } }
		return true
	}
	place := func(v *Entity,task MissionTaskView,existing bool) bool {
		point, clear := Vec{},false
		if existing && aiPublicHoldClear(task,v.Orders[0].Position,e.radius(v),known,view) && separate(v,v.Orders[0].Position) { point,clear = v.Orders[0].Position,true }
		if !clear { for _, candidate := range aiPublicHoldPoints(task) { if aiPublicHoldClear(task,candidate,e.radius(v),known,view) && separate(v,candidate) { point,clear = candidate,true; break } } }
		if !clear { if existing { reserve(v,v.Orders[0].Position) }; return existing }
		var order Order
		if len(v.Orders) == 1 && v.Orders[0].Kind == "guard" && v.Orders[0].Target == 0 && v.Orders[0].Position == point {
			reserve(v,point); return true
		}
		if distance(v.Position,point) <= 1000 && aiPublicTaskContains(task,v.Position,e.radius(v)) { order = Order{Kind:"guard",Entities:[]ID{v.ID},Position:point} } else if len(v.Orders) != 1 || v.Orders[0].Kind != "move" || v.Orders[0].Position != point { order = Order{Kind:"move",Entities:[]ID{v.ID},Position:point} }
		if order.Kind != "" && len(plan.orders) >= 3 { if existing { reserve(v,v.Orders[0].Position) }; return existing }
		reserve(v,point)
		if order.Kind != "" { plan.orders = append(plan.orders,order) }
		return true
	}
	for i,duty := range quiet {
		if i < keepQuiet { place(duty.actor,duty.task,true); continue }
		// Quiet excess may shrink, but never a queued, critical, prior-owned or
		// firing actor. Budget applies to all releases/retargets/recruits combined.
		if len(plan.orders) < 3 { plan.orders = append(plan.orders,Order{Kind:"stop",Entities:[]ID{duty.actor.ID}}) } else { reserve(duty.actor,duty.actor.Orders[0].Position) }
	}
	// Do not borrow slots from a still-present wounded/channel/queued/prior duty
	// or a Stop just proposed above. Observe its actual retirement next cycle.
	slots := max(0,plan.quota-plan.debt)
	for _, v := range recruits {
		if slots == 0 || len(plan.orders) >= 3 { break }
		if place(v,recruitTask,false) { slots-- }
	}
	return plan
}

// Easy's general recovery deliberately leaves ordinary Guard untouched. Retire
// only a matching published-task Move/Guard after its public completion, or to
// make room for an immediate observed armed defense. No broad guard cleanup is
// added, and recent combat/queues/Hold/channel/recovery still protect the actor.
func (e *Engine) aiPublicHoldRelease(p *Player, view View, own []EntityView, prior []Order, defense bool) []Order {
	used := map[ID]bool{}
	for _, order := range prior { for _, id := range order.Entities { used[id] = true } }
	orders := []Order{}
	for _, observed := range own {
		if observed.Owner != p.ID || used[observed.ID] { continue }
		v := e.entity(observed.ID)
		if v == nil { continue }
		release, active := false, false
		for _, task := range view.Mission.PublicTasks {
			if task.Kind != "hold_region" || task.Team != p.Team || !e.aiPublicHoldCommitted(v, task) || !e.aiPublicHoldEligible(v, task) { continue }
			for _, goal := range view.Mission.Objectives {
				if goal.ID != task.Objective || goal.Optional || goal.Failure { continue }
				if goal.Complete || defense { release = true } else { active = true }
			}
		}
		if release && !active {
			orders = append(orders, Order{Kind:"stop", Entities:[]ID{v.ID}})
			if len(orders) == 3 { break }
		}
	}
	return orders
}

func (plan aiPublicHoldPlan) available(own []EntityView) []EntityView {
	if len(plan.reserved) == 0 { return own }
	available := make([]EntityView, 0, len(own))
	for _, actor := range own {
		if !plan.reserved[actor.ID] { available = append(available, actor) }
	}
	return available
}

// These claims feed only the tactical planner's existing actor-reservation
// input. They never enter Submit, replay, order results or a spending ledger.
func (plan aiPublicHoldPlan) claims() []Order {
	if len(plan.actors) == 0 { return nil }
	claims := make([]Order, 0, len(plan.actors))
	for _, id := range plan.actors { claims = append(claims, Order{Entities:[]ID{id}}) }
	return claims
}
