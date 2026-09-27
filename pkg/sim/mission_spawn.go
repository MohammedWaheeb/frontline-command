package sim

import "frontlinecommand/pkg/content"

// Aggregate a trigger's pending creations before allocating its rollback copy.
// This keeps a full-capacity wave cheap while it waits, including two smaller
// spawn actions which individually fit but together exceed the same cap.
type scenarioReservation struct {
	Supply     int32
	Structures int32
	Defenses   int32
	Roles      map[string]int32
}

func (e *Engine) scenarioSpawnSelected(s content.MissionSpawn) bool {
	if len(s.Difficulties) == 0 {
		return true
	}
	if e.state.Mission == nil {
		return false
	}
	for _, difficulty := range s.Difficulties {
		if difficulty == e.state.Mission.Difficulty {
			return true
		}
	}
	return false
}
func (e *Engine) reserveScenarioSpawn(s content.MissionSpawn, reservation *scenarioReservation) bool {
	p := e.player(PlayerID(s.Owner))
	if p == nil || p.Defeated || s.Count == 0 || s.Count > 32 {
		return false
	}
	if reservation == nil {
		reservation = &scenarioReservation{}
	}
	if reservation.Roles == nil {
		reservation.Roles = map[string]int32{}
	}
	count := int32(s.Count)
	if u, ok := e.catalog.Unit(s.Type); ok {
		if p.Supply+p.ReservedSupply+reservation.Supply+count*u.Supply > 100 {
			return false
		}
		for role, limit := range map[string]int32{"rig": 4, "hauler": 8, "elite": 1} {
			if u.Role == role && e.countRole(p.ID, role, true)+reservation.Roles[role]+count > limit {
				return false
			}
		}
		reservation.Supply += count * u.Supply
		reservation.Roles[u.Role] += count
		return true
	}
	b, ok := e.buildingRule(s.Type)
	if !ok {
		return false
	}
	structures, defenses := int32(0), int32(0)
	for _, v := range e.state.Entities {
		if v.Owner != p.ID || !v.Building || v.HP <= 0 {
			continue
		}
		structures++
		other, _ := e.buildingRule(v.Type)
		if other.Defense {
			defenses++
		}
	}
	if structures+reservation.Structures+count > 60 || b.Defense && defenses+reservation.Defenses+count > 16 {
		return false
	}
	for role, limit := range map[string]int32{"strategic": 1, "safehouse": 3} {
		if b.Role == role && e.countRole(p.ID, role, true)+reservation.Roles[role]+count > limit {
			return false
		}
	}
	reservation.Structures += count
	if b.Defense {
		reservation.Defenses += count
	}
	reservation.Roles[b.Role] += count
	return true
}
