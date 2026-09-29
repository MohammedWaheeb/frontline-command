package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// This opt-in observation resumes an unedited save from the long authored Relay
// match. It is a retained failure investigation, not a passing navigation gate.
func TestAuthoredDepotCongestionEvidence(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AUTHORED_DEPOT_INSPECT")
	if dir == "" {
		t.Skip("opt-in exact recorded depot congestion investigation")
	}
	data, err := os.ReadFile(filepath.Join(dir, "diagnostic-36000.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	e, err := Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	expectedData, err := os.ReadFile(filepath.Join(dir, "diagnostic-42000.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	expected, err := Restore(content.MustBase(), expectedData)
	if err != nil {
		t.Fatal(err)
	}
	type cargoReport struct {
		Actor              ID     `json:"actor"`
		LoadedTicks        uint32 `json:"loaded_ticks"`
		Deliveries         uint32 `json:"deliveries"`
		StaticBlockedGoal  uint32 `json:"static_blocked_goal_ticks"`
		DynamicBlockedGoal uint32 `json:"dynamic_blocked_goal_ticks"`
		Min                Vec    `json:"position_min"`
		Max                Vec    `json:"position_max"`
		MinDepotEdge       int32  `json:"minimum_depot_edge_distance"`
	}
	reports := []cargoReport{{Actor: 13, Min: Vec{X: 1 << 30, Y: 1 << 30}, MinDepotEdge: 1 << 30}, {Actor: 20, Min: Vec{X: 1 << 30, Y: 1 << 30}, MinDepotEdge: 1 << 30}}
	initialIncome := e.player(1).Income
	for e.Tick() < 42000 {
		e.Advance()
		for i := range reports {
			r := &reports[i]
			v := e.entity(r.Actor)
			if v == nil || v.HP <= 0 {
				t.Fatal("observed collector died before the bounded congestion window ended", r.Actor)
			}
			for _, event := range e.state.Events {
				if event.Kind == "cargo_delivered" && event.Entity == v.ID {
					r.Deliveries++
				}
			}
			if v.Cargo != 600000 {
				continue
			}
			r.LoadedTicks++
			r.Min.X = min(r.Min.X, v.Position.X)
			r.Min.Y = min(r.Min.Y, v.Position.Y)
			r.Max.X = max(r.Max.X, v.Position.X)
			r.Max.Y = max(r.Max.Y, v.Position.Y)
			depot := e.entity(v.Depot)
			if depot == nil || depot.Owner != 1 || !depot.Active(e.Tick()) {
				t.Fatal("lost depot is a different failure")
			}
			r.MinDepotEdge = min(r.MinDepotEdge, e.edgeDistance(v, depot))
			goal := e.approachPoint(v, depot)
			if !e.clear(goal, e.radius(v), v.ID, false, false) {
				r.StaticBlockedGoal++
			}
			if !e.clear(goal, e.radius(v), v.ID, false, true) {
				r.DynamicBlockedGoal++
			}
		}
	}
	if e.Hash() != expected.Hash() {
		t.Fatal("diagnostic continuation differs from actual recorded source/state")
	}
	result := struct {
		Start       Tick          `json:"start_tick"`
		End         Tick          `json:"end_tick"`
		FinalHash   string        `json:"verified_final_hash"`
		IncomeDelta int64         `json:"income_delta"`
		Actors      []cargoReport `json:"collectors"`
	}{36000, e.Tick(), e.Hash(), e.player(1).Income - initialIncome, reports}
	packed, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "depot-congestion-diagnostic.json", append(packed, '\n'))
	for _, r := range reports {
		t.Logf("actor%d loadedTicks%d deliveries%d staticBlocked%d dynamicBlocked%d minEdge%d position%+v..%+v", r.Actor, r.LoadedTicks, r.Deliveries, r.StaticBlockedGoal, r.DynamicBlockedGoal, r.MinDepotEdge, r.Min, r.Max)
	}
}

func TestAuthoredDepotAlternateAccessEvidence(t *testing.T) {
	dir := os.Getenv("FRONTLINE_AUTHORED_DEPOT_INSPECT")
	if dir == "" {
		t.Skip("opt-in exact depot alternate-access investigation")
	}
	data, err := os.ReadFile(filepath.Join(dir, "diagnostic-36000.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	type access struct {
		Actor      ID    `json:"actor"`
		Point      Vec   `json:"point"`
		Edge       int32 `json:"edge_distance"`
		Path       []Vec `json:"path"`
		Candidates int   `json:"clear_candidates"`
		Probes     int   `json:"path_queries"`
	}
	var results []access
	for _, id := range []ID{13, 20} {
		e, err := Restore(content.MustBase(), data)
		if err != nil {
			t.Fatal(err)
		}
		v := e.entity(id)
		d := e.entity(v.Depot)
		before := e.Hash()
		row := access{Actor: id}
		var candidates []Vec
		for y := d.Position.Y - 4000; y <= d.Position.Y+4000; y += 500 {
			for x := d.Position.X - 4000; x <= d.Position.X+4000; x += 500 {
				point := Vec{X: x, Y: y}
				probe := *v
				probe.Position = point
				if e.edgeDistance(&probe, d) <= 1100 && e.clear(point, e.radius(v), v.ID, false, true) {
					candidates = append(candidates, point)
				}
			}
		}
		sort.SliceStable(candidates, func(i, j int) bool { return dist2(v.Position, candidates[i]) < dist2(v.Position, candidates[j]) })
		row.Candidates = len(candidates)
		// The diagnostic gets one ordinary12-query movement budget on a separate
		// restored engine, never on the continued trajectory or in AI planning.
		e.pathBudget = 12
		for _, point := range candidates {
			if e.pathBudget == 0 {
				break
			}
			row.Probes++
			path := e.findPath(v, point, true)
			if len(path) == 0 {
				continue
			}
			probe := *v
			probe.Position = path[len(path)-1]
			if e.edgeDistance(&probe, d) > 1100 {
				continue
			}
			row.Point = probe.Position
			row.Edge = e.edgeDistance(&probe, d)
			row.Path = path
			break
		}
		if e.Hash() != before {
			t.Fatal("read-only reachability check changed state")
		}
		results = append(results, row)
		t.Logf("actor%d clearCandidates%d queries%d point%+v edge%d pathNodes%d", id, row.Candidates, row.Probes, row.Point, row.Edge, len(row.Path))
	}
	packed, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	authoredAIWrite(t, dir, "depot-alternate-access.json", append(packed, '\n'))
}
