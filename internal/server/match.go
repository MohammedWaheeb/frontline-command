package server

import (
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"log"
	"sync"
	"time"
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
	events   []sim.Event
	results  []sim.OrderResult
}

func (p *peer) close() { p.once.Do(func() { close(p.done) }) }

type matchRequest struct {
	kind     string
	token    string
	profile  string
	peer     *peer
	player   sim.PlayerID
	sequence uint32
	orders   []sim.Order
	reply    chan matchReply
}
type matchReply struct {
	err  error
	data []byte
	view sim.View
}
type matchCheckpoint struct {
	tick uint32
	data []byte
}
type liveMatch struct {
	checkpoints     chan matchCheckpoint
	persistenceDone chan struct{}
	observerDelay   sim.Tick
	id              string
	engine          *sim.Engine
	slots           []slot
	requests        chan matchRequest
	done            chan struct{}
	stop            chan struct{}
	once            sync.Once
	repo            *storage.SQLite
	objects         storage.Files
	started         time.Time
}

func newMatch(id string, engine *sim.Engine, slots []slot, repo *storage.SQLite, objects storage.Files, liveObservers ...bool) (*liveMatch, error) {
	delay := sim.Tick(2400)
	if len(liveObservers) > 0 && liveObservers[0] {
		delay = 0
	}
	save, err := engine.Save()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	err = repo.StartMatch(ctx, id, uint32(engine.Tick()), save)
	cancel()
	if err != nil {
		return nil, err
	}
	m := &liveMatch{checkpoints: make(chan matchCheckpoint, 2), persistenceDone: make(chan struct{}), observerDelay: delay, id: id, engine: engine, slots: slots, requests: make(chan matchRequest, 256), done: make(chan struct{}), stop: make(chan struct{}), repo: repo, objects: objects, started: time.Now()}
	go m.persistCheckpoints()
	go m.run()
	return m, nil
}
func (m *liveMatch) persistCheckpoints() {
	defer close(m.persistenceDone)
	for checkpoint := range m.checkpoints {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := m.repo.CheckpointMatch(ctx, m.id, checkpoint.tick, checkpoint.data)
		cancel()
		if err != nil {
			log.Printf("match %s checkpoint failed: %v", m.id, err)
		}
	}
}
func (m *liveMatch) call(ctx context.Context, req matchRequest) matchReply {
	req.reply = make(chan matchReply, 1)
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
	expired := map[sim.PlayerID]bool{}
	lastCommitAttempt := time.Time{}
	finishedAt := time.Time{}
	started := false
	send := func(p *peer, msg *pb.Envelope) bool {
		data, err := proto.Marshal(msg)
		if err != nil {
			return false
		}
		select {
		case p.out <- data:
			return true
		default:
			p.close()
			return false
		}
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
	defer func() { close(m.checkpoints); <-m.persistenceDone }()
	for {
		select {
		case <-m.stop:
			return
		case req := <-m.requests:
			reply := matchReply{}
			switch req.kind {
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
				snap, err := snapshot(view)
				if err != nil {
					reply.err = err
					break
				}
				req.peer.baseline = snap
				send(req.peer, &pb.Envelope{Message: &pb.Envelope_Snapshot{Snapshot: snap}})
			case "disconnect":
				if current := peers[req.player]; current == req.peer {
					current.close()
					delete(peers, req.player)
					disconnected[req.player] = time.Now().Add(120 * time.Second)
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
			if now.Sub(rateStart) >= time.Second {
				rates = map[sim.PlayerID]int{}
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
			advanced := !m.engine.Outcome().Finished
			if advanced {
				m.engine.Advance()
				tickViews = archive.capture(m.engine, m.slots)
				observerClock = m.engine.Tick()
				if m.engine.Outcome().Finished {
					finishedClockAt = now
				}
				if m.engine.Tick()%600 == 0 && replayErr == nil {
					replayErr = replay.Capture(m.engine, true)
					if save, err := m.engine.Save(); err == nil {
						select {
						case m.checkpoints <- matchCheckpoint{uint32(m.engine.Tick()), save}:
						default:
							log.Printf("match %s checkpoint writer busy", m.id)
						}
					}
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
				if eliminated && !m.engine.Outcome().Finished {
					p.close()
					delete(peers, id)
					continue
				}
				p.events = append(p.events, view.Events...)
				p.results = append(p.results, view.Results...)
				if m.engine.Tick()%4 != 0 && !m.engine.Outcome().Finished {
					continue
				}
				view.Events = p.events
				view.Results = p.results
				p.events = nil
				p.results = nil
				snap, err := snapshot(view)
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
				}
			}
			if m.engine.Outcome().Finished && !committed && now.Sub(lastCommitAttempt) >= time.Second {
				lastCommitAttempt = now
				state := m.engine.StateCopy()
				payload, _ := json.Marshal(map[string]any{"match_id": m.id, "metadata": state.Metadata, "outcome": state.Outcome, "players": state.Players})
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
					_, err = m.repo.CommitResult(ctx, storage.Result{ID: m.id, Payload: payload})
				}
				cancel()
				if err == nil {
					committed = true
					finishedAt = now
					outcome := &pb.Outcome{Finished: true, Draw: state.Outcome.Draw, WinningTeam: state.Outcome.WinningTeam, Reason: state.Outcome.Reason, Tick: uint32(state.Outcome.Tick)}
					for _, p := range peers {
						send(p, &pb.Envelope{Message: &pb.Envelope_Result{Result: &pb.MatchResult{MatchId: m.id, Outcome: outcome, Committed: true}}})
					}
				}
			}
			if committed && now.Sub(finishedAt) > 5*time.Minute {
				return
			}
		}
	}
}
