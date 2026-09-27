//go:build !(js && wasm)

package main

import (
	"bytes"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"testing"
)

func TestReplayAdapterRecordSeekReadOnlyAndFailureIsolation(t *testing.T) {
	s := newSession(t)
	if err := s.Submit(1, batch(t, 1, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 20000, Y: 14000}})); err != nil {
		t.Fatal(err)
	}
	s.Step(137)
	mid, _ := s.Hash()
	if err := s.Submit(1, batch(t, 2, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: 21000, Y: 17000}})); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		if _, err := s.Step(200); err != nil {
			t.Fatal(err)
		}
	}
	end, _ := s.Hash()
	endTick := s.Info().Tick
	data, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	viewer, _ := NewSession()
	info, err := viewer.LoadReplay(data)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Replay || info.ReplayStart != 0 || info.ReplayEnd != endTick || len(info.Local) != 2 {
		t.Fatal("replay info", info)
	}
	if _, err := viewer.View(2); err != nil {
		t.Fatal("AI fog perspective", err)
	}
	if err := viewer.Submit(1, batch(t, 1, &pb.Order{Kind: "surrender"})); code(err) != "replay_read_only" {
		t.Fatal(err)
	}
	if _, err := viewer.Save(); code(err) != "replay_read_only" {
		t.Fatal(err)
	}
	for _, target := range []sim.Tick{237, endTick, 237} {
		if _, err := viewer.SeekReplay(target); err != nil {
			t.Fatal(err)
		}
		want := mid
		if target == endTick {
			want = end
		}
		got, _ := viewer.Hash()
		if got != want {
			t.Fatal("seek diverged", target)
		}
	}
	if _, err := viewer.LoadReplay([]byte("broken")); code(err) != "replay_corrupt" {
		t.Fatal(err)
	}
	if _, err := viewer.SeekReplay(endTick + 1); code(err) != "replay_seek" {
		t.Fatal(err)
	}
	if got, _ := viewer.Hash(); got != mid {
		t.Fatal("failed operation replaced playback")
	}
	for !viewer.Info().Finished {
		if _, err := viewer.Step(57); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := viewer.Hash(); got != end {
		t.Fatal("streamed adapter playback diverged")
	}
	exported, _ := viewer.ExportReplay()
	if !bytes.Equal(data, exported) {
		t.Fatal("re-export changed replay")
	}
	page, err := viewer.ReplayCommands(0, 100)
	if err != nil || len(page.Commands) < 2 {
		t.Fatal("history missing", err)
	}
	m, err := viewer.Map()
	if err != nil || m.ID != testMap().ID {
		t.Fatal("replay map missing", err)
	}
	if _, err := viewer.Create(config(t, "normal")); err != nil || viewer.Info().Replay {
		t.Fatal("cannot replace replay with live match", err)
	}
}

func TestLoadedSaveRecordsReplayFromItsOwnStartingTick(t *testing.T) {
	s := newSession(t)
	s.Step(50)
	save, _ := s.Save()
	s.Load(save.Data, save.Local)
	s.Step(50)
	want, _ := s.Hash()
	replay, _ := s.ExportReplay()
	info, err := s.LoadReplay(replay)
	if err != nil || info.ReplayStart != 150 {
		t.Fatal("resumed replay start", info, err)
	}
	if _, err := s.SeekReplay(149); code(err) != "replay_seek" {
		t.Fatal("seek before recording", err)
	}
	s.Step(50)
	if got, _ := s.Hash(); got != want {
		t.Fatal("resumed replay mismatch")
	}
}
