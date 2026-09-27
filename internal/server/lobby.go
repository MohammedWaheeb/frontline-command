package server

import (
	"crypto/rand"
	"encoding/binary"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"net/http"
	"time"
)

type aiRequest struct {
	Faction    string `json:"faction"`
	Difficulty string `json:"difficulty"`
	Team       uint32 `json:"team"`
}

func resolveFaction(f string) string {
	if f == "random" {
		var b [1]byte
		if _, err := rand.Read(b[:]); err != nil {
			return ""
		}
		return []string{"US", "IR", "SY", "SA"}[b[0]%4]
	}
	return f
}
func (s *Server) lobbyResponse(l *Lobby, profile string) map[string]any {
	result := map[string]any{"lobby": l}
	if l.Host == profile {
		result["code"] = l.Code
	}
	if m := s.matches[l.MatchID]; m != nil {
		for _, slot := range m.slots {
			if slot.Profile == profile {
				result["connection"] = map[string]any{"match_id": m.id, "player": slot.Player, "token": slot.Token, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash()}
				break
			}
		}
	}
	return result
}
func (s *Server) listLobbies(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []*Lobby{}
	for _, l := range s.lobbies {
		member := false
		for _, slot := range l.Slots {
			if slot.Profile == p.ID {
				member = true
			}
		}
		if (!l.Private || member) && l.MatchID == "" {
			out = append(out, l)
		}
	}
	respond(w, 200, out)
}
func (s *Server) createLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		LiveObservers bool        `json:"live_observers"`
		PauseEnabled  bool        `json:"pause_enabled"`
		Name          string      `json:"name"`
		MapID         string      `json:"map_id"`
		Mode          string      `json:"mode"`
		Private       bool        `json:"private"`
		Faction       string      `json:"faction"`
		Team          uint32      `json:"team"`
		AI            []aiRequest `json:"ai"`
	}
	if !decode(w, r, &body, 8192) {
		return
	}
	m, err := s.loadMap(r.Context(), body.MapID)
	if err != nil {
		fail(w, 400, "map_missing", "Choose an installed or validated custom map.")
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if !content.ValidFaction(body.Faction) || len(body.Name) > 80 || len(body.AI) > 3 || len(body.AI)+1 > len(m.Spawns) {
		fail(w, 400, "invalid_lobby", "Check faction, name and player count.")
		return
	}
	switch body.Mode {
	case "1v1", "2v2", "ffa", "coop", "custom":
	default:
		fail(w, 400, "invalid_mode", "Choose 1v1, 2v2, ffa, coop or custom for local play.")
		return
	}
	if body.Team == 0 || body.Mode == "ffa" {
		body.Team = 1
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create lobby.")
		return
	}
	code, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create lobby.")
		return
	}
	l := &Lobby{PauseEnabled: body.PauseEnabled && (body.Mode == "custom" || body.Mode == "coop"), LiveObservers: body.LiveObservers && body.Private, ID: id[:24], Name: body.Name, Host: p.ID, MapID: m.ID, Mode: body.Mode, Private: body.Private, Code: code[:12], Created: time.Now().Unix(), Slots: []LobbySlot{{Player: 1, Profile: p.ID, Name: p.Name, Faction: body.Faction, Team: body.Team}}}
	for i, a := range body.AI {
		a.Faction = resolveFaction(a.Faction)
		if !content.ValidFaction(a.Faction) || (a.Difficulty != "easy" && a.Difficulty != "normal" && a.Difficulty != "hard") {
			fail(w, 400, "invalid_ai", "Choose a faction and easy, normal or hard AI.")
			return
		}
		if a.Team == 0 || body.Mode == "ffa" {
			a.Team = uint32(i + 2)
		}
		l.Slots = append(l.Slots, LobbySlot{Player: sim.PlayerID(i + 2), Name: a.Difficulty + " AI", Faction: a.Faction, Team: a.Team, AI: a.Difficulty, Ready: true, AssetsReady: true})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	if len(s.lobbies) >= 64 {
		fail(w, 429, "lobby_limit", "This local host has reached its lobby limit.")
		return
	}
	s.lobbies[l.ID] = l
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
func (s *Server) getLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil {
		fail(w, 404, "lobby_missing", "This lobby is no longer available.")
		return
	}
	member := false
	for _, slot := range l.Slots {
		if slot.Profile == p.ID {
			member = true
		}
	}
	if l.Private && !member {
		fail(w, 403, "private_lobby", "Join this private lobby with its code.")
		return
	}
	respond(w, 200, s.lobbyResponse(l, p.ID))
}
func (s *Server) joinLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Code    string `json:"code"`
		Faction string `json:"faction"`
		Team    uint32 `json:"team"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if body.Faction != "" && !content.ValidFaction(body.Faction) {
		fail(w, 400, "invalid_faction", "Choose a valid faction.")
		return
	}
	s.mu.Lock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil {
		s.mu.Unlock()
		fail(w, 404, "lobby_missing", "This lobby is no longer available.")
		return
	}
	mapID := l.MapID
	s.mu.Unlock()
	m, err := s.loadMap(r.Context(), mapID)
	if err != nil {
		fail(w, 404, "map_missing", "Lobby map unavailable.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l = s.lobbies[r.PathValue("id")]
	if l == nil || l.MapID != mapID {
		fail(w, 409, "lobby_changed", "Lobby changed; reload it.")
		return
	}
	if l.Private && l.Code != body.Code {
		fail(w, 403, "invalid_code", "The private lobby code is incorrect.")
		return
	}
	if l.Rated {
		fail(w, 403, "queue_members_only", "A matched lobby is reserved for its two queued players.")
		return
	}
	for _, slot := range l.Slots {
		if slot.Profile == p.ID {
			respond(w, 200, s.lobbyResponse(l, p.ID))
			return
		}
	}
	if l.MatchID != "" || len(l.Slots) >= len(m.Spawns) || len(l.Slots) >= 4 {
		fail(w, 409, "lobby_full", "The lobby is full or has started.")
		return
	}
	if l.ScenarioID != "" {
		slot, ok := s.scenarioJoinSlot(l, p)
		if !ok {
			fail(w, 409, "scenario_full", "Every human scenario slot is filled.")
			return
		}
		l.Slots = append(l.Slots, slot)
		resetReady(l)
		respond(w, 200, s.lobbyResponse(l, p.ID))
		return
	}
	if !content.ValidFaction(body.Faction) {
		fail(w, 400, "invalid_faction", "Choose a valid faction.")
		return
	}
	id := nextLobbyPlayer(l)
	if body.Team == 0 || l.Mode == "ffa" {
		body.Team = uint32(id)
	}
	l.Slots = append(l.Slots, LobbySlot{Player: id, Profile: p.ID, Name: p.Name, Faction: body.Faction, Team: body.Team})
	resetReady(l)
	respond(w, 200, s.lobbyResponse(l, p.ID))
}
func resetReady(l *Lobby) {
	for i := range l.Slots {
		l.Slots[i].Ready = l.Slots[i].AI != "" || l.Slots[i].Script
		l.Slots[i].AssetsReady = l.Slots[i].Ready
	}
}
func (s *Server) updateLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Faction string `json:"faction"`
		Team    uint32 `json:"team"`
		MapID   string `json:"map_id"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if body.Faction != "" {
		body.Faction = resolveFaction(body.Faction)
		if !content.ValidFaction(body.Faction) {
			fail(w, 400, "invalid_faction", "Choose a valid faction.")
			return
		}
	}
	var mapData content.Map
	if body.MapID != "" {
		var err error
		mapData, err = s.loadMap(r.Context(), body.MapID)
		if err != nil {
			fail(w, 400, "map_missing", "Choose a validated map.")
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
	member := false
	if l.ScenarioID != "" && (body.MapID != "" || body.Team != 0 || body.Faction != "") {
		fail(w, 409, "scenario_rules_locked", "The scenario fixes factions, teams and map.")
		return
	}
	if l.Rated && (body.MapID != "" || body.Team != 0) {
		fail(w, 409, "ranked_rules_locked", "Matched map and opposing teams are fixed.")
		return
	}
	if body.MapID != "" && (l.Host != p.ID || len(mapData.Spawns) < len(l.Slots)) {
		fail(w, 403, "host_or_capacity", "Only the host may choose a map that fits every player.")
		return
	}
	for i, slot := range l.Slots {
		if slot.Profile == p.ID {
			member = true
			if body.Faction != "" {
				l.Slots[i].Faction = body.Faction
			}
			if body.Team > 0 && l.Mode != "ffa" {
				l.Slots[i].Team = body.Team
			}
		}
	}
	if !member {
		fail(w, 403, "not_in_lobby", "Join the lobby first.")
		return
	}
	if body.MapID != "" {
		if l.Host != p.ID || len(mapData.Spawns) < len(l.Slots) {
			fail(w, 403, "host_or_capacity", "Only the host may choose a map that fits every player.")
			return
		}
		l.MapID = body.MapID
	}
	resetReady(l)
	respond(w, 200, s.lobbyResponse(l, p.ID))
}
func (s *Server) readyLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Ready       bool   `json:"ready"`
		AssetsReady bool   `json:"assets_ready"`
		Protocol    uint32 `json:"protocol"`
		Simulation  string `json:"simulation"`
		ContentHash string `json:"content_hash"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if body.Ready && (!body.AssetsReady || body.Protocol != 1 || body.Simulation != sim.Version || body.ContentHash != s.catalog.Hash()) {
		fail(w, 409, "content_not_ready", "Load matching game content and required assets before readying.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil || l.MatchID != "" {
		fail(w, 409, "lobby_unavailable", "Lobby unavailable or already started.")
		return
	}
	for i, slot := range l.Slots {
		if slot.Profile == p.ID {
			l.Slots[i].Ready = body.Ready
			l.Slots[i].AssetsReady = body.AssetsReady
			respond(w, 200, s.lobbyResponse(l, p.ID))
			return
		}
	}
	fail(w, 403, "not_in_lobby", "Join the lobby first.")
}
func (s *Server) startLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	l := s.lobbies[r.PathValue("id")]
	if l == nil || l.Host != p.ID {
		s.mu.Unlock()
		fail(w, 403, "host_required", "Only the lobby host may start.")
		return
	}
	mapID := l.MapID
	s.mu.Unlock()
	mapData, err := s.loadMap(r.Context(), mapID)
	if err != nil {
		fail(w, 400, "map_missing", "Lobby map unavailable.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.lobbies[l.ID] != l || l.MapID != mapID || l.MatchID != "" {
		fail(w, 409, "lobby_changed", "Reload the lobby before starting.")
		return
	}
	if len(l.Slots) < 2 {
		fail(w, 409, "players_required", "Add another player or AI opponent.")
		return
	}
	teams := map[uint32]int{}
	for _, slot := range l.Slots {
		if !slot.Ready || !slot.AssetsReady {
			fail(w, 409, "players_not_ready", "Every player must finish loading and ready up.")
			return
		}
		teams[slot.Team]++
	}
	if len(teams) < 2 && l.ScenarioID == "" {
		fail(w, 409, "opponent_required", "At least two opposing teams are required.")
		return
	}
	if l.Mode == "1v1" && len(l.Slots) != 2 || l.Mode == "2v2" && (len(l.Slots) != 4 || len(teams) != 2) {
		fail(w, 409, "invalid_teams", "The player and team counts do not match the selected mode.")
		return
	}
	if l.Mode == "ffa" && (len(l.Slots) < 3 || len(teams) != len(l.Slots)) {
		fail(w, 409, "invalid_teams", "Free-for-all requires three or four separate teams.")
		return
	}
	if l.Mode == "2v2" {
		for _, n := range teams {
			if n != 2 {
				fail(w, 409, "invalid_teams", "Each team needs two players.")
				return
			}
		}
	}
	var seedBytes [8]byte
	if _, err = rand.Read(seedBytes[:]); err != nil {
		fail(w, 500, "random_error", "Could not initialize match.")
		return
	}
	cfg := sim.Config{Map: mapData, Seed: binary.LittleEndian.Uint64(seedBytes[:]), Ruleset: "standard-v2"}
	slots := []slot{}
	for _, v := range l.Slots {
		cfg.Players = append(cfg.Players, sim.PlayerConfig{ID: v.Player, Name: v.Name, Faction: v.Faction, Team: v.Team, AI: v.AI})
		token, err := storage.Token()
		if err != nil {
			fail(w, 500, "random_error", "Could not initialize match.")
			return
		}
		slots = append(slots, slot{Player: v.Player, Profile: v.Profile, Token: token, AI: v.AI != "" || v.Script})
	}
	engine, err := sim.New(s.catalog, cfg)
	if l.ScenarioID != "" {
		engine, err = s.scenarioEngine(l, mapData, cfg.Seed)
	}
	if err != nil {
		fail(w, 400, "invalid_match", err.Error())
		return
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not initialize match.")
		return
	}
	l.MatchID = id[:24]
	match, err := newMatch(l.MatchID, engine, slots, s.repo, s.objects, matchOptions{PauseEnabled: l.PauseEnabled, LiveObservers: l.LiveObservers, Rated: l.Rated})
	if err != nil {
		l.MatchID = ""
		fail(w, 500, "match_persistence_failed", "Could not create a durable match record.")
		return
	}
	s.matches[l.MatchID] = match
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
