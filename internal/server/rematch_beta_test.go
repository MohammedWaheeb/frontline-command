package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"net/http/httptest"
	"sync"
	"testing"
)

// Synthetic completion isolates rematch admission from the simulation/result
// actor, which is exercised by TestRatedResultFromTwoRealSockets.
func betaCompletedRematch(t *testing.T, count int) (*Server, *httptest.Server, Lobby, []string, []storage.Profile) {
	t.Helper()
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	tokens := []string{}
	profiles := []storage.Profile{}
	for i := 0; i < count; i++ {
		token := profile(t, h, "Rematch commander")
		p, err := s.repo.Authenticate(context.Background(), token)
		if err != nil {
			t.Fatal(err)
		}
		tokens = append(tokens, token)
		profiles = append(profiles, p)
	}
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", tokens[0], map[string]any{"name": "Rematch group", "map_id": m.ID, "mode": "custom", "private": true, "faction": "US", "team": 1}, 201))
	s.mu.Lock()
	code := s.lobbies[l.ID].Code
	s.mu.Unlock()
	for i := 1; i < count; i++ {
		l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", tokens[i], map[string]any{"code": code, "faction": "IR", "team": i + 1}, 200))
	}
	completed := &liveMatch{id: "beta-completed-rematch", done: make(chan struct{})}
	completed.completed.Store(true)
	s.mu.Lock()
	s.lobbies[l.ID].MatchID = completed.id
	s.matches[completed.id] = completed
	s.mu.Unlock()
	t.Cleanup(func() { s.mu.Lock(); delete(s.matches, completed.id); s.mu.Unlock() })
	return s, h, l, tokens, profiles
}

func betaRematchInvites(t *testing.T, h *httptest.Server, token string) []LobbyInvite {
	t.Helper()
	response := request(t, h, "GET", "/api/v1/invites", token, nil, 200)
	var invites []LobbyInvite
	if err := json.Unmarshal(response["invites"], &invites); err != nil {
		t.Fatal(err)
	}
	return invites
}

func TestBetaRematchInvitesAllPriorHumansWithoutEnrollingThem(t *testing.T) {
	s, h, previous, tokens, profiles := betaCompletedRematch(t, 4)
	next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[0], map[string]any{}, 201))
	if len(next.Slots) != 1 || next.Rated {
		t.Fatal("rematch silently enrolled recipients or became rated", next)
	}
	if !next.Rematch || next.PreviousMatch != "beta-completed-rematch" {
		t.Fatal("rematch lobby omitted serialized source metadata", next)
	}
	for i := 1; i < 4; i++ {
		invites := betaRematchInvites(t, h, tokens[i])
		if len(invites) != 1 || invites[0].LobbyID != next.ID || invites[0].Sender != profiles[0].ID {
			t.Fatal("previous stranger missing shared rematch invitation", invites)
		}
		if !invites[0].Rematch || invites[0].PreviousMatch != next.PreviousMatch {
			t.Fatal("rematch invitation omitted serialized source metadata", invites)
		}
		if len(betaRematchInvites(t, h, tokens[0])) != 0 {
			t.Fatal("requester received own invite")
		}
		// Notification alone must not reserve a profile; ordinary admission still
		// rejects accepting while the recipient has a different forming lobby.
		if i == 1 {
			own := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", tokens[i], map[string]any{"name": "Other lobby", "map_id": lobbyFourMap().ID, "mode": "custom", "faction": "IR"}, 201))
			request(t, h, "POST", "/api/v1/invites/"+invites[0].ID+"/accept", tokens[i], map[string]any{}, 409)
			request(t, h, "DELETE", "/api/v1/lobbies/"+own.ID+"/membership", tokens[i], nil, 204)
		}
		joined := responseLobby(t, request(t, h, "POST", "/api/v1/invites/"+invites[0].ID+"/accept", tokens[i], map[string]any{"faction": "IR", "team": i + 1}, 200))
		if joined.ID != next.ID || len(joined.Slots) != i+1 || !joined.Rematch || joined.PreviousMatch != next.PreviousMatch {
			t.Fatal("explicit invite acceptance did not join shared lobby", joined)
		}
	}
	retried := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[3], map[string]any{}, 200))
	if retried.ID != next.ID || len(retried.Slots) != 4 {
		t.Fatal("participant retry split the group", retried)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.lobbies) != 2 {
		t.Fatal("unexpected rematch lobby count", len(s.lobbies))
	}
}

func TestBetaOrdinaryInviteSerializesFalseRematchWithoutSource(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	a, b := profile(t, h, "Host"), profile(t, h, "Friend")
	_, recipient := friendProfiles(t, s, a, b)
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"name": "Ordinary invite", "map_id": m.ID, "mode": "custom", "private": true, "faction": "US"}, 201))
	if l.Rematch || l.PreviousMatch != "" {
		t.Fatal("ordinary lobby advertised rematch metadata", l)
	}
	created := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/invites", a, map[string]any{"target": recipient.ID}, 201)
	if string(created["rematch"]) != "false" {
		t.Fatal("ordinary invite must explicitly serialize rematch false", created)
	}
	if _, present := created["previous_match_id"]; present {
		t.Fatal("ordinary invite serialized a previous match", created)
	}
	invites := betaRematchInvites(t, h, b)
	if len(invites) != 1 || invites[0].Rematch || invites[0].PreviousMatch != "" {
		t.Fatal("ordinary invite listing advertised rematch metadata", invites)
	}
	joined := responseLobby(t, request(t, h, "POST", "/api/v1/invites/"+invites[0].ID+"/accept", b, map[string]any{}, 200))
	if joined.ID != l.ID || len(joined.Slots) != 2 || joined.Rematch || joined.PreviousMatch != "" {
		t.Fatal("ordinary invite acceptance changed lobby metadata", joined)
	}
}

func TestBetaConcurrentRematchClicksConvergeOnOneLobby(t *testing.T) {
	s, _, previous, tokens, _ := betaCompletedRematch(t, 4)
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 4)
	var wg sync.WaitGroup
	for _, token := range tokens {
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			r := httptest.NewRequest("POST", "/api/v1/lobbies/"+previous.ID+"/rematch", bytes.NewBufferString(`{}`))
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			<-start
			s.ServeHTTP(w, r)
			responses <- w
		}(token)
	}
	close(start)
	wg.Wait()
	close(responses)
	id := ""
	created := 0
	for w := range responses {
		if w.Code != 200 && w.Code != 201 {
			t.Fatalf("concurrent rematch status %d: %s", w.Code, w.Body.String())
		}
		if w.Code == 201 {
			created++
		}
		var response struct {
			Lobby Lobby `json:"lobby"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if id != "" && response.Lobby.ID != id {
			t.Fatal("concurrent clicks created rival lobbies", id, response.Lobby.ID)
		}
		id = response.Lobby.ID
	}
	if created != 1 {
		t.Fatal("expected exactly one new rematch", created)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.lobbies) != 2 || s.lobbies[id] == nil || len(s.lobbies[id].Slots) != 4 {
		t.Fatal("concurrent participants not admitted once each", s.lobbies[id])
	}
}

func TestBetaRematchInvitesAndClicksRespectBlocks(t *testing.T) {
	s, h, previous, tokens, profiles := betaCompletedRematch(t, 3)
	if err := s.repo.SetRelation(context.Background(), profiles[1].ID, profiles[0].ID, "block"); err != nil {
		t.Fatal(err)
	}
	next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[0], map[string]any{}, 201))
	if len(betaRematchInvites(t, h, tokens[1])) != 0 {
		t.Fatal("blocked participant was invited")
	}
	request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[1], map[string]any{}, 403)
	invites := betaRematchInvites(t, h, tokens[2])
	if len(invites) != 1 {
		t.Fatal("unblocked participant was not invited", invites)
	}
	if err := s.repo.SetRelation(context.Background(), profiles[2].ID, profiles[0].ID, "block"); err != nil {
		t.Fatal(err)
	}
	request(t, h, "POST", "/api/v1/invites/"+invites[0].ID+"/accept", tokens[2], map[string]any{}, 403)
	if len(betaRematchInvites(t, h, tokens[2])) != 0 {
		t.Fatal("newly blocked invitation remained visible")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.lobbies) != 2 || len(s.lobbies[next.ID].Slots) != 1 {
		t.Fatal("blocked participant gained admission or a rival rematch")
	}
}

func TestBetaRematchInviteSurvivesPreviousDebriefExpiry(t *testing.T) {
	s, h, previous, tokens, _ := betaCompletedRematch(t, 2)
	next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[0], map[string]any{}, 201))
	invites := betaRematchInvites(t, h, tokens[1])
	if len(invites) != 1 {
		t.Fatal("missing rematch invitation", invites)
	}
	// Completed actors live for five minutes; invitations live for ten. The
	// invitation must retain its server-derived authority after debrief pruning.
	s.mu.Lock()
	delete(s.matches, s.lobbies[previous.ID].MatchID)
	s.pruneLobbies()
	s.mu.Unlock()
	invites = betaRematchInvites(t, h, tokens[1])
	if len(invites) != 1 {
		t.Fatal("pruning the debrief invalidated an unexpired invitation", invites)
	}
	joined := responseLobby(t, request(t, h, "POST", "/api/v1/invites/"+invites[0].ID+"/accept", tokens[1], map[string]any{}, 200))
	if joined.ID != next.ID || len(joined.Slots) != 2 {
		t.Fatal("unexpired invitation lost its shared rematch lobby", joined)
	}
}

func TestBetaRematchMapPinAndExplicitSpawnWithLegacyPermutation(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		t.Run(fmt.Sprintf("legacy-permutation-%t", legacy), func(t *testing.T) {
			s, h, previous, tokens, _ := betaCompletedRematch(t, 2)
			original := lobbyFourMap()
			s.mu.Lock()
			old := s.lobbies[previous.ID]
			old.Slots[0].Spawn = 4
			matchMap, err := lobbyMatchMap(old, original)
			if err != nil {
				s.mu.Unlock()
				t.Fatal(err)
			}
			if lobbyMapHash(matchMap) != lobbyMapHash(original) {
				s.mu.Unlock()
				t.Fatal("fresh match permuted installed blueprint")
			}
			if legacy {
				// Model a retained completed match from the old private-map adapter.
				matchMap.Spawns = append([]content.Spawn(nil), original.Spawns...)
				matchMap.Spawns[0], matchMap.Spawns[3] = matchMap.Spawns[3], matchMap.Spawns[0]
			}
			old.MapHash = lobbyMapHash(matchMap)
			if legacy && old.MapHash == lobbyMapHash(original) {
				s.mu.Unlock()
				t.Fatal("legacy fixture did not retain its original permutation")
			}
			s.mu.Unlock()
			next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+previous.ID+"/rematch", tokens[0], map[string]any{}, 201))
			if next.MapHash != lobbyMapHash(original) || next.MapVersion != original.Version || next.Slots[0].Spawn != 4 {
				t.Fatal("rematch lost installed map pin or explicit choice", next)
			}
			s.mu.Lock()
			pinned := s.lobbies[next.ID].mapData
			validPin := pinned != nil && lobbyMapHash(*pinned) == lobbyMapHash(original)
			s.mu.Unlock()
			if !validPin {
				t.Fatal("rematch lost original installed map pin")
			}
			readyTestLobby(t, s, h, next.ID, tokens[0])
			started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+next.ID+"/start", tokens[0], map[string]any{}, 201))
			if started.MapHash != lobbyMapHash(original) {
				t.Fatal("fresh rematch changed installed blueprint hash")
			}
			state, _ := startingMoneyState(t, s, started.MatchID)
			found := false
			for _, entity := range state.Entities {
				if entity.Owner == 1 && entity.Type == "hq" {
					found = true
					if entity.Position != original.Spawns[3].Position {
						t.Fatal("explicit HQ start applied incorrectly", entity.Position)
					}
				}
			}
			if !found {
				t.Fatal("missing rematch HQ")
			}
		})
	}
}
