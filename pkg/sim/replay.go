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
type Replay struct {
	Version     uint32             `json:"version"`
	Metadata    Metadata           `json:"metadata"`
	Initial     json.RawMessage    `json:"initial"`
	FinalTick   Tick               `json:"final_tick"`
	Commands    []Scheduled        `json:"commands"`
	Checkpoints []ReplayCheckpoint `json:"checkpoints"`
}

func NewReplay(e *Engine) (*Replay, error) {
	save, err := e.Save()
	if err != nil {
		return nil, err
	}
	return &Replay{Version: 1, Metadata: e.Metadata(), Initial: save, FinalTick: e.Tick()}, nil
}
func (r *Replay) Capture(e *Engine, checkpoint bool) error {
	if r.Metadata != e.Metadata() {
		return errors.New("replay metadata mismatch")
	}
	r.FinalTick = e.Tick()
	state := e.StateCopy()
	r.Commands = state.Log
	if checkpoint {
		save, err := e.Save()
		if err != nil {
			return err
		}
		if len(r.Checkpoints) > 0 && r.Checkpoints[len(r.Checkpoints)-1].Tick >= e.Tick() {
			return errors.New("checkpoint ticks must increase")
		}
		packed, err := compressReplay(save)
		if err != nil {
			return err
		}
		r.Checkpoints = append(r.Checkpoints, ReplayCheckpoint{Tick: e.Tick(), PackedSave: packed})
	}
	return nil
}

// Seek restores the nearest complete checkpoint and re-simulates without any
// service/reward callbacks. Deterministic AI recreates its own logged decisions;
// replay injection applies human intentions only to avoid duplicate AI orders.
func (r *Replay) Seek(c *content.Catalog, target Tick) (*Engine, error) {
	if r.Version != 1 || target > r.FinalTick || len(r.Commands) > 200000 || len(r.Checkpoints) > 600 {
		return nil, errors.New("invalid replay bounds")
	}
	save := r.Initial
	last := Tick(0)
	for _, cp := range r.Checkpoints {
		if cp.Tick <= last || cp.Tick > r.FinalTick {
			return nil, errors.New("invalid checkpoint ordering")
		}
		last = cp.Tick
		if cp.Tick <= target {
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
	if e.Metadata() != r.Metadata || e.Tick() > target {
		return nil, errors.New("replay checkpoint mismatch")
	}
	index := 0
	for index < len(r.Commands) && r.Commands[index].Tick <= e.Tick() {
		index++
	}
	for e.Tick() < target && !e.Outcome().Finished {
		for index < len(r.Commands) && r.Commands[index].Tick <= e.Tick()+1 {
			cmd := r.Commands[index]
			if cmd.Tick != e.Tick()+1 {
				return nil, errors.New("replay command ordering")
			}
			p := e.player(cmd.Player)
			if p == nil {
				return nil, errors.New("replay player missing")
			}
			if p.AI == "" && cmd.Sequence > p.LastSequence {
				if err = e.Submit(cmd.Player, cmd.Sequence, cmd.Orders); err != nil {
					return nil, err
				}
			}
			index++
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

// Encode stores compressed checkpoints and an ordered command log. The outer
// compression keeps exports small without trusting compressed size on import.
func (r *Replay) Encode() ([]byte, error) {
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
	if d.Decode(new(any)) != io.EOF || r.Version != 1 || len(r.Commands) > 200000 || len(r.Checkpoints) > 600 {
		return nil, errors.New("invalid replay")
	}
	return r, nil
}
