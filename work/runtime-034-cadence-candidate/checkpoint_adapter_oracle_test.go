package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"testing"
)

// Test-only overlay: production CLI and the clean locked source are unchanged.
func TestRuntimeCheckpointSessionOracle(t *testing.T) {
	input, output := os.Getenv("FRONTLINE_CHECKPOINT_ADAPTER_INPUT"), os.Getenv("FRONTLINE_CHECKPOINT_ADAPTER_OUTPUT")
	if input == "" || output == "" {
		t.Fatal("explicit exact checkpoint input/output required")
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	sha := func(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
	if sha(raw) != "dd8de215f6a2f67d0d9a558f5ee1f5ba2b520dd98c4ffdc51836fbce82f9876a" {
		t.Fatal("checkpoint input drift")
	}
	s, err := NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Dispose()
	info, err := s.Load(raw, []sim.PlayerID{1, 2, 3, 4})
	if err != nil || info.Tick != 600 {
		t.Fatal("actual checkpoint load", err)
	}
	if _, err := s.View(99); err == nil || err.(*Error).Code != "unauthorized_view" {
		t.Fatal("unknown local view not denied", err)
	}
	if err := os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	records := []map[string]any{}
	for _, target := range []sim.Tick{600, 601, 620} {
		if info.Tick < target {
			info, err = s.Step(int(target - info.Tick))
			if err != nil {
				t.Fatal(err)
			}
		}
		views := map[string]string{}
		for _, player := range []sim.PlayerID{1, 2, 3, 4} {
			wire, err := s.View(player)
			if err != nil {
				t.Fatal(err)
			}
			var view pb.PlayerSnapshot
			if err := proto.Unmarshal(wire, &view); err != nil {
				t.Fatal(err)
			}
			if view.Player != uint32(player) || view.Tick != uint32(target) {
				t.Fatal("wrong authorized perspective/tick")
			}
			for _, actor := range view.Entities {
				if actor.Owner != uint32(player) && actor.Private != nil {
					t.Fatal("foreign private state disclosed")
				}
			}
			name := fmt.Sprintf("%d-p%d.pb", target, player)
			if err := os.WriteFile(filepath.Join(output, name), wire, 0600); err != nil {
				t.Fatal(err)
			}
			views[fmt.Sprint(player)] = sha(wire)
		}
		save, err := s.Save()
		if err != nil {
			t.Fatal(err)
		}
		hash, err := s.Hash()
		if err != nil {
			t.Fatal(err)
		}
		if target == 600 && (hash != "71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1" || sha(save.Data) != sha(raw)) {
			t.Fatal("load changed actual checkpoint")
		}
		if err := os.WriteFile(filepath.Join(output, fmt.Sprintf("%d.save.json", target)), save.Data, 0600); err != nil {
			t.Fatal(err)
		}
		records = append(records, map[string]any{"tick": target, "info": info, "hash": hash, "save_sha256": sha(save.Data), "views": views})
	}
	b, err := json.MarshalIndent(map[string]any{"records": records, "unauthorized_view_denied": true}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(output, "checkpoint.json"), append(b, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
}
