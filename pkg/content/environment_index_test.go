package content

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBetaEnvironmentRegistration(t *testing.T) {
	data, err := os.ReadFile("../../content/index.json")
	if err != nil {
		t.Fatal(err)
	}
	var index struct {
		Maps []struct {
			ID          string `json:"id"`
			Environment *struct {
				URL    string `json:"url"`
				SHA256 string `json:"sha256"`
				Bytes  int    `json:"bytes"`
			} `json:"environment"`
		} `json:"maps"`
	}
	if err = json.Unmarshal(data, &index); err != nil {
		t.Fatal(err)
	}
	expected := map[string]bool{"copper-junction": false, "industrial-valley": false, "port-outskirts": false, "relay-heights": false, "dry-river": false, "border-depots": false, "convoy-union": false, "twin-outposts": false}
	for _, entry := range index.Maps {
		if _, ok := expected[entry.ID]; !ok {
			continue
		}
		if expected[entry.ID] {
			t.Fatalf("duplicate map %s", entry.ID)
		}
		expected[entry.ID] = true
		descriptor := entry.Environment
		if descriptor == nil || descriptor.URL != "/content/environment/"+entry.ID+".json" {
			t.Fatalf("missing environment registration: %s", entry.ID)
		}
		scene, err := os.ReadFile(filepath.Join("../..", descriptor.URL[1:]))
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256(scene)
		if descriptor.Bytes != len(scene) || descriptor.SHA256 != hex.EncodeToString(hash[:]) {
			t.Fatalf("stale environment descriptor: %s", entry.ID)
		}
	}
	for id, seen := range expected {
		if !seen {
			t.Errorf("missing map %s", id)
		}
	}
}
