//go:build !(js && wasm)

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"frontlinecommand/internal/viewproto"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func TestOfflinePriorityMatchesMembershipReference(t *testing.T) {
	s := newSession(t)
	defer s.Dispose()
	ids, ok := s.engine.PlayerVisibleEntityIDs(1)
	if !ok || len(ids) == 0 {
		t.Fatal("fixture needs visible actors")
	}
	before, err := s.Save()
	if err != nil {
		t.Fatal(err)
	}
	// IDs omitted by this perspective must not become newly disclosed removals.
	enemy, _ := s.engine.PlayerVisibleEntityIDs(2)
	var hidden []sim.ID
	for _, id := range enemy {
		if !slices.Contains(ids, id) {
			hidden = append(hidden, id)
		}
	}
	if len(hidden) == 0 {
		t.Fatal("fixture needs actors hidden from player 1")
	}
	knownWithStale := append([]sim.ID{0}, ids...)
	knownWithStale = append(knownWithStale, hidden[0], ^sim.ID(0))
	slices.Sort(knownWithStale)
	cases := []struct {
		name    string
		known   []sim.ID
		results []sim.OrderResult
	}{
		{name: "first publication"},
		{name: "unchanged", known: ids},
		{name: "newly visible actors", known: ids[len(ids)/2:]},
		{name: "only stale actors", known: []sim.ID{0, ^sim.ID(0)}},
		{name: "current and stale actors", known: knownWithStale},
		{name: "receipts without removals", known: ids, results: []sim.OrderResult{{Player: 1, Sequence: 7, Index: 2, Accepted: true, Code: "ok", Tick: s.Info().Tick, EligibleEntities: ids[:1], AppliedCount: 1}}},
		{name: "receipts and removals", known: knownWithStale, results: []sim.OrderResult{{Player: 1, Sequence: 8, Index: 1, Accepted: false, Code: "not_owner", Tick: s.Info().Tick}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pending := s.pending[1]
			pending.known = slices.Clone(tc.known)
			pending.results = slices.Clone(tc.results)
			events := slices.Clone(pending.events)
			visible := make(map[sim.ID]bool, len(ids))
			for _, id := range ids {
				visible[id] = true
			}
			want := &pb.PriorityFrame{Tick: uint32(s.engine.Tick()), Results: viewproto.Snapshot(sim.View{Results: tc.results}).Results}
			for _, id := range tc.known {
				if !visible[id] {
					want.RemovedEntities = append(want.RemovedEntities, uint32(id))
				}
			}
			wire, err := s.Priority(1)
			if err != nil {
				t.Fatal(err)
			}
			if len(want.RemovedEntities) == 0 && len(want.Results) == 0 {
				if len(wire) != 0 {
					t.Fatal("unchanged priority emitted a frame")
				}
			} else {
				got := new(pb.PriorityFrame)
				if err := proto.Unmarshal(wire, got); err != nil || !proto.Equal(want, got) {
					t.Fatalf("priority differs from membership reference: got=%v want=%v err=%v", got, want, err)
				}
				for _, id := range hidden {
					if slices.Contains(got.RemovedEntities, uint32(id)) && !slices.Contains(tc.known, id) {
						t.Fatalf("disclosed never-published hidden actor %d", id)
					}
				}
			}
			if !slices.Equal(pending.known, ids) || len(pending.results) != 0 || !reflect.DeepEqual(pending.events, events) {
				t.Fatal("priority changed event retention, result drain, or known actor identities")
			}
			wire, err = s.Priority(1)
			if err != nil || len(wire) != 0 {
				t.Fatal("priority repeated removals or results", err)
			}
		})
	}
	after, err := s.Save()
	if err != nil || before.Hash != after.Hash || !bytes.Equal(before.Data, after.Data) {
		t.Fatal("priority changed deterministic state", err)
	}
}

// Uses the same restore-validated 688-actor save as the browser adapter workload.
// The steady case publishes nothing, as happens on most simulation ticks.
func BenchmarkOfflinePriorityUnchanged(b *testing.B) {
	dir := os.Getenv("FRONTLINE_BROWSER_LOAD_DIR")
	if dir == "" {
		b.Skip("explicit exported browser load fixture required")
	}
	data, err := os.ReadFile(filepath.Join(dir, "opening.json"))
	if err != nil {
		b.Fatal(err)
	}
	s, err := NewSession()
	if err != nil {
		b.Fatal(err)
	}
	defer s.Dispose()
	if _, err := s.Load(data, []sim.PlayerID{1, 2, 3, 4}); err != nil {
		b.Fatal(err)
	}
	if _, err := s.Priority(1); err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		wire, err := s.Priority(1)
		if err != nil || len(wire) != 0 {
			b.Fatal("unchanged priority emitted feedback", err)
		}
	}
	// Report after timing because ResetTimer clears custom metrics.
	b.ReportMetric(float64(len(s.pending[1].known)), "visible-actors")
}
