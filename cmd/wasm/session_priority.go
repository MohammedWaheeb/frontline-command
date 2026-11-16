package main

import (
	"frontlinecommand/internal/viewproto"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// Priority publishes owner-authorized execution receipts and actor removals
// without serializing a full state or draining the events for the next View.
func (s *Session) Priority(player sim.PlayerID) ([]byte, error) {
	if err := s.active(); err != nil {
		return nil, err
	}
	if !s.isLocal(player) {
		return nil, fail("unauthorized_view", "Views are only available for local players.", true)
	}
	ids, ok := s.engine.PlayerVisibleEntityIDs(player)
	if !ok {
		return nil, fail("unauthorized_view", "Unknown player.", true)
	}
	f := s.pending[player]
	// Both the public view and PlayerVisibleEntityIDs publish IDs in ascending
	// order. Merge their identity lists instead of constructing a membership map
	// every tick, including the usual tick with no removals or new receipts.
	var removed []uint32
	current := 0
	for _, id := range f.known {
		for current < len(ids) && ids[current] < id {
			current++
		}
		if current == len(ids) || ids[current] != id {
			removed = append(removed, uint32(id))
		}
	}
	if len(removed) == 0 && len(f.results) == 0 {
		f.known = ids
		return nil, nil
	}
	priority := &pb.PriorityFrame{Tick: uint32(s.engine.Tick()), RemovedEntities: removed}
	if len(f.results) > 0 {
		priority.Results = viewproto.Snapshot(sim.View{Results: f.results}).Results
	}
	// Marshal before draining, so a failed publication does not lose feedback.
	data, err := proto.Marshal(priority)
	if err != nil {
		return nil, fail("internal", "Priority conversion failed: "+err.Error(), false)
	}
	f.known, f.results = ids, nil
	return data, nil
}
