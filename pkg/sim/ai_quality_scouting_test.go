package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiQualityScoutingActorOrders(e *Engine, actor ID) []Order {
	var orders []Order
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			for _, id := range order.Entities {
				if id == actor {
					orders = append(orders, order)
					break
				}
			}
		}
	}
	return orders
}

func TestAIQualityScoutingRecoversOrdinaryBlockedReconRoute(t *testing.T) {
	m := fixtureMap()
	m.Stations[0].Position = Vec{X: 42000, Y: 24000}
	// The ordinary route executor cannot reach this isolated tile, although the
	// map's starts, resources and objectives remain connected and legal.
	for y := int32(18); y <= 27; y++ {
		for x := int32(26); x <= 35; x++ {
			if x == 26 || x == 35 || y == 18 || y == 27 {
				m.Tiles[y*m.Width+x].Terrain = "cliff"
			}
		}
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	scout := e.spawn("US.recon", 1, Vec{X: 20000, Y: 18000}, true, 0)
	failed := Vec{X: 30500, Y: 22500}
	e.updateFog()
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{scout.ID}, Position: failed})
	ticks(e, 240)
	if !scout.Blocked || len(scout.Orders) != 1 || scout.Orders[0].Position != failed {
		t.Fatalf("ordinary accepted route did not reproduce the stall: %+v", scout)
	}
	p := e.player(1)
	p.AI, p.Credits = "normal", 0
	e.updateAI()
	orders := aiQualityScoutingActorOrders(e, scout.ID)
	if len(orders) != 1 || orders[0].Kind != "move" || orders[0].Position == failed {
		t.Fatalf("confirmed blocked scout did not choose another ordinary waypoint: %v", orders)
	}
	p.AI = ""
	e.Advance()
	accepted := false
	for _, result := range e.state.Results {
		if result.Accepted {
			accepted = true
		}
	}
	if !accepted || len(scout.Orders) != 1 || scout.Orders[0].Position != orders[0].Position {
		t.Fatal("scout recovery bypassed or failed normal order execution", e.state.Results, scout.Orders)
	}
}

func TestAIQualityScoutingPreservesMovingRecentAndQueuedTasks(t *testing.T) {
	for _, spec := range []struct {
		name       string
		blocked    bool
		stationary Tick
		queued     bool
	}{
		{name: "moving", stationary: 0},
		{name: "recent_block", blocked: true, stationary: 220},
		{name: "queued_move", blocked: true, queued: true},
	} {
		t.Run(spec.name, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI, p.Credits = "normal", 0
			scout := e.spawn("US.recon", 1, Vec{X: 19000, Y: 16000}, true, 0)
			scout.Orders = []Order{{Kind: "move", Position: Vec{X: 30500, Y: 22500}}}
			if spec.queued {
				scout.Orders = append(scout.Orders, Order{Kind: "move", Position: Vec{X: 30500, Y: 30500}})
			}
			scout.Blocked, scout.StationarySince = spec.blocked, spec.stationary
			e.updateFog()
			e.state.Tick = 240
			e.updateAI()
			if orders := aiQualityScoutingActorOrders(e, scout.ID); len(orders) != 0 {
				t.Fatal("scout recovery interrupted an unconfirmed or queued task", orders)
			}
		})
	}
}

func TestAIQualityScoutingKnownStaticAADangerRetainsUncertainty(t *testing.T) {
	for _, hiddenChange := range []string{"unchanged", "destroyed", "relocated"} {
		t.Run(hiddenChange, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			aa := e.spawn("aa_post", 2, Vec{X: 13000, Y: 10000}, true, 0)
			e.updateFog()
			view, _ := e.PlayerView(1)
			e.aiObserve(p, view)
			old := aa.Position
			e.entity(1).Position, e.entity(2).Position = Vec{X: 6000, Y: 50000}, Vec{X: 8000, Y: 50000}
			switch hiddenChange {
			case "destroyed":
				aa.HP = 0
			case "relocated":
				aa.Position = Vec{X: 50000, Y: 10000}
			}
			e.state.Tick = seconds(61)
			e.updateFog()
			view, _ = e.PlayerView(1)
			e.aiObserve(p, view)
			if len(p.AIKnowledge) != 1 || p.AIKnowledge[0].Position != old || p.AIKnowledge[0].Seen != 0 || e.canSee(1, old) {
				t.Fatal("fixed defense memory fixture lost its uncertainty", p.AIKnowledge)
			}
			if !e.aiAirDanger(p, old) {
				t.Fatal("remembered fixed AA became safe after one minute without new sight")
			}
			e.state.Tick = seconds(301)
			e.aiObserve(p, view)
			if e.aiAirDanger(p, old) || len(p.AIKnowledge) != 0 {
				t.Fatal("fixed defense uncertainty did not expire normally")
			}
		})
	}
}

func TestAIQualityScoutingAirScoutsChooseSafeKnownAlternative(t *testing.T) {
	for _, typ := range []string{"IR.isr", "SY.scout_drone"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			// Easy has no separate aircraft recovery layer, so this exercises the
			// scout dispatch itself rather than relying on another layer to win.
			p.AI, p.Credits, p.Faction = "easy", 0, typ[:2]
			home := e.spawn(content.AirProducer(p.Faction), 1, Vec{X: 8000, Y: 16000}, true, 0)
			scout := e.spawn(typ, 1, Vec{X: 8000, Y: 12000}, true, 0)
			scout.Home, scout.Landed, scout.ServiceWork = home.ID, true, 0
			e.spawn("US.recon", 1, Vec{X: 18000, Y: 8000}, true, 0)
			e.spawn("aa_post", 2, Vec{X: 24000, Y: 16000}, true, 0)
			e.updateFog()
			for i := range p.Explored {
				p.Explored[i] = true
			}
			// Both waypoints are outside current sight. The closer one lies in
			// observed AA coverage; the alternate route stays clear of it from
			// takeoff through arrival, including the known three-tile buffer.
			p.Explored[22*e.state.Map.Width+22], p.Explored[38*e.state.Map.Width+6] = false, false
			e.state.Tick = 80
			e.updateAI()
			orders := aiQualityScoutingActorOrders(e, scout.ID)
			if len(orders) != 1 || orders[0].Kind != "move" {
				t.Fatal("safe reconnaissance alternative was not planned", orders)
			}
			if e.aiAirDanger(p, orders[0].Position) {
				t.Fatal("unarmed scout dispatched to a waypoint inside observed AA coverage", orders[0])
			}
		})
	}
}

func TestAIQualityScoutingExplorationAvoidsPublicDisconnectedPocket(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	for i := range p.Explored {
		p.Explored[i] = true
	}
	for y := int32(10); y <= 18; y++ {
		for x := int32(18); x <= 26; x++ {
			if x == 18 || x == 26 || y == 10 || y == 18 {
				e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "cliff"
			}
		}
	}
	from, unreachable, reachable := Vec{X: 12500, Y: 14500}, Vec{X: 22500, Y: 14500}, Vec{X: 6500, Y: 30500}
	p.Explored[14*e.state.Map.Width+22], p.Explored[30*e.state.Map.Width+6] = false, false
	if got := e.aiExplore(p, from); got != reachable {
		t.Fatal("exploration kept choosing a publicly disconnected pocket", got, unreachable)
	}
}

func TestAIQualityScoutingWorkersEscapeNearestWaypointRetryLoop(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	worker := e.spawn("US.hauler", 1, Vec{X: 12000, Y: 12000}, true, 0)
	worker.Orders, worker.State = []Order{{Kind: "gather"}}, "no_known_supplies"
	e.updateFog()
	planned := []Order{{Kind: "build", Entities: []ID{2}, Type: "power"}}
	seen := map[Vec]bool{}
	for i := 1; i <= 10; i++ {
		e.state.Tick = Tick(i) * seconds(12)
		order, ok := e.aiSupplyScoutOrder(p, aiOwnView(e, 1), planned, seconds(2))
		if !ok || len(order.Entities) != 1 || order.Entities[0] != worker.ID {
			t.Fatal("worker retry fixture stopped selecting its idle/blocked worker", order, ok)
		}
		seen[order.Position] = true
		worker.Orders, worker.Blocked = []Order{order}, true
	}
	if len(seen) <= 5 {
		t.Fatal("failed supply scout remained trapped among its nearest five waypoints", seen)
	}
}

func TestAIQualityScoutingFullyVisibleMapDoesNotIssueIdleMoveLoop(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Credits = "normal", 0
	scout := e.spawn("US.recon", 1, Vec{X: 32000, Y: 32000}, true, 0)
	e.updateFog()
	for i := range p.Explored {
		p.Explored[i], e.visible[p.ID][i] = true, true
	}
	e.state.Tick = 40
	e.updateAI()
	if orders := aiQualityScoutingActorOrders(e, scout.ID); len(orders) != 0 {
		t.Fatal("scout manufactured a movement order with no remaining uncertainty", orders)
	}
}

func TestAIQualityScoutingPlacementIgnoresWarmedHiddenCollisionCaches(t *testing.T) {
	makeEngine := func(hiddenBlocker bool) *Engine {
		e := fixture(t)
		e.entity(2).Position = Vec{X: 3000, Y: 8000}
		if hiddenBlocker {
			blocker := e.spawn("SY.rifle", 2, Vec{X: 12000, Y: 8000}, true, 0)
			blocker.Concealed = true
		}
		e.updateFog()
		e.navigationCells(600)
		e.mobileObstacleCells(600)
		e.serviceObstacleEdges(600)
		return e
	}
	a, b := makeEngine(false), makeEngine(true)
	av, _ := a.PlayerView(1)
	bv, _ := b.PlayerView(1)
	if !reflect.DeepEqual(av.Entities, bv.Entities) {
		t.Fatal("hidden blocker changed authorized view")
	}
	ap, aok := a.aiPlacement(1, Vec{X: 8000, Y: 8000}, 2, 2)
	bp, bok := b.aiPlacement(1, Vec{X: 8000, Y: 8000}, 2, 2)
	if !aok || !bok || ap != bp || bp != (Vec{X: 12000, Y: 8000}) {
		t.Fatal("warmed hidden navigation caches affected view-only placement", ap, aok, bp, bok)
	}
	if code := b.validPlacement(1, bp, 2, 2); code != "occupied" {
		t.Fatal("ordinary execution geometry did not retain hidden collision validation", code)
	}
}

func TestAIQualityScoutingHiddenRubbleKeepsIdenticalPlanningKnowledge(t *testing.T) {
	a, b := objectFixture(t), objectFixture(t)
	prop := objectEntity(b, 2)
	original := a.state.Map.TileAt(prop.Position)
	prop.HP = 0
	b.cleanup()
	b.updateFog()
	av, _ := a.PlayerView(1)
	bv, _ := b.PlayerView(1)
	if !reflect.DeepEqual(av.Entities, bv.Entities) || !reflect.DeepEqual(av.Visible, bv.Visible) || len(bv.Rubble) != 0 {
		t.Fatal("hidden destruction control changed permitted knowledge")
	}
	for _, e := range []*Engine{a, b} {
		p := e.player(1)
		if got := e.aiPlacementKnowledge(p).state.Map.TileAt(prop.Position); got != original {
			t.Fatal("unknown rubble entered view-only placement terrain", got, original)
		}
	}
	ap, bp := a.aiExplore(a.player(1), Vec{X: 8000, Y: 8000}), b.aiExplore(b.player(1), Vec{X: 8000, Y: 8000})
	if ap != bp || !reflect.DeepEqual(a.aiScoutTerrainKnowledge(a.player(1)).components, b.aiScoutTerrainKnowledge(b.player(1)).components) {
		t.Fatal("hidden destruction changed public-terrain scouting", ap, bp)
	}
	// Ordinary sight makes the same mutation useful knowledge; the AI map must
	// then retain observed rubble without changing the authoritative tile slice.
	b.spawn("US.recon", 1, Vec{X: 38000, Y: 40000}, true, 0)
	b.updateFog()
	if len(b.player(1).KnownRubble) != 1 || b.aiPlacementKnowledge(b.player(1)).state.Map.TileAt(prop.Position).Terrain != "rubble" || b.state.Map.TileAt(prop.Position).Terrain != "rubble" {
		t.Fatal("observed rubble was not retained independently in planning")
	}
}

func TestAIQualityScoutingAircraftExploreAcrossPublicGroundBlockers(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Credits, p.Faction = "easy", 0, "IR"
	home := e.spawn("IR.drone_hub", 1, Vec{X: 18000, Y: 16000}, true, 0)
	scout := e.spawn("IR.isr", 1, Vec{X: 18000, Y: 8000}, true, 0)
	scout.Home, scout.Landed = home.ID, true
	e.updateFog()
	for i := range p.Explored {
		p.Explored[i] = true
	}
	point := Vec{X: 30500, Y: 30500}
	e.state.Map.Tiles[30*e.state.Map.Width+30].Terrain = "water"
	p.Explored[30*e.state.Map.Width+30] = false
	e.state.Tick = 80
	e.updateAI()
	orders := aiQualityScoutingActorOrders(e, scout.ID)
	if len(orders) != 1 || orders[0].Kind != "move" || orders[0].Position != point {
		t.Fatal("air scouting incorrectly inherited ground connectivity constraints", orders)
	}
}

func TestAIQualityScoutingRetryCursorAndOrdersSurviveRestore(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Controller, p.Credits = "normal", "ai", 0
	scout := e.spawn("US.recon", 1, Vec{X: 19000, Y: 16000}, true, 0)
	scout.Orders = []Order{{Kind: "move", Position: Vec{X: 30500, Y: 22500}}}
	scout.Blocked = true
	e.recalculate()
	e.updateFog()
	e.state.Tick = 240
	e.updateAI()
	if p.AIScout == 0 || len(aiQualityScoutingActorOrders(e, scout.ID)) != 1 {
		t.Fatal("restore fixture did not progress its saved retry cursor")
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	for range 85 {
		e.Advance()
		restored.Advance()
	}
	if e.Hash() != restored.Hash() || e.player(1).AIScout != restored.player(1).AIScout {
		t.Fatal("restored scouting cursor or ordinary orders diverged")
	}
}
