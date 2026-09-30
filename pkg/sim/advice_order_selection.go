package sim

import "slices"

// These ability previews describe supported intentions without probing channel,
// transfer-exit or Raid completion-age readiness. The real executor retains all
// abilityOrderActorCode and cast checks; advice never executes these abilities.
func (e *Engine) eligibleAdviceOrder(p *Player, o Order) (Order, string) {
	deferredAbility := o.Kind == "ability" && (o.Type == "transfer" || o.Type == "designate" || o.Type == "sabotage" || o.Type == "strategic" && p.Faction == "SY")
	if !deferredAbility {
		return e.eligibleOrder(p, o)
	}
	owned, code := e.ownedOrderSelection(p.ID, o.Entities)
	if code != "ok" {
		o.Entities = nil
		return o, code
	}
	if len(owned) == 0 {
		return o, "selection_empty"
	}
	eligible := make([]ID, 0, len(owned))
	firstCode := "unsupported_command"
	for i, v := range owned {
		code := e.ownedOrderActorCode(v)
		if code == "ok" {
			a := e.entityAffordance(p, v)
			if !slices.Contains(a.Commands, "ability") {
				code = "unsupported_command"
			} else if !slices.Contains(a.Abilities, o.Type) {
				code = "unsupported_ability"
			}
		}
		if code == "ok" {
			eligible = append(eligible, v.ID)
		} else if i == 0 {
			firstCode = code
		}
	}
	if len(eligible) == 0 {
		o.Entities = nil
		return o, firstCode
	}
	if singleSourceOrder(p, o) {
		eligible = eligible[:1]
	}
	o.Entities = eligible
	return o, "ok"
}
