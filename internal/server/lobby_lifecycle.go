package server

import (
	"frontlinecommand/pkg/sim"
	"net/http"
	"time"
)

// Caller holds s.mu. Finished match goroutines close done before removal.
func (s *Server) pruneLobbies() {
	for id, m := range s.matches {
		select {
		case <-m.done:
			delete(s.matches, id)
		default:
		}
	}
	for id, l := range s.lobbies {
		if l.MatchID != "" && s.matches[l.MatchID] == nil || l.MatchID == "" && time.Now().Unix()-l.Created > 3600 {
			delete(s.lobbies, id)
		}
	}
}
func nextLobbyPlayer(l *Lobby) sim.PlayerID {
	for id := sim.PlayerID(1); id <= 4; id++ {
		found := false
		for _, slot := range l.Slots {
			if slot.Player == id {
				found = true
			}
		}
		if !found {
			return id
		}
	}
	return 0
}
func (s *Server) leaveLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil {
		w.WriteHeader(204)
		return
	}
	if l.MatchID != "" {
		fail(w, 409, "match_started", "Use Surrender to leave an active match.")
		return
	}
	if l.Rated {
		for _, slot := range l.Slots {
			if slot.Profile == p.ID {
				delete(s.lobbies, l.ID)
				delete(s.queue, p.ID)
				w.WriteHeader(204)
				return
			}
		}
		fail(w, 403, "not_in_lobby", "Join the lobby first.")
		return
	}
	for i, v := range l.Slots {
		if v.Profile == p.ID {
			l.Slots = append(l.Slots[:i], l.Slots[i+1:]...)
			break
		}
	}
	if l.Host == p.ID {
		l.Host = ""
		for _, v := range l.Slots {
			if v.Profile != "" {
				l.Host = v.Profile
				break
			}
		}
	}
	if l.Host == "" {
		delete(s.lobbies, l.ID)
	} else {
		resetReady(l)
	}
	w.WriteHeader(204)
}
