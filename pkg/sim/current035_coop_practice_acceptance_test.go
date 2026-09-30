package sim_test

// Separate current-source courses. They never mutate engine state, query tags,
// inspect private goal conditions, or submit orders for an AI/script commander.
// Root installs this source-only overlay in its private qualification source.
import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

type current035Course struct {
	Format string `json:"format"`
	Version uint32 `json:"version"`
	SourceRoot string `json:"source_root"`
	Ruleset string `json:"ruleset"`
	Seed uint64 `json:"seed"`
	Cases []current035Case `json:"cases"`
}
type current035Case struct {
	MissionID string `json:"mission_id"`
	Difficulty string `json:"difficulty"`
	AllyAI string `json:"ally_ai"`
	MissionPath string `json:"mission_path"`
	MissionSHA256 string `json:"mission_sha256"`
	MapPath string `json:"map_path"`
	MapSHA256 string `json:"map_sha256"`
	RequiredGoals []string `json:"required_goals"`
	OptionalGoal string `json:"optional_goal"`
	PublicRegions []string `json:"public_regions"`
	ReconnectLimit sim.Tick `json:"reconnect_limit"`
	AssaultLimit sim.Tick `json:"assault_limit"`
	ConvoyLegLimit sim.Tick `json:"convoy_leg_limit"`
}
type current035Receipt struct {
	Tick sim.Tick `json:"tick"`
	Player sim.PlayerID `json:"player"`
	Sequence uint32 `json:"sequence"`
	Orders []sim.Order `json:"orders"`
	Results []sim.OrderResult `json:"results"`
}
type current035Run struct {
	t *testing.T
	course current035Course
	input current035Case
	catalog *content.Catalog
	gameMap content.Map
	definition content.Mission
	engine, twin *sim.Engine
	replay *sim.Replay
	sequence uint32
	orders []current035Receipt
	initialHash string
	midpoint, lastCheckpoint sim.Tick
	allyStarts map[sim.ID]sim.Vec
	allyMoved bool
	failureHash string
}

func current035Inputs(t *testing.T, env, ruleset string) current035Course {
	t.Helper()
	path := os.Getenv(env)
	if path == "" { t.Fatalf("explicit %s input path required", env) }
	data, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	var input current035Course
	if err = json.Unmarshal(data, &input); err != nil { t.Fatal(err) }
	if input.Format != "frontline-current-035-acceptance" || input.Version != 1 || input.Ruleset != ruleset || len(input.Cases) == 0 || !filepath.IsAbs(input.SourceRoot) {
		t.Fatal("unsupported or incomplete current-source input")
	}
	return input
}
func current035Pinned(t *testing.T, root, path, want string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, path))
	if err != nil { t.Fatal(err) }
	if got := fmt.Sprintf("%x", sha256.Sum256(data)); got != want {
		t.Fatalf("input pin mismatch for %s: got %s, want %s", path, got, want)
	}
	return data
}
func newCurrent035Run(t *testing.T, course current035Course, input current035Case) *current035Run {
	t.Helper()
	r := &current035Run{t: t, course: course, input: input, catalog: content.MustBase(), allyStarts: map[sim.ID]sim.Vec{}}
	t.Cleanup(func() { if t.Failed() { r.writeEvidence("failed-unclassified") } })
	mapData := current035Pinned(t, course.SourceRoot, input.MapPath, input.MapSHA256)
	var err error
	r.gameMap, err = content.DecodeMap(mapData)
	if err != nil { t.Fatal(err) }
	missionData := current035Pinned(t, course.SourceRoot, input.MissionPath, input.MissionSHA256)
	r.definition, err = content.DecodeMission(missionData, r.catalog, r.gameMap)
	if err != nil { t.Fatal(err) }
	if r.definition.ID != input.MissionID { t.Fatal("mission input identity mismatch") }
	if input.AllyAI != "" {
		if r.definition.Mode != "coop" || len(r.definition.Players) < 2 || r.definition.Players[0].Control(0) != "human" || r.definition.Players[1].ID != 2 || r.definition.Players[1].Control(1) != "human" {
			t.Fatal("AI ally input must replace only the second authored human slot")
		}
		// The public co-op lobby applies precisely these control fields to its
		// copied definition. Every authored actor, goal and trigger is retained.
		r.definition.Players[1].Controller = "ai"
		r.definition.Players[1].AI = input.AllyAI
		if err = r.definition.Validate(r.catalog, r.gameMap); err != nil { t.Fatal(err) }
	}
	r.engine = r.newEngine()
	r.initialHash = r.engine.Hash()
	r.replay, err = sim.NewReplay(r.engine)
	if err != nil { t.Fatal(err) }
	if r.engine.Metadata().Ruleset != course.Ruleset { t.Fatal("launch ruleset mismatch") }
	for _, actor := range r.view().Entities {
		if actor.Owner == 2 { if _, ok := r.catalog.Unit(actor.Type); ok { r.allyStarts[actor.ID] = actor.Position } }
	}
	r.advance(100)
	return r
}
func (r *current035Run) newEngine() *sim.Engine {
	r.t.Helper()
	var engine *sim.Engine
	var err error
	if r.course.Ruleset == "practice-v1" {
		engine, err = sim.NewPracticeMission(r.catalog, r.gameMap, r.definition, r.input.Difficulty, r.course.Seed)
	} else {
		engine, err = sim.NewMission(r.catalog, r.gameMap, r.definition, r.input.Difficulty, r.course.Seed)
	}
	if err != nil { r.t.Fatal(err) }
	return engine
}
func (r *current035Run) view() sim.View {
	r.t.Helper()
	view, ok := r.engine.PlayerView(1)
	if !ok || view.Mission == nil { r.t.Fatal("public human mission perspective unavailable") }
	return view
}
func (r *current035Run) advance(n sim.Tick) {
	r.t.Helper()
	for step := sim.Tick(0); step < n && !r.engine.Outcome().Finished; step++ {
		r.engine.Advance()
		if r.twin != nil { r.twin.Advance() }
		if r.engine.Tick()%600 == 0 {
			if r.twin != nil && r.engine.Hash() != r.twin.Hash() { r.t.Fatal("restored branch diverged at tick", r.engine.Tick()) }
			if err := r.replay.Capture(r.engine, true); err != nil { r.t.Fatal(err) }
			r.lastCheckpoint = r.engine.Tick()
		}
		if r.input.AllyAI != "" && r.engine.Tick()%200 == 0 {
			for _, actor := range r.view().Entities {
				if start, ok := r.allyStarts[actor.ID]; ok && actor.Owner == 2 && actor.Position != start { r.allyMoved = true }
			}
		}
	}
}
func (r *current035Run) issue(orders ...sim.Order) {
	r.t.Helper()
	if len(orders) == 0 || r.engine.Outcome().Finished { r.t.Fatal("cannot issue empty or post-outcome course orders") }
	r.sequence++
	tick := r.engine.Tick()
	if err := r.engine.Submit(1, r.sequence, orders); err != nil { r.t.Fatal("human Submit", err) }
	if r.twin != nil { if err := r.twin.Submit(1, r.sequence, orders); err != nil { r.t.Fatal("restored human Submit", err) } }
	r.advance(1)
	receipts := []sim.OrderResult{}
	for _, result := range r.view().Results {
		if result.Player == 1 && result.Sequence == r.sequence { receipts = append(receipts, result) }
	}
	r.orders = append(r.orders, current035Receipt{tick, 1, r.sequence, current035StoredOrders(orders), append([]sim.OrderResult(nil), receipts...)})
	if len(receipts) != len(orders) { r.t.Fatal("missing human order receipts", receipts) }
	for _, receipt := range receipts { if !receipt.Accepted { r.t.Fatal("ordinary human order rejected", receipt) } }
}
// Freeze the auxiliary human receipt log at admission. Callers may reuse a
// batch (the power control does), while canonical Submit already clones its
// own scheduled/replay intentions. Order has two mutable slices to detach.
func current035StoredOrders(orders []sim.Order) []sim.Order {
	if orders == nil { return nil }
	stored := make([]sim.Order, len(orders))
	copy(stored, orders)
	for i, order := range orders {
		if order.Entities != nil {
			stored[i].Entities = make([]sim.ID, len(order.Entities))
			copy(stored[i].Entities, order.Entities)
		}
		if order.Points != nil {
			stored[i].Points = make([]sim.Vec, len(order.Points))
			copy(stored[i].Points, order.Points)
		}
	}
	return stored
}
func (r *current035Run) try(order sim.Order) bool {
	if r.engine.Outcome().Finished { return false }
	preview, err := r.engine.PreviewOrders(1, []sim.Order{order})
	if err != nil || len(preview) != 1 || !preview[0].Accepted { return false }
	r.issue(order)
	return true
}
func (r *current035Run) checkpoint() {
	r.t.Helper()
	if r.engine.Outcome().Finished || r.engine.Tick() == 0 { r.t.Fatal("checkpoint must precede real mission termination") }
	data, err := r.engine.Save()
	if err != nil { r.t.Fatal(err) }
	r.twin, err = sim.Restore(r.catalog, data)
	if err != nil { r.t.Fatal(err) }
	if r.twin.Hash() != r.engine.Hash() || r.twin.Metadata() != r.engine.Metadata() { r.t.Fatal("midpoint save restore diverged") }
	r.midpoint = r.engine.Tick()
	if r.lastCheckpoint != r.engine.Tick() {
		if err = r.replay.Capture(r.engine, true); err != nil { r.t.Fatal(err) }
		r.lastCheckpoint = r.engine.Tick()
	}
}
func (r *current035Run) wait(label string, limit sim.Tick, predicate func() bool, policy func()) {
	r.t.Helper()
	end := r.engine.Tick() + limit
	for !predicate() && !r.engine.Outcome().Finished && r.engine.Tick() < end {
		if policy != nil { policy() }
		r.advance(10)
	}
	if !predicate() { r.t.Fatalf("public goal wait failed: %s at tick %d outcome %+v goals %+v", label, r.engine.Tick(), r.engine.Outcome(), r.view().Mission.Objectives) }
}
func (r *current035Run) complete(id string) bool {
	for _, goal := range r.view().Mission.Objectives { if goal.ID == id { return goal.Complete } }
	r.t.Fatal("public goal missing", id)
	return false
}
func (r *current035Run) region(id string) sim.Vec {
	for _, region := range r.gameMap.Regions {
		if region.ID == id { return sim.Vec{X: (region.Min.X + region.Max.X)/2, Y: (region.Min.Y + region.Max.Y)/2} }
	}
	r.t.Fatal("declared public map region missing", id)
	return sim.Vec{}
}
func (r *current035Run) owned(kind string) []sim.ID {
	ids := []sim.ID{}
	for _, actor := range r.view().Entities {
		if actor.Owner == 1 && actor.Type == kind && actor.Complete && actor.Health > 0 { ids = append(ids, actor.ID) }
	}
	return ids
}
func (r *current035Run) army() []sim.ID {
	ids := []sim.ID{}
	for _, actor := range r.view().Entities {
		unit, ok := r.catalog.Unit(actor.Type)
		if actor.Owner == 1 && actor.Complete && actor.Enabled && actor.Health > 0 && ok && unit.Weapon != "" && unit.Armor != "air" && actor.Private != nil && actor.Private.Container == 0 { ids = append(ids, actor.ID) }
	}
	return ids
}
func current035Dist(a, b sim.Vec) int64 { x, y := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y); return x*x+y*y }
func current035Enemy(view sim.View, owner sim.PlayerID) bool {
	team := uint32(0)
	for _, player := range view.Players { if player.ID == 1 { team = player.Team } }
	for _, player := range view.Players { if player.ID == owner { return !player.Defeated && player.Team != team } }
	return false
}
func (r *current035Run) publicDefeated(owner sim.PlayerID) bool {
	for _, player := range r.view().Players { if player.ID == owner { return player.Defeated } }
	r.t.Fatal("public player missing", owner)
	return false
}
// Public map centres guide exploration. Only current visible target identities
// enter attacks. Authored Initial, Tags and goal Condition fields are never read.
func (r *current035Run) coopPolicy() func() {
	first := 0
	if r.input.MissionID == "twin-outposts" { first = 1 }
	next, sweep, visitedAt := r.engine.Tick(), first, r.engine.Tick()
	return func() {
		if r.engine.Tick() < next || r.engine.Outcome().Finished { return }
		next = r.engine.Tick() + 400
		view := r.view()
		point := r.region(r.input.PublicRegions[sweep])
		if r.input.MissionID == "twin-outposts" && !r.complete("reconnection") { point = r.region(r.input.PublicRegions[0]) }
		army := r.army()
		var front sim.Vec
		for _, actor := range view.Entities { if len(army) > 0 && actor.ID == army[0] { front = actor.Position; break } }
		var target sim.ID
		best := int64(1<<62)
		if r.input.MissionID != "twin-outposts" || r.complete("reconnection") {
			for _, actor := range view.Entities {
				if !current035Enemy(view, actor.Owner) || actor.Health <= 0 { continue }
				priority := int64(3)
				if rule, ok := r.catalog.Building(actor.Type); ok {
					if rule.Role == "factory" || rule.Role == "barracks" || rule.Role == "airfield" || rule.Role == "hangar" || rule.Role == "workshop_air" { priority = 0 } else if rule.Role == "hq" { priority = 2 }
				} else if _, ok := r.catalog.Unit(actor.Type); ok { priority = 1 }
				distance := current035Dist(front, actor.Position)
				if priority == 1 && distance > 18000*18000 { continue }
				score := priority*int64(128000*128000) + distance
				if score < best { target, point, best = actor.ID, actor.Position, score }
			}
			if target == 0 && current035Dist(front, point) < 12000*12000 && r.engine.Tick()-visitedAt >= 1600 {
				sweep++
				if sweep >= len(r.input.PublicRegions) { sweep = first }
				point, visitedAt = r.region(r.input.PublicRegions[sweep]), r.engine.Tick()
			}
		}
		for _, producerKind := range []string{"factory", "barracks"} {
			producers := r.owned(producerKind)
			if len(producers) == 0 { continue }
			producer := producers[:1]
			r.try(sim.Order{Kind: "rally", Entities: producer, Position: point})
			kind := "US.tank"
			if producerKind == "barracks" { kind = "US.rifle" }
			for range 2 { r.try(sim.Order{Kind: "train", Entities: producer, Type: kind}) }
			if producerKind == "factory" && len(r.owned("US.aa")) < 2 { r.try(sim.Order{Kind: "train", Entities: producer, Type: "US.aa"}) }
		}
		for begin := 0; begin < len(army) && !r.engine.Outcome().Finished; begin += 64 {
			end := begin+64
			if end > len(army) { end = len(army) }
			r.try(sim.Order{Kind: "attack_move", Entities: army[begin:end], Position: point})
		}
		if target != 0 {
			for _, id := range army { if !r.engine.Outcome().Finished { r.try(sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target}) } }
		}
	}
}
func (r *current035Run) powerSurvivalControl() {
	orders := []sim.Order{}
	for _, actor := range r.view().Entities {
		if actor.Owner == 1 && (actor.Type == "hq" || actor.Type == "power") { orders = append(orders, sim.Order{Kind: "power", Entities: []sim.ID{actor.ID}, Index: 0}) }
	}
	if len(orders) != 3 { r.t.Fatal("co-op power survival control needs original HQ and two plants") }
	r.issue(orders...)
	view := r.view()
	if view.Outcome.Finished || r.publicDefeated(1) || r.publicDefeated(2) || view.Economy.PowerCapacity >= view.Economy.PowerDemand { r.t.Fatal("living low-power commander was lost", view.Outcome, view.Economy) }
	for _, goal := range view.Mission.Objectives { if goal.Failure && goal.Complete { r.t.Fatal("living HQ incorrectly met failure count_type", goal) } }
	save, err := r.engine.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.catalog, save)
	if err != nil || restored.Hash() != r.engine.Hash() { r.t.Fatal("power survival save restore diverged", err) }
	for i := range orders { orders[i].Index = 1 }
	r.issue(orders...)
}
func (r *current035Run) playCoop() {
	r.powerSurvivalControl()
	var foreign sim.ID
	view := r.view()
	for _, actor := range view.Entities { if actor.Owner == 2 && actor.Type == "SA.rig" { foreign = actor.ID; break } }
	if foreign == 0 { r.t.Fatal("allied visible rig boundary unavailable") }
	preview, err := r.engine.PreviewOrders(1, []sim.Order{{Kind: "move", Entities: []sim.ID{foreign}, Position: r.region("central-connection")}})
	if err == nil && len(preview) == 1 && preview[0].Accepted { r.t.Fatal("human ownership boundary admitted AI ally orders") }
	haulers := r.owned("US.hauler")
	if len(haulers) == 0 || len(view.Fields) == 0 { r.t.Fatal("public economy setup unavailable") }
	field, score := view.Fields[0].ID, int64(1<<62)
	for _, actor := range view.Entities {
		if actor.ID != haulers[0] { continue }
		for _, observed := range view.Fields { if d := current035Dist(actor.Position, observed.Position); d < score { field, score = observed.ID, d } }
	}
	r.issue(sim.Order{Kind: "gather", Entities: haulers, Target: sim.ID(field)})
	policy := r.coopPolicy()
	if r.input.MissionID == "twin-outposts" {
		r.wait("public central connection hold", r.input.ReconnectLimit, func() bool { return r.complete("reconnection") }, policy)
		r.checkpoint()
		r.wait("public joint assault completion", r.input.AssaultLimit, func() bool { return r.engine.Outcome().Finished }, policy)
	} else {
		r.wait("first public convoy activation", 600, func() bool { return r.convoy("convoy-1").Active }, policy)
		r.issue(sim.Order{Kind: "convoy_hold", Type: "convoy-1"})
		r.wait("public hostile commander defeat before convoy release", r.input.AssaultLimit, func() bool { return r.publicDefeated(4) }, policy)
		r.checkpoint()
		for _, id := range []string{"convoy-1", "convoy-2", "convoy-3"} {
			r.wait("next public convoy "+id, 2000, func() bool { return r.convoy(id).Active }, policy)
			r.issue(sim.Order{Kind: "convoy_hold", Type: id})
			r.issue(sim.Order{Kind: "convoy_advance", Type: id, Index: 1})
			convoy := r.convoy(id)
			if convoy.Held || convoy.Route != 1 || convoy.CountdownUntil <= r.engine.Tick() || len(convoy.Approved) != 0 { r.t.Fatal("single living human did not release convoy with its ordinary route countdown", convoy) }
			r.wait("public convoy completed "+id, r.input.ConvoyLegLimit, func() bool { return r.convoy(id).Completed }, policy)
		}
	}
	r.finish()
}
func (r *current035Run) convoy(id string) sim.ConvoyState {
	for _, convoy := range r.view().Mission.Convoys { if convoy.ID == id { return convoy } }
	r.t.Fatal("public convoy missing", id)
	return sim.ConvoyState{}
}
func (r *current035Run) playPractice() {
	rifles, barracks := r.owned("US.rifle"), r.owned("barracks")
	if len(rifles) != 4 || len(barracks) != 1 { r.t.Fatal("unchanged public editor input initial group unavailable") }
	// Authored editor test play keeps mission rules; sandbox cheats cannot
	// satisfy its objectives, despite the practice metadata marker.
	before := r.engine.Hash()
	preview, err := r.engine.PreviewOrders(1, []sim.Order{{Kind: "practice_resources", Index: 9999}})
	if err != nil || len(preview) != 1 || preview[0].Accepted || preview[0].Code != "practice_only" || r.engine.Hash() != before { r.t.Fatal("authored editor practice leaked sandbox controls", preview, err) }
	r.issue(sim.Order{Kind: "rally", Entities: barracks, Position: r.region(r.input.PublicRegions[0])}, sim.Order{Kind: "train", Entities: barracks, Type: "US.rifle"}, sim.Order{Kind: "move", Entities: rifles, Position: r.region(r.input.PublicRegions[0])})
	r.wait("public editor movement goal", r.input.ReconnectLimit, func() bool { return r.complete("move") }, nil)
	r.checkpoint()
	r.issue(sim.Order{Kind: "stop", Entities: rifles})
	r.issue(sim.Order{Kind: "attack_move", Entities: rifles, Position: r.region(r.input.PublicRegions[1])})
	r.wait("ordinary editor combat and paid production", r.input.AssaultLimit, func() bool { return r.engine.Outcome().Finished }, nil)
	r.finish()
}
func (r *current035Run) assertPersistence(reason string, team uint32) {
	r.t.Helper()
	outcome := r.engine.Outcome()
	if !outcome.Finished || outcome.Reason != reason || outcome.WinningTeam != team || r.engine.Debrief() == nil { r.t.Fatal("real terminal mission/debrief mismatch", outcome) }
	if r.midpoint == 0 || r.midpoint >= r.engine.Tick() || r.twin == nil || r.engine.Hash() != r.twin.Hash() { r.t.Fatal("actual midpoint save branch did not preserve terminal state") }
	data, err := r.engine.Save()
	if err != nil { r.t.Fatal(err) }
	restored, err := sim.Restore(r.catalog, data)
	if err != nil || restored.Hash() != r.engine.Hash() || restored.Metadata() != r.engine.Metadata() { r.t.Fatal("terminal save restore diverged", err) }
	if err = r.replay.Capture(r.engine, false); err != nil { r.t.Fatal(err) }
	encoded, err := r.replay.Encode()
	if err != nil { r.t.Fatal(err) }
	decoded, err := sim.DecodeReplay(encoded)
	if err != nil { r.t.Fatal(err) }
	if decoded.Metadata != r.engine.Metadata() { r.t.Fatal("replay metadata marker diverged") }
	for _, checkpoint := range []bool{false, true} {
		copy := *decoded
		copy.Checkpoints = nil
		if checkpoint {
			for _, entry := range decoded.Checkpoints { if entry.Tick <= r.midpoint { copy.Checkpoints = append(copy.Checkpoints, entry) } }
			if len(copy.Checkpoints) == 0 { r.t.Fatal("actual midpoint replay checkpoint missing") }
		}
		played, err := copy.Seek(r.catalog, r.engine.Tick())
		if err != nil || played.Hash() != r.engine.Hash() || played.Metadata() != r.engine.Metadata() { r.t.Fatalf("replay mismatch checkpoint=%v error=%v", checkpoint, err) }
	}
}
func (r *current035Run) finish() {
	r.assertPersistence("mission_complete", 1)
	for _, id := range r.input.RequiredGoals { if !r.complete(id) { r.t.Fatal("required public goal incomplete", id) } }
	if !r.complete(r.input.OptionalGoal) { r.t.Fatal("public preservation optional goal incomplete", r.input.OptionalGoal) }
	for _, goal := range r.view().Mission.Objectives { if goal.Failure && goal.Complete { r.t.Fatal("success included a public failure goal", goal) } }
	if r.input.AllyAI != "" && !r.allyMoved { r.t.Fatal("no autonomous ally movement observed in public shared sight") }
	fresh := r.newEngine()
	if fresh.Hash() != r.initialHash { r.t.Fatal("configured restart initial state changed") }
	failureReplay, err := sim.NewReplay(fresh)
	if err != nil { r.t.Fatal(err) }
	failure := &current035Run{t: r.t, course: r.course, input: r.input, catalog: r.catalog, gameMap: r.gameMap, definition: r.definition, engine: fresh, replay: failureReplay, allyStarts: map[sim.ID]sim.Vec{}}
	r.t.Cleanup(func() { if r.t.Failed() { failure.writeEvidence("failed-restart-unclassified") } })
	failure.advance(100)
	failure.checkpoint()
	failure.issue(sim.Order{Kind: "surrender"})
	failure.assertPersistence("mission_failed", 0)
	if r.input.AllyAI != "" && failure.publicDefeated(2) { r.t.Fatal("fresh human failure incorrectly defeated the configured AI ally") }
	r.failureHash = failure.engine.Hash()
	failure.writeEvidence("failure-verified")
	r.writeEvidence("completed")
	r.t.Logf("CURRENT035 course=%s mission=%s difficulty=%s ally_ai=%s tick=%d midpoint=%d human_receipts=%d hash=%s failure_hash=%s", r.course.Ruleset, r.input.MissionID, r.input.Difficulty, r.input.AllyAI, r.engine.Tick(), r.midpoint, len(r.orders), r.engine.Hash(), r.failureHash)
}
func (r *current035Run) writeEvidence(status string) {
	directory := os.Getenv("FRONTLINE_CURRENT_COOP_PRACTICE_EVIDENCE")
	if directory == "" || r.engine == nil { return }
	if err := os.MkdirAll(directory, 0755); err != nil { r.t.Errorf("evidence directory: %v", err); return }
	name := r.input.MissionID+"-"+r.input.Difficulty+"-"+r.course.Ruleset
	if r.input.AllyAI != "" { name += "-ally-"+r.input.AllyAI }
	record := struct {
		Status string `json:"status"`
		Input current035Case `json:"input"`
		Metadata sim.Metadata `json:"metadata"`
		Outcome sim.Outcome `json:"outcome"`
		Midpoint sim.Tick `json:"midpoint"`
		FinalHash string `json:"final_hash"`
		FailureHash string `json:"failure_hash"`
		AllyMoved bool `json:"ally_moved"`
		View sim.View `json:"view"`
		Orders []current035Receipt `json:"human_orders"`
	}{status, r.input, r.engine.Metadata(), r.engine.Outcome(), r.midpoint, r.engine.Hash(), r.failureHash, r.allyMoved, r.view(), r.orders}
	data, err := json.MarshalIndent(record, "", "  ")
	if err == nil { err = os.WriteFile(filepath.Join(directory, name+"."+status+".json"), append(data, '\n'), 0644) }
	if err != nil { r.t.Errorf("evidence record: %v", err) }
	if data, err = r.engine.Save(); err == nil { err = os.WriteFile(filepath.Join(directory, name+"."+status+".save.json"), data, 0644) }
	if err != nil { r.t.Errorf("save evidence: %v", err) }
	if r.replay != nil {
		if err = r.replay.Capture(r.engine, false); err == nil {
			if data, err = r.replay.Encode(); err == nil { err = os.WriteFile(filepath.Join(directory, name+"."+status+".replay.json.gz"), data, 0644) }
		}
		if err != nil { r.t.Errorf("replay evidence: %v", err) }
	}
}
func TestCurrent035CoopHumanAICompletion(t *testing.T) {
	if testing.Short() { t.Skip("separate dedicated current-source one-human plus AI ally course") }
	course := current035Inputs(t, "FRONTLINE_CURRENT_COOP_CONFIG", "scenario-v2")
	for _, input := range course.Cases {
		t.Run(input.MissionID+"/"+input.Difficulty+"/ally-"+input.AllyAI, func(t *testing.T) { newCurrent035Run(t, course, input).playCoop() })
	}
}
func TestCurrent035EditorPracticeCompletion(t *testing.T) {
	if testing.Short() { t.Skip("separate dedicated current-source editor practice mission course") }
	course := current035Inputs(t, "FRONTLINE_CURRENT_PRACTICE_CONFIG", "practice-v1")
	for _, input := range course.Cases {
		t.Run(input.MissionID+"/"+input.Difficulty, func(t *testing.T) { newCurrent035Run(t, course, input).playPractice() })
	}
}
