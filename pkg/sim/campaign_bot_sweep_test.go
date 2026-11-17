package sim_test

// Randomized bot sweep over the authored campaign. These tests complement
// the scripted authored playthroughs (which prove every mission can be
// won): here, fog-honest bots with different personalities and random
// seeds must be able to load, play, save/restore and make progress on
// every campaign mission without errors. Generic bots are not required
// to win scripted objectives; wins and losses are reported as evidence.

import (
	"runtime"
	"testing"

	"frontlinecommand/internal/botsweep"
	"frontlinecommand/pkg/sim"
)

const botSweepContent = "../../content"

func botSweepConfig(mission, difficulty, bot string, seed uint64, ticks sim.Tick) botsweep.Config {
	return botsweep.Config{
		ContentDir:       botSweepContent,
		MissionID:        mission,
		Difficulty:       difficulty,
		Bot:              bot,
		Seed:             19027 + seed*7919,
		BotSeed:          19027 + seed*104729,
		MaxTicks:         ticks,
		DecisionInterval: 20,
		CheckSaveRestore: true,
	}
}

func requirePlayable(t *testing.T, results []botsweep.Result) {
	t.Helper()
	for _, r := range results {
		t.Logf("BOTSWEEP %s faction=%s difficulty=%s bot=%s botseed=%d verdict=%s ticks=%d wallms=%d obj=%d/%d progress=%d orders=%d/%d owned=%d->%d hostile=%d->%d hash=%s",
			r.Mission, r.Faction, r.Difficulty, r.Bot, r.BotSeed, r.Verdict, r.Ticks, r.WallMS,
			r.ObjectivesComplete, r.ObjectivesTotal, r.ObjectiveProgress, r.OrdersAccepted, r.OrdersIssued,
			r.StartOwned, r.EndOwned, r.StartHostile, r.EndHostile, r.FinalHash)
		if r.Verdict == botsweep.VerdictError {
			t.Errorf("%s/%s/%s seed %d: %s", r.Mission, r.Difficulty, r.Bot, r.BotSeed, r.Error)
			continue
		}
		if !r.SaveRestoreChecked {
			t.Errorf("%s/%s/%s: save/restore check was not performed", r.Mission, r.Difficulty, r.Bot)
		}
		if !r.SaveRestoreOK {
			t.Errorf("%s/%s/%s: save/restore mismatch", r.Mission, r.Difficulty, r.Bot)
		}
		if r.FinalHash == "" || r.FinalHash == r.InitialHash {
			t.Errorf("%s/%s/%s: simulation state never changed", r.Mission, r.Difficulty, r.Bot)
		}
		// The idle baseline is allowed to stall on missions that wait for
		// player input; every active bot must make observable progress.
		if r.Bot != "idle" && r.Verdict == botsweep.VerdictTimeoutStalled {
			t.Errorf("%s/%s/%s seed %d: active bot made no progress in %d ticks", r.Mission, r.Difficulty, r.Bot, r.BotSeed, r.Ticks)
		}
	}
}

// TestCampaignBotSweepSmoke covers one opening mission per faction with an
// active competent bot and the random fuzzer. It runs in -short mode.
func TestCampaignBotSweepSmoke(t *testing.T) {
	var configs []botsweep.Config
	for _, mission := range []string{
		"us-01-first-foothold", "ir-01-forward-signal",
		"sy-01-workshop-foothold", "sa-01-arrival-point",
	} {
		for _, bot := range []string{"objective", "random"} {
			configs = append(configs, botSweepConfig(mission, "normal", bot, 1, 3000))
		}
	}
	results, err := botsweep.RunAll(configs, runtime.NumCPU(), nil)
	if err != nil {
		t.Fatal(err)
	}
	requirePlayable(t, results)
}

// A run that finishes before the midpoint must still perform an actual
// save/restore check; SaveRestoreOK must never be vacuously true.
func TestCampaignBotSaveRestoreCheckedBeforeMidpoint(t *testing.T) {
	cfg := botsweep.Config{
		ContentDir:       botSweepContent,
		MissionID:        "us-03-relay-ridge",
		Difficulty:       "normal",
		Bot:              "rusher",
		Seed:             19027,
		BotSeed:          19439,
		MaxTicks:         18000,
		DecisionInterval: 20,
		CheckSaveRestore: true,
	}
	results, err := botsweep.RunAll([]botsweep.Config{cfg}, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	r := results[0]
	if r.Ticks >= cfg.MaxTicks/2 {
		t.Fatalf("fixture no longer finishes before midpoint: ticks=%d verdict=%s", r.Ticks, r.Verdict)
	}
	if !r.SaveRestoreChecked || !r.SaveRestoreOK {
		t.Fatalf("early-finishing run was not actually save/restore checked: %+v", r)
	}
}

// TestCampaignBotDeterminism: identical mission, bot and seeds must replay
// to the identical hash, tick and outcome.
func TestCampaignBotDeterminism(t *testing.T) {
	cfg := botSweepConfig("us-01-first-foothold", "normal", "objective", 7, 3000)
	results, err := botsweep.RunAll([]botsweep.Config{cfg, cfg}, 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	requirePlayable(t, results)
	if results[0].FinalHash != results[1].FinalHash || results[0].Ticks != results[1].Ticks ||
		results[0].Outcome != results[1].Outcome {
		t.Fatalf("identical bot runs diverged: %+v vs %+v", results[0], results[1])
	}
}

// TestCampaignBotSweepAll plays every campaign mission (all four factions)
// with every bot personality at several random seeds. Difficulty rotates
// easy/normal/hard across the matrix. Run without -short, e.g.:
//
//	go test ./pkg/sim/ -run TestCampaignBotSweepAll -count=1 -timeout 60m -v
func TestCampaignBotSweepAll(t *testing.T) {
	if testing.Short() {
		t.Skip("full randomized campaign bot sweep; run without -short")
	}
	refs, err := botsweep.CampaignMissions(botSweepContent)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 24 {
		t.Fatalf("expected 24 campaign missions, got %d", len(refs))
	}
	difficulties := []string{"easy", "normal", "hard"}
	var configs []botsweep.Config
	for _, ref := range refs {
		for _, bot := range botsweep.Names() {
			for seed := uint64(1); seed <= 2; seed++ {
				cfg := botSweepConfig(ref.ID, difficulties[len(configs)%len(difficulties)], bot, seed, 8000)
				configs = append(configs, cfg)
			}
		}
	}
	results, err := botsweep.RunAll(configs, runtime.NumCPU(), nil)
	if err != nil {
		t.Fatal(err)
	}
	requirePlayable(t, results)

	// Every mission must be playable under the competent bot for some
	// seed: a win, an in-progress timeout, or a fought loss all prove the
	// mission loads, accepts orders and resolves combat. Only errors and
	// no-progress stalls fail this check.
	progressByMission := map[string]bool{}
	for _, r := range results {
		if r.Bot == "objective" && r.Progress {
			progressByMission[r.Mission] = true
		}
	}
	for _, ref := range refs {
		if !progressByMission[ref.ID] {
			t.Errorf("objective bot never progressed on %s (%s)", ref.ID, ref.Faction)
		}
	}
}
