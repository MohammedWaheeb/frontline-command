package sim_test

import (
	"frontlinecommand/pkg/sim"
	"testing"
)

// A test driver's current permitted selection, not a new capture rule. Actual
// production, movement, targeting and capture still pass ordinary Go commands.
func authoredCaptureForce(view sim.View, reserve map[sim.ID]bool, faction string) (actors, tanks []sim.ID) {
	for _, e := range view.Entities {
		if e.Owner != 1 || reserve[e.ID] || !e.Complete || !e.Enabled || e.Private == nil || e.Private.Container != 0 {
			continue
		}
		if e.Type != faction+".rifle" && e.Type != faction+".at" && e.Type != faction+".tank" {
			continue
		}
		actors = append(actors, e.ID)
		if e.Type == faction+".tank" {
			tanks = append(tanks, e.ID)
		}
	}
	return
}
func authoredCaptureBudget(deadline, tick sim.Tick) sim.Tick {
	if tick >= deadline {
		return 0
	}
	return deadline - tick
}
func TestAuthoredCaptureReadinessSelection(t *testing.T) {
	actor := func(id sim.ID, typ string) sim.EntityView {
		return sim.EntityView{ID: id, Type: typ, Owner: 1, Complete: true, Enabled: true, Private: &sim.EntityPrivate{}}
	}
	view := sim.View{Entities: []sim.EntityView{actor(1, "SA.rifle"), actor(2, "SA.at"), actor(3, "SA.rifle")}}
	reserved := map[sim.ID]bool{}
	ids, tanks := authoredCaptureForce(view, reserved, "SA")
	if len(ids) != 3 || len(tanks) != 0 {
		t.Fatal("infantry-only group falsely ready", ids, tanks)
	}
	view.Entities = append(view.Entities, actor(4, "SA.tank"))
	ids, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(ids) != 4 || len(tanks) != 1 {
		t.Fatal("real tank not counted")
	}
	// A guard allocator can reserve a spare only while another free tank remains.
	view.Entities = append(view.Entities, actor(5, "SA.tank"))
	_, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(tanks) <= 1 {
		t.Fatal("spare tank not available")
	}
	reserved[tanks[0]] = true
	ids, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(ids) != 4 || len(tanks) != 1 || tanks[0] != 5 {
		t.Fatal("last free tank not retained", ids, tanks)
	}
	reserved[5] = true
	ids, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(ids) != 3 || len(tanks) != 0 {
		t.Fatal("reserved tank leaked into assault cohort")
	}
	// Fresh paid completion is eligible even when both existing tanks are guards.
	view.Entities = append(view.Entities, actor(6, "SA.tank"))
	_, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(tanks) != 1 || tanks[0] != 6 {
		t.Fatal("new completion did not recover readiness")
	}
	for _, id := range []sim.ID{1, 2, 3, 6} {
		reserved[id] = true
	}
	ids, tanks = authoredCaptureForce(view, reserved, "SA")
	if len(ids) != 0 || len(tanks) != 0 {
		t.Fatal("wholly empty cohort not empty")
	}
}
func TestAuthoredCaptureReadinessExcludesUnavailableAndForeign(t *testing.T) {
	base := sim.EntityView{ID: 1, Type: "SA.tank", Owner: 1, Complete: true, Enabled: true, Private: &sim.EntityPrivate{}}
	cases := []sim.EntityView{base, base, base, base, base, base}
	cases[0].Owner = 2
	cases[1].Complete = false
	cases[2].Enabled = false
	cases[3].Private = nil
	cases[4].Private = &sim.EntityPrivate{Container: 9}
	cases[5].Type = "SA.aa"
	ids, tanks := authoredCaptureForce(sim.View{Entities: cases}, nil, "SA")
	if len(ids) != 0 || len(tanks) != 0 {
		t.Fatal("unusable or foreign actor counted", ids, tanks)
	}
	for _, tick := range []sim.Tick{0, 1, 5999, 6000, 6001, 9000} {
		want := sim.Tick(0)
		if tick < 6000 {
			want = 6000 - tick
		}
		if got := authoredCaptureBudget(6000, tick); got != want {
			t.Fatal("deadline extended", tick, got, want)
		}
	}
}
