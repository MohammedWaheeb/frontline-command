//go:build !(js && wasm)

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// testMap is synthetic adapter test geometry, not a shipping map layout.
func testMap() content.Map {
	m := content.Map{ID: "adapter-fixture", Title: "Adapter test geometry", Author: "automated fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64, RequiredPacks: []string{"2.0.0"}, Spawns: []content.Spawn{{Position: content.Point{X: 8000, Y: 8000}}, {Position: content.Point{X: 56000, Y: 56000}}}, Shipment: content.Point{X: 32000, Y: 32000}, Fields: []content.Field{{ID: 1, Position: content.Point{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: content.Point{X: 49000, Y: 56000}, Credits: 36000000}}, Stations: []content.Station{{ID: 3, Position: content.Point{X: 32000, Y: 24000}}}}
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}

func config(t *testing.T, ai string) []byte {
	t.Helper()
	b, err := json.Marshal(CreateConfig{Map: testMap(), Seed: 42, SkipCountdown: true, Players: []sim.PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2, AI: ai}}})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func newSession(t *testing.T) *Session {
	t.Helper()
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(config(t, "normal")); err != nil {
		t.Fatal(err)
	}
	return s
}

func batch(t *testing.T, seq uint32, o *pb.Order) []byte {
	t.Helper()
	b, err := proto.Marshal(&pb.OrderBatch{Sequence: seq, Orders: []*pb.Order{o}})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func code(err error) string {
	if e, ok := err.(*Error); ok {
		return e.Code
	}
	return ""
}

func TestCreateSkipsCountdownThroughEngineTicks(t *testing.T) {
	s := newSession(t)
	if s.Info().Tick != 100 {
		t.Fatalf("countdown should be consumed by 100 engine ticks, got %d", s.Info().Tick)
	}
	if got := s.Info().Local; len(got) != 1 || got[0] != 1 {
		t.Fatalf("local players %v", got)
	}
}

func TestAuthorizedViewsAndOrders(t *testing.T) {
	s := newSession(t)
	if _, err := s.View(2); code(err) != "unauthorized_view" {
		t.Fatalf("AI view must be refused, got %v", err)
	}
	if err := s.Submit(2, batch(t, 1, &pb.Order{Kind: "stop", Entities: []uint32{4}})); code(err) != "unauthorized_player" {
		t.Fatalf("AI orders must be refused, got %v", err)
	}
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "stop", Entities: []uint32{4}})); code(err) != "not_owner" {
		t.Fatalf("enemy entity order must be rejected by engine, got %v", err)
	}
	if err := s.Submit(1, []byte{0xff, 0xff}); code(err) != "invalid_order" {
		t.Fatalf("malformed protobuf, got %v", err)
	}
	b, err := s.View(1)
	if err != nil {
		t.Fatal(err)
	}
	snap := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(b, snap); err != nil {
		t.Fatal(err)
	}
	for _, e := range snap.Entities {
		if e.Owner != 1 {
			t.Fatalf("hidden enemy entity %d serialized", e.Id)
		}
	}
}

func TestSequencingAndResultsAccumulate(t *testing.T) {
	s := newSession(t)
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 16000, Y: 12000}})); err != nil {
		t.Fatal(err)
	}
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "stop", Entities: []uint32{2}})); code(err) != "stale_sequence" {
		t.Fatalf("duplicate sequence, got %v", err)
	}
	if _, err := s.Step(5); err != nil {
		t.Fatal(err)
	}
	b, _ := s.View(1)
	snap := new(pb.PlayerSnapshot)
	proto.Unmarshal(b, snap)
	if len(snap.Results) != 1 || !snap.Results[0].Accepted || snap.Results[0].Sequence != 1 {
		t.Fatalf("results should accumulate across ticks until viewed: %v", snap.Results)
	}
	b, _ = s.View(1)
	proto.Unmarshal(b, snap)
	if len(snap.Results) != 0 {
		t.Fatal("results must drain after a view")
	}
}

func TestSaveRestoreContinuesIdentically(t *testing.T) {
	a := newSession(t)
	a.Submit(1, batch(t, 1, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 20000, Y: 14000}}))
	a.Step(37)
	saved, err := a.Save()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewSession()
	if _, err := b.Load(saved.Data, saved.Local); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		a.Step(40)
		b.Step(40)
		ha, _ := a.Hash()
		hb, _ := b.Hash()
		if ha != hb {
			t.Fatalf("restored run diverged at tick %d", a.Info().Tick)
		}
	}
}

func TestCorruptAndIncompatibleSavesAreClassified(t *testing.T) {
	s := newSession(t)
	saved, _ := s.Save()
	before, _ := s.Hash()

	if _, err := s.Load([]byte("not json"), []sim.PlayerID{1}); code(err) != "save_corrupt" {
		t.Fatalf("garbage: %v", err)
	}
	tampered := bytes.Replace(saved.Data, []byte(`"credits":6000000`), []byte(`"credits":9000000`), 1)
	if bytes.Equal(tampered, saved.Data) {
		t.Fatal("fixture did not tamper")
	}
	if _, err := s.Load(tampered, []sim.PlayerID{1}); code(err) != "save_corrupt" {
		t.Fatalf("tampered: %v", err)
	}
	var env saveEnvelope
	json.Unmarshal(saved.Data, &env)
	env.Version = 2
	future, _ := json.Marshal(env)
	if _, err := s.Load(future, []sim.PlayerID{1}); code(err) != "save_incompatible" {
		t.Fatalf("future format: %v", err)
	}
	// Re-checksum a state claiming another simulation version.
	for _, version := range []string{"0.0.1", "0.2.0", "0.3.0", "0.3.1"} {
		state := strings.Replace(string(env.State), `"simulation":"`+sim.Version+`"`, `"simulation":"`+version+`"`, 1)
		old := resum(t, state)
		original := append([]byte(nil), old...)
		_, err := s.Load(old, []sim.PlayerID{1})
		e, ok := err.(*Error)
		if !ok || e.Code != "save_incompatible" || e.Found == nil || e.Found.Simulation != version || e.Expected.Simulation != sim.Version {
			t.Fatalf("old simulation %s: %#v", version, err)
		}
		if !bytes.Equal(old, original) {
			t.Fatal("incompatible input bytes changed")
		}
	}
	if _, err := s.Load(saved.Data, []sim.PlayerID{2, 9}); code(err) != "save_invalid" {
		t.Fatalf("unknown local player: %v", err)
	}
	if after, _ := s.Hash(); after != before {
		t.Fatal("failed loads must leave the active match untouched")
	}
}

func resum(t *testing.T, state string) []byte {
	t.Helper()
	b, err := json.Marshal(struct {
		Version uint32          `json:"version"`
		SHA256  string          `json:"sha256"`
		State   json.RawMessage `json:"state"`
	}{1, sha256hex([]byte(state)), json.RawMessage(state)})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func sha256hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func TestDisposeRejectsFurtherCalls(t *testing.T) {
	s := newSession(t)
	s.Dispose()
	if _, err := s.Step(1); code(err) != "no_match" {
		t.Fatalf("step after dispose: %v", err)
	}
	if _, err := s.Hash(); code(err) != "no_match" {
		t.Fatalf("hash after dispose: %v", err)
	}
}

func TestStepBounds(t *testing.T) {
	s := newSession(t)
	for _, n := range []int{0, -1, maxStepPerCall + 1} {
		if _, err := s.Step(n); code(err) != "invalid_step" {
			t.Fatalf("step %d: %v", n, err)
		}
	}
}

func TestMissionAdapterKeepsScriptedOpponentPrivate(t *testing.T) {
	s := newSession(t)
	mission := content.Mission{ID: "adapter-mission", Version: "1", MapID: testMap().ID, Title: "Adapter controller fixture", Faction: "US", Mode: "tutorial", DefaultBases: true, Players: []content.MissionPlayer{{ID: 1, Faction: "US", Name: "Human", Team: 1, Credits: 6000000, Controller: "human"}, {ID: 2, Faction: "IR", Name: "Script", Team: 2, Credits: 6000000, Controller: "script"}}, Objectives: []content.MissionObjective{{ID: "timer", Text: "Fixture", Condition: content.MissionCondition{Kind: "timer", Tick: 300}}}}
	data, _ := json.Marshal(CreateConfig{Map: testMap(), Mission: &mission, Seed: 42, Difficulty: "normal"})
	info, err := s.Create(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(info.Local) != 1 || info.Local[0] != 1 {
		t.Fatal("scripted player exposed as local human", info)
	}
	save, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	before, _ := s.Hash()
	for _, ids := range [][]sim.PlayerID{{2}, {1, 1}} {
		if _, err := s.Load(save.Data, ids); code(err) != "save_invalid" {
			t.Fatal("invalid local list accepted", ids, err)
		}
	}
	if after, _ := s.Hash(); after != before {
		t.Fatal("failed load replaced the active mission")
	}
	if _, err := s.View(2); code(err) != "unauthorized_view" {
		t.Fatal("script view exposed", err)
	}
}
