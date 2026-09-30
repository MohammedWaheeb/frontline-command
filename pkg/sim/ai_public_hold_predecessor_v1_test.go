package sim

import "sort"

// Literal v1 order-planner body, method rename only. This narrow regression
// oracle runs on exact derived task points with the shared controls unchanged
// for those fixtures; it is not a full old-runtime or competence comparison.
func (e *Engine) aiPublicHoldOrdersPredecessorV1Control(p *Player, view View, own []EntityView, prior []Order) aiPublicHoldPlan {
	plan := aiPublicHoldPlan{}
	if p.Controller != "ai" || view.Mission == nil || len(view.Mission.PublicTasks) == 0 {
		return plan
	}
	defense := e.aiPublicHoldDefense(p, view)
	plan.orders = e.aiPublicHoldRelease(p, view, own, prior, defense)
	if defense { return plan }
	var task MissionTaskView
	found := false
	for _, candidate := range view.Mission.PublicTasks {
		if candidate.Kind != "hold_region" || candidate.Team != p.Team {
			continue
		}
		for _, objective := range view.Mission.Objectives {
			if objective.ID == candidate.Objective && !objective.Complete && !objective.Optional && !objective.Failure {
				task, found = candidate, true
				break
			}
		}
		if found {
			break
		}
	}
	if !found {
		return plan
	}
	used := map[ID]bool{}
	for _, order := range prior {
		for _, id := range order.Entities {
			used[id] = true
		}
	}
	for _, order := range plan.orders {
		for _, id := range order.Entities { used[id] = true }
	}
	candidates := []*Entity{}
	for _, observed := range own {
		if observed.Owner != p.ID || used[observed.ID] {
			continue
		}
		v := e.entity(observed.ID) // ownership established by the current view
		if e.aiPublicHoldEligible(v, task) {
			candidates = append(candidates, v)
		}
	}
	center := Vec{X: (task.Min.X+task.Max.X)/2, Y: (task.Min.Y+task.Max.Y)/2}
	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		ac, bc := e.aiPublicHoldCommitted(a, task), e.aiPublicHoldCommitted(b, task)
		if ac != bc { return ac }
		ai, bi := aiPublicTaskContains(task, a.Position, e.radius(a)), aiPublicTaskContains(task, b.Position, e.radius(b))
		if ai != bi { return ai }
		ad, bd := dist2(a.Position, center), dist2(b.Position, center)
		if ad != bd { return ad < bd }
		return a.ID < b.ID
	})
	limit := min(3, (len(candidates)+1)/2)
	if limit == 0 { return plan }
	known := e.aiPlanningMap(p)
	positions := []Vec{}
	radii := []int32{}
	plan.reserved = map[ID]bool{}
	for _, v := range candidates {
		if len(plan.actors) == limit { break }
		point := Vec{}
		clear := false
		if e.aiPublicHoldCommitted(v, task) && aiPublicHoldClear(task, v.Orders[0].Position, e.radius(v), known, view) {
			point, clear = v.Orders[0].Position, true
			for i, taken := range positions {
				margin := int64(e.radius(v)+radii[i]+500)
				if dist2(point, taken) < margin*margin { clear = false; break }
			}
		}
		if !clear {
			for _, offset := range []Vec{{}, {X:-4000}, {X:4000}, {Y:-4000}, {Y:4000}, {X:-4000,Y:-4000}, {X:4000,Y:4000}, {X:-4000,Y:4000}, {X:4000,Y:-4000}} {
				candidate := Vec{X:center.X+offset.X, Y:center.Y+offset.Y}
				if !aiPublicHoldClear(task, candidate, e.radius(v), known, view) { continue }
				separate := true
				for i, taken := range positions {
					margin := int64(e.radius(v)+radii[i]+500)
					if dist2(candidate, taken) < margin*margin { separate = false; break }
				}
				if separate { point, clear = candidate, true; break }
			}
		}
		if !clear { continue }
		positions, radii = append(positions, point), append(radii, e.radius(v))
		plan.actors, plan.reserved[v.ID] = append(plan.actors, v.ID), true
		if len(v.Orders) == 1 && v.Orders[0].Kind == "guard" && v.Orders[0].Target == 0 && v.Orders[0].Position == point {
			continue
		}
		if distance(v.Position, point) <= 1000 && aiPublicTaskContains(task, v.Position, e.radius(v)) {
			plan.orders = append(plan.orders, Order{Kind:"guard", Entities:[]ID{v.ID}, Position:point})
		} else if len(v.Orders) != 1 || v.Orders[0].Kind != "move" || v.Orders[0].Position != point {
			plan.orders = append(plan.orders, Order{Kind:"move", Entities:[]ID{v.ID}, Position:point})
		}
	}
	return plan
}

