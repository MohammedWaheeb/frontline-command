package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"testing"
)

// Consumes the event-bearing save from ordinary Attack/Advance combat, not a
// handwritten protocol event. Run this on both host and WASM adapters.
func TestOwnerCasualtyActualCodec(t *testing.T) {
	dir := os.Getenv("FRONTLINE_CASUALTY_INPUT")
	if dir == "" {
		t.Skip("requires actual casualty fixture outputs")
	}
	data, err := os.ReadFile(filepath.Join(dir, "casualty-ordinary.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	e, err := sim.Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(filepath.Join(dir, "casualty-ordinary.json"))
	if err != nil {
		t.Fatal(err)
	}
	var actual struct {
		Hash string    `json:"hash"`
		Lost sim.Event `json:"lost"`
	}
	if err = json.Unmarshal(data, &actual); err != nil {
		t.Fatal(err)
	}
	before := e.Hash()
	records := map[string]string{}
	for _, player := range []sim.PlayerID{1, 2} {
		view, ok := e.PlayerView(player)
		if !ok {
			t.Fatal("missing perspective")
		}
		frame, err := snapshot(view)
		if err != nil {
			t.Fatal(err)
		}
		wire, err := proto.MarshalOptions{Deterministic: true}.Marshal(frame)
		if err != nil {
			t.Fatal(err)
		}
		roundtrip := new(pb.PlayerSnapshot)
		if err = proto.Unmarshal(wire, roundtrip); err != nil || !proto.Equal(frame, roundtrip) {
			t.Fatal("snapshot codec changed frame", err)
		}
		count := 0
		for _, event := range roundtrip.Events {
			if event.Kind == "destroyed" && event.Entity == uint32(actual.Lost.Entity) {
				count++
				if event.Owner != uint32(actual.Lost.Owner) || event.Combat != nil || event.Value != 0 {
					t.Fatal("casualty ownership or cause changed", event)
				}
			}
		}
		if player == actual.Lost.Owner && count != 1 {
			t.Fatal("last-sight owner casualty lost in protocol", count)
		}
		sum := sha256.Sum256(wire)
		name := "player1"
		if player == 2 {
			name = "player2"
		}
		records[name] = hex.EncodeToString(sum[:])
	}
	if e.Hash() != before || before != actual.Hash {
		t.Fatal("codec changed state or fixture hash")
	}
	if output := os.Getenv("FRONTLINE_CASUALTY_CODEC_OUTPUT"); output != "" {
		data, err = json.MarshalIndent(records, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(output, data, 0644); err != nil {
			t.Fatal(err)
		}
	}
}
