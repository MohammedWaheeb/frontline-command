package server

import (
	"context"
	"encoding/json"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// TestBootVoidsInterruptedMatchAsHostRestart proves the honest host-crash
// contract: a match whose latest checkpoint was persisted before the host
// died is voided on the next boot with reason host_restart, its checkpoint
// journal row does not survive as a phantom live match, the checkpoint
// bytes are archived as a restorable diagnostic, and a participant can see
// the voided state through the existing history API.
func TestBootVoidsInterruptedMatchAsHostRestart(t *testing.T) {
	dir := t.TempDir()
	cfg := Config{DataDir: dir, MapDir: filepath.Join(dir, "no-maps")}
	ctx := context.Background()

	// First host incarnation: a profiled match starts and takes its 30s
	// checkpoint (tick 600), then the host "crashes" — the process goes
	// away without the match actor committing a result.
	first, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	player, token, err := first.repo.CreateProfile(ctx, "Crash Survivor")
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.New(first.catalog, sim.Config{Map: testMap(), Seed: 6, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	opening, err := engine.Save()
	if err != nil {
		t.Fatal(err)
	}
	members := []storage.MatchMember{{Profile: player.ID, Player: 1}}
	if err = first.repo.StartMatchAccess(ctx, "host-restart-match", 0, opening, members, false); err != nil {
		t.Fatal(err)
	}
	engine.Advance()
	latest, err := engine.Save()
	if err != nil {
		t.Fatal(err)
	}
	if err = first.repo.CheckpointMatch(ctx, "host-restart-match", 600, latest); err != nil {
		t.Fatal(err)
	}
	if err = first.Close(); err != nil {
		t.Fatal(err)
	}

	// Second boot on the same data directory runs recovery inside New.
	second, err := New(cfg)
	if err != nil {
		t.Fatalf("host did not reboot over interrupted match: %v", err)
	}
	defer second.Close()
	if len(second.matches) != 0 {
		t.Fatal("interrupted match resurrected as a live actor")
	}
	result, err := second.repo.GetResult(ctx, "host-restart-match")
	if err != nil || !result.Void {
		t.Fatalf("interrupted match not voided on boot: %+v err=%v", result, err)
	}
	var payload struct {
		MatchID       string `json:"match_id"`
		Void          bool   `json:"void"`
		Reason        string `json:"reason"`
		AvailableTick uint32 `json:"available_tick"`
	}
	if err = json.Unmarshal(result.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.MatchID != "host-restart-match" || !payload.Void || payload.Reason != "host_restart" || payload.AvailableTick != 600 {
		t.Fatalf("void payload does not state the host restart: %+v", payload)
	}
	// No phantom live journal row remains for a later boot to reprocess.
	if n, err := second.repo.RecoverInterrupted(ctx, second.objects); err != nil || n != 0 {
		t.Fatalf("recovery not idempotent after boot: n=%d err=%v", n, err)
	}
	// The archived diagnostic is the latest checkpoint and still restores.
	diagnostic, err := second.objects.Get(ctx, "host-restart-match.diagnostic")
	if err != nil || string(diagnostic) != string(latest) {
		t.Fatalf("latest checkpoint not archived: err=%v", err)
	}
	if _, err = sim.Restore(second.catalog, diagnostic); err != nil {
		t.Fatal("archived checkpoint corrupt", err)
	}
	// The participant sees the voided host-restart state via history.
	h := httptest.NewServer(second)
	defer h.Close()
	req, err := http.NewRequest("GET", h.URL+"/api/v1/history", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("history status %d: %s", resp.StatusCode, body)
	}
	var history []storage.Result
	if err = json.Unmarshal(body, &history); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range history {
		if entry.ID == "host-restart-match" && entry.Void && string(entry.Payload) == string(result.Payload) {
			found = true
		}
	}
	if !found {
		t.Fatalf("participant history hides the host-restart void: %s", body)
	}
}
