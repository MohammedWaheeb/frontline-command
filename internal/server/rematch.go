package server

import (
	"context"
	"frontlinecommand/internal/storage"
	"net/http"
	"time"
)

// A rematch is one shared, explicit new, unranked lobby. Only its first requester
// and the old computer-controlled slots are enrolled; other humans receive an
// invitation and choose whether to join. Repeated rematch clicks join that lobby.
// Old authorization and result history remain attached to the previous match.
func (s *Server) rematchLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct{}
	if !decode(w, r, &body, 1024) {
		return
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create a rematch lobby.")
		return
	}
	code, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create a rematch lobby.")
		return
	}
	s.mu.Lock()
	var join func()
	defer func() {
		s.mu.Unlock()
		if join != nil {
			join()
		}
	}()
	s.pruneLobbies()
	previous := s.lobbies[r.PathValue("id")]
	if previous == nil {
		fail(w, 404, "lobby_missing", "The debrief has expired. Create a new lobby from mode selection.")
		return
	}
	if !lobbyMember(previous, p.ID) {
		fail(w, 403, "not_in_lobby", "Only participants may request this rematch.")
		return
	}
	if !s.lobbyCompleted(previous) {
		fail(w, 409, "match_not_completed", "Finish the match and wait for its saved result before a rematch.")
		return
	}
	previousRules, _, rulesErr := normalizedLobbyRules(previous, previous.Rules)
	if rulesErr != nil {
		fail(w, 400, rulesErr.code, rulesErr.message)
		return
	}
	for _, l := range s.lobbies {
		if l.PreviousMatch == previous.MatchID && l.MatchID == "" {
			rules, _, rulesErr := normalizedLobbyRules(l, l.Rules)
			if rulesErr != nil {
				fail(w, 400, rulesErr.code, rulesErr.message)
				return
			}
			if l.ScenarioID == "" && l.ResumeSave == "" {
				l.Rules = &rules
			}
			if lobbyMember(l, p.ID) {
				respond(w, 200, s.lobbyResponse(l, p.ID))
				return
			}
			// Clicking Rematch is an explicit request to join the shared lobby.
			// Reuse ordinary admission, capacity and block validation, including
			// private access, without requiring a second click on its invitation.
			body := lobbyJoinRequest{Code: l.Code}
			for _, slot := range previous.Slots {
				if slot.Profile == p.ID {
					body.Faction, body.Team = slot.Faction, slot.Team
				}
			}
			inviteID := ""
			for id, invite := range s.invites {
				if invite.LobbyID == l.ID && invite.Recipient == p.ID && invite.Expires > time.Now().Unix() {
					inviteID = id
					break
				}
			}
			r.SetPathValue("id", l.ID)
			join = func() { s.joinLobbyAs(w, r, p, body, inviteID) }
			return
		}
	}
	if !s.admitProfile(w, p.ID, "") {
		return
	}
	if len(s.lobbies) >= s.lobbyLimit() {
		fail(w, 429, "lobby_limit", "This local host has reached its lobby limit.")
		return
	}
	l := &Lobby{
		ID: id[:24], Code: code[:12], Created: time.Now().Unix(), Host: p.ID,
		Name: previous.Name, MapID: previous.MapID, Mode: previous.Mode, MapHash: previous.MapHash, MapVersion: previous.MapVersion, Rules: &previousRules,
		Private: previous.Private, PauseEnabled: previous.PauseEnabled,
		LiveObservers: previous.LiveObservers, ScenarioID: previous.ScenarioID,
		Difficulty: previous.Difficulty, PreviousMatch: previous.MatchID, Rematch: true,
	}
	// Active metadata names the permuted simulation blueprint. A forming
	// rematch must advertise the original pinned map before asset readiness.
	if previous.mapData != nil {
		m := *previous.mapData
		l.mapData = &m
		l.MapHash, l.MapVersion = lobbyMapHash(m), m.Version
	}
	if previous.Rated {
		l.Name = "Unranked rematch"
	}
	rules, _, rulesErr := normalizedLobbyRules(l, l.Rules)
	if rulesErr != nil {
		fail(w, 400, rulesErr.code, rulesErr.message)
		return
	}
	l.Rules = &rules
	for _, slot := range previous.Slots {
		if slot.Profile == p.ID || slot.AI != "" || slot.Script {
			l.Slots = append(l.Slots, slot)
		}
	}
	if l.ScenarioID != "" {
		mission, exists := s.missions[l.ScenarioID]
		if !exists {
			fail(w, 409, "scenario_missing", "The installed scenario is unavailable.")
			return
		}
		l.ScenarioRules, err = s.scenarioLobbyRules(s.maps[l.MapID], mission, l.Difficulty, false)
		if err != nil {
			fail(w, 400, "invalid_scenario", "The scenario is invalid for a rematch.")
			return
		}
	}
	invites, status, inviteErr := s.rematchInvites(r.Context(), previous, l, p)
	if inviteErr != nil {
		fail(w, status, inviteErr.code, inviteErr.message)
		return
	}
	resetReady(l)
	s.lobbies[l.ID] = l
	if s.invites == nil {
		s.invites = map[string]*LobbyInvite{}
	}
	for _, invite := range invites {
		s.invites[invite.ID] = invite
	}
	respond(w, 201, s.lobbyResponse(l, p.ID))
}

// Prepare invitations before publishing the lobby so storage/random/capacity
// failures cannot leave an unreachable half-created rematch. Notifications do
// not reserve profiles or enroll recipients; acceptance uses normal admission.
func (s *Server) rematchInvites(ctx context.Context, previous, next *Lobby, sender storage.Profile) ([]*LobbyInvite, int, *lobbyRulesError) {
	now := time.Now().Unix()
	s.pruneLobbyInvites(now)
	invites := []*LobbyInvite{}
	seen := map[string]bool{}
	for _, slot := range previous.Slots {
		if slot.Profile == "" || slot.Profile == sender.ID || seen[slot.Profile] {
			continue
		}
		seen[slot.Profile] = true
		allowed, err := s.allowedLobbyPair(ctx, next, slot.Profile)
		if err != nil {
			return nil, 500, &lobbyRulesError{"storage_error", "Could not check rematch invitations."}
		}
		if !allowed {
			continue
		}
		pending := 0
		for _, invite := range s.invites {
			if invite.Recipient == slot.Profile && !invite.Accepted {
				pending++
			}
		}
		if pending >= 32 || len(s.invites)+len(invites) >= 512 {
			return nil, 429, &lobbyRulesError{"invite_limit", "Too many pending invitations. Wait for them to expire or be declined."}
		}
		id, err := storage.Token()
		if err != nil {
			return nil, 500, &lobbyRulesError{"random_error", "Could not create rematch invitations."}
		}
		invites = append(invites, &LobbyInvite{PreviousMatch: previous.MatchID, Rematch: true, ID: id[:24], LobbyID: next.ID, LobbyName: next.Name, Sender: sender.ID, SenderName: sender.Name, Recipient: slot.Profile, Created: now, Expires: now + 600})
	}
	return invites, 0, nil
}
