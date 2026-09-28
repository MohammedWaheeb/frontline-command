package sim_test

// These acceptance drivers play the shipped authored missions through public
// commands. StateCopy is used only for initial tag identity and evidence, never
// to edit resources, actors, objectives, damage, or the simulation clock.
import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

type authoredOrder struct {
	Tick     sim.Tick          `json:"tick"`
	Player   sim.PlayerID      `json:"player"`
	Sequence uint32            `json:"sequence"`
	Orders   []sim.Order       `json:"orders"`
	Results  []sim.OrderResult `json:"results"`
}
type authoredRun struct {
	t                   *testing.T
	engine, twin        *sim.Engine
	catalog             *content.Catalog
	gameMap             content.Map
	definition          content.Mission
	difficulty, faction string
	replay              *sim.Replay
	tags                map[string][]sim.ID
	sequences           map[sim.PlayerID]uint32
	orders              []authoredOrder
	midpoint            sim.Tick
	initialHash         string
	evidenceSuffix      string
	requiredOptional    string
	excludedArmy        map[sim.ID]bool
	tactical            func()
	diagnosticAttempt   *authoredAttempt
}

func newAuthoredRun(t *testing.T, id, difficulty, faction string) *authoredRun {
	t.Helper()
	run := &authoredRun{t: t, difficulty: difficulty, faction: faction, definition: content.Mission{ID: id}}
	// Register before setup: every later helper/driver Fatal runs this cleanup.
	// Successful/skipped leaves create no failure artifacts.
	t.Cleanup(func() {
		if t.Failed() {
			run.captureFatalDiagnostics()
		}
	})
	catalog := content.MustBase()
	bytes, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", id+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var header struct {
		MapID string `json:"map_id"`
	}
	if err = json.Unmarshal(bytes, &header); err != nil {
		t.Fatal(err)
	}
	mapBytes, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", header.MapID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	gameMap, err := content.DecodeMap(mapBytes)
	if err != nil {
		t.Fatal(err)
	}
	definition, err := content.DecodeMission(bytes, catalog, gameMap)
	if err != nil {
		t.Fatal(err)
	}
	if faction != "" {
		definition, err = definition.ForTutorialFaction(catalog, gameMap, faction)
		if err != nil {
			t.Fatal(err)
		}
	}
	run.catalog, run.gameMap, run.definition, run.faction = catalog, gameMap, definition, definition.Faction
	engine, err := sim.NewMission(catalog, gameMap, definition, difficulty, 19027)
	if err != nil {
		t.Fatal(err)
	}
	run.engine = engine
	replay, err := sim.NewReplay(engine)
	if err != nil {
		t.Fatal(err)
	}
	*run = authoredRun{t: t, engine: engine, catalog: catalog, gameMap: gameMap, definition: definition, difficulty: difficulty, faction: definition.Faction, replay: replay, tags: map[string][]sim.ID{}, sequences: map[sim.PlayerID]uint32{}, initialHash: engine.Hash()}
	for _, entity := range engine.StateCopy().Entities {
		if entity.Tag != "" {
			run.tags[entity.Tag] = append(run.tags[entity.Tag], entity.ID)
		}
	}
	run.advance(100)
	return run
}
func (r *authoredRun) view() sim.View {
	v, ok := r.engine.PlayerView(1)
	if !ok {
		r.t.Fatal("human perspective missing")
	}
	return v
}
func (r *authoredRun) advance(n sim.Tick) {
	r.t.Helper()
	for step := sim.Tick(0); step < n && !r.engine.Outcome().Finished; step++ {
		r.engine.Advance()
		if r.twin != nil {
			r.twin.Advance()
		}
		if r.engine.Tick()%600 == 0 {
			if err := r.replay.Capture(r.engine, true); err != nil {
				r.t.Fatal(err)
			}
		}
	}
}
func (r *authoredRun) issue(player sim.PlayerID, orders ...sim.Order) {
	r.t.Helper()
	r.sequences[player]++
	sequence := r.sequences[player]
	tick := r.engine.Tick()
	r.diagnosticAttempt = &authoredAttempt{authoredOrder: authoredOrder{tick, player, sequence, copyDiagnosticOrders(orders), nil}, Stage: "submit"}
	if err := r.engine.Submit(player, sequence, orders); err != nil {
		r.diagnosticAttemptError("submit", err)
		if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
			_ = os.MkdirAll(directory, 0755)
			prefix := filepath.Join(directory, r.definition.ID+"-"+r.faction+"-"+r.difficulty+r.evidenceSuffix+".submit-error")
			saved, _ := r.engine.Save()
			_ = os.WriteFile(prefix+".save.json", saved, 0644)
			view, _ := json.MarshalIndent(r.view(), "", "  ")
			_ = os.WriteFile(prefix+".view.json", view, 0644)
		}
		r.t.Fatalf("%s at tick %d: submit %+v: %v", r.definition.ID, tick, orders, err)
	}
	r.diagnosticAttempt.Stage = "await_execution"
	if r.twin != nil {
		if err := r.twin.Submit(player, sequence, orders); err != nil {
			r.diagnosticAttemptError("restored_submit", err)
			r.t.Fatalf("restored submit: %v", err)
		}
	}
	r.advance(1)
	v, _ := r.engine.PlayerView(player)
	// Capture every available receipt before the original first-rejection fatal.
	for _, result := range v.Results {
		if result.Player == player && result.Sequence == sequence {
			r.diagnosticAttempt.Results = append(r.diagnosticAttempt.Results, result)
		}
	}
	receipts := []sim.OrderResult{}
	for _, result := range v.Results {
		if result.Player == player && result.Sequence == sequence {
			receipts = append(receipts, result)
			if !result.Accepted {
				r.diagnosticAttemptError("execution_rejected", result.Code)
				if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
					_ = os.MkdirAll(directory, 0755)
					prefix := filepath.Join(directory, r.definition.ID+"-"+r.faction+"-"+r.difficulty+r.evidenceSuffix+".rejected")
					saved, _ := r.engine.Save()
					_ = os.WriteFile(prefix+".save.json", saved, 0644)
					view, _ := json.MarshalIndent(r.view(), "", "  ")
					_ = os.WriteFile(prefix+".view.json", view, 0644)
				}
				r.t.Fatalf("tick %d order %+v rejected: %+v", tick, orders[result.Index], result)
			}
		}
	}
	if len(receipts) != len(orders) {
		r.diagnosticAttemptError("receipt_count", fmt.Sprintf("got %d, expected %d", len(receipts), len(orders)))
		r.t.Fatalf("missing execution receipts for sequence %d: %+v", sequence, receipts)
	}
	r.orders = append(r.orders, authoredOrder{tick, player, sequence, orders, receipts})
	r.diagnosticAttempt = nil
}
func (r *authoredRun) ids(tag string) []sim.ID {
	r.t.Helper()
	var ids []sim.ID
	for _, entity := range r.view().Entities {
		if entity.Owner != 1 {
			continue
		}
		for _, id := range r.tags[tag] {
			if entity.ID == id {
				ids = append(ids, id)
			}
		}
	}
	if len(ids) == 0 {
		r.t.Fatalf("no live owned actors for %s at tick %d", tag, r.engine.Tick())
	}
	return ids
}
func (r *authoredRun) region(id string) sim.Vec {
	r.t.Helper()
	for _, region := range r.gameMap.Regions {
		if region.ID == id {
			return sim.Vec{X: (region.Min.X + region.Max.X) / 2, Y: (region.Min.Y + region.Max.Y) / 2}
		}
	}
	r.t.Fatalf("missing region %s", id)
	return sim.Vec{}
}
func (r *authoredRun) complete(id string) bool {
	for _, objective := range r.view().Mission.Objectives {
		if objective.ID == id {
			return objective.Complete
		}
	}
	r.t.Fatalf("missing objective %s", id)
	return false
}
func (r *authoredRun) wait(label string, limit sim.Tick, predicate func() bool) {
	r.t.Helper()
	end := r.engine.Tick() + limit
	nextDiagnostic := r.engine.Tick() + 2000
	for !predicate() && r.engine.Tick() < end && !r.engine.Outcome().Finished {
		if r.tactical != nil {
			r.tactical()
		}
		r.advance(10)
		if r.engine.Tick() >= nextDiagnostic {
			nextDiagnostic = r.engine.Tick() + 2000
			view := r.view()
			r.t.Logf("route progress %s tick%d credits%d army%d objectives%+v", label, r.engine.Tick(), view.Economy.Credits, len(r.army()), view.Mission.Objectives)
		}
	}
	if !predicate() {
		if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
			_ = os.MkdirAll(directory, 0755)
			prefix := filepath.Join(directory, r.definition.ID+"-"+r.faction+"-"+r.difficulty+r.evidenceSuffix+".failed")
			saved, _ := r.engine.Save()
			_ = os.WriteFile(prefix+".save.json", saved, 0644)
			view, _ := json.MarshalIndent(r.view(), "", "  ")
			_ = os.WriteFile(prefix+".view.json", view, 0644)
		}
		r.t.Fatalf("%s timed out at tick %d; outcome %+v; objectives %+v; owned %+v", label, r.engine.Tick(), r.engine.Outcome(), r.view().Mission.Objectives, r.ownedSummary())
	}
}
func (r *authoredRun) ownedSummary() []string {
	var out []string
	for _, entity := range r.view().Entities {
		if entity.Owner == 1 {
			out = append(out, fmt.Sprintf("%d:%s hp%d at%v %s", entity.ID, entity.Type, entity.Health, entity.Position, entity.State))
		}
	}
	return out
}
func (r *authoredRun) checkpoint() {
	r.t.Helper()
	if r.twin != nil {
		r.t.Fatal("midpoint already forked")
	}
	data, err := r.engine.Save()
	if err != nil {
		r.t.Fatal(err)
	}
	r.twin, err = sim.Restore(r.catalog, data)
	if err != nil {
		r.t.Fatal(err)
	}
	if r.twin.Hash() != r.engine.Hash() {
		r.t.Fatal("midpoint restore hash differs")
	}
	r.midpoint = r.engine.Tick()
	if directory := os.Getenv("FRONTLINE_MISSION_CHECKPOINTS"); directory != "" {
		if err := os.MkdirAll(directory, 0755); err != nil {
			r.t.Fatal(err)
		}
		name := r.definition.ID + "-" + r.faction + "-" + r.difficulty + r.evidenceSuffix + ".midpoint.save.json"
		if err := os.WriteFile(filepath.Join(directory, name), data, 0644); err != nil {
			r.t.Fatal(err)
		}
	}
}
func (r *authoredRun) finish() {
	r.t.Helper()
	outcome := r.engine.Outcome()
	if !outcome.Finished || outcome.Reason != "mission_complete" || outcome.WinningTeam != 1 {
		r.wait("real mission victory", 0, func() bool { return false })
	}
	if r.requiredOptional != "" {
		r.requireOptional(r.requiredOptional)
	}
	if r.midpoint == 0 || r.twin == nil || r.engine.Hash() != r.twin.Hash() {
		r.t.Fatal("midpoint save branch did not finish with the same state hash")
	}
	if err := r.replay.Capture(r.engine, false); err != nil {
		r.t.Fatal(err)
	}
	// Full replay from the initial save, explicitly excluding seek checkpoints.
	full := *r.replay
	full.Checkpoints = nil
	played, err := full.Open(r.catalog, r.engine.Tick())
	if err != nil {
		r.t.Fatal(err)
	}
	if played.Engine().Hash() != r.engine.Hash() {
		r.t.Fatal("full command replay diverged")
	}
	restarted, err := sim.NewMission(r.catalog, r.gameMap, r.definition, r.difficulty, 19027)
	if err != nil {
		r.t.Fatal(err)
	}
	if restarted.Hash() != r.initialHash {
		r.t.Fatal("fresh restart initial hash diverged")
	}
	// A legal surrender provides a reproducible failure/debrief/restart path.
	// Scenario-specific actor-loss conditions require separate acceptance and
	// are not inferred from this generic mission failure check.
	failureReplay, err := sim.NewReplay(restarted)
	if err != nil {
		r.t.Fatal(err)
	}
	for range 100 {
		restarted.Advance()
	}
	for _, player := range r.definition.Players {
		if player.Controller != "human" {
			continue
		}
		if err := restarted.Submit(sim.PlayerID(player.ID), 1, []sim.Order{{Kind: "surrender"}}); err != nil {
			r.t.Fatal(err)
		}
	}
	restarted.Advance()
	if outcome := restarted.Outcome(); !outcome.Finished || outcome.Reason != "mission_failed" || outcome.WinningTeam != 0 {
		r.t.Fatalf("restart surrender did not produce mission failure: %+v", outcome)
	}
	if restarted.Debrief() == nil {
		r.t.Fatal("failure debrief unavailable")
	}
	failedBytes, err := restarted.Save()
	if err != nil {
		r.t.Fatal(err)
	}
	failedRestored, err := sim.Restore(r.catalog, failedBytes)
	if err != nil {
		r.t.Fatal(err)
	}
	if failedRestored.Hash() != restarted.Hash() {
		r.t.Fatal("failure save restore diverged")
	}
	if err = failureReplay.Capture(restarted, false); err != nil {
		r.t.Fatal(err)
	}
	failedPlayback, err := failureReplay.Open(r.catalog, restarted.Tick())
	if err != nil {
		r.t.Fatal(err)
	}
	if failedPlayback.Engine().Hash() != restarted.Hash() {
		r.t.Fatal("failure replay diverged")
	}
	evidence := struct {
		Mission, Difficulty, Faction string
		Tick, Midpoint               sim.Tick
		FinalHash, FailureHash       string
		Outcome                      sim.Outcome
		Metadata                     sim.Metadata
		Objectives                   any
		Orders                       []authoredOrder
		Debrief                      any
	}{r.definition.ID, r.difficulty, r.faction, r.engine.Tick(), r.midpoint, r.engine.Hash(), restarted.Hash(), outcome, r.engine.Metadata(), r.view().Mission.Objectives, r.orders, r.engine.Debrief()}
	data, _ := json.MarshalIndent(evidence, "", "  ")
	if directory := os.Getenv("FRONTLINE_MISSION_EVIDENCE"); directory != "" {
		if err := os.MkdirAll(directory, 0755); err != nil {
			r.t.Fatal(err)
		}
		name := r.definition.ID + "-" + r.faction + "-" + r.difficulty + r.evidenceSuffix + ".json"
		if err := os.WriteFile(filepath.Join(directory, name), append(data, '\n'), 0644); err != nil {
			r.t.Fatal(err)
		}
	}
	r.t.Logf("MISSION %s faction=%s difficulty=%s tick=%d midpoint=%d receipts=%d hash=%s", r.definition.ID, r.faction, r.difficulty, r.engine.Tick(), r.midpoint, len(r.orders), r.engine.Hash())
}
func playGiveAnOrder(r *authoredRun) {
	rifles := r.ids("starting-rifles")
	barracks := r.ids("home-barracks")
	r.issue(1, sim.Order{Kind: "rally", Entities: barracks, Position: r.region("training-move")}, sim.Order{Kind: "train", Entities: barracks, Type: "US.rifle"}, sim.Order{Kind: "move", Entities: rifles, Position: r.region("training-move")})
	r.wait("first movement objective", 1800, func() bool { return r.complete("move") })
	r.checkpoint()
	r.issue(1, sim.Order{Kind: "stop", Entities: rifles})
	r.issue(1, sim.Order{Kind: "attack_move", Entities: rifles, Position: r.region("site1")})
	r.wait("real combat target and paid production", 3600, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}
func playOperateABase(r *authoredRun) {
	rig := r.ids("home-rig")
	barracks := r.ids("home-barracks")
	factory := r.ids("home-factory")
	haulers := r.ids("home-haulers")
	fighters := append(r.ids("starting-rifles"), r.ids("starting-at")...)
	r.issue(1, sim.Order{Kind: "gather", Entities: haulers, Target: 1}, sim.Order{Kind: "train", Entities: factory, Type: "US.car"}, sim.Order{Kind: "train", Entities: barracks, Type: "US.rifle"}, sim.Order{Kind: "move", Entities: fighters, Position: sim.Vec{X: 45500, Y: 111500}}, sim.Order{Kind: "build", Entities: rig, Type: "power", Position: sim.Vec{X: 9500, Y: 108500}})
	r.wait("cargo, construction and production", 2400, func() bool { return r.complete("base-cycle") })
	r.issue(1, sim.Order{Kind: "move", Entities: haulers, Position: sim.Vec{X: 43500, Y: 121500}})
	r.checkpoint()
	for _, position := range []sim.Vec{{X: 8500, Y: 116500}, {X: 9500, Y: 95500}} {
		if r.view().Economy.PowerCapacity >= r.view().Economy.PowerDemand {
			break
		}
		capacity := r.view().Economy.PowerCapacity
		r.issue(1, sim.Order{Kind: "build", Entities: rig, Type: "power", Position: position})
		r.wait("resolve low power", 1600, func() bool { return r.view().Economy.PowerCapacity > capacity })
	}
	if r.view().Economy.PowerCapacity < r.view().Economy.PowerDemand {
		r.t.Fatal("low-power lesson still unresolved")
	}
	// Take real weapon damage on a paid recon rover, then retreat to the owned
	// depot. Repair is intentionally impossible during the three-second combat lock.
	var recon []sim.ID
	for _, entity := range r.view().Entities {
		if entity.Owner == 1 && entity.Type == "US.car" {
			recon = append(recon, entity.ID)
		}
	}
	if len(recon) != 1 {
		r.t.Fatal("paid recon rover missing")
	}
	r.issue(1, sim.Order{Kind: "move", Entities: recon, Position: sim.Vec{X: 48500, Y: 85500}})
	r.wait("recon takes actual exercise damage", 2200, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == recon[0] {
				return entity.Health < 1000
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "move", Entities: recon, Position: sim.Vec{X: 33500, Y: 119500}})
	r.wait("actual paid vehicle repair after retreat", 2400, func() bool { return r.complete("repair") })
	originalHQ := r.tags["home-hq"][0]
	r.wait("original HQ destroyed by real enemy weapons", 9000, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == originalHQ {
				return false
			}
		}
		return true
	})
	r.issue(1, sim.Order{Kind: "train", Entities: factory, Type: "US.rig"}, sim.Order{Kind: "attack_move", Entities: fighters, Position: r.region("base")})
	var emergency sim.ID
	r.wait("paid emergency rig production", 2500, func() bool {
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && entity.Type == "US.rig" && entity.ID != rig[0] {
				emergency = entity.ID
				return true
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "move", Entities: []sim.ID{emergency}, Position: sim.Vec{X: 40500, Y: 112500}})
	r.wait("emergency rig scouts legal replacement site", 1800, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == emergency {
				return entity.Position.X > 39500 && entity.Position.Y > 110500
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "build", Entities: []sim.ID{emergency}, Type: "hq", Position: sim.Vec{X: 43500, Y: 112500}})
	r.wait("replacement HQ construction", 4000, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}

func playReadTheCounter(r *authoredRun) {
	rifles, recon, apc, passengers := r.ids("starting-rifles"), r.ids("starting-recon"), r.ids("training-apc"), r.ids("transport-team")
	r.issue(1, sim.Order{Kind: "board", Entities: passengers, Target: apc[0]}, sim.Order{Kind: "attack_move", Entities: append(rifles, recon...), Position: r.region("training-cover")})
	r.wait("real transport boarding", 1200, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == apc[0] {
				return len(entity.Private.Passengers) == 2
			}
		}
		return false
	})
	r.wait("cover and detection lessons", 2400, func() bool { return r.complete("cover") && r.complete("detection") })
	r.checkpoint()
	r.issue(1, sim.Order{Kind: "attack_move", Entities: append(r.ids("starting-rifles"), r.ids("starting-recon")...), Position: r.region("site1")})
	r.wait("rifles defeat anti-armor infantry", 2400, func() bool {
		for _, objective := range r.view().Mission.Objectives {
			if objective.ID == "counters" {
				return objective.Progress >= 1
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "attack_move", Entities: r.ids("starting-rifles"), Position: r.region("site2")}, sim.Order{Kind: "move", Entities: apc, Position: r.region("site1")}, sim.Order{Kind: "attack_move", Entities: append(r.ids("starting-at"), r.ids("starting-armor")...), Position: r.region("site2")})
	r.wait("transport reaches forward marker", 2400, func() bool {
		point := r.region("site1")
		for _, entity := range r.view().Entities {
			if entity.ID == apc[0] {
				dx, dy := entity.Position.X-point.X, entity.Position.Y-point.Y
				return int64(dx)*int64(dx)+int64(dy)*int64(dy) < 2000*2000
			}
		}
		return false
	})
	r.issue(1, sim.Order{Kind: "unload", Entities: apc, Position: r.region("site1")})
	r.wait("counter and actual disembark objectives", 3600, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}

func playDefendTheSky(r *authoredRun) {
	aircraft, fighter, rifles, aa := r.ids("training-aircraft"), r.ids("training-fighter"), r.ids("starting-rifles"), r.ids("starting-aa")
	r.issue(1, sim.Order{Kind: "move", Entities: aircraft, Position: sim.Vec{X: 40500, Y: 94500}}, sim.Order{Kind: "patrol", Entities: fighter, Position: sim.Vec{X: 56500, Y: 82500}, Points: []sim.Vec{{X: 56500, Y: 82500}, {X: 65500, Y: 77500}}}, sim.Order{Kind: "move", Entities: aa, Position: sim.Vec{X: 56500, Y: 87500}}, sim.Order{Kind: "move", Entities: rifles, Position: sim.Vec{X: 45500, Y: 82500}})
	r.wait("strike aircraft takes off", 600, func() bool {
		for _, entity := range r.view().Entities {
			if entity.ID == aircraft[0] {
				return !entity.Landed
			}
		}
		return false
	})
	r.advance(120)
	r.issue(1, sim.Order{Kind: "return", Entities: aircraft})
	r.wait("real aircraft service cycle", 2400, func() bool { return r.complete("service") })
	r.checkpoint()
	r.wait("infantry enters exercise marker", 1200, func() bool { return r.complete("enter-mark") })
	r.wait("announced attack warning", 1200, func() bool { return r.engine.Tick() >= 700 })
	r.issue(1, sim.Order{Kind: "move", Entities: rifles, Position: sim.Vec{X: 20500, Y: 108500}})
	var airTarget sim.ID
	r.wait("hostile aircraft becomes visible", 3600, func() bool {
		for _, entity := range r.view().Entities {
			if entity.Owner == 2 && entity.Type == "IR.strike" && !entity.Landed {
				airTarget = entity.ID
				return true
			}
		}
		return r.complete("air-defense")
	})
	if !r.complete("air-defense") {
		r.issue(1, sim.Order{Kind: "attack", Entities: fighter, Target: airTarget})
	}
	r.wait("air defense, ABM interception and evacuation", 6000, func() bool { return r.engine.Outcome().Finished })
	paidMissile, interception := false, false
	for _, player := range r.engine.Debrief().Players {
		if player.Player == 4 {
			paidMissile = player.Metrics.MissileSpent >= 300000
		}
		if player.Player == 1 {
			interception = player.Metrics.InterceptorsFired > 0
		}
	}
	if !paidMissile || !interception {
		r.t.Fatal("missile lesson did not spend real missile credits and an interceptor charge")
	}
	// The exercise occurs at its actual forward battery, without baiting a
	// launcher onto noncombatant supply vehicles to manufacture its objective.
	for _, id := range r.ids("home-haulers") {
		for _, entity := range r.view().Entities {
			if entity.ID == id && (entity.Health != 1000 || entity.Position.Y < 95000) {
				r.t.Fatal("supply vehicle was used as missile bait")
			}
		}
	}
	r.finish()
}

func (r *authoredRun) army() []sim.ID {
	var ids []sim.ID
	for _, entity := range r.view().Entities {
		if entity.Owner != 1 || entity.Private == nil || entity.Private.Container != 0 || r.excludedArmy[entity.ID] {
			continue
		}
		unit, ok := r.catalog.Unit(entity.Type)
		if ok && unit.Weapon != "" && unit.Armor != "air" {
			ids = append(ids, entity.ID)
		}
	}
	return ids
}
func playCommandAMatch(r *authoredRun) {
	faction := r.faction
	factory, barracks, hq := r.ids("home-factory"), r.ids("home-barracks"), r.ids("home-hq")
	if faction == "SY" && r.difficulty == "hard" || faction == "US" && r.difficulty == "easy" {
		r.issue(1, sim.Order{Kind: "build", Entities: r.ids("home-rig"), Type: "turret", Position: sim.Vec{X: 28500, Y: 100500}})
	}
	r.issue(1, sim.Order{Kind: "gather", Entities: r.ids("home-haulers"), Target: 1}, sim.Order{Kind: "rally", Entities: factory, Position: r.region("site1")}, sim.Order{Kind: "rally", Entities: barracks, Position: r.region("site1")}, sim.Order{Kind: "attack_move", Entities: r.army(), Position: r.region("site1")})
	r.issue(1, sim.Order{Kind: "train", Entities: factory, Type: faction + ".tank"}, sim.Order{Kind: "train", Entities: factory, Type: faction + ".tank"}, sim.Order{Kind: "train", Entities: factory, Type: faction + ".tank"}, sim.Order{Kind: "train", Entities: factory, Type: faction + ".aa"}, sim.Order{Kind: "train", Entities: barracks, Type: faction + ".rifle"}, sim.Order{Kind: "train", Entities: barracks, Type: faction + ".rifle"})
	energy := int64(35000)
	ability, source, point := "recon_sweep", hq, r.region("base")
	switch faction {
	case "IR":
		ability, source = "relay_boost", r.ids("tutorial-survey")
		r.issue(1, sim.Order{Kind: "patrol", Entities: source, Position: sim.Vec{X: 40500, Y: 94500}, Points: []sim.Vec{{X: 40500, Y: 94500}, {X: 44500, Y: 98500}}})
	case "SY":
		energy, ability = 45000, "disperse"
	case "SA":
		energy, ability = 45000, "emergency_power"
	}
	r.wait("paid force and command energy", 4000, func() bool {
		count := 0
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && entity.Type == faction+".tank" {
				count++
			}
		}
		return count >= 5 && r.view().Economy.Energy >= energy
	})
	if faction == "SY" {
		for _, entity := range r.view().Entities {
			if entity.Owner == 1 && entity.Type == "SY.rifle" {
				point = entity.Position
				break
			}
		}
	}
	r.issue(1, sim.Order{Kind: "ability", Entities: source, Type: ability, Position: point})
	r.wait("chosen faction command ability", 100, func() bool { return r.complete("faction-ability") })
	r.checkpoint()
	// Replacements cost real credits/Supply and use the normal queues. Target
	// decisions below use only the human's currently visible entities. Initial
	// authored production coordinates provide the same destination hints as the
	// briefing; no hidden enemy state is read to choose orders.
	objectives := []string{"enemy-barracks", "enemy-hq", "enemy-factory", "enemy-service"}
	for wave := 0; wave < 24 && !r.engine.Outcome().Finished; wave++ {
		if wave%2 == 0 {
			for _, kind := range []string{"tank", "tank", "tank", "artillery"} {
				r.tryIssue(sim.Order{Kind: "train", Entities: factory, Type: faction + "." + kind})
			}
			for range 3 {
				r.tryIssue(sim.Order{Kind: "train", Entities: barracks, Type: faction + ".rifle"})
			}
		}
		point := []sim.Vec{{X: 99500, Y: 29500}, {X: 106500, Y: 22500}, {X: 114500, Y: 29500}, {X: 118500, Y: 21500}}[wave%4]
		var target sim.ID
		view := r.view()
		for _, tag := range objectives {
			for _, entity := range view.Entities {
				if entity.Owner == 2 && entity.ID == r.tags[tag][0] {
					target, point = entity.ID, entity.Position
					break
				}
			}
			if target != 0 {
				break
			}
		}
		// Deal with a visible armed defender before deliberately focusing a
		// building. The army still acquires targets normally between orders.
		nearest := int64(18000 * 18000)
		for _, enemy := range view.Entities {
			if enemy.Owner != 2 {
				continue
			}
			unit, ok := r.catalog.Unit(enemy.Type)
			if !ok || unit.Weapon == "" {
				continue
			}
			for _, own := range view.Entities {
				if own.Owner != 1 || own.Position.Y > 70000 {
					continue
				}
				ownUnit, ok := r.catalog.Unit(own.Type)
				if !ok || ownUnit.Weapon == "" {
					continue
				}
				dx, dy := int64(own.Position.X-enemy.Position.X), int64(own.Position.Y-enemy.Position.Y)
				if d := dx*dx + dy*dy; d < nearest {
					nearest, target, point = d, enemy.ID, enemy.Position
				}
			}
		}
		r.tryIssue(sim.Order{Kind: "rally", Entities: factory, Position: point})
		r.tryIssue(sim.Order{Kind: "rally", Entities: barracks, Position: point})
		if len(r.army()) > 0 {
			r.issue(1, sim.Order{Kind: "attack_move", Entities: r.army(), Position: point})
		}
		if target != 0 && len(r.army()) > 0 {
			var attackers []sim.ID
			var candidates []sim.Order
			for _, id := range r.army() {
				candidates = append(candidates, sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
			}
			for offset := 0; offset < len(candidates); offset += 32 {
				batch := candidates[offset:min(offset+32, len(candidates))]
				preview, err := r.engine.PreviewCandidates(1, batch)
				if err != nil {
					r.t.Fatal(err)
				}
				for index, result := range preview {
					if result.Accepted {
						attackers = append(attackers, batch[index].Entities[0])
					}
				}
			}
			if len(attackers) > 0 {
				// Focus with the nearest small detachment. Sending the whole army
				// to one direct-attack approach point creates avoidable congestion;
				// the remaining force keeps its normal attack-move formation.
				positions := map[sim.ID]sim.Vec{}
				for _, entity := range r.view().Entities {
					positions[entity.ID] = entity.Position
				}
				distance := func(id sim.ID) int64 {
					p := positions[id]
					dx, dy := int64(p.X-point.X), int64(p.Y-point.Y)
					return dx*dx + dy*dy
				}
				sort.Slice(attackers, func(i, j int) bool {
					a, b := distance(attackers[i]), distance(attackers[j])
					if a == b {
						return attackers[i] < attackers[j]
					}
					return a < b
				})
				attackers = attackers[:min(len(attackers), 8)]
				r.issue(1, sim.Order{Kind: "attack", Entities: attackers, Target: target})
			}
		}
		r.advance(600)
	}
	r.wait("short battle neutralizes real enemy production", 1, func() bool { return r.engine.Outcome().Finished })
	r.finish()
}

// Availability is an advisory Go check. Execution receipts still must accept
// every submitted order; waiting for cash, Supply, or a queue slot is not an
// assertion failure and cannot bypass payment or production time.
func (r *authoredRun) tryIssue(order sim.Order) bool {
	preview, err := r.engine.PreviewOrders(1, []sim.Order{order})
	if err != nil || len(preview) != 1 || !preview[0].Accepted {
		return false
	}
	r.issue(1, order)
	return true
}

func TestAuthoredTutorialCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored-mission playthrough matrix; run without -short")
	}
	tutorials := []struct {
		id   string
		play func(*authoredRun)
	}{{"tutorial-1-give-an-order", playGiveAnOrder}, {"tutorial-2-operate-a-base", playOperateABase}, {"tutorial-3-read-the-counter", playReadTheCounter}, {"tutorial-4-defend-the-sky", playDefendTheSky}}
	for _, tutorial := range tutorials {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(strings.TrimPrefix(tutorial.id, "tutorial-")+"/"+difficulty, func(t *testing.T) { tutorial.play(newAuthoredRun(t, tutorial.id, difficulty, "")) })
		}
	}
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run("5-command-a-match/"+faction+"/"+difficulty, func(t *testing.T) {
				playCommandAMatch(newAuthoredRun(t, "tutorial-5-command-a-match", difficulty, faction))
			})
		}
	}

}
