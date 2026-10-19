package sim_test

import (
	"testing"

	"frontlinecommand/pkg/sim"
)

// The ally uses the production Go AI. The acceptance commander submits only
// player 1 orders and chooses targets from its authorized shared perspective.
func newSoloCoopRun(t *testing.T, id, difficulty string) *authoredRun {
	r := newAuthoredRun(t, id, difficulty, "")
	// Apply the same controller substitution as server.scenarioEngine before
	// creating the tested world; never edit an active simulation or its save.
	r.definition.Players[1].Controller = "ai"
	r.definition.Players[1].AI = "normal"
	e, err := sim.NewMission(r.catalog, r.gameMap, r.definition, difficulty, 19027)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := sim.NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	r.engine, r.replay, r.initialHash = e, replay, e.Hash()
	r.evidenceSuffix = "-solo-normal-ai"
	r.advance(100)
	return r
}

func (r *authoredRun) soloCoopPolicy(clearedProduction *bool) func() {
	next := r.engine.Tick()
	cleared := map[sim.ID]bool{}
	return func() {
		if r.engine.Tick() < next {
			return
		}
		next = r.engine.Tick() + 400
		view := r.view()
		point, target := r.region("central-connection"), sim.ID(0)
		prefixes := []string{"opponent-west", "opponent-east"}
		if r.definition.ID == "convoy-union" {
			prefixes = []string{"opponent-east"}
		}
		found := false
		for _, prefix := range prefixes {
			for _, suffix := range []string{"-barracks", "-factory", "-service", "-hq"} {
				tag := prefix + suffix
				ids := r.tags[tag]
				if len(ids) == 0 {
					continue
				}
				id := ids[0]
				var initial sim.Vec
				for _, spawn := range r.definition.Initial {
					if spawn.Tag == tag {
						initial = sim.Vec(spawn.Position)
					}
				}
				present := false
				for _, entity := range view.Entities {
					if entity.ID == id {
						present = true
						if entity.Owner == 1 || entity.Owner == 2 {
							cleared[id] = true
						} else {
							target = id
						}
						break
					}
				}
				if !present && view.Visible[(initial.Y/1000)*r.gameMap.Width+initial.X/1000] {
					cleared[id] = true
				}
				if !cleared[id] {
					point, found = initial, true
					break
				}
			}
			if found {
				break
			}
		}
		*clearedProduction = !found
		if *clearedProduction && r.definition.ID == "convoy-union" {
			// Keep the forward repair deployment area clear, as the ordinary
			// two-human escort driver does. Parking a capped army on it can
			// legitimately delay the transactional next-convoy trigger.
			point = sim.Vec{X: 31500, Y: 70500}
		}
		if r.definition.ID == "twin-outposts" && !r.complete("reconnection") {
			point, target = r.region("central-connection"), 0
		}
		for _, kind := range []string{"factory", "barracks"} {
			producers := r.playerType(1, kind)
			if len(producers) == 0 || *clearedProduction {
				continue
			}
			r.tryPlayer(1, sim.Order{Kind: "rally", Entities: producers[:1], Position: point})
			unit := "US.tank"
			if kind == "barracks" {
				unit = "US.rifle"
			}
			for range 2 {
				r.tryPlayer(1, sim.Order{Kind: "train", Entities: producers[:1], Type: unit})
			}
			if kind == "factory" && len(r.playerType(1, "US.aa")) < 2 {
				r.tryPlayer(1, sim.Order{Kind: "train", Entities: producers[:1], Type: "US.aa"})
			}
		}
		army := r.playerArmy(1)
		if len(army) > 0 {
			r.tryPlayer(1, sim.Order{Kind: "attack_move", Entities: army, Position: point})
		}
		if target != 0 {
			for _, id := range army {
				r.tryPlayer(1, sim.Order{Kind: "attack", Entities: []sim.ID{id}, Target: target})
			}
		}
	}
}

func TestAuthoredSoloCoopCompletion(t *testing.T) {
	if testing.Short() {
		t.Skip("dedicated authored solo plus autonomous AI co-op completion")
	}
	for _, id := range []string{"twin-outposts", "convoy-union"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) {
				r := newSoloCoopRun(t, id, difficulty)
				r.issue(1, sim.Order{Kind: "gather", Entities: r.playerType(1, "US.hauler"), Target: 1})
				cleared := false
				r.tactical = r.soloCoopPolicy(&cleared)
				if id == "twin-outposts" {
					r.wait("solo army and autonomous ally reconnect", 7000, func() bool { return r.complete("reconnection") })
					r.checkpoint()
					r.wait("solo and autonomous ally defeat both bases", 25000, func() bool { return r.engine.Outcome().Finished })
				} else {
					r.wait("first convoy activates", 600, func() bool { return r.view().Mission.Convoys[0].Active })
					r.issue(1, sim.Order{Kind: "convoy_hold", Type: "convoy-1"})
					r.wait("solo escort and autonomous ally clear production", 25000, func() bool { return cleared })
					r.checkpoint()
					for _, convoy := range []string{"convoy-1", "convoy-2", "convoy-3"} {
						r.wait("next convoy activates", 2000, func() bool {
							for _, state := range r.view().Mission.Convoys {
								if state.ID == convoy {
									return state.Active
								}
							}
							return false
						})
						r.issue(1, sim.Order{Kind: "convoy_hold", Type: convoy})
						r.issue(1, sim.Order{Kind: "convoy_advance", Type: convoy, Index: 1})
						r.wait("sole human approval traverses convoy branch", 12000, func() bool {
							for _, state := range r.view().Mission.Convoys {
								if state.ID == convoy {
									return state.Completed
								}
							}
							return false
						})
					}
				}
				for _, batch := range r.orders {
					if batch.Player != 1 {
						t.Fatal("solo driver issued a teammate order")
					}
				}
				// Diagnostic assertion only: this copy is never policy input.
				ally := r.engine.StateCopy().Players[1]
				if ally.ID != 2 || ally.Controller != "ai" || ally.AI != "normal" || ally.AILast == 0 || ally.LastSequence == 0 {
					t.Fatal("configured ally did not autonomously issue ordinary AI orders")
				}
				r.finish()
			})
		}
	}
}
