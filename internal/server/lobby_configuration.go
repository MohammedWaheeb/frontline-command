package server

import (
	"context"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"net/http"
	"reflect"
	"strconv"
)

type LobbyRules struct {
	Ruleset             string  `json:"ruleset"`
	Speed               float64 `json:"speed"`
	StartingCredits     uint32  `json:"starting_credits"`
	SupplyCap           uint32  `json:"supply_cap"`
	Fog                 bool    `json:"fog"`
	StrategicOperations bool    `json:"strategic_operations"`
}

func standardLobbyRules() LobbyRules { return LobbyRules{"standard-v2", 1, 6000, 100, true, true} }
func defaultLobbyRules() *LobbyRules { rules := standardLobbyRules(); return &rules }
func validDifficulty(v string) bool  { return v == "easy" || v == "normal" || v == "hard" }
func lobbyColor(l *Lobby, desired uint32, except sim.PlayerID) (uint32, bool) {
	if desired > 8 {
		return 0, false
	}
	used := map[uint32]bool{}
	for _, v := range l.Slots {
		if v.Player != except {
			used[v.Color] = true
		}
	}
	if desired != 0 {
		return desired, !used[desired]
	}
	for color := uint32(1); color <= 8; color++ {
		if !used[color] {
			return color, true
		}
	}
	return 0, false
}
func assignLobbyColors(l *Lobby) bool {
	used := map[uint32]bool{}
	for _, slot := range l.Slots {
		if slot.Color > 8 || slot.Color != 0 && used[slot.Color] {
			return false
		}
		if slot.Color != 0 {
			used[slot.Color] = true
		}
	}
	for i, slot := range l.Slots {
		if slot.Color != 0 {
			continue
		}
		color := uint32(slot.Player)
		if color == 0 || color > 8 || used[color] {
			for color = 1; color <= 8 && used[color]; color++ {
			}
		}
		if color > 8 {
			return false
		}
		l.Slots[i].Color = color
		used[color] = true
	}
	return true
}
func completeLobbyMetadata(l *Lobby) {
	if l.Revision == 0 {
		l.Revision = 1
	}
	if l.ScenarioID != "" {
		l.Rules = nil
	} else if l.Rules == nil {
		l.Rules = defaultLobbyRules()
	}
	assignLobbyColors(l)
}
func lobbyMapCapacity(l *Lobby, m content.Map) int {
	capacity := min(4, len(m.Spawns))
	if l.Mode == "1v1" {
		capacity = min(capacity, 2)
	}
	return capacity
}

// Caller holds s.mu; unlike loadMap this helper does not acquire it again.
func (s *Server) lobbyCapacity(ctx context.Context, l *Lobby) (int, error) {
	m, ok := s.maps[l.MapID]
	if !ok {
		record, err := s.repo.GetMap(ctx, l.MapID)
		if err != nil {
			return 0, err
		}
		m, err = content.DecodeMap(record.Data)
		if err != nil {
			return 0, err
		}
	}
	return lobbyMapCapacity(l, m), nil
}
func (s *Server) lobbyServiceRoutes() {
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/ai", s.addLobbyAI)
	s.mux.HandleFunc("PATCH /api/v1/lobbies/{id}/ai/{player}", s.updateLobbyAI)
	s.mux.HandleFunc("DELETE /api/v1/lobbies/{id}/slots/{player}", s.removeLobbySlot)
	s.mux.HandleFunc("GET /api/v1/matchmaking/maps", s.listRankedMaps)
	s.mux.HandleFunc("POST /api/v1/lobbies/{id}/invites", s.createLobbyInvite)
	s.mux.HandleFunc("GET /api/v1/invites", s.listLobbyInvites)
	s.mux.HandleFunc("POST /api/v1/invites/{invite}/accept", s.acceptLobbyInvite)
	s.mux.HandleFunc("DELETE /api/v1/invites/{invite}", s.deleteLobbyInvite)
}
func (s *Server) formingHost(w http.ResponseWriter, r *http.Request, profile string) (*Lobby, bool) {
	l := s.lobbies[r.PathValue("id")]
	if l == nil || l.MatchID != "" {
		fail(w, 409, "lobby_unavailable", "The lobby is unavailable or has started.")
		return nil, false
	}
	if l.Host != profile {
		fail(w, 403, "host_required", "Only the forming lobby's host may change its slots.")
		return nil, false
	}
	if l.Rated {
		fail(w, 409, "ranked_rules_locked", "Matched players and teams are fixed.")
		return nil, false
	}
	return l, true
}
func (s *Server) addLobbyAI(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body aiRequest
	if !decode(w, r, &body, 4096) {
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if !validDifficulty(body.Difficulty) || body.Team > 4 || body.Color > 8 {
		fail(w, 400, "invalid_ai", "Choose a valid difficulty, team and unused color.")
		return
	}
	s.mu.Lock()
	l, ok := s.formingHost(w, r, p.ID)
	if !ok {
		s.mu.Unlock()
		return
	}
	if l.ResumeSave != "" {
		s.mu.Unlock()
		fail(w, 409, "scenario_rules_locked", "Saved controllers are fixed by the checkpoint.")
		return
	}
	mapID := l.MapID
	s.mu.Unlock()
	m, err := s.loadMap(r.Context(), mapID)
	if err != nil {
		fail(w, 400, "map_missing", "Lobby map unavailable.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	current, ok := s.formingHost(w, r, p.ID)
	if !ok {
		return
	}
	if current != l || l.MapID != mapID {
		fail(w, 409, "lobby_changed", "Reload the lobby before changing slots.")
		return
	}
	if len(l.Slots) >= lobbyMapCapacity(l, m) {
		fail(w, 409, "lobby_full", "This map has no free player slots.")
		return
	}
	var slot LobbySlot
	if l.ScenarioID != "" {
		slot, ok = s.scenarioJoinSlot(l, storage.Profile{})
		if !ok {
			fail(w, 409, "scenario_full", "Every human scenario slot is filled.")
			return
		}
		if body.Faction != "" && body.Faction != slot.Faction || body.Team != 0 && body.Team != slot.Team {
			fail(w, 409, "scenario_rules_locked", "The scenario fixes factions and teams.")
			return
		}
	} else {
		if !content.ValidFaction(body.Faction) {
			fail(w, 400, "invalid_faction", "Choose a valid faction.")
			return
		}
		slot = LobbySlot{Player: nextLobbyPlayer(l), Faction: body.Faction, Team: body.Team}
		if slot.Team == 0 || l.Mode == "ffa" {
			slot.Team = uint32(slot.Player)
		}
	}
	slot.Color, ok = lobbyColor(l, body.Color, 0)
	if !ok {
		fail(w, 409, "color_unavailable", "Choose an unused player color.")
		return
	}
	slot.AI, slot.Name = body.Difficulty, body.Difficulty+" AI"
	l.Slots = append(l.Slots, slot)
	resetReady(l)
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
func (s *Server) updateLobbyAI(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body aiRequest
	if !decode(w, r, &body, 4096) {
		return
	}
	id, err := strconv.ParseUint(r.PathValue("player"), 10, 32)
	if err != nil {
		fail(w, 400, "invalid_player", "Choose an existing AI slot.")
		return
	}
	if body.Faction != "" {
		body.Faction = resolveFaction(body.Faction)
	}
	if body.Faction != "" && !content.ValidFaction(body.Faction) || body.Difficulty != "" && !validDifficulty(body.Difficulty) || body.Team > 4 || body.Color > 8 {
		fail(w, 400, "invalid_ai", "Choose a valid faction, difficulty, team and color.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l, ok := s.formingHost(w, r, p.ID)
	if !ok {
		return
	}
	if l.ResumeSave != "" {
		fail(w, 409, "scenario_rules_locked", "Saved controllers and colors are fixed by the checkpoint.")
		return
	}
	for i, slot := range l.Slots {
		if uint32(slot.Player) != uint32(id) {
			continue
		}
		if slot.AI == "" || slot.Script {
			fail(w, 409, "ai_slot_required", "Choose an ordinary AI slot.")
			return
		}
		if l.ScenarioID != "" {
			mission := s.missions[l.ScenarioID]
			humanAlly := false
			for n, mp := range mission.Players {
				if mp.ID == uint32(slot.Player) && mp.Control(n) == "human" {
					humanAlly = true
				}
			}
			if !humanAlly || body.Faction != "" && body.Faction != slot.Faction || body.Team != 0 && body.Team != slot.Team {
				fail(w, 409, "scenario_rules_locked", "Only the ally AI difficulty and color may change.")
				return
			}
		}
		next := slot
		if body.Faction != "" {
			next.Faction = body.Faction
		}
		if body.Difficulty != "" {
			next.AI = body.Difficulty
			next.Name = body.Difficulty + " AI"
		}
		if body.Team != 0 && l.Mode != "ffa" {
			next.Team = body.Team
		}
		if body.Color != 0 {
			next.Color, ok = lobbyColor(l, body.Color, slot.Player)
			if !ok {
				fail(w, 409, "color_unavailable", "Choose an unused player color.")
				return
			}
		}
		if next != slot {
			l.Slots[i] = next
			resetReady(l)
		}
		respond(w, 200, s.lobbyResponse(l, p.ID))
		return
	}
	fail(w, 404, "slot_missing", "This player slot is empty.")
}
func (s *Server) removeLobbySlot(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	id, err := strconv.ParseUint(r.PathValue("player"), 10, 32)
	if err != nil {
		fail(w, 400, "invalid_player", "Choose an existing player slot.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l, ok := s.formingHost(w, r, p.ID)
	if !ok {
		return
	}
	for i, slot := range l.Slots {
		if uint32(slot.Player) != uint32(id) {
			continue
		}
		if slot.Profile == p.ID {
			fail(w, 409, "use_leave", "Use Leave to transfer the host role.")
			return
		}
		if slot.Script {
			fail(w, 409, "scenario_rules_locked", "Authored scenario participants cannot be removed.")
			return
		}
		if l.ScenarioID != "" && slot.AI != "" {
			humanAlly := false
			for n, mp := range s.missions[l.ScenarioID].Players {
				if mp.ID == uint32(slot.Player) && mp.Control(n) == "human" {
					humanAlly = true
				}
			}
			if !humanAlly || l.ResumeSave != "" {
				fail(w, 409, "scenario_rules_locked", "The scenario or checkpoint fixes this AI slot.")
				return
			}
		}
		l.Slots = append(l.Slots[:i], l.Slots[i+1:]...)
		for key, invite := range s.invites {
			if invite.LobbyID == l.ID && (invite.Sender == slot.Profile || invite.Recipient == slot.Profile) {
				delete(s.invites, key)
			}
		}
		resetReady(l)
		respond(w, 200, s.lobbyResponse(l, p.ID))
		return
	}
	fail(w, 404, "slot_missing", "This player slot is empty.")
}

// Validate the entire change before mutating membership or ready flags.
func (s *Server) changeLobby(w http.ResponseWriter, r *http.Request) {
	s.mapMu.RLock()
	defer s.mapMu.RUnlock()
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Faction   string      `json:"faction"`
		Team      uint32      `json:"team"`
		Color     uint32      `json:"color"`
		MapID     string      `json:"map_id"`
		Name      *string     `json:"name"`
		Private   *bool       `json:"private"`
		Pause     *bool       `json:"pause_enabled"`
		Observers *bool       `json:"live_observers"`
		Rules     *LobbyRules `json:"rules"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if body.Faction != "" {
		body.Faction = resolveFaction(body.Faction)
	}
	if body.Faction != "" && !content.ValidFaction(body.Faction) || body.Team > 4 || body.Color > 8 || body.Name != nil && (len(*body.Name) > 80 || storage.PlainText(*body.Name, 80) != nil) {
		fail(w, 400, "invalid_lobby", "Check the faction, team, color and plain-text lobby name.")
		return
	}
	if body.Rules != nil && *body.Rules != standardLobbyRules() {
		fail(w, 400, "unsupported_rules", "This host supports standard-v2 gameplay rules only.")
		return
	}
	var m content.Map
	if body.MapID != "" {
		var err error
		m, err = s.loadMap(r.Context(), body.MapID)
		if err != nil {
			fail(w, 400, "map_missing", "Choose an installed or validated custom map.")
			return
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil || l.MatchID != "" {
		fail(w, 409, "lobby_unavailable", "The lobby is unavailable or has started.")
		return
	}
	if !lobbyMember(l, p.ID) {
		fail(w, 403, "not_in_lobby", "Join the lobby first.")
		return
	}
	if l.ScenarioID != "" && (body.MapID != "" || body.Team != 0 || body.Faction != "" || body.Rules != nil) {
		fail(w, 409, "scenario_rules_locked", "The scenario fixes factions, teams and map.")
		return
	}
	if l.ResumeSave != "" && body.Color != 0 {
		fail(w, 409, "scenario_rules_locked", "Saved player colors are fixed by the checkpoint.")
		return
	}
	if l.Rated && (body.MapID != "" || body.Team != 0 || body.Private != nil || body.Pause != nil || body.Observers != nil || body.Rules != nil) {
		fail(w, 409, "ranked_rules_locked", "The ranked map, opposing teams and gameplay policy are fixed.")
		return
	}
	if (body.MapID != "" || body.Name != nil || body.Private != nil || body.Pause != nil || body.Observers != nil || body.Rules != nil) && l.Host != p.ID {
		fail(w, 403, "host_required", "Only the host may change lobby settings.")
		return
	}
	if body.MapID != "" && len(m.Spawns) < len(l.Slots) {
		fail(w, 409, "map_capacity", "Choose a map with enough slots for every participant.")
		return
	}
	next := *l
	next.Slots = append([]LobbySlot(nil), l.Slots...)
	if body.MapID != "" {
		next.MapID, next.MapVersion, next.MapHash = m.ID, m.Version, lobbyMapHash(m)
		next.mapData = &m
	}
	if body.Name != nil {
		next.Name = *body.Name
	}
	if body.Private != nil {
		next.Private = *body.Private
		if !next.Private {
			next.LiveObservers = false
		}
	}
	if body.Pause != nil {
		next.PauseEnabled = *body.Pause
	}
	if body.Observers != nil {
		next.LiveObservers = *body.Observers
	}
	if next.LiveObservers && !next.Private || next.PauseEnabled && next.Mode != "custom" && next.Mode != "coop" {
		fail(w, 400, "invalid_lobby_policy", "Live observers require a private lobby; shared pause requires custom or co-op mode.")
		return
	}
	if _, installed := s.maps[next.MapID]; !installed && !s.mapHostAllowed(w, r, next.MapID, next.Host, next.Private, next.Mode) {
		return
	}
	for i, slot := range next.Slots {
		if slot.Profile == p.ID {
			if body.Faction != "" {
				next.Slots[i].Faction = body.Faction
			}
			if body.Team != 0 && l.Mode != "ffa" {
				next.Slots[i].Team = body.Team
			}
			if body.Color != 0 {
				next.Slots[i].Color, ok = lobbyColor(l, body.Color, slot.Player)
				if !ok {
					fail(w, 409, "color_unavailable", "Choose an unused player color.")
					return
				}
			}
		}
	}
	if !reflect.DeepEqual(*l, next) {
		*l = next
		resetReady(l)
	}
	respond(w, 200, s.lobbyResponse(l, p.ID))
}
