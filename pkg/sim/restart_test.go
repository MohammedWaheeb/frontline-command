package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestRestartPreservesOriginalUnsortedSpawnSlots(t *testing.T) {
	config := Config{Map: fixtureMap(), Seed: 902, Ruleset: "practice-v1", Players: []PlayerConfig{{ID: 2, Name: "First slot", Faction: "IR", Team: 2}, {ID: 1, Name: "Second slot", Faction: "US", Team: 1}}}
	e, err := New(content.MustBase(), config)
	if err != nil {
		t.Fatal(err)
	}
	original := e.Hash()
	if e.entity(1).Owner != 2 || e.entity(1).Position != config.Map.Spawns[0].Position {
		t.Fatal("fixture did not use input slots")
	}
	ticks(e, 150)
	e.player(1).Credits = 1
	e.entity(2).HP /= 2
	e.state.Fields[0].Remaining = 2
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	e, err = Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	before := e.Hash()
	restarted, err := e.Restart()
	if err != nil {
		t.Fatal(err)
	}
	if restarted.Hash() != original || e.Hash() != before || restarted.entity(1).Owner != 2 {
		t.Fatal("restart changed slots, blueprint, or existing match")
	}
}
func TestMissionRestartResetsProgressRewardsAndPracticeMarker(t *testing.T) {
	for _, practice := range []bool{false, true} {
		t.Run(map[bool]string{false: "mission", true: "practice"}[practice], func(t *testing.T) {
			var e *Engine
			var err error
			if practice {
				e, err = NewPracticeMission(content.MustBase(), fixtureMap(), missionFixture(), "normal", 99)
			} else {
				e, err = NewMission(content.MustBase(), fixtureMap(), missionFixture(), "normal", 99)
			}
			if err != nil {
				t.Fatal(err)
			}
			original := e.Hash()
			ticks(e, 180)
			if e.state.Mission.Checkpoint != "midpoint" {
				t.Fatal("fixture has no progress")
			}
			data, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			e, err = Restore(e.catalog, data)
			if err != nil {
				t.Fatal(err)
			}
			restarted, err := e.Restart()
			if err != nil {
				t.Fatal(err)
			}
			if restarted.Hash() != original || restarted.player(1).Credits != 6000000 || restarted.state.Mission.Checkpoint == "midpoint" {
				t.Fatal("mission state survived restart")
			}
			if (restarted.state.Metadata.Ruleset == "practice-v1") != practice {
				t.Fatal("restart changed practice eligibility")
			}
		})
	}
}
