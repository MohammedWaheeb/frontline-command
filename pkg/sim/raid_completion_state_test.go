package sim

import (
	"bytes"
	"encoding/json"
	"testing"
)

// Candidate-only typed state tests are staged after the field-free baseline.
func TestRaidCompletionReliabilitySerializedAndHashedReference(t *testing.T) {
	e := raidCompletionFixture(t, "late")
	raidCompletionAdvanceTo(t, []*Engine{e}, 475)
	house := tagged(e, "raid-house")
	if house.CompletedAt != 75 || house.Created != 75 || !e.raidSafehouseReady(1, house) {
		t.Fatal("late authored completion reference was not mature exactly at 400 ticks")
	}
	data, err := e.Save()
	if err != nil || !bytes.Contains(data, []byte(`"completed_at":75`)) {
		t.Fatal("save omitted deterministic completion reference", err)
	}
	changed := raidCompletionClone(t, e)
	changed.entity(house.ID).CompletedAt++
	if changed.Hash() == e.Hash() || changed.raidSafehouseReady(1, changed.entity(house.ID)) {
		t.Fatal("completion reference did not affect hash and 399-tick readiness")
	}
	changed = raidCompletionClone(t, changed)
	if changed.entity(house.ID).CompletedAt != 76 || changed.raidSafehouseReady(1, changed.entity(house.ID)) {
		t.Fatal("restored completion reference lost immature readiness")
	}
	for _, v := range e.state.Entities {
		if !v.Building && v.CompletedAt != 0 || v.Building && v.Created == 0 && v.CompletedAt != 0 {
			t.Fatal("completion timestamp was assigned to a unit or changed authored tick-zero time", v.ID)
		}
	}
	// Owner changes and disable intervals do not restart physical completion.
	issue(t, e, 1, Order{Kind: "power", Entities: []ID{house.ID}, Index: 0})
	if house.CompletedAt != 75 || e.raidSafehouseReady(1, house) {
		t.Fatal("disabling reset completion or remained ready")
	}
	issue(t, e, 1, Order{Kind: "power", Entities: []ID{house.ID}, Index: 1})
	if house.CompletedAt != 75 || !e.raidSafehouseReady(1, house) {
		t.Fatal("reenabling restarted completed wait")
	}
	// The explicit view projection exposes neither timestamp to a visible enemy.
	e.entity(3).Position = Vec{X: 20000, Y: 12000}
	e.updateFog()
	view, ok := e.PlayerView(2)
	item := originEntity(t, view, house.ID)
	projection, marshalErr := json.Marshal(view)
	if !ok || marshalErr != nil || item == nil || item.Private != nil || bytes.Contains(projection, []byte("completed_at")) || bytes.Contains(projection, []byte("created")) {
		t.Fatal("completion reference leaked through visible-enemy projection", item, err, marshalErr)
	}
}

func TestRaidCompletionReliabilityRestoreRejectsInvalidTimeline(t *testing.T) {
	e := raidCompletionFixture(t, "late")
	raidCompletionAdvanceTo(t, []*Engine{e}, 75)
	houseID := tagged(e, "raid-house").ID
	cases := []struct {
		name   string
		mutate func(*State, *Entity)
	}{
		{"future-completion", func(s *State, v *Entity) { v.CompletedAt = s.Tick + 1 }},
		{"before-creation", func(s *State, v *Entity) { v.CompletedAt = v.Created - 1 }},
		{"missing-late-reference", func(s *State, v *Entity) { v.CompletedAt = 0 }},
		{"incomplete-reference", func(s *State, v *Entity) { v.Complete = false }},
		{"future-creation", func(s *State, v *Entity) { v.Created = s.Tick + 1; v.CompletedAt = v.Created }},
		{"unit-reference", func(s *State, v *Entity) { s.Entities[1].CompletedAt = 1 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := e.StateCopy()
			for _, v := range s.Entities {
				if v.ID == houseID {
					tc.mutate(&s, v)
					break
				}
			}
			if _, err := Restore(e.catalog, signedState(s)); err == nil {
				t.Fatal("checksummed invalid completion timeline was accepted")
			}
		})
	}
}

func TestRaidCompletionReliabilitySharedReadinessGuards(t *testing.T) {
	e := raidCompletionFixture(t, "late")
	raidCompletionAdvanceTo(t, []*Engine{e}, 475)
	id := tagged(e, "raid-house").ID
	cases := []struct {
		name   string
		mutate func(*Engine, *Entity)
		ready  bool
	}{
		{"399", func(e *Engine, v *Entity) { v.CompletedAt++ }, false},
		{"400", func(e *Engine, v *Entity) {}, true},
		{"future-underflow", func(e *Engine, v *Entity) { v.CompletedAt = e.Tick() + 1 }, false},
		{"disabled", func(e *Engine, v *Entity) { v.DisabledUntil = e.Tick() + 1 }, false},
		{"disable-ended", func(e *Engine, v *Entity) { v.DisabledUntil = e.Tick() }, true},
		{"owner", func(e *Engine, v *Entity) { v.Owner = 2 }, false},
		{"incomplete", func(e *Engine, v *Entity) { v.Complete = false }, false},
		{"destroyed", func(e *Engine, v *Entity) { v.HP = 0 }, false},
		{"visibility", func(e *Engine, v *Entity) { e.visible[1] = make([]bool, len(e.state.Map.Tiles)) }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			copy := raidCompletionClone(t, e)
			v := copy.entity(id)
			tc.mutate(copy, v)
			before := copy.Hash()
			if ready := copy.raidSafehouseReady(1, v); ready != tc.ready || before != copy.Hash() {
				t.Fatal("shared readiness lost a legality guard or mutated state", ready, tc.ready)
			}
		})
	}
	if e.raidSafehouseReady(1, nil) {
		t.Fatal("missing safehouse was ready")
	}
}

func TestRaidCompletionReliabilityStampOnPublicPaidCompletion(t *testing.T) {
	e := raidCompletionFixture(t, "paid")
	issue(t, e, 1, Order{Kind: "build", Entities: []ID{2}, Type: "SY.safehouse", Position: Vec{X: 12000, Y: 12000}})
	house := e.state.Entities[len(e.state.Entities)-1]
	if house.Type != "SY.safehouse" || house.Complete || house.CompletedAt != 0 || house.Created != e.Tick() {
		t.Fatal("foundation has completion time or did not retain creation tick")
	}
	created := house.Created
	raidCompletionAdvanceTo(t, []*Engine{e}, 100)
	engines := []*Engine{e, raidCompletionClone(t, e)}
	for !house.Complete && e.Tick() < 1000 {
		raidCompletionAdvanceTo(t, engines, e.Tick()+1)
	}
	completed := e.Tick()
	if !house.Complete || completed-created < 500 {
		t.Fatal("public paid construction failed to reach completion")
	}
	for _, copy := range engines {
		built := copy.entity(house.ID)
		if built.CompletedAt != completed || built.Created != created {
			t.Fatal("paid completion did not stamp its exact tick or changed Created", built.CompletedAt, built.Created)
		}
		clone := raidCompletionClone(t, copy)
		if clone.entity(house.ID).CompletedAt != completed {
			t.Fatal("saved paid completion lost its timestamp")
		}
	}
}
