package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func teamFixture(t *testing.T) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 73, Players: []PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}, {ID: 3, Name: "C", Faction: "SA", Team: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}
func TestTeamSurrenderRequiresUnanimityAndKeepsVotesPrivate(t *testing.T) {
	e := teamFixture(t)
	issue(t, e, 1, Order{Kind: "surrender_vote"})
	if e.player(1).Defeated || e.player(3).Defeated {
		t.Fatal("one vote surrendered teammate")
	}
	for _, id := range []PlayerID{2, 3} {
		v, _ := e.PlayerView(id)
		for _, p := range v.Players {
			if p.ID == 1 && p.SurrenderVote != (id == 3) {
				t.Fatal("vote visibility incorrect")
			}
		}
	}
	issue(t, e, 1, Order{Kind: "surrender_cancel"})
	issue(t, e, 3, Order{Kind: "surrender_vote"})
	if e.Outcome().Finished {
		t.Fatal("canceled vote counted")
	}
	saved, _ := e.Save()
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	replay, _ := NewReplay(restored)
	issue(t, e, 1, Order{Kind: "surrender_vote"})
	issue(t, restored, 1, Order{Kind: "surrender_vote"})
	if !e.Outcome().Finished || e.Outcome().WinningTeam != 2 || !e.player(3).Defeated {
		t.Fatal("unanimous team did not surrender")
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("saved votes diverged")
	}
	if err := replay.Capture(restored, false); err != nil {
		t.Fatal(err)
	}
	seek, err := replay.Seek(e.catalog, restored.Tick())
	if err != nil || seek.Hash() != restored.Hash() {
		t.Fatal("surrender replay differs", err)
	}
}
func TestIndividualSurrenderDoesNotEliminateTeammate(t *testing.T) {
	e := teamFixture(t)
	issue(t, e, 1, Order{Kind: "surrender"})
	if !e.player(1).Defeated || e.player(3).Defeated || e.Outcome().Finished {
		t.Fatal("individual surrender affected teammate")
	}
	issue(t, e, 3, Order{Kind: "surrender_vote"})
	if e.Outcome().WinningTeam != 2 {
		t.Fatal("already defeated teammate blocked vote")
	}
}
func TestComputerAllyAcceptsUnanimousHumanSurrender(t *testing.T) {
	e := teamFixture(t)
	e.player(3).Controller = "ai"
	e.player(3).AI = "normal"
	issue(t, e, 1, Order{Kind: "surrender_vote"})
	if !e.player(3).Defeated || e.Outcome().WinningTeam != 2 {
		t.Fatal("computer ally failed to follow team vote")
	}
}
