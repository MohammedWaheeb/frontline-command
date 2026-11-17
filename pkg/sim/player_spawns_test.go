package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"testing"
)

func spawnConfig() Config {
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 56000}}, content.Spawn{Position: Vec{X: 56000, Y: 8000}})
	return Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 2, Name: "Second ID first", Faction: "IR", Team: 2, Spawn: 4}, {ID: 1, Name: "First ID second", Faction: "US", Team: 1, Spawn: 2}}}
}
func TestExplicitPlayerSpawns(t *testing.T) {
	cfg := spawnConfig()
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if e.entity(1).Owner != 2 || e.entity(1).Position != cfg.Map.Spawns[3].Position || e.entity(3).Owner != 1 || e.entity(3).Position != cfg.Map.Spawns[1].Position {
		t.Fatal("spawn ignored or IDs reordered")
	}
	if e.state.Map.Spawns[0] != cfg.Map.Spawns[0] {
		t.Fatal("map starts were permuted")
	}
	for order, id := range e.state.SpawnPlayers {
		p := e.player(id)
		start := cfg.Map.Spawns[cfg.Players[order].Spawn-1].Position
		nearest := e.state.Fields[0]
		for _, f := range e.state.Fields {
			if dist2(start, f.Position) < dist2(start, nearest.Position) {
				nearest = f
			}
		}
		if len(p.KnownFields) != 1 || p.KnownFields[0].ID != nearest.ID {
			t.Fatalf("player %d briefing uses wrong spawn", id)
		}
	}
	initial := e.Hash()
	save, _ := e.Save()
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != initial {
		t.Fatalf("restore: %v", err)
	}
	restarted, err := restored.Restart()
	if err != nil || restarted.Hash() != initial {
		t.Fatalf("restart: %v", err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 120)
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatalf("explicit-spawn replay: %v", err)
	}
}
func TestPlayerSpawnsValidateResolvedLegacyAndExplicitPositions(t *testing.T) {
	for _, spawns := range [][2]uint32{{5, 2}, {4, 4}, {2, 0}, {0, 1}} {
		cfg := spawnConfig()
		cfg.Players[0].Spawn = spawns[0]
		cfg.Players[1].Spawn = spawns[1]
		if _, err := New(content.MustBase(), cfg); err == nil {
			t.Fatalf("accepted %v", spawns)
		}
	}
	cfg := spawnConfig()
	cfg.Players[0].Spawn = 0
	cfg.Players[1].Spawn = 4
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if e.entity(1).Position != cfg.Map.Spawns[0].Position || e.entity(3).Position != cfg.Map.Spawns[3].Position {
		t.Fatal("mixed explicit/default spawn")
	}
	e.player(2).Spawn = 4
	bad, _ := e.Save()
	if _, err = Restore(e.catalog, bad); err == nil {
		t.Fatal("restored duplicate spawn")
	}
}
func TestLegacyPlayerSpawnsPreserveSaveAndReplayIdentity(t *testing.T) {
	e := fixture(t)
	before := e.Hash()
	save, _ := e.Save()
	if bytes.Contains(save, []byte(`"spawn":`)) {
		t.Fatal("default field changed legacy save shape")
	}
	restored, err := Restore(e.catalog, save)
	if err != nil || restored.Hash() != before {
		t.Fatalf("legacy restore %v", err)
	}
	again, _ := restored.Save()
	if !bytes.Equal(save, again) {
		t.Fatal("legacy save bytes changed on restore")
	}
	config := spawnConfig()
	config.Players[0].Spawn = 0
	config.Players[1].Spawn = 0
	legacy, _ := New(e.catalog, config)
	if legacy.entity(1).Position != config.Map.Spawns[0].Position || legacy.entity(3).Position != config.Map.Spawns[1].Position {
		t.Fatal("omitted starts no longer use input order")
	}
	replay, _ := NewReplay(e)
	ticks(e, 130)
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatalf("legacy replay %v", err)
	}
	// Omitted and explicit-zero JSON configs have precisely the same state hash.
	b, _ := json.Marshal(config)
	var parsed Config
	if err = json.Unmarshal(b, &parsed); err != nil {
		t.Fatal(err)
	}
	copy, err := New(e.catalog, parsed)
	if err != nil || copy.Hash() != legacy.Hash() {
		t.Fatal("config JSON changed legacy identity", err)
	}
}
