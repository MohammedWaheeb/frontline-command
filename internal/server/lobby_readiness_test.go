package server

import (
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

// Asset preparation happens outside the server lock. A request carrying the
// configuration loaded before a concurrent join/change must never ready the new
// configuration, even when every simulation/content version still matches.
func TestLobbyReadinessBindsExactPreparedConfiguration(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a, b := profile(t, h, "Loading host"), profile(t, h, "Joining guest")
	first := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, lobbyBody(), 201))
	if first.Revision == 0 {
		t.Fatal("new lobby has no configuration revision")
	}
	body := map[string]any{"ready": true, "assets_ready": true, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash(), "expected_revision": first.Revision}
	joined := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/join", b, map[string]any{}, 200))
	if !content.ValidFaction(joined.Slots[1].Faction) {
		t.Fatal("omitted ordinary faction did not resolve", joined)
	}
	if joined.Revision <= first.Revision {
		t.Fatal("membership did not invalidate prepared configuration")
	}
	stale := request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", a, body, 409)
	if string(stale["code"]) != `"lobby_changed"` {
		t.Fatal(stale)
	}
	current := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+first.ID, a, nil, 200))
	if current.Revision != joined.Revision || current.Slots[0].Ready || current.Slots[0].AssetsReady {
		t.Fatal("stale readiness mutated lobby", current)
	}
	body["expected_revision"] = current.Revision
	for _, token := range []string{a, b} {
		ready := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", token, body, 200))
		if ready.Revision != current.Revision {
			t.Fatal("readiness invalidated another player's asset preparation")
		}
	}
	nextFaction := "SA"
	if current.Slots[1].Faction == nextFaction {
		nextFaction = "US"
	}
	changed := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+first.ID, b, map[string]any{"faction": nextFaction}, 200))
	if changed.Revision <= current.Revision {
		t.Fatal("faction change retained configuration revision")
	}
	for _, slot := range changed.Slots {
		if slot.Ready || slot.AssetsReady {
			t.Fatal("configuration change retained ready flags")
		}
	}
	request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", a, body, 409)
	// Omitting the revision is not a compatibility loophole.
	delete(body, "expected_revision")
	request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", a, body, 409)
	body["expected_revision"] = changed.Revision
	ready := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", a, body, 200))
	// Identical/invalid configuration requests must not invalidate loaded assets.
	same := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+first.ID, b, map[string]any{"faction": nextFaction}, 200))
	request(t, h, "PATCH", "/api/v1/lobbies/"+first.ID, b, map[string]any{"faction": "invalid"}, 400)
	if same.Revision != ready.Revision || !same.Slots[0].Ready {
		t.Fatal("no-op invalidated ready configuration")
	}
	// A player can always withdraw readiness, including from an old UI view.
	body["expected_revision"] = first.Revision
	body["ready"] = false
	withdrawn := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+first.ID+"/ready", a, body, 200))
	if withdrawn.Revision != ready.Revision || withdrawn.Slots[0].Ready || withdrawn.Slots[0].AssetsReady {
		t.Fatal("withdraw did not clear preparation without changing configuration")
	}
}
