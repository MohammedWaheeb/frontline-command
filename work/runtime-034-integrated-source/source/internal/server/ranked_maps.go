package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"frontlinecommand/pkg/content"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
)

// The review list is host-installed data, never a field accepted from a map
// upload. Hashes cover the normalized complete map, not just its public ID.
func lobbyMapHash(m content.Map) string {
	data, _ := json.Marshal(m)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func (s *Server) loadRankedMaps() error {
	s.rankedMaps = map[string]string{}
	path := s.cfg.RankedMapsFile
	if path == "" {
		path = filepath.Join(filepath.Dir(s.cfg.MapDir), "ranked-maps.json")
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 16385))
	if err != nil {
		return err
	}
	if len(data) > 16384 {
		return errors.New("ranked map review list exceeds 16 KiB")
	}
	var manifest struct {
		Version uint32 `json:"format_version"`
		Maps    []struct {
			ID   string `json:"id"`
			Hash string `json:"hash"`
		} `json:"maps"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&manifest); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("trailing ranked map review data")
	}
	if manifest.Version != 1 || len(manifest.Maps) > 8 {
		return errors.New("ranked review list requires format_version 1 and at most eight maps")
	}
	for _, reviewed := range manifest.Maps {
		m, exists := s.maps[reviewed.ID]
		if !exists || len(m.Spawns) != 2 || m.Ruleset != "standard-v2" || len(reviewed.Hash) != 64 || reviewed.Hash != lobbyMapHash(m) || s.rankedMaps[reviewed.ID] != "" {
			return fmt.Errorf("ranked map %s is missing, duplicated, nonstandard, or does not match its reviewed hash", reviewed.ID)
		}
		s.rankedMaps[reviewed.ID] = reviewed.Hash
	}
	return nil
}
func (s *Server) rankedMap(id string) bool {
	m, ok := s.maps[id]
	return ok && len(m.Spawns) == 2 && m.Ruleset == "standard-v2" && s.rankedMaps[id] != "" && s.rankedMaps[id] == lobbyMapHash(m)
}
func (s *Server) listRankedMaps(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.authenticate(w, r); !ok {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	maps := []map[string]any{}
	for id, m := range s.maps {
		if s.rankedMap(id) {
			maps = append(maps, map[string]any{"id": id, "title": m.Title, "version": m.Version, "hash": s.rankedMaps[id], "players": 2})
		}
	}
	sort.Slice(maps, func(i, j int) bool { return maps[i]["id"].(string) < maps[j]["id"].(string) })
	respond(w, 200, map[string]any{"maps": maps, "selection": "pre_queue_allowlist", "region": "local", "local": true, "rules": standardLobbyRules()})
}
