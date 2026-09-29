package sim

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// This component course grants its declared initial units/damage. Once recorded,
// only public Submit orders and Advance can change authoritative state. It is
// not evidence of a paid campaign opening or a completed rendered asset roster.
func TestGroundLauncherPayloadCourse(t *testing.T) {
	type scenario struct {
		typ             string
		damaged, cancel bool
	}
	scenarios := []scenario{}
	for _, typ := range []string{"US.launcher", "IR.launcher", "SY.launcher", "SA.launcher"} {
		scenarios = append(scenarios, scenario{typ, false, false}, scenario{typ, true, false})
	}
	scenarios = append(scenarios, scenario{"IR.launcher", false, true})
	for _, sc := range scenarios {
		name := sc.typ
		if sc.damaged {
			name += "-damaged-empty"
		}
		if sc.cancel {
			name += "-cancel-volley"
		}
		t.Run(name, func(t *testing.T) {
			e := balanceEngine(t, fixtureMap(), sc.typ[:2], "IR")
			e.state.Countdown = 0
			v := e.spawn(sc.typ, 1, Vec{X: 20000, Y: 30000}, true, 0)
			v.Stance = "hold"
			w, _ := e.weapon(v)
			v.Charges = w.Ammo // Explicit initially loaded fixture; spawn starts launchers with one charge.
			if sc.damaged {
				v.HP = v.MaxHP / 3
				v.Charges = 0
			}
			target := e.spawn("barracks", 2, Vec{X: 40000, Y: 30000}, true, 0)
			spotter := e.spawn(sc.typ[:2]+".engineer", 1, Vec{X: 39000, Y: 29000}, true, 0)
			spotter.Stance = "hold"
			for _, p := range []Vec{{X: 22000, Y: 33000}, {X: 19000, Y: 26000}} {
				observer := e.spawn("IR.engineer", 2, p, true, 0)
				observer.Stance = "hold"
			}
			r := droneRecord(t, e, "ground-payload-"+name)
			root := os.Getenv("FRONTLINE_GROUND_PAYLOAD_COURSE")
			if root == "" {
				t.Fatal("output path required")
			}
			dir := filepath.Join(root, name)
			if err := os.MkdirAll(dir, 0755); err != nil {
				t.Fatal(err)
			}
			write := func(name string, value any) {
				t.Helper()
				data, err := json.MarshalIndent(value, "", "  ")
				if err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(filepath.Join(dir, name), data, 0644); err != nil {
					t.Fatal(err)
				}
			}
			type point struct {
				Stage   string `json:"stage"`
				Tick    Tick   `json:"tick"`
				Hash    string `json:"hash"`
				Actor   ID     `json:"actor"`
				Charges int32  `json:"charges"`
				Shot    bool   `json:"shot"`
				Owned   View   `json:"owned"`
				Foreign View   `json:"foreign"`
			}
			points := []point{}
			write("map.json", e.state.Map)
			t.Cleanup(func() {
				if t.Failed() {
					if data, err := e.Save(); err == nil {
						_ = os.WriteFile(filepath.Join(dir, "failure.save.json"), data, 0644)
					}
				}
			})
			capture := func(stage string, shot bool) {
				t.Helper()
				own, _ := e.PlayerView(1)
				foreign, _ := e.PlayerView(2)
				found := false
				for _, actor := range foreign.Entities {
					if actor.ID == v.ID {
						found = true
						if actor.Private != nil {
							t.Fatal("foreign payload facts leaked")
						}
					}
				}
				if !found {
					t.Fatal("foreign observer cannot see launcher", stage)
				}
				actualShot := false
				for _, event := range e.state.Events {
					actualShot = actualShot || event.Kind == "weapon_fired" && event.Entity == v.ID
				}
				if actualShot != shot {
					t.Fatalf("%s actual shot=%v expected%v", stage, actualShot, shot)
				}
				data, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				copy, err := Restore(e.catalog, data)
				if err != nil || copy.Hash() != e.Hash() {
					t.Fatal("exact restore", err)
				}
				a, _ := copy.PlayerView(1)
				b, _ := copy.PlayerView(2)
				if !reflect.DeepEqual(own, a) || !reflect.DeepEqual(foreign, b) {
					t.Fatal("restored authorized view changed", stage)
				}
				if err = os.WriteFile(filepath.Join(dir, stage+".save.json"), data, 0644); err != nil {
					t.Fatal(err)
				}
				points = append(points, point{stage, e.Tick(), e.Hash(), v.ID, v.Charges, shot, own, foreign})
				write("course.json", points)
			}
			until := func(label string, limit uint32, done func() bool) {
				t.Helper()
				for range limit {
					if done() {
						return
					}
					r.step()
				}
				if !done() {
					t.Fatalf("%s at tick%d charges%d state%s deployed%v pos%+v", label, e.Tick(), v.Charges, v.State, v.Deployed, v.Position)
				}
			}
			submit := func(order Order) { t.Helper(); order.Entities = []ID{v.ID}; r.submit(1, order); r.step() }
			midpoint := func(end Tick) {
				t.Helper()
				at := v.DeploymentStarted + (end-v.DeploymentStarted)/2
				until("transition midpoint", 100, func() bool { return e.Tick() == at })
			}
			capture("01-initial", false)
			submit(Order{Kind: "deploy"})
			midpoint(v.DeployUntil)
			capture("02-deploy-half", false)
			until("deployed", 100, func() bool { return v.Deployed })
			capture("03-deployed", false)
			expectedCharges := v.Charges
			if !sc.damaged {
				before := e.player(1).Credits
				if sc.typ == "IR.launcher" {
					submit(Order{Kind: "ability", Type: "volley", Points: []Vec{target.Position, target.Position}})
					if v.Charges != 1 || e.player(1).Credits != before-300000 {
						t.Fatal("first paid volley charge")
					}
					capture("04-first-shot-one-charge", true)
					first := e.Tick()
					if sc.cancel {
						submit(Order{Kind: "move", Position: Vec{X: 23000, Y: 30000}})
						midpoint(v.PackingUntil)
						capture("05-cancel-pack-half-one-charge", false)
						until("past canceled second volley", 60, func() bool { return e.Tick() > first+30 })
						if v.Charges != 1 || e.player(1).Credits != before-300000 {
							t.Fatal("canceled second shot spent resources")
						}
						capture("06-canceled-second-shot", false)
						expectedCharges = 1
					} else {
						until("before second shot", 30, func() bool { return e.Tick() == first+29 })
						capture("05-before-second-shot", false)
						r.step()
						if v.Charges != 0 || e.player(1).Credits != before-600000 {
							t.Fatal("second paid volley charge")
						}
						capture("06-last-shot-empty", true)
						expectedCharges = 0
					}
				} else {
					r.submit(1, Order{Kind: "attack", Entities: []ID{v.ID}, Target: target.ID})
					until("ordinary tactical shot", 200, func() bool { return v.Charges == 0 })
					cost := int64(300000)
					if w.ID == "MISSILE" {
						cost = 400000
					}
					if e.player(1).Credits != before-cost {
						t.Fatal("shot charge cost")
					}
					capture("04-last-shot-empty", true)
					expectedCharges = 0
				}
			}
			if !sc.cancel {
				submit(Order{Kind: "move", Position: Vec{X: 23000, Y: 30000}})
				midpoint(v.PackingUntil)
				capture("07-pack-half", false)
			}
			until("moving after pack", 100, func() bool { return v.State == "moving" && v.PackingUntil == 0 })
			if v.Charges != expectedCharges {
				t.Fatal("movement changed charge count")
			}
			capture("08-moving", false)
			until("arrived", 500, func() bool {
				return len(v.Orders) == 0 && len(v.Path) == 0 && distance(v.Position, Vec{X: 23000, Y: 30000}) < 250
			})
			capture("09-mobile-idle", false)
			submit(Order{Kind: "deploy"})
			midpoint(v.DeployUntil)
			capture("10-deploy-half-after-shot", false)
			until("deployed after shot", 100, func() bool { return v.Deployed })
			capture("11-deployed-after-shot", false)
			// Preserve the ordinary work clock; no direct refill or time/state assignment.
			if !sc.damaged {
				for v.Charges < w.Ammo {
					old := v.Charges
					until("last charge-work tick", w.IntervalTicks+2, func() bool { return v.ChargeWork+2 >= w.IntervalTicks*2 })
					capture(fmt.Sprintf("12-before-refill-%d", old+1), false)
					r.step()
					if v.Charges != old+1 {
						t.Fatal("regeneration did not change exactly one charge")
					}
					capture(fmt.Sprintf("13-refilled-%d", v.Charges), false)
				}
			}
			if err := r.replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			full := *r.replay
			full.Checkpoints = nil
			for _, p := range points {
				replayed, err := full.Seek(e.catalog, p.Tick)
				if err != nil || replayed.Hash() != p.Hash {
					t.Fatal("full replay", p.Stage, err)
				}
				own, _ := replayed.PlayerView(1)
				foreign, _ := replayed.PlayerView(2)
				if !reflect.DeepEqual(own, p.Owned) || !reflect.DeepEqual(foreign, p.Foreign) {
					t.Fatal("full replay views", p.Stage)
				}
			}
			encoded, err := full.Encode()
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(filepath.Join(dir, "course.fcr"), encoded, 0644); err != nil {
				t.Fatal(err)
			}
			write("result.json", map[string]any{"status": "passed", "points": len(points), "tick": e.Tick(), "hash": e.Hash(), "actor": v.ID, "type": sc.typ, "damaged_initial_fixture": sc.damaged, "cancel_volley": sc.cancel, "save_views_exact": true, "replay_views_exact": true, "replay_checkpoints_removed": true, "simulation": e.Metadata(), "scope": "Prepared units/declared initial damage; all subsequent changes use ordinary Submit/Advance. No paid-opening or rendered-art acceptance."})
		})
	}
}
