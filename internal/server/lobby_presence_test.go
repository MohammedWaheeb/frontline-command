package server

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestNetLobbyHostLeaseBoundaries(t *testing.T) {
	now := time.Unix(1900000000, 0)
	l := &Lobby{ID: "forming", Host: "host", Created: now.Unix()}
	active := &Lobby{ID: "active", Host: "host", MatchID: "match", Created: now.Add(-24 * time.Hour).Unix()}
	s := &Server{lobbies: map[string]*Lobby{l.ID: l, active.ID: active}, matches: map[string]*liveMatch{"match": {done: make(chan struct{})}}}
	noteLobbyHost(l, "host", now)
	if !lobbyHostAvailable(l, now.Add(lobbyHostOffline-time.Nanosecond)) || lobbyHostAvailable(l, now.Add(lobbyHostOffline)) {
		t.Fatal("incorrect offline threshold")
	}
	// Guest polling must neither revive Browse eligibility nor extend expiration.
	noteLobbyHost(l, "guest", now.Add(time.Minute))
	s.pruneLobbiesAt(now.Add(lobbyHostGrace - time.Nanosecond))
	if s.lobbies[l.ID] == nil {
		t.Fatal("grace window shortened")
	}
	s.pruneLobbiesAt(now.Add(lobbyHostGrace))
	if s.lobbies[l.ID] != nil || s.lobbies[active.ID] == nil {
		t.Fatal("host loss must expire only forming lobby at two-minute boundary")
	}
}
func TestNetLobbyHostPollingSurvivesOldCreationAndMigration(t *testing.T) {
	now := time.Unix(1900000000, 0)
	l := &Lobby{ID: "forming", Host: "host", Created: now.Add(-24 * time.Hour).Unix()}
	s := &Server{lobbies: map[string]*Lobby{l.ID: l}}
	noteLobbyHost(l, "host", now)
	s.pruneLobbiesAt(now.Add(time.Minute))
	if s.lobbies[l.ID] == nil {
		t.Fatal("live host expired due to original creation time")
	}
	noteLobbyHost(l, "host", now.Add(time.Minute))
	s.pruneLobbiesAt(now.Add(2 * time.Minute))
	if s.lobbies[l.ID] == nil {
		t.Fatal("host heartbeat did not renew grace")
	}
	l.Host = "replacement"
	s.pruneLobbiesAt(now.Add(3 * time.Minute))
	if s.lobbies[l.ID] == nil || !lobbyHostAvailable(l, now.Add(3*time.Minute)) {
		t.Fatal("migration did not grant replacement polling window")
	}
	s.pruneLobbiesAt(now.Add(5 * time.Minute))
	if s.lobbies[l.ID] != nil {
		t.Fatal("replacement absence did not expire")
	}
}
func TestNetLobbyOfflineBrowseAdmissionAndRecovery(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	a, b, c := profile(t, h, "Host"), profile(t, h, "Guest"), profile(t, h, "Visitor")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"name": "Presence", "map_id": m.ID, "mode": "custom", "faction": "US"}, 201))
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"faction": "IR"}, 200)
	host, _ := s.repo.Authenticate(context.Background(), a)
	s.mu.Lock()
	live := s.lobbies[l.ID]
	noteLobbyHost(live, host.ID, time.Now().Add(-lobbyHostOffline-time.Second))
	s.mu.Unlock()
	list := func() []Lobby {
		t.Helper()
		req, _ := http.NewRequest("GET", h.URL+"/api/v1/lobbies", nil)
		req.Header.Set("Authorization", "Bearer "+c)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatal(resp.Status)
		}
		var out []Lobby
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	if len(list()) != 0 {
		t.Fatal("Browse advertises disconnected host")
	}
	response := request(t, h, "GET", "/api/v1/lobbies/"+l.ID, b, nil, 200)
	if string(response["host_offline"]) != "true" {
		t.Fatal("member has no clear host absence signal")
	}
	denied := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", c, map[string]any{"faction": "SY"}, 409)
	if string(denied["code"]) != `"lobby_host_offline"` {
		t.Fatal("joiner lacks clear offline error", denied)
	}
	response = request(t, h, "GET", "/api/v1/lobbies/"+l.ID, a, nil, 200)
	if string(response["host_offline"]) != "false" || len(list()) != 1 {
		t.Fatal("returning host did not restore Browse")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", c, map[string]any{"faction": "SY"}, 200)
	s.mu.Lock()
	noteLobbyHost(live, host.ID, time.Now().Add(-lobbyHostGrace))
	s.pruneLobbiesAt(time.Now())
	s.mu.Unlock()
	if len(list()) != 0 {
		t.Fatal("expired lobby still browsable")
	}
	request(t, h, "GET", "/api/v1/lobbies/"+l.ID, b, nil, 404)
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", c, map[string]any{"faction": "SY"}, 404)
}
