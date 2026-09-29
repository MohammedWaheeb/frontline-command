package main

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Synthetic inventory only; these records are not playable authored content.
func inventoryFixture() (map[string]content.Map, map[string]content.Mission, []string) {
	maps := map[string]content.Map{}
	missions := map[string]content.Mission{}
	launch := []string{}
	for i, title := range []string{"Copper Junction", "Relay Heights", "Dry River", "Industrial Valley", "Border Depots", "Port Outskirts", "Convoy Union", "Twin Outposts"} {
		id := fmt.Sprintf("launch-%d", i)
		n := 4
		if i < 3 {
			n = 2
		}
		maps[id] = content.Map{ID: id, Title: title, Spawns: make([]content.Spawn, n)}
		launch = append(launch, id)
	}
	add := func(id, mode, faction, mapID string) {
		missions[id] = content.Mission{ID: id, Mode: mode, Faction: faction, MapID: mapID, Briefing: "Fixture", Debrief: "Fixture", Objectives: []content.MissionObjective{{ID: "optional", Optional: true}, {ID: "failure", Failure: true}}, Triggers: []content.MissionTrigger{{Actions: []content.MissionAction{{Kind: "checkpoint", Text: "Midpoint"}}}}, Difficulty: []content.MissionDifficulty{{ID: "easy"}, {ID: "normal"}, {ID: "hard"}}}
	}
	for _, f := range []string{"US", "IR", "SY", "SA"} {
		for i := 0; i < 6; i++ {
			id := fmt.Sprintf("%s-%d", f, i)
			maps[id] = content.Map{ID: id}
			add(id, "campaign", f, id)
		}
	}
	for i := 0; i < 5; i++ {
		add(fmt.Sprintf("tutorial-%d", i), "tutorial", "US", launch[0])
	}
	add("coop-one", "coop", "US", launch[6])
	add("coop-two", "coop", "SA", launch[7])
	return maps, missions, launch
}
func writeIndex(t *testing.T, dir string, ids []string) {
	t.Helper()
	data, _ := json.Marshal(map[string]any{"format_version": 1, "launch_maps": ids})
	if err := os.WriteFile(filepath.Join(dir, "release.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}
func TestReleaseInventoryCannotSubstituteAliasesForAuthoredLayouts(t *testing.T) {
	maps, missions, ids := inventoryFixture()
	dir := t.TempDir()
	writeIndex(t, dir, ids)
	if err := complete(maps, missions); err != nil {
		t.Fatal(err)
	}
	if err := launchIndex(dir, maps, missions); err != nil {
		t.Fatal(err)
	}
	changed := missions["US-1"]
	changed.MapID = "US-0"
	missions["US-1"] = changed
	if err := launchIndex(dir, maps, missions); err == nil || !strings.Contains(err.Error(), "own authored layout") {
		t.Fatal("duplicate campaign layout passed", err)
	}
	changed.MapID = "US-1"
	missions["US-1"] = changed
	ids[1] = ids[0]
	writeIndex(t, dir, ids)
	if err := launchIndex(dir, maps, missions); err == nil {
		t.Fatal("duplicate launch entry passed")
	}
}
func TestReleaseInventoryRequiresEveryCampaignAndMissionContract(t *testing.T) {
	maps, missions, _ := inventoryFixture()
	m := missions["US-0"]
	m.Objectives = nil
	missions[m.ID] = m
	if err := complete(maps, missions); err == nil || !strings.Contains(err.Error(), "explicit failure") {
		t.Fatal(err)
	}
	maps, missions, _ = inventoryFixture()
	m = missions["US-0"]
	m.Faction = "IR"
	missions[m.ID] = m
	if err := complete(maps, missions); err == nil || !strings.Contains(err.Error(), "US campaign") {
		t.Fatal(err)
	}
}
func TestContentScanRejectsOversizedAndLinkedInputsBeforeReading(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "map.json")
	if err := os.WriteFile(file, []byte("12345"), 0o600); err != nil {
		t.Fatal(err)
	}
	called := false
	if err := files(dir, 4, func(string, []byte) error { called = true; return nil }); err == nil || called {
		t.Fatal("oversized file reached decoder")
	}
	linked := filepath.Join(t.TempDir(), "linked.json")
	if err := os.Symlink(file, linked); err != nil {
		t.Skip("symlink unavailable", err)
	}
	if err := files(filepath.Dir(linked), 10, func(string, []byte) error { called = true; return nil }); err == nil || called {
		t.Fatal("linked content reached decoder")
	}
}
