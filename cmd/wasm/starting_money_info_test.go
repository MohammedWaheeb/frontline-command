//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func startingMoneyInfoConfig(ruleset string, amount *int64) CreateConfig {
	return CreateConfig{Map: testMap(), Seed: 42, Ruleset: ruleset, StartingCredits: amount,
		Players: []sim.PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}}
}

func startingMoneyInfoOpen(t *testing.T, cfg CreateConfig) *Session {
	t.Helper()
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(data); err != nil {
		t.Fatal(err)
	}
	return s
}

func startingMoneyInfoCheck(t *testing.T, info Info, want *int64) {
	t.Helper()
	if (info.StartingCredits == nil) != (want == nil) || want != nil && *info.StartingCredits != *want {
		t.Fatalf("Info opening=%v want=%v", info.StartingCredits, want)
	}
	data, err := json.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		t.Fatal(err)
	}
	amount, present := fields["starting_credits"]
	if present != (want != nil) {
		t.Fatalf("Info JSON presence=%t want=%t: %s", present, want != nil, data)
	}
	if want != nil {
		var whole int64
		if err := json.Unmarshal(amount, &whole); err != nil || whole != *want {
			t.Fatalf("Info JSON must expose original WHOLE credits: %s, %v", amount, err)
		}
	}
}

func TestStartingMoneyInfoOriginalOpening(t *testing.T) {
	defaultWhole, customWhole := int64(6000), int64(12000)
	for _, tc := range []struct {
		name    string
		ruleset string
		amount  *int64
		want    *int64
	}{
		{"standard_omitted", "standard-v2", nil, &defaultWhole},
		{"standard_default", "standard-v2", &defaultWhole, &defaultWhole},
		{"custom_omitted", "custom-v1", nil, &defaultWhole},
		{"custom_default", "custom-v1", &defaultWhole, &defaultWhole},
		{"custom_opening", "custom-v1", &customWhole, &customWhole},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := startingMoneyInfoOpen(t, startingMoneyInfoConfig(tc.ruleset, tc.amount))
			startingMoneyInfoCheck(t, s.Info(), tc.want)
			if s.Info().Metadata.Simulation != sim.Version {
				t.Fatal("Info metadata is not the current engine version")
			}
			// A caller owns the returned pointer; it must not alias saved engine data.
			info := s.Info()
			*info.StartingCredits = 99
			startingMoneyInfoCheck(t, s.Info(), tc.want)
			s.Dispose()
			startingMoneyInfoCheck(t, s.Info(), nil)
		})
	}
}

func TestStartingMoneyInfoAfterSpendLoadReplayRestart(t *testing.T) {
	whole := int64(12000)
	s := startingMoneyInfoOpen(t, startingMoneyInfoConfig("custom-v1", &whole))
	if _, err := s.Step(100); err != nil {
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
	var rig uint32
	for _, e := range snap.Entities {
		if e.Owner == 1 && e.Type == "US.rig" {
			rig = e.Id
			break
		}
	}
	if rig == 0 {
		t.Fatal("authored public starting rig missing")
	}
	power, ok := s.catalog.Building("power")
	if !ok || power.Cost <= 0 {
		t.Fatal("real paid power rule missing")
	}
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "build", Entities: []uint32{rig}, Type: "power", Position: &pb.Vec{X: 13000, Y: 13000}})); err != nil {
		t.Fatal(err)
	}
	info, err := s.Step(1)
	if err != nil {
		t.Fatal(err)
	}
	startingMoneyInfoCheck(t, info, &whole)
	wire, err = s.View(1)
	if err != nil {
		t.Fatal(err)
	}
	if err := proto.Unmarshal(wire, snap); err != nil {
		t.Fatal(err)
	}
	if len(snap.Results) != 1 || !snap.Results[0].Accepted || snap.Results[0].Code != "ok" || snap.Results[0].Sequence != 1 || snap.Results[0].Tick != 101 {
		t.Fatalf("ordinary paid build was not accepted: %+v", snap.Results)
	}
	if snap.Economy == nil || snap.Economy.Credits != whole*sim.Scale-power.Cost {
		t.Fatalf("paid balance did not change by the real build cost: %+v", snap.Economy)
	}
	saved, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	archive, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	info, err = loaded.Load(saved.Data, saved.Local)
	if err != nil {
		t.Fatal(err)
	}
	startingMoneyInfoCheck(t, info, &whole)
	if hash, err := loaded.Hash(); err != nil || hash != saved.Hash {
		t.Fatal("actual loaded save changed the paid state", err)
	}
	playback, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	info, err = playback.LoadReplay(archive)
	if err != nil || !info.Replay {
		t.Fatal("actual current replay did not load", err)
	}
	startingMoneyInfoCheck(t, info, &whole)
	info, err = playback.SeekReplay(saved.Tick)
	if err != nil {
		t.Fatal(err)
	}
	startingMoneyInfoCheck(t, info, &whole)
	if hash, err := playback.Hash(); err != nil || hash != saved.Hash {
		t.Fatal("replay did not reconstruct the actual paid state", err)
	}
	info, err = loaded.Restart()
	if err != nil || info.Tick != 0 {
		t.Fatal("ordinary loaded match did not restart", err)
	}
	startingMoneyInfoCheck(t, info, &whole)
	for _, p := range loaded.engine.StateCopy().Players {
		if p.Credits != whole*sim.Scale {
			t.Fatal("restart did not restore the original equal opening")
		}
	}
}

func TestStartingMoneyInfoOmitsPrescribedBudgets(t *testing.T) {
	mission := content.Mission{ID: "starting-money-info-mission", Version: "1", MapID: testMap().ID, Title: "Info authored opening fixture", Faction: "US", Mode: "tutorial", DefaultBases: true,
		Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 2200000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Script", Team: 2, Credits: 1700000, Controller: "script"}},
		Objectives: []content.MissionObjective{{ID: "timer", Text: "Fixture", Condition: content.MissionCondition{Kind: "timer", Tick: 300}}}}
	for _, ruleset := range []string{"", "custom-v1", "practice-v1"} {
		t.Run(ruleset, func(t *testing.T) {
			s := startingMoneyInfoOpen(t, CreateConfig{Map: testMap(), Mission: &mission, Seed: 42, Difficulty: "normal", Ruleset: ruleset})
			wantRuleset := "scenario-v2"
			if ruleset == "practice-v1" {
				wantRuleset = "practice-v1"
			}
			if s.Info().Metadata.Ruleset != wantRuleset {
				t.Fatal("prescribed fixture is not the actual scenario/practice ruleset")
			}
			startingMoneyInfoCheck(t, s.Info(), nil)
			if _, err := s.Step(1); err != nil {
				t.Fatal(err)
			}
			saved, err := s.Save()
			if err != nil {
				t.Fatal(err)
			}
			archive, err := s.ExportReplay()
			if err != nil {
				t.Fatal(err)
			}
			loaded, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			info, err := loaded.Load(saved.Data, saved.Local)
			if err != nil {
				t.Fatal(err)
			}
			startingMoneyInfoCheck(t, info, nil)
			info, err = loaded.Restart()
			if err != nil {
				t.Fatal(err)
			}
			startingMoneyInfoCheck(t, info, nil)
			playback, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			info, err = playback.LoadReplay(archive)
			if err != nil {
				t.Fatal(err)
			}
			startingMoneyInfoCheck(t, info, nil)
			info, err = playback.SeekReplay(saved.Tick)
			if err != nil {
				t.Fatal(err)
			}
			startingMoneyInfoCheck(t, info, nil)
		})
	}
}
