package server

import (
	"context"
	"frontlinecommand/internal/storage"
	"net/http"
	"sort"
	"time"
)

type LobbyInvite struct {
	ID         string `json:"id"`
	LobbyID    string `json:"lobby_id"`
	LobbyName  string `json:"lobby_name"`
	Sender     string `json:"sender"`
	SenderName string `json:"sender_name"`
	Recipient  string `json:"recipient"`
	Created    int64  `json:"created"`
	Expires    int64  `json:"expires"`
	Accepted   bool   `json:"accepted"`
}

func (s *Server) pruneLobbyInvites(now int64) {
	for id, invite := range s.invites {
		l := s.lobbies[invite.LobbyID]
		if invite.Expires <= now || l == nil || !lobbyMember(l, invite.Sender) || l.MatchID != "" && !invite.Accepted {
			delete(s.invites, id)
		}
	}
}
func (s *Server) inviteFriends(ctx context.Context, a, b string) (bool, error) {
	allowed, err := s.repo.PairAllowed(ctx, a, b)
	if err != nil || !allowed {
		return false, err
	}
	relations, err := s.repo.Relations(ctx, a)
	if err != nil {
		return false, err
	}
	for _, relation := range relations {
		if relation.Target == b && relation.Kind == "friend" && !relation.Incoming {
			return true, nil
		}
	}
	return false, nil
}

// All membership-changing callers hold the lobby mutex through this check and
// admission. Blocking never discloses which existing participant applied it.
func (s *Server) allowedLobbyPair(ctx context.Context, l *Lobby, profile string) (bool, error) {
	for _, slot := range l.Slots {
		if slot.Profile != "" && slot.Profile != profile {
			allowed, err := s.repo.PairAllowed(ctx, profile, slot.Profile)
			if err != nil || !allowed {
				return false, err
			}
		}
	}
	return true, nil
}
func (s *Server) validLobbyInvite(ctx context.Context, id, recipient string, l *Lobby) (*LobbyInvite, bool, error) {
	invite := s.invites[id]
	if invite == nil || invite.Recipient != recipient || invite.LobbyID != l.ID || invite.Expires <= time.Now().Unix() || !lobbyMember(l, invite.Sender) {
		return nil, false, nil
	}
	allowed, err := s.inviteFriends(ctx, invite.Sender, recipient)
	return invite, allowed, err
}
func (s *Server) createLobbyInvite(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Target string `json:"target"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if !storage.ValidID(body.Target) || body.Target == p.ID {
		fail(w, 400, "invalid_invite", "Choose a friend on this local host.")
		return
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create an invitation.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	s.pruneLobbyInvites(time.Now().Unix())
	l := s.lobbies[r.PathValue("id")]
	if l == nil || l.MatchID != "" || l.Rated {
		fail(w, 409, "lobby_unavailable", "Invite friends to a forming unranked lobby.")
		return
	}
	if !lobbyMember(l, p.ID) {
		fail(w, 403, "not_in_lobby", "Join the lobby before inviting friends.")
		return
	}
	if lobbyMember(l, body.Target) {
		fail(w, 409, "already_member", "This friend has already joined.")
		return
	}
	capacity, capacityErr := s.lobbyCapacity(r.Context(), l)
	if capacityErr != nil {
		fail(w, 409, "map_missing", "The lobby map is unavailable.")
		return
	}
	if len(l.Slots) >= capacity {
		fail(w, 409, "lobby_full", "Remove a slot before inviting another participant.")
		return
	}
	friends, err := s.inviteFriends(r.Context(), p.ID, body.Target)
	if err != nil {
		fail(w, 500, "storage_error", "Could not check friendship.")
		return
	}
	allowed, pairErr := s.allowedLobbyPair(r.Context(), l, body.Target)
	if pairErr != nil {
		fail(w, 500, "storage_error", "Could not check lobby access.")
		return
	}
	if !friends || !allowed {
		fail(w, 403, "invite_unavailable", "An invitation requires an accepted friendship and compatible block preferences.")
		return
	}
	count := 0
	for _, invite := range s.invites {
		if invite.Recipient == body.Target && !invite.Accepted {
			count++
		}
		if invite.LobbyID == l.ID && invite.Sender == p.ID && invite.Recipient == body.Target && !invite.Accepted {
			respond(w, 200, invite)
			return
		}
	}
	if count >= 32 || len(s.invites) >= 512 {
		fail(w, 429, "invite_limit", "Too many pending invitations. Wait for them to expire or be declined.")
		return
	}
	if s.invites == nil {
		s.invites = map[string]*LobbyInvite{}
	}
	now := time.Now().Unix()
	invite := &LobbyInvite{ID: id[:24], LobbyID: l.ID, LobbyName: l.Name, Sender: p.ID, SenderName: p.Name, Recipient: body.Target, Created: now, Expires: now + 600}
	s.invites[invite.ID] = invite
	respond(w, 201, invite)
}
func (s *Server) listLobbyInvites(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	s.pruneLobbyInvites(time.Now().Unix())
	out := []*LobbyInvite{}
	for id, invite := range s.invites {
		if invite.Recipient != p.ID || invite.Accepted {
			continue
		}
		l := s.lobbies[invite.LobbyID]
		_, allowed, err := s.validLobbyInvite(r.Context(), id, p.ID, l)
		if err != nil {
			fail(w, 500, "storage_error", "Could not read invitations.")
			return
		}
		if allowed {
			allowed, err = s.allowedLobbyPair(r.Context(), l, p.ID)
		}
		if err != nil {
			fail(w, 500, "storage_error", "Could not read invitations.")
			return
		}
		if !allowed {
			delete(s.invites, id)
			continue
		}
		out = append(out, invite)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Created == out[j].Created {
			return out[i].ID < out[j].ID
		}
		return out[i].Created < out[j].Created
	})
	respond(w, 200, map[string]any{"invites": out})
}
func (s *Server) acceptLobbyInvite(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body lobbyJoinRequest
	if !decode(w, r, &body, 4096) {
		return
	}
	s.mu.Lock()
	invite := s.invites[r.PathValue("invite")]
	if invite == nil || invite.Recipient != p.ID || invite.Expires <= time.Now().Unix() {
		s.mu.Unlock()
		fail(w, 404, "invite_missing", "This invitation is unavailable or expired.")
		return
	}
	lobbyID, inviteID := invite.LobbyID, invite.ID
	s.mu.Unlock()
	r.SetPathValue("id", lobbyID)
	s.joinLobbyAs(w, r, p, body, inviteID)
}
func (s *Server) deleteLobbyInvite(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	invite := s.invites[r.PathValue("invite")]
	if invite == nil {
		w.WriteHeader(204)
		return
	}
	if invite.Recipient != p.ID && invite.Sender != p.ID {
		fail(w, 403, "invite_owner_required", "Only the sender or recipient may dismiss this invitation.")
		return
	}
	delete(s.invites, invite.ID)
	w.WriteHeader(204)
}
