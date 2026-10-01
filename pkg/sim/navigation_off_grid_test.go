package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// The original production checkpoint is tested separately, without edits. This
// compact control retains its exact factory/airfield/roof geometry and radius.
func offGridStripFixture(t *testing.T, leftMobile bool) (*Engine, *Entity) {
	t.Helper()
	m := fixtureMap()
	m.Width, m.Height = 128, 128
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "SA", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("factory", 2, Vec{X: 105500, Y: 63500}, true, 1800000)
	e.spawn("hq", 2, Vec{X: 109500, Y: 63500}, true, 0)
	e.spawn("power", 2, Vec{X: 109500, Y: 67500}, true, 500000)
	e.spawn("SA.airfield", 2, Vec{X: 103500, Y: 69500}, true, 2000000)
	actor := e.spawn("SA.repair", 2, Vec{X: 105500, Y: 66400}, true, 750000)
	if leftMobile {
		e.spawn("SA.rifle", 2, Vec{X: 104625, Y: 66000}, true, 300000)
	}
	e.recalculate()
	e.updateFog()
	if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
		t.Fatal("real strip position must be legal")
	}
	for dy := int32(-1); dy <= 1; dy++ {
		for dx := int32(-1); dx <= 1; dx++ {
			p := Vec{X: actor.Position.X/500*500 + dx*500, Y: actor.Position.Y/500*500 + dy*500}
			if e.clear(p, e.radius(actor), actor.ID, false, false) {
				t.Fatal("strip fixture unexpectedly has an original grid seed", p)
			}
		}
	}
	return e, actor
}

func TestOffGridNavigationStripMoveAndFollow(t *testing.T) {
	for _, kind := range []string{"move", "guard"} {
		t.Run(kind, func(t *testing.T) {
			e, actor := offGridStripFixture(t, true)
			goal := Vec{X: 115000, Y: 75000}
			targetPoint := goal
			if kind == "move" {
				targetPoint = Vec{X: 120000, Y: 80000}
			}
			target := e.spawn("SA.car", 2, targetPoint, true, 500000)
			target.HP -= 7200
			e.recalculate()
			e.updateFog()
			before := e.Hash()
			e.pathBudget = 12
			path := e.findPath(actor, goal, true)
			if len(path) < 2 || path[0] != (Vec{X: 107000, Y: 66400}) || path[1] != (Vec{X: 107000, Y: 66500}) {
				t.Fatal("missing deterministic bent connection", path)
			}
			bridge := *actor
			for _, p := range path[:2] {
				if !e.navigationBridgeClear(&bridge, p, true) {
					t.Fatal("connection crosses a real collider", bridge.Position, p)
				}
				bridge.Position = p
			}
			if before != e.Hash() {
				t.Fatal("derived connection changed authoritative state")
			}
			recorder, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			order := Order{Kind: kind, Entities: []ID{actor.ID}, Position: goal}
			if kind == "guard" {
				order.Target = target.ID
			}
			issue(t, e, 2, order)
			finish := goal
			if kind == "move" {
				finish = Vec{X: 115000, Y: 80000}
				issue(t, e, 2, Order{Kind: "move", Entities: []ID{actor.ID}, Position: finish, Queued: true})
				issue(t, e, 2, Order{Kind: "hold", Entities: []ID{actor.ID}, Queued: true})
			}
			visitedFirst := false
			secondLegStart := actor.Position
			initialRepairSpend := e.playerTelemetry(2).RepairSpent
			var restored *Engine
			for step := 0; step < 500; step++ {
				if kind == "guard" && step == 250 {
					secondLegStart = actor.Position
					orders := []Order{{Kind: "move", Entities: []ID{target.ID}, Position: Vec{X: 115000, Y: 80000}}}
					sequence := e.player(2).LastSequence + 1
					if err := e.Submit(2, sequence, orders); err != nil {
						t.Fatal(err)
					}
					if err := restored.Submit(2, sequence, orders); err != nil {
						t.Fatal(err)
					}
				}
				previous := *actor
				e.Advance()
				if !e.navigationBridgeClear(&previous, actor.Position, true) {
					t.Fatal("physical movement crossed a collider", e.Tick(), previous.Position, actor.Position)
				}
				if distance(actor.Position, goal) < 750 {
					visitedFirst = true
				}
				if restored != nil {
					restored.Advance()
					if restored.Hash() != e.Hash() {
						t.Fatal("restored connection diverged", e.Tick())
					}
				}
				if step == 60 {
					saved, err := recorder.CaptureCheckpoint(e)
					if err != nil {
						t.Fatal(err)
					}
					restored, err = Restore(e.catalog, saved)
					if err != nil || restored.Hash() != e.Hash() {
						t.Fatal("mid-route restore", err)
					}
				}
			}
			if actor.Blocked || distance(actor.Position, Vec{X: 105500, Y: 66400}) < 3000 {
				t.Fatal("actor did not physically leave the strip", actor.Position, actor.Orders)
			}
			if kind == "move" && (!visitedFirst || len(actor.Orders) != 0 || distance(actor.Position, finish) > 250 || actor.Stance != "hold") {
				t.Fatal("ordinary queued move did not visit both destinations and activate Hold", visitedFirst, actor.Position, actor.Orders, actor.Stance)
			}
			// Both vehicle radii are600: center<=1200 would demand exact
			// tangency. Bound the physical gap by the ordinary grid arrival
			// tolerance while retaining the same injury, route and500ticks.
			if kind == "guard" && (e.edgeDistance(actor, target) > 120 || distance(secondLegStart, actor.Position) < 3000 || len(actor.Orders) != 1 || actor.Orders[0].Target != target.ID || target.HP != target.MaxHP || e.playerTelemetry(2).RepairSpent-initialRepairSpend < 720) {
				t.Fatal("ordinary guard failed to follow or deliver paid repair", actor.Position, target.Position, actor.Orders, target.HP)
			}
			if actor.Paid != 750000 || actor.HP != actor.MaxHP {
				t.Fatal("movement altered the repair actor's investment or health")
			}
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			checkpoint, err := recorder.Seek(e.catalog, e.Tick())
			if err != nil || checkpoint.Hash() != e.Hash() {
				t.Fatal("checkpoint replay", err)
			}
			full := *recorder
			full.Checkpoints = nil
			played, err := full.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("full replay", err)
			}
		})
	}
}

func TestOffGridNavigationCannotCrossBarriers(t *testing.T) {
	for _, obstacle := range []string{"terrain", "building", "foundation", "mobile", "landed aircraft", "landing reservation"} {
		t.Run(obstacle, func(t *testing.T) {
			e := fixture(t)
			actor := e.spawn("US.apc", 1, Vec{X: 19000, Y: 20000}, true, 0)
			goal := Vec{X: 23000, Y: 20000}
			switch obstacle {
			case "terrain":
				e.state.Map.Tiles[19*e.state.Map.Width+21].Terrain = "blocked"
				e.state.Map.Tiles[20*e.state.Map.Width+21].Terrain = "blocked"
			case "building", "foundation":
				e.spawn("power", 2, Vec{X: 21000, Y: 20000}, obstacle == "building", 500000)
			case "mobile":
				e.spawn("US.apc", 2, Vec{X: 21000, Y: 20000}, true, 0)
			case "landed aircraft", "landing reservation":
				home := e.spawn("US.airfield", 1, Vec{X: 30000, Y: 30000}, true, 0)
				aircraft := e.spawn("US.fighter", 1, Vec{X: 21000, Y: 20000}, true, 0)
				aircraft.Home = home.ID
				aircraft.Landed = obstacle == "landed aircraft"
				if obstacle == "landing reservation" {
					aircraft.Position = Vec{X: 25000, Y: 20000}
					aircraft.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: 21000, Y: 20000}}
				}
			}
			if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) || !e.clear(goal, e.radius(actor), actor.ID, false, true) {
				t.Fatal("barrier test requires clear endpoints")
			}
			if _, _, ok := e.offGridNavigationConnection(actor, goal, true); ok {
				t.Fatal("connection crossed a barrier with clear endpoints")
			}
		})
	}
	e := fixture(t)
	actor := e.spawn("US.apc", 1, Vec{X: 20000, Y: 20000}, true, 0)
	if _, _, ok := e.offGridNavigationConnection(actor, Vec{X: 0, Y: 20000}, true); ok {
		t.Fatal("connection left map clearance bounds")
	}
}

func TestOffGridNavigationSealedStripStaysUnreachable(t *testing.T) {
	e, actor := offGridStripFixture(t, false)
	e.state.Map.Tiles[66*e.state.Map.Width+102].Terrain = "blocked"
	e.state.Map.Tiles[66*e.state.Map.Width+107].Terrain = "blocked"
	e.state.NavigationRevision++
	if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
		t.Fatal("sealed strip must retain a legal physical start")
	}
	e.pathBudget = 12
	goal := Vec{X: 115000, Y: 75000}
	if path := e.findPath(actor, goal, true); len(path) != 0 {
		t.Fatal("connection tunneled out of a sealed strip", path)
	}
	e.state.Map.Tiles[66*e.state.Map.Width+107].Terrain = "open"
	e.state.NavigationRevision++
	e.pathBudget = 12
	if path := e.findPath(actor, goal, true); len(path) == 0 {
		t.Fatal("opened terrain did not restore a legal exit")
	}
}

func TestOffGridNavigationElbowAndImmediateStop(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.apc", 1, Vec{X: 25000, Y: 25000}, true, 0)
	elbow := Vec{X: 25251, Y: 25000}
	e.assign(actor, Order{Kind: "move", Position: Vec{X: 25251, Y: 30000}})
	actor.Path = []Vec{elbow, {X: 25251, Y: 30000}}
	actor.PathGoal, actor.PathRevision = actor.Orders[0].Position, e.state.NavigationRevision
	e.pathBudget = 12
	e.updateMovement()
	if actor.Position == elbow || len(actor.Path) == 0 || actor.Path[0] != elbow {
		t.Fatal("sub-grid elbow was skipped before exact physical arrival", actor.Position, actor.Path)
	}
	e.updateFog()
	position := actor.Position
	issue(t, e, 1, Order{Kind: "stop", Entities: []ID{actor.ID}})
	if actor.Position != position || len(actor.Orders) != 0 || len(actor.Path) != 0 {
		t.Fatal("manual Stop did not immediately override the connection", actor.Position, actor.Orders, actor.Path)
	}
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: Vec{X: 25251, Y: 30000}})
	position = actor.Position
	issue(t, e, 1, Order{Kind: "hold", Entities: []ID{actor.ID}})
	ticks(e, 30)
	if actor.Position != position || actor.Stance != "hold" || len(actor.Orders) != 0 || len(actor.Path) != 0 {
		t.Fatal("manual Hold did not immediately retain its physical position", actor.Position, actor.Stance, actor.Orders, actor.Path)
	}
}

func TestOffGridNavigationMaximumMapDistantObstacles(t *testing.T) {
	e := fixture(t)
	e.state.Map.Width, e.state.Map.Height = 256, 256
	e.state.Map.Tiles = make([]content.Tile, 256*256)
	for i := range e.state.Map.Tiles {
		e.state.Map.Tiles[i].Terrain = "open"
	}
	actor := e.spawn("US.rifle", 1, Vec{X: 254499, Y: 7499}, true, 0)
	goal := Vec{X: 248000, Y: 1000}
	e.spawn("power", 2, Vec{X: 1000, Y: 255000}, true, 0)
	mobile := e.spawn("US.rifle", 2, Vec{X: 3350, Y: 255649}, true, 0)
	if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) || !e.clear(goal, e.radius(actor), actor.ID, false, true) {
		t.Fatal("maximum-map bridge endpoints must be clear")
	}
	if !e.clear(mobile.Position, e.radius(mobile), mobile.ID, false, true) {
		t.Fatal("distant mobile must itself be physically legal")
	}
	if !e.navigationBridgeClear(actor, goal, true) {
		t.Fatal("distant legal obstacles overflowed local bridge geometry")
	}
	if !bridgeRectangleClear(actor.Position, goal, e.radius(actor), 0, 254000, 2000, 256000) {
		t.Fatal("opposite map corner falsely intersects the local bridge")
	}
}
