package server

import (
	"frontlinecommand/internal/storage"
	"net/http"
	"time"
)

// A rematch is an explicit new, unranked lobby. Only its requester and the old
// computer-controlled slots are enrolled; other humans choose whether to join.
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
	defer s.mu.Unlock()
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
	for _, l := range s.lobbies {
		if l.PreviousMatch == previous.MatchID && l.Host == p.ID && l.MatchID == "" {
			respond(w, 200, s.lobbyResponse(l, p.ID))
			return
		}
	}
	if !s.admitProfile(w, p.ID, "") {
		return
	}
	if len(s.lobbies) >= 64 {
		fail(w, 429, "lobby_limit", "This local host has reached its lobby limit.")
		return
	}
	l := &Lobby{
		ID: id[:24], Code: code[:12], Created: time.Now().Unix(), Host: p.ID,
		Name: previous.Name, MapID: previous.MapID, Mode: previous.Mode, MapHash: previous.MapHash, MapVersion: previous.MapVersion, Rules: previous.Rules,
		Private: previous.Private, PauseEnabled: previous.PauseEnabled,
		LiveObservers: previous.LiveObservers, ScenarioID: previous.ScenarioID,
		Difficulty: previous.Difficulty, PreviousMatch: previous.MatchID,
	}
	if previous.Rated {
		l.Name = "Unranked rematch"
	}
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
			fail(w, 400, "invalid_scenario", err.Error())
			return
		}
	}
	resetReady(l)
	s.lobbies[l.ID] = l
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
