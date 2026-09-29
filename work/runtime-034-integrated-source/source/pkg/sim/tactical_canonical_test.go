package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// This exact test is also run against a preserved copy of shipping0.3.3. Its
// outputs must match: presentation and shared launch geometry change no state.
func TestTacticalCanonicalStatePreservation(t *testing.T) {
	if os.Getenv("FRONTLINE_CANONICAL_OUTPUT") == "" {
		t.Skip("cross-source comparison harness")
	}
	records := map[string][]string{}
	for _, faction := range []string{"US", "IR"} {
		for edge := int32(0); edge < 4; edge++ {
			e, site := strategicFixture(t, faction)
			point := e.entity(3).Position
			e.spawn(faction+".engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
			e.updateFog()
			key := fmt.Sprintf("%s-edge-%d", faction, edge)
			issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Index: edge, Points: []Vec{point, point, point}})
			for tick := 0; tick < 800; tick++ {
				before := e.Hash()
				e.PlayerView(1)
				e.PlayerView(2)
				if e.Hash() != before {
					t.Fatal("view changed canonical state")
				}
				if tick%20 == 0 {
					records[key] = append(records[key], before)
				}
				if tick == 137 {
					save, err := e.Save()
					if err != nil {
						t.Fatal(err)
					}
					restored, err := Restore(e.catalog, save)
					if err != nil || restored.Hash() != before {
						t.Fatal("restore divergence", err)
					}
					e = restored
				}
				e.Advance()
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(save)
			records[key] = append(records[key], e.Hash(), hex.EncodeToString(digest[:]))
		}
	}
	data, err := json.MarshalIndent(records, "", " ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("FRONTLINE_CANONICAL_OUTPUT"), data, 0644); err != nil {
		t.Fatal(err)
	}
}
