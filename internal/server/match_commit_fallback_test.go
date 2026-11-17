package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// commitFallbackServer is testServer without the HTTP listener: these tests
// drive the match actor directly and need no socket.
func commitFallbackServer(t *testing.T) *Server {
	t.Helper()
	s, err := New(Config{DataDir: t.TempDir(), MapDir: filepath.Join(t.TempDir(), "no-maps")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

// shortenCommitWindow makes the finished-match commit deadline and the
// post-result actor retention test-scale. Registered first so its restore
// runs after the match cleanup registered later.
func shortenCommitWindow(t *testing.T) {
	t.Helper()
	oldWindow, oldRetention := matchCommitRetryWindow, matchFinishedRetention
	matchCommitRetryWindow = 250 * time.Millisecond
	matchFinishedRetention = 300 * time.Millisecond
	t.Cleanup(func() { matchCommitRetryWindow, matchFinishedRetention = oldWindow, oldRetention })
}

// resultFrames drains a peer outbox and reports every MatchResult frame.
func resultFrames(p *peer) chan *pb.MatchResult {
	out := make(chan *pb.MatchResult, 4)
	go func() {
		for {
			select {
			case <-p.done:
				return
			case data := <-p.out:
				if data == nil {
					continue
				}
				var env pb.Envelope
				if proto.Unmarshal(data, &env) == nil && env.GetResult() != nil {
					select {
					case out <- env.GetResult():
					default:
					}
				}
			}
		}
	}()
	return out
}

type terminalFrame struct {
	result      *pb.MatchResult
	protocolErr *pb.ProtocolError
}

// terminalFrames drains a peer outbox and reports MatchResult and
// ProtocolError frames (the terminal void status and its explanation).
func terminalFrames(p *peer) chan terminalFrame {
	out := make(chan terminalFrame, 8)
	go func() {
		for {
			select {
			case <-p.done:
				return
			case data := <-p.out:
				if data == nil {
					continue
				}
				var env pb.Envelope
				if proto.Unmarshal(data, &env) != nil {
					continue
				}
				frame := terminalFrame{result: env.GetResult(), protocolErr: env.GetError()}
				if frame.result == nil && frame.protocolErr == nil {
					continue
				}
				select {
				case out <- frame:
				default:
				}
			}
		}
	}()
	return out
}

func finishedMatchPeer(t *testing.T, s *Server, id string) (*liveMatch, *peer) {
	t.Helper()
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 1, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2, AI: "easy"}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch(id, e, []slot{{Player: 1, Token: "tok"}, {Player: 2, AI: true}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.close)
	p := &peer{player: 1, out: make(chan []byte, 256), done: make(chan struct{})}
	return m, p
}

func finishedCommitFixture(t *testing.T, s *Server, id string) (*liveMatch, *peer, chan *pb.MatchResult) {
	t.Helper()
	m, p := finishedMatchPeer(t, s, id)
	return m, p, resultFrames(p)
}

func surrenderWithPeer(t *testing.T, m *liveMatch, p *peer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if r := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: p}); r.err != nil {
		t.Fatal(r.err)
	}
	for m.call(ctx, matchRequest{kind: "orders", player: 1, sequence: 1, orders: []sim.Order{{Kind: "surrender"}}}).err != nil {
		if ctx.Err() != nil {
			t.Fatal("match never started")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func awaitResult(t *testing.T, results chan *pb.MatchResult) *pb.MatchResult {
	t.Helper()
	select {
	case r := <-results:
		return r
	case <-time.After(10 * time.Second):
		t.Fatal("finished match never delivered a final result (unbounded commit retry)")
		return nil
	}
}

// awaitVoidTerminal collects the void MatchResult and the explicit
// result_commit_failed ProtocolError explaining it. Other errors (for
// example player_eliminated after a surrender) are ignored.
func awaitVoidTerminal(t *testing.T, frames chan terminalFrame) (*pb.MatchResult, *pb.ProtocolError) {
	t.Helper()
	var result *pb.MatchResult
	var protocolErr *pb.ProtocolError
	deadline := time.After(10 * time.Second)
	for result == nil || protocolErr == nil {
		select {
		case frame := <-frames:
			if frame.result != nil && result == nil {
				result = frame.result
			}
			if frame.protocolErr != nil && frame.protocolErr.Code == "result_commit_failed" {
				protocolErr = frame.protocolErr
			}
		case <-deadline:
			t.Fatalf("terminal void status incomplete: result=%+v commitErr=%+v", result, protocolErr)
		}
	}
	return result, protocolErr
}

// awaitTerminalResult returns the first MatchResult frame, ignoring errors.
func awaitTerminalResult(t *testing.T, frames chan terminalFrame) *pb.MatchResult {
	t.Helper()
	deadline := time.After(10 * time.Second)
	for {
		select {
		case frame := <-frames:
			if frame.result != nil {
				return frame.result
			}
		case <-deadline:
			t.Fatal("finished match never delivered a final result (unbounded commit retry)")
			return nil
		}
	}
}

// driveToVoidCommit connects the peer, breaks SQLite so every CommitResult
// fails while the replay store stays healthy, then surrenders.
func driveToVoidCommit(t *testing.T, s *Server, m *liveMatch, p *peer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if r := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: p}); r.err != nil {
		t.Fatal(r.err)
	}
	if err := s.repo.Close(); err != nil {
		t.Fatal(err)
	}
	for m.call(ctx, matchRequest{kind: "orders", player: 1, sequence: 1, orders: []sim.Order{{Kind: "surrender"}}}).err != nil {
		if ctx.Err() != nil {
			t.Fatal("match never started")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func awaitActorRelease(t *testing.T, m *liveMatch) {
	t.Helper()
	select {
	case <-m.done:
	case <-time.After(5 * time.Second):
		t.Fatal("match actor was not released after its final status")
	}
}

// F9 regression (probe inverted): with a permanently broken object store a
// finished match must still reach a terminal state in bounded time. The
// result commits without the replay (marked replay_unavailable), players
// receive the committed result, and the actor is released.
func TestFinishedMatchCommitsWithoutReplayWhenObjectStoreBroken(t *testing.T) {
	shortenCommitWindow(t)
	s := commitFallbackServer(t)
	if err := os.WriteFile(s.objects.Root, []byte("not a dir"), 0600); err != nil { // every objects.Put now fails
		t.Fatal(err)
	}
	m, p, results := finishedCommitFixture(t, s, "commit-no-replay")
	surrenderWithPeer(t, m, p)

	result := awaitResult(t, results)
	if !result.Committed || result.Void || !result.Outcome.Finished {
		t.Fatalf("final result = %+v, want committed non-void finished", result)
	}
	if !m.completed.Load() {
		t.Fatal("match not marked completed after fallback commit")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	stored, err := s.repo.GetResult(ctx, m.id)
	if err != nil {
		t.Fatal("fallback result missing", err)
	}
	if stored.Void {
		t.Fatal("fallback result must not be void when only the replay failed")
	}
	var payload struct {
		ReplayUnavailable bool `json:"replay_unavailable"`
		Outcome           struct {
			Finished bool `json:"finished"`
		} `json:"outcome"`
	}
	if err := json.Unmarshal(stored.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.ReplayUnavailable || !payload.Outcome.Finished {
		t.Fatalf("payload = %s, want replay_unavailable with finished outcome", stored.Payload)
	}
	if _, err := s.objects.Get(ctx, m.id+".replay"); err == nil {
		t.Fatal("replay unexpectedly stored through a broken object store")
	}
	awaitActorRelease(t, m)
}

// When the result itself cannot be committed (SQLite gone), the bounded
// fallback voids the match: connected players receive an honest void final
// status (Committed stays false — nothing is durable), the lobby-terminal
// signal is published so participants are released, and the actor is
// released through the existing finished path (whose deferred void commit
// is then a no-op against the broken database).
func TestFinishedMatchVoidsWhenResultCommitFails(t *testing.T) {
	shortenCommitWindow(t)
	s := commitFallbackServer(t)
	m, p := finishedMatchPeer(t, s, "commit-void")
	frames := terminalFrames(p)
	driveToVoidCommit(t, s, m, p)

	result, commitErr := awaitVoidTerminal(t, frames)
	if result.Committed || !result.Void || !result.Outcome.Finished {
		t.Fatalf("final result = %+v, want uncommitted void finished", result)
	}
	// The void reason must reach players on the wire, not only in the
	// durable void payload: the result outcome carries it and an explicit
	// protocol error explains the persistence failure.
	if result.Outcome.Reason != "result_commit_failed" {
		t.Fatalf("final result reason = %q, want result_commit_failed (not the gameplay reason)", result.Outcome.Reason)
	}
	if commitErr.Message == "" || !commitErr.Recoverable {
		t.Fatalf("commit error = %+v, want a recoverable explanation of the failed commit", commitErr)
	}
	// completed here is only the lobby-terminal signal that releases
	// participants; the wire result above still reports Committed:false,
	// so no durability is claimed.
	if !m.completed.Load() {
		t.Fatal("void match not marked completed for lobby purposes after void delivery")
	}
	awaitActorRelease(t, m)
}

// Review regression: the one-shot void notification must survive a
// reconnect during the finished-match retention. A replacement peer
// receives the same cached terminal result and explanation after its
// snapshot, since neither history nor a durable record exists yet.
func TestFinishedMatchVoidResultRedeliveredOnReconnect(t *testing.T) {
	shortenCommitWindow(t)
	// Keep the actor alive long enough to replace the peer after the void,
	// then release within awaitActorRelease's deadline.
	matchFinishedRetention = 2 * time.Second
	s := commitFallbackServer(t)
	m, p := finishedMatchPeer(t, s, "commit-void-reconnect")
	frames := terminalFrames(p)
	driveToVoidCommit(t, s, m, p)

	first := awaitTerminalResult(t, frames)
	if first.Committed || !first.Void || !first.Outcome.Finished {
		t.Fatalf("first result = %+v, want uncommitted void finished", first)
	}

	replacement := &peer{player: 1, out: make(chan []byte, 256), done: make(chan struct{})}
	replacementFrames := terminalFrames(replacement)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if r := m.call(ctx, matchRequest{kind: "connect", player: 1, peer: replacement}); r.err != nil {
		t.Fatal(r.err)
	}

	again, commitErr := awaitVoidTerminal(t, replacementFrames)
	if !proto.Equal(first, again) {
		t.Fatalf("redelivered result = %+v, want same as first %+v", again, first)
	}
	if again.Outcome.Reason != "result_commit_failed" || commitErr.Message == "" {
		t.Fatalf("redelivered terminal status lacks its reason: result=%+v err=%+v", again, commitErr)
	}
	awaitActorRelease(t, m)
}

// Review regression (r2 Major 1): delivering the void must release the
// participants promptly, not keep them reserved by an "active" lobby for
// the whole finished-match retention. The match is registered in a lobby
// with a participant profile; once the void result arrives — while the
// actor is still retained — the lobby reads as completed and profile
// admission (the gate createLobby/joinLobbyAs/rematchLobby all call)
// accepts the participant for a new lobby, another lobby, and a rematch
// of the voided one. Admission is exercised directly because forcing the
// void closes SQLite, which HTTP authentication would need.
func TestFinishedMatchVoidReleasesLobbyParticipants(t *testing.T) {
	shortenCommitWindow(t)
	// Retention must still be running when admission is checked, and end
	// within awaitActorRelease's deadline afterwards.
	matchFinishedRetention = 2 * time.Second
	s := commitFallbackServer(t)
	m, p := finishedMatchPeer(t, s, "commit-void-lobby-release")
	frames := terminalFrames(p)

	const profileID = "profile-void-participant"
	oldLobby := &Lobby{
		ID: "void-source-lobby", Name: "Void source", Host: profileID,
		MapID: testMap().ID, Mode: "custom", MatchID: m.id, Created: time.Now().Unix(),
		Slots: []LobbySlot{
			{Player: 1, Profile: profileID, Name: "A", Faction: "US", Team: 1, Ready: true, AssetsReady: true},
			{Player: 2, Name: "easy AI", Faction: "IR", Team: 2, AI: "easy", Ready: true, AssetsReady: true},
		},
	}
	otherLobby := &Lobby{
		ID: "void-other-lobby", Name: "Other lobby", Host: "profile-other-host",
		MapID: testMap().ID, Mode: "custom", Created: time.Now().Unix(),
		Slots: []LobbySlot{{Player: 1, Profile: "profile-other-host", Name: "Host", Faction: "US", Team: 1}},
	}
	s.mu.Lock()
	s.lobbies[oldLobby.ID] = oldLobby
	s.lobbies[otherLobby.ID] = otherLobby
	s.matches[m.id] = m
	s.mu.Unlock()
	t.Cleanup(func() {
		s.mu.Lock()
		delete(s.lobbies, oldLobby.ID)
		delete(s.lobbies, otherLobby.ID)
		delete(s.matches, m.id)
		s.mu.Unlock()
	})

	// While the match is live the participant stays reserved: admission
	// to any other activity is refused (the pre-void control).
	s.mu.Lock()
	if s.lobbyCompleted(oldLobby) {
		s.mu.Unlock()
		t.Fatal("live match lobby already reads completed")
	}
	if s.admitProfile(httptest.NewRecorder(), profileID, "") {
		s.mu.Unlock()
		t.Fatal("live match participant admitted to a new lobby")
	}
	s.mu.Unlock()

	driveToVoidCommit(t, s, m, p)
	result, _ := awaitVoidTerminal(t, frames)
	if result.Committed || !result.Void {
		t.Fatalf("final result = %+v, want uncommitted void (release must not claim durability)", result)
	}

	// The actor is still inside its finished-match retention: release
	// must not wait for retention expiry or lobby pruning.
	select {
	case <-m.done:
		t.Fatal("actor exited before admission check; retention no longer covers the claim")
	default:
	}

	s.mu.Lock()
	if !s.lobbyCompleted(oldLobby) {
		s.mu.Unlock()
		t.Fatal("voided lobby does not read completed for lobby purposes; participants stay reserved until retention/pruning")
	}
	if state := s.lobbyResponse(oldLobby, profileID)["state"]; state != "completed" {
		s.mu.Unlock()
		t.Fatalf("voided lobby state = %v, want completed", state)
	}
	// Create a new lobby / rematch admission (exceptLobby=""), and join
	// another lobby (exceptLobby=target): all must accept the freed
	// participant, exactly as after a committed match.
	for _, except := range []string{"", otherLobby.ID} {
		recorder := httptest.NewRecorder()
		if !s.admitProfile(recorder, profileID, except) {
			s.mu.Unlock()
			t.Fatalf("voided participant refused admission (exceptLobby=%q): status=%d body=%s", except, recorder.Code, recorder.Body.String())
		}
	}
	s.mu.Unlock()

	awaitActorRelease(t, m)
}
