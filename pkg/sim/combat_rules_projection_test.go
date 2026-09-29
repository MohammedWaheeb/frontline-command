package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// This projection deliberately excludes only the new persisted presentation
// metadata and compatibility label. It is NOT a canonical hash/save comparison.
func combatRulesProjection(t *testing.T, e *Engine) string {
	t.Helper()
	raw, err := json.Marshal(e.state)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]json.RawMessage
	if err = json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	var metadata map[string]json.RawMessage
	json.Unmarshal(state["metadata"], &metadata)
	delete(metadata, "simulation")
	state["metadata"], _ = json.Marshal(metadata)
	var events []map[string]json.RawMessage
	json.Unmarshal(state["events"], &events)
	for _, event := range events {
		delete(event, "combat")
	}
	state["events"], _ = json.Marshal(events)
	raw, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func TestCombatRulesProjection(t *testing.T) {
	path := os.Getenv("FRONTLINE_RULES_PROJECTION")
	if path == "" {
		t.Skip("explicit cross-source projection output required")
	}
	records := map[string][]string{}
	for _, scenario := range []string{"rifle-open", "rifle-cover", "hull-down", "shieldline", "artillery"} {
		e := fixture(t)
		sourceType, targetType := "US.rifle", "IR.rifle"
		switch scenario {
		case "hull-down":
			sourceType, targetType = "US.tank", "SA.tank"
		case "shieldline":
			sourceType, targetType = "US.gunship", "SA.tank"
		case "artillery":
			sourceType, targetType = "US.artillery", "IR.tank"
		}
		source := e.spawn(sourceType, 1, Vec{X: 16000, Y: 16000}, true, 0)
		target := e.spawn(targetType, 2, Vec{X: 20500, Y: 16000}, true, 0)
		if scenario == "rifle-cover" {
			e.state.Map.Tiles[16*e.state.Map.Width+20].Terrain = "cover"
		}
		if scenario == "hull-down" {
			target.Deployed = true
		}
		if scenario == "shieldline" {
			target.Buffs = append(target.Buffs, Buff{Kind: "shieldline", Until: 1000, Source: target.ID})
			source.Landed = false
			home := e.spawn("US.airfield", 1, Vec{X: 28000, Y: 32000}, true, 0)
			source.Home = home.ID
		}
		if scenario == "artillery" {
			e.spawn("IR.rifle", 2, Vec{X: 21200, Y: 16800}, true, 0)
			e.spawn("US.rifle", 1, Vec{X: 20200, Y: 17300}, true, 0)
		}
		source.Stance, target.Stance = "hold", "hold"
		e.recalculate()
		e.updateFog()
		issue(t, e, 1, Order{Kind: "attack", Entities: []ID{source.ID}, Target: target.ID})
		for i := 0; i < 240; i++ {
			records[scenario] = append(records[scenario], combatRulesProjection(t, e))
			e.Advance()
		}
	}
	for _, faction := range []string{"US", "IR"} {
		for edge := int32(0); edge < 4; edge++ {
			e, site := strategicFixture(t, faction)
			point := e.entity(3).Position
			e.spawn(faction+".engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
			e.updateFog()
			key := fmt.Sprintf("%s-edge-%d", faction, edge)
			issue(t, e, 1, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Index: edge, Points: []Vec{point, point, point}})
			for i := 0; i < 800; i++ {
				if i%20 == 0 {
					records[key] = append(records[key], combatRulesProjection(t, e))
				}
				e.Advance()
			}
			records[key] = append(records[key], combatRulesProjection(t, e))
		}
	}
	output := struct {
		Simulation string              `json:"simulation"`
		Excluded   []string            `json:"excluded"`
		Records    map[string][]string `json:"records"`
	}{Version, []string{"metadata.simulation", "events[].combat"}, records}
	raw, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, raw, 0644); err != nil {
		t.Fatal(err)
	}
}
