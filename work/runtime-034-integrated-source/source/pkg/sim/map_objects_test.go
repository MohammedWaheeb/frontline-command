package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"testing"
)

func objectFixture(t *testing.T) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Objects = []content.MapObject{{ID: 1, Class: "garrison", Position: Vec{X: 15500, Y: 15500}}, {ID: 2, Class: "heavy_prop", Position: Vec{X: 40000, Y: 40000}}}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}
func objectEntity(e *Engine, id uint32) *Entity {
	for _, v := range e.state.Entities {
		if v.MapObject == id {
			return v
		}
	}
	return nil
}
func TestNeutralGarrisonBoardFireLeaveAndRestore(t *testing.T) {
	e := objectFixture(t)
	house := objectEntity(e, 1)
	u := e.spawn("US.rifle", 1, Vec{X: 13100, Y: 15500}, true, 400000)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{u.ID}, Target: house.ID})
	ticks(e, 45)
	if u.Container != house.ID || house.Owner != 1 {
		t.Fatal("neutral garrison was not occupied", u.Container, house.Owner)
	}
	enemy := e.spawn("IR.rifle", 2, Vec{X: 20800, Y: 15500}, true, 300000)
	hp := enemy.HP
	ticks(e, 50)
	if enemy.HP >= hp {
		t.Fatal("garrison occupants did not fire")
	}
	save, _ := e.Save()
	if restored, err := Restore(e.catalog, save); err != nil || restored.Hash() != e.Hash() {
		t.Fatal("occupied garrison restore", err)
	}
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{house.ID}})
	ticks(e, 45)
	if u.Container != 0 || house.Owner != 0 {
		t.Fatal("empty garrison retained ownership or passenger")
	}
	save, _ = e.Save()
	if _, err := Restore(e.catalog, save); err != nil {
		t.Fatal("neutral garrison restore", err)
	}
}
func TestPropDestructionChangesNavigationOnceWithoutFogLeak(t *testing.T) {
	e := objectFixture(t)
	prop := objectEntity(e, 2)
	if e.clear(prop.Position, 350, 0, false, false) {
		t.Fatal("prop did not block movement")
	}
	before := e.state.NavigationRevision
	prop.HP = 0
	e.cleanup()
	e.updateFog()
	if e.state.NavigationRevision != before+1 || !e.clear(prop.Position, 350, 0, false, false) {
		t.Fatal("destruction did not clear path once")
	}
	e.cleanup()
	if e.state.NavigationRevision != before+1 {
		t.Fatal("duplicate navigation invalidation")
	}
	view, _ := e.PlayerView(1)
	if len(view.Rubble) != 0 {
		t.Fatal("unseen destruction leaked through snapshot")
	}
	e.spawn("US.recon", 1, Vec{X: 38000, Y: 40000}, true, 0)
	e.updateFog()
	view, _ = e.PlayerView(1)
	if len(view.Rubble) != 1 || view.Rubble[0] != 2 || e.state.Map.TileAt(prop.Position).Terrain != "rubble" {
		t.Fatal("scouted rubble missing")
	}
	save, _ := e.Save()
	if restored, err := Restore(e.catalog, save); err != nil || restored.Hash() != e.Hash() {
		t.Fatal("debris save/restore mismatch", err)
	}
}
func TestNeutralObjectsAreNotAutomaticTargetsOrBuildable(t *testing.T) {
	e := objectFixture(t)
	house := objectEntity(e, 1)
	tank := e.spawn("US.tank", 1, Vec{X: 12500, Y: 15500}, true, 0)
	e.updateFog()
	ticks(e, 80)
	if house.HP != house.MaxHP {
		t.Fatal("automatic fire selected neutral object")
	}
	if code := e.startBuilding(e.player(1), e.entity(2), Order{Type: "map.garrison", Position: Vec{X: 14500, Y: 8500}}); code != "unknown_building" {
		t.Fatal("map object purchasable", code)
	}
	issue(t, e, 1, Order{Kind: "attack", Entities: []ID{tank.ID}, Target: house.ID})
	ticks(e, 80)
	if house.HP == house.MaxHP {
		t.Fatal("explicit attack could not clear neutral object")
	}
}

func TestMapBlueprintPreservesUnseenOriginalTerrainAcrossRestore(t *testing.T) {
	e := objectFixture(t)
	original := e.MapBlueprint()
	prop := objectEntity(e, 2)
	prop.HP = 0
	e.cleanup()
	e.updateFog()
	before, _ := e.PlayerView(1)
	if len(before.Rubble) != 0 {
		t.Fatal("fixture destruction is visible")
	}
	check := func(engine *Engine) {
		t.Helper()
		blueprint := engine.MapBlueprint()
		a, _ := json.Marshal(original)
		b, _ := json.Marshal(blueprint)
		if string(a) != string(b) {
			t.Fatal("public map exposed unseen world changes")
		}
		hash := engine.Hash()
		blueprint.Tiles[0].Terrain = "water"
		blueprint.Objects[0].Position.X++
		if engine.Hash() != hash {
			t.Fatal("map blueprint aliases live state")
		}
	}
	check(e)
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	check(restored)
	e.state.MapOriginalTiles = nil
	save, _ = e.Save()
	if _, err := Restore(e.catalog, save); err == nil {
		t.Fatal("accepted missing terrain history")
	}
}
