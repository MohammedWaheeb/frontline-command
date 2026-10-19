package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// These are authored-objective boundary fixtures, not player walkthroughs. The
// original objectives and triggers remain intact. Only placement/time needed
// to isolate a completed lesson and an incoming lethal projectile are arranged;
// damage, destruction counters, mission outcomes and replay run the real tick.
func TestTutorialLossGuardsPreserveCompletedLessons(t *testing.T) {
	for _, lesson := range []struct {
		mission, objective, failure, tag string
		count                            int
	}{
		{"tutorial-3-read-the-counter", "transport", "transport-team-lost", "transport-team", 2},
		{"tutorial-4-defend-the-sky", "evade", "evade-team-lost", "starting-rifles", 4},
	} {
		// T3 and T4 are authored US lessons; they do not expose selectable
		// faction variants. Exercise their supported faction on each difficulty.
		for _, faction := range []string{"US"} {
			for _, difficulty := range []string{"easy", "normal", "hard"} {
				for _, completed := range []bool{false, true} {
					stage := "before-lesson"
					if completed {
						stage = "after-lesson"
					}
					t.Run(lesson.mission+"/"+faction+"/"+difficulty+"/"+stage, func(t *testing.T) {
						original := reliabilityAuthoredMission(t, lesson.mission)
						def, err := original.state.Mission.Definition.ForTutorialFaction(original.catalog, original.state.Map, faction)
						if err != nil {
							t.Fatal(err)
						}
						e, err := NewMission(original.catalog, original.state.Map, def, difficulty, 19027)
						if err != nil {
							t.Fatal(err)
						}
						e.state.Countdown = 0
						actors := []*Entity{}
						for _, actor := range e.state.Entities {
							if actor.Tag == lesson.tag {
								actors = append(actors, actor)
							}
						}
						if len(actors) != lesson.count {
							t.Fatalf("authored tagged actors: got %d want %d", len(actors), lesson.count)
						}
						place := func(regionID string) {
							region := e.missionRegion(regionID)
							for i, actor := range actors {
								actor.Position = Vec{X: (region.Min.X+region.Max.X)/2 + int32(i)*1000, Y: (region.Min.Y + region.Max.Y) / 2}
								actor.LastPosition, actor.Anchor = actor.Position, actor.Position
							}
							e.updateFog()
							e.updateMission()
						}
						if completed {
							place("site1")
							if lesson.objective == "evade" {
								if !reliabilityObjective(t, e, "enter-mark").Complete {
									t.Fatal("warning-marker prerequisite incomplete")
								}
								e.state.Tick = 700 // Isolate the authored timer boundary, not a timed walkthrough.
								place("base")
							}
							if !reliabilityObjective(t, e, lesson.objective).Complete {
								t.Fatal("authored lesson did not complete at its legal region/time boundary")
							}
						}
						if e.Outcome().Finished {
							t.Fatalf("other lessons should remain pending: %+v", e.Outcome())
						}
						// T3 becomes unwinnable after one squad is lost; T4 only after every
						// original rifle is lost. After completion, kill every tagged actor to
						// check that none remains necessary for subsequent required lessons.
						targets := actors
						if !completed && lesson.objective == "transport" {
							targets = actors[:1]
						}
						for _, actor := range targets {
							e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Target: actor.ID, Weapon: "TANK", Origin: actor.Position, Position: actor.Position, Impact: actor.Position, ImpactAt: e.Tick() + 1, Damage: 90000000})
						}
						restored := reliabilityRestore(t, e)
						replay, err := NewReplay(e)
						if err != nil {
							t.Fatal(err)
						}
						initialTick := e.Tick()
						for step := 0; step < 3; step++ {
							e.Advance()
							restored.Advance()
						}
						if e.Hash() != restored.Hash() {
							t.Fatal("loss boundary diverged after saved continuation")
						}
						failed := e.Outcome().Finished && e.Outcome().Reason == "mission_failed"
						if failed != !completed {
							t.Fatalf("completed=%v outcome=%+v", completed, e.Outcome())
						}
						if reliabilityObjective(t, e, lesson.failure).Complete != !completed {
							t.Fatal("loss explanation disagrees with lesson completion")
						}
						for _, actor := range targets {
							if e.entity(actor.ID) != nil {
								t.Fatal("fixture projectile did not destroy marked actor")
							}
						}
						if completed {
							if e.Outcome().Finished {
								t.Fatalf("completed lesson loss ended remaining lessons: %+v", e.Outcome())
							}
							assertTutorialTagNoLongerRequired(t, e, lesson.tag)
						}
						terminal := reliabilityRestore(t, e)
						e.Advance()
						terminal.Advance()
						if e.Hash() != terminal.Hash() {
							t.Fatal("loss outcome/completed lesson did not persist")
						}
						if err := replay.Capture(e, true); err != nil {
							t.Fatal(err)
						}
						data, err := replay.Encode()
						if err != nil {
							t.Fatal(err)
						}
						recorded, err := DecodeReplay(data)
						if err != nil {
							t.Fatal(err)
						}
						// Stream from the original fixture, so the final checkpoint cannot mask
						// incorrect destruction counters or failure evaluation during playback.
						player, err := recorded.Open(e.catalog, initialTick)
						if err != nil {
							t.Fatal(err)
						}
						for !player.Finished() {
							if err := player.Advance(); err != nil {
								t.Fatal(err)
							}
						}
						if player.Engine().Hash() != e.Hash() {
							t.Fatal("replay did not reproduce authored loss boundary")
						}
					})
				}
			}
		}
	}
}

// Producer-loss boundary fixtures for T1/T2: losing every construction and
// emergency-rig source while a construction lesson is pending must fail the
// mission promptly instead of soft-locking, while any surviving recovery
// source must keep the lesson playable. Damage and outcome evaluation run
// the real tick, mirroring the T3/T4 fixtures above.
func TestTutorialProducerLossGuards(t *testing.T) {
	build := func(t *testing.T, mission string) *Engine {
		t.Helper()
		original := reliabilityAuthoredMission(t, mission)
		def, err := original.state.Mission.Definition.ForTutorialFaction(original.catalog, original.state.Map, "US")
		if err != nil {
			t.Fatal(err)
		}
		e, err := NewMission(original.catalog, original.state.Map, def, "normal", 19027)
		if err != nil {
			t.Fatal(err)
		}
		e.state.Countdown = 0
		return e
	}
	destroyTags := func(t *testing.T, e *Engine, tags ...string) {
		t.Helper()
		for _, tag := range tags {
			found := false
			for _, actor := range e.state.Entities {
				if actor.Tag == tag {
					found = true
					e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Target: actor.ID, Weapon: "TANK", Origin: actor.Position, Position: actor.Position, Impact: actor.Position, ImpactAt: e.Tick() + 1, Damage: 90000000})
				}
			}
			if !found {
				t.Fatalf("authored tag %s missing", tag)
			}
		}
		for step := 0; step < 3; step++ {
			e.Advance()
		}
		for _, tag := range tags {
			for _, actor := range e.state.Entities {
				if actor.Tag == tag && e.entity(actor.ID) != nil {
					t.Fatalf("fixture projectile did not destroy %s", tag)
				}
			}
		}
	}

	t.Run("tutorial-1 production path lost fails", func(t *testing.T) {
		e := build(t, "tutorial-1-give-an-order")
		destroyTags(t, e, "home-hq", "home-barracks", "home-rig")
		if !e.Outcome().Finished || e.Outcome().Reason != "mission_failed" {
			t.Fatalf("unwinnable production lesson did not fail: %+v", e.Outcome())
		}
		if !reliabilityObjective(t, e, "production-path-lost").Complete {
			t.Fatal("production-path-lost explanation incomplete")
		}
	})
	t.Run("tutorial-1 surviving rig keeps lesson open", func(t *testing.T) {
		e := build(t, "tutorial-1-give-an-order")
		destroyTags(t, e, "home-hq", "home-barracks")
		if e.Outcome().Finished {
			t.Fatalf("recoverable barracks loss ended the lesson: %+v", e.Outcome())
		}
	})
	t.Run("tutorial-2 recovery path lost fails", func(t *testing.T) {
		e := build(t, "tutorial-2-operate-a-base")
		destroyTags(t, e, "home-hq", "home-factory", "home-rig")
		if !e.Outcome().Finished || e.Outcome().Reason != "mission_failed" {
			t.Fatalf("unwinnable rebuild lesson did not fail: %+v", e.Outcome())
		}
		if !reliabilityObjective(t, e, "recovery-path-lost").Complete {
			t.Fatal("recovery-path-lost explanation incomplete")
		}
	})
	t.Run("tutorial-2 scripted HQ loss alone stays open", func(t *testing.T) {
		e := build(t, "tutorial-2-operate-a-base")
		destroyTags(t, e, "home-hq")
		if e.Outcome().Finished {
			t.Fatalf("authored HQ loss ended the rebuild lesson: %+v", e.Outcome())
		}
	})
	t.Run("tutorial-1 team lost before lessons fails", func(t *testing.T) {
		e := build(t, "tutorial-1-give-an-order")
		destroyTags(t, e, "starting-rifles")
		if !e.Outcome().Finished || e.Outcome().Reason != "mission_failed" {
			t.Fatalf("order team loss before lessons did not fail: %+v", e.Outcome())
		}
	})
	t.Run("tutorial-1 team lost after lessons stays open", func(t *testing.T) {
		e := build(t, "tutorial-1-give-an-order")
		rifles := []*Entity{}
		for _, actor := range e.state.Entities {
			if actor.Tag == "starting-rifles" {
				rifles = append(rifles, actor)
			}
		}
		if len(rifles) != 4 {
			t.Fatalf("authored starting rifles: got %d want 4", len(rifles))
		}
		place := func(regionID string) {
			region := e.missionRegion(regionID)
			for i, actor := range rifles {
				actor.Position = Vec{X: (region.Min.X+region.Max.X)/2 + int32(i)*1000, Y: (region.Min.Y + region.Max.Y) / 2}
				actor.LastPosition, actor.Anchor = actor.Position, actor.Position
			}
			e.updateFog()
			e.updateMission()
		}
		place("training-move")
		if !reliabilityObjective(t, e, "move").Complete {
			t.Fatal("move lesson did not complete at its authored region")
		}
		// Isolate the authored production event boundary (not a walkthrough):
		// record the trained-rifle event the barracks would have emitted.
		e.state.Mission.Counters = append(e.state.Mission.Counters, MissionCounter{Event: "unit_ready", Owner: 1, Type: "US.rifle", Count: 1})
		place("site1")
		if !reliabilityObjective(t, e, "production").Complete {
			t.Fatal("production lesson did not complete at its authored boundary")
		}
		destroyTags(t, e, "starting-rifles")
		if e.Outcome().Finished {
			t.Fatalf("completed lessons were failed by later team loss: %+v", e.Outcome())
		}
	})
}

func assertTutorialTagNoLongerRequired(t *testing.T, e *Engine, tag string) {
	t.Helper()
	pending := 0
	for i, objective := range e.state.Mission.Definition.Objectives {
		if objective.Failure || objective.Optional || e.state.Mission.Objectives[i].Complete {
			continue
		}
		pending++
		var check func(content.MissionCondition)
		check = func(condition content.MissionCondition) {
			if condition.Tag == tag {
				t.Fatalf("lost tag %s remains required by incomplete objective %s", tag, objective.ID)
			}
			for _, child := range condition.Children {
				check(child)
			}
		}
		check(objective.Condition)
	}
	if pending == 0 {
		t.Fatal("test failed to retain other required lessons")
	}
}
