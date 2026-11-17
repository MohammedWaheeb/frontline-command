package server

import (
	"context"
	"testing"
	"time"

	"google.golang.org/protobuf/proto"
)

// A finished snapshot does not carry result durability. A replacement socket
// must receive the committed result too, so it stops reconnecting at actor exit.
func TestFinishedMatchCommittedResultRedeliveredOnReconnect(t *testing.T) {
	s := commitFallbackServer(t)
	m, p, results := finishedCommitFixture(t, s, "commit-success-reconnect")
	surrenderWithPeer(t, m, p)
	first := awaitResult(t, results)
	if !first.Committed || first.Void || !first.GetOutcome().GetFinished() {
		t.Fatalf("first result = %+v, want committed non-void finished", first)
	}
	replacement := &peer{player: 1, out: make(chan []byte, 256), done: make(chan struct{})}
	frames := terminalFrames(replacement)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if reply := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: replacement}); reply.err != nil {
		t.Fatal(reply.err)
	}
	select {
	case frame := <-frames:
		if !proto.Equal(first, frame.result) {
			t.Fatalf("redelivered result = %+v, want %+v", frame.result, first)
		}
	case <-time.After(time.Second):
		t.Fatal("reconnected peer received no committed terminal result")
	}
	// Replacing a socket cannot produce another result commit or change outcome.
	stored, err := s.repo.GetResult(ctx, m.id)
	if err != nil || stored.Void {
		t.Fatalf("durable result changed after reconnect: %+v %v", stored, err)
	}
}
