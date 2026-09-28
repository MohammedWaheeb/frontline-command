package main

import (
	"encoding/json"
	"frontlinecommand/pkg/sim"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"testing"
)

func TestCombatAudioCodec(t *testing.T) {
	input, output := os.Getenv("FRONTLINE_AUDIO_INPUT"), os.Getenv("FRONTLINE_AUDIO_WIRE_OUTPUT")
	if input == "" || output == "" {
		t.Fatal("input/output required")
	}
	paths, err := filepath.Glob(filepath.Join(input, "*.json"))
	if err != nil || len(paths) != 14 {
		t.Fatal("14 cases required", len(paths), err)
	}
	wire := map[string]map[string][]byte{}
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var pair struct {
			Previous sim.View `json:"previous"`
			Current  sim.View `json:"current"`
		}
		if err = json.Unmarshal(raw, &pair); err != nil {
			t.Fatal(err)
		}
		views := map[string]sim.View{"previous": pair.Previous, "current": pair.Current}
		wire[filepath.Base(path)] = map[string][]byte{}
		for name, view := range views {
			message, err := snapshot(view)
			if err != nil {
				t.Fatal(err)
			}
			bytes, err := proto.Marshal(message)
			if err != nil {
				t.Fatal(err)
			}
			wire[filepath.Base(path)][name] = bytes
		}
	}
	raw, err := json.MarshalIndent(wire, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(output, raw, 0644); err != nil {
		t.Fatal(err)
	}
}
