package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Opt-in ordinary-game observation only. No gameplay state is manufactured and
// no planner, pathfinder, private executor or mutation helper is called here.
// Passing hard invariants does not automatically pass competence review.
type aiCompetenceEvidenceRef struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type aiCompetenceBinding struct {
	Schema                    string                  `json:"schema"`
	Mode                      string                  `json:"mode"`
	MissingEssentials         []string                `json:"missing_essentials"`
	SimulationVersion         string                  `json:"simulation_version"`
	SourceRoot                string                  `json:"source_root"`
	SourceManifest            aiCompetenceEvidenceRef `json:"source_manifest"`
	RootUnionReceipt          aiCompetenceEvidenceRef `json:"root_union_receipt"`
	EssentialSuccessorReceipt aiCompetenceEvidenceRef `json:"essential_successor_receipt"`
}

type aiCompetenceCase struct {
	ID             string    `json:"id"`
	Map            string    `json:"map"`
	Seed           uint64    `json:"seed"`
	Factions       [2]string `json:"factions"`
	Difficulties   [2]string `json:"difficulties"`
	HorizonSeconds uint32    `json:"horizon_seconds"`
}

func aiCompetenceCases() []aiCompetenceCase {
	rows := []aiCompetenceCase{
		{"diagnose-US-IR-normal", "copper-junction", 28001, [2]string{"US", "IR"}, [2]string{"normal", "normal"}, 300},
		{"diagnose-IR-US-normal", "copper-junction", 28001, [2]string{"IR", "US"}, [2]string{"normal", "normal"}, 300},
		{"midgame-US-IR-normal", "copper-junction", 28001, [2]string{"US", "IR"}, [2]string{"normal", "normal"}, 900},
		{"midgame-IR-US-normal", "copper-junction", 28001, [2]string{"IR", "US"}, [2]string{"normal", "normal"}, 900},
		{"midgame-SY-SA-normal", "copper-junction", 28001, [2]string{"SY", "SA"}, [2]string{"normal", "normal"}, 900},
		{"midgame-SA-SY-normal", "copper-junction", 28001, [2]string{"SA", "SY"}, [2]string{"normal", "normal"}, 900},
	}
	for _, pair := range [][2]string{{"US", "IR"}, {"IR", "US"}, {"SY", "SA"}, {"SA", "SY"}} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			rows = append(rows, aiCompetenceCase{pair[0] + "-" + difficulty, "copper-junction", 28001, pair, [2]string{difficulty, "normal"}, 240})
		}
	}
	return rows
}

func aiCompetenceDigest(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func aiCompetenceReadRef(t *testing.T, ref aiCompetenceEvidenceRef) []byte {
	t.Helper()
	if !filepath.IsAbs(ref.Path) || len(ref.SHA256) != 64 {
		t.Fatal("final receipt needs an absolute path and exact SHA256", ref.Path)
	}
	data, err := os.ReadFile(ref.Path)
	if err != nil || aiCompetenceDigest(data) != ref.SHA256 {
		t.Fatal("final source receipt identity mismatch", ref.Path, err)
	}
	return data
}

func aiCompetenceRequireBinding(t *testing.T) (aiCompetenceBinding, []byte) {
	t.Helper()
	path := os.Getenv("FRONTLINE_AI_COMPETENCE_BINDING")
	if !filepath.IsAbs(path) {
		t.Fatal("ordinary competence requires an exact root 0.3.5 source binding")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var binding aiCompetenceBinding
	if err = json.Unmarshal(data, &binding); err != nil {
		t.Fatal(err)
	}
	if binding.Schema != "frontline-ai-competence-binding-v1" || binding.SimulationVersion != "0.3.5" {
		t.Fatal("historical or incomplete source cannot be ordinary competence evidence", Version, binding.SimulationVersion)
	}
	if Version != binding.SimulationVersion {
		t.Fatal("historical or incomplete source cannot be ordinary competence evidence", Version, binding.SimulationVersion)
	}
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	activeRoot, err := filepath.Abs(filepath.Join(cwd, "..", ".."))
	if err != nil || activeRoot != filepath.Clean(binding.SourceRoot) {
		t.Fatal("test source is not the exact bound root union", activeRoot, binding.SourceRoot, err)
	}
	refs := []aiCompetenceEvidenceRef{binding.RootUnionReceipt}
	switch binding.Mode {
	case "provisional_baseline":
		missing := map[string]bool{}
		for _, name := range binding.MissingEssentials {
			if name != "ground-perf" && name != "ground-support" && name != "rig-cash-saving" {
				t.Fatal("unknown provisional missing essential", name)
			}
			if missing[name] {
				t.Fatal("duplicate provisional missing essential", name)
			}
			missing[name] = true
		}
		if !missing["ground-perf"] || !missing["ground-support"] {
			t.Fatal("this provisional baseline must explicitly retain both pending ground essentials")
		}
		if binding.EssentialSuccessorReceipt.Path != "" {
			refs = append(refs, binding.EssentialSuccessorReceipt)
		}
	case "final_acceptance":
		if len(binding.MissingEssentials) != 0 {
			t.Fatal("final acceptance cannot omit essential successors")
		}
		refs = append(refs, binding.EssentialSuccessorReceipt)
	default:
		t.Fatal("select explicit provisional_baseline or final_acceptance binding mode")
	}
	for _, ref := range refs {
		body := aiCompetenceReadRef(t, ref)
		if !json.Valid(body) {
			t.Fatal("root union and essential successor receipts must be preserved JSON")
		}
		var fields map[string]json.RawMessage
		if err = json.Unmarshal(body, &fields); err != nil {
			t.Fatal(err)
		}
		if raw, ok := fields["status"]; ok && string(raw) == `"closed_primary"` {
			t.Fatal("closed-primary 0.3.4 is historical context, not the final union")
		}
	}
	var manifest map[string]string
	if err = json.Unmarshal(aiCompetenceReadRef(t, binding.SourceManifest), &manifest); err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"pkg/sim/ai.go", "pkg/sim/ai_dispatch.go", "pkg/sim/state.go", "content/index.json", "go.mod"} {
		if len(manifest[required]) != 64 {
			t.Fatal("final manifest omits required runtime/content source", required)
		}
	}
	for path, expected := range manifest {
		clean := filepath.Clean(path)
		if filepath.IsAbs(path) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			t.Fatal("manifest path escapes final source root", path)
		}
		bytes, readErr := os.ReadFile(filepath.Join(activeRoot, clean))
		if readErr != nil || aiCompetenceDigest(bytes) != expected {
			t.Fatal("final source/content differs from the binding", path, readErr)
		}
	}
	for _, directory := range []string{"pkg", "cmd", "content"} {
		if _, statErr := os.Stat(filepath.Join(activeRoot, directory)); os.IsNotExist(statErr) && directory == "cmd" {
			continue
		}
		walkErr := filepath.Walk(filepath.Join(activeRoot, directory), func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() {
				return nil
			}
			relative, relErr := filepath.Rel(activeRoot, path)
			if relErr != nil {
				return relErr
			}
			runtimeGo := strings.HasSuffix(relative, ".go") && !strings.HasSuffix(relative, "_test.go")
			contentFile := strings.HasPrefix(relative, "content"+string(filepath.Separator))
			if (runtimeGo || contentFile) && len(manifest[filepath.ToSlash(relative)]) != 64 {
				return fmt.Errorf("final manifest omits runtime/content file %s", relative)
			}
			return nil
		})
		if walkErr != nil {
			t.Fatal("final source manifest must be complete", walkErr)
		}
	}
	return binding, data
}

type aiCompetenceActor struct {
	ID            ID       `json:"id"`
	Owner         PlayerID `json:"owner"`
	Type          string   `json:"type"`
	Role          string   `json:"role"`
	Position      Vec      `json:"position"`
	State         string   `json:"state"`
	TaskClass     string   `json:"task_class"`
	HP            int64    `json:"hp"`
	Paid          int64    `json:"paid"`
	Complete      bool     `json:"complete"`
	Enabled       bool     `json:"enabled"`
	DisabledUntil Tick     `json:"disabled_until"`
	Orders        []Order  `json:"orders"`
	Jobs          []Job    `json:"jobs"`
	Target        ID       `json:"target"`
	Stance        string   `json:"stance"`
	Work          uint32   `json:"construction_work"`
	Builder       ID       `json:"builder"`
	Channel       string   `json:"channel"`
	ChannelTarget ID       `json:"channel_target"`
	ChannelUntil  Tick     `json:"channel_until"`
	Blocked       bool     `json:"blocked"`
	LastProgress  Tick     `json:"last_progress"`
	RouteFailures uint32   `json:"route_failures"`
	PathNodes     int      `json:"path_nodes"`
	PathGoal      Vec      `json:"path_goal"`
	PathEnd       Vec      `json:"path_end"`
	Field         uint32   `json:"field"`
	Depot         ID       `json:"depot"`
	Cargo         int64    `json:"cargo"`
	Home          ID       `json:"home"`
	Landed        bool     `json:"landed"`
	Ammo          int32    `json:"ammo"`
	Endurance     uint32   `json:"endurance"`
	ServiceWork   uint32   `json:"service_work"`
	Deployed      bool     `json:"deployed"`
	Container     ID       `json:"container"`
}

func aiCompetenceTaskClass(e *Engine, v *Entity) string {
	class := "no_task"
	switch {
	case !v.Complete:
		class = "construction"
	case v.DisabledUntil > e.Tick() || !v.Enabled:
		class = "disabled"
	case v.Container != 0:
		class = "passenger"
	case v.Channel != "":
		class = "channel"
	case len(v.Jobs) > 0:
		class = "production_or_queue_wait"
	case v.Deployed:
		class = "deployed"
	case v.State == "servicing" || v.State == "landing_blocked" || v.State == "returning" || v.Landed:
		class = "air_or_service_wait"
	case len(v.Orders) > 0:
		class = "ordered_work"
	case v.Target != 0 || v.State == "firing" || v.State == "aiming":
		class = "combat"
	case v.Stance == "hold" || v.State == "guarding":
		class = "guard"
	}
	return class
}

func aiCompetenceActorSnapshot(e *Engine, v *Entity) aiCompetenceActor {
	return aiCompetenceActor{v.ID, v.Owner, v.Type, e.role(v), v.Position, v.State, aiCompetenceTaskClass(e, v), v.HP, v.Paid, v.Complete, v.Enabled, v.DisabledUntil, cloneOrders(v.Orders), append([]Job(nil), v.Jobs...), v.Target, v.Stance, v.Work, v.Builder, v.Channel, v.ChannelTarget, v.ChannelUntil, v.Blocked, v.LastProgress, v.RouteFailures, len(v.Path), v.PathGoal, v.PathEnd, v.Field, v.Depot, v.Cargo, v.Home, v.Landed, v.Ammo, v.Endurance, v.ServiceWork, v.Deployed, v.Container}
}

type aiCompetenceKnowledge struct {
	Player       PlayerID        `json:"player"`
	PlanningTick Tick            `json:"planning_tick"`
	Intent       string          `json:"intent"`
	Goal         Vec             `json:"goal"`
	KnownFields  []FieldView     `json:"known_fields"`
	KnownEnemies []AIObservation `json:"known_enemies"`
}

func aiCompetenceKnown(p *Player) aiCompetenceKnowledge {
	return aiCompetenceKnowledge{p.ID, p.AILast, p.AIIntent, p.AIGoal, append([]FieldView(nil), p.AIFields...), append([]AIObservation(nil), p.AIKnowledge...)}
}

type aiCompetenceScout struct {
	ID              ID     `json:"id"`
	Type            string `json:"type"`
	FirstPosition   Vec    `json:"first_position"`
	LastPosition    Vec    `json:"last_position"`
	TravelL1        int64  `json:"actual_travel_l1"`
	FirstMoved      Tick   `json:"first_moved_tick"`
	Waypoint        Vec    `json:"current_waypoint"`
	DistanceSquared int64  `json:"distance_to_current_waypoint_squared"`
	BlockedTicks    uint64 `json:"blocked_ticks"`
	RouteFailures   uint32 `json:"max_route_failures"`
}

type aiCompetenceScoutLeg struct {
	Actor                 ID                    `json:"actor"`
	Player                PlayerID              `json:"player"`
	Sequence              uint32                `json:"accepted_sequence"`
	Start                 Tick                  `json:"start_tick"`
	From                  Vec                   `json:"from"`
	Requested             Vec                   `json:"requested_waypoint"`
	End                   Tick                  `json:"end_tick"`
	EndPosition           Vec                   `json:"actual_end_position"`
	EndReason             string                `json:"end_reason"`
	RequestedTileExplored bool                  `json:"requested_tile_explored_at_end"`
	RequestedTileVisible  bool                  `json:"requested_tile_visible_at_end"`
	KnownBefore           aiCompetenceKnowledge `json:"planning_knowledge_before"`
	KnownAfter            aiCompetenceKnowledge `json:"planning_knowledge_after"`
}

func aiCompetenceFinishScoutLeg(e *Engine, leg *aiCompetenceScoutLeg, position Vec, reason string) {
	leg.End, leg.EndPosition, leg.EndReason = e.Tick(), position, reason
	p := e.player(leg.Player)
	leg.KnownAfter = aiCompetenceKnown(p)
	x, y := leg.Requested.X/1000, leg.Requested.Y/1000
	if x >= 0 && y >= 0 && x < e.state.Map.Width && y < e.state.Map.Height {
		index := y*e.state.Map.Width + x
		if int(index) < len(p.Explored) {
			leg.RequestedTileExplored = p.Explored[index]
		}
		if int(index) < len(e.visible[p.ID]) {
			leg.RequestedTileVisible = e.visible[p.ID][index]
		}
	}
}

type aiCompetencePlayerMetrics struct {
	Orders                  authoredAIOrderCounts     `json:"ordinary_execution_receipts"`
	AdmissionVisibilityGaps uint64                    `json:"admissions_not_retained_after_advance"`
	FirstPaidPower          Tick                      `json:"first_paid_power_complete_tick"`
	FirstPaidSupply         Tick                      `json:"first_paid_supply_complete_tick"`
	FirstCargoDelivery      Tick                      `json:"first_cargo_delivery_tick"`
	CollectorIncome         int64                     `json:"actual_delivered_cargo"`
	DeliveredByDepot        map[ID]int64              `json:"delivered_cargo_by_owned_depot"`
	SupplyCenters           []ID                      `json:"paid_completed_supply_centers"`
	ExpansionStockTrigger   Tick                      `json:"known_worked_field_below_6m_tick"`
	DamageTaken             int64                     `json:"actual_hp_damage_taken"`
	HostileDamageShare      int64                     `json:"actual_hostile_damage_proportional_share"`
	WeaponsFired            uint64                    `json:"weapons_fired"`
	Destroyed               uint64                    `json:"destroyed_events"`
	RawStateTicks           map[string]uint64         `json:"raw_actor_state_ticks"`
	TaskClassTicks          map[string]uint64         `json:"actor_task_class_ticks"`
	UnassignedMax           map[ID]uint64             `json:"max_no_task_episode_ticks"`
	Scouts                  map[ID]*aiCompetenceScout `json:"physical_scout_progress"`
	ScoutLegs               []*aiCompetenceScoutLeg   `json:"accepted_scout_legs"`
	FirstVisibleFields      map[uint32]Tick           `json:"first_sampled_visible_field_ticks"`
	FirstVisibleContacts    map[ID]Tick               `json:"first_sampled_visible_hostile_ticks"`
	FirstPlannerFields      map[uint32]Tick           `json:"first_planner_known_field_ticks"`
	FirstPlannerContacts    map[ID]Tick               `json:"first_planner_observed_hostile_ticks"`
	GoalTransitions         []aiCompetenceKnowledge   `json:"known_goal_transitions"`
}

type aiCompetenceReport struct {
	Case                          aiCompetenceCase                        `json:"case"`
	Binding                       aiCompetenceBinding                     `json:"binding"`
	BindingSHA256                 string                                  `json:"binding_sha256"`
	Metadata                      Metadata                                `json:"metadata"`
	MapSHA256                     string                                  `json:"map_sha256"`
	ExecutableSHA256              string                                  `json:"test_executable_sha256"`
	OverlaySHA256                 string                                  `json:"diagnostic_overlay_sha256"`
	VisibilitySamplingSeconds     uint32                                  `json:"visibility_sampling_seconds"`
	Go                            string                                  `json:"go"`
	Tick                          Tick                                    `json:"tick"`
	FinalHash                     string                                  `json:"final_hash"`
	Outcome                       Outcome                                 `json:"outcome"`
	StopReason                    string                                  `json:"stop_reason"`
	HorizonReached                bool                                    `json:"horizon_reached"`
	InitialRestoreExact           bool                                    `json:"initial_restore_exact"`
	FinalRestoreExact             bool                                    `json:"final_restore_exact"`
	CheckpointReplayExact         bool                                    `json:"checkpoint_replay_exact"`
	CheckpointReplayFromTick      Tick                                    `json:"checkpoint_replay_from_tick"`
	CheckpointReplayTicksAdvanced Tick                                    `json:"checkpoint_replay_ticks_advanced"`
	FullReplayStatus              string                                  `json:"full_replay_status"`
	CompetenceStatus              string                                  `json:"competence_status"`
	HardIssues                    []string                                `json:"hard_issues"`
	ObservedFlags                 []string                                `json:"observed_competence_flags"`
	Players                       map[PlayerID]*aiCompetencePlayerMetrics `json:"players"`
	FinalEconomy                  authoredAISample                        `json:"spectator_final_economy"`
	Telemetry                     *MatchTelemetry                         `json:"spectator_match_telemetry"`
	WallSeconds                   float64                                 `json:"scheduling_elapsed_seconds"`
}

func aiCompetenceFreshDirectory(t *testing.T) string {
	t.Helper()
	dir := os.Getenv("FRONTLINE_AI_COMPETENCE_EVIDENCE")
	if !filepath.IsAbs(dir) {
		t.Fatal("provide a fresh absolute evidence directory; failures must be preserved")
	}
	if err := os.MkdirAll(filepath.Dir(dir), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal("evidence directory must be new; do not overwrite a previous run", err)
	}
	return dir
}

func aiCompetenceJSON(t *testing.T, dir, name string, value any) {
	t.Helper()
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, name, append(data, '\n'))
}

func aiCompetenceMap(t *testing.T, id string) (content.Map, []byte) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", id+".json"))
	if err != nil {
		t.Fatal(err)
	}
	battlefield, err := content.DecodeMap(data)
	if err != nil || battlefield.ID != id {
		t.Fatal("wrong authored map", err)
	}
	indexData, err := os.ReadFile(filepath.Join("..", "..", "content", "index.json"))
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
	if err = json.Unmarshal(indexData, &index); err != nil {
		t.Fatal(err)
	}
	for _, item := range index.Maps {
		if item.ID == id && item.Kind == "skirmish" && item.SHA256 == aiCompetenceDigest(data) && item.Bytes == len(data) {
			return battlefield, data
		}
	}
	t.Fatal("map bytes differ from indexed authored launch map")
	return content.Map{}, nil
}

func TestAIQualityCompetenceRecordedOrdinary(t *testing.T) {
	if testing.Short() || os.Getenv("FRONTLINE_AI_COMPETENCE") != "1" {
		t.Skip("opt-in one bound ordinary competence case")
	}
	var spec aiCompetenceCase
	for _, candidate := range aiCompetenceCases() {
		if candidate.ID == os.Getenv("FRONTLINE_AI_COMPETENCE_CASE") {
			spec = candidate
		}
	}
	if spec.ID == "" {
		t.Fatal("select exactly one diagnosis/opening cell; no implicit corpus fanout")
	}
	binding, bindingBytes := aiCompetenceRequireBinding(t)
	battlefield, mapBytes := aiCompetenceMap(t, spec.Map)
	catalog := content.MustBase()
	cfg := Config{Map: battlefield, Seed: spec.Seed, Ruleset: "standard-v2"}
	for i, faction := range spec.Factions {
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(i + 1), Name: fmt.Sprintf("%s %s bot %d", faction, spec.Difficulties[i], i+1), Faction: faction, Team: uint32(i + 1), AI: spec.Difficulties[i]})
	}
	e, err := New(catalog, cfg)
	if err != nil {
		t.Fatal(err)
	}
	dir := aiCompetenceFreshDirectory(t)
	authoredAIWrite(t, dir, "source-binding.json", bindingBytes)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	binaryBytes, err := os.ReadFile(binary)
	if err != nil {
		t.Fatal(err)
	}
	overlayBytes, err := os.ReadFile("ai_quality_competence_diagnostic_test.go")
	if err != nil {
		t.Fatal(err)
	}
	report := aiCompetenceReport{Case: spec, Binding: binding, BindingSHA256: aiCompetenceDigest(bindingBytes), Metadata: e.Metadata(), MapSHA256: aiCompetenceDigest(mapBytes), ExecutableSHA256: aiCompetenceDigest(binaryBytes), OverlaySHA256: aiCompetenceDigest(overlayBytes), VisibilitySamplingSeconds: 5, Go: runtime.Version(), FullReplayStatus: "pending_separate_serial_verification", CompetenceStatus: "requires_observed_behavior_review", Players: map[PlayerID]*aiCompetencePlayerMetrics{}}
	if binding.Mode == "provisional_baseline" {
		report.CompetenceStatus = "provisional_baseline_not_final_acceptance"
	}
	for _, p := range e.state.Players {
		if p.Credits != 6000000 || p.Supply != 0 || p.AI != spec.Difficulties[int(p.ID)-1] {
			t.Fatal("nonstandard paid opening")
		}
		report.Players[p.ID] = &aiCompetencePlayerMetrics{Orders: authoredAIOrderCounts{Rejected: map[string]uint64{}, Kinds: map[string]uint64{}}, DeliveredByDepot: map[ID]int64{}, RawStateTicks: map[string]uint64{}, TaskClassTicks: map[string]uint64{}, UnassignedMax: map[ID]uint64{}, Scouts: map[ID]*aiCompetenceScout{}, FirstVisibleFields: map[uint32]Tick{}, FirstVisibleContacts: map[ID]Tick{}, FirstPlannerFields: map[uint32]Tick{}, FirstPlannerContacts: map[ID]Tick{}}
	}
	if e.Tick() != 0 || e.state.Countdown != 100 {
		t.Fatal("ordinary countdown was bypassed")
	}
	initial, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "initial.save.json", initial)
	restored, err := Restore(catalog, initial)
	report.InitialRestoreExact = err == nil && restored.Hash() == e.Hash()
	if !report.InitialRestoreExact {
		t.Fatal("initial ordinary save restore mismatch", err)
	}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	initialReplay, err := recorder.Encode()
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "initial-replay.fcr", initialReplay)
	traceFile, err := os.OpenFile(filepath.Join(dir, "trace.jsonl"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer traceFile.Close()
	trace := json.NewEncoder(traceFile)
	snapshotFile, err := os.OpenFile(filepath.Join(dir, "snapshots.jsonl"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshotFile.Close()
	snapshots := json.NewEncoder(snapshotFile)
	type admission struct {
		Tick      Tick
		Knowledge aiCompetenceKnowledge
	}
	admitted := map[[2]uint32]admission{}
	unassigned := map[ID]uint64{}
	activeScoutLeg := map[ID]*aiCompetenceScoutLeg{}
	previousGoal := map[PlayerID]aiCompetenceKnowledge{}
	cursor := e.state.LogBase + uint64(len(e.state.Log))
	for _, p := range e.state.Players {
		view, ok := e.PlayerView(p.ID)
		if !ok {
			t.Fatal("initial ordinary player perspective missing")
		}
		metrics := report.Players[p.ID]
		for _, field := range view.Fields {
			metrics.FirstVisibleFields[field.ID] = 0
		}
		for _, contact := range view.Entities {
			if contact.Owner != p.ID && contact.Owner != 0 {
				metrics.FirstVisibleContacts[contact.ID] = 0
			}
		}
		actors := []aiCompetenceActor{}
		for _, v := range e.state.Entities {
			if v.Owner == p.ID {
				actors = append(actors, aiCompetenceActorSnapshot(e, v))
			}
		}
		if err = snapshots.Encode(map[string]any{"tick": e.Tick(), "player": p.ID, "permitted_view": view, "planning_knowledge": aiCompetenceKnown(p), "spectator_diagnostic_own_actors": actors, "spectator_economy": authoredAISnapshot(e)}); err != nil {
			t.Fatal(err)
		}
	}
	started := time.Now()
	horizon := Tick(100) + seconds(spec.HorizonSeconds)
	report.StopReason = "horizon"
	for e.Tick() < horizon && !e.Outcome().Finished {
		if time.Since(started) >= 35*time.Second {
			report.StopReason = "elapsed_scheduling_budget_incomplete"
			break
		}
		before := map[ID]aiCompetenceActor{}
		for _, batch := range e.state.Pending {
			if batch.Tick > e.Tick()+1 {
				continue
			}
			for _, order := range batch.Orders {
				for _, id := range order.Entities {
					if v := e.entity(id); v != nil {
						before[id] = aiCompetenceActorSnapshot(e, v)
					}
				}
			}
		}
		for _, v := range e.state.Entities {
			if v.Cargo > 0 {
				if _, exists := before[v.ID]; !exists {
					before[v.ID] = aiCompetenceActor{ID: v.ID, Owner: v.Owner, Cargo: v.Cargo, Depot: v.Depot}
				}
			}
			if v.Building && !v.Complete && v.Paid > 0 {
				before[v.ID] = aiCompetenceActorSnapshot(e, v)
			}
		}
		previousSequences := map[PlayerID]uint32{}
		for _, p := range e.state.Players {
			previousSequences[p.ID] = p.LastSequence
		}
		e.Advance()
		newAdmissions := map[PlayerID]uint32{}
		for _, batch := range e.state.Pending {
			key := [2]uint32{uint32(batch.Player), batch.Sequence}
			if _, exists := admitted[key]; exists {
				continue
			}
			p := e.player(batch.Player)
			known := aiCompetenceKnown(p)
			admitted[key] = admission{e.Tick(), known}
			newAdmissions[batch.Player]++
			if len(batch.Orders) == 0 || len(batch.Orders) > 32 || batch.Tick != e.Tick()+1 {
				report.HardIssues = append(report.HardIssues, "ordinary admission batch/tick invariant")
			}
			if err = trace.Encode(map[string]any{"kind": "admitted", "source": "local_go_ai", "admitted_tick": e.Tick(), "batch": batch, "planning_knowledge": known}); err != nil {
				t.Fatal(err)
			}
		}
		for _, p := range e.state.Players {
			delta := p.LastSequence - previousSequences[p.ID]
			if delta > newAdmissions[p.ID] {
				report.Players[p.ID].AdmissionVisibilityGaps += uint64(delta - newAdmissions[p.ID])
				if err = trace.Encode(map[string]any{"kind": "admission_visibility_gap", "player": p.ID, "tick": e.Tick(), "sequence_before": previousSequences[p.ID], "sequence_after": p.LastSequence, "surviving_admissions": newAdmissions[p.ID], "note": "ordinary admissions dropped inside Advance are not reconstructed or assigned an invented rejection code"}); err != nil {
					t.Fatal(err)
				}
			}
		}
		end := e.state.LogBase + uint64(len(e.state.Log))
		if cursor < e.state.LogBase {
			report.HardIssues = append(report.HardIssues, "recorder missed bounded ordinary execution log")
			break
		}
		for _, batch := range e.state.Log[cursor-e.state.LogBase:] {
			key := [2]uint32{uint32(batch.Player), batch.Sequence}
			origin, exists := admitted[key]
			if !exists {
				report.HardIssues = append(report.HardIssues, "ordinary execution lacks observed AI admission")
			}
			for index, order := range batch.Orders {
				var receipt *OrderResult
				for i := range e.state.Results {
					candidate := &e.state.Results[i]
					if candidate.Player == batch.Player && candidate.Sequence == batch.Sequence && candidate.Index == int32(index) {
						receipt = candidate
					}
				}
				if receipt == nil {
					report.HardIssues = append(report.HardIssues, "executed command lacks ordinary receipt")
					continue
				}
				metrics := report.Players[batch.Player]
				metrics.Orders.Executed++
				metrics.Orders.Kinds[order.Kind]++
				if receipt.Accepted {
					metrics.Orders.Accepted++
				} else {
					metrics.Orders.Rejected[receipt.Code]++
				}
				pre, post := []aiCompetenceActor{}, []aiCompetenceActor{}
				for _, id := range order.Entities {
					if actor, found := before[id]; found {
						pre = append(pre, actor)
						if receipt.Accepted && actor.Owner != batch.Player {
							report.HardIssues = append(report.HardIssues, "accepted command selected another player's actor")
						}
						if receipt.Accepted && order.Kind == "move" && (actor.Role == "recon" || actor.Role == "isr" || actor.Role == "scout_drone") {
							if previous := activeScoutLeg[id]; previous != nil {
								aiCompetenceFinishScoutLeg(e, previous, actor.Position, "replaced_by_accepted_move")
							}
							leg := &aiCompetenceScoutLeg{Actor: id, Player: batch.Player, Sequence: batch.Sequence, Start: e.Tick(), From: actor.Position, Requested: order.Position, KnownBefore: origin.Knowledge}
							activeScoutLeg[id] = leg
							metrics.ScoutLegs = append(metrics.ScoutLegs, leg)
						}
					}
					if actor := e.entity(id); actor != nil {
						post = append(post, aiCompetenceActorSnapshot(e, actor))
					}
				}
				if err = trace.Encode(map[string]any{"kind": "executed", "source": "local_go_ai", "admitted_tick": origin.Tick, "scheduled_tick": batch.Tick, "player": batch.Player, "sequence": batch.Sequence, "index": index, "order": order, "receipt": receipt, "planning_knowledge": origin.Knowledge, "spectator_actor_before": pre, "spectator_actor_after": post}); err != nil {
					t.Fatal(err)
				}
			}
		}
		cursor = end
		for id, leg := range activeScoutLeg {
			v := e.entity(id)
			if v == nil {
				position := leg.From
				if scout := report.Players[leg.Player].Scouts[id]; scout != nil {
					position = scout.LastPosition
				}
				aiCompetenceFinishScoutLeg(e, leg, position, "actor_removed")
				delete(activeScoutLeg, id)
				continue
			}
			if len(v.Orders) == 0 || v.Orders[0].Kind != "move" || v.Orders[0].Position != leg.Requested {
				aiCompetenceFinishScoutLeg(e, leg, v.Position, "move_no_longer_active")
				delete(activeScoutLeg, id)
			}
		}
		if len(e.state.Events) > 0 || len(e.damages) > 0 {
			if err = trace.Encode(map[string]any{"kind": "spectator_diagnostic", "tick": e.Tick(), "events": e.state.Events, "damage_queue": e.damages}); err != nil {
				t.Fatal(err)
			}
		}
		for _, event := range e.state.Events {
			metrics := report.Players[event.Owner]
			if metrics == nil {
				continue
			}
			switch event.Kind {
			case "construction_complete":
				actor := before[event.Entity]
				if actor.Paid > 0 && actor.Role == "power" && metrics.FirstPaidPower == 0 {
					metrics.FirstPaidPower = e.Tick()
				}
				if actor.Paid > 0 && actor.Role == "supply" && metrics.FirstPaidSupply == 0 {
					metrics.FirstPaidSupply = e.Tick()
				}
			case "cargo_delivered":
				actor := before[event.Entity]
				if metrics.FirstCargoDelivery == 0 {
					metrics.FirstCargoDelivery = e.Tick()
				}
				metrics.CollectorIncome += actor.Cargo
				metrics.DeliveredByDepot[actor.Depot] += actor.Cargo
			case "under_attack":
				metrics.DamageTaken += event.Value
				total := int64(0)
				for _, impact := range e.damages {
					if impact.Target == event.Entity {
						total += impact.Amount
					}
				}
				if total > 0 {
					for _, impact := range e.damages {
						attacker := report.Players[impact.Owner]
						if impact.Target == event.Entity && attacker != nil && impact.Owner != event.Owner {
							attacker.HostileDamageShare += event.Value * impact.Amount / total
						}
					}
				}
			case "weapon_fired":
				metrics.WeaponsFired++
			case "destroyed":
				metrics.Destroyed++
			}
		}
		for _, p := range e.state.Players {
			if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
				report.HardIssues = append(report.HardIssues, fmt.Sprintf("economy/cap invariant tick=%d player=%d", e.Tick(), p.ID))
			}
			known := aiCompetenceKnown(p)
			metrics := report.Players[p.ID]
			for _, field := range known.KnownFields {
				if _, exists := metrics.FirstPlannerFields[field.ID]; !exists {
					metrics.FirstPlannerFields[field.ID] = known.PlanningTick
				}
			}
			for _, contact := range known.KnownEnemies {
				if _, exists := metrics.FirstPlannerContacts[contact.ID]; !exists {
					metrics.FirstPlannerContacts[contact.ID] = contact.Seen
				}
			}
			previous, exists := previousGoal[p.ID]
			if !exists || previous.Intent != known.Intent || previous.Goal != known.Goal {
				report.Players[p.ID].GoalTransitions = append(report.Players[p.ID].GoalTransitions, known)
				previousGoal[p.ID] = known
			}
		}
		for _, v := range e.state.Entities {
			metrics := report.Players[v.Owner]
			if metrics == nil {
				continue
			}
			class, role := aiCompetenceTaskClass(e, v), e.role(v)
			metrics.RawStateTicks[v.State]++
			metrics.TaskClassTicks[class]++
			if class == "no_task" && !v.Building {
				unassigned[v.ID]++
				if unassigned[v.ID] > metrics.UnassignedMax[v.ID] {
					metrics.UnassignedMax[v.ID] = unassigned[v.ID]
				}
			} else {
				unassigned[v.ID] = 0
			}
			if v.Building && v.Complete && v.Paid > 0 {
				if role == "power" && metrics.FirstPaidPower == 0 {
					metrics.FirstPaidPower = e.Tick()
				}
				if role == "supply" {
					if metrics.FirstPaidSupply == 0 {
						metrics.FirstPaidSupply = e.Tick()
					}
					found := false
					for _, id := range metrics.SupplyCenters {
						if id == v.ID {
							found = true
						}
					}
					if !found {
						metrics.SupplyCenters = append(metrics.SupplyCenters, v.ID)
					}
				}
			}
			if role == "hauler" && v.Depot != 0 && v.Field != 0 && metrics.ExpansionStockTrigger == 0 {
				for _, field := range e.player(v.Owner).AIFields {
					if field.ID == v.Field && field.Remaining <= 6000000 {
						metrics.ExpansionStockTrigger = e.Tick()
					}
				}
			}
			if role == "recon" || role == "isr" || role == "scout_drone" {
				scout := metrics.Scouts[v.ID]
				if scout == nil {
					scout = &aiCompetenceScout{ID: v.ID, Type: v.Type, FirstPosition: v.Position, LastPosition: v.Position}
					metrics.Scouts[v.ID] = scout
				}
				dx, dy := int64(v.Position.X)-int64(scout.LastPosition.X), int64(v.Position.Y)-int64(scout.LastPosition.Y)
				if dx < 0 {
					dx = -dx
				}
				if dy < 0 {
					dy = -dy
				}
				scout.TravelL1 += dx + dy
				if dx+dy > 0 && scout.FirstMoved == 0 {
					scout.FirstMoved = e.Tick()
				}
				scout.LastPosition = v.Position
				if len(v.Orders) > 0 && v.Orders[0].Kind == "move" {
					scout.Waypoint = v.Orders[0].Position
					scout.DistanceSquared = dist2(v.Position, scout.Waypoint)
				}
				if v.Blocked {
					scout.BlockedTicks++
				}
				if v.RouteFailures > scout.RouteFailures {
					scout.RouteFailures = v.RouteFailures
				}
			}
		}
		if e.Tick() == 1 || e.Tick()%seconds(5) == 0 || len(report.HardIssues) > 0 {
			for _, p := range e.state.Players {
				view, ok := e.PlayerView(p.ID)
				if !ok {
					report.HardIssues = append(report.HardIssues, "ordinary player perspective missing")
					continue
				}
				metrics := report.Players[p.ID]
				for _, field := range view.Fields {
					if _, exists := metrics.FirstVisibleFields[field.ID]; !exists {
						metrics.FirstVisibleFields[field.ID] = e.Tick()
					}
				}
				for _, contact := range view.Entities {
					if contact.Owner != p.ID && contact.Owner != 0 {
						if _, exists := metrics.FirstVisibleContacts[contact.ID]; !exists {
							metrics.FirstVisibleContacts[contact.ID] = e.Tick()
						}
					}
				}
				actors := []aiCompetenceActor{}
				for _, v := range e.state.Entities {
					if v.Owner == p.ID {
						actors = append(actors, aiCompetenceActorSnapshot(e, v))
					}
				}
				if err = snapshots.Encode(map[string]any{"tick": e.Tick(), "player": p.ID, "permitted_view": view, "planning_knowledge": aiCompetenceKnown(p), "spectator_diagnostic_own_actors": actors, "spectator_economy": authoredAISnapshot(e)}); err != nil {
					t.Fatal(err)
				}
			}
		}
		if e.Tick()%seconds(30) == 0 {
			if e.Tick()%seconds(60) == 0 {
				checkpoint, saveErr := recorder.CaptureCheckpoint(e)
				if saveErr != nil {
					t.Fatal(saveErr)
				}
				authoredAIWrite(t, dir, fmt.Sprintf("tick-%06d.save.json", e.Tick()), checkpoint)
				t.Logf("case=%s tick=%d actors=%d", spec.ID, e.Tick(), len(e.state.Entities))
			} else if err = recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			packed, encodeErr := recorder.Encode()
			if encodeErr != nil {
				t.Fatal(encodeErr)
			}
			authoredAIWrite(t, dir, "latest-checkpoint.fcr", packed)
		}
		if len(report.HardIssues) > 0 {
			report.StopReason = "hard_invariant"
			break
		}
	}
	report.Tick, report.FinalHash, report.Outcome = e.Tick(), e.Hash(), e.Outcome()
	report.HorizonReached = e.Tick() >= horizon || e.Outcome().Finished
	if e.Outcome().Finished {
		report.StopReason = "ordinary_outcome"
	}
	report.FinalEconomy = authoredAISnapshot(e)
	report.Telemetry = e.state.Telemetry
	final, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "final.save.json", final)
	restored, err = Restore(catalog, final)
	report.FinalRestoreExact = err == nil && restored.Hash() == report.FinalHash
	if !report.FinalRestoreExact {
		report.HardIssues = append(report.HardIssues, "final ordinary save restore mismatch")
	}
	if err = recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	packed, err := recorder.Encode()
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "replay.fcr", packed)
	decoded, err := DecodeReplay(packed)
	if err == nil {
		for _, checkpoint := range decoded.Checkpoints {
			if checkpoint.Tick <= e.Tick() && checkpoint.Tick > report.CheckpointReplayFromTick {
				report.CheckpointReplayFromTick = checkpoint.Tick
			}
		}
		player, seekErr := decoded.Seek(catalog, e.Tick())
		report.CheckpointReplayExact = seekErr == nil && player.Hash() == report.FinalHash
		if seekErr == nil {
			report.CheckpointReplayTicksAdvanced = e.Tick() - report.CheckpointReplayFromTick
		}
	}
	if !report.CheckpointReplayExact {
		report.HardIssues = append(report.HardIssues, "checkpoint replay hash mismatch")
	}
	for _, p := range e.state.Players {
		id, metrics := p.ID, report.Players[p.ID]
		if metrics.FirstPaidPower == 0 || metrics.FirstPaidSupply == 0 || metrics.CollectorIncome == 0 {
			report.ObservedFlags = append(report.ObservedFlags, fmt.Sprintf("player%d paid power/supply/collector opening incomplete; inspect real blocks and reachable opportunities", id))
		}
		moved := false
		for _, scout := range metrics.Scouts {
			if scout.TravelL1 > 0 {
				moved = true
			}
		}
		if !moved {
			report.ObservedFlags = append(report.ObservedFlags, fmt.Sprintf("player%d no recorded scout movement; inspect paid production/reachability", id))
		}
		if metrics.ExpansionStockTrigger == 0 {
			report.ObservedFlags = append(report.ObservedFlags, fmt.Sprintf("player%d expansion stock trigger not reached; expansion coverage remains open", id))
		}
	}
	if !report.HorizonReached {
		report.CompetenceStatus = "incomplete_scheduling_slice"
	}
	report.WallSeconds = time.Since(started).Seconds()
	aiCompetenceJSON(t, dir, "result.json", report)
	if err = traceFile.Sync(); err != nil {
		t.Fatal(err)
	}
	if err = snapshotFile.Sync(); err != nil {
		t.Fatal(err)
	}
	t.Logf("case=%s tick=%d reason=%s hash=%s hard=%v flags=%v", spec.ID, report.Tick, report.StopReason, report.FinalHash, report.HardIssues, report.ObservedFlags)
	if len(report.HardIssues) > 0 {
		t.Error(report.HardIssues)
	}
	if !report.HorizonReached {
		t.Error("scheduling budget stopped before the selected ordinary horizon; preserve and continue, do not claim competence")
	}
}

// Full replay verification gets a separate serial slot instead of doubling the
// five-minute diagnosis inside its bounded run. The original raw replay remains
// unchanged; removing checkpoint acceleration changes only verification work.
func TestAIQualityCompetenceRecordedFullReplay(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AI_COMPETENCE_REPLAY")
	if testing.Short() || !filepath.IsAbs(dir) {
		t.Skip("opt-in same-source preserved full replay proof")
	}
	_, bindingBytes := aiCompetenceRequireBinding(t)
	data, err := os.ReadFile(filepath.Join(dir, "result.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report aiCompetenceReport
	if err = json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if report.BindingSHA256 != aiCompetenceDigest(bindingBytes) {
		t.Fatal("replay proof must use the original final source binding")
	}
	overlayBytes, err := os.ReadFile("ai_quality_competence_diagnostic_test.go")
	if err != nil || aiCompetenceDigest(overlayBytes) != report.OverlaySHA256 {
		t.Fatal("replay proof diagnostic overlay differs from the recorded run", err)
	}
	packed, err := os.ReadFile(filepath.Join(dir, "replay.fcr"))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeReplay(packed)
	if err != nil {
		t.Fatal(err)
	}
	decoded.Checkpoints = nil
	player, err := decoded.Open(content.MustBase(), 0)
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	incomplete := false
	for !player.Finished() {
		if time.Since(started) >= 35*time.Second {
			incomplete = true
			break
		}
		if err = player.Advance(); err != nil {
			break
		}
	}
	exact := !incomplete && err == nil && player.Engine().Tick() == report.Tick && player.Engine().Hash() == report.FinalHash
	proofBinary, binaryErr := os.Executable()
	if binaryErr != nil {
		t.Fatal(binaryErr)
	}
	proofBinaryBytes, binaryErr := os.ReadFile(proofBinary)
	if binaryErr != nil {
		t.Fatal(binaryErr)
	}
	proofError := ""
	if err != nil {
		proofError = err.Error()
	}
	proof, marshalErr := json.MarshalIndent(map[string]any{"binding_sha256": report.BindingSHA256, "test_executable_sha256": aiCompetenceDigest(proofBinaryBytes), "go": runtime.Version(), "replay_sha256": aiCompetenceDigest(packed), "expected_tick": report.Tick, "actual_tick": player.Engine().Tick(), "expected_hash": report.FinalHash, "actual_hash": player.Engine().Hash(), "full_replay_exact": exact, "elapsed_budget_incomplete": incomplete, "error": proofError}, "", "  ")
	if marshalErr != nil {
		t.Fatal(marshalErr)
	}
	output, writeErr := os.CreateTemp(dir, "full-replay-proof-*.json")
	if writeErr != nil {
		t.Fatal(writeErr)
	}
	if _, writeErr = output.Write(append(proof, '\n')); writeErr != nil {
		output.Close()
		t.Fatal(writeErr)
	}
	if writeErr = output.Close(); writeErr != nil {
		t.Fatal(writeErr)
	}
	t.Logf("preserved full replay proof=%s exact=%v", output.Name(), exact)
	if !exact {
		t.Error("ordinary full replay not proven", err, incomplete)
	}
}
