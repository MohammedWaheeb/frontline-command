package sim

// MissionDifficulty is the authored difficulty persisted by saves and replays.
// Ordinary skirmishes have no mission difficulty.
func (e *Engine) MissionDifficulty() string {
	if e.state.Mission == nil {
		return ""
	}
	return e.state.Mission.Difficulty
}

// MapID identifies the active blueprint without copying its geometry.
func (e *Engine) MapID() string { return e.state.Map.ID }
