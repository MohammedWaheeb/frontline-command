package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type serviceScene struct {
	Name, Faction, Home, Retained string
	Types                         []string
}

var serviceScenes = []serviceScene{
	{"US-six", "US", "US.airfield", "", []string{"US.airlift", "US.airlift", "US.gunship", "US.gunship", "US.strike", "US.fighter"}},
	{"IR-six", "IR", "IR.drone_hub", "", []string{"IR.strike", "IR.strike", "IR.isr", "IR.isr", "IR.fighter", "IR.gunship"}},
	{"SA-four", "SA", "SA.airfield", "", []string{"SA.gunship", "SA.gunship", "SA.strike", "SA.fighter"}},
	{"SY-two", "SY", "SY.workshop_air", "", []string{"SY.scout_drone", "SY.scout_drone"}},
	{"SY-retained-US-six", "US", "US.airfield", "SY.workshop_air", []string{"US.airlift", "US.airlift", "US.airlift", "US.airlift", "US.airlift", "US.airlift"}},
	{"IR-retained-US-six", "US", "US.airfield", "IR.drone_hub", []string{"US.airlift", "US.airlift", "US.airlift", "US.airlift", "US.airlift", "US.airlift"}},
}

func serviceCandidateScene(t *testing.T, scene serviceScene) (*Engine, *Entity, []*Entity) {
	t.Helper()
	e := fixture(t)
	e.player(1).Faction = scene.Faction
	home := e.spawn(scene.Home, 1, Vec{X: 40000, Y: 40000}, true, 0)
	if scene.Retained != "" {
		b, _ := e.buildingRule(scene.Retained)
		home.FootprintWidth = b.Width
		home.FootprintHeight = b.Height
		home.FootprintType = scene.Retained
	}
	planes := []*Entity{}
	for i, typ := range scene.Types {
		v := e.spawn(typ, 1, Vec{X: 33000 + int32(i%3)*6000, Y: 32000 + int32(i/3)*16000}, true, 0)
		v.Home = home.ID
		v.Landed = false
		v.Stance = "hold"
		planes = append(planes, v)
	}
	e.recalculate()
	e.updateFog()
	return e, home, planes
}

func assertServicePhysical(t *testing.T, e *Engine, home *Entity, planes []*Entity) {
	t.Helper()
	for _, v := range planes {
		if !e.serviceParkingClear(v, home, v.Position, nil) {
			t.Fatalf("invalid exterior parking actor%d %s %+v", v.ID, v.Type, v.Position)
		}
		if e.radius(v) != 600 {
			t.Fatal("combat radius changed", v.Type, e.radius(v))
		}
	}
}

// Prepared mechanics scenes then use only public Return orders and ordinary
// movement/service. They are not campaign-playthrough or opening-economy proof.
func TestCandidateServiceActualReturnsAndNativeScenes(t *testing.T) {
	for _, scene := range serviceScenes {
		t.Run(scene.Name, func(t *testing.T) {
			e, home, planes := serviceCandidateScene(t, scene)
			recorder, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			ids := []ID{}
			for _, v := range planes {
				ids = append(ids, v.ID)
			}
			issue(t, e, 1, Order{Kind: "return", Entities: ids})
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			restored, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal("approach restore", err)
			}
			for range 1800 {
				all := true
				for _, v := range planes {
					if v.HP <= 0 {
						t.Fatal("aircraft lost", v.ID)
					}
					all = all && v.Landed && v.ServiceWork == 0
				}
				if all {
					break
				}
				e.Advance()
				restored.Advance()
			}
			for _, v := range planes {
				if !v.Landed || v.ServiceWork != 0 {
					t.Fatalf("did not finish actual service %+v", v)
				}
			}
			assertServicePhysical(t, e, home, planes)
			if e.Hash() != restored.Hash() {
				t.Fatal("approach/service restore divergence")
			}
			recorder.Capture(e, false)
			played, err := recorder.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("full replay divergence", err)
			}
			if dir := os.Getenv("FRONTLINE_SERVICE_SCENES"); dir != "" {
				if err = os.MkdirAll(dir, 0755); err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(filepath.Join(dir, scene.Name+".approach.save.json"), saved, 0644); err != nil {
					t.Fatal(err)
				}
				view, _ := e.PlayerView(1)
				points := []map[string]any{}
				for _, v := range planes {
					points = append(points, map[string]any{"id": v.ID, "type": v.Type, "position": v.Position, "parking_radius": serviceParkingRadius(v.Type), "combat_radius": e.radius(v), "home": v.Home, "landed": v.Landed})
				}
				data, err := json.MarshalIndent(map[string]any{"format_version": 1, "simulation": Version, "scene": scene.Name, "tick": e.Tick(), "hash": e.Hash(), "home": home, "aircraft": points, "view": view}, "", "  ")
				if err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(filepath.Join(dir, scene.Name+".json"), data, 0644); err != nil {
					t.Fatal(err)
				}
				save, _ := e.Save()
				if err = os.WriteFile(filepath.Join(dir, scene.Name+".save.json"), save, 0644); err != nil {
					t.Fatal(err)
				}
			}
			t.Logf("ordinary return/service tick%d; attempts%d candidates%d obstaclechecks%d", e.Tick(), e.parkingMetrics.Attempts, e.parkingMetrics.Candidates, e.parkingMetrics.ObstacleChecks)
		})
	}
}

func TestCandidateServiceReservationStabilityReleaseAndGroundGeometry(t *testing.T) {
	e, home, planes := serviceCandidateScene(t, serviceScenes[0])
	ids := []ID{}
	for _, v := range planes {
		ids = append(ids, v.ID)
	}
	issue(t, e, 1, Order{Kind: "return", Entities: ids})
	original := map[ID]Vec{}
	for _, v := range planes {
		if v.Landing == nil {
			t.Fatal("missing final approach reservation", v.ID)
		}
		original[v.ID] = v.Landing.Position
	}
	departing := planes[0]
	issue(t, e, 1, Order{Kind: "move", Entities: []ID{departing.ID}, Position: Vec{X: 20000, Y: 40000}})
	if departing.Landing != nil {
		t.Fatal("departing retained pad")
	}
	for _, v := range planes[1:] {
		if v.Landing == nil || v.Landing.Position != original[v.ID] {
			t.Fatal("survivor pads reshuffled")
		}
	}
	v := planes[1]
	point := v.Landing.Position
	ground := e.spawn("US.rig", 1, Vec{X: point.X - 6000, Y: point.Y}, true, 0)
	if e.clear(point, e.radius(ground), ground.ID, false, true) || e.mobileClear(point, e.radius(ground), ground.ID) {
		t.Fatal("reserved pad admits ground unit")
	}
	if e.clear(point, 600, departing.ID, true, true) == false {
		t.Fatal("airborne collision used pad rather than real600 disc")
	}
	if e.validPlacement(1, point, 2, 2) == "ok" {
		t.Fatal("construction entered reservation")
	}
	if !e.clear(original[departing.ID], 800, ground.ID, false, true) {
		t.Fatal("departed reservation remains obstacle")
	}
	// Independent Home loss must retain emergency grounded occupancy.
	v.Position = point
	v.Landed = true
	v.Landing = nil
	v.Home = 0
	v.EmergencyTakeoffUntil = e.Tick() + 40
	if _, r, ok := e.groundObstacle(v); !ok || r != serviceParkingRadius(v.Type)+100 {
		t.Fatal("grounded emergency area lost")
	}
	_ = home
}

func TestCandidateDenseOriginalMaximumLayoutDiagnosis(t *testing.T) {
	e, ids := maximumAirReturnFixture(t)
	for range 2399 {
		e.Advance()
	}
	blocked := 0
	for _, id := range ids {
		v := e.entity(id)
		if v == nil || v.HP <= 0 {
			t.Fatal("unexpected early loss", id)
		}
		if v.Landed {
			continue
		}
		blocked++
		home := e.entity(v.Home)
		point, legal := e.serviceLandingPosition(v, home)
		t.Logf("aircraft%d pos%+v home%d %+v landed%v reserve%+v remaining%d legalcandidate%v %+v state%s", id, v.Position, home.ID, home.Position, v.Landed, v.Landing, v.Endurance, legal, point, v.State)
		if blocked == 1 {
			for _, o := range e.parkingObstacles(v, home) {
				t.Logf("obstacle %+v", o)
			}
		}
	}
	t.Logf("original dense fixture remaining=%d/64, attempts=%d candidates=%d checks=%d maxattempts=%d", blocked, e.parkingMetrics.Attempts, e.parkingMetrics.Candidates, e.parkingMetrics.ObstacleChecks, e.parkingMetrics.MaxAttempts)
}
