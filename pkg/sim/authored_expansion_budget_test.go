package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// This is the authored test commander's discretionary savings decision, not
// admission, a resource grant or a replacement for authoritative Go commands.
func authoredExpansionRigAvailable(view sim.View) bool {
	for _, actor := range view.Entities {
		if actor.Owner == 1 && actor.Type == "SY.rig" && actor.Complete && actor.Enabled && actor.Private != nil && actor.Private.Container == 0 {
			return true
		}
	}
	return false
}

func authoredExpansionCanSpend(view sim.View, unfinished bool, foundation sim.ID) bool {
	return !unfinished || foundation != 0 || view.Economy.Credits >= 1800000 || !authoredExpansionRigAvailable(view)
}

func TestAuthoredExpansionBudgetLostRigReleasesSavings(t *testing.T) {
	rig := sim.EntityView{ID: 17, Owner: 1, Type: "SY.rig", Complete: true, Enabled: true, Private: &sim.EntityPrivate{}}
	view := sim.View{Entities: []sim.EntityView{rig}}
	view.Economy.Credits = 1600000
	if authoredExpansionCanSpend(view, true, 0) {
		t.Fatal("live builder no longer preserves existing discretionary reserve")
	}
	view.Entities = nil
	if !authoredExpansionCanSpend(view, true, 0) {
		t.Fatal("lost builder still starves ordinary reinforcement queues")
	}
	view.Entities = []sim.EntityView{rig}
	if !authoredExpansionCanSpend(view, false, 0) || !authoredExpansionCanSpend(view, true, 123) {
		t.Fatal("completed plan or already paid foundation should not reserve again")
	}
	view.Economy.Credits = 1800000
	if !authoredExpansionCanSpend(view, true, 0) {
		t.Fatal("existing savings threshold changed")
	}
}

func TestAuthoredExpansionBudgetUnavailableOrForeignRig(t *testing.T) {
	rig := sim.EntityView{ID: 17, Owner: 1, Type: "SY.rig", Complete: true, Enabled: true, Private: &sim.EntityPrivate{}}
	for _, modify := range []func(*sim.EntityView){
		func(e *sim.EntityView) { e.Owner = 2 },
		func(e *sim.EntityView) { e.Owner = 0 },
		func(e *sim.EntityView) { e.Complete = false },
		func(e *sim.EntityView) { e.Enabled = false },
		func(e *sim.EntityView) { e.Private = nil },
		func(e *sim.EntityView) { e.Private = &sim.EntityPrivate{Container: 5} },
		func(e *sim.EntityView) { e.Type = "US.rig" },
	} {
		actor := rig
		modify(&actor)
		view := sim.View{Entities: []sim.EntityView{actor}}
		view.Economy.Credits = 500000
		if authoredExpansionRigAvailable(view) || !authoredExpansionCanSpend(view, true, 0) {
			t.Fatal("unavailable or foreign builder prevents recovery", actor)
		}
	}
}
