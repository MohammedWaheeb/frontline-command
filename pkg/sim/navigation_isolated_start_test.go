package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

// Synthetic source regression, distinct from the unmodified ordinary9600 save.
// The hub corner, rig, rifle and recon use that witnessed scene's geometry.
func isolatedNavigationFixture(t *testing.T) (*Engine, *Entity, *Entity) {
	t.Helper()
	m := fixtureMap()
	m.Width, m.Height = 128, 128
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "IR", Team: 1}, {ID: 2, Name: "Bravo", Faction: "US", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("IR.drone_hub", 1, Vec{X: 14500, Y: 60500}, true, 1500000)
	e.spawn("barracks", 1, Vec{X: 14500, Y: 64500}, true, 600000)
	e.spawn("IR.rig", 1, Vec{X: 11999, Y: 63822}, true, 0)
	rifle := e.spawn("IR.rifle", 1, Vec{X: 12500, Y: 63000}, true, 300000)
	recon := e.spawn("IR.recon", 1, Vec{X: 13200, Y: 63000}, true, 350000)
	e.spawn("IR.medic", 1, Vec{X: 14024, Y: 62993}, true, 350000)
	e.recalculate()
	e.updateFog()
	for _, actor := range []*Entity{rifle, recon} {
		if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) {
			t.Fatal("actual synthetic corridor start must be legal", actor.ID)
		}
	}
	return e, rifle, recon
}

func TestNavigationConnectionIsolatedGridStartPhysicallyLeaves(t *testing.T) {
	e, rifle, recon := isolatedNavigationFixture(t)
	goal := Vec{X: 52716, Y: 64001}
	start, reconStart := rifle.Position, recon.Position
	if !e.clear(start, e.radius(rifle), rifle.ID, false, true) || !e.navigationBridgeClear(rifle, Vec{X: 12000, Y: 62500}, true) {
		t.Fatal("legal floor and rounded-corner physical exit changed")
	}
	for _, d := range neighbors {
		p := Vec{X: start.X + d.X*500, Y: start.Y + d.Y*500}
		if !e.clear(p, e.radius(rifle), rifle.ID, false, true) {
			continue
		}
		if d.X == 0 || d.Y == 0 || e.clear(Vec{X: start.X, Y: p.Y}, e.radius(rifle), rifle.ID, false, true) && e.clear(Vec{X: p.X, Y: start.Y}, e.radius(rifle), rifle.ID, false, true) {
			t.Fatal("original grid seed unexpectedly has an ordinary exit", p)
		}
	}
	e.pathBudget = 12
	if original := e.referenceFindPath(rifle, goal, true); len(original) != 0 {
		t.Fatal("frozen grid search did not reproduce the isolated start", original)
	}
	before := e.Hash()
	e.pathBudget = 12
	path := e.findPath(rifle, goal, true)
	if len(path) == 0 || !e.navigationBridgeClear(rifle, path[0], true) || e.Hash() != before || e.pathBudget != 11 {
		t.Fatal("no safe derived connection or changed authoritative state/budget", path, e.pathBudget)
	}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "attack_move", Entities: []ID{rifle.ID}, Position: goal})
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{recon.ID}, Position: Vec{X: 45000, Y: 45000}})
	var restored *Engine
	for step := 0; step < 200; step++ {
		previousRifle, previousRecon := *rifle, *recon
		e.Advance()
		for _, movement := range [][2]*Entity{{&previousRifle, rifle}, {&previousRecon, recon}} {
			if !e.navigationBridgeClear(movement[0], movement[1].Position, false) || !e.clear(movement[1].Position, e.radius(movement[1]), movement[1].ID, false, true) {
				t.Fatal("ordinary physical movement crossed collision geometry", e.Tick(), movement[0].Position, movement[1].Position)
			}
		}
		if restored != nil {
			restored.Advance()
			if restored.Hash() != e.Hash() {
				t.Fatal("cold mid-connection restore diverged", e.Tick())
			}
		}
		if step == 20 {
			saved, err := recorder.CaptureCheckpoint(e)
			if err != nil {
				t.Fatal(err)
			}
			restored, err = Restore(e.catalog, saved)
			if err != nil || restored.Hash() != e.Hash() {
				t.Fatal("mid-connection restore", err)
			}
		}
	}
	if distance(start, rifle.Position) < 2000 || distance(reconStart, recon.Position) < 2000 || rifle.Paid != 300000 || recon.Paid != 350000 || len(rifle.Orders) != 1 || rifle.Orders[0].Kind != "attack_move" || len(recon.Orders) != 1 || recon.Orders[0].Kind != "move" {
		t.Fatal("ordinary existing tasks did not physically leave the corridor", rifle.Position, recon.Position, rifle.Orders, recon.Orders)
	}
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	for _, checkpointed := range []bool{true, false} {
		copy := *recorder
		if !checkpointed {
			copy.Checkpoints = nil
		}
		played, err := copy.Seek(e.catalog, e.Tick())
		if err != nil || played.Hash() != e.Hash() {
			t.Fatal("full/checkpoint ordinary replay diverged", checkpointed, err)
		}
	}
}

func TestNavigationConnectionSealedLegalGridStartStaysUnreachable(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.rifle", 1, Vec{X: 20500, Y: 20500}, true, 300000)
	for y := int32(19); y <= 21; y++ {
		for x := int32(19); x <= 21; x++ {
			if x != 20 || y != 20 {
				e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = "blocked"
			}
		}
	}
	e.state.NavigationRevision++
	goal := Vec{X: 25000, Y: 25000}
	if !e.clear(actor.Position, e.radius(actor), actor.ID, false, true) || !e.clear(goal, e.radius(actor), actor.ID, false, true) {
		t.Fatal("sealed control requires legal actual start and destination")
	}
	e.pathBudget = 12
	before := e.Hash()
	if path := e.findPath(actor, goal, true); len(path) != 0 || before != e.Hash() {
		t.Fatal("start connection tunneled across a true closed barrier", path)
	}
	e.state.Map.Tiles[20*e.state.Map.Width+21].Terrain = "open"
	e.state.NavigationRevision++
	e.pathBudget = 12
	if path := e.findPath(actor, goal, true); len(path) == 0 {
		t.Fatal("actual opening failed to invalidate the blocked grid cache")
	}
}

func TestNavigationConnectionPreservesSuccessfulGridRoutes(t *testing.T) {
	for _, dynamic := range []bool{false, true} {
		e := fixture(t)
		actor := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 20000}, true, 300000)
		e.spawn("power", 2, Vec{X: 25000, Y: 25000}, true, 500000)
		for _, goal := range []Vec{{X: 23000, Y: 22500}, {X: 30000, Y: 30000}, {X: 21000, Y: 30000}} {
			e.pathBudget = 12
			original := e.referenceFindPath(actor, goal, dynamic)
			e.pathBudget = 12
			path := e.findPath(actor, goal, dynamic)
			if len(original) == 0 || !reflect.DeepEqual(original, path) {
				t.Fatal("successful original route changed", dynamic, goal, original, path)
			}
		}
	}
}

func TestNavigationConnectionRoundedPhysicalStepCannotTunnel(t *testing.T) {
	e := fixture(t)
	actor := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 20000}, true, 300000)
	e.spawn("power", 2, Vec{X: 22000, Y: 19000}, true, 500000)
	goal := Vec{X: 24000, Y: 21500}
	if !e.navigationBridgeClear(actor, goal, true) {
		t.Fatal("ideal planned segment must clear the rounded corner")
	}
	e.assign(actor, Order{Kind: "move", Position: goal})
	actor.Path, actor.PathGoal, actor.PathEnd = []Vec{goal}, goal, goal
	actor.PathRevision, actor.PathResolved = e.state.NavigationRevision, true
	for tick := 0; tick < 8; tick++ {
		previous := *actor
		e.pathBudget = 12
		e.updateMovement()
		if !e.navigationBridgeClear(&previous, actor.Position, true) {
			t.Fatal("committed rounded physical step crossed the actual footprint", tick, previous.Position, actor.Position)
		}
	}
	// These source integer positions have legal endpoints, but their segment
	// penetrates the corner by almost3units. The unsafe step must be rejected.
	previous, next := Vec{X: 20819, Y: 20303}, Vec{X: 20936, Y: 20347}
	probe := *actor
	probe.Position = previous
	if !e.clear(previous, e.radius(actor), actor.ID, false, true) || !e.clear(next, e.radius(actor), actor.ID, false, true) || e.navigationBridgeClear(&probe, next, true) || actor.Position != previous {
		t.Fatal("rounded-step witness changed or the unsafe tick8 step was committed", actor.Position)
	}
}
