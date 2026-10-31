package botsweep

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

// Config is one headless bot-vs-mission run.
type Config struct {
	ContentDir string
	MissionID  string
	Difficulty string
	Bot        string
	// Seed is the simulation seed; BotSeed drives bot randomness only.
	Seed    uint64
	BotSeed uint64
	// MaxTicks caps game time (20 ticks = 1 second of game time).
	MaxTicks sim.Tick
	// DecisionInterval is how often the bot is asked for orders.
	DecisionInterval sim.Tick
	// CheckSaveRestore saves/restores at the midpoint (or at the terminal
	// tick when a run finishes earlier) and compares hashes.
	CheckSaveRestore bool
}

// Verdicts for one run. A timeout is not a failure by itself: scripted
// objectives are not expected to fall to generic bots on every mission.
const (
	VerdictWin             = "win"
	VerdictLoss            = "loss"
	VerdictTimeoutProgress = "timeout-progress"
	VerdictTimeoutStalled  = "timeout-stalled"
	VerdictError           = "error"
)

// Result is the evidence record for one run.
type Result struct {
	Mission    string `json:"mission"`
	Title      string `json:"title"`
	Faction    string `json:"faction"`
	Difficulty string `json:"difficulty"`
	Bot        string `json:"bot"`
	Seed       uint64 `json:"seed"`
	BotSeed    uint64 `json:"bot_seed"`

	Verdict string      `json:"verdict"`
	Outcome sim.Outcome `json:"outcome"`
	Ticks   sim.Tick    `json:"ticks"`
	WallMS  int64       `json:"wall_ms"`

	InitialHash string `json:"initial_hash"`
	FinalHash   string `json:"final_hash"`

	OrdersIssued   int `json:"orders_issued"`
	OrdersAccepted int `json:"orders_accepted"`
	OrdersRejected int `json:"orders_rejected"`

	ObjectivesTotal    int `json:"objectives_total"`
	ObjectivesComplete int `json:"objectives_complete"`
	ObjectiveProgress  int `json:"objective_progress"`

	StartOwned   int   `json:"start_owned"`
	EndOwned     int   `json:"end_owned"`
	StartHostile int   `json:"start_hostile"`
	EndHostile   int   `json:"end_hostile"`
	StartCredits int64 `json:"start_credits"`
	EndCredits   int64 `json:"end_credits"`
	Income       int64 `json:"income"`
	Explored     int   `json:"explored_tiles"`

	Progress           bool   `json:"progress"`
	SaveRestoreChecked bool   `json:"save_restore_checked"`
	SaveRestoreOK      bool   `json:"save_restore_ok"`
	Error              string `json:"error,omitempty"`
}

// MissionRef is one campaign entry from content/index.json.
type MissionRef struct {
	ID      string
	Title   string
	Faction string
	Order   int
}

// CampaignMissions reads the authoritative content index.
func CampaignMissions(contentDir string) ([]MissionRef, error) {
	data, err := os.ReadFile(filepath.Join(contentDir, "index.json"))
	if err != nil {
		return nil, err
	}
	var index struct {
		Missions []struct {
			ID      string `json:"id"`
			Title   string `json:"title"`
			Mode    string `json:"mode"`
			Faction string `json:"faction"`
			Order   int    `json:"order"`
		} `json:"missions"`
	}
	if err := json.Unmarshal(data, &index); err != nil {
		return nil, err
	}
	var out []MissionRef
	for _, m := range index.Missions {
		if m.Mode == "campaign" {
			out = append(out, MissionRef{ID: m.ID, Title: m.Title, Faction: m.Faction, Order: m.Order})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Faction != out[j].Faction {
			return out[i].Faction < out[j].Faction
		}
		return out[i].Order < out[j].Order
	})
	if len(out) == 0 {
		return nil, fmt.Errorf("no campaign missions in %s/index.json", contentDir)
	}
	return out, nil
}

// LoadMission decodes one mission and its map from the content directory.
func LoadMission(contentDir, id string, catalog *content.Catalog) (content.Map, content.Mission, error) {
	missionBytes, err := os.ReadFile(filepath.Join(contentDir, "missions", id+".json"))
	if err != nil {
		return content.Map{}, content.Mission{}, err
	}
	var header struct {
		MapID string `json:"map_id"`
	}
	if err := json.Unmarshal(missionBytes, &header); err != nil {
		return content.Map{}, content.Mission{}, err
	}
	mapBytes, err := os.ReadFile(filepath.Join(contentDir, "maps", header.MapID+".json"))
	if err != nil {
		return content.Map{}, content.Mission{}, err
	}
	gameMap, err := content.DecodeMap(mapBytes)
	if err != nil {
		return content.Map{}, content.Mission{}, err
	}
	definition, err := content.DecodeMission(missionBytes, catalog, gameMap)
	if err != nil {
		return content.Map{}, content.Mission{}, err
	}
	return gameMap, definition, nil
}

// teamCounts uses StateCopy for evidence only (never bot decisions).
func teamCounts(engine *sim.Engine) (owned, hostile int) {
	state := engine.StateCopy()
	teams := map[sim.PlayerID]uint32{}
	for _, p := range state.Players {
		teams[p.ID] = p.Team
	}
	for _, e := range state.Entities {
		if e == nil || e.HP <= 0 || e.MapObject != 0 {
			continue
		}
		switch {
		case e.Owner == 1:
			owned++
		case e.Owner != 0 && teams[e.Owner] != 1:
			hostile++
		}
	}
	return owned, hostile
}

func exploredCount(view sim.View) int {
	n := 0
	for _, seen := range view.Explored {
		if seen {
			n++
		}
	}
	return n
}

// Run plays one mission with one bot. It never panics: a sim or bot panic
// is recovered and reported as VerdictError so one bad mission cannot
// hide the rest of the sweep.
func Run(catalog *content.Catalog, cfg Config) (result Result) {
	result = Result{
		Mission: cfg.MissionID, Difficulty: cfg.Difficulty, Bot: cfg.Bot,
		Seed: cfg.Seed, BotSeed: cfg.BotSeed, Verdict: VerdictError,
		// Only an unrequested check is vacuously OK; a requested check must
		// actually run before SaveRestoreOK can become true.
		SaveRestoreOK: !cfg.CheckSaveRestore,
	}
	started := time.Now()
	defer func() {
		if recovered := recover(); recovered != nil {
			result.Verdict = VerdictError
			result.Error = fmt.Sprintf("panic: %v", recovered)
		}
		result.WallMS = time.Since(started).Milliseconds()
	}()

	if cfg.DecisionInterval <= 0 {
		cfg.DecisionInterval = 20
	}
	if cfg.MaxTicks <= 0 {
		cfg.MaxTicks = 12000
	}
	gameMap, definition, err := LoadMission(cfg.ContentDir, cfg.MissionID, catalog)
	if err != nil {
		result.Error = "load: " + err.Error()
		return result
	}
	result.Title, result.Faction = definition.Title, definition.Faction
	bot := New(cfg.Bot, BotConfig{Seed: cfg.BotSeed, Catalog: catalog, Map: gameMap, Faction: definition.Faction})
	if bot == nil {
		result.Error = "unknown bot " + cfg.Bot
		return result
	}
	engine, err := sim.NewMission(catalog, gameMap, definition, cfg.Difficulty, cfg.Seed)
	if err != nil {
		result.Error = "new mission: " + err.Error()
		return result
	}
	result.InitialHash = engine.Hash()
	result.StartOwned, result.StartHostile = teamCounts(engine)
	if view, ok := engine.PlayerView(1); ok {
		result.StartCredits = view.Economy.Credits
	}

	// Settle like the authored acceptance drivers, then hand over to the bot.
	for i := 0; i < 100 && !engine.Outcome().Finished; i++ {
		engine.Advance()
	}
	result.StartOwned, result.StartHostile = teamCounts(engine)

	checkSaveRestore := func() bool {
		result.SaveRestoreChecked = true
		data, saveErr := engine.Save()
		if saveErr != nil {
			result.SaveRestoreOK = false
			result.Error = "save: " + saveErr.Error()
			return false
		}
		restored, restoreErr := sim.Restore(catalog, data)
		if restoreErr != nil || restored.Hash() != engine.Hash() {
			result.SaveRestoreOK = false
			result.Error = fmt.Sprintf("save/restore hash mismatch at tick %d (err %v)", engine.Tick(), restoreErr)
			return false
		}
		result.SaveRestoreOK = true
		return true
	}

	var sequence uint32
	midpoint := cfg.MaxTicks / 2
	for engine.Tick() < cfg.MaxTicks && !engine.Outcome().Finished {
		if cfg.CheckSaveRestore && !result.SaveRestoreChecked && engine.Tick() >= midpoint {
			if !checkSaveRestore() {
				return result
			}
		}
		view, ok := engine.PlayerView(1)
		if !ok {
			result.Error = "human player view missing"
			return result
		}
		orders := bot.Orders(view)
		if len(orders) > 0 {
			sequence++
			result.OrdersIssued += len(orders)
			if submitErr := engine.Submit(1, sequence, orders); submitErr != nil {
				result.OrdersRejected += len(orders)
			} else {
				engine.Advance()
				if after, ok := engine.PlayerView(1); ok {
					for _, r := range after.Results {
						if r.Player != 1 || r.Sequence != sequence {
							continue
						}
						if r.Accepted {
							result.OrdersAccepted++
						} else {
							result.OrdersRejected++
						}
					}
				}
			}
		}
		for step := sim.Tick(0); step < cfg.DecisionInterval && engine.Tick() < cfg.MaxTicks && !engine.Outcome().Finished; step++ {
			engine.Advance()
		}
	}

	// Runs that finish before the midpoint still get a real terminal
	// save/restore check instead of a vacuous pass.
	if cfg.CheckSaveRestore && !result.SaveRestoreChecked {
		if !checkSaveRestore() {
			return result
		}
	}

	result.Outcome = engine.Outcome()
	result.Ticks = engine.Tick()
	result.FinalHash = engine.Hash()
	result.EndOwned, result.EndHostile = teamCounts(engine)
	if view, ok := engine.PlayerView(1); ok {
		result.EndCredits = view.Economy.Credits
		result.Income = view.Economy.Income
		result.Explored = exploredCount(view)
		if view.Mission != nil {
			for _, objective := range view.Mission.Objectives {
				if objective.Failure {
					continue
				}
				result.ObjectivesTotal++
				result.ObjectiveProgress += int(objective.Progress)
				if objective.Complete {
					result.ObjectivesComplete++
				}
			}
		}
	}
	result.Progress = result.Outcome.Finished ||
		result.FinalHash != result.InitialHash && (result.OrdersAccepted > 0 ||
			result.ObjectiveProgress > 0 || result.ObjectivesComplete > 0 ||
			result.EndOwned != result.StartOwned || result.EndHostile != result.StartHostile ||
			result.EndCredits != result.StartCredits || result.Income > 0)
	switch {
	case cfg.CheckSaveRestore && (!result.SaveRestoreChecked || !result.SaveRestoreOK):
		result.Verdict = VerdictError
	case result.Outcome.Finished && result.Outcome.WinningTeam == 1:
		result.Verdict = VerdictWin
	case result.Outcome.Finished:
		result.Verdict = VerdictLoss
	case result.Progress:
		result.Verdict = VerdictTimeoutProgress
	default:
		result.Verdict = VerdictTimeoutStalled
	}
	return result
}

// RunAll runs configs with a bounded worker pool and returns results in
// config order. Catalog decoding is shared; engines are per-run.
func RunAll(configs []Config, workers int, progress func(Result)) ([]Result, error) {
	catalog, err := content.Base()
	if err != nil {
		return nil, err
	}
	if workers < 1 {
		workers = 1
	}
	results := make([]Result, len(configs))
	jobs := make(chan int)
	done := make(chan struct{}, workers)
	for w := 0; w < workers; w++ {
		go func() {
			for i := range jobs {
				results[i] = Run(catalog, configs[i])
				if progress != nil {
					progress(results[i])
				}
			}
			done <- struct{}{}
		}()
	}
	for i := range configs {
		jobs <- i
	}
	close(jobs)
	for w := 0; w < workers; w++ {
		<-done
	}
	return results, nil
}
