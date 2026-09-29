package sim

import "frontlinecommand/pkg/content"

// Tagged scenario attacks use the ordinary executor: visibility, current
// allegiance, transport/disabled state and weapon layers remain authoritative.
// A trigger with no legal attacker waits transactionally, like a blocked spawn.
// Content should approach with attack_region before this action, and should not
// spawn its only source and require freshly computed sight in the same trigger.
func (e *Engine) attackScenarioTag(action content.MissionAction) bool {
	owner := PlayerID(action.Owner)
	orders := make([]Order, 0)
	for _, source := range e.state.Entities {
		if source.Tag != action.Tag || source.Owner != owner || source.HP <= 0 {
			continue
		}
		for _, target := range e.state.Entities {
			if target.Tag != action.TargetTag || target.HP <= 0 {
				continue
			}
			order := Order{Kind: "attack", Entities: []ID{source.ID}, Target: target.ID}
			if e.validateMobileOrder(owner, order, []*Entity{source}) == "ok" {
				orders = append(orders, order)
				break
			}
		}
	}
	issued := false
	for _, order := range orders {
		if e.execute(owner, order) == "ok" {
			issued = true
		}
	}
	return issued
}
