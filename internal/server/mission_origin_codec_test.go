package server

import (
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"testing"
)

func TestMissionOriginProtocolSnapshotAndOwnershipDelta(t *testing.T) {
	view := sim.View{Player: 1, Entities: []sim.EntityView{{ID: 10, Owner: 1, Type: "US.hauler", Private: &sim.EntityPrivate{MissionOrigin: "initial:255", HP: 700000}}, {ID: 20, Owner: 2, Type: "IR.rifle"}}}
	before, err := snapshot(view)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := proto.Marshal(before)
	if err != nil {
		t.Fatal(err)
	}
	decoded := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(raw, decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Entities[0].Private.MissionOrigin != "initial:255" || decoded.Entities[1].Private != nil {
		t.Fatal("private origin codec damaged")
	}
	view.Tick = 1
	view.Entities[0].Owner = 2
	view.Entities[0].Private = nil
	after, err := snapshot(view)
	if err != nil {
		t.Fatal(err)
	}
	change := delta(before, after)
	if len(change.State.Entities) != 1 || change.State.Entities[0].Private != nil {
		t.Fatal("ownership delta retained former private origin")
	}
	if before.Entities[0].Private.MissionOrigin != "initial:255" {
		t.Fatal("delta mutated previous snapshot")
	}
}
