package sim

import (
	"frontlinecommand/pkg/content"
	"strings"
	"testing"
)

// This explicit first-delivery boundary uses the full authored mission. It is
// not a naturally earned convoy victory. Blockers and existing infrastructure
// are seeded before recording; clearing uses ordinary Move/Sell commands.
func TestConvoyRepairGrantsCannotBlockRequiredDeparture(t *testing.T) {
	for _, test := range []struct {
		name                 string
		west, east, capacity bool
	}{
		{"blocked-west", true, false, false}, {"blocked-east", false, true, false}, {"blocked-both", true, true, false},
		{"capacity-west", true, false, true}, {"capacity-east", false, true, true}, {"capacity-both", true, true, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			e := reliabilityAuthoredMission(t, "convoy-union")
			if e.state.Mission.Definition.Version != "2" {
				t.Fatal("expected corrected authored convoy version")
			}
			e.state.Tick = 600
			first, definition := e.convoy("convoy-1")
			first.Completed = true
			first.Waypoint = uint32(len(definition.Routes[0]))
			convoyGrantTrigger(t, e, "first-convoy-ready").Fired = 1
			convoyGrantTrigger(t, e, "first-convoy-ready").Last = 500
			exit := e.missionRegion("convoy-exit")
			for i, actor := range e.convoyActors("convoy-one") {
				actor.Position = Vec{X: (exit.Min.X+exit.Max.X)/2 + int32(i)*2000, Y: (exit.Min.Y + exit.Max.Y) / 2}
				actor.LastPosition, actor.Anchor = actor.Position, actor.Position
				e.assign(actor, Order{Kind: "hold"})
			}
			blockers := map[PlayerID][]ID{}
			sales := map[PlayerID]ID{}
			for _, side := range []struct {
				owner   PlayerID
				blocked bool
				trigger string
			}{
				{1, test.west, "western-forward-repair-ready"}, {2, test.east, "eastern-forward-repair-ready"},
			} {
				grant := convoyGrantSpawn(t, e, side.trigger)
				if positions, ok := e.scenarioPositions(grant); !ok || len(positions) != 1 {
					t.Fatal("authored depot has no initially legal footprint", side.trigger)
				}
				if !side.blocked {
					continue
				}
				if test.capacity {
					sales[side.owner] = convoyGrantFillCapacity(t, e, side.owner)
				} else {
					// Cover every legal retry candidate with noncombat mobile obstacles.
					// No unit is moved aside by the product's reinforcement implementation.
					for attempt := 0; attempt < 16; attempt++ {
						positions, ok := e.scenarioPositions(grant)
						if !ok {
							break
						}
						actor := e.spawn(e.player(side.owner).Faction+".hauler", side.owner, positions[0], true, 900000)
						e.assign(actor, Order{Kind: "hold"})
						blockers[side.owner] = append(blockers[side.owner], actor.ID)
					}
					if _, ok := e.scenarioPositions(grant); ok {
						t.Fatal("fixture failed to obstruct every authored depot candidate")
					}
				}
			}
			e.recalculate()
			e.updateFog()
			twin := reliabilityRestore(t, e)
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			initialTick := e.Tick()
			advance := func() {
				e.Advance()
				twin.Advance()
				if e.Hash() != twin.Hash() {
					t.Fatal("deferred repair grant diverged after save", e.Tick())
				}
				if err := replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
			}
			advance()
			second, _ := e.convoy("convoy-2")
			if !second.Active || len(e.convoyActors("convoy-two")) != 2 || e.state.Mission.Checkpoint != "first-arrival" || convoyGrantTrigger(t, e, "second-convoy-ready").Fired != 1 {
				t.Fatal("optional repair grant blocked required departure/checkpoint", second, e.state.Mission.Checkpoint)
			}
			warning := false
			for _, event := range e.state.Events {
				if event.Kind == "mission_warning" && strings.Contains(event.Text, "Convoy two is ready") {
					warning = true
				}
			}
			if !warning {
				t.Fatal("blocked repair concealed required departure warning")
			}
			checkGrants := func(west, east uint32) {
				for _, side := range []struct {
					tag, trigger string
					want         uint32
				}{
					{"western-forward-repair", "western-forward-repair-ready", west}, {"eastern-forward-repair", "eastern-forward-repair-ready", east},
				} {
					if got := uint32(len(e.convoyActors(side.tag))); got != side.want || convoyGrantTrigger(t, e, side.trigger).Fired != side.want {
						t.Fatal("repair retry/once-only state differs", side.tag, got, side.want)
					}
				}
			}
			expectedWest, expectedEast := uint32(1), uint32(1)
			if test.west {
				expectedWest = 0
			}
			if test.east {
				expectedEast = 0
			}
			checkGrants(expectedWest, expectedEast)
			// Persist the partially granted transaction before requesting any clearing.
			twin = reliabilityRestore(t, e)
			if err := replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			submit := func(owner PlayerID, orders []Order) {
				seq := e.player(owner).LastSequence + 1
				if err := e.Submit(owner, seq, orders); err != nil {
					t.Fatal(err)
				}
				if err := twin.Submit(owner, seq, orders); err != nil {
					t.Fatal(err)
				}
			}
			// Keep the second convoy waiting while the optional repair sites clear.
			submit(1, []Order{{Kind: "convoy_hold", Type: "convoy-2"}})
			for _, owner := range []PlayerID{1, 2} {
				orders := []Order{}
				if id := sales[owner]; id != 0 {
					orders = append(orders, Order{Kind: "sell", Entities: []ID{id}})
				}
				for _, id := range blockers[owner] {
					actor := e.entity(id)
					goal, ok := convoyGrantClearGoal(e, actor)
					if !ok {
						t.Fatal("no legal nearby clearing destination")
					}
					orders = append(orders, Order{Kind: "move", Entities: []ID{id}, Position: goal})
				}
				if len(orders) > 0 {
					submit(owner, orders)
				}
			}
			for tick := 0; tick < 600; tick++ {
				advance()
				for _, result := range e.state.Results {
					if !result.Accepted {
						t.Fatal("ordinary clearing order rejected", result)
					}
				}
				if len(e.convoyActors("western-forward-repair")) == 1 && len(e.convoyActors("eastern-forward-repair")) == 1 {
					break
				}
			}
			checkGrants(1, 1)
			for i := 0; i < 5; i++ {
				advance()
			}
			checkGrants(1, 1)
			for _, tag := range []string{"western-forward-repair", "eastern-forward-repair"} {
				depot := e.convoyActors(tag)[0]
				width, height := e.footprint(depot)
				for _, ids := range blockers {
					for _, id := range ids {
						actor := e.entity(id)
						if actor == nil {
							t.Fatal("clearing removed live obstacle")
						}
						dx, dy := max(int32(0), abs(actor.Position.X-depot.Position.X)-width*500), max(int32(0), abs(actor.Position.Y-depot.Position.Y)-height*500)
						radius := int64(e.radius(actor))
						if int64(dx)*int64(dx)+int64(dy)*int64(dy) < radius*radius {
							t.Fatal("depot grant overlapped a live clearing unit")
						}
					}
				}
			}
			if e.Outcome().Finished || convoyGrantTrigger(t, e, "second-convoy-ready").Fired != 1 || len(e.convoyActors("convoy-two")) != 2 {
				t.Fatal("repair retry duplicated trucks or ended required mission")
			}
			if err := replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			data, err := replay.Encode()
			if err != nil {
				t.Fatal(err)
			}
			recorded, err := DecodeReplay(data)
			if err != nil {
				t.Fatal(err)
			}
			player, err := recorded.Open(e.catalog, initialTick)
			if err != nil {
				t.Fatal(err)
			}
			for !player.Finished() {
				if err := player.Advance(); err != nil {
					t.Fatal(err)
				}
			}
			if e.Hash() != player.Engine().Hash() {
				t.Fatal("required departure/deferred repair replay differs")
			}
		})
	}
}

func convoyGrantTrigger(t *testing.T, e *Engine, id string) *TriggerState {
	t.Helper()
	for i := range e.state.Mission.Triggers {
		if e.state.Mission.Triggers[i].ID == id {
			return &e.state.Mission.Triggers[i]
		}
	}
	t.Fatal("missing authored trigger", id)
	return nil
}
func convoyGrantSpawn(t *testing.T, e *Engine, id string) content.MissionSpawn {
	t.Helper()
	for _, trigger := range e.state.Mission.Definition.Triggers {
		if trigger.ID == id {
			for _, action := range trigger.Actions {
				if action.Spawn != nil {
					return *action.Spawn
				}
			}
		}
	}
	t.Fatal("missing authored grant", id)
	return content.MissionSpawn{}
}
func convoyGrantFillCapacity(t *testing.T, e *Engine, owner PlayerID) ID {
	t.Helper()
	var sale ID
	for y := int32(5000); y < 55000; y += 4000 {
		for x := int32(5000); x < 85000; x += 4000 {
			count := 0
			for _, actor := range e.state.Entities {
				if actor.Owner == owner && actor.Building && actor.HP > 0 {
					count++
				}
			}
			if count == 60 {
				return sale
			}
			spawn := content.MissionSpawn{Type: "power", Owner: uint32(owner), Position: Vec{X: x, Y: y}, Count: 1}
			positions, ok := e.scenarioPositions(spawn)
			if !ok {
				continue
			}
			rule, _ := e.buildingRule("power")
			actor := e.spawn("power", owner, positions[0], true, rule.Cost)
			sale = actor.ID
		}
	}
	t.Fatal("could not seed legal existing 60-structure boundary")
	return 0
}
func convoyGrantClearGoal(e *Engine, actor *Entity) (Vec, bool) {
	for _, offset := range []Vec{{Y: -10000}, {X: -10000}, {X: 10000}, {Y: 10000}} {
		goal := Vec{X: actor.Position.X + offset.X, Y: actor.Position.Y + offset.Y}
		if e.clear(goal, e.radius(actor), actor.ID, false, true) {
			return goal, true
		}
	}
	return Vec{}, false
}
