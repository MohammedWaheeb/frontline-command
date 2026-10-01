package viewproto

import (
	"bytes"
	"testing"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func TestRuntimeAdditionsWireNumbers(t *testing.T) {
	for _, tc := range []struct {
		message proto.Message
		name protoreflect.Name
		number protoreflect.FieldNumber
		kind protoreflect.Kind
		cardinality protoreflect.Cardinality
	}{
		{&pb.Envelope{}, "priority", 12, protoreflect.MessageKind, protoreflect.Optional},
		{&pb.PriorityFrame{}, "tick", 1, protoreflect.Uint32Kind, protoreflect.Optional},
		{&pb.PriorityFrame{}, "removed_entities", 2, protoreflect.Uint32Kind, protoreflect.Repeated},
		{&pb.PriorityFrame{}, "results", 3, protoreflect.MessageKind, protoreflect.Repeated},
		{&pb.OrderResult{}, "eligible_entities", 7, protoreflect.Uint32Kind, protoreflect.Repeated},
		{&pb.OrderResult{}, "applied_count", 8, protoreflect.Uint32Kind, protoreflect.Optional},
		{&pb.EntityPrivate{}, "shahed_committed", 30, protoreflect.BoolKind, protoreflect.Optional},
		{&pb.EntityPrivate{}, "recon_observe", 31, protoreflect.BoolKind, protoreflect.Optional},
		{&pb.PlayerSnapshot{}, "known_fields", 25, protoreflect.MessageKind, protoreflect.Repeated},
		{&pb.PlayerSnapshot{}, "explored_bits", 26, protoreflect.BytesKind, protoreflect.Optional},
		{&pb.PlayerSnapshot{}, "visible_bits", 27, protoreflect.BytesKind, protoreflect.Optional},
		{&pb.PlayerSnapshot{}, "fog_tiles", 28, protoreflect.Uint32Kind, protoreflect.Optional},
	} {
		d := tc.message.ProtoReflect().Descriptor()
		f := d.Fields().ByName(tc.name)
		if f == nil || f.Number() != tc.number || f.Kind() != tc.kind || f.Cardinality() != tc.cardinality {
			t.Fatalf("%s.%s changed wire contract: %v", d.FullName(), tc.name, f)
		}
	}
	if (&pb.Envelope{}).ProtoReflect().Descriptor().Fields().ByName("priority").ContainingOneof() == nil {
		t.Fatal("priority must be an Envelope message alternative")
	}
	for _, name := range []protoreflect.Name{"shahed_committed", "recon_observe"} {
		if (&pb.Entity{}).ProtoReflect().Descriptor().Fields().ByName(name) != nil {
			t.Fatal("owner-only flag moved into public Entity", name)
		}
	}
}

// These are codec controls at the authorized View boundary. Actual owner
// projection and execution eligibility are independently tested by simulation.
func TestRuntimeAdditionsSnapshotDetachedAndPrivate(t *testing.T) {
	view := sim.View{
		Tick: 101, Player: 1,
		Entities: []sim.EntityView{
			{ID: 11, Owner: 1, Private: &sim.EntityPrivate{ShahedCommitted: true}},
			{ID: 12, Owner: 1, Private: &sim.EntityPrivate{ReconObserve: true}},
			{ID: 21, Owner: 2},
		},
		Results: []sim.OrderResult{{Player: 1, Sequence: 5, Index: 0, Accepted: true, Code: "ok", Tick: 101, EligibleEntities: []sim.ID{11, 12}, AppliedCount: 1}},
		Explored: []bool{true, false, true}, Visible: []bool{false, false, true},
	}
	got := Snapshot(view)
	if !proto.Equal(got, jsonSnapshot(t, view)) {
		t.Fatal("additive fields differ from independent JSON contract")
	}
	if !got.Entities[0].Private.ShahedCommitted || got.Entities[0].Private.ReconObserve || !got.Entities[1].Private.ReconObserve || got.Entities[1].Private.ShahedCommitted || got.Entities[2].Private != nil {
		t.Fatal("private flags lost, conflated or invented")
	}
	if len(got.Results) != 1 || got.Results[0].AppliedCount != 1 || len(got.Results[0].EligibleEntities) != 2 || got.Results[0].EligibleEntities[1] != 12 {
		t.Fatal("receipt execution count was replaced by requested count")
	}
	if got.FogTiles != 0 || len(got.ExploredBits) != 0 || len(got.VisibleBits) != 0 || len(got.Explored) != 3 || len(got.Visible) != 3 {
		t.Fatal("normal converter must retain exact ordinary fog planes")
	}
	before := wire(t, got)
	view.Results[0].EligibleEntities[0] = 999
	view.Entities[0].Private.ShahedCommitted = false
	view.Entities[1].Private.ReconObserve = false
	view.Explored[0] = false
	if !bytes.Equal(before, wire(t, got)) {
		t.Fatal("receipt or private/fog state aliases the input View")
	}
	decoded := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(before, decoded); err != nil || !proto.Equal(got, decoded) {
		t.Fatal("new fields did not survive actual protobuf roundtrip", err)
	}
	absent := Snapshot(sim.View{Entities: []sim.EntityView{{ID: 21, Owner: 2}}})
	decoded = new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(wire(t, absent), decoded); err != nil || decoded.Entities[0].Private != nil {
		t.Fatal("foreign authorized view gained private fields on wire", err)
	}
}

func TestRuntimePriorityEnvelopeRoundtrip(t *testing.T) {
	frame := &pb.PriorityFrame{Tick: 103, RemovedEntities: []uint32{21, 23}, Results: Snapshot(sim.View{Results: []sim.OrderResult{{Player: 1, Sequence: 5, Accepted: true, Code: "ok", Tick: 103, EligibleEntities: []sim.ID{11, 12}, AppliedCount: 1}}}).Results}
	original := &pb.Envelope{Message: &pb.Envelope_Priority{Priority: frame}}
	decoded := new(pb.Envelope)
	if err := proto.Unmarshal(wire(t, original), decoded); err != nil || !proto.Equal(decoded, original) {
		t.Fatal("priority Envelope did not roundtrip", err)
	}
	if decoded.GetPriority() == nil || decoded.GetSnapshot() != nil || decoded.GetDelta() != nil || decoded.GetPriority().Results[0].AppliedCount != 1 {
		t.Fatal("priority must remain independent of full-state baseline messages")
	}
}
