package server

import (
	"encoding/json"
	"frontlinecommand/internal/storage"
	"net/http"
	"strconv"
)

func (s *Server) socialRoutes() {
	s.mux.HandleFunc("GET /api/v1/social", func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.authenticate(w, r)
		if !ok {
			return
		}
		relations, err := s.repo.Relations(r.Context(), p.ID)
		if err != nil {
			fail(w, 500, "storage_error", "Could not load social preferences.")
			return
		}
		respond(w, 200, relations)
	})
	s.mux.HandleFunc("POST /api/v1/social", func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.authenticate(w, r)
		if !ok {
			return
		}
		var body struct {
			Target string `json:"target"`
			Action string `json:"action"`
		}
		if !decode(w, r, &body, 4096) {
			return
		}
		if err := s.repo.SetRelation(r.Context(), p.ID, body.Target, body.Action); err != nil {
			fail(w, 400, "social_action_rejected", "This action is unavailable for that profile.")
			return
		}
		w.WriteHeader(204)
	})
	s.mux.HandleFunc("GET /api/v1/settings", func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.authenticate(w, r)
		if !ok {
			return
		}
		v, err := s.repo.GetSettings(r.Context(), p.ID)
		if err != nil {
			fail(w, 500, "storage_error", "Could not load settings.")
			return
		}
		respond(w, 200, v)
	})
	s.mux.HandleFunc("PUT /api/v1/settings", func(w http.ResponseWriter, r *http.Request) {
		p, ok := s.authenticate(w, r)
		if !ok {
			return
		}
		var body struct {
			Expected int64           `json:"expected_revision"`
			Data     json.RawMessage `json:"data"`
		}
		if !decode(w, r, &body, 34000) {
			return
		}
		v, err := s.repo.PutSettings(r.Context(), p.ID, body.Expected, body.Data)
		if err != nil {
			fail(w, 409, "settings_conflict", "Keep the local settings and reload the synchronized revision before choosing which to save.")
			return
		}
		respond(w, 200, v)
	})
	s.mux.HandleFunc("GET /api/v1/lobbies/{id}/chat", s.readChat)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/chat", s.sendChat)
}
func (s *Server) chatMembership(w http.ResponseWriter, r *http.Request, p storage.Profile) (LobbySlot, *liveMatch, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobbies[r.PathValue("id")]
	if l != nil {
		for _, slot := range l.Slots {
			if slot.Profile == p.ID {
				return slot, s.matches[l.MatchID], true
			}
		}
	}
	fail(w, 403, "chat_membership_required", "Only participants may use this lobby chat.")
	return LobbySlot{}, nil, false
}
func (s *Server) sendChat(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	member, m, ok := s.chatMembership(w, r, p)
	if !ok {
		return
	}
	var body struct {
		Text     string `json:"text"`
		TeamOnly bool   `json:"team_only"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	tick := uint32(0)
	if m != nil {
		reply := m.call(r.Context(), matchRequest{kind: "chat_allowed", player: member.Player})
		if reply.err != nil {
			fail(w, 403, "observer_chat_disabled", "Eliminated players cannot send messages to active players.")
			return
		}
		tick = uint32(reply.view.Tick)
	}
	team := uint32(0)
	if body.TeamOnly {
		team = member.Team
	}
	recipients := []string{}
	if body.TeamOnly {
		s.mu.Lock()
		if lobby := s.lobbies[r.PathValue("id")]; lobby != nil {
			for _, slot := range lobby.Slots {
				if slot.Team == team && slot.Profile != "" {
					recipients = append(recipients, slot.Profile)
				}
			}
		}
		s.mu.Unlock()
	}
	message, err := s.repo.SendChat(r.Context(), storage.ChatMessage{Recipients: recipients, Room: r.PathValue("id"), Sender: p.ID, Team: team, Text: body.Text, Tick: tick})
	if err != nil {
		fail(w, 400, "chat_rejected", err.Error())
		return
	}
	respond(w, 201, message)
}
func (s *Server) readChat(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	member, _, ok := s.chatMembership(w, r, p)
	if !ok {
		return
	}
	after, _ := strconv.ParseInt(r.URL.Query().Get("after"), 10, 64)
	messages, err := s.repo.ReadChat(r.Context(), p.ID, r.PathValue("id"), member.Team, after)
	if err != nil {
		fail(w, 500, "storage_error", "Could not load chat.")
		return
	}
	respond(w, 200, messages)
}
