package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestAIUsesBaseEconomy(t *testing.T) {
	if testing.Short() {
		t.Skip("headless economic integration")
	}
	e := fixture(t)
	e.player(1).AI = "hard"
	e.player(2).AI = "normal"
	ticks(e, 7200)
	for _, p := range e.state.Players {
		roles := map[string]int{}
		for _, v := range e.state.Entities {
			if v.Owner == p.ID {
				roles[e.role(v)]++
			}
		}
		t.Logf("player %d credits=%d earned=%d spent=%d supply=%d structures/units=%v", p.ID, p.Credits/1000, p.Income/1000, p.Spent/1000, p.Supply, roles)
		if p.Income < 1200000 {
			for _, v := range e.state.Entities {
				if v.Owner == p.ID {
					t.Logf("entity %d %s pos=%v state=%s complete=%v work=%d builder=%d orders=%+v path=%v", v.ID, v.Type, v.Position, v.State, v.Complete, v.Work, v.Builder, v.Orders, v.Path)
				}
			}
			t.Fatalf("AI %d failed to build and operate its economy", p.ID)
		}
		if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
			t.Fatal("AI exceeded human economic rules")
		}
	}
}

func TestAICompleteStandardMatches(t *testing.T) {
	if testing.Short() {
		t.Skip("long complete-match integration")
	}
	for _, factions := range [][2]string{{"US", "IR"}, {"US", "SY"}, {"US", "SA"}, {"IR", "SY"}, {"IR", "SA"}, {"SY", "SA"}, {"US", "US"}, {"IR", "IR"}, {"SY", "SY"}, {"SA", "SA"}} {
		t.Run(factions[0]+"_"+factions[1], func(t *testing.T) {
			m := fixtureMap()
			m.Fields = append(m.Fields, content.Field{ID: 4, Position: Vec{X: 26000, Y: 12000}, Credits: 24000000}, content.Field{ID: 5, Position: Vec{X: 39000, Y: 52000}, Credits: 24000000})
			e, err := New(content.MustBase(), Config{Map: m, Seed: 73, Players: []PlayerConfig{{ID: 1, Faction: factions[0], Team: 1, AI: "hard"}, {ID: 2, Faction: factions[1], Team: 2, AI: "hard"}}})
			if err != nil {
				t.Fatal(err)
			}
			for e.Tick() < seconds(90*60)+101 && !e.Outcome().Finished {
				e.Advance()
				if e.Tick()%seconds(300) == 0 {
					for _, p := range e.state.Players {
						t.Logf("minute=%d faction=%s credits=%d income=%d supply=%d tier=%d intent=%s", e.Tick()/1200, p.Faction, p.Credits/1000, p.Income/1000, p.Supply, p.Tier, p.AIIntent)
						if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
							t.Fatal("AI economic rule violation")
						}
					}
				}
			}
			t.Logf("outcome=%+v actors=%d", e.Outcome(), len(e.state.Entities))
			if !e.Outcome().Finished || e.Outcome().Reason == "time_limit" {
				for _, v := range e.state.Entities {
					t.Logf("remaining %s owner=%d position=%v state=%s orders=%v", v.Type, v.Owner, v.Position, v.State, v.Orders)
				}
				t.Fatal("AI failed to finish a standard match before the safety limit")
			}
		})
	}
}
