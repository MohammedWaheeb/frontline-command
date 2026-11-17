package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"testing"
)

// These paid-game checks are opt-in because the serial matrix runs several
// twenty-minute games. No actors, resources, visibility or planner state are
// manufactured: ordinary New/Advance are the only game mutation entry points.
func aiBetaRequireMatrix(t *testing.T) {
	t.Helper()
	if testing.Short() || os.Getenv("FRONTLINE_AI_BETA_ACCEPTANCE") != "1" {
		t.Skip("set FRONTLINE_AI_BETA_ACCEPTANCE=1 for paid AI beta acceptance")
	}
}

func aiBetaGame(t *testing.T, mapID string, seed uint64, difficulties [2]string) *Engine {
	t.Helper()
	battlefield, _ := aiCompetenceMap(t, mapID)
	e, err := New(content.MustBase(), Config{Map: battlefield, Seed: seed, Players: []PlayerConfig{
		{ID: 1, Faction: "US", Team: 1, AI: difficulties[0]},
		{ID: 2, Faction: "US", Team: 2, AI: difficulties[1]},
	}})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("ordinary AI start: map=%s metadata=%+v", mapID, e.Metadata())
	for _, p := range e.state.Players {
		if p.Credits != DefaultStartingCredits || p.Income != 0 || p.Spent != 0 {
			t.Fatal("acceptance requires unmodified ordinary starting economy", p.ID)
		}
	}
	return e
}

type aiBetaPaidMetrics struct {
	groups     [2]int
	groupSizes [2][]int
	groupTicks [2][]Tick
	idle       [2]Tick
	maxIdle    [2]Tick
	cursor     uint64
}

func (m *aiBetaPaidMetrics) observe(t *testing.T, e *Engine) {
	t.Helper()
	if m.cursor < e.state.LogBase {
		t.Fatal("acceptance lost ordinary command history")
	}
	for _, batch := range e.state.Log[m.cursor-e.state.LogBase:] {
		for index, order := range batch.Orders {
			if order.Kind != "attack_move" || len(order.Entities) < 3 {
				continue
			}
			accepted := false
			for _, receipt := range e.state.Results {
				if receipt.Player == batch.Player && receipt.Sequence == batch.Sequence && receipt.Index == int32(index) && receipt.Accepted && receipt.AppliedCount >= 3 {
					accepted = true
					break
				}
			}
			if !accepted {
				continue
			}
			i := int(batch.Player - 1)
			m.groups[i]++
			m.groupSizes[i] = append(m.groupSizes[i], len(order.Entities))
			m.groupTicks[i] = append(m.groupTicks[i], batch.Tick)
		}
	}
	m.cursor = e.state.LogBase + uint64(len(e.state.Log))
	if e.Tick()%seconds(1) != 0 {
		return
	}
	for i, p := range e.state.Players {
		if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
			t.Fatal("ordinary paid economy invariant", e.Tick(), p.ID, p.Credits, p.Supply, p.ReservedSupply)
		}
		// A rich player with Supply headroom and completed production must not
		// leave every producer idle for ninety consecutive seconds. Active
		// construction is useful spending/recovery, not an idle-money stall.
		producers, working := 0, false
		for _, v := range e.state.Entities {
			if v.Owner != p.ID {
				continue
			}
			if !v.Complete || len(v.Jobs) > 0 {
				working = true
			}
			if v.Complete && v.Enabled && (e.role(v) == "barracks" || e.role(v) == "factory") {
				producers++
			}
		}
		if !p.Defeated && e.Tick() > seconds(120) && p.Credits >= 4500000 && p.Supply+p.ReservedSupply < 85 && producers > 0 && !working {
			m.idle[i] += seconds(1)
			m.maxIdle[i] = max(m.maxIdle[i], m.idle[i])
		} else {
			m.idle[i] = 0
		}
	}
}

func aiBetaRunPaid(t *testing.T, e *Engine, horizon Tick) aiBetaPaidMetrics {
	t.Helper()
	m := aiBetaPaidMetrics{}
	for e.Tick() < horizon && !e.Outcome().Finished {
		e.Advance()
		m.observe(t, e)
	}
	for i, p := range e.state.Players {
		t.Logf("player=%d difficulty=%s tick=%d groups=%d sizes=%v ticks=%v rich_idle_max_ticks=%d income=%d spent=%d bank=%d supply=%d kills=%d lost=%d", p.ID, p.AI, e.Tick(), m.groups[i], m.groupSizes[i], m.groupTicks[i], m.maxIdle[i], p.Income, p.Spent, p.Credits, p.Supply, p.Kills, p.Lost)
		if m.maxIdle[i] >= seconds(90) {
			t.Errorf("player %d stalled with money and idle production for %d ticks", p.ID, m.maxIdle[i])
		}
		if p.Income == 0 || p.Spent == 0 {
			t.Errorf("player %d did not establish an ordinary paid economy", p.ID)
		}
	}
	t.Logf("outcome=%+v hash=%s", e.Outcome(), e.Hash())
	return m
}

func TestAIBetaPaidWavesOnDefaultMaps(t *testing.T) {
	aiBetaRequireMatrix(t)
	for _, mapID := range []string{"copper-junction", "industrial-valley"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(mapID+"/"+difficulty, func(t *testing.T) {
				e := aiBetaGame(t, mapID, 31001, [2]string{difficulty, difficulty})
				metrics := aiBetaRunPaid(t, e, seconds(900))
				for i, groups := range metrics.groups {
					if groups < 2 {
						t.Errorf("player %d released %d accepted groups of at least three actors; require two", i+1, groups)
					}
				}
			})
		}
	}
}

func TestAIBetaHardBeatsEasyPaidMirrorMajority(t *testing.T) {
	aiBetaDifficultyMirrorMajority(t, "hard", 5)
}

func TestAIBetaNormalBeatsEasyPaidMirrorMajority(t *testing.T) {
	aiBetaDifficultyMirrorMajority(t, "normal", 4)
}

func aiBetaDifficultyMirrorMajority(t *testing.T, difficulty string, minimumWins int) {
	t.Helper()
	aiBetaRequireMatrix(t)
	for _, mapID := range []string{"copper-junction", "industrial-valley"} {
		t.Run(mapID, func(t *testing.T) {
			wins, games := 0, 0
			for _, seed := range []uint64{31001, 31002, 31003} {
				for _, hardPlayer := range []PlayerID{1, 2} {
					t.Run(fmt.Sprintf("seed-%d/%s-player-%d", seed, difficulty, hardPlayer), func(t *testing.T) {
						difficulties := [2]string{"easy", "easy"}
						difficulties[hardPlayer-1] = difficulty
						e := aiBetaGame(t, mapID, seed, difficulties)
						aiBetaRunPaid(t, e, seconds(1200))
						games++
						if e.Outcome().Finished && !e.Outcome().Draw && e.Outcome().WinningTeam == uint32(hardPlayer) {
							wins++
						}
					})
				}
			}
			t.Logf("%s %s ordinary elimination wins=%d/%d; draws and horizon timeouts are not wins", mapID, difficulty, wins, games)
			if games != 6 || wins < minimumWins {
				t.Errorf("%s must beat Easy in at least %d/6 paid, side-swapped mirror samples: %d/%d", difficulty, minimumWins, wins, games)
			}
		})
	}
}

func TestAIBetaPaidWaveSaveAndFullReplay(t *testing.T) {
	aiBetaRequireMatrix(t)
	e := aiBetaGame(t, "copper-junction", 31001, [2]string{"hard", "normal"})
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	var twin *Engine
	metrics := aiBetaPaidMetrics{}
	for e.Tick() < seconds(600) && !e.Outcome().Finished {
		e.Advance()
		metrics.observe(t, e)
		if twin != nil {
			twin.Advance()
		}
		if e.Tick() == seconds(540) {
			saved, saveErr := e.Save()
			if saveErr != nil {
				t.Fatal(saveErr)
			}
			twin, err = Restore(e.catalog, saved)
			if err != nil || twin.Hash() != e.Hash() {
				t.Fatal("paid AI wave state did not restore exactly", err)
			}
		}
		if e.Tick()%seconds(30) == 0 {
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			if twin != nil && twin.Hash() != e.Hash() {
				t.Fatal("paid AI save continuation diverged", e.Tick())
			}
		}
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	packed, err := replay.Encode()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeReplay(packed)
	if err != nil {
		t.Fatal(err)
	}
	if len(decoded.Checkpoints) != 0 {
		t.Fatal("full replay proof must begin at the ordinary start")
	}
	played, err := decoded.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("paid AI full replay diverged", err)
	}
	if twin == nil || twin.Hash() != e.Hash() {
		t.Fatal("paid AI save continuation not verified")
	}
	if metrics.groups[0]+metrics.groups[1] == 0 {
		t.Fatal("paid replay did not exercise a released attack wave")
	}
	t.Logf("ordinary full replay and 60-second restored continuation exact: tick=%d hash=%s", e.Tick(), e.Hash())
}

// Opt-in paid trace for diagnosing the real mirror without changing planner
// decisions. Gate counts omit earlier recovery reservations, so they are an
// upper bound on actors actually available to the wave planner.
func TestAIBetaHardP1WaveDiagnostic(t *testing.T) {
	aiBetaRequireMatrix(t)
	if os.Getenv("FRONTLINE_AI_BETA_DIAGNOSTIC") != "1" {
		t.Skip("set FRONTLINE_AI_BETA_DIAGNOSTIC=1 for the paid Hard spawn-one trace")
	}
	sources := []string{"ai.go", "ai_policy.go", "ai_build_order.go", "ai_attack.go", "ai_first_vehicle.go"}
	for _, path := range sources {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("diagnostic on-disk source before: %s sha256=%s", path, aiCompetenceDigest(data))
	}
	mapID := os.Getenv("FRONTLINE_AI_BETA_MAP")
	if mapID == "" {
		mapID = "copper-junction"
	}
	difficulty := os.Getenv("FRONTLINE_AI_BETA_DIFFICULTY")
	if difficulty == "" {
		difficulty = "hard"
	}
	diagnosticPlayer := PlayerID(1)
	if os.Getenv("FRONTLINE_AI_BETA_PLAYER") == "2" {
		diagnosticPlayer = 2
	}
	difficulties := [2]string{"easy", "easy"}
	difficulties[diagnosticPlayer-1] = difficulty
	e := aiBetaGame(t, mapID, 31001, difficulties)
	metrics := aiBetaPaidMetrics{}
	intentSeconds := map[string]int{}
	maxCandidates, maxPower := 0, int32(0)
	for e.Tick() < seconds(1200) && !e.Outcome().Finished {
		e.Advance()
		metrics.observe(t, e)
		if e.Tick()%seconds(1) == 0 {
			intentSeconds[e.player(diagnosticPlayer).AIIntent]++
		}
		if e.Tick()%seconds(30) != 0 {
			continue
		}
		p := e.player(diagnosticPlayer)
		own := aiOwnView(e, diagnosticPlayer)
		if e.Tick()%seconds(120) == 0 && p.AIIntent == "defend" {
			view, _ := e.PlayerView(p.ID)
			for _, observed := range view.Entities {
				if observed.Position == p.AIGoal || observed.Owner == p.ID && (observed.Type == "hq" || observed.Type == "supply" || observed.Type == p.Faction+".hauler") {
					t.Logf("defense context tick=%d id=%d owner=%d type=%s position=%v", e.Tick(), observed.ID, observed.Owner, observed.Type, observed.Position)
				}
			}
		}
		policy := e.aiSkirmishPolicy(p)
		rally := e.aiWaveRally(p, own, p.AIGoal)
		composition, exclusions := map[string]int{}, map[string]int{}
		candidates := []*Entity{}
		for _, observed := range own {
			v := e.entity(observed.ID)
			composition[v.Type]++
			if !e.aiWaveCombat(v) {
				continue
			}
			reason := ""
			switch {
			case cooldown(v.Cooldowns, "ai_wave_member", e.Tick()):
				reason = "active_member"
			case v.Channel != "" || v.Deployed || v.DeployUntil > 0 || v.PackingUntil > 0:
				reason = "working"
			case v.HP*100 < v.MaxHP*int64(policy.RetreatPercent):
				reason = "damaged"
			case v.Stance == "hold":
				reason = "hold"
			case v.EverDealt && e.Tick()-v.LastDealt < seconds(3):
				reason = "recent_fire"
			case len(v.Orders) > 1 || len(v.Orders) == 1 && (v.Orders[0].Queued || v.Orders[0].Kind != "move" && v.Orders[0].Kind != "attack_move"):
				reason = "other_order"
			case len(v.Orders) == 1 && v.Orders[0].Kind == "move" && !cooldown(v.Cooldowns, "ai_wave_staging", e.Tick()):
				producerRally := false
				for _, source := range own {
					if source.Private != nil && source.Complete && source.Private.Rally == v.Orders[0].Position {
						u, _ := e.catalog.Unit(v.Type)
						if b, ok := e.buildingRule(source.Type); ok && b.Role == u.Producer {
							producerRally = true
						}
					}
				}
				if !producerRally {
					reason = "explicit_move"
				}
			}
			if reason != "" {
				exclusions[reason]++
			} else {
				candidates = append(candidates, v)
			}
			if e.Tick()%seconds(120) == 0 {
				t.Logf("actor tick=%d id=%d type=%s pos=%v HP=%d/%d orders=%+v state=%s target=%d blocked=%v progress=%d cooldowns=%v exclusion=%s", e.Tick(), v.ID, v.Type, v.Position, v.HP, v.MaxHP, v.Orders, v.State, v.Target, v.Blocked, v.LastProgress, v.Cooldowns, reason)
			}
		}
		if len(candidates) > int(policy.MinWaveUnits) {
			candidates = candidates[1:]
		}
		power, ground, ready := int32(0), 0, 0
		for _, v := range candidates {
			u, _ := e.catalog.Unit(v.Type)
			power += max(int32(1), int32(int64(u.Supply)*v.HP/v.MaxHP))
			if w, ok := e.catalog.Weapon(u.Weapon); ok && e.catalog.Multiplier(w.Kind, "structure") > 0 {
				ground++
			}
			if distance(v.Position, rally) <= 6500 {
				ready++
			}
		}
		maxCandidates, maxPower = max(maxCandidates, len(candidates)), max(maxPower, power)
		t.Logf("gate tick=%d intent=%s goal=%v rally=%v units=%d/%d power=%d/%d structure_capable=%d/2 ready=%d/%d percent=%d cooldowns=%v composition=%v exclusions=%v spent=%d lost=%d bank=%d", e.Tick(), p.AIIntent, p.AIGoal, rally, len(candidates), policy.MinWaveUnits, power, policy.WavePower, ground, ready, len(candidates), policy.ReadyPercent, p.Cooldowns, composition, exclusions, p.Spent, p.Lost, p.Credits)
	}
	t.Logf("diagnostic final tick=%d groups=%v max_candidates=%d max_power=%d intent_seconds=%v outcome=%+v hash=%s", e.Tick(), metrics.groups, maxCandidates, maxPower, intentSeconds, e.Outcome(), e.Hash())
	if !e.Outcome().Finished {
		for _, v := range e.state.Entities {
			if v.HP > 0 {
				t.Logf("diagnostic final actor id=%d owner=%d type=%s position=%v HP=%d/%d orders=%+v state=%s target=%d blocked=%v progress=%d", v.ID, v.Owner, v.Type, v.Position, v.HP, v.MaxHP, v.Orders, v.State, v.Target, v.Blocked, v.LastProgress)
			}
		}
	}
	for _, path := range sources {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("diagnostic on-disk source after: %s sha256=%s", path, aiCompetenceDigest(data))
	}
}

func TestAIBetaBorderDepotsIranPaidProgress(t *testing.T) {
	aiBetaRequireMatrix(t)
	for _, iranPlayer := range []PlayerID{1, 2} {
		t.Run(fmt.Sprintf("iran-player-%d", iranPlayer), func(t *testing.T) {
			battlefield, _ := aiCompetenceMap(t, "border-depots")
			players := []PlayerConfig{{ID: 1, Faction: "US", Team: 1, AI: "normal"}, {ID: 2, Faction: "US", Team: 2, AI: "normal"}}
			players[iranPlayer-1].Faction = "IR"
			e, err := New(content.MustBase(), Config{Map: battlefield, Seed: 31001, Players: players})
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("ordinary Border Depots start: metadata=%+v", e.Metadata())
			maxTier, paidCombat := int32(1), false
			metrics := aiBetaPaidMetrics{}
			for e.Tick() < seconds(600) && !e.Outcome().Finished {
				e.Advance()
				metrics.observe(t, e)
				maxTier = max(maxTier, e.player(iranPlayer).Tier)
				for _, v := range e.state.Entities {
					if v.Owner != iranPlayer || v.Paid <= 0 || !v.Complete {
						continue
					}
					if u, ok := e.catalog.Unit(v.Type); ok && u.Weapon != "" && u.Role != "recon" {
						paidCombat = true
					}
				}
			}
			p := e.player(iranPlayer)
			t.Logf("Iran player=%d tick=%d max_tier=%d paid_combat=%v income=%d spent=%d bank=%d supply=%d groups=%d hash=%s", p.ID, e.Tick(), maxTier, paidCombat, p.Income, p.Spent, p.Credits, p.Supply, metrics.groups[iranPlayer-1], e.Hash())
			if maxTier < 2 || !paidCombat || p.Income == 0 {
				t.Fatal("Iran failed to escape the Tier 1 recon-only/no-income opening")
			}
		})
	}
}
