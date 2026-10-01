package sim

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func previewWingFixture(t *testing.T, edge int32) (*Engine, Order) {
	t.Helper()
	e, site := strategicFixture(t, "US")
	point := e.entity(3).Position
	e.spawn("US.engineer", 1, Vec{X: 51000, Y: 54000}, true, 400000)
	e.updateFog()
	return e, Order{Kind: "ability", Type: "strategic", Entities: []ID{site.ID}, Index: edge, Points: []Vec{point, {X: point.X - 1000, Y: point.Y}, {X: point.X, Y: point.Y - 1000}}}
}

func TestTacticalSkybreakerPlanMatchesActualLaunchAllEdges(t *testing.T) {
	for edge := int32(0); edge < 4; edge++ {
		t.Run(fmt.Sprint(edge), func(t *testing.T) {
			e, order := previewWingFixture(t, edge)
			before, _ := e.Save()
			advice, err := e.PreviewOrderAdvice(1, []Order{order})
			if err != nil || len(advice.Plans) != 1 || advice.Results[0].Code != "indeterminate" {
				t.Fatalf("missing advisory plan: %+v %v", advice, err)
			}
			after, _ := e.Save()
			if !bytes.Equal(before, after) {
				t.Fatal("planning changed state, RNG or pending orders")
			}
			plan := advice.Plans[0]
			if plan.OrderIndex != 0 || plan.Kind != "skybreaker" || plan.Edge != edge || len(plan.Routes) != 3 {
				t.Fatal(plan)
			}
			issue(t, e, 1, order)
			if len(e.state.Operations) != 3 {
				t.Fatal("ordinary command failed", e.state.Results)
			}
			for i, route := range plan.Routes {
				op := e.state.Operations[i]
				plane := e.entity(op.Source)
				if op.At != route.ReleaseAt || op.Points[0] != route.Impact || op.Points[1] != route.Entry || op.Points[2] != route.Drop || plane.DisabledUntil != route.EntryAt || route.ImpactAt != op.At+1 || route.Splash != 2000 {
					t.Fatalf("plan diverged from actual flight: %+v %+v", route, op)
				}
				if route.ReleaseAt < advice.Tick+241 || route.EntryAt < advice.Tick+1 {
					t.Fatal("missing minimum warning or next-tick execution")
				}
			}
			// The short east/south approach must wait; long west/north flights
			// on this 64-tile map still arrive before the minimum warning.
			if plan.Routes[0].EntryAt <= advice.Tick+1 {
				t.Fatal("short approach has no launch delay")
			}
			save, _ := e.SaveForAdvice()
			fromSave, err := PreviewSavedOrderAdvice(e.catalog, save, 1, []Order{order})
			if err != nil || len(fromSave.Plans) != 1 {
				t.Fatal("host saved advice failed", err)
			}
			if dir := os.Getenv("FRONTLINE_TACTICAL_VIEW_DIR"); dir != "" {
				data, _ := json.Marshal(advice)
				if err := os.MkdirAll(dir, 0755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("skybreaker-plan-%d.json", edge)), data, 0644); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestTacticalSkybreakerPlanFogAndOwnership(t *testing.T) {
	e, order := previewWingFixture(t, 0)
	first, err := e.PreviewOrderAdvice(1, []Order{order})
	if err != nil {
		t.Fatal(err)
	}
	// Unseen anti-air must never alter either the route or the ETA.
	pos := Vec{X: 20000, Y: 52000}
	if e.canSee(1, pos) {
		t.Fatal("fixture anti-air is visible")
	}
	e.spawn("IR.aa", 2, pos, true, 1)
	e.updateFog()
	second, err := e.PreviewOrderAdvice(1, []Order{order})
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(first)
	b, _ := json.Marshal(second)
	if !bytes.Equal(a, b) {
		t.Fatal("hidden defenses changed owner plan")
	}
	for _, change := range []func(*Order){
		func(o *Order) { o.Index = 4 },
		func(o *Order) { o.Points = []Vec{{X: 20000, Y: 52000}, {X: 20000, Y: 52000}, {X: 20000, Y: 52000}} },
		func(o *Order) { o.Points = o.Points[:2] },
		func(o *Order) { o.Points[1] = Vec{X: 8000, Y: 8000} },
		func(o *Order) { o.Type = "recon_sweep" },
	} {
		o := order
		o.Points = append([]Vec(nil), order.Points...)
		change(&o)
		result, err := e.PreviewOrderAdvice(1, []Order{o})
		if err != nil || len(result.Plans) != 0 {
			t.Fatal("invalid strategic geometry/capability got route", result, err)
		}
	}
	if _, err := e.PreviewOrderAdvice(2, []Order{order}); err == nil {
		t.Fatal("other player read owner's plan")
	}
	if _, err := e.PreviewCandidates(1, []Order{order}); err == nil {
		t.Fatal("independent candidates accepted strategic batch")
	}
	if _, err := e.PreviewOrderAdvice(1, []Order{{Kind: "ability", Type: "strategic", Entities: order.Entities, Index: -1, Points: order.Points}}); err == nil {
		t.Fatal("negative edge accepted")
	}
	if _, err := e.PreviewOrderAdvice(1, []Order{{Kind: "ability", Type: "strategic", Entities: order.Entities, Points: []Vec{{X: -1}, {X: -1}, {X: -1}}}}); err == nil {
		t.Fatal("out of map target accepted")
	}
	result, err := e.PreviewOrderAdvice(1, []Order{{Kind: "hold", Entities: []ID{2}}, order})
	if err != nil || len(result.Plans) != 1 || result.Plans[0].OrderIndex != 1 {
		t.Fatal("batch index lost", result, err)
	}
}

func TestTacticalSkybreakerLongFlightGeometry(t *testing.T) {
	e := fixture(t)
	// Geometry-only 192-tile theater: no hidden obstacles or mutable rules.
	e.state.Map.Width = 192
	point := Vec{X: 180000, Y: 30000}
	routes := e.skybreakerRoutes(Order{Index: 0, Points: []Vec{point, point, point}}, 100)
	for _, r := range routes {
		if r.EntryAt != 100 || r.ReleaseAt != 698 || r.ImpactAt != 699 {
			t.Fatalf("long flight should enter immediately and fly 179399 millitiles at six tiles/second: %+v", r)
		}
	}
}
