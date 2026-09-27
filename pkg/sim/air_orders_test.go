package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestPatrolCyclesAndSurvivesSaveReplay(t *testing.T) {
	e := fixture(t)
	unit := e.spawn("US.rifle", 1, Vec{X: 22000, Y: 22000}, true, 0)
	e.updateFog()
	replay, _ := NewReplay(e)
	issue(t, e, 1, Order{Kind: "patrol", Entities: []ID{unit.ID}, Position: Vec{X: 26000, Y: 22000}})
	seen := map[int32]bool{}
	for i := 0; i < 140; i++ {
		e.Advance()
		if len(unit.Orders) > 0 {
			seen[unit.Orders[0].Index] = true
		}
	}
	if len(seen) != 2 || len(unit.Orders) != 1 || unit.Orders[0].Kind != "patrol" {
		t.Fatal("patrol did not cycle", seen, unit.Position)
	}
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 100)
	ticks(restored, 100)
	if restored.Hash() != e.Hash() {
		t.Fatal("patrol restore diverged")
	}
	replay.Capture(e, false)
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("patrol replay", err)
	}
	unit.Orders[0].Index = 9
	save, _ = e.Save()
	if _, err := Restore(e.catalog, save); err == nil {
		t.Fatal("accepted unsafe patrol index")
	}
}

func TestEscortFollowsAlliedPlayerAndKeepsTargetWhenChasing(t *testing.T) {
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 56000, Y: 8000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "SA", Team: 1}, {ID: 3, Faction: "IR", Team: 3}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	ally := e.spawn("SA.tank", 2, Vec{X: 23000, Y: 24000}, true, 0)
	escort := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 24000}, true, 0)
	enemy := e.spawn("IR.rifle", 3, Vec{X: 27000, Y: 24000}, true, 0)
	e.updateFog()
	if got := e.execute(1, Order{Kind: "escort", Entities: []ID{escort.ID}, Target: enemy.ID}); got != "friendly_target_required" {
		t.Fatal("enemy escort accepted", got)
	}
	issue(t, e, 1, Order{Kind: "escort", Entities: []ID{escort.ID}, Target: ally.ID})
	for i := 0; i < 20; i++ {
		e.Advance()
		if len(escort.Orders) != 1 || escort.Orders[0].Target != ally.ID {
			t.Fatal("combat overwrote escort")
		}
	}
	ally.Position = Vec{X: 35000, Y: 24000}
	e.updateFog()
	e.Advance()
	if escort.Anchor != ally.Position {
		t.Fatal("escort stayed at original allied position")
	}
	if escort.Target == enemy.ID {
		t.Fatal("escort chased threat more than six tiles from ally")
	}
}

func airOrderFixture(t *testing.T) (*Engine, *Entity, *Entity) {
	e := fixture(t)
	home := e.spawn("US.airfield", 1, Vec{X: 26000, Y: 23000}, true, 0)
	jet := e.spawn("US.fighter", 1, Vec{X: 21000, Y: 23000}, true, 0)
	jet.Home = home.ID
	jet.Landed = false
	e.recalculate()
	e.updateFog()
	return e, home, jet
}
func TestFixedWingGuardUpdatesAnchorAndDropsThreatOutsideLeash(t *testing.T) {
	e, _, jet := airOrderFixture(t)
	ally := e.spawn("US.strike", 1, Vec{X: 28000, Y: 26000}, true, 0)
	ally.Landed = false
	enemy := e.spawn("IR.isr", 2, Vec{X: 33000, Y: 26000}, true, 0)
	enemy.Landed = false
	e.updateFog()
	if got := e.execute(1, Order{Kind: "guard", Entities: []ID{jet.ID}, Target: ally.ID}); got != "ok" {
		t.Fatal(got)
	}
	jet.Target = enemy.ID
	e.pathBudget = 32
	before := ally.Position
	e.updateMovement()
	if jet.Anchor != before {
		t.Fatal("fixed wing guard bypassed ally location")
	}
	ally.Position = Vec{X: 23000, Y: 33000}
	e.updateFog()
	before = ally.Position
	e.updateMovement()
	if jet.Anchor != before || jet.Target != 0 {
		t.Fatal("fixed wing chased beyond escort leash", jet.Anchor, jet.Target)
	}
}

func TestAutomaticServicePreservesExplicitWorkAndDefaultWaits(t *testing.T) {
	for _, kind := range []string{"attack_move", "patrol", "escort"} {
		for _, repeat := range []bool{false, true} {
			e, home, jet := airOrderFixture(t)
			jet.RepeatSortie = repeat
			order := Order{Kind: kind, Position: Vec{X: 40000, Y: 23000}, Target: 2, Points: []Vec{{X: 21000, Y: 23000}, {X: 40000, Y: 23000}}}
			e.assign(jet, order)
			e.returnForService(jet)
			wantResume := kind != "attack_move" || repeat
			if len(jet.Orders) != 1+btoi(wantResume) {
				t.Fatal("wrong service resume", kind, repeat, jet.Orders)
			}
			jet.Position = e.landingPoint(jet, home)
			e.updateAircraft()
			if !jet.Landed || jet.ServiceWork == 0 {
				t.Fatal("did not land")
			}
			jet.ServiceWork = e.serviceRequired(jet)
			e.updateAircraft()
			if jet.ServiceWork != 0 || len(jet.Orders) != btoi(wantResume) {
				t.Fatal("service lost explicit work", kind, repeat)
			}
			if !wantResume {
				e.updateMovement()
				if !jet.Landed {
					t.Fatal("default service invisibly resumed strike")
				}
			}
		}
	}
	e, _, jet := airOrderFixture(t)
	e.assign(jet, Order{Kind: "attack_move", Position: Vec{X: 40000, Y: 25000}})
	jet.Orders = append(jet.Orders, Order{Kind: "return"}, Order{Kind: "patrol", Points: []Vec{{X: 21000, Y: 23000}, {X: 40000, Y: 23000}}})
	e.returnForService(jet)
	if len(jet.Orders) != 2 || jet.Orders[0].Kind != "return" || jet.Orders[1].Kind != "patrol" {
		t.Fatal("duplicate return blocked queued patrol", jet.Orders)
	}
}
func btoi(v bool) int {
	if v {
		return 1
	}
	return 0
}

func TestRepeatSortieToggleDoesNotReplaceFlightOrder(t *testing.T) {
	e, _, jet := airOrderFixture(t)
	e.assign(jet, Order{Kind: "move", Position: Vec{X: 35000, Y: 23000}})
	if got := e.execute(1, Order{Kind: "repeat_sortie", Entities: []ID{jet.ID}, Index: 1}); got != "ok" || !jet.RepeatSortie || jet.Orders[0].Kind != "move" {
		t.Fatal("repeat toggle changed flight", got)
	}
	e.recalculate()
	e.updateFog()
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil || !restored.entity(jet.ID).RepeatSortie {
		t.Fatal("toggle not saved", err)
	}
	own, _ := e.PlayerView(1)
	found := false
	for _, v := range own.Entities {
		if v.ID == jet.ID {
			found = v.Private != nil && v.Private.RepeatSortie
		}
	}
	if !found {
		t.Fatal("owner cannot display repeat toggle")
	}
}
