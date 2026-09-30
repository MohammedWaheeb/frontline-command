package server

import (
	"reflect"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func TestPublicationVisibilityLossRegainPreservesCanonicalBaseline(t *testing.T) {
	baseline := &pb.PlayerSnapshot{Tick: 100, Entities: []*pb.Entity{{Id: 1, Owner: 1}, {Id: 7, Owner: 2}, {Id: 3, Owner: 2}}}
	original := proto.Clone(baseline)
	seen := visibilityFromSnapshot(baseline)
	hidden := sim.View{Tick: 101, Entities: []sim.EntityView{{ID: 1, Owner: 1}, {ID: 19, Owner: 2}}}
	removed := seen.removals(hidden)
	if !reflect.DeepEqual(removed, []uint32{3, 7}) {
		t.Fatal("removals not sorted previously delivered identities", removed)
	}
	seen.forget(removed)
	if again := seen.removals(hidden); len(again) != 0 {
		t.Fatal("repeated removal", again)
	}
	if !proto.Equal(baseline, original) {
		t.Fatal("priority mutated canonical last-full baseline")
	}
	// ID 19 was not delivered by a full update and therefore its later loss must
	// not reveal the ID via priority. An unchanged ID 7 returns at the next full.
	if unknown := seen.removals(sim.View{Entities: []sim.EntityView{{ID: 1}}}); len(unknown) != 0 {
		t.Fatal("undelivered ID leaked", unknown)
	}
	regained := proto.Clone(baseline).(*pb.PlayerSnapshot)
	regained.Tick = 102
	d := delta(baseline, regained)
	if len(d.State.Entities) != 0 || len(d.RemovedEntities) != 0 || d.BaselineTick != 100 {
		t.Fatal("unchanged canonical regain changed delta semantics", d)
	}
	seen = visibilityFromSnapshot(regained)
	if lostAgain := seen.removals(hidden); !reflect.DeepEqual(lostAgain, []uint32{3, 7}) {
		t.Fatal("regained actors cannot later disappear", lostAgain)
	}
}

func TestPublicationPriorityContainsOnlyAuthorizedReceiptsAndRemovals(t *testing.T) {
	view := sim.View{Tick: 101, Player: 1, Results: []sim.OrderResult{{Player: 1, Sequence: 9, Index: 0, Accepted: true, Code: "ok", Tick: 101}}, Entities: []sim.EntityView{{ID: 71, Owner: 1, Type: "US.tank"}}}
	frame := priorityFrame(view, []uint32{3, 7})
	encoded, err := proto.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	decoded := new(pb.Envelope)
	if err = proto.Unmarshal(encoded, decoded); err != nil {
		t.Fatal(err)
	}
	p := decoded.GetPriority()
	if p == nil || p.Tick != 101 || len(p.Results) != 1 || p.Results[0].Player != 1 || p.Results[0].Tick != 101 || !reflect.DeepEqual(p.RemovedEntities, []uint32{3, 7}) {
		t.Fatal(decoded)
	}
	if decoded.GetSnapshot() != nil || decoded.GetDelta() != nil {
		t.Fatal("priority carried battlefield state")
	}
}

func TestPublicationStateRateConfiguration(t *testing.T) {
	for _, row := range []struct {
		hz    int
		every sim.Tick
	}{{0, 2}, {10, 2}, {20, 1}, {19, 2}, {-1, 2}} {
		if got := statePublicationEvery(row.hz); got != row.every {
			t.Fatal(row, got)
		}
	}
}

func TestPublicationRuntimeMetricsMeasureBucketsAndWireCounters(t *testing.T) {
	m := &liveMatch{stateEvery: 2}
	m.metrics.recordTick(500*time.Microsecond, 3, true)
	m.metrics.recordTick(101*time.Millisecond, 1, false)
	m.metrics.wireBytes.Add(77)
	m.metrics.stateFrames.Add(1)
	m.metrics.priorityFrames.Add(2)
	m.metrics.missedTickerIntervals.Add(3)
	r := m.RuntimeMetrics()
	if r.SimulationAdvances != 1 || r.TickWorkCount != 2 || r.TickWorkNanos != 101500000 || r.TickWorkMaxNanos != 101000000 || r.TickWorkBuckets[1] != 1 || r.TickWorkBuckets[10] != 1 || r.MaxRequestDepth != 3 || r.WireBytes != 77 || r.StateFrames != 1 || r.PriorityFrames != 2 || r.MissedTickerIntervals != 3 || r.StateUpdatesPerSecond != 10 {
		t.Fatal(r)
	}
}
