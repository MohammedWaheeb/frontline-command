package main

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"testing"
)

// This test has no native-only build tag: run it in both native Go and the
// real js/wasm adapter to cover JSON-to-protobuf and binary transport fields.
func TestMissionOriginAdapterBinarySaveCodec(t *testing.T) {
	m := content.Map{ID: "origin-adapter-fixture", Title: "Origin adapter fixture", Author: "automated fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64, Spawns: []content.Spawn{{Position: content.Point{X: 8000, Y: 8000}}, {Position: content.Point{X: 56000, Y: 56000}}}, Shipment: content.Point{X: 32000, Y: 32000}, Fields: []content.Field{{ID: 1, Position: content.Point{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: content.Point{X: 49000, Y: 56000}, Credits: 36000000}}, Stations: []content.Station{{ID: 3, Position: content.Point{X: 32000, Y: 24000}}}}
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	mission := content.Mission{ID: "origin-adapter", Version: "1", MapID: m.ID, Title: "Origin privacy adapter fixture", Faction: "US", Mode: "tutorial", DefaultBases: true, Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 6000000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Script", Team: 2, Credits: 6000000, Controller: "script"}}, Initial: []content.MissionSpawn{{Tag: "private-assigned-group", Type: "US.rifle", Owner: 1, Position: content.Point{X: 18000, Y: 8000}, Count: 1}, {Tag: "private-enemy-group", Type: "IR.rifle", Owner: 2, Position: content.Point{X: 45000, Y: 45000}, Count: 1}}, Objectives: []content.MissionObjective{{ID: "timer", Text: "Adapter test timer", Condition: content.MissionCondition{Kind: "timer", Tick: 10000}}}}
	session, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	config, err := json.Marshal(CreateConfig{Map: m, Mission: &mission, Difficulty: "normal", Seed: 42})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = session.Create(config); err != nil {
		t.Fatal(err)
	}
	before, err := session.Hash()
	if err != nil {
		t.Fatal(err)
	}
	check := func() {
		t.Helper()
		raw, err := session.View(1)
		if err != nil {
			t.Fatal(err)
		}
		decoded := new(pb.PlayerSnapshot)
		if err = proto.Unmarshal(raw, decoded); err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, entity := range decoded.Entities {
			if entity.Owner != 1 && entity.Private != nil {
				t.Fatal("foreign private metadata")
			}
			if entity.Private != nil && entity.Private.MissionOrigin != "" {
				found++
				if entity.Private.MissionOrigin != "initial:0" || entity.Type != "US.rifle" {
					t.Fatalf("wrong original group: %+v", entity)
				}
			}
		}
		if found != 1 {
			t.Fatalf("marked own originals %d", found)
		}
	}
	check()
	if after, _ := session.Hash(); after != before {
		t.Fatal("adapter view mutated engine hash")
	}
	save, err := session.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = session.Load(save.Data, []sim.PlayerID{1}); err != nil {
		t.Fatal(err)
	}
	check()
	if after, _ := session.Hash(); after != before {
		t.Fatal("origin restore changed engine hash")
	}
	if _, err = session.View(2); err == nil {
		t.Fatal("script opponent perspective exposed")
	}
}
