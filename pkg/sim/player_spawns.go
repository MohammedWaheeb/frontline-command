package sim

import "errors"

func playerSpawn(player PlayerConfig, order int) int {
	if player.Spawn != 0 {
		return int(player.Spawn - 1)
	}
	return order
}

func validatePlayerSpawns(players []PlayerConfig, count int) error {
	used := make(map[int]bool, len(players))
	for order, player := range players {
		spawn := playerSpawn(player, order)
		if spawn < 0 || spawn >= count || used[spawn] {
			return errors.New("player spawn must be in range and unique")
		}
		used[spawn] = true
	}
	return nil
}
