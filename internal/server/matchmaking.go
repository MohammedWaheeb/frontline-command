package server

import (
	"context"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"net/http"
	"sort"
	"time"
)

type queueEntry struct {
	Profile storage.Profile
	Faction string
	Maps    []string
	Rating  int
	Latency int
	Joined  time.Time
	Seen    time.Time
	LobbyID string
}

func (s *Server) myRating(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	rating, err := s.repo.GetRating(r.Context(), p.ID)
	if err != nil {
		fail(w, 500, "rating_unavailable", "Could not read the local rating.")
		return
	}
	respond(w, 200, rating)
}
func (s *Server) leaderboard(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authenticate(w, r); !ok {
		return
	}
	ratings, err := s.repo.Leaderboard(r.Context())
	if err != nil {
		fail(w, 500, "rating_unavailable", "Could not read the local leaderboard.")
		return
	}
	respond(w, 200, ratings)
}
func (s *Server) joinQueue(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Faction     string   `json:"faction"`
		Maps        []string `json:"maps"`
		Latency     int      `json:"latency_ms"`
		Protocol    uint32   `json:"protocol"`
		Simulation  string   `json:"simulation"`
		ContentHash string   `json:"content_hash"`
	}
	if !decode(w, r, &body, 8192) {
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if !content.ValidFaction(body.Faction) || len(body.Maps) > 8 || body.Latency < 0 || body.Latency > 1000 {
		fail(w, 400, "invalid_queue", "Choose a faction, maps and a valid host latency estimate.")
		return
	}
	if body.Protocol != 1 || body.Simulation != sim.Version || body.ContentHash != s.catalog.Hash() {
		fail(w, 409, "version_mismatch", "Load the matching game version before joining.")
		return
	}
	rating, err := s.repo.GetRating(r.Context(), p.ID)
	if err != nil {
		fail(w, 500, "rating_unavailable", "Could not read the local rating.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	if s.queue == nil {
		s.queue = map[string]*queueEntry{}
	}
	if entry := s.queue[p.ID]; entry != nil {
		if entry.LobbyID != "" && s.lobbies[entry.LobbyID] == nil {
			delete(s.queue, p.ID)
		} else {
			entry.Seen = time.Now()
			s.queueResponse(w, entry)
			return
		}
	}
	for _, l := range s.lobbies {
		for _, slot := range l.Slots {
			if slot.Profile == p.ID {
				fail(w, 409, "already_in_lobby", "Leave the current lobby or finish its match before queueing.")
				return
			}
		}
	}
	if len(s.queue) >= 128 || len(s.lobbies) >= 64 {
		fail(w, 429, "queue_full", "The local host is full.")
		return
	}
	if len(body.Maps) == 0 {
		for id, m := range s.maps {
			if len(m.Spawns) == 2 {
				body.Maps = append(body.Maps, id)
			}
		}
	}
	sort.Strings(body.Maps)
	maps := []string{}
	for _, id := range body.Maps {
		m, exists := s.maps[id]
		if !exists || len(m.Spawns) != 2 {
			fail(w, 400, "ranked_map_required", "Local ranked matching uses installed two-player maps.")
			return
		}
		if len(maps) == 0 || maps[len(maps)-1] != id {
			maps = append(maps, id)
		}
	}
	if len(maps) == 0 {
		fail(w, 409, "no_ranked_maps", "Install the two-player map pack before queueing.")
		return
	}
	now := time.Now()
	entry := &queueEntry{Profile: p, Faction: body.Faction, Maps: maps, Rating: rating.Rating, Latency: body.Latency, Joined: now, Seen: now}
	s.queue[p.ID] = entry
	if err = s.matchQueued(r.Context(), now); err != nil {
		delete(s.queue, p.ID)
		fail(w, 500, "queue_failed", "Could not create a local match.")
		return
	}
	s.queueResponse(w, entry)
}
func (s *Server) readQueue(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.queue[p.ID]
	if entry == nil {
		respond(w, 200, map[string]any{"status": "idle", "region": "local"})
		return
	}
	entry.Seen = time.Now()
	if entry.LobbyID != "" && s.lobbies[entry.LobbyID] == nil {
		delete(s.queue, p.ID)
		respond(w, 200, map[string]any{"status": "canceled", "region": "local"})
		return
	}
	if err := s.matchQueued(r.Context(), time.Now()); err != nil {
		fail(w, 500, "queue_failed", "Could not match local players.")
		return
	}
	s.queueResponse(w, entry)
}
func (s *Server) leaveQueue(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if entry := s.queue[p.ID]; entry != nil && entry.LobbyID != "" {
		if l := s.lobbies[entry.LobbyID]; l != nil {
			if l.MatchID != "" {
				fail(w, 409, "match_started", "Use Surrender to leave the active match.")
				return
			}
			delete(s.lobbies, l.ID)
		}
	}
	delete(s.queue, p.ID)
	w.WriteHeader(204)
}
func queueRange(entry *queueEntry, now time.Time) int {
	return min(600, 100+int(now.Sub(entry.Joined)/(30*time.Second))*50)
}
func (s *Server) queueResponse(w http.ResponseWriter, entry *queueEntry) {
	response := map[string]any{"status": "searching", "region": "local", "latency_ms": entry.Latency, "rating_range": queueRange(entry, time.Now()), "local": true, "joined": entry.Joined.Unix()}
	if entry.LobbyID != "" {
		response["status"] = "matched"
		response["lobby_id"] = entry.LobbyID
	}
	respond(w, 200, response)
}

// The one host is its only latency region. Skill tolerance widens before the
// accepted round-trip estimate rises from 180 to a hard 250 ms ceiling.
func (s *Server) matchQueued(ctx context.Context, now time.Time) error {
	waiting := []*queueEntry{}
	for id, q := range s.queue {
		if q.LobbyID != "" && s.lobbies[q.LobbyID] == nil {
			delete(s.queue, id)
			continue
		}
		if q.LobbyID == "" && now.Sub(q.Seen) > 2*time.Minute {
			delete(s.queue, id)
			continue
		}
		if q.LobbyID == "" {
			waiting = append(waiting, q)
		}
	}
	sort.Slice(waiting, func(i, j int) bool {
		if waiting[i].Joined.Equal(waiting[j].Joined) {
			return waiting[i].Profile.ID < waiting[j].Profile.ID
		}
		return waiting[i].Joined.Before(waiting[j].Joined)
	})
	for i, a := range waiting {
		if len(s.lobbies) >= 64 {
			return nil
		}
		if a.LobbyID != "" {
			continue
		}
		for _, b := range waiting[i+1:] {
			if b.LobbyID != "" {
				continue
			}
			latency := 180
			if now.Sub(a.Joined) >= 2*time.Minute && now.Sub(b.Joined) >= 2*time.Minute {
				latency = 250
			}
			gap := a.Rating - b.Rating
			if gap < 0 {
				gap = -gap
			}
			if a.Latency > latency || b.Latency > latency || gap > min(queueRange(a, now), queueRange(b, now)) {
				continue
			}
			mapID := ""
			for _, am := range a.Maps {
				for _, bm := range b.Maps {
					if am == bm {
						mapID = am
						break
					}
				}
				if mapID != "" {
					break
				}
			}
			if mapID == "" {
				continue
			}
			allowed, err := s.repo.PairAllowed(ctx, a.Profile.ID, b.Profile.ID)
			if err != nil {
				return err
			}
			if !allowed {
				continue
			}
			id, err := storage.Token()
			if err != nil {
				return err
			}
			code, err := storage.Token()
			if err != nil {
				return err
			}
			l := &Lobby{ID: id[:24], Name: "Local ranked 1v1", Host: a.Profile.ID, MapID: mapID, Mode: "1v1", Rated: true, Private: true, Code: code[:12], Created: now.Unix(), Slots: []LobbySlot{{Player: 1, Profile: a.Profile.ID, Name: a.Profile.Name, Faction: a.Faction, Team: 1}, {Player: 2, Profile: b.Profile.ID, Name: b.Profile.Name, Faction: b.Faction, Team: 2}}}
			s.lobbies[l.ID] = l
			a.LobbyID = l.ID
			b.LobbyID = l.ID
			break
		}
	}
	return nil
}
