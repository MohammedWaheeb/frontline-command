package server

import (
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func (s *Server) loadMissions() error {
	s.missions = map[string]content.Mission{}
	return filepath.WalkDir(s.cfg.MissionDir, func(path string, d fs.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".json" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var meta struct {
			MapID string `json:"map_id"`
		}
		if err = json.Unmarshal(data, &meta); err != nil {
			return err
		}
		m, ok := s.maps[meta.MapID]
		if !ok {
			return errors.New("installed mission references an unavailable map")
		}
		mission, err := content.DecodeMission(data, s.catalog, m)
		if err != nil {
			return err
		}
		if _, exists := s.missions[mission.ID]; exists {
			return errors.New("duplicate mission ID")
		}
		s.missions[mission.ID] = mission
		return nil
	})
}
func (s *Server) listMissions(w http.ResponseWriter, r *http.Request) {
	list := []map[string]any{}
	for _, m := range s.missions {
		list = append(list, map[string]any{"id": m.ID, "title": m.Title, "version": m.Version, "map_id": m.MapID, "faction": m.Faction, "mode": m.Mode, "briefing": m.Briefing, "rules_notice": m.RulesNotice})
	}
	sort.Slice(list, func(i, j int) bool { return list[i]["id"].(string) < list[j]["id"].(string) })
	respond(w, 200, list)
}
func (s *Server) getMission(w http.ResponseWriter, r *http.Request) {
	m, ok := s.missions[r.PathValue("id")]
	if !ok {
		fail(w, 404, "mission_missing", "Install this mission's content pack first.")
		return
	}
	respond(w, 200, m)
}
func (s *Server) createScenarioLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	mission, ok := s.missions[r.PathValue("id")]
	if !ok || mission.Mode != "coop" {
		fail(w, 400, "coop_scenario_required", "Choose an installed co-op scenario.")
		return
	}
	var body struct {
		Difficulty string `json:"difficulty"`
		AllyAI     string `json:"ally_ai"`
		Private    bool   `json:"private"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if body.Difficulty == "" {
		body.Difficulty = "normal"
	}
	validAI := func(v string) bool { return v == "easy" || v == "normal" || v == "hard" }
	if !validAI(body.Difficulty) || body.AllyAI != "" && !validAI(body.AllyAI) {
		fail(w, 400, "invalid_difficulty", "Choose easy, normal or hard.")
		return
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create scenario lobby.")
		return
	}
	code, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create scenario lobby.")
		return
	}
	l := &Lobby{ID: id[:24], Host: p.ID, Name: mission.Title, MapID: mission.MapID, Mode: "coop", Private: body.Private, Code: code[:12], Created: time.Now().Unix(), ScenarioID: mission.ID, Difficulty: body.Difficulty}
	hostAdded := false
	for i, mp := range mission.Players {
		slot := LobbySlot{Player: sim.PlayerID(mp.ID), Name: mp.Name, Faction: mp.Faction, Team: mp.Team, AI: mp.AI, Script: mp.Control(i) == "script"}
		if mp.Control(i) == "human" {
			if !hostAdded {
				slot.Profile = p.ID
				slot.Name = p.Name
				hostAdded = true
			} else if body.AllyAI != "" {
				slot.AI = body.AllyAI
			} else {
				continue
			}
		}
		slot.Ready = slot.AI != "" || slot.Script
		slot.AssetsReady = slot.Ready
		l.Slots = append(l.Slots, slot)
	}
	if !hostAdded {
		fail(w, 400, "invalid_scenario", "The scenario needs a human slot.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	if len(s.lobbies) >= 64 {
		fail(w, 429, "lobby_limit", "The local host is full.")
		return
	}
	s.lobbies[l.ID] = l
	respond(w, 201, s.lobbyResponse(l, p.ID))
}

func (s *Server) scenarioJoinSlot(l *Lobby, p storage.Profile) (LobbySlot, bool) {
	mission, ok := s.missions[l.ScenarioID]
	if !ok {
		return LobbySlot{}, false
	}
	for i, mp := range mission.Players {
		if mp.Control(i) != "human" {
			continue
		}
		free := true
		for _, slot := range l.Slots {
			if uint32(slot.Player) == mp.ID {
				free = false
			}
		}
		if free {
			return LobbySlot{Player: sim.PlayerID(mp.ID), Profile: p.ID, Name: p.Name, Faction: mp.Faction, Team: mp.Team}, true
		}
	}
	return LobbySlot{}, false
}
func (s *Server) scenarioEngine(l *Lobby, m content.Map, seed uint64) (*sim.Engine, error) {
	if l.ResumeSave != "" {
		save, err := s.repo.GetSave(context.Background(), l.ResumeOwner, l.ResumeSave)
		if err != nil || save.Revision != l.ResumeRevision {
			return nil, errors.New("checkpoint changed; create a fresh resume lobby")
		}
		engine, err := sim.Restore(s.catalog, save.Data)
		if err != nil {
			return nil, err
		}
		state := engine.StateCopy()
		if state.Mission == nil || state.Mission.Definition.Mode != "coop" || state.Outcome.Finished || state.Map.ID != m.ID || state.Map.Version != m.Version {
			return nil, errors.New("checkpoint does not match the installed scenario/map")
		}
		if len(state.Players) != len(l.Slots) {
			return nil, errors.New("fill every saved human slot before resuming")
		}
		for _, player := range state.Players {
			found := false
			for _, slot := range l.Slots {
				if slot.Player == player.ID && slot.Faction == player.Faction && slot.Team == player.Team && slot.AI == player.AI && slot.Script == (player.Controller == "script") {
					found = true
				}
			}
			if !found {
				return nil, errors.New("checkpoint player configuration mismatch")
			}
		}
		return engine, nil
	}
	mission, ok := s.missions[l.ScenarioID]
	if !ok {
		return nil, errors.New("mission missing")
	}
	data, _ := json.Marshal(mission)
	mission = content.Mission{}
	_ = json.Unmarshal(data, &mission)
	if len(l.Slots) != len(mission.Players) {
		return nil, errors.New("fill every scenario slot with a player or AI ally")
	}
	for i, mp := range mission.Players {
		found := false
		for _, slot := range l.Slots {
			if uint32(slot.Player) == mp.ID {
				mission.Players[i].Name = slot.Name
				mission.Players[i].AI = slot.AI
				mission.Players[i].Controller = "human"
				if slot.Script {
					mission.Players[i].Controller = "script"
				} else if slot.AI != "" {
					mission.Players[i].Controller = "ai"
				}
				found = true
			}
		}
		if !found {
			return nil, errors.New("scenario player slot missing")
		}
	}
	return sim.NewMission(s.catalog, m, mission, l.Difficulty, seed)
}

func (s *Server) resumeScenarioLobby(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Player  uint32 `json:"player"`
		Private bool   `json:"private"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	save, err := s.repo.GetSave(r.Context(), p.ID, r.PathValue("id"))
	if err != nil {
		fail(w, 404, "save_missing", "This checkpoint is not in your profile.")
		return
	}
	engine, err := sim.Restore(s.catalog, save.Data)
	if err != nil {
		fail(w, 409, "incompatible_checkpoint", err.Error())
		return
	}
	state := engine.StateCopy()
	if state.Mission == nil || state.Mission.Definition.Mode != "coop" || state.Outcome.Finished {
		fail(w, 400, "coop_checkpoint_required", "Choose an unfinished co-op checkpoint.")
		return
	}
	mission, installed := s.missions[state.Mission.Definition.ID]
	m, mapInstalled := s.maps[state.Map.ID]
	if !installed || !mapInstalled || m.Version != state.Map.Version || mission.Version != state.Mission.Definition.Version {
		fail(w, 409, "checkpoint_content_missing", "Install the matching mission/map version. The checkpoint is preserved for export.")
		return
	}
	if body.Player == 0 {
		for _, player := range state.Players {
			if player.Controller == "human" {
				body.Player = uint32(player.ID)
				break
			}
		}
	}
	id, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create resume lobby.")
		return
	}
	code, err := storage.Token()
	if err != nil {
		fail(w, 500, "random_error", "Could not create resume lobby.")
		return
	}
	l := &Lobby{ID: id[:24], Name: mission.Title, Host: p.ID, MapID: m.ID, Mode: "coop", Private: body.Private, Code: code[:12], Created: time.Now().Unix(), ScenarioID: mission.ID, Difficulty: state.Mission.Difficulty, ResumeSave: save.ID, ResumeOwner: p.ID, ResumeRevision: save.Revision, ResumeTick: uint32(state.Tick)}
	found := false
	for _, player := range state.Players {
		slot := LobbySlot{Player: player.ID, Name: player.Name, Faction: player.Faction, Team: player.Team, AI: player.AI, Script: player.Controller == "script"}
		if player.Controller == "human" {
			if uint32(player.ID) != body.Player {
				continue
			}
			slot.Profile = p.ID
			found = true
		}
		slot.Ready = slot.AI != "" || slot.Script
		slot.AssetsReady = slot.Ready
		l.Slots = append(l.Slots, slot)
	}
	if !found {
		fail(w, 400, "human_slot_required", "Select a human commander from the checkpoint.")
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLobbies()
	if len(s.lobbies) >= 64 {
		fail(w, 429, "lobby_limit", "The local host is full.")
		return
	}
	s.lobbies[l.ID] = l
	respond(w, 201, s.lobbyResponse(l, p.ID))
}
