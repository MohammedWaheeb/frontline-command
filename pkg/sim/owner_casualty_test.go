package sim

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func casualtyIDs(events []Event) []ID {
	ids := []ID{}
	for _, event := range events {
		if event.Kind == "destroyed" {
			ids = append(ids, event.Entity)
		}
	}
	return ids
}

func TestOwnerCasualtyAuthorizationDoesNotBroadenOtherFeedback(t *testing.T) {
	for _, allied := range []bool{false, true} {
		e := fixture(t)
		if allied {
			e.player(2).Team = e.player(1).Team
		}
		far := Vec{X: 32000, Y: 50000}
		e.updateFog()
		if e.canSee(1, far) || e.canSee(2, far) {
			t.Fatal("fixture point visible")
		}
		e.state.Events = []Event{
			{ID: 1, Kind: "destroyed", Scope: "visible", Owner: 1, Entity: 101, Position: far},
			{ID: 2, Kind: "destroyed", Scope: "visible", Owner: 2, Entity: 102, Position: far},
			{ID: 3, Kind: "weapon_fired", Scope: "visible", Owner: 1, Entity: 103, Position: far},
			{ID: 4, Kind: "impact", Scope: "visible", Owner: 1, Entity: 104, Position: far},
			{ID: 5, Kind: "destroyed", Scope: "invalid", Owner: 1, Entity: 105, Position: far},
			{ID: 6, Kind: "destroyed", Scope: "visible", Owner: 2, Entity: 106, Position: Vec{X: 8000, Y: 8000}},
		}
		before := e.Hash()
		for _, player := range []PlayerID{1, 2} {
			feedback, ok := e.PlayerFeedback(player)
			want := []ID{101, 106}
			if player == 2 {
				want = []ID{102, 106}
			}
			if !ok || !reflect.DeepEqual(casualtyIDs(feedback.Events), want) || len(feedback.Events) != len(want) {
				t.Errorf("allied=%v player=%d feedback=%+v want casualties=%v", allied, player, feedback, want)
			}
			if len(feedback.Events) > 0 {
				feedback.Events[0].Owner = 99
				feedback.Events[0].Position = Vec{}
			}
		}
		if e.Hash() != before {
			t.Fatal("feedback aliases or modifies state")
		}
		if feedback, ok := e.PlayerFeedback(99); ok || len(feedback.Events) != 0 {
			t.Fatal("unknown perspective received events")
		}
	}
}

// The starting actors are a bounded mechanics fixture. After seeding, the
// casualty is produced exclusively by normal Attack/Advance combat.
func TestOwnerCasualtyOrdinaryLastSightSaveReplay(t *testing.T) {
	e, shooter, target := feedbackFixture(t, true)
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, Order{Kind: "attack", Entities: []ID{shooter.ID}, Target: target.ID})
	var lost Event
	for range 1000 {
		for _, event := range e.state.Events {
			if event.Kind == "destroyed" && (event.Entity == shooter.ID || event.Entity == target.ID) {
				lost = event
			}
		}
		if lost.ID != 0 {
			break
		}
		e.Advance()
	}
	if lost.ID == 0 || e.entity(lost.Entity) != nil || e.canSee(lost.Owner, lost.Position) {
		t.Fatal("no last-sight casualty", lost)
	}
	before := e.Hash()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil || restored.Hash() != before {
		t.Fatal("casualty restore differs", err)
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	replay.Checkpoints = nil
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != before {
		t.Fatal("full replay diverged", err)
	}
	views := map[PlayerID]View{}
	for _, player := range []PlayerID{1, 2} {
		view, _ := e.PlayerView(player)
		views[player] = view
		wire, _ := json.Marshal(view)
		for _, copy := range []*Engine{restored, played} {
			other, _ := copy.PlayerView(player)
			encoded, _ := json.Marshal(other)
			if !bytes.Equal(wire, encoded) {
				t.Fatal("save or replay changed feedback", player)
			}
		}
	}
	if e.Hash() != before {
		t.Fatal("views changed simulation")
	}
	exportFeedback(t, "casualty-ordinary", map[string]any{"hash": before, "tick": e.Tick(), "lost": lost, "views": views})
	if dir := os.Getenv("FRONTLINE_COMBAT_OUTPUT"); dir != "" {
		if err = os.WriteFile(filepath.Join(dir, "casualty-ordinary.save.json"), saved, 0644); err != nil {
			t.Fatal(err)
		}
	}
	feedback, _ := e.PlayerFeedback(lost.Owner)
	if !reflect.DeepEqual(casualtyIDs(feedback.Events), []ID{lost.Entity}) {
		t.Errorf("owner lost casualty when own vision ended: %+v", feedback)
	}
	for _, event := range feedback.Events {
		if event.Kind == "destroyed" && (event.Combat != nil || event.Value != 0 || event.Owner != lost.Owner) {
			t.Fatal("casualty invented cause", event)
		}
	}
	for range 80 {
		e.Advance()
		restored.Advance()
		played.Advance()
		if e.Hash() != restored.Hash() || e.Hash() != played.Hash() {
			t.Fatal("continuation diverged")
		}
	}
	exportFeedback(t, "casualty-continuation", map[string]any{"tick": e.Tick(), "hash": e.Hash()})
}

func TestOwnerCasualtyCapturedBuildingUsesDeathTimeOwner(t *testing.T) {
	e := fixture(t)
	building := e.spawn("bunker", 2, Vec{X: 30000, Y: 40000}, true, 400000)
	building.HP = building.MaxHP / 5
	e.recalculate()
	e.updateFog()
	if !e.captureBuilding(1, building) || building.Owner != 1 {
		t.Fatal("capture failed")
	}
	building.HP = 0
	e.state.Events = nil
	e.cleanup()
	e.updateFog()
	if e.canSee(1, building.Position) || e.canSee(2, building.Position) {
		t.Fatal("fixture retained sight")
	}
	for _, player := range []PlayerID{1, 2} {
		feedback, _ := e.PlayerFeedback(player)
		want := []ID{}
		if player == 1 {
			want = append(want, building.ID)
		}
		if !reflect.DeepEqual(casualtyIDs(feedback.Events), want) {
			t.Errorf("player %d got wrong captured casualty: %+v", player, feedback)
		}
	}
}

func TestOwnerCasualtyAirbornePassengersAfterLastSight(t *testing.T) {
	s := transportAcceptanceFixture(t, "US.airlift")
	boardTransport(t, s)
	e := s.engine
	// Explicit airborne transport-loss fixture; a grounded carrier permits
	// surviving passengers to escape and continue providing sight.
	e.entity(s.carrier).Landed = false
	position := e.entity(s.carrier).Position
	transportImpact(e, s.carrier, e.Tick()+1, true)
	e.Advance()
	if e.entity(s.carrier) != nil || e.canSee(1, position) || e.canSee(2, position) {
		t.Fatalf("fixture retained carrier=%v or sight1=%v sight2=%v at=%+v entities=%+v", e.entity(s.carrier), e.canSee(1, position), e.canSee(2, position), position, e.state.Entities)
	}
	want := append([]ID{s.carrier}, s.passengers...)
	before := e.Hash()
	for _, player := range []PlayerID{1, 2} {
		feedback, _ := e.PlayerFeedback(player)
		expected := []ID{}
		if player == 1 {
			expected = want
		}
		if !reflect.DeepEqual(casualtyIDs(feedback.Events), expected) {
			t.Errorf("player %d casualties=%v want=%v", player, casualtyIDs(feedback.Events), expected)
		}
	}
	if before != e.Hash() {
		t.Fatal("passenger feedback changed authoritative state")
	}
}
