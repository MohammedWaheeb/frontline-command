package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

func playerMatrixMap() content.Map {
	m := fixtureMap()
	m.ID = "synthetic-player-matrix"
	m.Title = "Synthetic player-count test"
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 56000, Y: 8000}}, content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	m.Fields = append(m.Fields, content.Field{ID: 4, Position: Vec{X: 49000, Y: 8000}, Credits: 36000000}, content.Field{ID: 5, Position: Vec{X: 14000, Y: 56000}, Credits: 36000000})
	return m
}
func botMatrixConfig(count int, teams bool) Config {
	cfg := Config{Map: playerMatrixMap(), Seed: 7821, Ruleset: "standard-v2"}
	factions := []string{"US", "IR", "SY", "SA"}
	for i := 0; i < count; i++ {
		team := uint32(i + 1)
		if teams {
			team = uint32(i%2 + 1)
		}
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(i + 1), Name: factions[i] + " test bot", Faction: factions[i], Team: team, AI: "normal"})
	}
	return cfg
}
func TestOneToFourPlayersDeterministicBotsAndSave(t *testing.T) {
	for count := 1; count <= 4; count++ {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			e, err := New(content.MustBase(), botMatrixConfig(count, false))
			if err != nil {
				t.Fatal(err)
			}
			other, err := New(e.catalog, botMatrixConfig(count, false))
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 1300; i++ {
				e.Advance()
				other.Advance()
				if i == 611 {
					data, err := other.Save()
					if err != nil {
						t.Fatal(err)
					}
					other, err = Restore(e.catalog, data)
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			if e.Hash() != other.Hash() {
				t.Fatal("bot simulation differs after save/restore")
			}
			for _, p := range e.state.Players {
				if p.LastSequence == 0 {
					t.Fatalf("bot%d issued no normal orders", p.ID)
				}
				own := 0
				for _, v := range e.state.Entities {
					if v.Owner == p.ID {
						own++
					}
				}
				if own <= 2 {
					t.Fatalf("bot%d did not build a paid economy", p.ID)
				}
			}
			if count == 1 && e.Outcome().Finished {
				t.Fatal("one-player custom auto-won without opponent")
			}
			t.Logf("players=%d tick=%d actors=%d deterministic hash=%s", count, e.Tick(), len(e.state.Entities), e.Hash())
		})
	}
}

func TestSingleCustomHasNoFreePracticeToolsAndEndsOnSurrender(t *testing.T) {
	cfg := botMatrixConfig(1, false)
	cfg.Players[0].AI = ""
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 101)
	if err = e.Submit(1, 1, []Order{{Kind: "practice_resources", Target: 1, Index: 999999}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 || e.state.Results[0].Code != "practice_only" {
		t.Fatal("single custom became free-resource practice", e.state.Results)
	}
	issue(t, e, 1, Order{Kind: "surrender"})
	if !e.Outcome().Finished || !e.player(1).Defeated {
		t.Fatal("single custom could not end")
	}
}

func TestBotsFinishThreeAndFourPlayerMatches(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("complete synthetic bot matches run without race instrumentation")
	}
	for _, entry := range []struct {
		count int
		teams bool
	}{{3, false}, {4, false}, {4, true}} {
		t.Run(fmt.Sprintf("%d-teams-%v", entry.count, entry.teams), func(t *testing.T) {
			e, err := New(content.MustBase(), botMatrixConfig(entry.count, entry.teams))
			if err != nil {
				t.Fatal(err)
			}
			for !e.Outcome().Finished && e.Tick() < 108101 {
				e.Advance()
			}
			if !e.Outcome().Finished {
				t.Fatal("standard90-minute match bound failed")
			}
			if e.Outcome().Reason != "elimination" {
				t.Errorf("synthetic bots did not resolve through ordinary elimination: %+v", e.Outcome())
			}
			t.Logf("%d bots teams=%v endedtick=%d outcome=%+v actors=%d", entry.count, entry.teams, e.Tick(), e.Outcome(), len(e.state.Entities))
		})
	}
}
