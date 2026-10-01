package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// These prepared routing fixtures cover valid map geometry and lifecycle
// changes. They do not measure paid openings or establish map balance.
func harvestDeliveriesFor(e *Engine, count uint32) map[ID]int {
	deliveries := map[ID]int{}
	for range count {
		e.Advance()
		for _, event := range e.state.Events {
			if event.Tick == e.Tick() && event.Kind == "cargo_delivered" {
				deliveries[event.Entity]++
			}
		}
	}
	return deliveries
}

func TestHarvestAlternateLoadingSideAroundCliff(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 2)
	// The preferred northwest loading point overlaps this cliff. The field
	// itself and its other approaches remain legal and connected.
	e.state.Map.Tiles[32*e.state.Map.Width+31] = content.Tile{Terrain: "cliff"}
	if err := e.state.Map.Validate(); err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "gather", Entities: ids, Target: 1})
	deliveries := harvestDeliveriesFor(e, 6000)
	for _, id := range ids {
		if deliveries[id] == 0 {
			v := e.entity(id)
			t.Errorf("hauler%d never delivered around a legal cliff: state=%s position=%+v queue=%v loader=%d", id, v.State, v.Position, e.state.Fields[0].Queue, e.state.Fields[0].Loader)
		}
	}
}

func TestHarvestEightHaulersAtMapEdgeContinueDelivering(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 8)
	field := e.state.Fields[0]
	field.Position = Vec{X: 1500, Y: 1500}
	e.state.Map.Fields[0].Position = field.Position
	for _, entity := range e.state.Entities {
		if entity.Owner == 1 && e.role(entity) == "supply" {
			entity.Position = Vec{X: 2500, Y: 14000}
		}
	}
	// All starting haulers are separated, inside the map and clear of the HQ.
	for index, id := range ids {
		v := e.entity(id)
		v.Position = Vec{X: 5000 + int32(index%4)*1800, Y: 2500 + int32(index/4)*1800}
		v.LastPosition, v.Anchor = v.Position, v.Position
		if !e.clear(v.Position, e.radius(v), v.ID, false, true) {
			t.Fatalf("invalid fixture hauler%d at%+v", id, v.Position)
		}
	}
	if err := e.state.Map.Validate(); err != nil {
		t.Fatal(err)
	}
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "gather", Entities: ids, Target: 1})
	deliveries := harvestDeliveriesFor(e, 3000)
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	for range 9000 {
		e.Advance()
		restored.Advance()
		for _, event := range e.state.Events {
			if event.Tick == e.Tick() && event.Kind == "cargo_delivered" {
				deliveries[event.Entity]++
			}
		}
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("derived edge parking changed after restoration")
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("edge parking replay drift", err)
	}
	for _, id := range ids {
		if deliveries[id] == 0 {
			v := e.entity(id)
			t.Errorf("hauler%d never delivered at map edge: state=%s position=%+v cargo=%d queue=%v", id, v.State, v.Position, v.Cargo, field.Queue)
		}
	}
}

func TestHarvestDisabledDepotReleasesSharedFieldAndRecovers(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 2)
	e.player(2).Team = e.player(1).Team
	field := e.state.Fields[0]
	loader := e.entity(ids[0])
	loader.Field, loader.Position, loader.Cargo = field.ID, field.Position, 100000
	loader.LastPosition, loader.Anchor = loader.Position, loader.Position
	loader.Orders, loader.State = []Order{{Kind: "gather", Target: 1}}, "loading"
	field.Loader = loader.ID
	var disabledDepot *Entity
	for _, entity := range e.state.Entities {
		if entity.Owner == 1 && e.role(entity) == "supply" {
			disabledDepot = entity
			loader.Depot = entity.ID
			entity.DisabledUntil = e.Tick() + 10000
		}
	}
	if disabledDepot == nil {
		t.Fatal("fixture has no depot")
	}
	e.spawn("power", 2, Vec{X: 16000, Y: 8000}, true, 0)
	activeDepot := e.spawn("supply", 2, Vec{X: 38000, Y: 35000}, true, 0)
	activeDepot.IncludedHauler = true
	other := e.entity(ids[1])
	other.Owner, other.Type, other.Field, other.Depot = 2, "IR.hauler", field.ID, activeDepot.ID
	other.Position = Vec{X: 35000, Y: 30000}
	other.LastPosition, other.Anchor = other.Position, other.Position
	other.Orders, other.State = []Order{{Kind: "gather", Target: 1}}, "gathering"
	e.recalculate()
	e.updateFog()
	deliveries := harvestDeliveriesFor(e, 3000)
	if deliveries[other.ID] == 0 {
		t.Errorf("inactive depot starved another owner's active route: loader=%d firstState=%s secondState=%s queue=%v", field.Loader, loader.State, other.State, field.Queue)
	}
	if loader.Cargo != 100000 {
		t.Errorf("inactive depot changed retained cargo: %d", loader.Cargo)
	}
	disabledDepot.DisabledUntil = e.Tick()
	deliveries = harvestDeliveriesFor(e, 3000)
	if deliveries[loader.ID] == 0 {
		t.Errorf("restored depot did not recover existing gather order: state=%s cargo=%d", loader.State, loader.Cargo)
	}
}

func TestHarvestReservationSurvivesRerouteThenWithdrawsOnConfirmedFailure(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 2)
	field := e.state.Fields[0]
	var depot ID
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "supply" {
			depot = v.ID
			break
		}
	}
	for _, id := range ids {
		v := e.entity(id)
		v.Field, v.Depot = field.ID, depot
		v.Orders = []Order{{Kind: "gather", Target: 1}}
		v.State = "gathering"
	}
	field.Queue = append([]ID(nil), ids...)
	head := e.entity(ids[0])
	head.Cargo = 100000
	head.RouteFailures = 1
	e.updateHarvest()
	if len(field.Queue) != 2 || field.Queue[0] != head.ID {
		t.Fatal("short reroute released FIFO reservation", field.Queue)
	}
	head.RouteFailures, head.Blocked = 2, true
	e.updateHarvest()
	if len(field.Queue) != 1 || field.Queue[0] != ids[1] {
		t.Fatal("confirmed failure retained unusable reservation", field.Queue)
	}
	waiting, moving, _ := e.harvestGoal(head)
	if distance(waiting, field.Position) < 3000 || !moving {
		t.Fatal("withdrawn hauler did not yield to a legal waiting destination", waiting)
	}
	if head.Cargo != 100000 || len(head.Orders) != 1 || head.Orders[0].Kind != "gather" {
		t.Fatal("failure discarded cargo or intended task")
	}
	deliveries := harvestDeliveriesFor(e, 6000)
	for _, id := range ids {
		if deliveries[id] == 0 {
			t.Errorf("hauler%d did not recover and deliver after confirmed route failure", id)
		}
	}
}
