package sim

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

type authoredSkirmishCase struct {
	ID       string   `json:"id"`
	Map      string   `json:"map"`
	Factions []string `json:"factions"`
	Teams    bool     `json:"authored_spawn_teams"`
	Seed     uint64   `json:"seed"`
}

func authoredSkirmishCases() []authoredSkirmishCase {
	return []authoredSkirmishCase{
		{"pair-US-IR", "copper-junction", []string{"US", "IR"}, false, 28001},
		{"pair-US-SY", "relay-heights", []string{"SY", "US"}, false, 28002},
		{"pair-US-SA", "dry-river", []string{"US", "SA"}, false, 28003},
		{"pair-IR-SY", "industrial-valley", []string{"SY", "IR"}, false, 28004},
		{"pair-IR-SA", "border-depots", []string{"IR", "SA"}, false, 28005},
		{"pair-SY-SA", "port-outskirts", []string{"SA", "SY"}, false, 28006},
		{"mirror-US", "copper-junction", []string{"US", "US"}, false, 28007},
		{"mirror-IR", "relay-heights", []string{"IR", "IR"}, false, 28008},
		{"mirror-SY", "dry-river", []string{"SY", "SY"}, false, 28009},
		{"mirror-SA", "border-depots", []string{"SA", "SA"}, false, 28010},
		{"three-ffa", "industrial-valley", []string{"US", "IR", "SY"}, false, 28011},
		{"four-ffa", "border-depots", []string{"US", "IR", "SY", "SA"}, false, 28012},
		{"four-team", "port-outskirts", []string{"US", "IR", "SY", "SA"}, true, 28013},
	}
}

type authoredAIPlayerSample struct {
	Player         PlayerID       `json:"player"`
	Credits        int64          `json:"credits"`
	Income         int64          `json:"income"`
	Spent          int64          `json:"spent"`
	Supply         int32          `json:"supply"`
	ReservedSupply int32          `json:"reserved_supply"`
	PowerCapacity  int32          `json:"power_capacity"`
	PowerDemand    int32          `json:"power_demand"`
	Tier           int32          `json:"tier"`
	Defeated       bool           `json:"defeated"`
	Intent         string         `json:"intent"`
	Goal           Vec            `json:"goal"`
	Actors         map[string]int `json:"living_actors"`
}
type authoredAISample struct {
	Tick    Tick                     `json:"tick"`
	Players []authoredAIPlayerSample `json:"players"`
}
type authoredAIOrderCounts struct {
	Executed uint64            `json:"executed"`
	Accepted uint64            `json:"accepted"`
	Rejected map[string]uint64 `json:"rejected_by_code"`
	Kinds    map[string]uint64 `json:"executed_by_kind"`
}
type authoredAIResult struct {
	Case               authoredSkirmishCase                `json:"case"`
	Metadata           Metadata                            `json:"metadata"`
	MapSHA256          string                              `json:"map_sha256"`
	MapBytes           int                                 `json:"map_bytes"`
	Go                 string                              `json:"go"`
	ExecutableSHA256   string                              `json:"executable_sha256,omitempty"`
	Started            string                              `json:"started"`
	WallSeconds        float64                             `json:"wall_seconds"`
	Conditions         string                              `json:"conditions"`
	Tick               Tick                                `json:"tick"`
	Outcome            Outcome                             `json:"outcome"`
	OrdinaryCompletion bool                                `json:"ordinary_completion"`
	FirstCombat        Tick                                `json:"first_weapon_tick"`
	Hash               string                              `json:"final_hash"`
	InitialRestore     bool                                `json:"initial_restore_exact"`
	FinalRestore       bool                                `json:"final_restore_exact"`
	FullReplay         bool                                `json:"full_replay_exact"`
	ReplayBytes        int                                 `json:"replay_bytes"`
	Counts             map[PlayerID]*authoredAIOrderCounts `json:"orders"`
	Samples            []authoredAISample                  `json:"minute_samples"`
	Debrief            *Debrief                            `json:"debrief"`
	Issues             []string                            `json:"issues"`
}

func authoredAISnapshot(e *Engine) authoredAISample {
	sample := authoredAISample{Tick: e.Tick()}
	for _, p := range e.state.Players {
		row := authoredAIPlayerSample{Player: p.ID, Credits: p.Credits, Income: p.Income, Spent: p.Spent, Supply: p.Supply, ReservedSupply: p.ReservedSupply, PowerCapacity: p.PowerCapacity, PowerDemand: p.PowerDemand, Tier: p.Tier, Defeated: p.Defeated, Intent: p.AIIntent, Goal: p.AIGoal, Actors: map[string]int{}}
		for _, actor := range e.state.Entities {
			if actor.Owner == p.ID && actor.HP > 0 {
				row.Actors[actor.Type]++
			}
		}
		sample.Players = append(sample.Players, row)
	}
	return sample
}
func authoredAIWrite(t *testing.T, dir, name string, data []byte) {
	t.Helper()
	if dir == "" {
		return
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0600); err != nil {
		t.Fatal(err)
	}
}

// The opt-in gate keeps thirteen whole games out of unrelated unit/race runs.
// This is observation of ordinary Go AI: no external commands, grants, force
// damage, starting-state edits, or modified map geometry/resources are applied.
func TestAuthoredSkirmishAcceptance(t *testing.T) {
	if testing.Short() || os.Getenv("FRONTLINE_AUTHORED_AI") != "1" {
		t.Skip("opt-in complete authored-map AI matches")
	}
	for _, spec := range authoredSkirmishCases() {
		t.Run(spec.ID, func(t *testing.T) { runAuthoredSkirmish(t, spec) })
	}
}
func runAuthoredSkirmish(t *testing.T, spec authoredSkirmishCase) {
	started := time.Now()
	catalog := content.MustBase()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", spec.Map+".json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	if battlefield.ID != spec.Map {
		t.Fatal("wrong authored map")
	}
	digest := sha256.Sum256(data)
	indexBytes, err := os.ReadFile(filepath.Join("..", "..", "content", "index.json"))
	if err != nil {
		t.Fatal(err)
	}
	var index struct {
		Maps []struct {
			ID     string `json:"id"`
			Kind   string `json:"kind"`
			SHA256 string `json:"sha256"`
			Bytes  int    `json:"bytes"`
		} `json:"maps"`
	}
	if err = json.Unmarshal(indexBytes, &index); err != nil {
		t.Fatal(err)
	}
	indexed := false
	for _, entry := range index.Maps {
		if entry.ID == spec.Map {
			indexed = entry.Kind == "skirmish" && entry.SHA256 == hex.EncodeToString(digest[:]) && entry.Bytes == len(data)
		}
	}
	if !indexed {
		t.Fatal("authored map does not match installed launch index bytes/hash")
	}
	cfg := Config{Map: battlefield, Seed: spec.Seed, Ruleset: "standard-v2"}
	for i, faction := range spec.Factions {
		team := uint32(i + 1)
		if spec.Teams {
			team = battlefield.Spawns[i].Team
			if team == 0 {
				t.Fatal("team game needs authored spawn teams")
			}
		}
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(i + 1), Name: fmt.Sprintf("%s normal bot %d", faction, i+1), Faction: faction, Team: team, AI: "normal"})
	}
	e, err := New(catalog, cfg)
	if err != nil {
		t.Fatal(err)
	}
	result := authoredAIResult{Case: spec, Metadata: e.Metadata(), MapSHA256: hex.EncodeToString(digest[:]), MapBytes: len(data), Go: runtime.Version(), Started: started.UTC().Format(time.RFC3339Nano), Conditions: "Native deterministic functional acceptance on a shared busy development host; wall duration is not performance or reference-device evidence.", Counts: map[PlayerID]*authoredAIOrderCounts{}}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	executableBytes, err := os.ReadFile(executable)
	if err != nil {
		t.Fatal(err)
	}
	executableDigest := sha256.Sum256(executableBytes)
	result.ExecutableSHA256 = hex.EncodeToString(executableDigest[:])
	executableBytes = nil
	dir := ""
	if root := os.Getenv("FRONTLINE_AUTHORED_AI_EVIDENCE"); root != "" {
		dir = filepath.Join(root, spec.ID)
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	for _, p := range e.state.Players {
		if p.Credits != 6000000 || p.AI != "normal" || p.Supply != 0 {
			t.Fatal("nonstandard starting economy")
		}
		result.Counts[p.ID] = &authoredAIOrderCounts{Rejected: map[string]uint64{}, Kinds: map[string]uint64{}}
	}
	if e.Tick() != 0 || e.state.Countdown != 100 {
		t.Fatal("standard countdown bypassed")
	}
	initial, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(catalog, initial)
	if err != nil {
		t.Fatal(err)
	}
	result.InitialRestore = restored.Hash() == e.Hash()
	if !result.InitialRestore {
		t.Fatal("initial restore mismatch")
	}
	restored = nil
	authoredAIWrite(t, dir, "initial.save.json", initial)
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	var destination io.Writer = io.Discard
	var traceFile *os.File
	if dir != "" {
		traceFile, err = os.Create(filepath.Join(dir, "commands.jsonl.gz"))
		if err != nil {
			t.Fatal(err)
		}
		defer traceFile.Close()
		destination = traceFile
	}
	compressed := gzip.NewWriter(destination)
	defer compressed.Close()
	trace := json.NewEncoder(compressed)
	cursor := e.state.LogBase + uint64(len(e.state.Log))
	result.Samples = append(result.Samples, authoredAISnapshot(e))
	for e.Tick() < seconds(90*60)+100 && !e.Outcome().Finished {
		e.Advance()
		if result.FirstCombat == 0 {
			for _, event := range e.state.Events {
				if event.Kind == "weapon_fired" {
					result.FirstCombat = e.Tick()
					break
				}
			}
		}
		end := e.state.LogBase + uint64(len(e.state.Log))
		if cursor < e.state.LogBase {
			t.Fatal("trace missed bounded log window")
		}
		if end > cursor {
			batches := e.state.Log[cursor-e.state.LogBase:]
			if err := trace.Encode(struct {
				Tick    Tick          `json:"tick"`
				Batches []Scheduled   `json:"executed_batches"`
				Results []OrderResult `json:"results"`
			}{e.Tick(), batches, e.state.Results}); err != nil {
				t.Fatal(err)
			}
			for _, batch := range batches {
				counts := result.Counts[batch.Player]
				for _, order := range batch.Orders {
					counts.Kinds[order.Kind]++
				}
			}
			cursor = end
		}
		for _, receipt := range e.state.Results {
			counts := result.Counts[receipt.Player]
			counts.Executed++
			if receipt.Accepted {
				counts.Accepted++
			} else {
				counts.Rejected[receipt.Code]++
			}
		}
		for _, p := range e.state.Players {
			if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
				result.Issues = append(result.Issues, fmt.Sprintf("economic invariant tick%d player%d credits%d supply%d reserved%d", e.Tick(), p.ID, p.Credits, p.Supply, p.ReservedSupply))
			}
		}
		if e.Tick()%seconds(60) == 0 {
			result.Samples = append(result.Samples, authoredAISnapshot(e))
			t.Logf("%s minute%d actors%d", spec.ID, e.Tick()/1200, len(e.state.Entities))
		}
		if e.Tick()%seconds(30) == 0 {
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
		if len(result.Issues) > 0 {
			break
		}
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	if traceFile != nil {
		if err := traceFile.Close(); err != nil {
			t.Fatal(err)
		}
	}
	result.Samples = append(result.Samples, authoredAISnapshot(e))
	result.Tick = e.Tick()
	result.Outcome = e.Outcome()
	result.OrdinaryCompletion = e.Outcome().Finished && e.Outcome().Reason != "time_limit"
	result.Hash = e.Hash()
	result.Debrief = e.Debrief()
	final, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "final.save.json", final)
	restored, err = Restore(catalog, final)
	if err != nil {
		result.Issues = append(result.Issues, "final restore: "+err.Error())
	} else {
		result.FinalRestore = restored.Hash() == result.Hash
	}
	restored = nil
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	packed, err := recorder.Encode()
	if err != nil {
		t.Fatal(err)
	}
	result.ReplayBytes = len(packed)
	authoredAIWrite(t, dir, "replay.fcr", packed)
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
			result.Issues = append(result.Issues, "full replay: "+err.Error())
			break
		}
	}
	result.FullReplay = player.Engine().Hash() == result.Hash
	if !result.OrdinaryCompletion {
		result.Issues = append(result.Issues, "did not reach ordinary match completion before the90minute safety bound")
	}
	if !result.FinalRestore || !result.FullReplay {
		result.Issues = append(result.Issues, "save or full replay hash mismatch")
	}
	for _, p := range e.state.Players {
		if p.Income <= 0 || p.Spent <= 0 || result.Counts[p.ID].Accepted == 0 {
			result.Issues = append(result.Issues, fmt.Sprintf("player%d made no ordinary paid economic/command progress", p.ID))
		}
	}
	result.WallSeconds = time.Since(started).Seconds()
	report, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "result.json", append(report, '\n'))
	t.Logf("%s map=%s tick=%d outcome=%+v hash=%s fullReplay=%v issues=%v", spec.ID, spec.Map, result.Tick, result.Outcome, result.Hash, result.FullReplay, result.Issues)
	if len(result.Issues) > 0 {
		t.Error(result.Issues)
	}
}

// Read-only diagnosis of captured execution rejections. These three snapshots
// bracket ordinary AI planning/movement and execution; they do not replay the
// internal planner at a fabricated tick or feed hidden state into decisions.
func TestAuthoredSkirmishRejectionContext(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AUTHORED_AI_INSPECT")
	if dir == "" {
		t.Skip("opt-in recorded replay investigation")
	}
	traceFile, err := os.Open(filepath.Join(dir, "commands.jsonl.gz"))
	if err != nil {
		t.Fatal(err)
	}
	defer traceFile.Close()
	zipped, err := gzip.NewReader(traceFile)
	if err != nil {
		t.Fatal(err)
	}
	defer zipped.Close()
	decoder := json.NewDecoder(io.LimitReader(zipped, 128<<20))
	type rejectedOrder struct {
		Receipt OrderResult `json:"receipt"`
		Order   Order       `json:"order"`
	}
	rejected := []rejectedOrder{}
	for {
		var tick struct {
			Batches []Scheduled   `json:"executed_batches"`
			Results []OrderResult `json:"results"`
		}
		if err := decoder.Decode(&tick); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		for _, receipt := range tick.Results {
			if receipt.Accepted {
				continue
			}
			for _, batch := range tick.Batches {
				if batch.Player == receipt.Player && batch.Sequence == receipt.Sequence {
					rejected = append(rejected, rejectedOrder{receipt, batch.Orders[receipt.Index]})
				}
			}
		}
	}
	if len(rejected) > 256 {
		t.Fatal("select a smaller rejection record before broad diagnosis")
	}
	type context struct {
		Rejection      rejectedOrder   `json:"rejection"`
		Stage          string          `json:"stage"`
		Tick           Tick            `json:"snapshot_tick"`
		Players        []PlayerSummary `json:"public_players"`
		Sources        []EntityView    `json:"owned_sources"`
		VisibleSources []EntityView    `json:"authorized_sources"`
		Nearby         []EntityView    `json:"authorized_build_neighborhood,omitempty"`
		Events         []Event         `json:"authorized_relevant_events,omitempty"`
		Target         *EntityView     `json:"authorized_target,omitempty"`
		Station        *StationView    `json:"authorized_station,omitempty"`
		Armor          string          `json:"public_catalog_armor,omitempty"`
		CenterDistance int32           `json:"center_distance,omitempty"`
	}
	wanted := map[Tick][]context{}
	for _, entry := range rejected {
		for delta, stage := range map[Tick]string{2: "before_decision_tick", 1: "after_decision_tick", 0: "execution_tick"} {
			tick := entry.Receipt.Tick - delta
			wanted[tick] = append(wanted[tick], context{Rejection: entry, Stage: stage, Tick: tick})
		}
	}
	replayBytes, err := os.ReadFile(filepath.Join(dir, "replay.fcr"))
	if err != nil {
		t.Fatal(err)
	}
	replay, err := DecodeReplay(replayBytes)
	if err != nil {
		t.Fatal(err)
	}
	replay.Checkpoints = nil
	player, err := replay.Open(content.MustBase(), 0)
	if err != nil {
		t.Fatal(err)
	}
	contexts := []context{}
	inspectTicks := map[Tick]bool{}
	for _, raw := range strings.Split(os.Getenv("FRONTLINE_AUTHORED_AI_SNAPSHOT_TICKS"), ",") {
		if raw == "" {
			continue
		}
		tick, err := strconv.ParseUint(raw, 10, 32)
		if err != nil || Tick(tick) > replay.FinalTick {
			t.Fatal("invalid diagnostic tick", raw)
		}
		inspectTicks[Tick(tick)] = true
	}
	weapons := map[Tick]map[PlayerID]uint64{}
	for {
		e := player.Engine()
		for _, event := range e.state.Events {
			if event.Kind == "weapon_fired" {
				minute := e.Tick() / seconds(60)
				if weapons[minute] == nil {
					weapons[minute] = map[PlayerID]uint64{}
				}
				weapons[minute][event.Owner]++
			}
		}
		if inspectTicks[e.Tick()] {
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			authoredAIWrite(t, dir, fmt.Sprintf("diagnostic-%d.save.json", e.Tick()), saved)
			for _, owner := range e.state.Players {
				view, _ := e.PlayerView(owner.ID)
				data, err := json.MarshalIndent(view, "", "  ")
				if err != nil {
					t.Fatal(err)
				}
				authoredAIWrite(t, dir, fmt.Sprintf("diagnostic-%d-player-%d.view.json", e.Tick(), owner.ID), data)
			}
		}
		for _, entry := range wanted[e.Tick()] {
			view, ok := e.PlayerView(entry.Rejection.Receipt.Player)
			if !ok {
				t.Fatal("recorded player missing")
			}
			entry.Players = view.Players
			for _, actor := range view.Entities {
				if entry.Rejection.Order.Kind == "build" && distance(actor.Position, entry.Rejection.Order.Position) <= 10000 {
					entry.Nearby = append(entry.Nearby, actor)
				}
				if actor.ID == entry.Rejection.Order.Target {
					copy := actor
					entry.Target = &copy
					if unit, ok := e.catalog.Unit(actor.Type); ok {
						entry.Armor = unit.Armor
					}
				}
				for _, id := range entry.Rejection.Order.Entities {
					if actor.ID == id {
						entry.VisibleSources = append(entry.VisibleSources, actor)
						if actor.Owner == view.Player {
							entry.Sources = append(entry.Sources, actor)
						}
					}
				}
			}
			for _, event := range view.Events {
				relevant := event.Entity == entry.Rejection.Order.Target && event.Entity != 0
				for _, id := range entry.Rejection.Order.Entities {
					relevant = relevant || event.Entity == id
				}
				if relevant {
					entry.Events = append(entry.Events, event)
				}
			}
			for _, station := range view.Stations {
				if station.ID == entry.Rejection.Order.Target {
					copy := station
					entry.Station = &copy
				}
			}
			if len(entry.Sources) > 0 && entry.Target != nil {
				entry.CenterDistance = distance(entry.Sources[0].Position, entry.Target.Position)
			}
			contexts = append(contexts, entry)
		}
		if player.Finished() {
			break
		}
		if err := player.Advance(); err != nil {
			t.Fatal(err)
		}
	}
	expectedBytes, err := os.ReadFile(filepath.Join(dir, "result.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected authoredAIResult
	if err := json.Unmarshal(expectedBytes, &expected); err != nil {
		t.Fatal(err)
	}
	if player.Engine().Hash() != expected.Hash {
		t.Fatal("diagnostic source differs from recorded deterministic AI; use original source overlay")
	}
	diagnostic, err := json.MarshalIndent(struct {
		FinalHash    string                       `json:"verified_final_hash"`
		WeaponEvents map[Tick]map[PlayerID]uint64 `json:"weapon_events_by_minute"`
	}{expected.Hash, weapons}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "diagnostic-summary.json", append(diagnostic, '\n'))
	data, err := json.MarshalIndent(contexts, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "rejection-context.json", append(data, '\n'))
	t.Logf("inspected%d rejected orders through authorized views at%d boundaries", len(rejected), len(contexts))
}

// Opening diagnostics preserve the unmodified replay and expose only each
// player's own state plus the ordinary authorized view. They are evidence for
// placement/routing failures, never inputs to the AI.
func TestAuthoredSkirmishOpeningContext(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AUTHORED_AI_OPENING")
	if dir == "" {
		t.Skip("opt-in authored opening diagnosis")
	}
	data, err := os.ReadFile(filepath.Join(dir, "replay.fcr"))
	if err != nil {
		t.Fatal(err)
	}
	replay, err := DecodeReplay(data)
	if err != nil {
		t.Fatal(err)
	}
	replay.Checkpoints = nil
	player, err := replay.Open(content.MustBase(), 0)
	if err != nil {
		t.Fatal(err)
	}
	for player.Engine().Tick() <= 4800 {
		e := player.Engine()
		if e.Tick() == 1200 || e.Tick() == 2400 || e.Tick() == 4800 {
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			authoredAIWrite(t, dir, fmt.Sprintf("opening-%d.save.json", e.Tick()), saved)
			for _, p := range e.state.Players {
				view, ok := e.PlayerView(p.ID)
				if !ok {
					t.Fatal("missing player")
				}
				data, err := json.MarshalIndent(view, "", "  ")
				if err != nil {
					t.Fatal(err)
				}
				authoredAIWrite(t, dir, fmt.Sprintf("opening-%d-player-%d.view.json", e.Tick(), p.ID), data)
			}
		}
		if e.Tick() == 4800 {
			break
		}
		if err := player.Advance(); err != nil {
			t.Fatal(err)
		}
	}
}
