package sim

import (
	"frontlinecommand/pkg/content"
	"strings"
)

// Practice tools are recorded as ordinary deterministic orders and rejected in
// every competitive/scenario ruleset. They never call profile/reward services.
func (e *Engine) practiceOrder(player *Player, o Order) string {
	if e.state.Metadata.Ruleset != "practice-v1" || e.state.Mission != nil {
		return "practice_only"
	}
	if o.Queued {
		return "practice_not_queueable"
	}
	switch o.Kind {
	case "practice_spawn":
		owner := e.player(PlayerID(o.Target))
		if owner == nil || owner.Defeated {
			return "unknown_player"
		}
		if !e.state.Map.InBounds(o.Position) || o.Index < 1 || o.Index > 20 {
			return "invalid_practice_spawn"
		}
		unit, isUnit := e.catalog.Unit(o.Type)
		building, isBuilding := e.buildingRule(o.Type)
		if !isUnit && !isBuilding || isUnit && unit.Faction != owner.Faction || isBuilding && (building.Faction != "" && building.Faction != owner.Faction || strings.HasPrefix(o.Type, "map.")) || o.Type == "US.support_plane" || o.Type == "IR.beacon" {
			return "unknown_roster_type"
		}
		e.recalculate()
		if !e.spawnScenario(content.MissionSpawn{Type: o.Type, Owner: uint32(owner.ID), Position: o.Position, Count: uint32(o.Index)}) {
			return "practice_capacity_or_placement"
		}
	case "practice_remove", "practice_restore":
		target := e.entity(o.Target)
		if target == nil || target.MapObject != 0 || target.HP <= 0 {
			return "invalid_practice_target"
		}
		if o.Kind == "practice_remove" {
			target.HP = 0
			target.Contributions = nil
		} else {
			target.HP = target.MaxHP
			target.DisabledUntil = 0
			if w, ok := e.weapon(target); ok {
				target.Ammo = w.Ammo
			}
			if e.isAircraft(target) {
				target.Endurance = 2400
			}
		}
	case "practice_resources":
		owner := e.player(PlayerID(o.Target))
		if owner == nil {
			return "unknown_player"
		}
		owner.Credits = int64(o.Index) * 1000
	case "practice_fog":
		if o.Index > 1 {
			return "invalid_toggle"
		}
		e.state.PracticeReveal = o.Index == 1
	default:
		return "invalid_order"
	}
	e.emit(o.Kind, player.ID, o.Target, o.Position, "all", int64(o.Index))
	return "ok"
}
