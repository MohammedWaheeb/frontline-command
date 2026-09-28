//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Profile-only stage decomposition on the exact historical public-view fixture.
// No production converter, simulation, version or save content is modified.
func profileFinalSession(b *testing.B) *Session {
	b.Helper()
	dir := os.Getenv("FRONTLINE_BROWSER_LOAD_DIR")
	if dir == "" {
		b.Fatal("explicit historical fixture required")
	}
	opening, err := os.ReadFile(filepath.Join(dir, "opening.json"))
	if err != nil {
		b.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "native.json"))
	if err != nil {
		b.Fatal(err)
	}
	var meta struct {
		Ticks     int    `json:"ticks"`
		FinalHash string `json:"final_hash"`
		Commands  []struct {
			Tick     int          `json:"tick"`
			Player   sim.PlayerID `json:"player"`
			Sequence uint32       `json:"sequence"`
			Orders   []sim.Order  `json:"orders"`
		} `json:"commands"`
	}
	if err = json.Unmarshal(data, &meta); err != nil {
		b.Fatal(err)
	}
	s, err := NewSession()
	if err != nil {
		b.Fatal(err)
	}
	if _, err = s.Load(opening, []sim.PlayerID{1, 2, 3, 4}); err != nil {
		b.Fatal(err)
	}
	for tick := 0; tick < meta.Ticks; tick += 4 {
		for _, command := range meta.Commands {
			if command.Tick != tick {
				continue
			}
			encoded, err := json.Marshal(map[string]any{"sequence": command.Sequence, "orders": command.Orders})
			if err != nil {
				b.Fatal(err)
			}
			request := new(pb.OrderBatch)
			if err = protojson.Unmarshal(encoded, request); err != nil {
				b.Fatal(err)
			}
			payload, err := proto.Marshal(request)
			if err != nil {
				b.Fatal(err)
			}
			if err = s.Submit(command.Player, payload); err != nil {
				b.Fatal(err)
			}
		}
		if _, err = s.Step(4); err != nil {
			b.Fatal(err)
		}
		if _, err = s.View(1); err != nil {
			b.Fatal(err)
		}
	}
	if hash, err := s.Hash(); err != nil || hash != meta.FinalHash {
		b.Fatalf("historical hash mismatch: %s %s %v", hash, meta.FinalHash, err)
	}
	return s
}

func BenchmarkMaximumSnapshotStages(b *testing.B) {
	s := profileFinalSession(b)
	defer s.Dispose()
	view, ok := s.engine.PlayerView(1)
	if !ok {
		b.Fatal("owner view absent")
	}
	encoded, err := json.Marshal(view)
	if err != nil {
		b.Fatal(err)
	}
	message, err := snapshot(view)
	if err != nil {
		b.Fatal(err)
	}
	binary, err := proto.Marshal(message)
	if err != nil {
		b.Fatal(err)
	}
	hash := s.engine.Hash()
	b.Logf("fixture tick=%d visibleEntities=%d JSON=%d protobuf=%d hash=%s", view.Tick, len(view.Entities), len(encoded), len(binary), hash)
	b.Run("PlayerView", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, ok := s.engine.PlayerView(1); !ok {
				b.Fatal("view absent")
			}
		}
	})
	b.Run("JSONMarshal", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := json.Marshal(view); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("ProtoJSONUnmarshal", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if err := protojson.Unmarshal(encoded, new(pb.PlayerSnapshot)); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("SnapshotJSONRoundtrip", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := snapshot(view); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("ProtobufMarshal", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := proto.Marshal(message); err != nil {
				b.Fatal(err)
			}
		}
	})
	b.Run("SessionView", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := s.View(1); err != nil {
				b.Fatal(err)
			}
		}
	})
	if s.engine.Hash() != hash {
		b.Fatal("read-only stage profile changed authoritative state")
	}
}
