package server

import (
	"context"
	"errors"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// Zero requests the first free position. Published positions are one-based and
// independent of persistent player IDs, including after a player leaves.
func lobbySpawn(l *Lobby, desired uint32, except sim.PlayerID, capacity int) (uint32, bool) {
	if desired > uint32(capacity) {
		return 0, false
	}
	used := map[uint32]bool{}
	for _, slot := range l.Slots {
		if slot.Player != except {
			used[slot.Spawn] = true
		}
	}
	if desired != 0 {
		return desired, !used[desired]
	}
	for spawn := uint32(1); spawn <= uint32(capacity); spawn++ {
		if !used[spawn] {
			return spawn, true
		}
	}
	return 0, false
}

// Fill omitted positions without changing any explicit choice. Scenario IDs
// correspond to authored starts and remain fixed by the request guards.
func assignLobbySpawns(l *Lobby, capacity int) bool {
	used := map[uint32]bool{}
	for _, slot := range l.Slots {
		if slot.Spawn > uint32(capacity) || slot.Spawn != 0 && used[slot.Spawn] {
			return false
		}
		if slot.Spawn != 0 {
			used[slot.Spawn] = true
		}
	}
	for i, slot := range l.Slots {
		if slot.Spawn != 0 {
			continue
		}
		spawn := uint32(0)
		if l.ScenarioID != "" || l.ResumeSave != "" || l.ResumeTick != 0 || l.Rated {
			spawn = uint32(slot.Player)
		}
		if spawn == 0 || spawn > uint32(capacity) || used[spawn] {
			for spawn = 1; spawn <= uint32(capacity) && used[spawn]; spawn++ {
			}
		}
		if spawn > uint32(capacity) {
			return false
		}
		l.Slots[i].Spawn = spawn
		used[spawn] = true
	}
	return true
}

func lobbyDefaultTeam(l *Lobby) uint32 {
	counts := map[uint32]int{}
	teams := []uint32{}
	for _, slot := range l.Slots {
		if counts[slot.Team] == 0 {
			teams = append(teams, slot.Team)
		}
		counts[slot.Team]++
	}
	for team := uint32(1); team <= 4; team++ {
		if counts[team] == 0 {
			if l.Mode != "2v2" || len(teams) < 2 {
				return team
			}
			break
		}
	}
	if l.Mode == "2v2" && len(teams) >= 2 {
		team := teams[0]
		if counts[teams[1]] < counts[team] {
			team = teams[1]
		}
		return team
	}
	return 1
}

// Ordinary fresh matches carry explicit starts in PlayerConfig. Keep the installed
// blueprint unchanged; old saved private-map permutations retain zero Spawn.
func lobbyMatchMap(l *Lobby, m content.Map) (content.Map, error) {
	if l.ScenarioID != "" || l.ResumeSave != "" || l.ResumeTick != 0 || l.Rated {
		return m, nil
	}
	if !assignLobbySpawns(l, len(m.Spawns)) {
		return content.Map{}, errors.New("invalid lobby spawn choices")
	}
	return m, nil
}

// Caller holds s.mu. Use installed/published map data without recursive locking.
func (s *Server) lobbySpawnCapacity(ctx context.Context, l *Lobby) (int, error) {
	m, ok := s.maps[l.MapID]
	if !ok {
		record, err := s.repo.GetMap(ctx, l.MapID)
		if err != nil {
			return 0, err
		}
		m, err = content.DecodeMap(record.Data)
		if err != nil {
			return 0, err
		}
	}
	return len(m.Spawns), nil
}
