package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

func aiQualityTeamsFixture(t *testing.T) *Engine {
	t.Helper()
	cfg := botMatrixConfig(4, true)
	for i := range cfg.Players {
		cfg.Players[i].AI = ""
	}
	cfg.Players[0].AI = "easy"
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

func TestAIQualityTeamsDefendsAllyWithNormalOwnedOrders(t *testing.T) {
	for _, role := range []string{"hq", "supply", "hauler"} {
		t.Run(role, func(t *testing.T) {
			e := aiQualityTeamsFixture(t)
			p := e.player(1)
			var ally *Entity
			switch role {
			case "hq":
				ally = e.entity(5)
			case "supply":
				ally = e.spawn("supply", 3, Vec{X: 46000, Y: 32000}, true, 0)
			case "hauler":
				// Script convoy haulers and ordinary allied workers have the
				// same public economic role; neither shares private orders.
				e.player(3).Controller = "script"
				ally = e.spawn("SY.hauler", 3, Vec{X: 40000, Y: 30000}, true, 0)
			}
			threat := e.spawn("IR.tank", 2, Vec{X: ally.Position.X - 3000, Y: ally.Position.Y}, true, 0)
			fighter := e.spawn("US.tank", 1, Vec{X: 12000, Y: 12000}, true, 0)
			e.recalculate()
			e.updateFog()
			view, _ := e.PlayerView(1)
			found := false
			for _, observed := range view.Entities {
				if observed.ID == threat.ID {
					found = true
				}
				if observed.Owner == 3 && observed.Private != nil {
					t.Fatal("ally exposed private orders")
				}
			}
			if !found || p.Supply >= 12 {
				t.Fatal("fixture needs a visible allied threat and a small own reserve", found, p.Supply)
			}
			e.aiObserve(p, view)
			goal, ok := e.aiGoal(p, view)
			if !ok || goal != threat.Position || p.AIIntent != "defend" {
				t.Fatalf("observed ally %s under threat did not become a defensive goal: goal=%v intent=%q want=%v", role, goal, p.AIIntent, threat.Position)
			}
			e.state.Tick = seconds(4)
			allyCredits := e.player(3).Credits
			e.updateAI()
			planned := false
			for _, batch := range e.state.Pending {
				for _, order := range batch.Orders {
					for _, id := range order.Entities {
						if e.entity(id).Owner != 1 {
							t.Fatal("AI attempted to control allied assets", order)
						}
						if id == fighter.ID && order.Kind == "attack_move" && order.Position == threat.Position && order.Target == 0 {
							planned = true
						}
					}
				}
			}
			if !planned || len(fighter.Orders) != 0 || e.player(3).Credits != allyCredits {
				t.Fatal("allied defense must queue ordinary owned movement before execution", planned, fighter.Orders)
			}
			e.Advance()
			if len(fighter.Orders) == 0 || fighter.Orders[0].Kind != "attack_move" || fighter.Orders[0].Position != threat.Position {
				t.Fatal("ordinary executor did not accept allied defense", fighter.Orders, e.state.Results)
			}
		})
	}
}

func TestAIQualityTeamsMovingAlliedWorkerUsesCurrentSharedSight(t *testing.T) {
	e := aiQualityTeamsFixture(t)
	p := e.player(1)
	worker := e.spawn("SY.hauler", 3, Vec{X: 40000, Y: 30000}, true, 0)
	threat := e.spawn("IR.tank", 2, Vec{X: 42000, Y: 30000}, true, 0)
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	if goal, ok := e.aiGoal(p, view); !ok || goal != threat.Position || p.AIIntent != "defend" {
		t.Fatal("moving objective did not receive observed defense", goal, p.AIIntent)
	}
	worker.Position = Vec{X: 50000, Y: 40000}
	threat.Position = Vec{X: 52000, Y: 40000}
	e.updateFog()
	view, _ = e.PlayerView(1)
	// Keep the old knowledge record deliberately. Current allied sight must
	// outrank the stale pressure position without inspecting allied orders.
	if goal, ok := e.aiGoal(p, view); !ok || goal != threat.Position || p.AIIntent != "defend" {
		t.Fatal("defense stayed at an objective's starting position", goal, p.AIIntent)
	}
}

func TestAIQualityTeamsDefeatedAllyAndFriendlyKnowledgeDoNotAttractGoals(t *testing.T) {
	e := aiQualityTeamsFixture(t)
	p := e.player(1)
	ally := e.entity(5)
	threat := e.spawn("IR.tank", 2, Vec{X: ally.Position.X - 3000, Y: ally.Position.Y}, true, 0)
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	for i := range view.Players {
		if view.Players[i].ID == 3 {
			view.Players[i].Defeated = true
		}
	}
	// Public defeat alone must suffice even if a wreck remains in shared
	// sight. The hidden/live ally status deliberately differs from the view.
	p.AIKnowledge = []AIObservation{{ID: ally.ID, Owner: 3, Type: ally.Type, Position: ally.Position}, {ID: threat.ID, Owner: 2, Type: threat.Type, Position: threat.Position}}
	goal, ok := e.aiGoal(p, view)
	if !ok || goal != threat.Position || p.AIIntent != "pressure" {
		t.Fatal("friendly knowledge or defeated ally caused false defense", goal, p.AIIntent)
	}
	if aiActiveOpponent(p, view, 3) || aiActiveOpponent(p, view, 0) || aiActiveOpponent(p, view, 99) {
		t.Fatal("friendly, neutral or unknown owner was treated as an active opponent")
	}
}

func TestAIQualityTeamsGoalIgnoresPrivateAlliedOrdersAndHiddenEnemyState(t *testing.T) {
	e := aiQualityTeamsFixture(t)
	p := e.player(1)
	view, _ := e.PlayerView(1)
	goal, ok := e.aiGoal(p, view)
	intent := p.AIIntent
	ally := e.entity(6)
	ally.Orders = []Order{{Kind: "move", Position: Vec{X: 32000, Y: 32000}}}
	e.player(3).Credits = 1
	enemy := e.spawn("IR.tank", 2, Vec{X: 20000, Y: 20000}, true, 0)
	enemy.Orders = []Order{{Kind: "attack", Target: ally.ID}}
	e.player(2).Credits = 123456789
	other, otherOK := e.aiGoal(p, view)
	if ok != otherOK || goal != other || intent != p.AIIntent {
		t.Fatal("private ally orders or unseen enemy state changed the goal", goal, other, intent, p.AIIntent)
	}
}

func TestAIQualityTeamsLegalConfigurationsAndDifficultyCadence(t *testing.T) {
	for _, difficulty := range []struct {
		id     string
		period Tick
	}{{"easy", seconds(4)}, {"normal", seconds(2)}, {"hard", seconds(1)}} {
		for count := 1; count <= 4; count++ {
			t.Run(fmt.Sprintf("%s-%d", difficulty.id, count), func(t *testing.T) {
				cfg := botMatrixConfig(count, count == 4)
				// Player input need not be sorted, and zero teams are legal FFA
				// defaults. All four custom starting factions occur in the matrix.
				for i := range cfg.Players {
					cfg.Players[i].AI = difficulty.id
					if count != 4 {
						cfg.Players[i].Team = 0
					}
				}
				for i, j := 0, len(cfg.Players)-1; i < j; i, j = i+1, j-1 {
					cfg.Players[i], cfg.Players[j] = cfg.Players[j], cfg.Players[i]
				}
				e, err := New(content.MustBase(), cfg)
				if err != nil {
					t.Fatal(err)
				}
				e.state.Countdown = 0
				e.state.Tick = difficulty.period - 1
				e.updateAI()
				if len(e.state.Pending) != 0 {
					t.Fatal("difficulty planned before its declared strategic interval")
				}
				e.state.Tick = difficulty.period
				e.updateAI()
				for _, p := range e.state.Players {
					if p.AILast != difficulty.period || p.LastSequence == 0 || p.Credits != 6000000 || p.Spent != 0 {
						t.Fatal("AI did not plan through ordinary unpaid intentions", p.ID, p.AILast, p.LastSequence, p.Credits, p.Spent)
					}
					view, _ := e.PlayerView(p.ID)
					for _, owner := range e.state.Players {
						want := owner.ID != p.ID && owner.Team != p.Team
						if aiActiveOpponent(p, view, owner.ID) != want {
							t.Fatal("legal team/player configuration misclassified a goal", p.ID, owner.ID, p.Team, owner.Team)
						}
					}
				}
				data, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(e.catalog, data)
				if err != nil {
					t.Fatal(err)
				}
				for range 8 {
					e.Advance()
					restored.Advance()
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("teams or difficulty diverged across save/restore")
				}
				// A planner interval cannot grant free income or ownership. All
				// executed actors still belong to the issuing player.
				for _, batch := range e.state.Log {
					for _, order := range batch.Orders {
						for _, id := range order.Entities {
							if e.entity(id).Owner != batch.Player {
								t.Fatal("difficulty bypassed normal actor ownership", batch.Player, order)
							}
						}
					}
				}
				for _, p := range e.state.Players {
					if p.AILast != difficulty.period || p.Income != 0 || p.Credits+p.Spent != 6000000 {
						t.Fatal("difficulty cadence or paid economy changed", p.ID, p.AILast, p.Income, p.Credits, p.Spent)
					}
				}
				e.state.Tick, restored.state.Tick = difficulty.period*2-1, difficulty.period*2-1
				e.updateAI()
				restored.updateAI()
				for _, p := range e.state.Players {
					if p.AILast != difficulty.period {
						t.Fatal("difficulty shortened the subsequent strategic interval", p.ID, p.AILast)
					}
				}
				e.state.Tick, restored.state.Tick = difficulty.period*2, difficulty.period*2
				e.updateAI()
				restored.updateAI()
				for _, p := range e.state.Players {
					if p.AILast != difficulty.period*2 {
						t.Fatal("difficulty missed the next declared strategic interval", p.ID, p.AILast)
					}
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("subsequent strategic cadence diverged after restore")
				}
			})
		}
	}
}

func TestAIQualityTeamsEndgamePulseRetirementAndRestore(t *testing.T) {
	e := aiQualityTeamsFixture(t)
	p := e.player(1)
	e.state.Tick = seconds(35 * 60)
	fighter := e.spawn("US.car", 1, Vec{X: 14000, Y: 10000}, true, 0)
	retired := e.entity(3)
	fighter.Orders = []Order{{Kind: "attack", Target: retired.ID}}
	p.AIKnowledge = []AIObservation{{ID: retired.ID, Owner: 2, Type: retired.Type, Position: retired.Position}}
	e.defeat(e.player(2))
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	goal, ok := e.aiGoal(p, view)
	if !ok || goal != e.entity(7).Position || e.canSee(1, goal) {
		t.Fatal("public endgame pulse did not seek the surviving hidden enemy", goal, p.AIIntent)
	}
	before, _ := json.Marshal(fighter.Orders)
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	e.updateAI()
	restored.updateAI()
	after, _ := json.Marshal(fighter.Orders)
	if string(before) != string(after) || len(p.AIKnowledge) != 0 {
		t.Fatal("retirement mutated a live order or fabricated firing knowledge")
	}
	e.Advance()
	restored.Advance()
	if len(fighter.Orders) != 0 || e.Hash() != restored.Hash() || e.Outcome().Finished {
		t.Fatal("ordinary public-defeat cancellation failed or awarded an automatic victory", fighter.Orders, e.Outcome())
	}
}
