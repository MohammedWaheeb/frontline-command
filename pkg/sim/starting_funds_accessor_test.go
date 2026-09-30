package sim_test

import (
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"testing"
)

func startingFundsAssertOriginal(t *testing.T, e *sim.Engine, amount int64, available bool) {
	t.Helper()
	before := e.Hash()
	got, ok := e.StartingCredits()
	if got != amount || ok != available || e.Hash() != before {
		t.Fatalf("original opening accessor: got=%d available=%v want=%d available=%v or accessor mutated state", got, ok, amount, available)
	}
}

func TestStartingFundsOriginalBudgetAccessor(t *testing.T) {
	catalog := content.MustBase()
	for _, tc := range []struct {
		name string
		amount int64
		ruleset string
	}{{"default", 0, "standard-v2"}, {"custom", 12000000, "custom-v1"}} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := startingFundsConfig()
			cfg.StartingCredits, cfg.Ruleset = tc.amount, tc.ruleset
			e, err := sim.New(catalog, cfg)
			if err != nil { t.Fatal(err) }
			opening := tc.amount
			if opening == 0 { opening = sim.DefaultStartingCredits }
			startingFundsAssertOriginal(t, e, opening, true)
			for e.Tick() < 100 { e.Advance() }
			var rig sim.ID
			for _, actor := range startingFundsView(t, e, 1).Entities {
				if actor.Owner == 1 && actor.Type == "US.rig" && actor.Private != nil { rig = actor.ID }
			}
			if rig == 0 { t.Fatal("ordinary rig unavailable") }
			for index, build := range []struct { typ string; point sim.Vec }{{"power", sim.Vec{X:12000, Y:12000}}, {"supply", sim.Vec{X:18000, Y:12000}}} {
				err = e.Submit(1, uint32(index+1), []sim.Order{{Kind:"build", Entities:[]sim.ID{rig}, Type:build.typ, Position:build.point}})
				if err != nil { t.Fatal(err) }
				e.Advance()
				view := startingFundsView(t, e, 1)
				if len(view.Results) != 1 || !view.Results[0].Accepted || view.Results[0].Code != "ok" { t.Fatal("ordinary paid Build rejected", build.typ, view.Results) }
				startingFundsAssertOriginal(t, e, opening, true)
				for {
					complete := false
					for _, actor := range startingFundsView(t, e, 1).Entities {
						if actor.Owner == 1 && actor.Type == build.typ && actor.Complete { complete = true }
					}
					if complete { break }
					if e.Tick() >= 4000 || e.Outcome().Finished { t.Fatal("ordinary paid build missed bounded course", build.typ, e.Tick()) }
					e.Advance()
				}
			}
			power, _ := catalog.Building("power")
			supply, _ := catalog.Building("supply")
			for startingFundsView(t, e, 1).Economy.Income == 0 {
				if e.Tick() >= 4000 || e.Outcome().Finished { t.Fatal("ordinary included hauler earned no delivery within bound", e.Tick()) }
				e.Advance()
			}
			view := startingFundsView(t, e, 1)
			if view.Economy.Credits != opening-power.Cost-supply.Cost+view.Economy.Income || view.Economy.Credits == opening { t.Fatal("course lacks accounted spending and income", view.Economy) }
			startingFundsAssertOriginal(t, e, opening, true)
			restored, err := sim.Restore(catalog, startingFundsSave(t, e))
			if err != nil || restored.Hash() != e.Hash() { t.Fatal("spent/earned original budget Restore", err) }
			startingFundsAssertOriginal(t, restored, opening, true)
			before := restored.Hash()
			restarted, err := restored.Restart()
			if err != nil || restored.Hash() != before || startingFundsView(t, restarted, 1).Economy.Credits != opening { t.Fatal("original budget Restart", err) }
			startingFundsAssertOriginal(t, restarted, opening, true)
		})
	}
}

func TestStartingFundsAccessorUnavailableForPrescribedBudgets(t *testing.T) {
	catalog, gameMap := content.MustBase(), startingFundsMap()
	for _, mode := range []string{"campaign", "tutorial"} {
		definition := content.Mission{ID:"backend-accessor-prescribed-funds", Version:"1", Title:"Prescribed opening accessor fixture", MapID:gameMap.ID, Faction:"US", Mode:mode, DefaultBases:true,
			Players:[]content.MissionPlayer{{ID:1, Name:"Prescribed human", Faction:"US", Team:1, Controller:"human", Credits:4200000}, {ID:2, Name:"Prescribed enemy", Faction:"IR", Team:2, Controller:"script", Credits:2700000}},
			Objectives:[]content.MissionObjective{{ID:"survive", Text:"Authored timer", Condition:content.MissionCondition{Kind:"timer", Tick:1000}}}}
		for _, practice := range []bool{false, true} {
			var e *sim.Engine
			var err error
			if practice { e, err = sim.NewPracticeMission(catalog, gameMap, definition, "normal", 39525) } else { e, err = sim.NewMission(catalog, gameMap, definition, "normal", 39525) }
			if err != nil { t.Fatal(mode, practice, err) }
			startingFundsAssertOriginal(t, e, 0, false)
			restored, err := sim.Restore(catalog, startingFundsSave(t, e))
			if err != nil { t.Fatal(err) }
			startingFundsAssertOriginal(t, restored, 0, false)
		}
	}
}
