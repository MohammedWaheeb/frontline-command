package sim

import (
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

func TestHarvestDepotRecordedCongestionRecovers(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AUTHORED_DEPOT_INSPECT")
	if dir == "" {
		t.Skip("opt-in unedited authored congestion recovery")
	}
	data, err := os.ReadFile(filepath.Join(dir, "diagnostic-36000.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	e, err := Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	deliveries := harvestDeliveriesFor(e, 200)
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	for range 2200 {
		e.Advance()
		restored.Advance()
		for _, event := range e.state.Events {
			if event.Tick == e.Tick() && event.Kind == "cargo_delivered" {
				deliveries[event.Entity]++
			}
		}
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("depot recovery restore drift")
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("depot recovery replay drift", err)
	}
	for _, id := range []ID{13, 20} {
		v := e.entity(id)
		t.Logf("hauler%d deliveries%d state%s position%+v cargo%d path%v", id, deliveries[id], v.State, v.Position, v.Cargo, v.Path)
		if deliveries[id] == 0 {
			t.Errorf("original loaded hauler%d did not recover within120seconds", id)
		}
	}
	t.Logf("recovered_tick=%d hash=%s", e.Tick(), e.Hash())
}

// Prepared cargo is a routing fixture, not a paid opening or economic balance
// claim. The actual player-issued gather order and unloading payment are real.
func depotApproachFixture(t testing.TB) (*Engine, *Entity, *Entity) {
	t.Helper()
	e, ids := harvestRoutingFixture(t, 0, 5000, 1)
	v := e.entity(ids[0])
	var depot *Entity
	for _, entity := range e.state.Entities {
		if entity.Owner == 1 && e.role(entity) == "supply" {
			depot = entity
		}
	}
	v.Position = Vec{X: depot.Position.X, Y: depot.Position.Y - 7500}
	v.LastPosition, v.Anchor = v.Position, v.Position
	v.Cargo = 600000
	v.Depot = depot.ID
	blocker := e.spawn("US.rifle", 1, e.approachPoint(v, depot), true, 0)
	blocker.Anchor = blocker.Position
	e.recalculate()
	e.updateFog()
	if !e.clear(v.Position, e.radius(v), v.ID, false, true) {
		t.Fatal("invalid hauler fixture")
	}
	if e.clear(e.approachPoint(v, depot), e.radius(v), v.ID, false, true) {
		t.Fatal("radial approach not obstructed")
	}
	return e, v, depot
}

func TestHarvestDepotHumanGatherUsesLegalAlternateAndRestores(t *testing.T) {
	e, v, depot := depotApproachFixture(t)
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "gather", Entities: []ID{v.ID}, Target: 1})
	if len(v.Path) == 0 {
		t.Fatal("no alternate path selected")
	}
	probe := *v
	probe.Position = v.PathEnd
	if e.edgeDistance(&probe, depot) > 1100 {
		t.Fatal("expanded approach range")
	}
	original := v.Position
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	delivered := false
	for range 600 {
		before := v.Position
		e.Advance()
		restored.Advance()
		if distance(before, v.Position) > 151 {
			t.Fatal("hauler teleported", before, v.Position)
		}
		for _, event := range e.state.Events {
			if event.Tick == e.Tick() && event.Kind == "cargo_delivered" && event.Entity == v.ID {
				delivered = true
			}
		}
	}
	if !delivered || e.player(1).Income < 600000 {
		t.Fatal("human gather never unloaded its cargo")
	}
	if original == v.Position {
		t.Fatal("no physical movement")
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("restored human route drift")
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("human route replay drift", err)
	}
}

func TestHarvestDepotPreservesClearRadialAndUsablePath(t *testing.T) {
	e, ids := harvestRoutingFixture(t, 0, 5000, 1)
	v := e.entity(ids[0])
	var depot *Entity
	for _, entity := range e.state.Entities {
		if entity.Owner == 1 && e.role(entity) == "supply" {
			depot = entity
		}
	}
	v.Cargo = 600000
	v.Depot = depot.ID
	radial := e.approachPoint(v, depot)
	e.pathBudget = 12
	if got := e.harvestDepotGoal(v, depot); got != radial || e.pathBudget != 12 {
		t.Fatal("clear radial path changed", got, radial)
	}
	// A deliberately chosen legal side remains stable even when radial is clear.
	end := Vec{X: depot.Position.X + 3000, Y: depot.Position.Y}
	v.Path = []Vec{end}
	v.PathGoal = end
	v.PathEnd = end
	v.PathRevision = e.state.NavigationRevision
	if got := e.harvestDepotGoal(v, depot); got != end || e.pathBudget != 12 {
		t.Fatal("usable route was churned", got)
	}
}

func TestHarvestDepotFailedAlternatesShareBudgetAndRetry(t *testing.T) {
	e, v, depot := depotApproachFixture(t)
	// A closed static ring around the hauler leaves legal depot destinations but
	// no physical exit, requiring ordinary failed searches instead of movement.
	for y := int32(27); y <= 32; y++ {
		for x := int32(29); x <= 35; x++ {
			if x == 29 || x == 35 || y == 27 || y == 32 {
				e.state.Map.Tiles[y*e.state.Map.Width+x] = content.Tile{Terrain: "cliff"}
			}
		}
	}
	e.state.Map.Shipment = Vec{X: 40000, Y: 24000}
	e.state.Map.Fields[0].Position = Vec{X: 20000, Y: 32000}
	e.state.Fields[0].Position = e.state.Map.Fields[0].Position
	e.state.NavigationRevision++
	before := v.Position
	e.pathBudget = 12
	e.harvestDepotGoal(v, depot)
	if used := 12 - e.pathBudget; used == 0 || used > 3 {
		t.Fatal("alternate search budget", used)
	}
	if len(v.Path) != 0 || v.NextRouteAt != e.Tick()+seconds(2) || v.Position != before {
		t.Fatal("failed route changed movement or retry state")
	}
	remaining := e.pathBudget
	e.harvestDepotGoal(v, depot)
	if e.pathBudget != remaining {
		t.Fatal("retry issued more searches before deadline")
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	restored.pathBudget = 12
	if got := restored.harvestDepotGoal(restored.entity(v.ID), restored.entity(depot.ID)); got != v.PathGoal || restored.pathBudget != 12 {
		t.Fatal("retry changed after restoration")
	}
	e.state.Tick = v.NextRouteAt
	e.pathBudget = 1
	e.harvestDepotGoal(v, depot)
	if e.pathBudget != 0 {
		t.Fatal("did not respect last shared path slot")
	}
	e.state.Tick = v.NextRouteAt
	e.pathBudget = 0
	h := e.Hash()
	e.harvestDepotGoal(v, depot)
	if h != e.Hash() {
		t.Fatal("empty shared budget changed persisted route")
	}
}
