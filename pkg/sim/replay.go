package sim

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"frontlinecommand/pkg/content"
	"io"
)

type ReplayCheckpoint struct {
	Tick       Tick            `json:"tick"`
	Save       json.RawMessage `json:"save,omitempty"`
	PackedSave []byte          `json:"packed_save,omitempty"`
}
type ReplayChunk struct {
	First   Tick   `json:"first"`
	Last    Tick   `json:"last"`
	Records uint32 `json:"records"`
	Data    []byte `json:"data"`
}
type Replay struct {
	Lobby       *ReplayLobby       `json:"lobby,omitempty"`
	Version     uint32             `json:"version"`
	Metadata    Metadata           `json:"metadata"`
	Initial     json.RawMessage    `json:"initial"`
	FinalTick   Tick               `json:"final_tick"`
	Recorded    uint64             `json:"recorded"`
	Commands    []Scheduled        `json:"commands"`
	Chunks      []ReplayChunk      `json:"chunks"`
	Checkpoints []ReplayCheckpoint `json:"checkpoints"`
}

// ReplayLobby records declared service policy for presentation only. It is not
// simulation state, a permission grant, or proof of a committed ranked result.
type ReplayLobby struct {
	Name          string `json:"name"`
	Mode          string `json:"mode"`
	Private       bool   `json:"private"`
	LiveObservers bool   `json:"live_observers"`
	PauseEnabled  bool   `json:"pause_enabled"`
	Rated         bool   `json:"rated"`
}

func (r *Replay) LobbyInfo() *ReplayLobby {
	if r.Lobby == nil {
		return nil
	}
	copy := *r.Lobby
	return &copy
}

func NewReplay(e *Engine) (*Replay, error) {
	save, err := e.Save()
	if err != nil {
		return nil, err
	}
	return &Replay{Version: 2, Metadata: e.Metadata(), Initial: save, FinalTick: e.Tick(), Recorded: e.state.LogBase + uint64(len(e.state.Log))}, nil
}

// Capture must be called at least every 30 simulation seconds. The engine keeps
// only 32,768 recent orders; archived replay chunks own their independent copies.
func (r *Replay) Capture(e *Engine, checkpoint bool) error {
	if r.Metadata != e.Metadata() || r.Version != 2 || r.Recorded < e.state.LogBase {
		return errors.New("replay recorder missed its bounded command window")
	}
	end := e.state.LogBase + uint64(len(e.state.Log))
	if r.Recorded > end {
		return errors.New("replay recorder moved backwards")
	}
	for _, cmd := range e.state.Log[r.Recorded-e.state.LogBase:] {
		cmd.Orders = cloneOrders(cmd.Orders)
		r.Commands = append(r.Commands, cmd)
	}
	r.Recorded = end
	r.FinalTick = e.Tick()
	if len(r.Commands) >= 1024 || checkpoint || e.Outcome().Finished {
		if err := r.flush(); err != nil {
			return err
		}
	}
	if checkpoint {
		if len(r.Checkpoints) > 0 && r.Checkpoints[len(r.Checkpoints)-1].Tick >= e.Tick() {
			return errors.New("checkpoint ticks must increase")
		}
		save, err := e.Save()
		if err != nil {
			return err
		}
		packed, err := compressReplay(save)
		if err != nil {
			return err
		}
		r.Checkpoints = append(r.Checkpoints, ReplayCheckpoint{Tick: e.Tick(), PackedSave: packed})
	}
	return nil
}
func (r *Replay) flush() error {
	if len(r.Commands) == 0 {
		return nil
	}
	raw, err := json.Marshal(r.Commands)
	if err != nil {
		return err
	}
	packed, err := compressReplay(raw)
	if err != nil {
		return err
	}
	r.Chunks = append(r.Chunks, ReplayChunk{First: r.Commands[0].Tick, Last: r.Commands[len(r.Commands)-1].Tick, Records: uint32(len(r.Commands)), Data: packed})
	r.Commands = nil
	return nil
}
func (r *Replay) validate() error {
	if r.Lobby != nil {
		l := r.Lobby
		validMode := l.Mode == "1v1" || l.Mode == "2v2" || l.Mode == "ffa" || l.Mode == "coop" || l.Mode == "custom"
		if len(l.Name) > 100 || !validMode || l.LiveObservers && !l.Private || l.Rated && (l.Mode != "1v1" || l.PauseEnabled || l.LiveObservers) {
			return errors.New("invalid replay lobby policy")
		}
	}
	if r.Version != 2 || r.FinalTick > 216000 || len(r.Commands) > 32768 || len(r.Chunks) > 4096 || len(r.Checkpoints) > 600 {
		return errors.New("invalid replay bounds")
	}
	prior := Tick(0)
	for _, chunk := range r.Chunks {
		if chunk.First < prior || chunk.Last < chunk.First || chunk.Last > r.FinalTick || chunk.Records == 0 || chunk.Records > 32768 || len(chunk.Data) > 32<<20 {
			return errors.New("invalid replay chunk ordering")
		}
		prior = chunk.Last
	}
	for _, cmd := range r.Commands {
		if cmd.Tick < prior || cmd.Tick > r.FinalTick || len(cmd.Orders) < 1 || len(cmd.Orders) > 32 {
			return errors.New("invalid replay command ordering")
		}
		prior = cmd.Tick
	}
	return nil
}

// ReplayPlayer streams orders once during continuous playback. Seeking creates
// a separate player, so a failed seek cannot corrupt the caller's current view.
// All playback uses the engine and its normal fog; no service rewards run here.
type ReplayPlayer struct {
	engine  *Engine
	stream  replayStream
	command *Scheduled
	final   Tick
	fault   error
}

type replayStream struct {
	replay            *Replay
	skipThrough       Tick
	chunkIndex, index int
	current           []Scheduled
	tailRead          bool
}

func (s *replayStream) next() (*Scheduled, error) {
	for s.index >= len(s.current) {
		if s.chunkIndex < len(s.replay.Chunks) {
			chunk := s.replay.Chunks[s.chunkIndex]
			s.chunkIndex++
			if chunk.Last <= s.skipThrough {
				continue
			}
			raw, err := expandReplay(chunk.Data, 32<<20)
			if err != nil {
				return nil, err
			}
			s.current = nil
			if err = json.Unmarshal(raw, &s.current); err != nil {
				return nil, err
			}
			if len(s.current) != int(chunk.Records) || s.current[0].Tick != chunk.First || s.current[len(s.current)-1].Tick != chunk.Last {
				return nil, errors.New("replay chunk metadata mismatch")
			}
			prior := chunk.First
			for _, cmd := range s.current {
				if cmd.Tick < prior || len(cmd.Orders) < 1 || len(cmd.Orders) > 32 {
					return nil, errors.New("invalid replay chunk")
				}
				prior = cmd.Tick
			}
		} else if !s.tailRead {
			s.current = s.replay.Commands
			s.tailRead = true
		} else {
			return nil, nil
		}
		s.index = 0
	}
	cmd := &s.current[s.index]
	s.index++
	return cmd, nil
}

// Open restores the closest complete checkpoint and simulates to target. The
// returned cursor retains just one expanded command chunk for later ticks.
func (r *Replay) Open(c *content.Catalog, target Tick) (*ReplayPlayer, error) {
	if err := r.validate(); err != nil {
		return nil, err
	}
	if target > r.FinalTick {
		return nil, errors.New("seek beyond replay")
	}
	save := r.Initial
	last, selected := Tick(0), Tick(0)
	for _, cp := range r.Checkpoints {
		if cp.Tick <= last || cp.Tick > r.FinalTick {
			return nil, errors.New("invalid checkpoint ordering")
		}
		last = cp.Tick
		if cp.Tick <= target {
			selected = cp.Tick
			save = cp.Save
			if len(cp.PackedSave) > 0 {
				var err error
				save, err = expandReplay(cp.PackedSave, 64<<20)
				if err != nil {
					return nil, err
				}
			}
		}
	}
	e, err := Restore(c, save)
	if err != nil {
		return nil, err
	}
	if e.Metadata() != r.Metadata || e.Tick() > target || selected > 0 && e.Tick() != selected {
		return nil, errors.New("replay checkpoint mismatch")
	}
	p := &ReplayPlayer{engine: e, stream: replayStream{replay: r, skipThrough: e.Tick()}, final: r.FinalTick}
	p.command, err = p.stream.next()
	if err != nil {
		return nil, err
	}
	for p.command != nil && p.command.Tick <= e.Tick() {
		p.command, err = p.stream.next()
		if err != nil {
			return nil, err
		}
	}
	for e.Tick() < target {
		if err := p.Advance(); err != nil {
			return nil, err
		}
	}
	return p, nil
}

func (p *ReplayPlayer) Engine() *Engine { return p.engine }
func (p *ReplayPlayer) Finished() bool  { return p.engine.Tick() >= p.final }
func (p *ReplayPlayer) Advance() error {
	if p.fault != nil {
		return p.fault
	}
	if p.Finished() {
		return nil
	}
	if p.engine.Outcome().Finished {
		p.fault = errors.New("replay ends before requested tick")
		return p.fault
	}
	for p.command != nil && p.command.Tick <= p.engine.Tick()+1 {
		command := p.command
		if command.Tick != p.engine.Tick()+1 {
			p.fault = errors.New("replay command ordering")
			return p.fault
		}
		player := p.engine.player(command.Player)
		if player == nil {
			p.fault = errors.New("replay player missing")
			return p.fault
		}
		if player.AI == "" && command.Sequence > player.LastSequence {
			if err := p.engine.Submit(command.Player, command.Sequence, command.Orders); err != nil {
				p.fault = err
				return err
			}
		}
		var err error
		p.command, err = p.stream.next()
		if err != nil {
			p.fault = err
			return err
		}
	}
	p.engine.Advance()
	return nil
}

func (r *Replay) Seek(c *content.Catalog, target Tick) (*Engine, error) {
	p, err := r.Open(c, target)
	if err != nil {
		return nil, err
	}
	return p.Engine(), nil
}

// CommandPage exposes a bounded, detached log for replay build-order panels.
// Entries are scheduled intentions, not proof that construction completed.
// The cursor is a global record offset and excludes commands before recording.
func (r *Replay) CommandPage(offset uint64, limit int) ([]Scheduled, uint64, error) {
	if err := r.validate(); err != nil {
		return nil, 0, err
	}
	if limit < 1 || limit > 1000 {
		return nil, 0, errors.New("replay page limit must be 1..1000")
	}
	stream := replayStream{replay: r}
	out := []Scheduled{}
	cursor := uint64(0)
	for {
		cmd, err := stream.next()
		if err != nil {
			return nil, 0, err
		}
		if cmd == nil {
			return out, 0, nil
		}
		if cursor >= offset {
			copy := *cmd
			copy.Orders = cloneOrders(cmd.Orders)
			out = append(out, copy)
		}
		cursor++
		if len(out) == limit {
			return out, cursor, nil
		}
	}
}
func compressReplay(data []byte) ([]byte, error) {
	var b bytes.Buffer
	w := gzip.NewWriter(&b)
	if _, err := w.Write(data); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
func expandReplay(data []byte, limit int64) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errors.New("replay expansion limit")
	}
	return b, nil
}
func (r *Replay) Encode() ([]byte, error) {
	if err := r.validate(); err != nil {
		return nil, err
	}
	if err := r.flush(); err != nil {
		return nil, err
	}
	b, err := json.Marshal(r)
	if err != nil {
		return nil, err
	}
	return compressReplay(b)
}
func DecodeReplay(data []byte) (*Replay, error) {
	if len(data) > 64<<20 {
		return nil, errors.New("replay file limit")
	}
	b, err := expandReplay(data, 128<<20)
	if err != nil {
		return nil, err
	}
	r := new(Replay)
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err = d.Decode(r); err != nil {
		return nil, err
	}
	if d.Decode(new(any)) != io.EOF {
		return nil, errors.New("trailing replay data")
	}
	return r, r.validate()
}
