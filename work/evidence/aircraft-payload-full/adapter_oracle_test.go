//go:build !(js && wasm)

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// This exports the actual adapter delivery contract, independently of the raw
// Engine.PlayerView captures. It does not alter state, payloads or feedback.
func TestFullArtPayloadAdapterOracle(t *testing.T) {
	input, output := os.Getenv("FRONTLINE_PAYLOAD_INPUT"), os.Getenv("FRONTLINE_PAYLOAD_ORACLE")
	if input == "" || output == "" {
		t.Fatal("explicit frozen input/output required")
	}
	read := func(name string) []byte {
		t.Helper()
		b, err := os.ReadFile(filepath.Join(input, name))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	type point struct {
		Stage   string   `json:"stage"`
		Tick    sim.Tick `json:"tick"`
		Hash    string   `json:"hash"`
		Actor   sim.ID   `json:"actor"`
		Owned   sim.View `json:"owned"`
		Foreign sim.View `json:"foreign"`
	}
	type oracle struct {
		View  json.RawMessage `json:"view"`
		SHA   string          `json:"wire_sha256"`
		Bytes int             `json:"bytes"`
	}
	check := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, typ := range []string{"US.fighter", "IR.strike"} {
		t.Run(typ, func(t *testing.T) {
			var points []point
			check(json.Unmarshal(read(filepath.Join(typ, "course.json")), &points))
			if len(points) != 10 {
				t.Fatal("ten preserved boundaries required")
			}
			s, err := NewSession()
			check(err)
			defer s.Dispose()
			replays := read(filepath.Join(typ, "course.fcr"))
			out := map[string]map[string]map[string]oracle{"load": {}, "seek": {}, "continuation": {}}
			emit := func(mode string, p point, who string, player sim.PlayerID, live bool) {
				t.Helper()
				b, err := s.View(player)
				check(err)
				var actual pb.PlayerSnapshot
				check(proto.Unmarshal(b, &actual))
				hash, err := s.Hash()
				check(err)
				if hash != p.Hash || actual.Tick != uint32(p.Tick) {
					t.Fatal(mode, p.Stage, "state/tick differs", hash)
				}
				raw := p.Owned
				if who == "foreign" {
					raw = p.Foreign
				}
				expected, err := snapshot(raw)
				check(err)
				if !live {
					// Assert the documented empty pending buffer after install. The emitted
					// oracle below remains the untouched Session.View output, never this clone.
					if len(actual.Events) != 0 || len(actual.Results) != 0 {
						t.Fatal("install replayed historical feedback")
					}
					expected.Events = nil
					expected.Results = nil
				} else {
					found := false
					for _, event := range actual.Events {
						if event.Kind == "weapon_fired" && event.Entity == uint32(p.Actor) && event.Tick == uint32(p.Tick) {
							found = true
						}
					}
					if !found {
						t.Fatal("ordinary replay Step omitted the current last-shot event")
					}
				}
				if !proto.Equal(expected, &actual) {
					t.Fatal(mode, p.Stage, who, "adapter facts differ from original raw native course")
				}
				encoded, err := protojson.Marshal(&actual)
				check(err)
				sum := sha256.Sum256(b)
				if out[mode][p.Stage] == nil {
					out[mode][p.Stage] = map[string]oracle{}
				}
				out[mode][p.Stage][who] = oracle{encoded, hex.EncodeToString(sum[:]), len(b)}
				filename := filepath.Join(output, typ, mode+"-"+p.Stage+"-"+who+".pb")
				check(os.WriteFile(filename, b, 0644))
			}
			check(os.MkdirAll(filepath.Join(output, typ), 0755))
			for _, p := range points {
				for i, who := range []string{"owned", "foreign"} {
					player := sim.PlayerID(i + 1)
					save := read(filepath.Join(typ, p.Stage+".save.json"))
					_, err = s.Load(save, []sim.PlayerID{1, 2})
					check(err)
					// Worker load emits View(1), pause emits no view, perspective emits View(p).
					_, err = s.View(1)
					check(err)
					emit("load", p, who, player, false)
					restored, err := s.Save()
					check(err)
					if !bytes.Equal(restored.Data, save) {
						t.Fatal("adapter load altered saved bytes")
					}
					_, err = s.LoadReplay(replays)
					check(err)
					_, err = s.View(1)
					check(err)
					_, err = s.SeekReplay(p.Tick)
					check(err)
					_, err = s.View(1)
					check(err)
					emit("seek", p, who, player, false)
					if p.Stage == "02-final-round" {
						if p.Tick == 0 {
							t.Fatal("shot continuation needs predecessor tick")
						}
						_, err = s.LoadReplay(replays)
						check(err)
						_, err = s.View(1)
						check(err)
						_, err = s.SeekReplay(p.Tick - 1)
						check(err)
						_, err = s.View(1)
						check(err)
						// Select the perspective before ordinary Step. No view drains it afterward
						// until emit captures the same frame delivered by the worker.
						_, err = s.View(player)
						check(err)
						_, err = s.Step(1)
						check(err)
						emit("continuation", p, who, player, true)
						drained, err := s.View(player)
						check(err)
						var again pb.PlayerSnapshot
						check(proto.Unmarshal(drained, &again))
						if len(again.Events) != 0 || len(again.Results) != 0 {
							t.Fatal("feedback did not drain exactly once")
						}
					}
				}
			}
			b, err := json.MarshalIndent(out, "", "  ")
			check(err)
			check(os.WriteFile(filepath.Join(output, typ, "oracle.json"), b, 0644))
		})
	}
}
