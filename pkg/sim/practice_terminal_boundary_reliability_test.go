package sim_test

// Public, naturally advanced practice boundary regression. The authored inputs
// and paid orders are identical for original-red and candidate execution.
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
)

const practiceTerminalBoundary sim.Tick = 108100

type practiceTerminalGoalIdentity struct {
	ID, Text          string
	Optional, Failure bool
}

func practiceTerminalView(t *testing.T, e *sim.Engine) sim.View {
	t.Helper()
	view, ok := e.PlayerView(1)
	if !ok || view.Mission == nil || view.Mission.ID != "tutorial-1-give-an-order" {
		t.Fatal("ordinary human tutorial perspective unavailable")
	}
	return view
}

func practiceTerminalGoals(view sim.View) []practiceTerminalGoalIdentity {
	identities := []practiceTerminalGoalIdentity{}
	for _, goal := range view.Mission.Objectives {
		identities = append(identities, practiceTerminalGoalIdentity{goal.ID, goal.Text, goal.Optional, goal.Failure})
	}
	return identities
}

func practiceTerminalPinned(t *testing.T, root, path, want string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, path))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != want {
		t.Fatal("unchanged authored input pin mismatch", path)
	}
	return data
}

func practiceTerminalWrite(t *testing.T, directory, name string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(filepath.Join(directory, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		t.Fatal("preserve prior evidence; choose a fresh run directory", err)
	}
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		t.Fatal("evidence write failed", writeErr, closeErr)
	}
}

func practiceTerminalJSON(t *testing.T, directory, name string, value any) {
	t.Helper()
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	practiceTerminalWrite(t, directory, name, append(data, '\n'))
}

func practiceTerminalSave(t *testing.T, directory, name string, e *sim.Engine) []byte {
	t.Helper()
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	practiceTerminalWrite(t, directory, name, data)
	return data
}

func practiceTerminalRestore(t *testing.T, catalog *content.Catalog, data []byte, original *sim.Engine) *sim.Engine {
	t.Helper()
	restored, err := sim.Restore(catalog, data)
	if err != nil || restored.Hash() != original.Hash() || restored.Metadata() != original.Metadata() {
		t.Fatal("fresh boundary save restore diverged", err)
	}
	return restored
}

func practiceTerminalAdvance(t *testing.T, e *sim.Engine, recorder *sim.Replay, target sim.Tick) {
	t.Helper()
	for e.Tick() < target {
		if e.Outcome().Finished {
			t.Fatal("authored tutorial terminated before the natural boundary", e.Tick(), e.Outcome())
		}
		e.Advance()
		if e.Tick()%600 == 0 {
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}
	if e.Tick() != target || e.Outcome().Finished {
		t.Fatal("natural ongoing practice tick mismatch", e.Tick(), e.Outcome())
	}
}

func practiceTerminalReceipt(t *testing.T, view sim.View, sequence uint32) sim.OrderResult {
	t.Helper()
	results := []sim.OrderResult{}
	for _, result := range view.Results {
		if result.Player == 1 && result.Sequence == sequence {
			results = append(results, result)
		}
	}
	if len(results) != 1 || !results[0].Accepted || results[0].Tick != view.Tick {
		t.Fatal("ordinary paid/control order was not actually admitted", results)
	}
	return results[0]
}

func TestPracticeTerminalBoundary(t *testing.T) {
	if testing.Short() {
		t.Skip("separate naturally advanced 90-minute practice regression")
	}
	sourceRoot, evidence := os.Getenv("FRONTLINE_PRACTICE_TERMINAL_SOURCE_ROOT"), os.Getenv("FRONTLINE_PRACTICE_TERMINAL_EVIDENCE")
	if !filepath.IsAbs(sourceRoot) || !filepath.IsAbs(evidence) {
		t.Fatal("explicit absolute practice source and fresh evidence roots required")
	}
	catalog := content.MustBase()
	mapData := practiceTerminalPinned(t, sourceRoot, "content/maps/us-01-first-foothold-layout.json", "7ed2384ddf81d452298da36f8e2d5fac61bb7d10be0a579b9fc799c976f2a2c9")
	gameMap, err := content.DecodeMap(mapData)
	if err != nil {
		t.Fatal(err)
	}
	missionData := practiceTerminalPinned(t, sourceRoot, "content/missions/tutorial-1-give-an-order.json", "9362e94e28d5ca7392b4af9a36986b2c3cbbc90a7c1d1d9c4f2c3952599eef2e")
	definition, err := content.DecodeMission(missionData, catalog, gameMap)
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.NewPracticeMission(catalog, gameMap, definition, "easy", 19027)
	if err != nil || engine.Metadata().Ruleset != "practice-v1" {
		t.Fatal("unchanged practice launch failed", err)
	}
	initialHash, initialMetadata := engine.Hash(), engine.Metadata()
	practiceTerminalSave(t, evidence, "initial.save.json", engine)
	recorder, err := sim.NewReplay(engine)
	if err != nil {
		t.Fatal(err)
	}
	practiceTerminalAdvance(t, engine, recorder, 100)
	opening := practiceTerminalView(t, engine)
	if opening.Economy.Credits != 8000000 || opening.Countdown != 0 {
		t.Fatal("original human funds/readiness changed", opening.Economy)
	}
	goals := practiceTerminalGoals(opening)
	unit, known := catalog.Unit("US.rifle")
	if !known || unit.Cost != 300000 || unit.BuildTicks != 200 || unit.Supply != 2 || unit.Producer != "barracks" {
		t.Fatal("canonical paid rifle contract changed", unit)
	}
	initialRifles := map[sim.ID]bool{}
	producer := sim.ID(0)
	for _, actor := range opening.Entities {
		if actor.Owner != 1 || actor.Health <= 0 || !actor.Complete || !actor.Enabled || actor.Private == nil || actor.Private.Container != 0 {
			continue
		}
		if actor.Type == unit.ID {
			initialRifles[actor.ID] = true
		}
		if actor.Type == unit.Producer && producer == 0 {
			producer = actor.ID
		}
	}
	if producer == 0 {
		t.Fatal("no currently observed owned complete barracks")
	}
	train := sim.Order{Kind: "train", Entities: []sim.ID{producer}, Type: unit.ID}
	if err = engine.Submit(1, 1, []sim.Order{train}); err != nil {
		t.Fatal("ordinary Train Submit", err)
	}
	engine.Advance()
	paidView := practiceTerminalView(t, engine)
	trainReceipt := practiceTerminalReceipt(t, paidView, 1)
	paid := false
	for _, actor := range paidView.Entities {
		if actor.ID == producer && actor.Owner == 1 && actor.Private != nil {
			for _, job := range actor.Private.Jobs {
				if job.Type == unit.ID && job.Started && job.Paid == unit.Cost {
					paid = true
				}
			}
		}
	}
	if !paid || paidView.Economy.Credits != opening.Economy.Credits+(paidView.Economy.Income-opening.Economy.Income)-unit.Cost {
		t.Fatal("ordinary training did not pay the actual catalog cost", paidView.Economy)
	}
	practiceTerminalJSON(t, evidence, "paid-training.public.json", struct {
		Order sim.Order
		Receipt sim.OrderResult
		View sim.View
	}{train, trainReceipt, paidView})
	practiceTerminalAdvance(t, engine, recorder, sim.Tick(100+unit.BuildTicks+100))
	newRifle := sim.ID(0)
	for _, actor := range practiceTerminalView(t, engine).Entities {
		if actor.Owner == 1 && actor.Type == unit.ID && actor.Complete && actor.Enabled && actor.Health > 0 && actor.Private != nil && actor.Private.Container == 0 && !initialRifles[actor.ID] {
			newRifle = actor.ID
			break
		}
	}
	if newRifle == 0 {
		t.Fatal("real paid new rifle did not become ready")
	}
	practiceTerminalAdvance(t, engine, recorder, practiceTerminalBoundary-1)
	preterminal := practiceTerminalView(t, engine)
	if !reflect.DeepEqual(goals, practiceTerminalGoals(preterminal)) {
		t.Fatal("native authored goal identity changed before boundary")
	}
	checkpointSave, err := recorder.CaptureCheckpoint(engine)
	if err != nil {
		t.Fatal(err)
	}
	practiceTerminalWrite(t, evidence, "preterminal.checkpoint.save.json", checkpointSave)
	practiceTerminalRestore(t, catalog, checkpointSave, engine)
	baseReplay, err := recorder.Encode()
	if err != nil {
		t.Fatal(err)
	}
	practiceTerminalWrite(t, evidence, "preterminal.replay.json.gz", baseReplay)
	practiceTerminalJSON(t, evidence, "preterminal.public.json", preterminal)
	for _, test := range []struct {
		name string
		surrender bool
		want sim.Outcome
	}{
		{"surrender", true, sim.Outcome{Finished: true, Reason: "mission_failed", Tick: practiceTerminalBoundary}},
		{"ongoing_draw", false, sim.Outcome{Finished: true, Draw: true, Reason: "practice_time_limit", Tick: practiceTerminalBoundary}},
	} {
		t.Run(test.name, func(t *testing.T) {
			directory := filepath.Join(evidence, test.name)
			actual := practiceTerminalRestore(t, catalog, checkpointSave, engine)
			twin := practiceTerminalRestore(t, catalog, checkpointSave, engine)
			branch, err := sim.DecodeReplay(baseReplay)
			if err != nil {
				t.Fatal(err)
			}
			if test.surrender {
				for _, copy := range []*sim.Engine{actual, twin} {
					if err = copy.Submit(1, 2, []sim.Order{{Kind: "surrender"}}); err != nil {
						t.Fatal("ordinary boundary Surrender Submit", err)
					}
				}
			}
			pendingSave := practiceTerminalSave(t, directory, "pending.save.json", actual)
			pendingRestored := practiceTerminalRestore(t, catalog, pendingSave, actual)
			if twin.Hash() != actual.Hash() {
				t.Fatal("continuing preterminal twin differs after boundary admission")
			}
			for _, copy := range []*sim.Engine{actual, twin, pendingRestored} {
				copy.Advance()
			}
			view := practiceTerminalView(t, actual)
			receipts := []sim.OrderResult{}
			if test.surrender {
				result := practiceTerminalReceipt(t, view, 2)
				receipts = append(receipts, result)
			}
			if actual.Tick() != practiceTerminalBoundary || actual.Hash() != twin.Hash() || actual.Hash() != pendingRestored.Hash() || view.Outcome != actual.Outcome() || actual.Debrief() == nil {
				t.Fatal("actual boundary/public/pending/twin terminal mismatch", actual.Tick(), actual.Outcome())
			}
			if !reflect.DeepEqual(goals, practiceTerminalGoals(view)) {
				t.Fatal("native public goal identity changed at terminal")
			}
			practiceTerminalJSON(t, directory, "terminal.public.json", struct {
				Expected sim.Outcome
				Actual sim.Outcome
				Receipts []sim.OrderResult
				View sim.View
			}{test.want, actual.Outcome(), receipts, view})
			terminalSave := practiceTerminalSave(t, directory, "terminal.save.json", actual)
			practiceTerminalRestore(t, catalog, terminalSave, actual)
			if err = branch.Capture(actual, false); err != nil {
				t.Fatal(err)
			}
			encoded, err := branch.Encode()
			if err != nil {
				t.Fatal(err)
			}
			practiceTerminalWrite(t, directory, "terminal.replay.json.gz", encoded)
			decoded, err := sim.DecodeReplay(encoded)
			if err != nil || decoded.Metadata != actual.Metadata() {
				t.Fatal("encoded initial replay metadata mismatch", err)
			}
			for _, checkpoint := range []bool{false, true} {
				copy := *decoded
				copy.Checkpoints = nil
				if checkpoint {
					for _, entry := range decoded.Checkpoints {
						if entry.Tick == practiceTerminalBoundary-1 {
							copy.Checkpoints = append(copy.Checkpoints, entry)
						}
					}
					if len(copy.Checkpoints) != 1 {
						t.Fatal("actual preterminal replay checkpoint missing")
					}
				}
				played, err := copy.Seek(catalog, practiceTerminalBoundary)
				if err != nil || played.Hash() != actual.Hash() || played.Metadata() != actual.Metadata() || played.Outcome() != actual.Outcome() {
					t.Fatalf("full/checkpoint final boundary replay differs checkpoint=%v err=%v", checkpoint, err)
				}
			}
			hash := actual.Hash()
			for i := 0; i < 3; i++ {
				actual.Advance()
			}
			if actual.Hash() != hash || actual.Tick() != practiceTerminalBoundary {
				t.Fatal("terminal practice engine continued advancing")
			}
			fresh, err := actual.Restart()
			if err != nil || fresh.Hash() != initialHash || fresh.Metadata() != initialMetadata || actual.Hash() != hash {
				t.Fatal("ordinary same-input practice Restart changed inputs or prior terminal", err)
			}
			practiceTerminalJSON(t, directory, "proof-checks.json", map[string]any{
				"tick": actual.Tick(), "actual_outcome": actual.Outcome(), "expected_outcome": test.want,
				"expected_outcome_matched": actual.Outcome() == test.want, "terminal_hash": hash,
				"initial_hash": initialHash, "paid_ready_rifle": newRifle, "paid_cost": unit.Cost,
				"pending_restore_twin_terminal_full_initial_checkpoint_restart_frozen_checks_passed": true,
			})
			t.Logf("PRACTICE_TERMINAL_BOUNDARY case=%s tick=%d reason=%s draw=%v hash=%s paid_rifle=%d", test.name, actual.Tick(), actual.Outcome().Reason, actual.Outcome().Draw, hash, newRifle)
			if actual.Outcome() != test.want {
				t.Errorf("same-tick practice terminal overwritten: got %+v want %+v", actual.Outcome(), test.want)
			}
		})
	}
}
