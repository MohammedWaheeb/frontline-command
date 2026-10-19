package sim

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/content"
)

// Stress agent F: full-replay fidelity and mid-game save->continue equivalence
// across whole bot games, plus a bot-game surrender path. Gated by STRESS=1
// because each case simulates a complete match (up to the 90-minute game-time
// safety bound) two or three times (live, restored branch, replay playback).

type agentFCase struct {
	ID       string
	Map      string
	Factions []string
	AIs      []string
	Seed     uint64
	Restore  bool // also branch at tick 6000 via Save+Restore
}

func agentFCases() []agentFCase {
	return []agentFCase{
		{ID: "replay-2p-normal-copper", Map: "copper-junction", Factions: []string{"US", "IR"}, AIs: []string{"normal", "normal"}, Seed: 91001, Restore: true},
		{ID: "replay-2p-hard-relay", Map: "relay-heights", Factions: []string{"IR", "SY"}, AIs: []string{"hard", "hard"}, Seed: 91002, Restore: true},
		{ID: "replay-2p-hard-dryriver", Map: "dry-river", Factions: []string{"US", "SA"}, AIs: []string{"hard", "normal"}, Seed: 91003, Restore: true},
		{ID: "replay-3p-normal-industrial", Map: "industrial-valley", Factions: []string{"US", "IR", "SY"}, AIs: []string{"normal", "normal", "normal"}, Seed: 91004, Restore: true},
		{ID: "replay-4p-hard-border", Map: "border-depots", Factions: []string{"US", "IR", "SY", "SA"}, AIs: []string{"hard", "hard", "hard", "hard"}, Seed: 91005},
		{ID: "replay-2p-mixed-port", Map: "port-outskirts", Factions: []string{"SA", "SY"}, AIs: []string{"hard", "normal"}, Seed: 91006},
	}
}

const agentFRestoreTick = Tick(6000) // 300 game seconds at 20 ticks/s

func agentFEngine(t *testing.T, spec agentFCase) *Engine {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", spec.Map+".json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	if battlefield.ID != spec.Map {
		t.Fatalf("wrong map: %q", battlefield.ID)
	}
	if len(spec.Factions) > len(battlefield.Spawns) {
		t.Fatalf("map %s has %d spawns, need %d", spec.Map, len(battlefield.Spawns), len(spec.Factions))
	}
	cfg := Config{Map: battlefield, Seed: spec.Seed, Ruleset: "standard-v2"}
	for i, faction := range spec.Factions {
		cfg.Players = append(cfg.Players, PlayerConfig{
			ID:      PlayerID(i + 1),
			Name:    fmt.Sprintf("%s %s bot %d", faction, spec.AIs[i], i+1),
			Faction: faction,
			Team:    uint32(i + 1),
			AI:      spec.AIs[i],
		})
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestStressReplay(t *testing.T) {
	if os.Getenv("STRESS") != "1" {
		t.Skip("STRESS=1 not set")
	}
	catalog := content.MustBase()
	for _, spec := range agentFCases() {
		t.Run(spec.ID, func(t *testing.T) { runAgentFGame(t, catalog, spec) })
	}
	t.Run("surrender-bot-game", runAgentFSurrender)
}

func runAgentFGame(t *testing.T, catalog *content.Catalog, spec agentFCase) {
	e := agentFEngine(t, spec)
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}

	var restored *Engine
	var restoreAtHash string
	restoreTick := Tick(0)

	// Live run to finish, capturing the replay every 30 game seconds exactly
	// as authored_skirmish_acceptance_test.go does. The restored branch, once
	// created at the mid tick, advances in lockstep alongside the original.
	for !e.Outcome().Finished && e.Tick() < seconds(90*60)+100 {
		e.Advance()
		if restored != nil && !restored.Outcome().Finished {
			restored.Advance()
		}
		if spec.Restore && restored == nil && e.Tick() >= agentFRestoreTick {
			if e.Outcome().Finished {
				t.Fatalf("%s: game already finished at restore tick %d (outcome %+v); no mid-game state to branch", spec.ID, e.Tick(), e.Outcome())
			}
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err = Restore(catalog, save)
			if err != nil {
				t.Fatal(err)
			}
			restoreTick = e.Tick()
			restoreAtHash = e.Hash()
			if restored.Hash() != restoreAtHash {
				t.Fatalf("%s: restore hash mismatch at tick %d: live %s restored %s", spec.ID, restoreTick, restoreAtHash, restored.Hash())
			}
			if restored.Tick() != restoreTick {
				t.Fatalf("%s: restored tick %d != live tick %d", spec.ID, restored.Tick(), restoreTick)
			}
			t.Logf("%s RESTORE-BRANCH map=%s factions=%v ais=%v seed=%d players=%d tick=%d hash=%s (immediate restore exact)", spec.ID, spec.Map, spec.Factions, spec.AIs, spec.Seed, len(spec.Factions), restoreTick, restoreAtHash)
		}
		if e.Tick()%seconds(30) == 0 {
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}

	liveHash := e.Hash()
	liveOutcome := e.Outcome()
	liveTick := e.Tick()
	if !liveOutcome.Finished {
		t.Fatalf("%s: live game did not finish before safety bound: tick=%d outcome=%+v hash=%s", spec.ID, liveTick, liveOutcome, liveHash)
	}

	// (2) Mid-game save->continue equivalence.
	restoreVerdict := "not-requested"
	if spec.Restore {
		if restored == nil {
			t.Fatalf("%s: restore branch never created (live tick=%d)", spec.ID, liveTick)
		}
		// Drain the restored branch if it somehow lags the original.
		for !restored.Outcome().Finished && restored.Tick() < seconds(90*60)+100 {
			restored.Advance()
		}
		if restored.Hash() != liveHash || restored.Outcome() != liveOutcome || restored.Tick() != liveTick {
			t.Fatalf("%s RESTORE MISMATCH map=%s factions=%v ais=%v seed=%d restoreTick=%d restoreAtHash=%s liveTick=%d liveHash=%s liveOutcome=%+v restoredTick=%d restoredHash=%s restoredOutcome=%+v",
				spec.ID, spec.Map, spec.Factions, spec.AIs, spec.Seed, restoreTick, restoreAtHash, liveTick, liveHash, liveOutcome, restored.Tick(), restored.Hash(), restored.Outcome())
		}
		restoreVerdict = fmt.Sprintf("exact (branch tick=%d, final tick=%d)", restoreTick, liveTick)
	}

	// (1) Full replay fidelity, following the authored acceptance flow:
	// final Capture, Encode, DecodeReplay, drop checkpoints, Open at 0,
	// Advance the player to the finish.
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	packed, err := recorder.Encode()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeReplay(packed)
	if err != nil {
		t.Fatal(err)
	}
	decoded.Checkpoints = nil
	player, err := decoded.Open(catalog, 0)
	if err != nil {
		t.Fatal(err)
	}
	for !player.Finished() {
		if err := player.Advance(); err != nil {
			t.Fatalf("%s: replay advance failed at replay tick %d: %v (live tick=%d hash=%s)", spec.ID, player.Engine().Tick(), err, liveTick, liveHash)
		}
	}
	replayHash := player.Engine().Hash()
	replayOutcome := player.Engine().Outcome()
	if replayHash != liveHash || replayOutcome != liveOutcome || player.Engine().Tick() != liveTick {
		t.Fatalf("%s REPLAY MISMATCH map=%s factions=%v ais=%v seed=%d players=%d liveTick=%d liveHash=%s liveOutcome=%+v replayTick=%d replayHash=%s replayOutcome=%+v replayBytes=%d",
			spec.ID, spec.Map, spec.Factions, spec.AIs, spec.Seed, len(spec.Factions), liveTick, liveHash, liveOutcome, player.Engine().Tick(), replayHash, replayOutcome, len(packed))
	}
	t.Logf("%s VERDICT map=%s factions=%v ais=%v seed=%d players=%d finalTick=%d outcome=%+v hash=%s replay=exact replayBytes=%d restore=%s",
		spec.ID, spec.Map, spec.Factions, spec.AIs, spec.Seed, len(spec.Factions), liveTick, liveOutcome, liveHash, len(packed), restoreVerdict)
}

// (3) Surrender/defeat: Order{Kind:"surrender"} is a public Submit order kind
// (pkg/sim/orders.go orderKinds, executed in executeSelected via e.defeat).
// Submit accepts AI-controlled players (only "script" controllers and
// defeated/finished states are rejected), so a bot in a bot game can be
// driven to surrender through the same public API a human client uses.
func runAgentFSurrender(t *testing.T) {
	spec := agentFCase{ID: "surrender-bot-game", Map: "copper-junction", Factions: []string{"US", "IR"}, AIs: []string{"normal", "normal"}, Seed: 91007}
	e := agentFEngine(t, spec)
	// Wait out the standard countdown (Submit rejects while Countdown > 0).
	for e.Tick() < 200 && !e.Outcome().Finished {
		e.Advance()
	}
	if e.Outcome().Finished {
		t.Fatalf("game finished before surrender could be submitted: %+v", e.Outcome())
	}
	p1 := e.player(1)
	if p1 == nil || p1.Defeated {
		t.Fatalf("player 1 unavailable/defeated before surrender: %+v", p1)
	}
	if err := e.Submit(1, p1.LastSequence+1, []Order{{Kind: "surrender"}}); err != nil {
		t.Fatalf("surrender Submit rejected for bot player: %v", err)
	}
	e.Advance() // executes the scheduled surrender order
	accepted := false
	for _, r := range e.state.Results {
		if r.Player == 1 {
			accepted = r.Accepted
			if !r.Accepted {
				t.Fatalf("surrender order not accepted: %+v", r)
			}
		}
	}
	if !accepted {
		t.Fatalf("no result receipt for surrender order: %+v", e.state.Results)
	}
	if !e.player(1).Defeated {
		t.Fatal("player 1 not defeated after surrender")
	}
	if e.player(2).Defeated {
		t.Fatal("player 2 wrongly defeated by player 1 surrender")
	}
	out := e.Outcome()
	if !out.Finished || out.WinningTeam != 2 {
		t.Fatalf("2-player surrender did not end match for team 2: %+v (tick %d)", out, e.Tick())
	}
	t.Logf("surrender-bot-game VERDICT map=%s seed=%d tick=%d outcome=%+v hash=%s player1Defeated=true player2Defeated=false surrenderSubmit=accepted",
		spec.Map, spec.Seed, e.Tick(), out, e.Hash())
}
