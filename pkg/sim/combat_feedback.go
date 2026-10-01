package sim

import "fmt"

// Weapon identity belongs to the actual emitted round, not the actor's current
// type. No target, projectile association or impact result is guessed here.
func (e *Engine) emitCombat(kind string, owner PlayerID, entity ID, point Vec, weapon string) {
	e.emit(kind, owner, entity, point, "visible", 0)
	e.state.Events[len(e.state.Events)-1].Combat = &CombatFeedback{Weapon: weapon}
}

// Called only for a live target's positive resolved simultaneous damage batch.
// Area damage deliberately has no event link and cannot disclose victim count.
func (e *Engine) resolveImpactFeedback(d damage, target *Entity) {
	// Event storage is append-only during combat; a one-based transient index
	// avoids an allocation or repeated scan for every projectile on this tick.
	if d.FeedbackIndex == 0 || int(d.FeedbackIndex) > len(e.state.Events) || d.Amount <= 0 {
		return
	}
	event := &e.state.Events[d.FeedbackIndex-1]
	if event.Kind != "impact" || event.Entity != target.ID || event.Combat == nil {
		return
	}
	event.Combat.Outcome = "hit"
	event.Combat.TargetArmor = e.armor(target)
	event.Combat.CoverMitigated = d.CoverMitigated
}

func (e *Engine) knownCombatWeapon(weapon string) bool {
	_, ok := e.catalog.Weapon(weapon)
	return ok || weapon == "SATURATION" || weapon == "SKYBREAKER"
}

func knownCombatArmor(armor string) bool {
	switch armor {
	case "infantry", "light", "heavy", "structure", "air":
		return true
	}
	return false
}

// This explicit allowlist creates detached public metadata. Unknown means
// unknown: omitted/false is never a miss, blocked shot, decoy or no-cover verdict.
func (e *Engine) sanitizedCombatFeedback(event Event) *CombatFeedback {
	if event.Combat == nil || !e.knownCombatWeapon(event.Combat.Weapon) || (event.Kind != "weapon_fired" && event.Kind != "impact") {
		return nil
	}
	out := &CombatFeedback{Weapon: event.Combat.Weapon}
	if event.Kind == "impact" && event.Entity != 0 && event.Combat.Outcome == "hit" && knownCombatArmor(event.Combat.TargetArmor) {
		out.Outcome, out.TargetArmor = "hit", event.Combat.TargetArmor
		weapon, _ := e.catalog.Weapon(out.Weapon)
		out.CoverMitigated = event.Combat.CoverMitigated && out.TargetArmor == "infantry" && (weapon.Kind == "small" || weapon.Kind == "auto")
	}
	return out
}

func (e *Engine) validateCombatFeedback() error {
	for _, event := range e.state.Events {
		c := event.Combat
		if c == nil {
			continue
		}
		if !e.knownCombatWeapon(c.Weapon) || (event.Kind != "weapon_fired" && event.Kind != "impact") {
			return fmt.Errorf("invalid combat feedback weapon or event")
		}
		if c.Outcome == "" {
			if c.TargetArmor != "" || c.CoverMitigated {
				return fmt.Errorf("unresolved combat feedback contains target metadata")
			}
			continue
		}
		if event.Kind != "impact" || event.Entity == 0 || c.Outcome != "hit" || !knownCombatArmor(c.TargetArmor) {
			return fmt.Errorf("invalid combat feedback outcome")
		}
		w, _ := e.catalog.Weapon(c.Weapon)
		if c.CoverMitigated && (c.TargetArmor != "infantry" || (w.Kind != "small" && w.Kind != "auto")) {
			return fmt.Errorf("invalid combat feedback cover cue")
		}
	}
	return nil
}
