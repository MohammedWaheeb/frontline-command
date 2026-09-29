package sim

import "errors"

// Palette indices are public stable identities. Accessible palette rendering
// remains a client preference and never changes another commander's identity.
func configColors(players []PlayerConfig) ([]uint32, error) {
	used := map[uint32]bool{}
	colors := make([]uint32, len(players))
	for i, p := range players {
		if p.Color > 8 || p.Color != 0 && used[p.Color] {
			return nil, errors.New("invalid_player_color")
		}
		if p.Color != 0 {
			used[p.Color] = true
			colors[i] = p.Color
		}
	}
	for i, p := range players {
		if colors[i] != 0 {
			continue
		}
		color := uint32(p.ID)
		if color < 1 || color > 8 || used[color] {
			color = 1
			for used[color] {
				color++
			}
		}
		if color > 8 {
			return nil, errors.New("invalid_player_color")
		}
		used[color] = true
		colors[i] = color
	}
	return colors, nil
}

// ConfigurePlayerColors only adjusts a fresh, not-yet-started match, before
// its recorder is constructed. Resumed lobbies preserve checkpoint colors.
func (e *Engine) ConfigurePlayerColors(changes map[PlayerID]uint32) error {
	if e.state.Tick != 0 || len(e.state.Pending) != 0 || len(e.state.Log) != 0 || e.state.LogBase != 0 {
		return errors.New("match_already_started")
	}
	for id, color := range changes {
		if e.player(id) == nil || color < 1 || color > 8 {
			return errors.New("invalid_player_color")
		}
	}
	used := map[uint32]bool{}
	for _, p := range e.state.Players {
		color := p.Color
		if v, ok := changes[p.ID]; ok {
			color = v
		}
		if used[color] {
			return errors.New("invalid_player_color")
		}
		used[color] = true
	}
	for _, p := range e.state.Players {
		if color, ok := changes[p.ID]; ok {
			p.Color = color
		}
	}
	return nil
}
