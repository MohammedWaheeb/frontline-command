//go:build !(js && wasm)

package main

import (
	"bytes"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"reflect"
	"testing"
)

func TestOfflinePriorityAuthorizedReceiptDrainAndEvents(t *testing.T) {
	s := newSession(t)
	if _, err := s.View(1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Priority(2); code(err) != "unauthorized_view" {
		t.Fatalf("AI priority admitted: %v", err)
	}
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 16000, Y: 12000}})); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Step(1); err != nil {
		t.Fatal(err)
	}
	before, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	originalEvents := append(s.pending[1].events[:0:0], s.pending[1].events...)
	wire, err := s.Priority(1)
	if err != nil {
		t.Fatal(err)
	}
	frame := new(pb.PriorityFrame)
	if err := proto.Unmarshal(wire, frame); err != nil {
		t.Fatal(err)
	}
	if frame.Tick != uint32(s.Info().Tick) || len(frame.Results) != 1 || !frame.Results[0].Accepted || frame.Results[0].Sequence != 1 || frame.Results[0].Player != 1 {
		t.Fatalf("wrong executed receipt: %+v", frame)
	}
	if !reflect.DeepEqual(originalEvents, s.pending[1].events) {
		t.Fatal("priority drained full-state events")
	}
	after, err := s.Save()
	if err != nil || !bytes.Equal(before.Data, after.Data) || before.Hash != after.Hash {
		t.Fatal("priority changed deterministic state", err)
	}
	wire, err = s.Priority(1)
	if err != nil || len(wire) != 0 {
		t.Fatal("priority emitted duplicate feedback", err)
	}
	wire, err = s.View(1)
	if err != nil {
		t.Fatal(err)
	}
	full := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(wire, full); err != nil {
		t.Fatal(err)
	}
	if len(full.Results) != 0 {
		t.Fatal("full view repeated high-rate receipts")
	}
	if len(full.Events) != len(originalEvents) {
		t.Fatal("full view lost accumulated events")
	}
}

func TestOfflinePriorityRemovesOnlyPreviouslyPublishedIDs(t *testing.T) {
	s := newSession(t)
	fullBytes, err := s.View(1)
	if err != nil {
		t.Fatal(err)
	}
	full := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(fullBytes, full); err != nil {
		t.Fatal(err)
	}
	if len(full.Entities) == 0 {
		t.Fatal("fixture needs owned entities")
	}
	actualID := full.Entities[0].Id
	// Transport bookkeeping is not simulation state. Stale IDs represent actors
	// present in a previous authorized frame and now outside the current view.
	s.pending[1].known = append(s.pending[1].known, 0xfffffffe)
	wire, err := s.Priority(1)
	if err != nil {
		t.Fatal(err)
	}
	frame := new(pb.PriorityFrame)
	if err := proto.Unmarshal(wire, frame); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(frame.RemovedEntities, []uint32{0xfffffffe}) {
		t.Fatalf("incorrect removals: %v", frame.RemovedEntities)
	}
	for _, id := range frame.RemovedEntities {
		if id == actualID {
			t.Fatal("removed current owned actor")
		}
	}
	wire, err = s.Priority(1)
	if err != nil || len(wire) != 0 {
		t.Fatal("removal repeated", err)
	}
	saved, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Load(saved.Data, saved.Local); err != nil {
		t.Fatal(err)
	}
	wire, err = s.Priority(1)
	if err != nil || len(wire) != 0 {
		t.Fatal("replacement inherited stale visibility", err)
	}
}
