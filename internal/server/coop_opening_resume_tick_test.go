package server

import (
	"context"
	"encoding/json"
	"testing"

	"frontlinecommand/pkg/sim"
)

// The checkpoint is produced by the real mission constructor and saved without
// editing metadata/state. This HTTP control is separate from ordinary UI proof.
func TestCoopOpeningResumeTickIsExplicitOnlyForResume(t *testing.T) {
	s, h := testServer(t)
	m, mission := scenarioFixture()
	s.maps[m.ID], s.missions[mission.ID] = m, mission
	engine, err := sim.NewMission(s.catalog, m, mission, "normal", 42)
	if err != nil {
		t.Fatal(err)
	}
	if engine.Tick() != 0 {
		t.Fatal("genuine opening must be tick0", engine.Tick())
	}
	data, err := engine.Save()
	if err != nil {
		t.Fatal(err)
	}
	a, b := profile(t, h, "Opening host"), profile(t, h, "Opening peer")
	pa, err := s.repo.Authenticate(context.Background(), a)
	if err != nil {
		t.Fatal(err)
	}
	pb, err := s.repo.Authenticate(context.Background(), b)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.repo.PutSharedSave(context.Background(), []string{pa.ID, pb.ID}, "real-opening-0", "Co-op: opening", data); err != nil {
		t.Fatal(err)
	}
	field := func(response map[string]json.RawMessage, present bool) Lobby {
		t.Helper()
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(response["lobby"], &fields); err != nil {
			t.Fatal(err)
		}
		tick, found := fields["resume_tick"]
		if found != present {
			t.Fatalf("resume_tick presence=%t want=%t: %s", found, present, response["lobby"])
		}
		if found && string(tick) != "0" {
			t.Fatal("opening tick must be explicit numeric0", string(tick))
		}
		var lobby Lobby
		if err := json.Unmarshal(response["lobby"], &lobby); err != nil {
			t.Fatal(err)
		}
		return lobby
	}
	for i, token := range []string{a, b} {
		lobby := field(request(t, h, "POST", "/api/v1/saves/real-opening-0/coop-lobby", token, map[string]any{"player": i + 1, "private": true}, 201), true)
		field(request(t, h, "GET", "/api/v1/lobbies/"+lobby.ID, token, nil, 200), true)
		if lobby.ScenarioRules == nil || !lobby.ScenarioRules.Resumed || len(lobby.ScenarioRules.StartingCredits) != 0 {
			t.Fatal("resume must preserve balances rather than advertise new starting credits")
		}
		for _, slot := range lobby.Slots {
			if slot.Player == sim.PlayerID(i+1) && slot.Color != engine.StateCopy().Players[i].Color {
				t.Fatal("saved opening color changed")
			}
		}
	}
	coopToken := profile(t, h, "Fresh co-op")
	field(request(t, h, "POST", "/api/v1/missions/"+mission.ID+"/lobby", coopToken, map[string]any{"difficulty": "normal"}, 201), false)
	ordinaryToken := profile(t, h, "Ordinary lobby")
	field(request(t, h, "POST", "/api/v1/lobbies", ordinaryToken, map[string]any{"name": "Ordinary", "map_id": m.ID, "mode": "custom", "private": true, "faction": "US"}, 201), false)
}
