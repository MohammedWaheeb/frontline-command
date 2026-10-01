package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCandidateServiceSessionAdapterParity(t *testing.T) {
	dir := os.Getenv("FRONTLINE_SERVICE_INPUT")
	if dir == "" {
		t.Skip("isolated candidate native scene inputs required")
	}
	output := os.Getenv("FRONTLINE_SERVICE_ADAPTER_OUTPUT")
	if output == "" {
		t.Fatal("explicit evidence directory required")
	}
	if err := os.MkdirAll(output, 0755); err != nil {
		t.Fatal(err)
	}
	paths, err := filepath.Glob(filepath.Join(dir, "*.approach.save.json"))
	if err != nil || len(paths) != 6 {
		t.Fatal("six approach fixtures required", paths, err)
	}
	for _, path := range paths {
		name := strings.TrimSuffix(filepath.Base(path), ".approach.save.json")
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			expectedData, err := os.ReadFile(filepath.Join(dir, name+".json"))
			if err != nil {
				t.Fatal(err)
			}
			var expected struct {
				Tick sim.Tick `json:"tick"`
				Hash string   `json:"hash"`
			}
			if err = json.Unmarshal(expectedData, &expected); err != nil {
				t.Fatal(err)
			}
			session, err := NewSession()
			if err != nil {
				t.Fatal(err)
			}
			defer session.Dispose()
			info, err := session.Load(data, []sim.PlayerID{1})
			if err != nil {
				t.Fatal(err)
			}
			for info.Tick < expected.Tick {
				n := min(200, int(expected.Tick-info.Tick))
				info, err = session.Step(n)
				if err != nil {
					t.Fatal(err)
				}
			}
			hash, err := session.Hash()
			if err != nil || hash != expected.Hash {
				t.Fatal("adapter simulation divergence", hash, expected.Hash, err)
			}
			wire, err := session.View(1)
			if err != nil {
				t.Fatal(err)
			}
			save, err := session.Save()
			if err != nil {
				t.Fatal(err)
			}
			sha := func(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
			record := map[string]any{"simulation": sim.Version, "scene": name, "tick": info.Tick, "hash": hash, "wire_sha256": sha(wire), "save_sha256": sha(save.Data)}
			bytes, err := json.MarshalIndent(record, "", "  ")
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(filepath.Join(output, name+".json"), bytes, 0644); err != nil {
				t.Fatal(err)
			}
			t.Logf("loaded actual approach save, stepped browserSession, decoded owner wire; hash%s wire%s", hash, sha(wire))
		})
	}
}
