package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

// Opt-in read-only inspection of a preserved completed match. No command is
// submitted and no live/persisted state is edited to manufacture progress.
func TestAuthoredAIStallReadOnlyRoutes(t *testing.T) {
	directory := os.Getenv("FRONTLINE_AUTHORED_AI_STALL")
	if directory == "" {
		t.Skip("opt-in preserved Port timeout inspection")
	}
	data, err := os.ReadFile(filepath.Join(directory, "final.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	e, err := Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	before := e.Hash()
	type result struct {
		ID      ID      `json:"id"`
		Goal    Vec     `json:"goal"`
		Nodes   int     `json:"nodes"`
		End     Vec     `json:"end"`
		Planned []Order `json:"recovery_intentions"`
	}
	results := []result{}
	for _, id := range []ID{649, 901, 853, 268, 898, 227, 1374, 1266, 5000} {
		v := e.entity(id)
		if v == nil {
			t.Fatalf("recorded actor%d missing", id)
		}
		p := e.player(v.Owner)
		e.pathBudget = 12 // derived per-tick work budget only, never saved state.
		path := e.findPath(v, p.AIGoal, true)
		r := result{ID: id, Goal: p.AIGoal, Nodes: len(path)}
		if len(path) > 0 {
			r.End = path[len(path)-1]
		}
		for _, o := range e.aiRecoveryOrders(p, aiOwnView(e, p.ID), p.AIGoal) {
			for _, selected := range o.Entities {
				if selected == id {
					r.Planned = append(r.Planned, o)
				}
			}
		}
		results = append(results, r)
		t.Logf("actor%d goal%+v nodes%d end%+v recovery%+v", id, r.Goal, r.Nodes, r.End, r.Planned)
	}
	if e.Hash() != before {
		t.Fatal("inspection mutated recorded state")
	}
	out, err := json.MarshalIndent(struct {
		Hash    string   `json:"unchanged_hash"`
		Results []result `json:"results"`
	}{before, results}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(directory, "stall-route-audit.json"), append(out, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
