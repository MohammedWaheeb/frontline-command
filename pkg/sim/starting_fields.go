package sim

// The nearest authored supply field is part of each spawn's opening briefing.
// Seed a single observation, not ongoing sight: hidden depletion and enemies
// remain private until actually observed. Field order breaks equal-distance
// ties by ID, and SpawnPlayers preserves assignment when player IDs are sorted.
func (e *Engine) revealStartingFields() {
	for slot, id := range e.state.SpawnPlayers {
		p := e.player(id)
		spawn := e.state.Map.Spawns[playerSpawn(p.PlayerConfig, slot)].Position
		var nearest *ResourceField
		for _, field := range e.state.Fields {
			if nearest == nil || dist2(spawn, field.Position) < dist2(spawn, nearest.Position) {
				nearest = field
			}
		}
		if nearest != nil {
			e.observeField(p, nearest)
			p.Explored[nearest.Position.Y/1000*e.state.Map.Width+nearest.Position.X/1000] = true
		}
	}
}
