package sim_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// This authored backend geometry uses normal New/Submit/Advance only. Opening
// funds are a declared Config choice; no engine resource or entity is injected.
func startingFundsMap() content.Map {
	m := content.Map{ID: "backend-custom-starting-funds", Title: "Custom opening funds backend geometry", Author: "backend acceptance fixture", Version: "1", FormatVersion: 1, Ruleset: "standard-v2", Width: 64, Height: 64,
		Spawns: []content.Spawn{{Position: sim.Vec{X: 8000, Y: 8000}}, {Position: sim.Vec{X: 56000, Y: 56000}}, {Position: sim.Vec{X: 8000, Y: 56000}}, {Position: sim.Vec{X: 56000, Y: 8000}}}, Shipment: sim.Vec{X: 32000, Y: 32000},
		Fields: []content.Field{{ID: 1, Position: sim.Vec{X: 14000, Y: 8000}, Credits: 36000000}, {ID: 2, Position: sim.Vec{X: 49000, Y: 56000}, Credits: 36000000}}}
	m.Tiles = make([]content.Tile, int(m.Width*m.Height))
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}
func startingFundsConfig() sim.Config {
	return sim.Config{Map: startingFundsMap(), Seed: 39525, Players: []sim.PlayerConfig{{ID: 1, Name: "Custom human", Faction: "US", Team: 1}, {ID: 2, Name: "Remote human", Faction: "IR", Team: 2}}}
}
func startingFundsView(t *testing.T, e *sim.Engine, owner sim.PlayerID) sim.View {
	t.Helper()
	v, ok := e.PlayerView(owner)
	if !ok {
		t.Fatal("owner view unavailable", owner)
	}
	return v
}
func startingFundsSave(t *testing.T, e *sim.Engine) []byte {
	t.Helper()
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func startingFundsArchive(t *testing.T, name string, data []byte) {
	t.Helper()
	root := os.Getenv("FRONTLINE_CUSTOM_STARTING_FUNDS_EVIDENCE")
	if root == "" {
		return
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, name), data, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestStartingFundsDefaultCompatibility(t *testing.T) {
	for _, ruleset := range []string{"", "standard-v2"} {
		cfg := startingFundsConfig()
		cfg.Ruleset = ruleset
		legacy := struct {
			Map content.Map `json:"map"`
			Players []sim.PlayerConfig `json:"players"`
			Seed uint64 `json:"seed"`
			Ruleset string `json:"ruleset"`
		}{cfg.Map, cfg.Players, cfg.Seed, cfg.Ruleset}
		actual, err := json.Marshal(cfg)
		if err != nil {
			t.Fatal(err)
		}
		old, err := json.Marshal(legacy)
		if err != nil || !bytes.Equal(actual, old) {
			t.Fatal("unused option changed the original Config serialization", ruleset, err)
		}
		e, err := sim.New(content.MustBase(), cfg)
		if err != nil {
			t.Fatal(err)
		}
		cfg.StartingCredits = sim.DefaultStartingCredits
		explicit, err := sim.New(content.MustBase(), cfg)
		if err != nil || explicit.Hash() != e.Hash() || !bytes.Equal(startingFundsSave(t, explicit), startingFundsSave(t, e)) {
			t.Fatal("explicit standard budget changed the opening state/hash", ruleset, err)
		}
		if bytes.Contains(startingFundsSave(t, e), []byte(`"starting_credits"`)) || e.StateCopy().StartingCredits != 0 {
			t.Fatal("default option must be omitted from saved state")
		}
		for _, owner := range []sim.PlayerID{1, 2} {
			v := startingFundsView(t, e, owner)
			if v.Countdown != 100 || v.Economy.Credits != 6000000 || v.Economy.Energy != 0 || v.Economy.PowerCapacity != 40 || v.Economy.Supply != 0 || v.Economy.ReservedSupply != 0 || v.Economy.Income != 0 {
				t.Fatal("standard resources changed", owner, v.Economy)
			}
		}
	}
	cfg := startingFundsConfig()
	cfg.Ruleset = "custom-v1"
	zero, err := sim.New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	cfg.StartingCredits = sim.DefaultStartingCredits
	explicit, err := sim.New(content.MustBase(), cfg)
	standard, standardErr := sim.New(content.MustBase(), startingFundsConfig())
	if err != nil || standardErr != nil || zero.Hash() != explicit.Hash() || zero.Hash() != standard.Hash() || zero.Metadata().Ruleset != "standard-v2" || zero.StateCopy().StartingCredits != 0 {
		t.Fatal("custom standard budget did not canonicalize to standard-v2", err, standardErr)
	}
}

func TestStartingFundsValidation(t *testing.T) {
	for _, amount := range []int64{-1000, 1, 999, 1001, 1500, sim.MaxStartingCredits + 1, sim.MaxStartingCredits + 1000, math.MaxInt64} {
		cfg := startingFundsConfig()
		cfg.Ruleset, cfg.StartingCredits = "custom-v1", amount
		if e, err := sim.New(content.MustBase(), cfg); err == nil || e != nil || !strings.HasPrefix(err.Error(), "invalid starting credits:") {
			t.Fatal("invalid internal amount admitted", amount, err)
		}
	}
	for _, ruleset := range []string{"", "standard-v2", "scenario-v2", "practice-v1", "tutorial", "ranked", "unknown"} {
		cfg := startingFundsConfig()
		cfg.Ruleset, cfg.StartingCredits = ruleset, 12000000
		if e, err := sim.New(content.MustBase(), cfg); err == nil || e != nil || err.Error() != "custom starting credits require custom-v1" {
			t.Fatal("noncustom ruleset admitted a custom opening", ruleset, err)
		}
	}
}

func TestStartingFundsEqualAllocations(t *testing.T) {
	for _, amount := range []int64{1000, 12000000, sim.MaxStartingCredits} {
		cfg := startingFundsConfig()
		cfg.Ruleset, cfg.StartingCredits = "custom-v1", amount
		cfg.Players = []sim.PlayerConfig{{ID: 3, Name: "Human Syrian ally", Faction: "SY", Team: 1}, {ID: 1, Name: "Human US ally", Faction: "US", Team: 1}, {ID: 4, Name: "Hard Saudi AI", Faction: "SA", Team: 2, AI: "hard"}, {ID: 2, Name: "Easy Iranian AI", Faction: "IR", Team: 2, AI: "easy"}}
		e, err := sim.New(content.MustBase(), cfg)
		if err != nil {
			t.Fatal(amount, err)
		}
		for _, pc := range cfg.Players {
			v := startingFundsView(t, e, pc.ID)
			if v.Economy.Credits != amount || v.Economy.Income != 0 || v.Economy.Energy != 0 || v.Economy.PowerCapacity != 40 || v.Economy.Supply != 0 || v.Economy.ReservedSupply != 0 {
				t.Fatal("unequal or hidden opening resources", amount, pc, v.Economy)
			}
			owned, headquarters, rigs := 0, 0, 0
			for _, actor := range v.Entities {
				if actor.Owner != pc.ID {
					continue
				}
				owned++
				if actor.Type == "hq" { headquarters++ }
				if actor.Type == pc.Faction+".rig" { rigs++ }
			}
			if owned != 2 || headquarters != 1 || rigs != 1 {
				t.Fatal("opening amount changed standard assets", pc, owned, headquarters, rigs)
			}
		}
		if e.StateCopy().StartingCredits != amount {
			t.Fatal("chosen opening not retained")
		}
		restored, err := sim.Restore(content.MustBase(), startingFundsSave(t, e))
		if err != nil || restored.Hash() != e.Hash() {
			t.Fatal("legal opening not restorable", amount, err)
		}
	}
}

func TestStartingFundsPrescribedBudgets(t *testing.T) {
	m := startingFundsMap()
	for _, mode := range []string{"campaign", "tutorial"} {
		definition := content.Mission{ID: "backend-prescribed-funds", Version: "1", Title: "Prescribed budget fixture", MapID: m.ID, Faction: "US", Mode: mode, DefaultBases: true,
			Players: []content.MissionPlayer{{ID: 1, Name: "Prescribed human", Faction: "US", Team: 1, Controller: "human", Credits: 4200000}, {ID: 2, Name: "Prescribed enemy", Faction: "IR", Team: 2, Controller: "script", Credits: 2700000}},
			Objectives: []content.MissionObjective{{ID: "survive", Text: "Authored timer", Condition: content.MissionCondition{Kind: "timer", Tick: 1000}}},
			Difficulty: []content.MissionDifficulty{{ID: "hard", EnemyCreditsMultiplier: 1200, WaveTimeMultiplier: 1000}}}
		if err := definition.Validate(content.MustBase(), m); err != nil {
			t.Fatal(err)
		}
		for _, practice := range []bool{false, true} {
			var e *sim.Engine
			var err error
			if practice {
				e, err = sim.NewPracticeMission(content.MustBase(), m, definition, "hard", 39525)
			} else {
				e, err = sim.NewMission(content.MustBase(), m, definition, "hard", 39525)
			}
			if err != nil {
				t.Fatal(mode, practice, err)
			}
			if e.StateCopy().StartingCredits != 0 || startingFundsView(t, e, 1).Economy.Credits != 4200000 || startingFundsView(t, e, 2).Economy.Credits != 3240000 {
				t.Fatal("prescribed or difficulty budget changed", mode, practice)
			}
			restarted, err := e.Restart()
			if err != nil || restarted.Hash() != e.Hash() {
				t.Fatal("prescribed restart changed", mode, practice, err)
			}
		}
	}
}

func TestStartingFundsSaveReplayRestart(t *testing.T) {
	cfg := startingFundsConfig()
	cfg.Ruleset, cfg.StartingCredits = "custom-v1", 12000000
	catalog := content.MustBase()
	e, err := sim.New(catalog, cfg)
	if err != nil { t.Fatal(err) }
	initialHash, initialSave := e.Hash(), startingFundsSave(t, e)
	replay, err := sim.NewReplay(e)
	if err != nil || !bytes.Equal(replay.Initial, initialSave) { t.Fatal("exact opening replay", err) }
	for e.Tick() < 100 { e.Advance() }
	var rig sim.ID
	for _, actor := range startingFundsView(t, e, 1).Entities {
		if actor.Owner == 1 && actor.Type == "US.rig" && actor.Private != nil { rig = actor.ID }
	}
	if rig == 0 { t.Fatal("normal owned rig unavailable") }
	order := sim.Order{Kind: "build", Entities: []sim.ID{rig}, Type: "power", Position: sim.Vec{X: 12000, Y: 12000}}
	if err = e.Submit(1, 1, []sim.Order{order}); err != nil { t.Fatal(err) }
	pendingSave, pendingHash := startingFundsSave(t, e), e.Hash()
	checkpointSave, err := replay.CaptureCheckpoint(e)
	if err != nil || !bytes.Equal(checkpointSave, pendingSave) || len(e.StateCopy().Pending) != 1 { t.Fatal("actual pending checkpoint", err) }
	twin, err := sim.Restore(catalog, pendingSave)
	if err != nil || twin.Hash() != pendingHash { t.Fatal("pending Restore", err) }
	e.Advance()
	twin.Advance()
	view := startingFundsView(t, e, 1)
	power, ok := catalog.Building("power")
	if !ok || len(view.Results) != 1 || !view.Results[0].Accepted || view.Results[0].Code != "ok" || view.Economy.Credits != cfg.StartingCredits-power.Cost || view.Economy.Income != 0 { t.Fatal("normal paid foundation", view.Results, view.Economy) }
	for {
		complete := false
		for _, actor := range startingFundsView(t, e, 1).Entities {
			if actor.Owner == 1 && actor.Type == "power" && actor.Complete { complete = true }
		}
		if complete { break }
		if e.Tick() >= 900 || e.Outcome().Finished { t.Fatal("normal paid power did not complete within fixed900ticks", e.Tick(), e.Outcome()) }
		e.Advance()
		twin.Advance()
		if e.Hash() != twin.Hash() { t.Fatal("pending custom-funds continuation diverged", e.Tick()) }
	}
	if e.Hash() != twin.Hash() || e.StateCopy().StartingCredits != cfg.StartingCredits || startingFundsView(t, e, 2).Economy.Credits != cfg.StartingCredits { t.Fatal("custom opening or paid continuation lost") }
	if err = replay.Capture(e, false); err != nil { t.Fatal(err) }
	encoded, err := replay.Encode()
	if err != nil { t.Fatal(err) }
	decoded, err := sim.DecodeReplay(encoded)
	if err != nil || len(decoded.Checkpoints) != 1 || decoded.Checkpoints[0].Tick != 100 { t.Fatal("encoded actual checkpoint", err) }
	checkpointStart, err := decoded.Open(catalog, 100)
	if err != nil || checkpointStart.Engine().Hash() != pendingHash { t.Fatal("checkpoint original pending state", err) }
	checkpointEnd, err := decoded.Open(catalog, e.Tick())
	if err != nil || checkpointEnd.Engine().Hash() != e.Hash() { t.Fatal("checkpoint continuation", err) }
	full := *decoded
	full.Checkpoints = nil
	fullEnd, err := full.Open(catalog, e.Tick())
	if err != nil || fullEnd.Engine().Hash() != e.Hash() { t.Fatal("full initial replay", err) }
	finalSave := startingFundsSave(t, e)
	final, err := sim.Restore(catalog, finalSave)
	if err != nil || final.Hash() != e.Hash() { t.Fatal("post-spend Restore", err) }
	before := final.Hash()
	restarted, err := final.Restart()
	if err != nil || restarted.Hash() != initialHash || final.Hash() != before || startingFundsView(t, restarted, 1).Economy.Credits != cfg.StartingCredits || startingFundsView(t, restarted, 2).Economy.Credits != cfg.StartingCredits { t.Fatal("restart did not restore equal chosen opening", err) }
	startingFundsArchive(t, "initial.save.json", initialSave)
	startingFundsArchive(t, "pending.save.json", pendingSave)
	startingFundsArchive(t, "final.save.json", finalSave)
	startingFundsArchive(t, "replay.json.gz", encoded)
	t.Logf("ordinary custom-funds persistence complete: opening=%d paid=%d midpoint=100 final=%d hash=%s", cfg.StartingCredits, power.Cost, e.Tick(), e.Hash())
}

// These are deliberately malformed serialized inputs to the save validator,
// never engine/resource mutations used to obtain a successful gameplay course.
func TestStartingFundsRejectsInvalidSavedConfiguration(t *testing.T) {
	cfg := startingFundsConfig()
	cfg.Ruleset, cfg.StartingCredits = "custom-v1", 12000000
	e, err := sim.New(content.MustBase(), cfg)
	if err != nil { t.Fatal(err) }
	type envelope struct {
		Version uint32 `json:"version"`
		SHA256 string `json:"sha256"`
		State json.RawMessage `json:"state"`
	}
	original := startingFundsSave(t, e)
	for _, tc := range []struct { amount int64; ruleset string }{{-1000, "custom-v1"}, {1500, "custom-v1"}, {sim.MaxStartingCredits+1000, "custom-v1"}, {sim.DefaultStartingCredits, "custom-v1"}, {12000000, "standard-v2"}, {12000000, "scenario-v2"}, {12000000, "practice-v1"}} {
		var env envelope
		if err := json.Unmarshal(original, &env); err != nil { t.Fatal(err) }
		var state map[string]json.RawMessage
		if err := json.Unmarshal(env.State, &state); err != nil { t.Fatal(err) }
		state["starting_credits"], _ = json.Marshal(tc.amount)
		var metadata map[string]json.RawMessage
		if err := json.Unmarshal(state["metadata"], &metadata); err != nil { t.Fatal(err) }
		metadata["ruleset"], _ = json.Marshal(tc.ruleset)
		state["metadata"], _ = json.Marshal(metadata)
		env.State, err = json.Marshal(state)
		if err != nil { t.Fatal(err) }
		sum := sha256.Sum256(env.State)
		env.SHA256 = hex.EncodeToString(sum[:])
		bad, err := json.Marshal(env)
		if err != nil { t.Fatal(err) }
		if restored, err := sim.Restore(content.MustBase(), bad); err == nil || restored != nil || err.Error() != "invalid saved starting credits" { t.Fatal("malformed saved opening admitted", tc, err) }
	}
	if !bytes.Equal(original, startingFundsSave(t, e)) { t.Fatal("negative-input checks changed active source state") }
}
