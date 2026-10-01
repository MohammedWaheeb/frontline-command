package server

import (
	"net/http"
	"time"
)

// These helpers require s.mu. They never call a match actor while holding it.
// completed is published only after its replay and result are durable; the actor
// can then remain available for reconnect/observers without reserving a profile.
func (s *Server) lobbyCompleted(l *Lobby) bool {
	if l == nil || l.MatchID == "" {
		return false
	}
	m := s.matches[l.MatchID]
	return m != nil && m.completed.Load()
}

func (s *Server) queueEntryCurrent(q *queueEntry, now time.Time) bool {
	if q.LobbyID == "" {
		return now.Sub(q.Seen) <= 2*time.Minute
	}
	l := s.lobbies[q.LobbyID]
	return l != nil && !s.lobbyCompleted(l)
}

func (s *Server) pruneQueue(now time.Time) {
	for id, entry := range s.queue {
		if !s.queueEntryCurrent(entry, now) {
			delete(s.queue, id)
		}
	}
}

func (s *Server) admitProfile(w http.ResponseWriter, profile, exceptLobby string) bool {
	if entry := s.queue[profile]; entry != nil {
		if !s.queueEntryCurrent(entry, time.Now()) {
			delete(s.queue, profile)
		} else if entry.LobbyID == "" {
			fail(w, 409, "already_queued", "Cancel matchmaking before joining or creating a lobby.")
			return false
		} else if entry.LobbyID != exceptLobby {
			fail(w, 409, "already_in_lobby", "Leave the current lobby or finish its match first.")
			return false
		}
	}
	for _, l := range s.lobbies {
		if l.ID == exceptLobby || s.lobbyCompleted(l) {
			continue
		}
		for _, slot := range l.Slots {
			if slot.Profile == profile {
				fail(w, 409, "already_in_lobby", "Leave the current lobby or finish its match first.")
				return false
			}
		}
	}
	return true
}

func lobbyMember(l *Lobby, profile string) bool {
	for _, slot := range l.Slots {
		if slot.Profile == profile {
			return true
		}
	}
	return false
}
