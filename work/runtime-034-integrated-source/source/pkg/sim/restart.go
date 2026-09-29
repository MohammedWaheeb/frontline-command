package sim

// Restart creates a fresh match from its original public configuration. It does
// not mutate the previous engine and does not carry rewards, orders or damage.
func (e *Engine) Restart() (*Engine, error) {
	if e.state.Mission != nil {
		var restarted *Engine
		var err error
		if e.state.Metadata.Ruleset == "practice-v1" {
			restarted, err = NewPracticeMission(e.catalog, e.MapBlueprint(), e.state.Mission.Definition, e.state.Mission.Difficulty, e.state.Metadata.Seed)
		} else {
			restarted, err = NewMission(e.catalog, e.MapBlueprint(), e.state.Mission.Definition, e.state.Mission.Difficulty, e.state.Metadata.Seed)
		}
		if err != nil {
			return nil, err
		}
		colors := map[PlayerID]uint32{}
		for _, p := range e.state.Players {
			colors[p.ID] = p.Color
		}
		if err = restarted.ConfigurePlayerColors(colors); err != nil {
			return nil, err
		}
		return restarted, nil
	}
	config := Config{Map: e.MapBlueprint(), Seed: e.state.Metadata.Seed, Ruleset: e.state.Metadata.Ruleset}
	for _, id := range e.state.SpawnPlayers {
		config.Players = append(config.Players, e.player(id).PlayerConfig)
	}
	return New(e.catalog, config)
}
