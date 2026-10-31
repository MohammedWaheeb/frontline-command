package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"log"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

type slot struct {
	Player  sim.PlayerID
	Profile string
	Token   string
	AI      bool
}

// reconnectGrace bounds how long a dropped player may reconnect before the
// actor surrenders their slot. A var so tests can shorten it.
var reconnectGrace = 120 * time.Second

const startBarrierTimeout = 120 * time.Second

type peer struct {
	player   sim.PlayerID
	out      chan []byte
	done     chan struct{}
	once     sync.Once
	baseline *pb.PlayerSnapshot
	visible  publishedVisibility
	events   []sim.Event
	results  []sim.OrderResult
	// pendingResults holds order receipts not yet delivered in a priority
	// frame, so a coalesced (skipped) priority frame cannot lose them.
	pendingResults []sim.OrderResult
	// skipped counts consecutive periodic state frames coalesced away
	// because the outbox was full. Actor goroutine only.
	skipped int
}

func (p *peer) close() { p.once.Do(func() { close(p.done) }) }

// maxCoalescedStateSkips bounds how many consecutive periodic state frames a
// peer may skip before it is treated as unwritable and dropped. At the 10 Hz
// state cadence this is ~20s of total stall (the socket writer's own write
// timeout normally tears the connection down long before that).
const maxCoalescedStateSkips = 200

// enqueue offers one frame without blocking or closing the peer.
func (p *peer) enqueue(data []byte) bool {
	select {
	case p.out <- data:
		p.skipped = 0
		return true
	default:
		return false
	}
}

// noteSkipped records a coalesced state frame and reports whether the peer
// must now be dropped: a closed peer (no writer will ever drain it) or an
// unbounded skip streak. Superseded deltas need no drop because the next
// delta is diffed from the last delivered baseline to the newest state.
func (p *peer) noteSkipped() bool {
	select {
	case <-p.done:
		return true
	default:
	}
	p.skipped++
	return p.skipped > maxCoalescedStateSkips
}

// maxCatchUpSteps bounds how many simulation ticks one ticker wake may
// run. The ticker drops missed ticks under load, so without catch-up a
// busy actor falls permanently behind wall time (slow-motion); a small
// cap recovers brief stalls while forgiving larger debt instead of
// spiralling into perpetual bursts.
const maxCatchUpSteps = 4

// catchUpSteps converts elapsed wall time since the previous advancing
// wake into a bounded number of ticks to run now.
func catchUpSteps(elapsed, interval time.Duration) int {
	if interval <= 0 || elapsed <= 0 {
		return 1
	}
	n := int((elapsed + interval/2) / interval)
	if n < 1 {
		return 1
	}
	if n > maxCatchUpSteps {
		return maxCatchUpSteps
	}
	return n
}

// humansConnected reports whether every human slot currently has a live
// peer. The start barrier uses current connections, not past ones: a human
// who connected and already dropped must not let the match start idle.
func humansConnected(slots []slot, peers map[sim.PlayerID]*peer) bool {
	for _, s := range slots {
		if !s.AI && peers[s.Player] == nil {
			return false
		}
	}
	return true
}

// finish queues a FIFO end marker after final snapshots/control messages. A
// bounded full queue still closes immediately; it must never stall the actor.
func (p *peer) finish() {
	select {
	case p.out <- nil:
	default:
		p.close()
	}
}

type matchRequest struct {
	adviceTrace    *adviceTrace
	connectContext context.Context
	adviceDeadline time.Time
	entities       []sim.ID
	control        string
	kind           string
	token          string
	profile        string
	peer           *peer
	player         sim.PlayerID
	sequence       uint32
	orders         []sim.Order
	reply          chan matchReply
}
type matchReply struct {
	affordances sim.CommandAffordances
	err         error
	data        []byte
	view        sim.View
}
type matchCheckpoint struct {
	coop bool
	name string
	tick uint32
	data []byte
	// state, when set, is an independent sim snapshot the persistence
	// goroutine marshals off the actor loop. replay marks snapshots
	// begun with Replay.BeginCheckpoint whose packed form must return
	// to the actor for AppendCheckpoint.
	state      *sim.State
	replay     bool
	replayTick sim.Tick
}

// packedReplayCheckpoint carries an off-loop packed replay checkpoint
// back to the actor, which owns the recorder.
type packedReplayCheckpoint struct {
	tick   sim.Tick
	packed []byte
	err    error
}
type liveMatch struct {
	stateEvery        sim.Tick
	metrics           matchRuntimeCounters
	metricsEnabled    bool
	mapID             string
	mapData           []byte
	replayLobby       *sim.ReplayLobby
	advice            adviceGate
	completed         atomic.Bool
	barrierPassed     atomic.Bool
	startDeadline     time.Time
	pauseEnabled      bool
	persistenceErrors chan string
	coop              bool
	rated             bool
	checkpoints       chan matchCheckpoint
	checkpointPacked  chan packedReplayCheckpoint
	persistenceDone   chan struct{}
	observerDelay     sim.Tick
	id                string
	engine            *sim.Engine
	slots             []slot
	requests          chan matchRequest
	done              chan struct{}
	stop              chan struct{}
	once              sync.Once
	repo              *storage.SQLite
	objects           storage.Files
	started           time.Time
}

type matchOptions struct {
	StateUpdatesPerSecond int
	RuntimeMetricsEnabled bool
	Lobby                 *sim.ReplayLobby
	PauseEnabled          bool
	LiveObservers         bool
	Rated                 bool
	// startWait is an internal test override; production always waits 120s.
	startWait time.Duration
}

func newMatch(id string, engine *sim.Engine, slots []slot, repo *storage.SQLite, objects storage.Files, options ...matchOptions) (*liveMatch, error) {
	delay := sim.Tick(2400)
	opts := matchOptions{}
	if len(options) > 0 {
		opts = options[0]
	}
	if opts.Rated && (len(slots) != 2 || slots[0].AI || slots[1].AI || slots[0].Profile == "" || slots[1].Profile == "" || slots[0].Profile == slots[1].Profile) {
		return nil, errors.New("rated matches require two distinct human profiles")
	}
	if opts.LiveObservers && !opts.Rated {
		delay = 0
	}
	save, err := engine.Save()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	members := []storage.MatchMember{}
	for _, slot := range slots {
		if slot.Profile != "" {
			members = append(members, storage.MatchMember{Profile: slot.Profile, Player: uint32(slot.Player)})
		}
	}
	err = repo.StartMatchAccess(ctx, id, uint32(engine.Tick()), save, members, opts.Lobby != nil && !opts.Lobby.Private)
	cancel()
	if err != nil {
		return nil, err
	}
	m := &liveMatch{metricsEnabled: opts.RuntimeMetricsEnabled, stateEvery: statePublicationEvery(opts.StateUpdatesPerSecond), pauseEnabled: opts.PauseEnabled && !opts.Rated, rated: opts.Rated, checkpoints: make(chan matchCheckpoint, 2), checkpointPacked: make(chan packedReplayCheckpoint, 2), persistenceDone: make(chan struct{}), observerDelay: delay, id: id, engine: engine, slots: slots, requests: make(chan matchRequest, 256), done: make(chan struct{}), stop: make(chan struct{}), repo: repo, objects: objects, started: time.Now()}
	startWait := startBarrierTimeout
	if opts.startWait > 0 {
		startWait = opts.startWait
	}
	m.startDeadline = m.started.Add(startWait)
	blueprint := engine.MapBlueprint()
	m.mapID = blueprint.ID
	m.mapData, _ = json.Marshal(blueprint)
	if opts.Lobby != nil {
		policy := *opts.Lobby
		m.replayLobby = &policy
	}
	m.persistenceErrors = make(chan string, 4)
	state := engine.StateCopy()
	m.coop = state.Mission != nil && state.Mission.Definition.Mode == "coop"
	if m.coop {
		checkpointContext, done := context.WithTimeout(context.Background(), 5*time.Second)
		err = m.persistCoopCheckpoint(checkpointContext, matchCheckpoint{coop: true, name: state.Mission.Checkpoint, tick: uint32(engine.Tick()), data: save})
		done()
		if err != nil {
			return nil, err
		}
	}
	go m.persistCheckpoints()
	go m.run()
	return m, nil
}
func (m *liveMatch) persistCheckpoints() {
	defer close(m.persistenceDone)
	for checkpoint := range m.checkpoints {
		if checkpoint.state != nil {
			// Marshal (and replay-pack) here, off the actor loop.
			if checkpoint.replay {
				save, packed, err := sim.PackCheckpoint(*checkpoint.state)
				select {
				case m.checkpointPacked <- packedReplayCheckpoint{tick: checkpoint.replayTick, packed: packed, err: err}:
				case <-m.done:
				}
				if err != nil {
					log.Printf("match %s checkpoint pack failed: %v", m.id, err)
					continue
				}
				checkpoint.data = save
			} else {
				save, err := sim.MarshalState(*checkpoint.state)
				if err != nil {
					log.Printf("match %s checkpoint marshal failed: %v", m.id, err)
					select {
					case m.persistenceErrors <- "A checkpoint could not be saved. Check available disk space; keep the current game open.":
					default:
					}
					continue
				}
				checkpoint.data = save
			}
			checkpoint.state = nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := m.repo.CheckpointMatch(ctx, m.id, checkpoint.tick, checkpoint.data)
		if err == nil && checkpoint.coop {
			err = m.persistCoopCheckpoint(ctx, checkpoint)
		}
		cancel()
		if err != nil {
			log.Printf("match %s checkpoint failed: %v", m.id, err)
			select {
			case m.persistenceErrors <- "A checkpoint could not be saved. Check available disk space; keep the current game open.":
			default:
			}
		}
	}
}
func (m *liveMatch) persistCoopCheckpoint(ctx context.Context, checkpoint matchCheckpoint) error {
	owners := []string{}
	for _, slot := range m.slots {
		if !slot.AI && slot.Profile != "" {
			owners = append(owners, slot.Profile)
		}
	}
	name := "Co-op: " + checkpoint.name
	if len(name) > 100 {
		name = name[:100]
		for !utf8.ValidString(name) {
			name = name[:len(name)-1]
		}
	}
	return m.repo.PutSharedSave(ctx, owners, fmt.Sprintf("coop-%s-%d", m.id, checkpoint.tick), name, checkpoint.data)
}
func (m *liveMatch) call(ctx context.Context, req matchRequest) matchReply {
	if req.kind == "connect" {
		req.connectContext = ctx
	}
	req.reply = make(chan matchReply, 1)
	if req.adviceTrace != nil {
		req.adviceTrace.stamp(&req.adviceTrace.enqueueAttempt)
	}
	select {
	case m.requests <- req:
	case <-ctx.Done():
		return matchReply{err: ctx.Err()}
	case <-m.done:
		return matchReply{err: errors.New("match_closed")}
	}
	select {
	case reply := <-req.reply:
		return reply
	case <-ctx.Done():
		return matchReply{err: ctx.Err()}
	case <-m.done:
		return matchReply{err: errors.New("match_closed")}
	}
}

// Manually assembled internal actors retain the same two-minute default as
// newMatch. Both fields are immutable before the actor is started.
func (m *liveMatch) startBarrierDeadline() time.Time {
	if m.startDeadline.IsZero() {
		return m.started.Add(startBarrierTimeout)
	}
	return m.startDeadline
}

// startRemainingMs is safe for HTTP readers without entering the match actor.
// The deadline is immutable after construction and the actor publishes passage
// of the barrier atomically. Zero means the barrier has passed or expired.
func (m *liveMatch) startRemainingMs() uint32 {
	if m.barrierPassed.Load() {
		return 0
	}
	select {
	case <-m.done:
		return 0
	default:
	}
	remaining := time.Until(m.startBarrierDeadline())
	if remaining <= 0 {
		return 0
	}
	// Round up so an unexpired final fraction of a millisecond stays visible.
	return uint32((remaining + time.Millisecond - 1) / time.Millisecond)
}

func (m *liveMatch) close() { m.once.Do(func() { close(m.stop) }); <-m.done }
func (m *liveMatch) slotForToken(token string) (slot, bool) {
	for _, s := range m.slots {
		if secretEqual(s.Token, token) && !s.AI {
			return s, true
		}
	}
	return slot{}, false
}
func (m *liveMatch) run() {
	defer close(m.done)
	ticker := time.NewTicker(time.Second / 20)
	defer ticker.Stop()
	peers := map[sim.PlayerID]*peer{}
	disconnected := map[sim.PlayerID]time.Time{}
	rates := map[sim.PlayerID]int{}
	rateStart := time.Now()
	archive := newObserverArchive()
	archive.capture(m.engine, m.slots, true)
	observers := map[string]observerGrant{}
	observerClock := m.engine.Tick()
	finishedClockAt := time.Time{}
	committed := false
	voidReason := "server_shutdown"
	replay, replayErr := sim.NewReplay(m.engine)
	if replayErr == nil && m.replayLobby != nil {
		policy := *m.replayLobby
		replay.Lobby = &policy
	}
	expired := map[sim.PlayerID]bool{}
	lastCommitAttempt := time.Time{}
	finishedAt := time.Time{}
	started := false
	controls := newPauseControl(m.pauseEnabled)
	lastStatus := time.Time{}
	lastTicker := time.Time{}
	lastAdvanceAt := time.Time{}
	controlRates := map[sim.PlayerID]int{}
	lastCoopCheckpoint := m.engine.Tick()
	var pendingCoop *matchCheckpoint
	replayCheckpointPending := false
	appendPackedCheckpoint := func(pc packedReplayCheckpoint) {
		replayCheckpointPending = false
		if pc.err != nil {
			if replayErr == nil {
				replayErr = pc.err
			}
			return
		}
		if err := replay.AppendCheckpoint(pc.tick, pc.packed); err != nil && replayErr == nil {
			replayErr = err
		}
	}
	deliver := func(p *peer, msg *pb.Envelope, data []byte) bool {
		if !p.enqueue(data) {
			return false
		}
		if m.metricsEnabled {
			m.metrics.wireBytes.Add(uint64(len(data)))
			if msg.GetSnapshot() != nil || msg.GetDelta() != nil {
				m.metrics.stateFrames.Add(1)
			}
			if msg.GetPriority() != nil {
				m.metrics.priorityFrames.Add(1)
			}
		}
		return true
	}
	// send is for control/terminal frames: a full outbox closes the peer.
	send := func(p *peer, msg *pb.Envelope) bool {
		data, err := proto.Marshal(msg)
		if err != nil {
			return false
		}
		if deliver(p, msg, data) {
			return true
		}
		p.close()
		return false
	}
	// sendState is for periodic, superseded frames (snapshot/delta/priority/
	// status): a full outbox coalesces this frame away instead of dropping a
	// healthy peer. The caller keeps its baseline/buffers and consults
	// noteSkipped for the bounded-drop decision.
	sendState := func(p *peer, msg *pb.Envelope) bool {
		data, err := proto.Marshal(msg)
		if err != nil {
			return false
		}
		return deliver(p, msg, data)
	}
	// dropPeer is the single removal path for a peer that can no longer be
	// written to: close it, unregister it, and start its reconnect deadline
	// so expiry can surrender the slot instead of stalling the match.
	dropPeer := func(id sim.PlayerID, p *peer, now time.Time) {
		p.close()
		if peers[id] != p {
			return
		}
		delete(peers, id)
		// Mirror the disconnect handler: record the reconnect deadline even
		// before the start barrier so the slot's grace is already running
		// if the match starts after this peer returns and drops again.
		if !m.engine.Outcome().Finished {
			disconnected[id] = now.Add(reconnectGrace)
		}
		controls.playerGone(id, m.coop)
	}
	broadcastStatus := func(now time.Time) {
		for id, p := range peers {
			// Status is superseded by the next broadcast, so a full outbox
			// coalesces it instead of dropping the peer.
			if !sendState(p, &pb.Envelope{Message: &pb.Envelope_Status{Status: m.connectionStatus(id, &controls, peers, disconnected, started, now)}}) && p.noteSkipped() {
				dropPeer(id, p, now)
			}
		}
		lastStatus = now
	}
	defer func() {
		for _, p := range peers {
			p.close()
		}
		if !committed {
			state := m.engine.StateCopy()
			payload, _ := json.Marshal(map[string]any{"match_id": m.id, "void": true, "reason": voidReason, "metadata": state.Metadata, "tick": state.Tick})
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, _ = m.repo.CommitResult(ctx, storage.Result{ID: m.id, Payload: payload, Void: true})
			save, _ := m.engine.Save()
			_ = m.objects.Put(ctx, m.id+".diagnostic", save)
		}
	}()
	defer func() {
		if pendingCoop != nil {
			m.checkpoints <- *pendingCoop
		}
		close(m.checkpoints)
		<-m.persistenceDone
	}()
	for {
		select {
		case <-m.stop:
			return
		case message := <-m.persistenceErrors:
			for _, p := range peers {
				sendState(p, &pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: "checkpoint_failed", Message: message, Recoverable: true}}})
			}
		case pc := <-m.checkpointPacked:
			appendPackedCheckpoint(pc)
		case req := <-m.requests:
			reply := matchReply{}
			switch req.kind {
			case "map_context":
				allowed := false
				for _, slot := range m.slots {
					if slot.Profile != "" && slot.Profile == req.profile {
						allowed = true
					}
				}
				for _, grant := range observers {
					if grant.profile == req.profile {
						allowed = true
					}
				}
				if allowed {
					reply.data = m.mapData
				} else {
					reply.err = errors.New("map_context_denied")
				}
			case "observer_ticket":
				if len(observers) >= 64 {
					reply.err = errors.New("observer_limit")
					break
				}
				valid := false
				for _, s := range m.slots {
					if s.Player == req.player {
						valid = true
					}
					if s.Profile == req.profile {
						view, _ := m.engine.PlayerView(s.Player)
						for _, p := range view.Players {
							if p.ID == s.Player && !p.Defeated && !m.engine.Outcome().Finished {
								reply.err = errors.New("active_player_cannot_observe")
							}
						}
					}
				}
				if !valid {
					reply.err = errors.New("unknown_perspective")
				}
				if reply.err == nil {
					observers[req.token] = observerGrant{req.token, req.profile, req.player}
				}
			case "observer_read":
				grant, ok := observers[req.token]
				if !ok {
					reply.err = errors.New("invalid_observer_ticket")
				} else {
					reply.data, reply.err = archive.read(grant.player, observerClock, m.observerDelay)
				}
			case "connect":
				if req.peer == nil || req.connectContext != nil && req.connectContext.Err() != nil {
					reply.err = errors.New("connection_closed")
					break
				}
				select {
				case <-req.peer.done:
					reply.err = errors.New("connection_closed")
				default:
				}
				if reply.err != nil {
					break
				}
				if expired[req.player] {
					reply.err = errors.New("reconnect_expired")
					break
				}
				currentView, _ := m.engine.PlayerView(req.player)
				for _, p := range currentView.Players {
					if p.ID == req.player && p.Defeated && !m.engine.Outcome().Finished {
						reply.err = errors.New("player_eliminated")
					}
				}
				if reply.err != nil {
					break
				}
				if old := peers[req.player]; old != nil {
					old.close()
				}
				if deadline, ok := disconnected[req.player]; ok && time.Now().After(deadline) {
					reply.err = errors.New("reconnect_expired")
					break
				}
				peers[req.player] = req.peer
				delete(disconnected, req.player)
				view, ok := m.engine.PlayerView(req.player)
				if !ok {
					reply.err = errors.New("unknown_player")
					break
				}
				snap, err := compactSnapshot(view)
				if err != nil {
					reply.err = err
					break
				}
				req.peer.baseline = snap
				req.peer.visible = visibilityFromSnapshot(snap)
				send(req.peer, &pb.Envelope{Message: &pb.Envelope_Snapshot{Snapshot: snap}})
				broadcastStatus(time.Now())
			case "disconnect":
				if current := peers[req.player]; current == req.peer {
					current.close()
					delete(peers, req.player)
					disconnected[req.player] = time.Now().Add(reconnectGrace)
					controls.playerGone(req.player, m.coop)
					broadcastStatus(time.Now())
				}
			case "control":
				if req.peer == nil || peers[req.player] != req.peer {
					reply.err = errors.New("connection_replaced")
					break
				}
				controlRates[req.player]++
				if controlRates[req.player] > 4 {
					reply.err = errors.New("control_rate_exceeded")
					break
				}
				if !started || m.engine.Outcome().Finished {
					reply.err = errors.New("match_not_active")
					break
				}
				active := m.activeHumans()
				voters := active
				if m.coop {
					// Teammates hold pause with only the present peers'
					// votes while a partner is in reconnect grace; the
					// absent player cannot veto the survivors' pause.
					voters = []sim.PlayerID{}
					for _, id := range active {
						if peers[id] != nil {
							voters = append(voters, id)
						}
					}
				} else if req.control == "pause" {
					missing := false
					for _, id := range active {
						if peers[id] == nil {
							missing = true
						}
					}
					if missing {
						reply.err = errors.New("players_disconnected")
						break
					}
				}
				reply.err = controls.act(req.control, req.player, voters)
				if reply.err == nil {
					broadcastStatus(time.Now())
				}
			case "orders":
				if req.peer != nil && peers[req.player] != req.peer {
					reply.err = errors.New("connection_replaced")
					break
				}
				if !started {
					reply.err = errors.New("waiting_for_players")
					break
				}
				if controls.paused {
					reply.err = errors.New("match_paused")
					break
				}
				rates[req.player] += len(req.orders)
				if rates[req.player] > 160 {
					reply.err = errors.New("command_rate_exceeded")
				} else {
					reply.err = m.engine.Submit(req.player, req.sequence, req.orders)
				}
			case "chat_allowed":
				var ok bool
				reply.view, ok = m.engine.PlayerView(req.player)
				if !ok {
					reply.err = errors.New("unknown_player")
				} else {
					for _, p := range reply.view.Players {
						if p.ID == req.player && p.Defeated && !m.engine.Outcome().Finished {
							reply.err = errors.New("observer_chat_disabled")
						}
					}
				}
			case "advice":
				if req.adviceTrace != nil {
					req.adviceTrace.actor(uint32(m.engine.Tick()), len(m.requests))
				}
				if req.adviceDeadline.IsZero() || !time.Now().Before(req.adviceDeadline) {
					reply.err = context.DeadlineExceeded
					break
				}
				slot, ok := m.slotForToken(req.token)
				if !ok || slot.Player != req.player || expired[req.player] {
					reply.err = errors.New("advice_unavailable")
					break
				}
				reply.affordances, reply.err = m.engine.CommandAffordances(req.player, req.entities)
				if req.adviceTrace != nil {
					req.adviceTrace.stamp(&req.adviceTrace.affordancesDone)
				}
				if reply.err == nil && len(req.orders) > 0 {
					reply.data, reply.err = m.engine.SaveForAdvice()
					if req.adviceTrace != nil {
						req.adviceTrace.savedBytes.Store(int64(len(reply.data)) + 1)
						req.adviceTrace.stamp(&req.adviceTrace.captureDone)
					}
				}
			case "save":
				reply.data, reply.err = m.engine.Save()
			case "view":
				var ok bool
				reply.view, ok = m.engine.PlayerView(req.player)
				if !ok {
					reply.err = errors.New("unknown_player")
				}
			}
			req.reply <- reply
		case now := <-ticker.C:
			var tickWorkStart time.Time
			var requestDepth int
			previousTicker := lastTicker
			if m.metricsEnabled {
				tickWorkStart = time.Now()
				requestDepth = len(m.requests)
				lastTicker = now
			}
			if now.Sub(rateStart) >= time.Second {
				rates = map[sim.PlayerID]int{}
				controlRates = map[sim.PlayerID]int{}
				rateStart = now
			}
			if !started {
				// Require humans to be connected right now, not merely to
				// have connected once: starting for a dropped player would
				// run their idle base until the reconnect grace surrenders
				// it. A brief pre-start drop simply holds the barrier (up
				// to the void timeout) until the player returns.
				if humansConnected(m.slots, peers) {
					started = true
					m.barrierPassed.Store(true)
				} else if !now.Before(m.startBarrierDeadline()) {
					voidReason = "players_missing"
					return
				} else {
					continue
				}
			}
			for player, deadline := range disconnected {
				if now.Before(deadline) {
					continue
				}
				view, _ := m.engine.PlayerView(player)
				active := false
				for _, p := range view.Players {
					if p.ID == player && !p.Defeated {
						active = true
					}
				}
				if active {
					if view.Countdown > 0 {
						continue
					}
					// Only expire once the surrender is accepted; expiring
					// first would strand an unsurrendered zombie that can
					// neither play nor reconnect. The passed deadline
					// already blocks reconnect while this retries.
					surrendered := false
					found := false
					state := m.engine.StateCopy()
					for _, p := range state.Players {
						if p.ID == player {
							found = true
							if err := m.engine.Submit(player, p.LastSequence+1, []sim.Order{{Kind: "surrender"}}); err == nil {
								surrendered = true
							}
						}
					}
					if found && !surrendered {
						continue
					}
				}
				expired[player] = true
				controls.playerGone(player, m.coop)
				delete(disconnected, player)
			}
			tickViews := map[sim.PlayerID]sim.View{}
			advanced := !m.engine.Outcome().Finished && !controls.paused
			if advanced {
				if m.metricsEnabled && !previousTicker.IsZero() {
					intervals := (now.Sub(previousTicker) + time.Second/40) / (time.Second / 20)
					if intervals > 1 {
						m.metrics.missedTickerIntervals.Add(uint64(intervals - 1))
					}
				}
				// Bounded catch-up: run a few ticks per wake when the
				// ticker dropped intervals under load. Events/results
				// from every burst tick are merged into the final views
				// so peer publication below loses nothing; any debt
				// beyond the cap is forgiven by re-baselining to now.
				steps := 1
				if !lastAdvanceAt.IsZero() {
					steps = catchUpSteps(now.Sub(lastAdvanceAt), time.Second/20)
				}
				lastAdvanceAt = now
				burstEvents := map[sim.PlayerID][]sim.Event{}
				burstResults := map[sim.PlayerID][]sim.OrderResult{}
				for step := 0; step < steps; step++ {
					if step > 0 && m.engine.Outcome().Finished {
						break
					}
					m.engine.Advance()
					tickViews = archive.capture(m.engine, m.slots, len(observers) > 0)
					for id, view := range tickViews {
						burstEvents[id] = append(burstEvents[id], view.Events...)
						burstResults[id] = append(burstResults[id], view.Results...)
					}
					if m.coop {
						for _, slot := range m.slots {
							if view := tickViews[slot.Player]; view.Mission != nil && view.Mission.CheckpointTick > lastCoopCheckpoint {
								snapshot := m.engine.CloneState()
								pendingCoop = &matchCheckpoint{coop: true, name: view.Mission.Checkpoint, tick: uint32(m.engine.Tick()), state: &snapshot}
								lastCoopCheckpoint = view.Mission.CheckpointTick
								break
							}
						}
					}
					observerClock = m.engine.Tick()
					if m.engine.Outcome().Finished && finishedClockAt.IsZero() {
						finishedClockAt = now
					}
					if m.engine.Tick()%600 == 0 && replayErr == nil && !replayCheckpointPending {
						snapshot, fallback, captureErr := beginReplayCheckpoint(replay, m.engine)
						replayErr = captureErr
						if fallback != nil {
							select {
							case m.checkpoints <- matchCheckpoint{tick: uint32(m.engine.Tick()), data: fallback}:
							default:
								log.Printf("match %s checkpoint writer busy", m.id)
							}
						} else if snapshot != nil {
							replayCheckpointPending = true
							select {
							case m.checkpoints <- matchCheckpoint{tick: uint32(m.engine.Tick()), state: snapshot, replay: true, replayTick: m.engine.Tick()}:
							default:
								// Writer busy: pack inline (rare) so the
								// recorder still gains its checkpoint, and
								// drop only the database write as before.
								_, packed, packErr := sim.PackCheckpoint(*snapshot)
								appendPackedCheckpoint(packedReplayCheckpoint{tick: m.engine.Tick(), packed: packed, err: packErr})
								log.Printf("match %s checkpoint writer busy", m.id)
							}
						}
					}
				}
				for id, view := range tickViews {
					view.Events = burstEvents[id]
					view.Results = burstResults[id]
					tickViews[id] = view
				}
			} else {
				// Paused/finished wakes must not bank catch-up debt.
				lastAdvanceAt = now
			}
			if pendingCoop != nil {
				select {
				case m.checkpoints <- *pendingCoop:
					pendingCoop = nil
				default:
				}
			}
			if !finishedClockAt.IsZero() {
				observerClock = m.engine.Tick() + sim.Tick(now.Sub(finishedClockAt).Milliseconds()/50)
			}
			// Filter events at their authoritative tick before aggregating network frames.
			for id, p := range peers {
				if !advanced {
					continue
				}
				view := tickViews[id]
				eliminated := false
				for _, player := range view.Players {
					if player.ID == id && player.Defeated {
						eliminated = true
					}
				}
				p.events = append(p.events, view.Events...)
				p.results = append(p.results, view.Results...)
				p.pendingResults = append(p.pendingResults, view.Results...)
				removed := p.visible.removals(view)
				if len(removed) > 0 || len(p.pendingResults) > 0 {
					priorityView := view
					priorityView.Results = p.pendingResults
					if sendState(p, priorityFrame(priorityView, removed)) {
						p.visible.forget(removed)
						p.pendingResults = nil
					} else if p.noteSkipped() {
						dropPeer(id, p, now)
						continue
					}
					// Coalesced: removals are recomputed next tick and
					// pendingResults ride the next priority frame.
				}
				if eliminated && !m.engine.Outcome().Finished {
					view.Events, view.Results = p.events, p.results
					snap, err := compactSnapshot(view)
					if err == nil && send(p, &pb.Envelope{Message: &pb.Envelope_Snapshot{Snapshot: snap}}) {
						send(p, &pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: "player_eliminated", Message: "Your commander was eliminated. Join an authorized observer view or wait for the final match result."}}})
						p.finish()
					} else {
						p.close()
					}
					delete(peers, id)
					continue
				}
				if m.engine.Tick()%m.stateEvery != 0 && !m.engine.Outcome().Finished {
					continue
				}
				view.Events = p.events
				// Results were already delivered at their execution tick. Keep the
				// terminal full-state receipt contract for final/eliminated views.
				view.Results = nil
				if m.engine.Outcome().Finished {
					view.Results = p.results
				}
				snap, err := compactSnapshot(view)
				if err != nil {
					dropPeer(id, p, now)
					continue
				}
				var frame *pb.Envelope
				if p.baseline == nil {
					frame = &pb.Envelope{Message: &pb.Envelope_Snapshot{Snapshot: snap}}
				} else {
					frame = &pb.Envelope{Message: &pb.Envelope_Delta{Delta: delta(p.baseline, snap)}}
				}
				if sendState(p, frame) {
					p.baseline = snap
					p.visible = visibilityFromSnapshot(snap)
					p.events = nil
					p.results = nil
				} else if p.noteSkipped() {
					dropPeer(id, p, now)
				}
				// Coalesced: baseline, events and results are retained, so
				// the next delta diffs the last delivered baseline against
				// the newest state instead of dropping the peer.
			}
			if m.engine.Outcome().Finished && !committed && now.Sub(lastCommitAttempt) >= time.Second {
				lastCommitAttempt = now
				state := m.engine.StateCopy()
				var rating *storage.RatingMatch
				if m.rated {
					rating = &storage.RatingMatch{Profiles: [2]string{m.slots[0].Profile, m.slots[1].Profile}, Draw: state.Outcome.Draw}
					for _, player := range state.Players {
						if !state.Outcome.Draw && player.Team == state.Outcome.WinningTeam {
							for _, slot := range m.slots {
								if slot.Player == player.ID {
									rating.Winner = slot.Profile
								}
							}
						}
					}
				}
				debrief := m.engine.Debrief()
				players := make([]sim.PlayerSummary, 0, len(state.Players))
				for _, p := range state.Players {
					players = append(players, sim.PlayerSummary{ID: p.ID, Name: p.Name, Faction: p.Faction, Team: p.Team, Color: p.Color, Defeated: p.Defeated, StrategicProgress: -1})
				}
				payload, _ := json.Marshal(map[string]any{"match_id": m.id, "metadata": state.Metadata, "outcome": state.Outcome, "players": players, "debrief": debrief, "rated": m.rated, "rating_match": rating})
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				var err error
				{
					if replayCheckpointPending {
						// Settle the in-flight off-loop checkpoint
						// before the final capture reads the recorder.
						select {
						case pc := <-m.checkpointPacked:
							appendPackedCheckpoint(pc)
						case <-time.After(2 * time.Second):
							replayCheckpointPending = false
							if replayErr == nil {
								replayErr = errors.New("replay checkpoint incomplete")
							}
						}
					}
					if replayErr == nil {
						replayErr = replay.Capture(m.engine, false)
					}
					if replayErr != nil {
						err = replayErr
					} else {
						var data []byte
						data, err = replay.Encode()
						if err == nil {
							err = m.objects.Put(ctx, m.id+".replay", data)
						}
					}
				}
				if err == nil {
					_, err = m.repo.CommitResult(ctx, storage.Result{ID: m.id, Payload: payload, Rating: rating})
				}
				cancel()
				if err == nil {
					committed = true
					m.completed.Store(true)
					finishedAt = now
					outcome := &pb.Outcome{Finished: true, Draw: state.Outcome.Draw, WinningTeam: state.Outcome.WinningTeam, Reason: state.Outcome.Reason, Tick: uint32(state.Outcome.Tick)}
					for _, p := range peers {
						send(p, &pb.Envelope{Message: &pb.Envelope_Result{Result: &pb.MatchResult{MatchId: m.id, Outcome: outcome, Committed: true}}})
					}
				}
			}
			if now.Sub(lastStatus) >= time.Second {
				broadcastStatus(now)
			}
			if m.metricsEnabled {
				m.metrics.recordTick(time.Since(tickWorkStart), requestDepth, advanced)
			}
			if committed && now.Sub(finishedAt) > 5*time.Minute {
				return
			}
		}
	}
}
