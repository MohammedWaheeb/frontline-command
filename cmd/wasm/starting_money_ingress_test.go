//go:build !(js && wasm)

package main

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func startingMoneyIngressConfig(ruleset string) CreateConfig {
	return CreateConfig{Map: testMap(), Seed: 42, Ruleset: ruleset, Players: []sim.PlayerConfig{
		{ID: 1, Name: "Alpha", Faction: "US", Team: 1},
		{ID: 2, Name: "Bravo", Faction: "IR", Team: 2},
	}}
}

func startingMoneyIngressAmount(n int64) *int64 { return &n }

// Raw numeric/type cases still cross the actual public JSON decoder.
func startingMoneyIngressData(t *testing.T, cfg CreateConfig, raw string) []byte {
	t.Helper()
	b, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if raw == "" {
		return b
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(b, &fields); err != nil {
		t.Fatal(err)
	}
	fields["starting_credits"] = json.RawMessage(raw)
	b, err = json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func startingMoneyIngressOpen(t *testing.T, cfg CreateConfig) *Session {
	t.Helper()
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(startingMoneyIngressData(t, cfg, "")); err != nil {
		t.Fatal(err)
	}
	return s
}

func startingMoneyIngressCheck(t *testing.T, s *Session, opening, savedOption int64, ruleset string) {
	t.Helper()
	st := s.engine.StateCopy()
	if st.StartingCredits != savedOption || len(st.Players) != 2 || s.Info().Tick != 0 {
		t.Fatalf("opening option=%d players=%d tick=%d", st.StartingCredits, len(st.Players), s.Info().Tick)
	}
	if st.Metadata.Ruleset != ruleset || st.Metadata.Simulation != sim.Version {
		t.Fatalf("unexpected opening metadata: %+v", st.Metadata)
	}
	for _, p := range st.Players {
		if p.Credits != opening {
			t.Fatalf("player %d credits=%d want=%d", p.ID, p.Credits, opening)
		}
		if !s.isLocal(p.ID) {
			if _, err := s.View(p.ID); code(err) != "unauthorized_view" {
				t.Fatalf("nonlocal opening view admitted: %v", err)
			}
			continue
		}
		wire, err := s.View(p.ID)
		if err != nil {
			t.Fatal(err)
		}
		snap := new(pb.PlayerSnapshot)
		if err := proto.Unmarshal(wire, snap); err != nil {
			t.Fatal(err)
		}
		if snap.Economy == nil || snap.Economy.Credits != opening {
			t.Fatalf("owner %d wire must contain engine milliMoney exactly once: %+v", p.ID, snap.Economy)
		}
	}
}

func TestStartingMoneyIngressDefaultCanonicalBytes(t *testing.T) {
	var baseline []byte
	var baselineHash string
	for _, tc := range []struct {
		name    string
		ruleset string
		amount  *int64
	}{
		{"omitted", "", nil},
		{"standard_omitted", "standard-v2", nil},
		{"standard_6000", "standard-v2", startingMoneyIngressAmount(6000)},
		{"custom_omitted", "custom-v1", nil},
		{"custom_6000", "custom-v1", startingMoneyIngressAmount(6000)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := startingMoneyIngressConfig(tc.ruleset)
			cfg.StartingCredits = tc.amount
			s := startingMoneyIngressOpen(t, cfg)
			startingMoneyIngressCheck(t, s, sim.DefaultStartingCredits, 0, "standard-v2")
			saved, err := s.Save()
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(saved.Data, []byte(`"starting_credits"`)) {
				t.Fatal("canonical default must omit the saved opening option")
			}
			if baseline == nil {
				baseline, baselineHash = append([]byte(nil), saved.Data...), saved.Hash
			} else if !bytes.Equal(saved.Data, baseline) || saved.Hash != baselineHash {
				t.Fatal("omitted/explicit/custom default changed same-source save bytes or state hash")
			}
		})
	}
}

func TestStartingMoneyIngressWholeCreditsAndOwnerWire(t *testing.T) {
	for _, tc := range []struct {
		name  string
		whole int64
		ai    bool
	}{
		{"minimum", 1, false},
		{"custom", 12000, false},
		{"maximum", 1000000, false},
		{"equal_ai_allocation", 12000, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := startingMoneyIngressConfig("custom-v1")
			cfg.StartingCredits = startingMoneyIngressAmount(tc.whole)
			if tc.ai {
				cfg.Players[1].AI = "normal"
			}
			s := startingMoneyIngressOpen(t, cfg)
			want := tc.whole * sim.Scale
			startingMoneyIngressCheck(t, s, want, want, "custom-v1")
		})
	}
}

func TestStartingMoneyIngressInvalidKeepsActiveMatch(t *testing.T) {
	cfg := startingMoneyIngressConfig("custom-v1")
	cfg.StartingCredits = startingMoneyIngressAmount(12000)
	s := startingMoneyIngressOpen(t, cfg)
	if _, err := s.Step(100); err != nil {
		t.Fatal(err)
	}
	// Leave an ordinary public move pending while rejected creates are tried.
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 16000, Y: 12000}})); err != nil {
		t.Fatal(err)
	}
	before, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	info, engine, recorder := s.Info(), s.engine, s.recorder
	type invalidCase struct {
		name string
		data []byte
	}
	var cases []invalidCase
	for _, raw := range []string{"0", "-1", "1.5", "6000.0", "1000001", "9223372036854775808", `"12000"`, "true", "[]", "{}", "null"} {
		cases = append(cases, invalidCase{raw, startingMoneyIngressData(t, cfg, raw)})
	}
	null := startingMoneyIngressData(t, cfg, "null")
	cases = append(cases, invalidCase{"uppercase_null", bytes.Replace(null, []byte(`"starting_credits"`), []byte(`"STARTING_CREDITS"`), 1)})
	for _, ruleset := range []string{"", "standard-v2", "ranked-v1", "practice-v1", "unknown-v1"} {
		bad := startingMoneyIngressConfig(ruleset)
		cases = append(cases, invalidCase{"nondefault_" + ruleset, startingMoneyIngressData(t, bad, "12000")})
	}
	for _, extra := range []string{`,"starting_money":12000}`, `,"mode":"ranked"}`, `,"rated":true}`} {
		b := startingMoneyIngressData(t, cfg, "")
		cases = append(cases, invalidCase{"unknown_" + extra, append(append([]byte(nil), b[:len(b)-1]...), []byte(extra)...)})
	}
	valid := startingMoneyIngressData(t, cfg, "")
	cases = append(cases, invalidCase{"trailing", append(append([]byte(nil), valid...), []byte(" {}")...)})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.Create(tc.data)
			e, ok := err.(*Error)
			if !ok || e.Code != "invalid_config" || !e.Recoverable {
				t.Fatalf("expected recoverable invalid_config, got %#v", err)
			}
			after, err := s.Save()
			if err != nil {
				t.Fatal(err)
			}
			if s.engine != engine || s.recorder != recorder || !reflect.DeepEqual(s.Info(), info) || !bytes.Equal(after.Data, before.Data) || after.Hash != before.Hash {
				t.Fatal("rejected create replaced or changed the active match, pending command or recorder")
			}
		})
	}
	if _, err := s.Step(1); err != nil {
		t.Fatal(err)
	}
	wire, err := s.View(1)
	if err != nil {
		t.Fatal(err)
	}
	snap := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(wire, snap); err != nil {
		t.Fatal(err)
	}
	if len(snap.Results) != 1 || !snap.Results[0].Accepted || snap.Results[0].Sequence != 1 {
		t.Fatalf("pending public move did not survive invalid creates: %+v", snap.Results)
	}
}

func TestStartingMoneyIngressPrescribedBudgets(t *testing.T) {
	mission := content.Mission{ID: "starting-money-mission", Version: "1", MapID: testMap().ID, Title: "Authored opening fixture", Faction: "US", Mode: "tutorial", DefaultBases: true,
		Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 2200000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Script", Team: 2, Credits: 1700000, Controller: "script"}},
		Objectives: []content.MissionObjective{{ID: "timer", Text: "Fixture", Condition: content.MissionCondition{Kind: "timer", Tick: 300}}}}
	for _, ruleset := range []string{"", "custom-v1", "practice-v1"} {
		t.Run("mission_"+ruleset, func(t *testing.T) {
			cfg := CreateConfig{Map: testMap(), Mission: &mission, Seed: 42, Difficulty: "normal", Ruleset: ruleset}
			s := startingMoneyIngressOpen(t, cfg)
			st := s.engine.StateCopy()
			if st.StartingCredits != 0 || st.Mission == nil || len(st.Players) != 2 || st.Players[0].Credits != 2200000 || st.Players[1].Credits != 1700000 {
				t.Fatal("omitted option changed authored unequal mission budgets")
			}
			before, err := s.Save()
			if err != nil {
				t.Fatal(err)
			}
			for _, raw := range []string{"6000", "12000", "uppercase_6000"} {
				data := startingMoneyIngressData(t, cfg, "6000")
				if raw == "uppercase_6000" {
					data = bytes.Replace(data, []byte(`"starting_credits"`), []byte(`"STARTING_CREDITS"`), 1)
				} else {
					data = startingMoneyIngressData(t, cfg, raw)
				}
				_, err := s.Create(data)
				e, ok := err.(*Error)
				if !ok || e.Code != "invalid_config" || !e.Recoverable {
					t.Fatalf("explicit prescribed option %s must reject: %#v", raw, err)
				}
				after, err := s.Save()
				if err != nil || !bytes.Equal(after.Data, before.Data) {
					t.Fatal("rejected mission option changed active authored state", err)
				}
			}
		})
	}
	for _, kind := range []string{"practice", "tutorial_faction"} {
		cfg := startingMoneyIngressConfig("custom-v1")
		if kind == "practice" {
			cfg.Ruleset = "practice-v1"
		} else {
			cfg.TutorialFaction = "US"
		}
		for _, raw := range []string{"6000", "12000"} {
			s, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			_, err = s.Create(startingMoneyIngressData(t, cfg, raw))
			e, ok := err.(*Error)
			if !ok || e.Code != "invalid_config" || !e.Recoverable || s.engine != nil {
				t.Fatalf("explicit %s budget must reject before installation: %#v", kind, err)
			}
		}
	}
}

func TestStartingMoneyIngressEffectiveJSONOption(t *testing.T) {
	// encoding/json folds tagged key names and applies duplicate keys in order.
	// The null check must use that same effective value, not a case-sensitive map.
	for _, tc := range []struct {
		name  string
		first string
		last  string
		want  int64
	}{
		{"uppercase_value", "", "12000", 12000000},
		{"earlier_null_last_custom", "null", "12000", 12000000},
		{"earlier_custom_last_default", "12000", "6000", 0},
		{"earlier_default_last_null", "6000", "null", -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := startingMoneyIngressConfig("custom-v1")
			data := startingMoneyIngressData(t, cfg, tc.first)
			data = append(append([]byte(nil), data[:len(data)-1]...), []byte(`,"STARTING_CREDITS":`+tc.last+`}`)...)
			s, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			_, err = s.Create(data)
			if tc.want < 0 {
				e, ok := err.(*Error)
				if !ok || e.Code != "invalid_config" || !e.Recoverable || s.engine != nil {
					t.Fatalf("effective final null must reject: %#v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			opening, ruleset := tc.want, "custom-v1"
			if tc.want == 0 {
				opening, ruleset = sim.DefaultStartingCredits, "standard-v2"
			}
			startingMoneyIngressCheck(t, s, opening, tc.want, ruleset)
		})
	}
}
