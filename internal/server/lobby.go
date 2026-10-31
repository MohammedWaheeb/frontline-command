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
	Spawn      uint32 `json:"spawn"`
	Color      uint32 `json:"color"`
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
	now := time.Now()
	noteLobbyHost(l, profile, now)
	completeLobbyMetadata(l)
	if l.MapHash == "" {
		if m, ok := s.maps[l.MapID]; ok {
			l.MapHash, l.MapVersion = lobbyMapHash(m), m.Version
		}
	}
	result := map[string]any{"lobby": l, "host_offline": !lobbyHostAvailable(l, now)}
	if l.ResumeSave != "" {
		// Opening checkpoints are valid at tick0. Preserve that explicit
		// value while ordinary/fresh lobbies keep their omitted field.
		result["lobby"] = struct {
			*Lobby
			ResumeTick uint32 `json:"resume_tick"`
		}{Lobby: l, ResumeTick: l.ResumeTick}
	}
	result["state"] = "forming"
	if l.MatchID != "" {
		result["state"] = "active"
		if s.lobbyCompleted(l) {
			result["state"] = "completed"
		}
	}
	if l.Host == profile {
		result["code"] = l.Code
	}
	if m := s.matches[l.MatchID]; m != nil {
		result["start_remaining_ms"] = m.startRemainingMs()
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
	s.pruneLobbies()
	out := []*Lobby{}
	for _, l := range s.lobbies {
		member := false
		for _, slot := range l.Slots {
			if slot.Profile == p.ID {
				member = true
			}
		}
		if (!l.Private || member) && l.MatchID == "" && lobbyHostAvailable(l, time.Now()) {
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
		Spawn         uint32      `json:"spawn"`
		Color         uint32      `json:"color"`
		Rules         *LobbyRules `json:"rules"`
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
	s.mapMu.RLock()
	defer s.mapMu.RUnlock()
	m, err := s.loadMap(r.Context(), body.MapID)
	if err != nil {
		fail(w, 400, "map_missing", "Choose an installed or validated custom map.")
		return
	}
	s.mu.Lock()
	_, installed := s.maps[body.MapID]
	s.mu.Unlock()
	if !installed && !s.mapHostAllowed(w, r, body.MapID, p.ID, body.Private, body.Mode) {
		return
	}
	if body.Spawn > uint32(len(m.Spawns)) {
		fail(w, 400, "invalid_spawn", "Choose a starting position on this map.")
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if body.Name == "" {
		body.Name = "Local match"
	}
	if body.Team > 4 || body.Color > 8 || storage.PlainText(body.Name, 80) != nil || !content.ValidFaction(body.Faction) || len(body.Name) > 80 || len(body.AI) > 3 || len(body.AI)+1 > len(m.Spawns) || body.Mode == "1v1" && len(body.AI) > 1 {
		fail(w, 400, "invalid_lobby", "Check faction, name and player count.")
		return
	}
	switch body.Mode {
	case "1v1", "2v2", "ffa", "coop", "custom":
	default:
		fail(w, 400, "invalid_mode", "Choose 1v1, 2v2, ffa, coop or custom for local play.")
		return
	}
	rules, _, rulesErr := normalizedLobbyRules(&Lobby{Mode: body.Mode, Private: body.Private}, body.Rules)
	if rulesErr != nil {
		fail(w, 400, rulesErr.code, rulesErr.message)
		return
	}
	if body.LiveObservers && !body.Private || body.PauseEnabled && body.Mode != "custom" && body.Mode != "coop" {
		fail(w, 400, "invalid_lobby_policy", "Live observers require a private lobby; shared pause requires custom or co-op mode.")
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
	l := &Lobby{MapHash: lobbyMapHash(m), MapVersion: m.Version, Rules: &rules, PauseEnabled: body.PauseEnabled && (body.Mode == "custom" || body.Mode == "coop"), LiveObservers: body.LiveObservers && body.Private, ID: id[:24], Name: body.Name, Host: p.ID, MapID: m.ID, Mode: body.Mode, Private: body.Private, Code: code[:12], Created: time.Now().Unix(), Slots: []LobbySlot{{Spawn: body.Spawn, Color: body.Color, Player: 1, Profile: p.ID, Name: p.Name, Faction: body.Faction, Team: body.Team}}}
	l.mapData = &m
	for i, a := range body.AI {
		if a.Spawn > uint32(len(m.Spawns)) {
			fail(w, 400, "invalid_spawn", "Choose a starting position on this map.")
			return
		}
		a.Faction = resolveFaction(a.Faction)
		if a.Team > 4 || a.Color > 8 || !content.ValidFaction(a.Faction) || (a.Difficulty != "easy" && a.Difficulty != "normal" && a.Difficulty != "hard") {
			fail(w, 400, "invalid_ai", "Choose a faction and easy, normal or hard AI.")
			return
		}
		if a.Team == 0 || body.Mode == "ffa" {
			a.Team = lobbyDefaultTeam(l)
		}
		l.Slots = append(l.Slots, LobbySlot{Spawn: a.Spawn, Color: a.Color, Player: sim.PlayerID(i + 2), Name: a.Difficulty + " AI", Faction: a.Faction, Team: a.Team, AI: a.Difficulty, Ready: true, AssetsReady: true})
	}
	if !assignLobbySpawns(l, len(m.Spawns)) {
		fail(w, 409, "spawn_unavailable", "Choose an unused starting position on this map.")
		return
	}
	if !assignLobbyColors(l) {
		fail(w, 409, "color_unavailable", "Choose unique player colors.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	if !s.admitProfile(w, p.ID, "") {
		return
	}
	if len(s.lobbies) >= s.lobbyLimit() {
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
	s.pruneLobbies()
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

type lobbyJoinRequest struct {
	Spawn   uint32 `json:"spawn"`
	Code    string `json:"code"`
	Faction string `json:"faction"`
	Team    uint32 `json:"team"`
	Color   uint32 `json:"color"`
}

func (s *Server) joinLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body lobbyJoinRequest
	if !decode(w, r, &body, 4096) {
		return
	}
	s.joinLobbyAs(w, r, p, body, "")
}
func (s *Server) joinLobbyAs(w http.ResponseWriter, r *http.Request, p storage.Profile, body lobbyJoinRequest, inviteID string) {
	automaticFaction := body.Faction == "random"
	if body.Team > 4 || body.Color > 8 {
		fail(w, 400, "invalid_lobby", "Choose a valid team and color.")
		return
	}
	body.Faction = resolveFaction(body.Faction)
	if body.Faction != "" && !content.ValidFaction(body.Faction) {
		fail(w, 400, "invalid_faction", "Choose a valid faction.")
		return
	}
	s.mu.Lock()
	s.pruneLobbies()
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
	// Membership is authenticated by the profile token. Repeated joins, including
	// ranked joins and reconnects, need neither another code nor another slot.
	if lobbyMember(l, p.ID) {
		respond(w, 200, s.lobbyResponse(l, p.ID))
		return
	}
	var acceptedInvite *LobbyInvite
	if inviteID != "" {
		var allowed bool
		var err error
		acceptedInvite, allowed, err = s.validLobbyInvite(r.Context(), inviteID, p.ID, l)
		if err != nil {
			fail(w, 500, "storage_error", "Could not check invitation.")
			return
		}
		if !allowed {
			fail(w, 403, "invite_unavailable", "The invitation is no longer available.")
			return
		}
	}
	if l.Private && !secretEqual(l.Code, body.Code) && acceptedInvite == nil {
		fail(w, 403, "invalid_code", "The private lobby code is incorrect.")
		return
	}
	if !lobbyHostAvailable(l, time.Now()) {
		fail(w, 409, "lobby_host_offline", "The lobby host is disconnected. Ask them to return or choose another game.")
		return
	}
	if l.Rated {
		fail(w, 403, "queue_members_only", "A matched lobby is reserved for its two queued players.")
		return
	}
	if l.MatchID != "" || len(l.Slots) >= lobbyMapCapacity(l, m) {
		fail(w, 409, "lobby_full", "The lobby is full or has started.")
		return
	}
	s.pruneLobbies()
	if s.lobbies[l.ID] != l {
		fail(w, 409, "lobby_changed", "This lobby expired; choose another lobby.")
		return
	}
	allowed, pairErr := s.allowedLobbyPair(r.Context(), l, p.ID)
	if pairErr != nil {
		fail(w, 500, "storage_error", "Could not check lobby access.")
		return
	}
	if !allowed {
		fail(w, 403, "lobby_membership_blocked", "This lobby is unavailable under local block preferences.")
		return
	}
	if !s.admitProfile(w, p.ID, l.ID) {
		return
	}
	if l.ScenarioID != "" {
		// Generic invite dialogs call an automatic faction "random". For an
		// authored scenario, Auto means its fixed commander, not a reroll.
		if automaticFaction {
			body.Faction = ""
		}
		if body.Spawn != 0 {
			fail(w, 409, "scenario_rules_locked", "The scenario fixes starting positions.")
			return
		}
		slot, ok := s.scenarioJoinSlot(l, p)
		if !ok {
			fail(w, 409, "scenario_full", "Every human scenario slot is filled.")
			return
		}
		if body.Faction != "" && body.Faction != slot.Faction || body.Team != 0 && body.Team != slot.Team {
			fail(w, 409, "scenario_rules_locked", "The scenario fixes factions and teams.")
			return
		}
		desiredColor := body.Color
		if l.ResumeSave != "" {
			if body.Color != 0 && body.Color != slot.Color {
				fail(w, 409, "scenario_rules_locked", "Saved player colors are fixed by the checkpoint.")
				return
			}
			desiredColor = slot.Color
		}
		slot.Color, ok = lobbyColor(l, desiredColor, 0)
		if !ok {
			fail(w, 409, "color_unavailable", "Choose an unused player color.")
			return
		}
		l.Slots = append(l.Slots, slot)
		if acceptedInvite != nil {
			acceptedInvite.Accepted = true
		}
		resetReady(l)
		respond(w, 200, s.lobbyResponse(l, p.ID))
		return
	}
	// A private invite may not expose scenario type until admission. Omission
	// preserves fixed scenario factions above and resolves ordinary choice here.
	if body.Faction == "" {
		body.Faction = resolveFaction("random")
	}
	if !content.ValidFaction(body.Faction) {
		fail(w, 400, "invalid_faction", "Choose a valid faction.")
		return
	}
	id := nextLobbyPlayer(l)
	if body.Team == 0 || l.Mode == "ffa" {
		body.Team = lobbyDefaultTeam(l)
	}
	completeLobbyMetadata(l)
	if body.Spawn > uint32(len(m.Spawns)) {
		fail(w, 400, "invalid_spawn", "Choose a starting position on this map.")
		return
	}
	spawn, ok := lobbySpawn(l, body.Spawn, 0, len(m.Spawns))
	if !ok {
		fail(w, 409, "spawn_unavailable", "Choose an unused starting position on this map.")
		return
	}
	color, ok := lobbyColor(l, body.Color, 0)
	if !ok {
		fail(w, 409, "color_unavailable", "Choose an unused player color.")
		return
	}
	if acceptedInvite != nil {
		acceptedInvite.Accepted = true
	}
	l.Slots = append(l.Slots, LobbySlot{Spawn: spawn, Color: color, Player: id, Profile: p.ID, Name: p.Name, Faction: body.Faction, Team: body.Team})
	resetReady(l)
	respond(w, 200, s.lobbyResponse(l, p.ID))
}

// resetReady invalidates asset preflight for the previous lobby configuration.
// Readiness alone never changes this revision. Caller holds s.mu.
func resetReady(l *Lobby) {
	completeLobbyMetadata(l)
	l.Revision++
	for i := range l.Slots {
		l.Slots[i].Ready = l.Slots[i].AI != "" || l.Slots[i].Script
		l.Slots[i].AssetsReady = l.Slots[i].Ready
	}
}
func (s *Server) updateLobby(w http.ResponseWriter, r *http.Request) { s.changeLobby(w, r) }
func (s *Server) readyLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		ExpectedRevision uint64 `json:"expected_revision"`
		Ready            bool   `json:"ready"`
		AssetsReady      bool   `json:"assets_ready"`
		Protocol         uint32 `json:"protocol"`
		Simulation       string `json:"simulation"`
		ContentHash      string `json:"content_hash"`
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
			completeLobbyMetadata(l)
			if body.Ready && body.ExpectedRevision != l.Revision {
				fail(w, 409, "lobby_changed", "The lobby changed while assets were loading. Review its current configuration and ready again.")
				return
			}
			l.Slots[i].Ready = body.Ready
			l.Slots[i].AssetsReady = body.Ready && body.AssetsReady
			respond(w, 200, s.lobbyResponse(l, p.ID))
			return
		}
	}
	fail(w, 403, "not_in_lobby", "Join the lobby first.")
}
func (s *Server) startLobby(w http.ResponseWriter, r *http.Request) {
	s.mapMu.RLock()
	defer s.mapMu.RUnlock()
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
	if s.lobbies[l.ID] != l || l.Host != p.ID || l.MapID != mapID || l.MatchID != "" {
		fail(w, 409, "lobby_changed", "Reload the lobby before starting.")
		return
	}
	rules, startingCredits, rulesErr := normalizedLobbyRules(l, l.Rules)
	if rulesErr != nil {
		fail(w, 400, rulesErr.code, rulesErr.message)
		return
	}
	completeLobbyMetadata(l)
	if _, installed := s.maps[l.MapID]; !installed && !s.mapHostAllowed(w, r, l.MapID, l.Host, l.Private, l.Mode) {
		return
	}
	if l.Rated && !s.rankedMap(l.MapID) {
		fail(w, 409, "ranked_map_required", "The installed map no longer matches its reviewed version.")
		return
	}
	if l.MapHash != "" && l.MapHash != lobbyMapHash(mapData) {
		l.MapHash, l.MapVersion = lobbyMapHash(mapData), mapData.Version
		l.mapData = &mapData
		resetReady(l)
		fail(w, 409, "map_changed", "The map changed. Review and load the current version before readying again.")
		return
	}
	l.mapData = &mapData
	if len(l.Slots) < 1 || len(l.Slots) < 2 && l.Mode != "custom" {
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
	if len(teams) < 2 && l.ScenarioID == "" && !(l.Mode == "custom" && len(l.Slots) == 1) {
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
	matchMap, err := lobbyMatchMap(l, mapData)
	if err != nil {
		fail(w, 409, "spawn_unavailable", "Choose unique starting positions on this map.")
		return
	}
	cfg := sim.Config{Map: matchMap, Seed: binary.LittleEndian.Uint64(seedBytes[:]), Ruleset: rules.Ruleset, StartingCredits: startingCredits}
	slots := []slot{}
	for _, v := range l.Slots {
		spawn := uint32(0)
		if l.ScenarioID == "" && l.ResumeSave == "" && l.ResumeTick == 0 && !l.Rated {
			spawn = v.Spawn
		}
		cfg.Players = append(cfg.Players, sim.PlayerConfig{Color: v.Color, ID: v.Player, Name: v.Name, Faction: v.Faction, Team: v.Team, AI: v.AI, Spawn: spawn})
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
	if err == nil && l.ScenarioID != "" && l.ResumeSave == "" {
		colors := map[sim.PlayerID]uint32{}
		for _, v := range l.Slots {
			colors[v.Player] = v.Color
		}
		err = engine.ConfigurePlayerColors(colors)
	}
	if err != nil {
		fail(w, 400, "invalid_match", "This lobby cannot start with the current map and players.")
		return
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not initialize match.")
		return
	}
	l.MatchID = id[:24]
	match, err := newMatch(l.MatchID, engine, slots, s.repo, s.objects, matchOptions{StateUpdatesPerSecond: s.cfg.StateUpdatesPerSecond, RuntimeMetricsEnabled: s.cfg.LoadProfile == Loopback500LoadProfile, PauseEnabled: l.PauseEnabled, LiveObservers: l.LiveObservers, Rated: l.Rated, Lobby: &sim.ReplayLobby{Name: l.Name, Mode: l.Mode, Private: l.Private, LiveObservers: l.LiveObservers, PauseEnabled: l.PauseEnabled, Rated: l.Rated}})
	if err != nil {
		l.MatchID = ""
		fail(w, 500, "match_persistence_failed", "Could not create a durable match record.")
		return
	}
	// Forming readiness pins the installed map; active clients and observers
	// instead load the actual match blueprint, with explicit per-player starts.
	l.MapHash = lobbyMapHash(matchMap)
	s.matches[l.MatchID] = match
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
