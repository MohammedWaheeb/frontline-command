package sim

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const confirmedPublicIntakeV1Raw4800 = "44dc161c436972a369e87fe9d4583cb97e9816c4e4a878b2d52edd5895d80f9c"

func confirmedPublicIntakeV1View(t *testing.T, e *Engine, owner PlayerID) View {
	t.Helper()
	v, ok := e.PlayerView(owner)
	if !ok {
		t.Fatalf("owner%d has no public view", owner)
	}
	return v
}

func confirmedPublicIntakeV1Field(fields []FieldView, id uint32) (FieldView, int) {
	var found FieldView
	count := 0
	for _, field := range fields {
		if field.ID == id {
			found, count = field, count+1
		}
	}
	return found, count
}

func confirmedPublicIntakeV1Known(t *testing.T, view View, id uint32) FieldObservation {
	t.Helper()
	var found FieldObservation
	count := 0
	for _, field := range view.KnownFields {
		if field.ID == id {
			found, count = field, count+1
		}
	}
	if count != 1 {
		t.Fatalf("owner%d public memory has%d entries for field%d", view.Player, count, id)
	}
	return found
}

func confirmedPublicIntakeV1Sorted(t *testing.T, fields []FieldView) {
	t.Helper()
	for i, field := range fields {
		if field.ID == 0 || i > 0 && fields[i-1].ID >= field.ID {
			t.Fatalf("AI fields are not unique and sorted by ID: %+v", fields)
		}
	}
}

func confirmedPublicIntakeV1Save(t *testing.T, e *Engine) []byte {
	t.Helper()
	raw, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func confirmedPublicIntakeV1Restore(t *testing.T, raw []byte) *Engine {
	t.Helper()
	e, err := Restore(content.MustBase(), raw)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

// This opt-in course alone is bound to the unchanged fresh0.3.6 Border save.
// Advance is the only operation after Restore; no old command oracle is used.
func TestConfirmedPublicIntake036NaturalBorder4800(t *testing.T) {
	path := os.Getenv("FRONTLINE_INTAKE036_CHECKPOINT")
	declared := os.Getenv("FRONTLINE_INTAKE036_CHECKPOINT_SHA256")
	if path == "" && declared == "" {
		t.Skip("root-only exact0.3.6 checkpoint path/SHA not supplied")
	}
	if !filepath.IsAbs(path) || declared != confirmedPublicIntakeV1Raw4800 {
		t.Fatal("admitted natural course requires exact absolute checkpoint path/SHA")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) != confirmedPublicIntakeV1Raw4800 {
		t.Fatal("natural checkpoint bytes differ from the closed fresh0.3.6 course")
	}
	e := confirmedPublicIntakeV1Restore(t, raw)
	if Version != "0.3.6" || e.Tick() != 4800 || e.state.Countdown != 0 || e.state.Metadata.Seed != 48019 || e.state.Map.ID != "border-depots" || e.Hash() != "b15377d962b3a96149c868c180c1fb10c140abab5ab54d715210c72fc01a5df0" {
		t.Fatal("natural checkpoint simulation/catalog/state identity differs; no retag is permitted")
	}
	want := FieldObservation{ID: 4, Position: Vec{X: 127500, Y: 43500}, Remaining: 36000000, Seen: 4650}
	for _, owner := range []PlayerID{1, 3} {
		p := e.player(owner)
		view := confirmedPublicIntakeV1View(t, e, owner)
		if p.AI != "normal" || p.Defeated || p.AILast != 4781 || confirmedPublicIntakeV1Known(t, view, 4) != want {
			t.Fatalf("owner%d does not reproduce the original public memory/due-cycle setup", owner)
		}
		if _, count := confirmedPublicIntakeV1Field(view.Fields, 4); count != 0 {
			t.Fatalf("owner%d currently sees field4 at4800", owner)
		}
		if _, count := confirmedPublicIntakeV1Field(p.AIFields, 4); count != 0 {
			t.Fatalf("owner%d original checkpoint already contains AI field4", owner)
		}
	}
	for tick := Tick(4801); tick <= 4821; tick++ {
		e.Advance()
		if e.Tick() != tick {
			t.Fatalf("natural clock did not progress to%d", tick)
		}
		for _, owner := range []PlayerID{1, 3} {
			p := e.player(owner)
			view := confirmedPublicIntakeV1View(t, e, owner)
			if confirmedPublicIntakeV1Known(t, view, 4) != want {
				t.Fatalf("owner%d public field4 memory/Seen changed at%d", owner, tick)
			}
			if _, count := confirmedPublicIntakeV1Field(view.Fields, 4); count != 0 {
				t.Fatalf("owner%d gained final current sight of field4 at%d", owner, tick)
			}
			field, count := confirmedPublicIntakeV1Field(p.AIFields, 4)
			if tick < 4821 {
				if p.AILast != 4781 || count != 0 {
					t.Fatalf("owner%d intake occurred before the natural due cycle", owner)
				}
				continue
			}
			if p.AILast != 4821 {
				t.Fatalf("owner%d did not reach its actual4821 planning cycle", owner)
			}
			if count != 1 || field != (FieldView{ID: want.ID, Position: want.Position, Remaining: want.Remaining}) {
				t.Errorf("owner%d due4821 omitted public field4 or changed its remembered identity/stock: count%d field%+v", owner, count, field)
			}
			confirmedPublicIntakeV1Sorted(t, p.AIFields)
		}
	}
	// Compare the branch with its own cold Restore, never with old intentions.
	cold := confirmedPublicIntakeV1Restore(t, confirmedPublicIntakeV1Save(t, e))
	if cold.Hash() != e.Hash() {
		t.Fatal("same-branch final cold Restore changed State")
	}
	for _, owner := range []PlayerID{1, 3} {
		if !reflect.DeepEqual(confirmedPublicIntakeV1View(t, e, owner), confirmedPublicIntakeV1View(t, cold, owner)) {
			t.Fatalf("owner%d same-branch cold Restore changed the full authorized View", owner)
		}
	}
}

// Generic controls use current Version/MustBase, not the legacy course save.
// The one field relocation is a declared controlled map input BEFORE New.
func confirmedPublicIntakeV1VisibleFixture(t *testing.T) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Fields[0].Position = Vec{X: 17500, Y: 8000}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 48019, Players: []PlayerConfig{{ID: 1, Faction: "US", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	view := confirmedPublicIntakeV1View(t, e, 1)
	field, count := confirmedPublicIntakeV1Field(view.Fields, 1)
	if count != 1 || field.Remaining <= 0 || confirmedPublicIntakeV1Known(t, view, 1).Remaining != field.Remaining {
		t.Fatal("controlled New did not genuinely expose positive field1")
	}
	return e
}

func confirmedPublicIntakeV1HiddenFixture(t *testing.T) *Engine {
	t.Helper()
	e := confirmedPublicIntakeV1VisibleFixture(t)
	for e.state.Countdown > 0 && e.Tick() < 1000 {
		e.Advance()
	}
	if e.state.Countdown != 0 {
		t.Fatal("ordinary New countdown did not finish")
	}
	var rig *Entity
	for _, actor := range e.state.Entities {
		if actor.Owner == 1 && e.role(actor) == "rig" {
			rig = actor
			break
		}
	}
	if rig == nil {
		t.Fatal("controlled New has no owned rig")
	}
	sequence := e.player(1).LastSequence + 1
	if err := e.Submit(1, sequence, []Order{{Kind: "move", Entities: []ID{rig.ID}, Position: Vec{X: rig.Position.X, Y: 20000}}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	accepted := false
	for _, result := range e.state.Results {
		accepted = accepted || result.Player == 1 && result.Sequence == sequence && result.Accepted
	}
	if !accepted {
		t.Fatal("controlled ordinary rig Move was not accepted", e.state.Results)
	}
	for steps := 0; len(rig.Orders) != 0 && steps < 1000; steps++ {
		e.Advance()
	}
	view := confirmedPublicIntakeV1View(t, e, 1)
	known := confirmedPublicIntakeV1Known(t, view, 1)
	if len(rig.Orders) != 0 || known.Remaining <= 0 || known.Seen > e.Tick() {
		t.Fatal("controlled ordinary Move did not complete with valid retained public stock")
	}
	if _, count := confirmedPublicIntakeV1Field(view.Fields, 1); count != 0 {
		t.Fatal("completed rig Move did not actually lose final current sight of field1")
	}
	t.Logf("controlled ordinary sight loss: tick%d retained Seen%d; Seen is not final visibility", e.Tick(), known.Seen)
	return e
}

// The only State delta is one live field's Remaining. The memory, identity,
// clocks, actors, catalog and simulation header are never rewritten.
func confirmedPublicIntakeV1StockTwin(t *testing.T, raw []byte, id uint32) *Engine {
	t.Helper()
	var env saveEnvelope
	var state State
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(env.State, &state); err != nil {
		t.Fatal(err)
	}
	var changed *ResourceField
	for _, field := range state.Fields {
		if field.ID == id {
			changed = field
			break
		}
	}
	if changed == nil || changed.Remaining <= 0 {
		t.Fatal("controlled twin requires actual positive live stock")
	}
	previous := changed.Remaining
	changed.Remaining = 0
	modified, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	changed.Remaining = previous
	normalized, err := json.Marshal(state)
	if err != nil || !bytes.Equal(normalized, env.State) {
		t.Fatal("controlled twin has a State change beyond that one live stock value")
	}
	sum := sha256.Sum256(modified)
	env.State, env.SHA256 = modified, hex.EncodeToString(sum[:])
	twin, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	return confirmedPublicIntakeV1Restore(t, twin)
}

func TestConfirmedPublicIntake036Precedence(t *testing.T) {
	for _, existing := range []bool{false, true} {
		name := "missing_remembered_ID"
		if existing {
			name = "existing_ID_is_not_refreshed_by_memory"
		}
		t.Run(name, func(t *testing.T) {
			e := confirmedPublicIntakeV1HiddenFixture(t)
			p := e.player(1)
			before := confirmedPublicIntakeV1View(t, e, 1)
			known := confirmedPublicIntakeV1Known(t, before, 1)
			want := FieldView{ID: known.ID, Position: known.Position, Remaining: known.Remaining}
			if existing {
				// Controlled contrasting AI observation. AIFields has no Seen,
				// so this asserts preservation, not a guessed chronological age.
				want.Remaining = 700000
				p.AIFields = []FieldView{want}
			}
			for call := 0; call < 2; call++ {
				e.aiObserve(p, confirmedPublicIntakeV1View(t, e, 1))
				field, count := confirmedPublicIntakeV1Field(p.AIFields, 1)
				if count != 1 || field != want {
					t.Fatalf("public memory intake/precedence failed: count%d field%+v want%+v", count, field, want)
				}
				confirmedPublicIntakeV1Sorted(t, p.AIFields)
				if !reflect.DeepEqual(before, confirmedPublicIntakeV1View(t, e, 1)) {
					t.Fatal("aiObserve mutated public KnownFields/Seen or another full View fact")
				}
			}
		})
	}
	for _, existing := range []bool{false, true} {
		name := "current_zero_after_missing_memory"
		if existing {
			name = "current_zero_after_existing_memory"
		}
		t.Run(name, func(t *testing.T) {
			original := confirmedPublicIntakeV1Restore(t, confirmedPublicIntakeV1Save(t, confirmedPublicIntakeV1VisibleFixture(t)))
			positive := confirmedPublicIntakeV1View(t, original, 1)
			e := confirmedPublicIntakeV1StockTwin(t, confirmedPublicIntakeV1Save(t, original), 1)
			before := confirmedPublicIntakeV1View(t, e, 1)
			known := confirmedPublicIntakeV1Known(t, before, 1)
			current, count := confirmedPublicIntakeV1Field(before.Fields, 1)
			if count != 1 || current.Remaining != 0 || known.Remaining <= 0 {
				t.Fatal("controlled current-zero/positive-memory boundary was not established")
			}
			// Sensitivity: normalize only current visible stock, then compare
			// every other authorized public fact with the positive branch.
			normalized := before
			normalized.Fields = append([]FieldView(nil), before.Fields...)
			for i := range normalized.Fields {
				if normalized.Fields[i].ID == 1 {
					normalized.Fields[i].Remaining = known.Remaining
				}
			}
			if !reflect.DeepEqual(positive, normalized) {
				t.Fatal("public stock sensitivity twin changed another full View fact")
			}
			p := e.player(1)
			if existing {
				p.AIFields = []FieldView{{ID: 1, Position: known.Position, Remaining: 700000}}
			}
			e.aiObserve(p, before)
			field, count := confirmedPublicIntakeV1Field(p.AIFields, 1)
			if count != 1 || field != current {
				t.Fatal("current visible zero did not win over remembered/existing positive stock", p.AIFields)
			}
			confirmedPublicIntakeV1Sorted(t, p.AIFields)
			if !reflect.DeepEqual(before, confirmedPublicIntakeV1View(t, e, 1)) {
				t.Fatal("current-zero intake changed KnownFields/Seen or the full authorized View")
			}
		})
	}
}

func confirmedPublicIntakeV1Plans(e *Engine, owner PlayerID) []Scheduled {
	var plans []Scheduled
	for _, plan := range e.state.Pending {
		if plan.Player == owner {
			plans = append(plans, plan)
		}
	}
	return plans
}

func TestConfirmedPublicIntake036HiddenStockTwin(t *testing.T) {
	prepared := confirmedPublicIntakeV1HiddenFixture(t)
	// This is an explicitly controlled intention setup, not an unassisted
	// course: enable normal AI after the human rig Move completes. No clock,
	// budget, health, geometry, fog or public memory is changed here.
	prepared.player(1).AI, prepared.player(1).Controller = "normal", "ai"
	raw := confirmedPublicIntakeV1Save(t, prepared)
	a := confirmedPublicIntakeV1Restore(t, raw)
	b := confirmedPublicIntakeV1StockTwin(t, raw, 1)
	if a.Hash() == b.Hash() {
		t.Fatal("hidden-stock control did not change the detached State")
	}
	known := confirmedPublicIntakeV1Known(t, confirmedPublicIntakeV1View(t, a, 1), 1)
	due := a.Tick() + 1
	for step := 0; step <= 1; step++ {
		av, bv := confirmedPublicIntakeV1View(t, a, 1), confirmedPublicIntakeV1View(t, b, 1)
		if !reflect.DeepEqual(av, bv) {
			t.Fatalf("hidden live depletion changed the full authorized View at%d", a.Tick())
		}
		if _, count := confirmedPublicIntakeV1Field(av.Fields, 1); count != 0 || confirmedPublicIntakeV1Known(t, av, 1) != known {
			t.Fatal("hidden-stock premise lost actual sight loss/unchanged public memory")
		}
		if !reflect.DeepEqual(a.player(1).AIFields, b.player(1).AIFields) || !reflect.DeepEqual(confirmedPublicIntakeV1Plans(a, 1), confirmedPublicIntakeV1Plans(b, 1)) || a.player(1).AIGoal != b.player(1).AIGoal || a.player(1).AIIntent != b.player(1).AIIntent || a.player(1).AIScout != b.player(1).AIScout {
			t.Fatal("hidden live stock changed owned knowledge or chosen intentions")
		}
		if step == 0 {
			a.Advance()
			b.Advance()
		}
	}
	if a.Tick() != due || b.Tick() != due || a.player(1).AILast != due || b.player(1).AILast != due {
		t.Fatal("hidden-stock controls did not reach their real planning cycle")
	}
	plans := confirmedPublicIntakeV1Plans(a, 1)
	if len(plans) == 0 {
		t.Fatal("hidden-stock intention equality was vacuous")
	}
	paid := false
	var paidSequence uint32
	var paidIndex int32
	for _, plan := range plans {
		for index, order := range plan.Orders {
			if rule, ok := a.catalog.Building(order.Type); order.Kind == "build" && ok && rule.Cost > 0 && rule.Cost <= a.player(1).Credits {
				paid = true
				paidSequence, paidIndex = plan.Sequence, int32(index)
			}
		}
	}
	if !paid {
		t.Fatal("hidden-stock setup produced no ordinary affordable paid construction intention")
	}
	for _, branch := range []*Engine{a, b} {
		branch.Advance()
		accepted := false
		for _, result := range branch.state.Results {
			accepted = accepted || result.Player == 1 && result.Sequence == paidSequence && result.Index == paidIndex && result.Accepted
		}
		if !accepted {
			t.Fatal("paired paid intention did not pass ordinary next-tick execution", branch.state.Results)
		}
		cold := confirmedPublicIntakeV1Restore(t, confirmedPublicIntakeV1Save(t, branch))
		if cold.Hash() != branch.Hash() || !reflect.DeepEqual(confirmedPublicIntakeV1View(t, branch, 1), confirmedPublicIntakeV1View(t, cold, 1)) {
			t.Fatal("same-branch hidden-stock cold Restore changed State/full View")
		}
	}
	av, bv := confirmedPublicIntakeV1View(t, a, 1), confirmedPublicIntakeV1View(t, b, 1)
	if !reflect.DeepEqual(av, bv) || confirmedPublicIntakeV1Known(t, av, 1) != known {
		t.Fatal("hidden depletion changed the full authorized View/public memory during ordinary execution")
	}
	if _, count := confirmedPublicIntakeV1Field(av.Fields, 1); count != 0 {
		t.Fatal("hidden-stock execution control gained actual current sight")
	}
}
