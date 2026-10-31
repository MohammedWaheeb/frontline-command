package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Bug-hunt P3 (economy.go field FIFO): haulers join the queue from 7000 away,
// so the recorded head may still be travelling while a later hauler is already
// inside the 1200 loading circle. The loader slot must go to the first queued
// hauler that is actually present instead of idling behind the absent head.
func TestBugHuntP3HaulerQueueSkipsAbsentHead(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 2)
	head, near := e.entity(ids[0]), e.entity(ids[1])
	for _, v := range []*Entity{head, near} {
		e.assign(v, Order{Kind: "gather", Target: 1})
		v.Depot = e.chooseDepot(v).ID
	}
	e.observeFields(e.player(1))
	f := e.field(1)
	head.Position = Vec{X: f.Position.X + 6000, Y: f.Position.Y}
	near.Position = Vec{X: f.Position.X + 800, Y: f.Position.Y}
	f.Loader, f.Queue = 0, []ID{head.ID, near.ID}
	e.updateHarvest()
	if f.Loader != near.ID {
		t.Fatalf("loader = %d, want present hauler %d (head %d still travelling)", f.Loader, near.ID, head.ID)
	}
	if len(f.Queue) != 1 || f.Queue[0] != head.ID {
		t.Fatalf("queue = %v, want travelling head %d retained", f.Queue, head.ID)
	}
}

// Bug-hunt P3 (orders.go rig double-foundation): two build orders for one rig
// in a single packet both paid and placed foundations, but the second assign
// replaced the first build order and orphaned its foundation. The rig must
// queue the second foundation behind the first and finish both.
func TestBugHuntP3RigSecondFoundationQueues(t *testing.T) {
	e := fixture(t)
	rig := e.entity(2)
	orders := []Order{
		{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: Vec{X: 8000, Y: 13000}},
		{Kind: "build", Entities: []ID{rig.ID}, Type: "power", Position: Vec{X: 13000, Y: 13000}},
	}
	if err := e.Submit(1, e.player(1).LastSequence+1, orders); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || !e.state.Results[1].Accepted {
		t.Fatalf("build packet results %+v", e.state.Results)
	}
	var foundations []*Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Building && v.Type == "power" {
			foundations = append(foundations, v)
		}
	}
	if len(foundations) != 2 {
		t.Fatalf("foundations = %d, want 2", len(foundations))
	}
	if len(rig.Orders) != 2 || rig.Orders[0].Kind != "build" || rig.Orders[1].Kind != "build" ||
		rig.Orders[0].Target != foundations[0].ID || rig.Orders[1].Target != foundations[1].ID {
		t.Fatalf("rig orders %+v do not queue foundations %d then %d", rig.Orders, foundations[0].ID, foundations[1].ID)
	}
	for tick := 0; tick < 20000 && !(foundations[0].Complete && foundations[1].Complete); tick++ {
		e.Advance()
	}
	if !foundations[0].Complete || !foundations[1].Complete {
		t.Fatalf("foundations incomplete after queueing: %v %v (rig state %s orders %+v)",
			foundations[0].Complete, foundations[1].Complete, rig.State, rig.Orders)
	}
}

// Bug-hunt P3 (engine.go dead RNG contract): the simulation is fully
// deterministic and never reads State.RNG or the config seed after setup.
// Different seeds must evolve identically apart from the stored seed fields
// themselves, which are retained only for save-format compatibility.
func TestBugHuntP3SeedDoesNotAffectSimulation(t *testing.T) {
	players := []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}
	var engines [2]*Engine
	for i, seed := range []uint64{42, 999999} {
		e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: seed, Players: players})
		if err != nil {
			t.Fatal(err)
		}
		e.state.Countdown = 0
		issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 20000, Y: 14000}})
		ticks(e, 600)
		if e.state.RNG != seed {
			t.Fatalf("State.RNG advanced from seed %d to %d; update the documented contract", seed, e.state.RNG)
		}
		engines[i] = e
	}
	for _, e := range engines {
		e.state.RNG, e.state.Metadata.Seed = 0, 0
	}
	if engines[0].Hash() != engines[1].Hash() {
		t.Fatal("simulation diverged across seeds beyond the stored seed fields")
	}
}
