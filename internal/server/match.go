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
type peer struct {
	player   sim.PlayerID
	out      chan []byte
	done     chan struct{}
	once     sync.Once
	baseline *pb.PlayerSnapshot
	visible  publishedVisibility
	events   []sim.Event
	results  []sim.OrderResult
}

func (p *peer) close() { p.once.Do(func() { close(p.done) }) }

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
	adviceTrace *adviceTrace
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
	pauseEnabled      bool
	persistenceErrors chan string
	coop              bool
	rated             bool
	checkpoints       chan matchCheckpoint
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
	m := &liveMatch{metricsEnabled: opts.RuntimeMetricsEnabled, stateEvery: statePublicationEvery(opts.StateUpdatesPerSecond), pauseEnabled: opts.PauseEnabled && !opts.Rated, rated: opts.Rated, checkpoints: make(chan matchCheckpoint, 2), persistenceDone: make(chan struct{}), observerDelay: delay, id: id, engine: engine, slots: slots, requests: make(chan matchRequest, 256), done: make(chan struct{}), stop: make(chan struct{}), repo: repo, objects: objects, started: time.Now()}
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
	if req.adviceTrace != nil { req.adviceTrace.stamp(&req.adviceTrace.enqueueAttempt) }
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
func (m *liveMatch) close() { m.once.Do(func() { close(m.stop) }); <-m.done }
func (m *liveMatch) slotForToken(token string) (slot, bool) {
	for _, s := range m.slots {
		if s.Token == token && !s.AI {
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
	everConnected := map[sim.PlayerID]bool{}
	rates := map[sim.PlayerID]int{}
	rateStart := time.Now()
	archive := newObserverArchive()
	archive.capture(m.engine, m.slots)
	observers := map[string]observerGrant{}
	observerClock := m.engine.Tick()
	finishedClockAt := time.Time{}
	committed := false
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
	controlRates := map[sim.PlayerID]int{}
	lastCoopCheckpoint := m.engine.Tick()
	var pendingCoop *matchCheckpoint
	send := func(p *peer, msg *pb.Envelope) bool {
		data, err := proto.Marshal(msg)
		if err != nil {
			return false
		}
		select {
		case p.out <- data:
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
		default:
			p.close()
			return false
		}
	}
	broadcastStatus := func(now time.Time) {
		for id, p := range peers {
			send(p, &pb.Envelope{Message: &pb.Envelope_Status{Status: m.connectionStatus(id, &controls, peers, disconnected, started, now)}})
		}
		lastStatus = now
	}
	defer func() {
		for _, p := range peers {
			p.close()
		}
		if !committed {
			state := m.engine.StateCopy()
			payload, _ := json.Marshal(map[string]any{"match_id": m.id, "void": true, "reason": "server_shutdown", "metadata": state.Metadata, "tick": state.Tick})
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
				send(p, &pb.Envelope{Message: &pb.Envelope_Error{Error: &pb.ProtocolError{Code: "checkpoint_failed", Message: message, Recoverable: true}}})
			}
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
				everConnected[req.player] = true
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
					disconnected[req.player] = time.Now().Add(120 * time.Second)
					controls.resume()
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
				if req.control == "pause" {
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
				reply.err = controls.act(req.control, req.player, active)
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
				if req.adviceTrace != nil { req.adviceTrace.actor(uint32(m.engine.Tick()), len(m.requests)) }
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
				if req.adviceTrace != nil { req.adviceTrace.stamp(&req.adviceTrace.affordancesDone) }
				if reply.err == nil && len(req.orders) > 0 {
					reply.data, reply.err = m.engine.SaveForAdvice()
					if req.adviceTrace != nil {
						req.adviceTrace.savedBytes.Store(int64(len(reply.data))+1)
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
				ready := true
				for _, s := range m.slots {
					if !s.AI && !everConnected[s.Player] {
						ready = false
						if now.Sub(m.started) > 120*time.Second {
							disconnected[s.Player] = now
						}
					}
				}
				if ready {
					started = true
				} else if now.Sub(m.started) > 120*time.Second {
					return
				} else {
					continue
				}
			}
			for player, deadline := range disconnected {
				if !now.Before(deadline) {
					expired[player] = true
					controls.resume()
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
						state := m.engine.StateCopy()
						for _, p := range state.Players {
							if p.ID == player {
								if err := m.engine.Submit(player, p.LastSequence+1, []sim.Order{{Kind: "surrender"}}); err != nil {
									continue
								}
							}
						}
					}
					delete(disconnected, player)
				}
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
				m.engine.Advance()
				tickViews = archive.capture(m.engine, m.slots)
				if m.coop {
					for _, slot := range m.slots {
						if view := tickViews[slot.Player]; view.Mission != nil && view.Mission.CheckpointTick > lastCoopCheckpoint {
							if save, err := m.engine.Save(); err == nil {
								pendingCoop = &matchCheckpoint{coop: true, name: view.Mission.Checkpoint, tick: uint32(m.engine.Tick()), data: save}
								lastCoopCheckpoint = view.Mission.CheckpointTick
							}
							break
						}
					}
				}
				observerClock = m.engine.Tick()
				if m.engine.Outcome().Finished {
					finishedClockAt = now
				}
				if m.engine.Tick()%600 == 0 && replayErr == nil {
					save, captureErr := recordReplayCheckpoint(replay, m.engine)
					replayErr = captureErr
					if save != nil {
						select {
						case m.checkpoints <- matchCheckpoint{tick: uint32(m.engine.Tick()), data: save}:
						default:
							log.Printf("match %s checkpoint writer busy", m.id)
						}
					}
				}
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
				removed := p.visible.removals(view)
				if len(removed) > 0 || len(view.Results) > 0 {
					if !send(p, priorityFrame(view, removed)) {
						delete(peers, id)
						continue
					}
					p.visible.forget(removed)
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
				p.events = nil
				p.results = nil
				snap, err := compactSnapshot(view)
				if err != nil {
					p.close()
					continue
				}
				var frame *pb.Envelope
				if p.baseline == nil {
					frame = &pb.Envelope{Message: &pb.Envelope_Snapshot{Snapshot: snap}}
				} else {
					frame = &pb.Envelope{Message: &pb.Envelope_Delta{Delta: delta(p.baseline, snap)}}
				}
				if send(p, frame) {
					p.baseline = snap
					p.visible = visibilityFromSnapshot(snap)
				}
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
