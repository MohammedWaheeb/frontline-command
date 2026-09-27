package server

import (
	"errors"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"time"
)

// Only the match owner goroutine may access pause state. Wall-clock controls
// never enter simulation saves or replay commands.
type pauseControl struct {
	enabled, paused bool
	votes           map[sim.PlayerID]bool
}

func newPauseControl(enabled bool) pauseControl {
	return pauseControl{enabled: enabled, votes: map[sim.PlayerID]bool{}}
}
func (c *pauseControl) resume() { c.paused = false; clear(c.votes) }
func (c *pauseControl) act(action string, player sim.PlayerID, active []sim.PlayerID) error {
	if !c.enabled {
		return errors.New("pause_disabled")
	}
	allowed := false
	for _, id := range active {
		if player == id {
			allowed = true
		}
	}
	if !allowed {
		return errors.New("player_inactive")
	}
	switch action {
	case "resume":
		c.resume()
		return nil
	case "pause":
		c.votes[player] = true
		c.paused = len(active) > 0
		for _, id := range active {
			if !c.votes[id] {
				c.paused = false
			}
		}
		return nil
	default:
		return errors.New("invalid_control")
	}
}
func (m *liveMatch) activeHumans() []sim.PlayerID {
	out := []sim.PlayerID{}
	for _, slot := range m.slots {
		if slot.AI {
			continue
		}
		view, ok := m.engine.PlayerView(slot.Player)
		if !ok {
			continue
		}
		for _, p := range view.Players {
			if p.ID == slot.Player && !p.Defeated {
				out = append(out, p.ID)
			}
		}
	}
	return out
}
func (m *liveMatch) connectionStatus(player sim.PlayerID, control *pauseControl, peers map[sim.PlayerID]*peer, disconnected map[sim.PlayerID]time.Time, started bool, now time.Time) *pb.MatchStatus {
	status := &pb.MatchStatus{PauseEnabled: control.enabled, Paused: control.paused, WaitingForPlayers: !started}
	view, _ := m.engine.PlayerView(player)
	team := uint32(0)
	for _, p := range view.Players {
		if p.ID == player {
			team = p.Team
		}
	}
	for _, p := range view.Players {
		if control.votes[p.ID] && !p.Defeated {
			status.PauseVotes = append(status.PauseVotes, uint32(p.ID))
		}
		if p.Team != team {
			continue
		}
		for _, slot := range m.slots {
			if slot.Player != p.ID || slot.AI {
				continue
			}
			c := &pb.ConnectionState{Player: uint32(p.ID), Connected: peers[p.ID] != nil}
			if deadline, ok := disconnected[p.ID]; ok && now.Before(deadline) {
				c.ReconnectRemainingMs = uint32(deadline.Sub(now).Milliseconds())
			}
			status.Teammates = append(status.Teammates, c)
		}
	}
	return status
}
