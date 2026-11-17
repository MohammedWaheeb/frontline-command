package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"

	"google.golang.org/protobuf/proto"
)

func socketRequest(ip string) *http.Request {
	return &http.Request{
		Method:     http.MethodGet,
		URL:        &url.URL{Path: "/api/v1/matches/m1/socket"},
		RemoteAddr: ip + ":51000",
	}
}

// Legitimate reconnects (valid hello/token) must never consume the tight
// socket budget: only failed authentication attempts may lead to a 429, so a
// flaky connection cycling inside the 120s grace cannot be locked out.
func TestSocketAdmissionCountsFailuresNotSuccesses(t *testing.T) {
	ac := &admissionControl{}
	now := time.Now()
	for i := 0; i < 60; i++ {
		if !ac.allow(socketRequest("203.0.113.7"), now) {
			t.Fatalf("successful socket attempt %d was rate limited", i+1)
		}
	}
	for i := 0; i < 16; i++ {
		ac.noteSocketFailure(socketRequest("203.0.113.7"), now)
	}
	if ac.allow(socketRequest("203.0.113.7"), now) {
		t.Fatal("socket attempt allowed after 16 failed authentications in a minute")
	}
	if !ac.allow(socketRequest("203.0.113.8"), now) {
		t.Fatal("failures from one IP limited a different IP")
	}
	if !ac.allow(socketRequest("203.0.113.7"), now.Add(61*time.Second)) {
		t.Fatal("failure budget did not reset after the minute window")
	}
}

func TestAdmissionNonSocketBudgetsUnchanged(t *testing.T) {
	ac := &admissionControl{}
	now := time.Now()
	profileReq := &http.Request{
		Method:     http.MethodPost,
		URL:        &url.URL{Path: "/api/v1/profiles"},
		RemoteAddr: "198.51.100.9:51000",
	}
	for i := 0; i < 10; i++ {
		if !ac.allow(profileReq, now) {
			t.Fatalf("profile attempt %d was rate limited", i+1)
		}
	}
	if ac.allow(profileReq, now) {
		t.Fatal("11th profile creation in a minute was allowed")
	}
}

// A full outbox must coalesce periodic state frames instead of closing the
// peer; only a closed peer or an unbounded streak of skips is a drop.
func TestPeerCoalescedSkipsDoNotClosePeer(t *testing.T) {
	p := &peer{out: make(chan []byte, 1), done: make(chan struct{})}
	if !p.enqueue([]byte{1}) {
		t.Fatal("first enqueue into empty outbox failed")
	}
	for i := 0; i < maxCoalescedStateSkips; i++ {
		if p.enqueue([]byte{2}) {
			t.Fatal("enqueue into a full outbox succeeded")
		}
		if p.noteSkipped() {
			t.Fatalf("peer marked droppable after only %d skipped state frames", i+1)
		}
		select {
		case <-p.done:
			t.Fatal("skipping a superseded state frame closed the peer")
		default:
		}
	}
	if !p.noteSkipped() {
		t.Fatal("peer not droppable after exceeding the coalesced-skip bound")
	}
	// A successful enqueue resets the streak.
	<-p.out
	if !p.enqueue([]byte{3}) || p.skipped != 0 {
		t.Fatal("successful enqueue did not reset the skip streak")
	}
	// A closed peer is immediately droppable so skips cannot strand it.
	p.close()
	if !p.noteSkipped() {
		t.Fatal("closed peer was not immediately droppable")
	}
}

func TestStartBarrierRequiresCurrentlyConnectedHumans(t *testing.T) {
	slots := []slot{
		{Player: 1, Profile: "a"},
		{Player: 2, Profile: "b"},
		{Player: 3, AI: true},
	}
	peers := map[sim.PlayerID]*peer{}
	if humansConnected(slots, peers) {
		t.Fatal("barrier passed with no humans connected")
	}
	peers[1] = &peer{player: 1}
	if humansConnected(slots, peers) {
		t.Fatal("barrier passed with one human missing")
	}
	peers[2] = &peer{player: 2}
	if !humansConnected(slots, peers) {
		t.Fatal("barrier blocked with every human connected (AI slot must not count)")
	}
	// A human who connected earlier but has since dropped must not satisfy
	// the barrier: the match would start with an idle base.
	delete(peers, 1)
	if humansConnected(slots, peers) {
		t.Fatal("barrier passed for a previously-connected but dropped human")
	}
}

func TestLivenessCancelsConnectionOnPingFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := 0
	ping := func(context.Context) error {
		calls++
		if calls >= 2 {
			return errors.New("no pong")
		}
		return nil
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		watchLiveness(ctx, ping, cancel, 5*time.Millisecond, time.Second)
	}()
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("failed ping did not cancel the connection context")
	}
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness watcher did not stop after cancelling")
	}
}

func TestLivenessTimesOutSilentPeer(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ping := func(pctx context.Context) error {
		<-pctx.Done() // half-open peer: pong never arrives
		return pctx.Err()
	}
	go watchLiveness(ctx, ping, cancel, 5*time.Millisecond, 20*time.Millisecond)
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("silent peer was not detected within the ping timeout")
	}
}

func TestLivenessStopsWithConnectionContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		watchLiveness(ctx, func(context.Context) error { return nil }, cancel, 5*time.Millisecond, time.Second)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness watcher outlived the connection context")
	}
}

// End to end: a host who connects and drops before the guest arrives must
// not let the match start; ticks begin only once the host is back.
func TestStartBarrierWaitsForDroppedHumanToReturn(t *testing.T) {
	s, h := testServer(t)
	installReviewedTestMap(s, testMap())
	host, guest := profile(t, h, "Barrier host"), profile(t, h, "Barrier guest")
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", host, lobbyBody(), 201))
	request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/join", guest, map[string]any{"faction": "IR"}, 200)
	for _, token := range []string{host, guest} {
		readyTestLobby(t, s, h, l.ID, token)
	}
	started := request(t, h, "POST", "/api/v1/lobbies/"+l.ID+"/start", host, map[string]any{}, 201)
	joined := request(t, h, "GET", "/api/v1/lobbies/"+l.ID, guest, nil, 200)
	var hc, gc map[string]any
	json.Unmarshal(started["connection"], &hc)
	json.Unmarshal(joined["connection"], &gc)

	first, _ := socket(t, h, s, hc)
	first.CloseNow()
	time.Sleep(250 * time.Millisecond) // let the actor process the disconnect

	b, _ := socket(t, h, s, gc)
	defer b.CloseNow()
	frames := make(chan *pb.Envelope, 64)
	go func() {
		for {
			_, data, err := b.Read(context.Background())
			if err != nil {
				return
			}
			msg := new(pb.Envelope)
			if proto.Unmarshal(data, msg) == nil {
				frames <- msg
			}
		}
	}()
	advanced := func(msg *pb.Envelope) bool {
		if snap := msg.GetSnapshot(); snap != nil && snap.Tick > 0 {
			return true
		}
		if d := msg.GetDelta(); d != nil && d.GetState().GetTick() > 0 {
			return true
		}
		return false
	}
	deadline := time.After(400 * time.Millisecond)
wait:
	for {
		select {
		case msg := <-frames:
			if advanced(msg) {
				t.Fatal("match advanced while the host was disconnected before start")
			}
		case <-deadline:
			break wait
		}
	}

	a, _ := socket(t, h, s, hc)
	defer a.CloseNow()
	deadline = time.After(3 * time.Second)
	for {
		select {
		case msg := <-frames:
			if advanced(msg) {
				return
			}
		case <-deadline:
			t.Fatal("match did not start after the dropped host reconnected")
		}
	}
}
