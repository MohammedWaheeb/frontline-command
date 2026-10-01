package server

import (
	"encoding/json"
	"testing"
)

func TestLobbyStartingCreditsDuplicateNullCreateIngress(t *testing.T) {
	full := `{"ruleset":"custom-v1","speed":1,"supply_cap":100,"fog":true,"strategic_operations":true,`
	valid := full + `"starting_credits":10000}`
	for _, tc := range []struct {
		name, fragment, code string
		status               int
		whole                uint32
	}{
		{"single-null", `"rules":` + full + `"starting_credits":null}`, "invalid_starting_credits", 400, 0},
		{"exact-last-null", `"rules":` + full + `"starting_credits":10000,"starting_credits":null}`, "invalid_starting_credits", 400, 0},
		{"casefold-last-null", `"rules":` + full + `"starting_credits":10000,"STARTING_CREDITS":null}`, "invalid_starting_credits", 400, 0},
		{"null-then-number", `"rules":` + full + `"starting_credits":null,"STARTING_CREDITS":12000}`, "", 201, 12000},
		{"numeric-last-wins", `"rules":` + full + `"starting_credits":10000,"STARTING_CREDITS":20000}`, "", 201, 20000},
		{"null-then-omitted-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"speed":1}`, "invalid_starting_credits", 400, 0},
		{"null-then-numeric-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"starting_credits":12500}`, "", 201, 12500},
		{"null-then-default-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"starting_credits":6000}`, "", 201, 6000},
		{"unknown-nested-field", `"rules":` + full + `"starting_credits":10000,"unknown_nested":{"starting_credits":20000}}`, "invalid_request", 400, 0},
		{"unknown-internal-flag", `"rules":` + full + `"starting_credits":10000,"startingCreditsNull":false}`, "invalid_request", 400, 0},
		{"unknown-object-then-valid", `"rules":` + valid + `,"RULES":{"unknown_nested":{}},"rules":` + valid, "invalid_request", 400, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, h := testServer(t)
			s.maps[testMap().ID] = testMap()
			host := profile(t, h, "Duplicate ingress host")
			// RawMessage deliberately preserves duplicate JSON members and their
			// case/order through the existing authenticated real HTTP helper.
			raw := json.RawMessage(`{"map_id":"server-fixture","mode":"custom","private":true,"faction":"US",` + tc.fragment + `}`)
			response := request(t, h, "POST", "/api/v1/lobbies", host, raw, tc.status)
			if tc.code != "" {
				assertStartingMoneyCode(t, response, tc.code)
				s.mu.Lock()
				count := len(s.lobbies)
				s.mu.Unlock()
				if count != 0 {
					t.Fatal("rejected effective null/unknown field created a lobby")
				}
				return
			}
			l := responseLobby(t, response)
			label, stored, balance := "custom-v1", int64(tc.whole)*1000, int64(tc.whole)*1000
			if tc.whole == 6000 {
				label, stored, balance = "standard-v2", 0, 6000000
			}
			if l.Rules == nil || l.Rules.StartingCredits != tc.whole || l.Rules.Ruleset != label {
				t.Fatal("accepted last numeric value was not canonical whole credits", l.Rules)
			}
			readyTestLobby(t, s, h, l.ID, host)
			started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201))
			state, _ := startingMoneyState(t, s, started.MatchID)
			if state.StartingCredits != stored || state.Metadata.Ruleset != label || len(state.Players) != 1 || state.Players[0].Credits != balance {
				t.Fatal("real start did not honor the accepted effective numeric value")
			}
		})
	}
}

func TestLobbyStartingCreditsDuplicateNullPatchIngress(t *testing.T) {
	full := `{"ruleset":"custom-v1","speed":1,"supply_cap":100,"fog":true,"strategic_operations":true,`
	valid := full + `"starting_credits":10000}`
	for _, tc := range []struct {
		name, fragment, code string
		status               int
		whole                uint32
	}{
		{"casefold-last-null", `"rules":` + full + `"starting_credits":10000,"STARTING_CREDITS":null}`, "invalid_starting_credits", 400, 0},
		{"null-then-omitted-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"speed":1}`, "invalid_starting_credits", 400, 0},
		{"null-then-number", `"rules":` + full + `"starting_credits":null,"STARTING_CREDITS":25000}`, "", 200, 25000},
		{"null-then-numeric-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"starting_credits":12500}`, "", 200, 12500},
		{"null-then-default-object", `"rules":` + valid + `,"RULES":{"STARTING_CREDITS":null},"rules":{"starting_credits":6000}`, "", 200, 6000},
		{"unknown-nested-field", `"rules":` + full + `"starting_credits":10000,"unknown_nested":{"starting_credits":20000}}`, "invalid_request", 400, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, h := testServer(t)
			s.maps[testMap().ID] = testMap()
			host := profile(t, h, "Duplicate patch host")
			l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, map[string]any{"map_id": testMap().ID, "mode": "custom", "private": true, "faction": "US", "rules": startingMoneyRules(12000, "custom-v1")}, 201))
			readyTestLobby(t, s, h, l.ID, host)
			before := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
			raw := json.RawMessage(`{"name":"Pending funds change",` + tc.fragment + `}`)
			response := request(t, h, "PATCH", "/api/v1/lobbies/"+l.ID, host, raw, tc.status)
			if tc.code != "" {
				assertStartingMoneyCode(t, response, tc.code)
				after := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, host, nil, 200))
				if after.Name != before.Name || after.Revision != before.Revision || !after.Private || *after.Rules != *before.Rules || !after.Slots[0].Ready || !after.Slots[0].AssetsReady {
					t.Fatal("rejected effective null/unknown field partially mutated a ready lobby")
				}
				return
			}
			after := responseLobby(t, response)
			label, stored, balance := "custom-v1", int64(tc.whole)*1000, int64(tc.whole)*1000
			if tc.whole == 6000 {
				label, stored, balance = "standard-v2", 0, 6000000
			}
			if after.Rules == nil || after.Rules.StartingCredits != tc.whole || after.Rules.Ruleset != label || after.Revision <= before.Revision || after.Slots[0].Ready || after.Slots[0].AssetsReady {
				t.Fatal("last numeric patch did not persist funds/reset readiness")
			}
			readyTestLobby(t, s, h, l.ID, host)
			started := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201))
			state, _ := startingMoneyState(t, s, started.MatchID)
			if state.StartingCredits != stored || state.Metadata.Ruleset != label || len(state.Players) != 1 || state.Players[0].Credits != balance {
				t.Fatal("real patched start lost the effective numeric choice")
			}
		})
	}
}

func TestLobbyRulesDefaultJSONShapeUnchanged(t *testing.T) {
	standard := standardLobbyRules()
	raw, err := json.Marshal(standard)
	if err != nil || string(raw) != `{"ruleset":"standard-v2","speed":1,"starting_credits":6000,"supply_cap":100,"fog":true,"strategic_operations":true}` {
		t.Fatal("private ingress flag changed the default public JSON bytes", err, string(raw))
	}
	var decoded LobbyRules
	if err := json.Unmarshal(raw, &decoded); err != nil || decoded != standard || decoded.startingCreditsNull {
		t.Fatal("ordinary default rules no longer round-trip without internal null state", err)
	}
}
