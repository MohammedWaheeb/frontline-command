package server

import (
	"net/http"
	"runtime"
	"sort"
	"time"
)

// Only registered for the explicit loopback load profile. Metrics never read
// actor-owned simulation state or invoke actor work while holding the server lock.
func (s *Server) loadMetrics(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	matches := make([]*liveMatch, 0, len(s.matches))
	for _, match := range s.matches {
		matches = append(matches, match)
	}
	lobbies := len(s.lobbies)
	s.mu.Unlock()
	sort.Slice(matches, func(i, j int) bool { return matches[i].id < matches[j].id })
	type row struct {
		MatchID string              `json:"match_id"`
		Metrics MatchRuntimeMetrics `json:"metrics"`
	}
	rows := make([]row, 0, len(matches))
	for _, match := range matches {
		rows = append(rows, row{match.id, match.RuntimeMetrics()})
	}
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	respond(w, 200, map[string]any{
		"profile": s.cfg.LoadProfile, "sampled_at_unix_nano": time.Now().UnixNano(),
		"state_updates_hz": s.cfg.StateUpdatesPerSecond, "max_lobbies": s.lobbyLimit(),
		"max_clients": s.loadClientLimit(), "active_socket_handlers": len(s.loadSockets),
		"lobbies": lobbies, "matches": rows,
		"heap_alloc_bytes": memory.HeapAlloc, "heap_in_use_bytes": memory.HeapInuse,
		"heap_objects": memory.HeapObjects, "total_alloc_bytes": memory.TotalAlloc,
		"gc_count": memory.NumGC, "goroutines": runtime.NumGoroutine(),
	})
}
