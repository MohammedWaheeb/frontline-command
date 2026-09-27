package sim

import (
	"encoding/json"
	"testing"
)

func TestAIHiddenChangesCannotChangeDecisions(t *testing.T) {
	a, b := fixture(t), fixture(t)
	for _, e := range []*Engine{a, b} {
		e.player(1).AI = "hard"
		e.state.Tick = 20
	}
	b.entity(3).Position = Vec{X: 50000, Y: 49000}
	b.player(2).Credits = 100000000
	b.spawn("IR.launcher", 2, Vec{X: 45000, Y: 45000}, true, 0)
	for _, e := range []*Engine{a, b} {
		e.updateFog()
		e.updateAI()
	}
	ax, _ := json.Marshal(a.state.Pending)
	bx, _ := json.Marshal(b.state.Pending)
	if string(ax) != string(bx) {
		t.Fatal("hidden enemy changes affected AI intentions", string(ax), string(bx))
	}
	if len(a.player(1).AIKnowledge) != 0 || len(b.player(1).AIKnowledge) != 0 {
		t.Fatal("AI learned unseen enemies")
	}
}

func TestAIKnowledgeUsesLastObservedPositions(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	enemy := e.spawn("IR.aa", 2, Vec{X: 13000, Y: 10000}, true, 0)
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	if !e.aiAirDanger(p, enemy.Position) {
		t.Fatal("observed AA did not deter sorties")
	}
	old := enemy.Position
	e.entity(1).Position = Vec{X: 6000, Y: 50000}
	e.entity(2).Position = Vec{X: 8000, Y: 50000}
	enemy.Position = Vec{X: 43000, Y: 41000}
	e.state.Tick += 40
	e.updateFog()
	view, _ = e.PlayerView(1)
	e.aiObserve(p, view)
	if len(p.AIKnowledge) != 1 || p.AIKnowledge[0].Position != old || p.AIKnowledge[0].Seen != 0 {
		t.Fatal("hidden moving target updated AI knowledge")
	}
	save, _ := e.Save()
	if restored, err := Restore(e.catalog, save); err != nil || restored.Hash() != e.Hash() {
		t.Fatal("AI knowledge restore", err)
	}
}

func TestAIExpansionAvoidsObservedEnemyTerritory(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	e.spawn("supply", 1, Vec{X: 15000, Y: 12000}, true, 0)
	p.AIFields = []FieldView{{ID: 1, Position: Vec{X: 14000, Y: 8000}, Remaining: 5000000}, {ID: 2, Position: Vec{X: 35000, Y: 24000}, Remaining: 24000000}}
	view, _ := e.PlayerView(1)
	if point, ok := e.aiExpansion(p, view.Entities); !ok || point != p.AIFields[1].Position {
		t.Fatal("AI did not expand before depletion")
	}
	p.AIKnowledge = []AIObservation{{ID: 3, Owner: 2, Type: "hq", Position: Vec{X: 36000, Y: 25000}}}
	if _, ok := e.aiExpansion(p, view.Entities); ok {
		t.Fatal("AI expanded into observed enemy base")
	}
}

func TestAIResumesAbandonedConstruction(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "hard"
	foundation := e.spawn("power", 1, Vec{X: 8000, Y: 14000}, false, 500000)
	foundation.Builder = 999
	e.state.Tick = 20
	e.updateFog()
	e.updateAI()
	found := false
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			if order.Kind == "resume" && order.Target == foundation.ID {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("AI abandoned a paid foundation after builder loss")
	}
}
