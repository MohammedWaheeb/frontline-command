package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestColorsPersistThroughSnapshotsSaveReplayAndRestart(t *testing.T) {
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 44, Players: []PlayerConfig{{ID: 1, Faction: "US", Color: 8}, {ID: 2, Faction: "IR", Color: 3}}})
	if err != nil {
		t.Fatal(err)
	}
	if err = e.ConfigurePlayerColors(map[PlayerID]uint32{1: 3, 2: 8}); err != nil {
		t.Fatal(err)
	}
	initial := e.Hash()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 120)
	if err = e.ConfigurePlayerColors(map[PlayerID]uint32{1: 1}); err == nil {
		t.Fatal("color changed during active match")
	}
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("saved colors changed hash")
	}
	view, _ := restored.PlayerView(1)
	if view.Players[0].Color != 3 || view.Players[1].Color != 8 {
		t.Fatal("public identity lost", view.Players)
	}
	if err = replay.Capture(e, true); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("replay lost color", err)
	}
	restarted, err := e.Restart()
	if err != nil || restarted.Hash() != initial {
		t.Fatal("restart lost initial color", err)
	}
	restored.player(2).Color = 3
	data, _ = restored.Save()
	if _, err = Restore(e.catalog, data); err == nil {
		t.Fatal("saved duplicate colors accepted")
	}
}
func TestColorDefaultsReserveExplicitChoicesAndChangesAreAtomic(t *testing.T) {
	cfg := Config{Map: fixtureMap(), Seed: 1, Players: []PlayerConfig{{ID: 1, Faction: "US"}, {ID: 99, Faction: "IR", Color: 1}}}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if e.player(1).Color != 2 || e.player(99).Color != 1 || cfg.Players[0].Color != 0 {
		t.Fatal("default changed requested color or input")
	}
	before := e.Hash()
	if err = e.ConfigurePlayerColors(map[PlayerID]uint32{1: 4, 99: 4}); err == nil || e.Hash() != before {
		t.Fatal("duplicate edit was not atomic", err)
	}
	if err = e.ConfigurePlayerColors(map[PlayerID]uint32{100: 4}); err == nil || e.Hash() != before {
		t.Fatal("unknown player edit was not atomic", err)
	}
	mission, err := NewMission(e.catalog, fixtureMap(), missionFixture(), "normal", 1)
	if err != nil {
		t.Fatal(err)
	}
	if err = mission.ConfigurePlayerColors(map[PlayerID]uint32{1: 8, 2: 7}); err != nil {
		t.Fatal(err)
	}
	initial := mission.Hash()
	ticks(mission, 120)
	restarted, err := mission.Restart()
	if err != nil || restarted.Hash() != initial {
		t.Fatal("scenario restart lost colors", err)
	}
}
