package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/fogcodec"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"reflect"
	"testing"
)

func unpackSnapshotFogForTest(t *testing.T, packed *pb.PlayerSnapshot) *pb.PlayerSnapshot {
	t.Helper()
	result := proto.Clone(packed).(*pb.PlayerSnapshot)
	var err error
	result.Explored, err = fogcodec.Unpack(result.ExploredBits, result.FogTiles)
	if err != nil {
		t.Fatal(err)
	}
	result.Visible, err = fogcodec.Unpack(result.VisibleBits, result.FogTiles)
	if err != nil {
		t.Fatal(err)
	}
	result.FogTiles, result.ExploredBits, result.VisibleBits = 0, nil, nil
	return result
}

// These are actual permitted Go PlayerViews. Compact wire must reconstruct every
// public/private field of the existing converter exactly for both perspectives.
func TestCompactFogActualPlayerViewsWire(t *testing.T) {
	e, err := sim.New(content.MustBase(), sim.Config{Map: testMap(), Seed: 33, Players: []sim.PlayerConfig{
		{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	before := e.Hash()
	for _, player := range []sim.PlayerID{1, 2} {
		view, ok := e.PlayerView(player)
		if !ok {
			t.Fatal("missing public view")
		}
		held, _ := json.Marshal(view)
		ordinary, err := snapshot(view)
		if err != nil {
			t.Fatal(err)
		}
		compact, err := compactSnapshot(view)
		if err != nil {
			t.Fatal(err)
		}
		if compact.FogTiles != uint32(len(view.Visible)) || len(compact.Visible) != 0 || len(compact.Explored) != 0 {
			t.Fatal("duplicate or truncated mask representation")
		}
		if len(compact.VisibleBits) != (len(view.Visible)+7)/8 || len(compact.ExploredBits) != (len(view.Explored)+7)/8 {
			t.Fatal("packed lengths")
		}
		wire, err := proto.MarshalOptions{Deterministic: true}.Marshal(compact)
		if err != nil {
			t.Fatal(err)
		}
		decoded := new(pb.PlayerSnapshot)
		if err := proto.Unmarshal(wire, decoded); err != nil {
			t.Fatal(err)
		}
		if !proto.Equal(ordinary, unpackSnapshotFogForTest(t, decoded)) {
			t.Fatal("compact transport changed permitted view")
		}
		ordinaryWire, _ := proto.MarshalOptions{Deterministic: true}.Marshal(ordinary)
		if len(wire) >= len(ordinaryWire) {
			t.Fatal("compact actual frame did not reduce bytes", len(wire), len(ordinaryWire))
		}
		for _, entity := range decoded.Entities {
			if entity.Owner != uint32(player) && entity.Private != nil {
				t.Fatal("foreign private data")
			}
			if entity.Owner != uint32(player) {
				t.Fatal("initial hidden enemy serialized")
			}
		}
		after, _ := json.Marshal(view)
		if !bytes.Equal(held, after) {
			t.Fatal("encoder changed held public view")
		}
	}
	if e.Hash() != before {
		t.Fatal("transport changed simulation")
	}
}

func TestCompactFogDeltaReplacesBothPlanesWithoutUnion(t *testing.T) {
	initial := sim.View{Player: 1, Tick: 10, Explored: []bool{false, true, false, false, false, false, false, false, false}, Visible: []bool{false, true, false, false, false, false, false, false, false}}
	lost := initial
	lost.Tick = 11
	lost.Visible = make([]bool, 9)
	previous, err := compactSnapshot(initial)
	if err != nil {
		t.Fatal(err)
	}
	current, err := compactSnapshot(lost)
	if err != nil {
		t.Fatal(err)
	}
	change := delta(previous, current)
	wire, err := proto.Marshal(change)
	if err != nil {
		t.Fatal(err)
	}
	decoded := new(pb.StateDelta)
	if err := proto.Unmarshal(wire, decoded); err != nil {
		t.Fatal(err)
	}
	canonical := unpackSnapshotFogForTest(t, decoded.State)
	if !canonical.Explored[1] || canonical.Visible[1] || canonical.Visible[2] || canonical.Explored[2] {
		t.Fatal("lost sight retained or unknown tile disclosed")
	}
	if !reflect.DeepEqual(initial.Visible, []bool{false, true, false, false, false, false, false, false, false}) {
		t.Fatal("held bool plane mutated")
	}
	prior := unpackSnapshotFogForTest(t, previous)
	if !prior.Visible[1] {
		t.Fatal("delta changed prior packed plane")
	}
}

func TestCompactFogRejectsWrongCardinalityAndPreservesEmptyDiagnostic(t *testing.T) {
	for _, view := range []sim.View{{Visible: make([]bool, 8), Explored: make([]bool, 9)}, {Visible: make([]bool, 65537), Explored: make([]bool, 65537)}} {
		if _, err := compactSnapshot(view); !errors.Is(err, fogcodec.ErrCardinality) {
			t.Fatal("malformed view accepted", err)
		}
	}
	got, err := compactSnapshot(sim.View{Player: 1, Tick: 42})
	if err != nil || got.Tick != 42 || got.FogTiles != 0 || len(got.ExploredBits) != 0 || len(got.VisibleBits) != 0 {
		t.Fatal("empty diagnostic changed", got, err)
	}
}
