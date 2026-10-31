package server

import (
	"frontlinecommand/pkg/sim"
	"net/http"
	"sync"
	"time"
	"weak"
)

const lobbyHostGrace = 2 * time.Minute
const lobbyHostOffline = 15 * time.Second

type lobbyHostLease struct {
	host string
	seen time.Time
}

// Weak keys keep presence local to the lobby lifetime, including lobbies removed
// by invitation/ranked paths. No credential, simulation or persistent state lives here.
var lobbyHostLeases sync.Map // weak.Pointer[Lobby] -> lobbyHostLease

// Callers hold s.mu; the table also permits independent Server instances.
func noteLobbyHost(l *Lobby, profile string, now time.Time) {
	if l.MatchID == "" && profile == l.Host {
		lobbyHostLeases.Store(weak.Make(l), lobbyHostLease{host: l.Host, seen: now})
	}
}
func lobbyHostSeen(l *Lobby, now time.Time) time.Time {
	key := weak.Make(l)
	if value, ok := lobbyHostLeases.Load(key); ok {
		lease := value.(lobbyHostLease)
		if lease.host == l.Host {
			return lease.seen
		}
		// Explicit host migration grants the replacement a fresh polling window.
		lease = lobbyHostLease{host: l.Host, seen: now}
		lobbyHostLeases.Store(key, lease)
		return now
	}
	return time.Unix(l.Created, 0)
}
func lobbyHostAvailable(l *Lobby, now time.Time) bool {
	return l.MatchID != "" || now.Sub(lobbyHostSeen(l, now)) < lobbyHostOffline
}

// Caller holds s.mu. Finished match goroutines close done before removal.
func (s *Server) pruneLobbies() { s.pruneLobbiesAt(time.Now()) }

// An explicit clock keeps host-loss/grace-boundary tests deterministic.
func (s *Server) pruneLobbiesAt(now time.Time) {
	for id, m := range s.matches {
		select {
		case <-m.done:
			delete(s.matches, id)
		default:
		}
	}
	for id, l := range s.lobbies {
		if l.MatchID != "" && s.matches[l.MatchID] == nil || l.MatchID == "" && now.Sub(lobbyHostSeen(l, now)) >= lobbyHostGrace {
			delete(s.lobbies, id)
			lobbyHostLeases.Delete(weak.Make(l))
		}
	}
	lobbyHostLeases.Range(func(key, _ any) bool {
		if key.(weak.Pointer[Lobby]).Value() == nil {
			lobbyHostLeases.Delete(key)
		}
		return true
	})
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
	if !lobbyMember(l, p.ID) {
		fail(w, 403, "not_in_lobby", "Join the lobby first.")
		return
	}
	if l.MatchID != "" {
		if s.lobbyCompleted(l) {
			// Keep historical membership for private replay/reconnect access.
			// A committed result already released the profile for new admission.
			if q := s.queue[p.ID]; q != nil && q.LobbyID == l.ID {
				delete(s.queue, p.ID)
			}
			w.WriteHeader(204)
			return
		}
		fail(w, 409, "match_started", "Use Surrender to leave an active match.")
		return
	}
	if l.Rated {
		delete(s.lobbies, l.ID)
		delete(s.queue, p.ID)
		w.WriteHeader(204)
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
