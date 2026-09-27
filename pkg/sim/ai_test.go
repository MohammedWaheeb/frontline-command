package sim

import "testing"

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
