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

// Uses the identical native-generated688-actor save and public command batches
// as the real browser fixture. Excludes restore setup from timed allocation data.
func BenchmarkMaximumBrowserAdapter(b *testing.B) {
	dir := os.Getenv("FRONTLINE_BROWSER_LOAD_DIR")
	if dir == "" {
		b.Skip("explicit exported browser load fixture required")
	}
	opening, err := os.ReadFile(filepath.Join(dir, "opening.json"))
	if err != nil {
		b.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "native.json"))
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
	if err = json.Unmarshal(bytes, &meta); err != nil {
		b.Fatal(err)
	}
	type command struct {
		player sim.PlayerID
		batch  []byte
	}
	byTick := map[int][]command{}
	for _, r := range meta.Commands {
		encoded, err := json.Marshal(map[string]any{"sequence": r.Sequence, "orders": r.Orders})
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
		byTick[r.Tick] = append(byTick[r.Tick], command{r.Player, payload})
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		b.StopTimer()
		session, err := NewSession()
		if err != nil {
			b.Fatal(err)
		}
		if _, err = session.Load(opening, []sim.PlayerID{1, 2, 3, 4}); err != nil {
			b.Fatal(err)
		}
		b.StartTimer()
		for tick := 0; tick < meta.Ticks; tick += 4 {
			for _, c := range byTick[tick] {
				if err = session.Submit(c.player, c.batch); err != nil {
					b.Fatal(err)
				}
			}
			if _, err = session.Step(4); err != nil {
				b.Fatal(err)
			}
			if _, err = session.View(1); err != nil {
				b.Fatal(err)
			}
		}
		b.StopTimer()
		if hash, _ := session.Hash(); hash != meta.FinalHash {
			b.Fatal("adapter/native mismatch", hash, meta.FinalHash)
		}
		session.Dispose()
		b.StartTimer()
	}
}
