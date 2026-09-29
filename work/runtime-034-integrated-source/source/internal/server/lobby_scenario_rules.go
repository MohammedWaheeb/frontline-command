package server

import (
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

type ScenarioStartingCredits struct {
	Player  sim.PlayerID `json:"player"`
	Credits int64        `json:"credits_milli"`
}
type LobbyScenarioRules struct {
	Ruleset         string                    `json:"ruleset"`
	MissionVersion  string                    `json:"mission_version"`
	Difficulty      string                    `json:"difficulty"`
	RulesNotice     string                    `json:"rules_notice"`
	Resumed         bool                      `json:"resumed"`
	StartingCredits []ScenarioStartingCredits `json:"starting_credits,omitempty"`
}

func (s *Server) scenarioLobbyRules(m content.Map, mission content.Mission, difficulty string, resumed bool) (*LobbyScenarioRules, error) {
	rules := &LobbyScenarioRules{Ruleset: "scenario-v2", MissionVersion: mission.Version, Difficulty: difficulty, RulesNotice: mission.RulesNotice, Resumed: resumed}
	// A resumed game uses saved current balances, not another starting payout.
	// Do not expose private current enemy/ally balances in public lobby metadata.
	if resumed {
		return rules, nil
	}
	// Ask the same Go mission constructor that applies difficulty. Do not maintain
	// a second arithmetic implementation in the service or client.
	engine, err := sim.NewMission(s.catalog, m, mission, difficulty, 1)
	if err != nil {
		return nil, err
	}
	for _, player := range engine.StateCopy().Players {
		rules.StartingCredits = append(rules.StartingCredits, ScenarioStartingCredits{player.ID, player.Credits})
	}
	return rules, nil
}
