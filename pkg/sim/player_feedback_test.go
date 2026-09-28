package sim

import (
	"reflect"
	"testing"
)

func TestPlayerFeedbackAuthorizationAndDetachedValues(t *testing.T) {
	e := fixture(t)
	e.state.Events = []Event{
		{ID: 1, Kind: "notice", Scope: "all", Owner: 2},
		{ID: 2, Kind: "notice", Scope: "owner", Owner: 1},
		{ID: 3, Kind: "notice", Scope: "owner", Owner: 2},
		{ID: 4, Kind: "notice", Scope: "team", Owner: 2},
		{ID: 5, Kind: "notice", Scope: "visible", Owner: 2, Position: Vec{X: 8000, Y: 8000}},
		{ID: 6, Kind: "notice", Scope: "visible", Owner: 2, Position: Vec{X: 55000, Y: 55000}},
	}
	e.state.Results = []OrderResult{{Player: 1, Sequence: 4, Accepted: true}, {Player: 2, Sequence: 6, Accepted: false}}
	before := e.Hash()
	assertIDs := func(want []uint32) {
		t.Helper()
		feedback, ok := e.PlayerFeedback(1)
		if !ok {
			t.Fatal("missing knownplayer")
		}
		ids := []uint32{}
		for _, event := range feedback.Events {
			ids = append(ids, event.ID)
		}
		if !reflect.DeepEqual(ids, want) {
			t.Fatal(ids, want)
		}
		if len(feedback.Results) != 1 || feedback.Results[0].Player != 1 || feedback.Results[0].Sequence != 4 {
			t.Fatal(feedback.Results)
		}
		feedback.Events[0].Text = "client mutation"
		feedback.Results[0].Sequence = 999
	}
	assertIDs([]uint32{1, 2, 5})
	if before != e.Hash() {
		t.Fatal("feedback modified simulation")
	}
	if got, ok := e.PlayerFeedback(99); ok || len(got.Events) != 0 || len(got.Results) != 0 {
		t.Fatal("unknown player received feedback")
	}
	e.player(2).Team = e.player(1).Team
	assertIDs([]uint32{1, 2, 4, 5})
}

func TestPlayerFeedbackPreservesConcealedImpactRedaction(t *testing.T) {
	e := fixture(t)
	e.spawn("US.tank", 1, Vec{X: 16000, Y: 16000}, true, 1300000)
	target := e.spawn("IR.tank", 2, Vec{X: 21000, Y: 16000}, true, 1200000)
	e.updateFog()
	e.state.Events = []Event{{ID: 1, Kind: "impact", Scope: "visible", Owner: 2, Entity: target.ID, Position: target.Position}}
	feedback, _ := e.PlayerFeedback(1)
	if len(feedback.Events) != 1 || feedback.Events[0].Entity != target.ID {
		t.Fatal("visible target missing", feedback)
	}
	target.Concealed = true
	e.updateFog()
	before := e.Hash()
	feedback, _ = e.PlayerFeedback(1)
	if len(feedback.Events) != 1 || feedback.Events[0].Entity != 0 {
		t.Fatal("hidden target leaked", feedback)
	}
	if e.state.Events[0].Entity != target.ID || e.Hash() != before {
		t.Fatal("redaction altered authoritative event")
	}
}
