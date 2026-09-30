package server

import (
	"sort"

	"frontlinecommand/internal/viewproto"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
)

// statePublicationEvery preserves the authoritative 20 Hz simulation. Zero is
// the normal 10 Hz state default; 20 Hz is an explicit load-evaluated option.
func statePublicationEvery(hz int) sim.Tick {
	if hz == 20 {
		return 1
	}
	return 2
}

// publishedVisibility tracks only IDs actually delivered in a successful full
// state. Priority removals update this presentation tracker, never the immutable
// last-full protobuf baseline used by the next delta. Thus an unchanged actor
// that becomes visible again is recovered by applying that delta to last-full.
type publishedVisibility map[sim.ID]struct{}

func visibilityFromSnapshot(snap *pb.PlayerSnapshot) publishedVisibility {
	seen := make(publishedVisibility, len(snap.Entities))
	for _, entity := range snap.Entities {
		seen[sim.ID(entity.Id)] = struct{}{}
	}
	return seen
}

func (seen publishedVisibility) removals(view sim.View) []uint32 {
	current := make(map[sim.ID]struct{}, len(view.Entities))
	for _, entity := range view.Entities {
		current[entity.ID] = struct{}{}
	}
	removed := make([]uint32, 0)
	for id := range seen {
		if _, visible := current[id]; !visible {
			removed = append(removed, uint32(id))
		}
	}
	sort.Slice(removed, func(i, j int) bool { return removed[i] < removed[j] })
	return removed
}

func (seen publishedVisibility) forget(ids []uint32) {
	for _, id := range ids {
		delete(seen, sim.ID(id))
	}
}

func priorityFrame(view sim.View, removed []uint32) *pb.Envelope {
	// The sole generated converter also preserves new eligibility/result fields;
	// this tiny view converts no battlefield or foreign economy information.
	results := viewproto.Snapshot(sim.View{Results: view.Results}).Results
	return &pb.Envelope{Message: &pb.Envelope_Priority{Priority: &pb.PriorityFrame{
		Tick: uint32(view.Tick), RemovedEntities: removed, Results: results,
	}}}
}
