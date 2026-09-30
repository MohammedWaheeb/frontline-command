package server

import (
	"bytes"
	"context"
	"encoding/json"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"github.com/coder/websocket"
	"google.golang.org/protobuf/proto"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func startingMoneyRules(credits any, ruleset string) map[string]any {
	return map[string]any{"ruleset": ruleset, "speed": 1, "starting_credits": credits, "supply_cap": 100, "fog": true, "strategic_operations": true}
}

func assertStartingMoneyCode(t *testing.T, response map[string]json.RawMessage, code string) {
	t.Helper()
	if string(response["code"]) != `"`+code+`"` {
		t.Fatalf("wrong rejection: want %s, got %s", code, response["code"])
	}
}

func startingMoneyState(t *testing.T, s *Server, matchID string) (sim.State, []byte) {
	t.Helper()
	s.mu.Lock()
	m := s.matches[matchID]
	s.mu.Unlock()
	if m == nil {
		t.Fatal("started HTTP lobby has no live match")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	saved := m.call(ctx, matchRequest{kind: "save"})
	if saved.err != nil {
		t.Fatal(saved.err)
	}
	e, err := sim.Restore(s.catalog, saved.data)
	if err != nil {
		t.Fatal("actual server Save could not be restored", err)
	}
	return e.StateCopy(), saved.data
}

func TestLobbyStartingCreditsWholeCreditConversion(t *testing.T) {
	eligible := Lobby{Mode: "custom", Private: true}
	for _, tc := range []struct {
		name       string
		whole      uint32
		label      string
		wantMilli  int64
		wantLabel  string
		wantCode   string
	}{
		{"minimum", 1, "standard-v2", 1000, "custom-v1", ""},
		{"default", 6000, "standard-v2", 0, "standard-v2", ""},
		{"explicit-custom-default", 6000, "custom-v1", 0, "standard-v2", ""},
		{"custom", 10000, "custom-v1", 10000000, "custom-v1", ""},
		{"maximum", 1000000, "standard-v2", 1000000000, "custom-v1", ""},
		{"zero-is-not-default-http", 0, "standard-v2", 0, "", "invalid_starting_credits"},
		{"above-maximum", 1000001, "custom-v1", 0, "", "invalid_starting_credits"},
		{"uint32-maximum", ^uint32(0), "custom-v1", 0, "", "invalid_starting_credits"},
		{"unknown-label", 10000, "permitted-by-client", 0, "", "unsupported_rules"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			requested := standardLobbyRules()
			requested.StartingCredits, requested.Ruleset = tc.whole, tc.label
			original := requested
			rules, milli, err := normalizedLobbyRules(&eligible, &requested)
			if requested != original {
				t.Fatal("normalization mutated caller-owned rules")
			}
			if tc.wantCode != "" {
				if err == nil || err.code != tc.wantCode || milli != 0 {
					t.Fatal("invalid rules converted or wrong reason", err, milli)
				}
				return
			}
			if err != nil || rules.StartingCredits != tc.whole || rules.Ruleset != tc.wantLabel || milli != tc.wantMilli {
				t.Fatal("whole credits converted incorrectly", rules, milli, err)
			}
		})
	}
	for _, tc := range []struct {
		name  string
		lobby Lobby
	}{
		{"public-custom", Lobby{Mode: "custom"}},
		{"ranked-custom-label-is-not-permission", Lobby{Mode: "custom", Private: true, Rated: true}},
		{"private-1v1", Lobby{Mode: "1v1", Private: true}},
		{"scenario", Lobby{Mode: "custom", Private: true, ScenarioID: "authored"}},
		{"prescribed-summary", Lobby{Mode: "custom", Private: true, ScenarioRules: &LobbyScenarioRules{Ruleset: "scenario-v2"}}},
		{"resumed", Lobby{Mode: "custom", Private: true, ResumeSave: "checkpoint"}},
		{"resume-indicator", Lobby{Mode: "custom", Private: true, ResumeTick: 100}},
		{"tutorial", Lobby{Mode: "tutorial", Private: true}},
		{"practice", Lobby{Mode: "practice", Private: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rules := standardLobbyRules()
			rules.Ruleset, rules.StartingCredits = "custom-v1", 10000
			if _, milli, err := normalizedLobbyRules(&tc.lobby, &rules); err == nil || err.code != "custom_starting_credits_unavailable" || milli != 0 {
				t.Fatal("a client label overrode actual protected lobby policy", milli, err)
			}
			standard, milli, err := normalizedLobbyRules(&tc.lobby, nil)
			if err != nil || milli != 0 || standard != standardLobbyRules() {
				t.Fatal("protected mode did not retain standard default", standard, milli, err)
			}
		})
	}
}

func TestLobbyStartingCreditsHTTPStart(t *testing.T) {
	for _, tc := range []struct {
		name, label string
		whole       uint32
		private     bool
		wantMilli   int64
	}{
		{"minimum-private", "standard-v2", 1, true, 1000},
		{"ordinary-public-default", "standard-v2", 6000, false, 6000000},
		{"private-custom-label-default", "custom-v1", 6000, true, 6000000},
		{"nondefault-private", "custom-v1", 10000, true, 10000000},
		{"maximum-private", "standard-v2", 1000000, true, 1000000000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, h := testServer(t)
			s.maps[testMap().ID] = testMap()
			host := profile(t, h, "Starting funds host")
			l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": tc.private, "faction": "US", "team": 1, "rules": startingMoneyRules(tc.whole, tc.label), "ai": []aiRequest{{Faction: "IR", Difficulty: "normal", Team: 2}}}, 201))
			wantRuleset, wantStored := "custom-v1", tc.wantMilli
			if tc.whole == 6000 {
				wantRuleset, wantStored = "standard-v2", 0
			}
			if l.Rules == nil || l.Rules.StartingCredits != tc.whole || l.Rules.Ruleset != wantRuleset || len(l.Slots) != 2 {
				t.Fatal("HTTP declaration was not canonical whole credits", l)
			}
			readyTestLobby(t, s, h, l.ID, host)
			started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201))
			state, raw := startingMoneyState(t, s, started.MatchID)
			if state.Tick != 0 || state.StartingCredits != wantStored || state.Metadata.Ruleset != wantRuleset || len(state.Players) != 2 {
				t.Fatal("real start did not retain canonical initial choice", state.Tick, state.StartingCredits, state.Metadata.Ruleset)
			}
			for _, p := range state.Players {
				if p.Credits != tc.wantMilli {
					t.Fatal("whole funds were ignored, scaled twice, or uneven for human/AI", p.ID, p.Credits, tc.wantMilli)
				}
			}
			var envelope struct {
				State map[string]json.RawMessage `json:"state"`
			}
			if err := json.Unmarshal(raw, &envelope); err != nil {
				t.Fatal(err)
			}
			if _, present := envelope.State["starting_credits"]; present != (wantStored != 0) {
				t.Fatal("default save gained a starting-credits field or custom choice was omitted")
			}
			if wantStored == 0 {
				// Compare with the unchanged default Config path under this same
				// simulation version/seed, not an incompatible R3-version file.
				cfg := sim.Config{Map: testMap(), Seed: state.Metadata.Seed, Ruleset: "standard-v2"}
				for _, slot := range started.Slots {
					cfg.Players = append(cfg.Players, sim.PlayerConfig{ID: slot.Player, Name: slot.Name, Faction: slot.Faction, Team: slot.Team, Color: slot.Color, AI: slot.AI})
				}
				baseline, err := sim.New(s.catalog, cfg)
				if err != nil {
					t.Fatal(err)
				}
				baselineSave, err := baseline.Save()
				if err != nil || !bytes.Equal(baselineSave, raw) {
					t.Fatal("default lobby start changed canonical default Save bytes", err)
				}
			}
		})
	}
}

func TestLobbyStartingCreditsHTTPRejectsUnprivilegedRules(t *testing.T) {
	for _, tc := range []struct {
		name, mode, label string
		private           bool
		credits           any
		code              string
	}{
		{"public-standard-label", "custom", "standard-v2", false, 10000, "custom_starting_credits_unavailable"},
		{"public-custom-label", "custom", "custom-v1", false, 10000, "custom_starting_credits_unavailable"},
		{"private-1v1", "1v1", "custom-v1", true, 10000, "custom_starting_credits_unavailable"},
		{"private-2v2", "2v2", "custom-v1", true, 10000, "custom_starting_credits_unavailable"},
		{"private-ffa", "ffa", "custom-v1", true, 10000, "custom_starting_credits_unavailable"},
		{"private-coop", "coop", "custom-v1", true, 10000, "custom_starting_credits_unavailable"},
		{"zero", "custom", "custom-v1", true, 0, "invalid_starting_credits"},
		{"above-maximum", "custom", "custom-v1", true, 1000001, "invalid_starting_credits"},
		{"uint32-maximum", "custom", "custom-v1", true, uint64(4294967295), "invalid_starting_credits"},
		{"uint32-overflow", "custom", "custom-v1", true, uint64(4294967296), "invalid_request"},
		{"negative", "custom", "custom-v1", true, -1, "invalid_request"},
		{"fractional", "custom", "custom-v1", true, 1.5, "invalid_request"},
		{"null-field", "custom", "custom-v1", true, nil, "invalid_starting_credits"},
		{"boolean", "custom", "custom-v1", true, true, "invalid_request"},
		{"string", "custom", "custom-v1", true, "10000", "invalid_request"},
		{"unknown-ruleset", "custom", "private-is-permission", true, 10000, "unsupported_rules"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, h := testServer(t)
			s.maps[testMap().ID] = testMap()
			host := profile(t, h, "Rejected funds host")
			response := request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": tc.mode, "private": tc.private, "faction": "US", "rules": startingMoneyRules(tc.credits, tc.label)}, 400)
			assertStartingMoneyCode(t, response, tc.code)
			s.mu.Lock()
			count := len(s.lobbies)
			s.mu.Unlock()
			if count != 0 {
				t.Fatal("rejected funds left a partially created lobby")
			}
		})
	}
}

func TestLobbyStartingCreditsPatchPermissionAndReadiness(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	host, guest, outsider := profile(t, h, "Money host"), profile(t, h, "Money guest"), profile(t, h, "Outsider")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "faction": "US"}, 201))
	l = responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"faction": "IR", "team": 2}, 200))
	readyTestLobby(t, s, h, l.ID, host, guest)
	before := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, "", map[string]any{"rules": startingMoneyRules(10000, "custom-v1")}, 401), "authentication_required")
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, outsider, map[string]any{"rules": startingMoneyRules(10000, "custom-v1")}, 403), "not_in_lobby")
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, guest, map[string]any{"private": true, "rules": startingMoneyRules(10000, "custom-v1")}, 403), "host_required")
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"name": "Must not apply", "rules": startingMoneyRules(10000, "custom-v1")}, 400), "custom_starting_credits_unavailable")
	rejected := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
	if rejected.Private || rejected.Name != before.Name || *rejected.Rules != *before.Rules || rejected.Revision != before.Revision || !rejected.Slots[0].Ready || !rejected.Slots[1].AssetsReady {
		t.Fatal("failed policy mutation partially applied or reset readiness", rejected)
	}
	changed := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"private": true, "rules": startingMoneyRules(10000, "standard-v2")}, 200))
	if !changed.Private || changed.Rules.StartingCredits != 10000 || changed.Rules.Ruleset != "custom-v1" || changed.Revision <= before.Revision {
		t.Fatal("prospective private policy or rules persistence missing", changed)
	}
	for _, slot := range changed.Slots {
		if slot.Ready || slot.AssetsReady {
			t.Fatal("funds change retained readiness")
		}
	}
	stale := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/ready", host, map[string]any{"ready": true, "assets_ready": true, "protocol": 1, "simulation": sim.Version, "content_hash": s.catalog.Hash(), "expected_revision": before.Revision}, 409)
	assertStartingMoneyCode(t, stale, "lobby_changed")
	readyTestLobby(t, s, h, l.ID, host, guest)
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"private": false}, 400), "custom_starting_credits_unavailable")
	still := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
	if !still.Private || still.Revision != changed.Revision || still.Rules.StartingCredits != 10000 || !still.Slots[0].Ready || !still.Slots[1].Ready {
		t.Fatal("nondefault funds escaped to public lobby or invalidated ready state")
	}
	public := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"private": false, "rules": startingMoneyRules(6000, "custom-v1")}, 200))
	if public.Private || *public.Rules != standardLobbyRules() || public.Revision <= still.Revision {
		t.Fatal("simultaneous reset and public transition was not canonical", public)
	}
	readyTestLobby(t, s, h, l.ID, host, guest)
	same := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"rules": startingMoneyRules(6000, "custom-v1")}, 200))
	if same.Revision != public.Revision || !same.Slots[0].Ready || !same.Slots[1].Ready {
		t.Fatal("canonical default no-op reset loaded configuration")
	}
	unsupported := startingMoneyRules(6000, "standard-v2")
	unsupported["speed"] = 2
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, map[string]any{"name": "Not applied", "rules": unsupported}, 400), "unsupported_rules")
	unchanged := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
	if unchanged.Revision != same.Revision || unchanged.Name != same.Name || !unchanged.Slots[0].Ready || *unchanged.Rules != standardLobbyRules() {
		t.Fatal("unsupported rules partially changed the lobby")
	}
	started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201))
	state, _ := startingMoneyState(t, s, started.MatchID)
	if state.StartingCredits != 0 || state.Metadata.Ruleset != "standard-v2" {
		t.Fatal("reset to public default leaked the previous private override")
	}
	for _, player := range state.Players {
		if player.Credits != 6000000 {
			t.Fatal("public start did not regain standard starting funds")
		}
	}
}

func TestLobbyStartingCreditsRankedPolicy(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	a, b := profile(t, h, "Ranked A"), profile(t, h, "Ranked B")
	body := queueBody(s)
	request(t, h, "POST", "/api/v1/matchmaking", a, body, 200)
	body["faction"] = "IR"
	matched := request(t, h, "POST", "/api/v1/matchmaking", b, body, 200)
	var id string
	if err := json.Unmarshal(matched["lobby_id"], &id); err != nil || id == "" {
		t.Fatal("actual matchmaking did not produce a ranked lobby", err)
	}
	for _, token := range []string{a, b} {
		assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+id, token, map[string]any{"rules": startingMoneyRules(1000000, "custom-v1")}, 409), "ranked_rules_locked")
	}
	l := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+id, a, nil, 200))
	if !l.Rated || *l.Rules != standardLobbyRules() {
		t.Fatal("ranked submitted label changed the fixed preset", l)
	}
	readyTestLobby(t, s, h, id, a, b)
	started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+id+"/start", a, map[string]any{}, 201))
	state, _ := startingMoneyState(t, s, started.MatchID)
	if state.StartingCredits != 0 || state.Metadata.Ruleset != "standard-v2" {
		t.Fatal("actual ranked start received a custom override")
	}
	for _, p := range state.Players {
		if p.Credits != 6000000 {
			t.Fatal("ranked starting funds changed", p.ID, p.Credits)
		}
	}
}

func TestLobbyStartingCreditsStartRechecksStoredPolicy(t *testing.T) {
	// These explicit internal invalid-lobby fixtures test the start boundary,
	// not a public ability to mutate stored state or a gameplay acceptance course.
	for _, mode := range []string{"public", "ranked", "scenario", "checkpoint", "resume-indicator"} {
		t.Run(mode, func(t *testing.T) {
			s, h := testServer(t)
			installReviewedTestMap(s, testMap())
			host := profile(t, h, "Stored policy host")
			l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": true, "faction": "US", "rules": startingMoneyRules(10000, "custom-v1")}, 201))
			readyTestLobby(t, s, h, l.ID, host)
			s.mu.Lock()
			stored := s.lobbies[l.ID]
			switch mode {
			case "public":
				stored.Private = false
			case "ranked":
				stored.Rated = true
			case "scenario":
				stored.ScenarioID = "explicit-invalid-scenario-fixture"
			case "checkpoint":
				stored.ResumeSave = "explicit-invalid-checkpoint-fixture"
			case "resume-indicator":
				stored.ResumeTick = 100
			}
			s.mu.Unlock()
			assertStartingMoneyCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 400), "custom_starting_credits_unavailable")
			s.mu.Lock()
			started, matches := stored.MatchID, len(s.matches)
			s.mu.Unlock()
			if started != "" || matches != 0 {
				t.Fatal("invalid stored policy created a match")
			}
		})
	}
}

func TestLobbyStartingCreditsRematchRulesAreDetached(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	host := profile(t, h, "Rematch funds host")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": true, "faction": "US", "rules": startingMoneyRules(12000, "custom-v1")}, 201))
	// Isolate the rematch clone contract with a synthetic completed header,
	// as the existing co-op clone test does. No result/game completion is earned.
	completed := &liveMatch{id: "starting-funds-completed-fixture", done: make(chan struct{})}
	completed.completed.Store(true)
	s.mu.Lock()
	previous := s.lobbies[l.ID]
	previous.MatchID = completed.id
	s.matches[completed.id] = completed
	s.mu.Unlock()
	t.Cleanup(func() { s.mu.Lock(); delete(s.matches, completed.id); s.mu.Unlock() })
	next := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/rematch", host, map[string]any{}, 201))
	if next.Rated || !next.Private || next.Mode != "custom" || next.PreviousMatch != completed.id || next.Rules.StartingCredits != 12000 || next.Rules.Ruleset != "custom-v1" {
		t.Fatal("private ordinary rematch lost its funds policy", next)
	}
	s.mu.Lock()
	aliased := previous.Rules == s.lobbies[next.ID].Rules
	s.mu.Unlock()
	if aliased {
		t.Fatal("rematch rules alias completed history")
	}
	changed := responseLobby(t, request(t, h, "PATCH", "/api/v1/lobbies/"+next.ID, host, map[string]any{"rules": startingMoneyRules(1, "custom-v1")}, 200))
	s.mu.Lock()
	oldWhole, oldLabel := previous.Rules.StartingCredits, previous.Rules.Ruleset
	s.mu.Unlock()
	if oldWhole != 12000 || oldLabel != "custom-v1" || changed.Rules.StartingCredits != 1 {
		t.Fatal("new host update rewrote previous funds policy")
	}
	retried := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/rematch", host, map[string]any{}, 200))
	if retried.ID != next.ID || retried.Rules.StartingCredits != 1 {
		t.Fatal("retry changed existing new-lobby funds")
	}
	readyTestLobby(t, s, h, next.ID, host)
	started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+next.ID+"/start", host, map[string]any{}, 201))
	state, _ := startingMoneyState(t, s, started.MatchID)
	if state.StartingCredits != 1000 || state.Players[0].Credits != 1000 {
		t.Fatal("new rematch start did not convert its chosen whole funds")
	}
}

func TestLobbyStartingCreditsRematchRechecksPriorPolicy(t *testing.T) {
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	host := profile(t, h, "Invalid prior funds host")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": true, "faction": "US", "rules": startingMoneyRules(10000, "custom-v1")}, 201))
	// Explicit inconsistent ranked/custom completed-header fixture: creation of
	// an unranked successor must not legitimize a protected old funds override.
	completed := &liveMatch{id: "invalid-prior-funds-fixture", done: make(chan struct{})}
	completed.completed.Store(true)
	s.mu.Lock()
	s.lobbies[l.ID].Rated, s.lobbies[l.ID].MatchID = true, completed.id
	s.matches[completed.id] = completed
	s.mu.Unlock()
	t.Cleanup(func() { s.mu.Lock(); delete(s.matches, completed.id); s.mu.Unlock() })
	assertStartingMoneyCode(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/rematch", host, map[string]any{}, 400), "custom_starting_credits_unavailable")
	s.mu.Lock()
	count := len(s.lobbies)
	s.mu.Unlock()
	if count != 1 {
		t.Fatal("invalid protected prior funds gained a rematch")
	}
}

func TestLobbyStartingCreditsScenarioAndResumeBudgets(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	a, b := profile(t, h, "Budget A"), profile(t, h, "Budget B")
	created := request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", a, map[string]any{"difficulty": "hard", "private": true}, 201)
	l := responseLobby(t, created)
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, a, map[string]any{"rules": startingMoneyRules(1000000, "custom-v1")}, 409), "scenario_rules_locked")
	// The prescribed co-op scenario needs both human slots before its engine can start.
	var scenarioCode string
	if err := json.Unmarshal(created["code"], &scenarioCode); err != nil || scenarioCode == "" {
		t.Fatal("private scenario code was not issued to its actual host", err)
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"code": scenarioCode}, 200)
	s.mu.Lock()
	scenario, err := s.scenarioEngine(s.lobbies[l.ID], m, 9)
	s.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	fresh := scenario.StateCopy()
	if fresh.StartingCredits != 0 || fresh.Players[0].Credits != 6000000 || fresh.Players[1].Credits != 6000000 || fresh.Players[2].Credits != 9000000 {
		t.Fatal("custom funds changed authored allied/enemy difficulty budgets")
	}
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", a, nil, 204)
	request(t, h, "DELETE", "/api/v1/lobbies/"+l.ID+"/membership", b, nil, 204)
	for scenario.Tick() < 112 {
		scenario.Advance()
	}
	data, err := scenario.Save()
	if err != nil {
		t.Fatal(err)
	}
	pa, err := s.repo.Authenticate(context.Background(), a)
	if err != nil {
		t.Fatal(err)
	}
	pb, err := s.repo.Authenticate(context.Background(), b)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.repo.PutSharedSave(context.Background(), []string{pa.ID, pb.ID}, "starting-funds-checkpoint", "Authored budget checkpoint", data); err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/saves/starting-funds-checkpoint/coop-lobby"
	assertStartingMoneyCode(t, request(t, h, "POST", path, a, map[string]any{"private": true, "rules": startingMoneyRules(10000, "custom-v1")}, 400), "invalid_request")
	resumeResponse := request(t, h, "POST", path, a, map[string]any{"private": true}, 201)
	resumed := responseLobby(t, resumeResponse)
	var resumeCode string
	if err := json.Unmarshal(resumeResponse["code"], &resumeCode); err != nil || resumeCode == "" {
		t.Fatal("private resume code was not issued to its actual host", err)
	}
	if resumed.Rules != nil || resumed.ScenarioRules == nil || resumed.ResumeTick != uint32(scenario.Tick()) {
		t.Fatal("resume advertised override rules or lost prescribed checkpoint")
	}
	assertStartingMoneyCode(t, request(t, h, "PATCH", "/api/v1/lobbies/"+resumed.ID, a, map[string]any{"rules": startingMoneyRules(6000, "standard-v2")}, 409), "scenario_rules_locked")
	request(t, h, "POST", "/api/v1/lobbies/"+resumed.ID+"/join", b, map[string]any{"code": resumeCode}, 200)
	readyTestLobby(t, s, h, resumed.ID, a, b)
	started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+resumed.ID+"/start", a, map[string]any{}, 201))
	state, saved := startingMoneyState(t, s, started.MatchID)
	restored, err := sim.Restore(s.catalog, saved)
	if err != nil || state.StartingCredits != 0 || restored.Hash() != scenario.Hash() {
		t.Fatal("real resumed start reset stored budgets/state", err)
	}
}

func TestLobbyStartingCreditsSocketResumeAndReplay(t *testing.T) {
	// Actual authenticated sockets and a legal public surrender exercise funds
	// retention at service boundaries. This short protocol fixture is not a
	// natural-game, ordinary-browser or physical-LAN acceptance course.
	s, h := testServer(t)
	s.maps[testMap().ID] = testMap()
	a, b := profile(t, h, "Funded A"), profile(t, h, "Funded B")
	created := request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": true, "faction": "US", "team": 1, "rules": startingMoneyRules(12000, "standard-v2")}, 201)
	l := responseLobby(t, created)
	var code string
	if err := json.Unmarshal(created["code"], &code); err != nil || code == "" {
		t.Fatal("private code was not issued to its actual host", err)
	}
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", b, map[string]any{"code": code, "faction": "IR", "team": 2}, 200)
	readyTestLobby(t, s, h, l.ID, a, b)
	started := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", a, map[string]any{}, 201)
	joined := request(t, h, "GET", "/api/v1/lobbies/"+l.ID, b, nil, 200)
	var ac, bc map[string]any
	if err := json.Unmarshal(started["connection"], &ac); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(joined["connection"], &bc); err != nil {
		t.Fatal(err)
	}
	x, first := socket(t, h, s, ac)
	defer x.CloseNow()
	y, second := socket(t, h, s, bc)
	defer y.CloseNow()
	if first.Player != 1 || second.Player != 2 || first.Economy == nil || second.Economy == nil || first.Economy.Credits != 12000000 || second.Economy.Credits != 12000000 {
		t.Fatal("authorized initial wire snapshots lost chosen funds")
	}
	x.CloseNow()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(h.URL, "http") + "/api/v1/matches/" + ac["match_id"].(string) + "/socket"
	resumed, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resumed.CloseNow()
	resumed.SetReadLimit(4 << 20)
	resume := &pb.Envelope{Message: &pb.Envelope_Resume{Resume: &pb.ResumeMatch{Hello: &pb.ClientHello{MatchId: ac["match_id"].(string), Token: ac["token"].(string), Protocol: 1, Simulation: sim.Version, ContentHash: s.catalog.Hash()}, LastTick: first.Tick}}}
	raw, err := proto.Marshal(resume)
	if err != nil {
		t.Fatal(err)
	}
	if err := resumed.Write(ctx, websocket.MessageBinary, raw); err != nil {
		t.Fatal(err)
	}
	kind, raw, err := resumed.Read(ctx)
	if err != nil || kind != websocket.MessageBinary {
		t.Fatal("fresh authenticated Resume snapshot read", err)
	}
	msg := new(pb.Envelope)
	if err := proto.Unmarshal(raw, msg); err != nil {
		t.Fatal(err)
	}
	fresh := msg.GetSnapshot()
	if fresh == nil || fresh.Player != first.Player || fresh.Tick < first.Tick || fresh.Economy == nil || fresh.Economy.Credits != 12000000 || fresh.Metadata == nil || fresh.Metadata.Ruleset != "custom-v1" {
		t.Fatal("Resume did not retain owner, choice and current custom rules")
	}
	if fresh.Countdown != 0 {
		for {
			_, raw, err = resumed.Read(ctx)
			if err != nil {
				t.Fatal(err)
			}
			msg.Reset()
			if err := proto.Unmarshal(raw, msg); err != nil {
				t.Fatal(err)
			}
			if delta := msg.GetDelta(); delta != nil && delta.State != nil && delta.State.Countdown == 0 {
				break
			}
		}
	}
	raw, err = proto.Marshal(&pb.Envelope{Message: &pb.Envelope_Orders{Orders: &pb.OrderBatch{Sequence: 1, Orders: []*pb.Order{{Kind: "surrender"}}}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := resumed.Write(ctx, websocket.MessageBinary, raw); err != nil {
		t.Fatal(err)
	}
	var result *pb.MatchResult
	for result == nil {
		_, raw, err = y.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		msg.Reset()
		if err := proto.Unmarshal(raw, msg); err != nil {
			t.Fatal(err)
		}
		result = msg.GetResult()
	}
	if !result.Committed || result.Void || result.Outcome == nil || result.Outcome.WinningTeam != 2 || result.MatchId != ac["match_id"].(string) {
		t.Fatal("short legal-surrender result was not committed")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", h.URL+"/api/v1/replays/"+result.MatchId, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+a)
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	replayBytes, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || response.StatusCode != 200 || len(replayBytes) > 1<<20 {
		t.Fatal("authorized private replay download failed or exceeded fixture bound", err, response.StatusCode)
	}
	replay, err := sim.DecodeReplay(replayBytes)
	if err != nil || replay.Metadata.Simulation != sim.Version || replay.Metadata.Ruleset != "custom-v1" {
		t.Fatal("persisted replay lost current custom metadata", err)
	}
	initial, err := sim.Restore(s.catalog, replay.Initial)
	if err != nil || initial.StateCopy().StartingCredits != 12000000 {
		t.Fatal("replay Initial lost chosen starting-credit state", err)
	}
	for _, player := range initial.StateCopy().Players {
		if player.Credits != 12000000 {
			t.Fatal("replay Initial reconstructed a standard budget")
		}
	}
	final, err := replay.Seek(s.catalog, replay.FinalTick)
	if err != nil || final.StateCopy().StartingCredits != 12000000 || final.Outcome().WinningTeam != 2 {
		t.Fatal("complete persisted replay did not retain funds/outcome", err)
	}
	_, finalSave := startingMoneyState(t, s, result.MatchId)
	actual, err := sim.Restore(s.catalog, finalSave)
	if err != nil || final.Hash() != actual.Hash() {
		t.Fatal("persisted full Replay disagrees with actual final funded Save", err)
	}
	outsider := profile(t, h, "Outside private funds")
	assertStartingMoneyCode(t, request(t, h, "GET", "/api/v1/replays/"+result.MatchId, outsider, nil, 404), "replay_unavailable")
}
