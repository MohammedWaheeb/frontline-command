package server

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

func publicationMatch(t *testing.T, hz int) (*liveMatch, *peer, *peer, context.Context) {
	t.Helper()
	s, _ := testServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 9, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	for range 100 {
		e.Advance()
	}
	opts := matchOptions{}
	if hz != 0 {
		// Reflection keeps this exact production test compilable against the
		// retained original match.go. Missing configuration is a real failure.
		field := reflect.ValueOf(&opts).Elem().FieldByName("StateUpdatesPerSecond")
		if !field.IsValid() {
			t.Fatal("original match lacks publication-rate configuration")
		}
		field.SetInt(int64(hz))
	}
	m, err := newMatch(fmt.Sprintf("publication-%d", hz), e, []slot{{Player: 1}, {Player: 2}}, s.repo, s.objects, opts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.close)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	t.Cleanup(cancel)
	peers := []*peer{}
	for _, id := range []sim.PlayerID{1, 2} {
		p := &peer{player: id, out: make(chan []byte, 128), done: make(chan struct{})}
		if reply := m.call(ctx, matchRequest{kind: "connect", player: id, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
		peers = append(peers, p)
	}
	return m, peers[0], peers[1], ctx
}

func publicationRead(t *testing.T, ctx context.Context, p *peer) *pb.Envelope {
	t.Helper()
	select {
	case data := <-p.out:
		if data == nil {
			t.Fatal("unexpected terminal marker")
		}
		message := new(pb.Envelope)
		if err := proto.Unmarshal(data, message); err != nil {
			t.Fatal(err)
		}
		return message
	case <-ctx.Done():
		t.Fatal("publication timed out", ctx.Err())
	case <-p.done:
		t.Fatal("peer closed")
	}
	return nil
}

func TestPublicationActorTenHzDefault(t *testing.T) {
	_, p, _, ctx := publicationMatch(t, 0)
	var ticks []uint32
	for len(ticks) < 4 {
		if d := publicationRead(t, ctx, p).GetDelta(); d != nil {
			ticks = append(ticks, d.State.Tick)
		}
	}
	if !reflect.DeepEqual(ticks, []uint32{102, 104, 106, 108}) {
		t.Fatal("actual default publication ticks", ticks)
	}
}

func TestPublicationActorTwentyHzExplicit(t *testing.T) {
	_, p, _, ctx := publicationMatch(t, 20)
	var ticks []uint32
	for len(ticks) < 4 {
		if d := publicationRead(t, ctx, p).GetDelta(); d != nil {
			ticks = append(ticks, d.State.Tick)
		}
	}
	if !reflect.DeepEqual(ticks, []uint32{101, 102, 103, 104}) {
		t.Fatal("actual explicit publication ticks", ticks)
	}
}

func TestPublicationActorExecutionReceiptPrecedesFullAndIsOwnerPrivate(t *testing.T) {
	m, p, other, ctx := publicationMatch(t, 0)
	for {
		if d := publicationRead(t, ctx, p).GetDelta(); d != nil && d.State.Tick >= 104 {
			break
		}
	}
	reply := m.call(ctx, matchRequest{kind: "orders", player: 1, peer: p, sequence: 1, orders: []sim.Order{{Kind: "move", Entities: []sim.ID{2}, Position: sim.Vec{X: 14000, Y: 13000}}}})
	if reply.err != nil {
		t.Fatal(reply.err)
	}
	var received *pb.OrderResult
	for received == nil {
		frame := publicationRead(t, ctx, p)
		if priority := frame.GetPriority(); priority != nil {
			for _, result := range priority.Results {
				if result.Sequence == 1 {
					if result.Player != 1 || result.Tick != priority.Tick || !result.Accepted || result.Code != "ok" {
						t.Fatal("execution receipt fields", result, priority.Tick)
					}
					received = result
				}
			}
		}
		if d := frame.GetDelta(); d != nil {
			for _, result := range d.State.Results {
				if result.Sequence == 1 {
					t.Fatal("execution waited for full state instead of priority", result)
				}
			}
		}
	}
	for {
		if d := publicationRead(t, ctx, p).GetDelta(); d != nil && d.State.Tick >= received.Tick {
			if len(d.State.Results) != 0 {
				t.Fatal("ordinary full repeated execution feedback", d.State.Results)
			}
			break
		}
	}
	for {
		select {
		case data := <-other.out:
			frame := new(pb.Envelope)
			if err := proto.Unmarshal(data, frame); err != nil {
				t.Fatal(err)
			}
			if priority := frame.GetPriority(); priority != nil && len(priority.Results) != 0 {
				t.Fatal("foreign execution receipt leaked", priority.Results)
			}
		default:
			return
		}
	}
}
