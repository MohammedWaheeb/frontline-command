//go:build !(js && wasm)

package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Native builds of cmd/wasm are a test harness, not a game binary:
//
//	go run ./cmd/wasm -scenario file.json   run a scripted match, print hashes
//	go run ./cmd/wasm -codec < hex-lines    decode/re-encode protobuf Envelopes
//	go run ./cmd/wasm -version              print adapter/runtime versions
func main() {
	scenario := flag.String("scenario", "", "scenario JSON file to run natively")
	codec := flag.Bool("codec", false, "decode hex Envelope lines from stdin")
	version := flag.Bool("version", false, "print versions")
	flag.Parse()
	var err error
	switch {
	case *version:
		s, e := NewSession()
		if e != nil {
			err = e
			break
		}
		err = json.NewEncoder(os.Stdout).Encode(map[string]any{"adapter": AdapterVersion, "simulation": sim.Version, "protocol": ProtocolVersion, "go": runtime.Version(), "content_hash": s.catalog.Hash()})
	case *scenario != "":
		var data []byte
		if data, err = os.ReadFile(*scenario); err == nil {
			var out ScenarioResult
			if out, err = RunScenario(data); err == nil {
				err = json.NewEncoder(os.Stdout).Encode(out)
			}
		}
	case *codec:
		err = runCodec(os.Stdin, os.Stdout)
	default:
		flag.Usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// Scenario is shared with the Node/browser parity tests so both runtimes
// execute the identical command log.
type Scenario struct {
	Config json.RawMessage `json:"config"`
	Script []ScenarioStep  `json:"script"`
}

type ScenarioStep struct {
	Op     string          `json:"op"`
	N      int             `json:"n,omitempty"`
	Player sim.PlayerID    `json:"player,omitempty"`
	Batch  json.RawMessage `json:"batch,omitempty"`
	Label  string          `json:"label,omitempty"`
}

type Checkpoint struct {
	Label string   `json:"label"`
	Tick  sim.Tick `json:"tick"`
	Hash  string   `json:"hash"`
}

type ScenarioResult struct {
	Go          string            `json:"go"`
	Checkpoints []Checkpoint      `json:"checkpoints"`
	Views       map[string]string `json:"views"`
	Submits     []string          `json:"submits"`
	SaveSHA256  string            `json:"save_sha256"`
	FinalHash   string            `json:"final_hash"`
	FinalTick   sim.Tick          `json:"final_tick"`
}

func RunScenario(data []byte) (ScenarioResult, error) {
	var sc Scenario
	if err := json.Unmarshal(data, &sc); err != nil {
		return ScenarioResult{}, err
	}
	s, err := NewSession()
	if err != nil {
		return ScenarioResult{}, err
	}
	if _, err := s.Create(sc.Config); err != nil {
		return ScenarioResult{}, err
	}
	out := ScenarioResult{Go: runtime.Version(), Views: map[string]string{}}
	for i, step := range sc.Script {
		switch step.Op {
		case "step":
			if _, err := s.Step(step.N); err != nil {
				return out, fmt.Errorf("script %d: %w", i, err)
			}
		case "submit":
			batch := new(pb.OrderBatch)
			if err := protojson.Unmarshal(step.Batch, batch); err != nil {
				return out, fmt.Errorf("script %d batch: %w", i, err)
			}
			b, _ := proto.Marshal(batch)
			code := "accepted"
			if err := s.Submit(step.Player, b); err != nil {
				code = err.(*Error).Code
			}
			out.Submits = append(out.Submits, code)
		case "checkpoint":
			h, _ := s.Hash()
			out.Checkpoints = append(out.Checkpoints, Checkpoint{step.Label, s.engine.Tick(), h})
		case "view":
			b, err := s.View(step.Player)
			if err != nil {
				return out, fmt.Errorf("script %d view: %w", i, err)
			}
			out.Views[step.Label] = hex.EncodeToString(b)
		case "save_restore":
			r, err := s.Save()
			if err != nil {
				return out, err
			}
			if _, err := s.Load(r.Data, r.Local); err != nil {
				return out, fmt.Errorf("script %d restore: %w", i, err)
			}
			sum := sha256.Sum256(r.Data)
			out.SaveSHA256 = hex.EncodeToString(sum[:])
		default:
			return out, fmt.Errorf("script %d: unknown op %q", i, step.Op)
		}
	}
	out.FinalHash, _ = s.Hash()
	out.FinalTick = s.engine.Tick()
	return out, nil
}

// runCodec reads hex-encoded Envelope frames (one per line) produced by the
// TypeScript bindings and answers with Go's canonical protojson and re-encoding.
func runCodec(in io.Reader, w io.Writer) error {
	enc := json.NewEncoder(w)
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 1<<20), 64<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		raw, err := hex.DecodeString(line)
		if err != nil {
			return err
		}
		env := new(pb.Envelope)
		result := map[string]any{}
		if err := proto.Unmarshal(raw, env); err != nil {
			result["error"] = err.Error()
		} else {
			j, _ := protojson.MarshalOptions{UseProtoNames: true}.Marshal(env)
			b, _ := proto.MarshalOptions{Deterministic: true}.Marshal(env)
			result["json"] = json.RawMessage(j)
			result["hex"] = hex.EncodeToString(b)
		}
		if err := enc.Encode(result); err != nil {
			return err
		}
	}
	return sc.Err()
}
