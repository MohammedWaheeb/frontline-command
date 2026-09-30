package sim

import "slices"

// PlayerVisibleEntityIDs returns only actor identities already authorized by
// PlayerView. It performs no entity/economy/private-state construction.
func (e *Engine) PlayerVisibleEntityIDs(id PlayerID) ([]ID, bool) {
	if e.player(id) == nil {
		return nil, false
	}
	ids := make([]ID, 0)
	for _, entity := range e.state.Entities {
		if entity.HP <= 0 || entity.Owner != id && !e.canSeeEntity(id, entity) {
			continue
		}
		ids = append(ids, entity.ID)
	}
	slices.Sort(ids)
	return ids, true
}
