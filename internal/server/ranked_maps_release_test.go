package server

import (
	"path/filepath"
	"testing"
)

// B-7: the shipped content/ranked-maps.json (the default ranked review list,
// parent of MapDir) must make ranked non-empty for the release build.
// Ranked is strict local 1v1: only installed standard-v2 maps with exactly
// two spawns are eligible. Of the six default skirmish maps, copper-junction,
// relay-heights and dry-river qualify; the four-spawn maps must not be listed
// (listing one fails host startup).
func TestShippedRankedMapsLoadNonEmpty(t *testing.T) {
	s, err := New(Config{DataDir: t.TempDir(), MapDir: filepath.Join("..", "..", "content", "maps")})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	curated := map[string]bool{"copper-junction": true, "industrial-valley": true, "port-outskirts": true, "relay-heights": true, "dry-river": true, "border-depots": true}
	for id := range curated {
		if m, ok := s.maps[id]; ok {
			t.Logf("curated %s spawns=%d ruleset=%s hash=%s", id, len(m.Spawns), m.Ruleset, lobbyMapHash(m))
		}
	}
	if len(s.rankedMaps) == 0 {
		t.Fatal("shipped ranked map list is missing or empty: ranked queue is permanently unavailable")
	}
	for id := range s.rankedMaps {
		if !curated[id] {
			t.Errorf("ranked list includes non-curated map %q", id)
		}
		if !s.rankedMap(id) {
			t.Errorf("listed ranked map %q is not currently eligible", id)
		}
	}
	for _, id := range []string{"copper-junction", "relay-heights", "dry-river"} {
		if !s.rankedMap(id) {
			t.Errorf("%s (two-spawn default map) must be ranked-eligible", id)
		}
	}
}
