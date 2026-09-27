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
	Version     uint32             `json:"version"`
	Metadata    Metadata           `json:"metadata"`
	Initial     json.RawMessage    `json:"initial"`
	FinalTick   Tick               `json:"final_tick"`
	Recorded    uint64             `json:"recorded"`
	Commands    []Scheduled        `json:"commands"`
	Chunks      []ReplayChunk      `json:"chunks"`
	Checkpoints []ReplayCheckpoint `json:"checkpoints"`
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
		if cmd.Tick < prior || cmd.Tick > r.FinalTick {
			return errors.New("invalid replay command ordering")
		}
		prior = cmd.Tick
	}
	return nil
}

// Seek restores a complete checkpoint and streams subsequent command chunks.
// Reward/service callbacks never run; AI recreates its own fog-limited decisions.
func (r *Replay) Seek(c *content.Catalog, target Tick) (*Engine, error) {
	if err := r.validate(); err != nil {
		return nil, err
	}
	if target > r.FinalTick {
		return nil, errors.New("seek beyond replay")
	}
	save := r.Initial
	last := Tick(0)
	selected := Tick(0)
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
	chunkIndex := 0
	current := []Scheduled{}
	index := 0
	tailRead := false
	next := func() (*Scheduled, error) {
		for index >= len(current) {
			if chunkIndex < len(r.Chunks) {
				chunk := r.Chunks[chunkIndex]
				chunkIndex++
				if chunk.Last <= e.Tick() {
					continue
				}
				raw, err := expandReplay(chunk.Data, 32<<20)
				if err != nil {
					return nil, err
				}
				current = nil
				if err = json.Unmarshal(raw, &current); err != nil {
					return nil, err
				}
				if len(current) != int(chunk.Records) || current[0].Tick != chunk.First || current[len(current)-1].Tick != chunk.Last {
					return nil, errors.New("replay chunk metadata mismatch")
				}
				prior := chunk.First
				for _, cmd := range current {
					if cmd.Tick < prior || len(cmd.Orders) > 32 {
						return nil, errors.New("invalid replay chunk")
					}
					prior = cmd.Tick
				}
			} else if !tailRead {
				current = r.Commands
				tailRead = true
			} else {
				return nil, nil
			}
			index = 0
		}
		cmd := &current[index]
		index++
		return cmd, nil
	}
	command, err := next()
	if err != nil {
		return nil, err
	}
	for command != nil && command.Tick <= e.Tick() {
		command, err = next()
		if err != nil {
			return nil, err
		}
	}
	for e.Tick() < target && !e.Outcome().Finished {
		for command != nil && command.Tick <= e.Tick()+1 {
			if command.Tick != e.Tick()+1 {
				return nil, errors.New("replay command ordering")
			}
			p := e.player(command.Player)
			if p == nil {
				return nil, errors.New("replay player missing")
			}
			if p.AI == "" && command.Sequence > p.LastSequence {
				if err = e.Submit(command.Player, command.Sequence, command.Orders); err != nil {
					return nil, err
				}
			}
			command, err = next()
			if err != nil {
				return nil, err
			}
		}
		e.Advance()
	}
	if e.Tick() != target {
		return nil, errors.New("replay ends before requested tick")
	}
	return e, nil
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
