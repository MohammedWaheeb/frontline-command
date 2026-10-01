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
	visible := make(map[sim.ID]struct{}, len(ids))
	for _, id := range ids {
		visible[id] = struct{}{}
	}
	priority := &pb.PriorityFrame{Tick: uint32(s.engine.Tick())}
	for _, id := range f.known {
		if _, exists := visible[id]; !exists {
			priority.RemovedEntities = append(priority.RemovedEntities, uint32(id))
		}
	}
	priority.Results = viewproto.Snapshot(sim.View{Results: f.results}).Results
	// Marshal before draining, so a failed publication does not lose feedback.
	if len(priority.RemovedEntities) == 0 && len(priority.Results) == 0 {
		f.known = ids
		return nil, nil
	}
	data, err := proto.Marshal(priority)
	if err != nil {
		return nil, fail("internal", "Priority conversion failed: "+err.Error(), false)
	}
	f.known, f.results = ids, nil
	return data, nil
}
