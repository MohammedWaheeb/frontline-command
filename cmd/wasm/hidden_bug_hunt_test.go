//go:build !(js && wasm)

package main

import (
	"reflect"
	"testing"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func snapshotOf(t *testing.T, wire []byte) *pb.PlayerSnapshot {
	t.Helper()
	snap := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(wire, snap); err != nil {
		t.Fatal(err)
	}
	return snap
}

func pingBatch(t *testing.T, seq uint32, count int, x, y int32) []byte {
	t.Helper()
	orders := make([]*pb.Order, count)
	for i := range orders {
		orders[i] = &pb.Order{Kind: "ping", Position: &pb.Vec{X: x, Y: y}}
	}
	b, err := proto.Marshal(&pb.OrderBatch{Sequence: seq, Orders: orders})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// F3: a solo session drains replay commands every 600 ticks (the
// recorder's bounded window) but writes a full checkpoint only every
// 2,400 ticks (first at tick 600). Commands are submitted explicitly
// at checkpoint and drain boundaries so they execute after the
// checkpoint save; seeks into the enlarged gaps and continuous
// playback must replay them and match the live run hash for hash.
func TestSoloReplayCheckpointCadenceAndSeek(t *testing.T) {
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Dispose()
	// Two local humans: no AI can finish the fixture early.
	if _, err := s.Create(config(t, "")); err != nil {
		t.Fatal(err)
	}
	stepTo := func(target sim.Tick) {
		t.Helper()
		for s.Info().Tick < target {
			n := min(200, int(target-s.Info().Tick))
			if _, err := s.Step(n); err != nil {
				t.Fatal(err)
			}
		}
		if s.Info().Tick != target {
			t.Fatalf("stepped to %d, want %d", s.Info().Tick, target)
		}
	}
	seq := uint32(0)
	moveAtCurrentTick := func(x, y int32) {
		t.Helper()
		seq++
		if err := s.Submit(1, batch(t, seq, &pb.Order{Kind: "move", Entities: []uint32{2}, Position: &pb.Vec{X: x, Y: y}})); err != nil {
			t.Fatalf("submit seq %d at tick %d: %v", seq, s.Info().Tick, err)
		}
	}
	live := map[sim.Tick]string{}
	record := func(target sim.Tick) {
		t.Helper()
		stepTo(target)
		h, err := s.Hash()
		if err != nil {
			t.Fatal(err)
		}
		live[target] = h
	}

	// Tick 100 (countdown skipped at Create): executes at 101, before
	// the first checkpoint.
	moveAtCurrentTick(20000, 14000)
	stepTo(600) // drain + checkpoint at 600
	// Submitted at exactly the checkpoint tick: executes at 601, so it
	// is NOT inside the tick-600 checkpoint and a seek into the gap
	// must replay it.
	moveAtCurrentTick(24000, 18000)
	record(613)
	stepTo(1200) // drain only, no checkpoint
	moveAtCurrentTick(16000, 20000)
	record(1250)
	stepTo(3000) // checkpoint
	moveAtCurrentTick(22000, 12000)
	record(3050)
	stepTo(3600) // drain only
	moveAtCurrentTick(18000, 22000)
	record(3650)
	stepTo(5400) // checkpoint
	moveAtCurrentTick(26000, 16000)
	record(5450)
	stepTo(6600) // drain only
	moveAtCurrentTick(15000, 15000)
	record(7300)

	if s.Info().Finished {
		t.Fatal("fixture finished before tick 7300")
	}
	var cpTicks []sim.Tick
	for _, cp := range s.recorder.Checkpoints {
		cpTicks = append(cpTicks, cp.Tick)
	}
	if want := []sim.Tick{600, 3000, 5400}; !reflect.DeepEqual(cpTicks, want) {
		t.Fatalf("solo checkpoints at %v, want %v (drain every 600, checkpoint every 2400)", cpTicks, want)
	}
	data, err := s.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}
	r, err := sim.DecodeReplay(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Checkpoints) != 3 || r.FinalTick != 7300 {
		t.Fatalf("decoded replay checkpoints=%d final=%d", len(r.Checkpoints), r.FinalTick)
	}
	// The recorded command stream must contain the post-checkpoint and
	// post-drain commands (executed one tick after submission).
	commands, _, err := r.CommandPage(0, 100)
	if err != nil {
		t.Fatal(err)
	}
	gotTicks := map[sim.Tick]bool{}
	for _, c := range commands {
		gotTicks[c.Tick] = true
	}
	for _, want := range []sim.Tick{601, 1201, 3001, 3601, 5401, 6601} {
		if !gotTicks[want] {
			t.Fatalf("recorded replay missing command executed at tick %d (have %v)", want, commands)
		}
	}
	// Seeks: each target after a checkpoint re-simulates across the
	// gap, applying the commands submitted after that checkpoint.
	targets := []sim.Tick{613, 1250, 3050, 3650, 5450, 7300}
	for _, target := range targets {
		p, err := r.Open(s.catalog, target)
		if err != nil {
			t.Fatalf("open/seek %d: %v", target, err)
		}
		if got := p.Engine().Hash(); got != live[target] {
			t.Fatalf("seek to %d diverged from live run", target)
		}
	}
	// Continuous playback from the initial save, without seeking:
	// crosses every drain and checkpoint boundary in stream order.
	p, err := r.Open(s.catalog, 0)
	if err != nil {
		t.Fatal(err)
	}
	checked := 0
	for p.Engine().Tick() < 7300 {
		if err := p.Advance(); err != nil {
			t.Fatalf("continuous playback at tick %d: %v", p.Engine().Tick(), err)
		}
		if want, ok := live[p.Engine().Tick()]; ok {
			if got := p.Engine().Hash(); got != want {
				t.Fatalf("continuous playback diverged from live run at tick %d", p.Engine().Tick())
			}
			checked++
		}
	}
	if checked != len(targets) {
		t.Fatalf("continuous playback checked %d markers, want %d", checked, len(targets))
	}
}

// F8 (review r1): live execution receipts must never be discarded
// before publication. A non-viewed local human can legally receive
// more than 32 receipts (two 32-order batches = 64); all of them must
// be delivered, both through Priority and through View.
func TestLiveUnwatchedReceiptsPreservedThroughPriorityAndView(t *testing.T) {
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Dispose()
	if _, err := s.Create(config(t, "")); err != nil {
		t.Fatal(err)
	}
	// Player 1 is the viewed perspective; player 2 is never viewed
	// until the deliveries below.
	if _, err := s.View(1); err != nil {
		t.Fatal(err)
	}
	submit64 := func(firstSeq uint32) {
		t.Helper()
		for i := uint32(0); i < 2; i++ {
			if err := s.Submit(2, pingBatch(t, firstSeq+i, 32, 56000, 56000)); err != nil {
				t.Fatalf("submit seq %d: %v", firstSeq+i, err)
			}
			if _, err := s.Step(1); err != nil {
				t.Fatal(err)
			}
		}
		if got := len(s.pending[2].results); got != 64 {
			t.Fatalf("non-viewed live player retained %d receipts before publication, want 64", got)
		}
	}
	check64 := func(results []*pb.OrderResult, firstSeq uint32, via string) {
		t.Helper()
		if len(results) != 64 {
			t.Fatalf("%s delivered %d receipts, want 64", via, len(results))
		}
		for i, r := range results {
			wantSeq := firstSeq + uint32(i/32)
			if r.Player != 2 || r.Sequence != wantSeq || r.Index != int32(i%32) {
				t.Fatalf("%s receipt %d = %+v, want player 2 seq %d index %d", via, i, r, wantSeq, i%32)
			}
		}
	}

	// Delivery through Priority, which does not view the perspective.
	submit64(1)
	wire, err := s.Priority(2)
	if err != nil {
		t.Fatal(err)
	}
	frame := new(pb.PriorityFrame)
	if err := proto.Unmarshal(wire, frame); err != nil {
		t.Fatal(err)
	}
	check64(frame.Results, 1, "Priority")

	// Delivery through View after another 64 accumulate unpublished.
	submit64(3)
	wire, err = s.View(2)
	if err != nil {
		t.Fatal(err)
	}
	check64(snapshotOf(t, wire).Results, 3, "View")
}

// F8: during replay playback every slot is local and only the watched
// perspective drains. Feedback for unwatched perspectives stays
// within a small constant tail (newest kept), while the watched
// player's events and receipts are delivered exactly as in a run
// where every perspective drains.
func TestReplayUnwatchedPerspectiveFeedbackBounded(t *testing.T) {
	const seconds = 90
	// Record a live two-human game where both players ping once a
	// second, then export its replay.
	rec, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer rec.Dispose()
	if _, err := rec.Create(config(t, "")); err != nil {
		t.Fatal(err)
	}
	for second := 1; second <= seconds; second++ {
		if err := rec.Submit(1, batch(t, uint32(second), &pb.Order{Kind: "ping", Position: &pb.Vec{X: 9000, Y: 9000}})); err != nil {
			t.Fatal(err)
		}
		if err := rec.Submit(2, batch(t, uint32(second), &pb.Order{Kind: "ping", Position: &pb.Vec{X: 56000, Y: 56000}})); err != nil {
			t.Fatal(err)
		}
		if _, err := rec.Step(20); err != nil {
			t.Fatal(err)
		}
		if _, err := rec.View(1); err != nil {
			t.Fatal(err)
		}
	}
	liveHash, err := rec.Hash()
	if err != nil {
		t.Fatal(err)
	}
	data, err := rec.ExportReplay()
	if err != nil {
		t.Fatal(err)
	}

	type playback struct {
		session     *Session
		events      []*pb.Event
		results     []*pb.OrderResult
		hash        string
		unwatchedEv int
		unwatchedRs int
	}
	play := func(watchBoth bool) playback {
		s, err := NewSession()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := s.LoadReplay(data); err != nil {
			t.Fatal(err)
		}
		out := playback{session: s}
		for !s.Info().Finished {
			if _, err := s.Step(200); err != nil {
				t.Fatal(err)
			}
			wire, err := s.View(1)
			if err != nil {
				t.Fatal(err)
			}
			snap := snapshotOf(t, wire)
			out.events = append(out.events, snap.Events...)
			out.results = append(out.results, snap.Results...)
			if watchBoth {
				if _, err := s.View(2); err != nil {
					t.Fatal(err)
				}
			}
		}
		out.hash, err = s.Hash()
		if err != nil {
			t.Fatal(err)
		}
		out.unwatchedEv = len(s.pending[2].events)
		out.unwatchedRs = len(s.pending[2].results)
		return out
	}
	main := play(false)
	defer main.session.Dispose()
	twin := play(true)
	defer twin.session.Dispose()

	if main.hash != liveHash || twin.hash != liveHash {
		t.Fatalf("playback hash diverged from live run: main=%v twin=%v live=%v", main.hash == liveHash, twin.hash == liveHash, true)
	}
	// Watched player: one receipt per recorded ping, in sequence
	// order, identical to the both-watched playback.
	if len(main.results) != seconds {
		t.Fatalf("watched player got %d receipts, want %d", len(main.results), seconds)
	}
	for i, r := range main.results {
		if r.Sequence != uint32(i+1) || r.Player != 1 {
			t.Fatalf("watched receipt %d out of order: %+v", i, r)
		}
	}
	if !reflect.DeepEqual(main.results, twin.results) || !reflect.DeepEqual(main.events, twin.events) {
		t.Fatal("watched player's playback feedback differs from the both-watched playback")
	}
	// Unwatched perspective: small constant tail, not match history.
	if main.unwatchedEv > 32 || main.unwatchedRs > 32 {
		t.Fatalf("unwatched playback feedback retained events=%d results=%d, want <=32 each", main.unwatchedEv, main.unwatchedRs)
	}
	if main.unwatchedRs == 0 {
		t.Fatal("unwatched playback tail is empty; newest receipts must survive a switch")
	}
	// Perspective switch at the end of playback: the tail holds the
	// newest receipt.
	wire, err := main.session.View(2)
	if err != nil {
		t.Fatal(err)
	}
	snap := snapshotOf(t, wire)
	if len(snap.Results) == 0 || snap.Results[len(snap.Results)-1].Sequence != seconds {
		t.Fatalf("switched perspective tail lost newest receipt: %+v", snap.Results)
	}
}
