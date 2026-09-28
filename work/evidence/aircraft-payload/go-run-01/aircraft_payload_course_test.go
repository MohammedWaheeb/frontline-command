package sim

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Prepared infrastructure and one remaining round are explicit fixture grants.
// Every change after the initial replay save uses ordinary commands and Advance.
// This is a renderer contract course, not paid opening or campaign evidence.
func TestAircraftPayloadPresentationCourse(t *testing.T) {
	for _, typ := range []string{"US.fighter", "IR.gunship"} {
		t.Run(typ, func(t *testing.T) {
			e, home, backup, aircraft := rebaseFixture(t, typ)
			e.spawn("power", 1, Vec{X: 12000, Y: 24000}, true, 0)
			e.spawn("power", 1, Vec{X: 12000, Y: 32000}, true, 0)
			aircraft.Ammo = 1
			aircraft.Stance = "hold"
			targetType := "IR.isr"
			if typ == "IR.gunship" {
				targetType = "IR.tank"
			}
			target := e.spawn(targetType, 2, Vec{X: 26000, Y: 30000}, true, 0)
			target.Stance = "hold"
			enemyHome := e.spawn("IR.drone_hub", 2, Vec{X: 48000, Y: 40000}, true, 0)
			if e.isAircraft(target) {
				target.Home, target.Landed = enemyHome.ID, false
			}
			// Publicly observed foreign vision is provided by real stationary scouts.
			for _, position := range []Vec{{X: 23000, Y: 31500}, {X: 35000, Y: 31500}} {
				observer := e.spawn("IR.isr", 2, position, true, 0)
				observer.Stance = "hold"
				observer.Home, observer.Landed = enemyHome.ID, false
			}
			e.recalculate()
			e.updateFog()
			r := droneRecord(t, e, "payload-"+typ)
			dir := os.Getenv("FRONTLINE_PAYLOAD_COURSE")
			if dir == "" {
				t.Fatal("FRONTLINE_PAYLOAD_COURSE output directory required")
			}
			dir = filepath.Join(dir, typ)
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
				Owned   View   `json:"owned"`
				Foreign View   `json:"foreign"`
			}
			points := []point{}
			capture := func(stage string) {
				t.Helper()
				own, _ := e.PlayerView(1)
				foreign, _ := e.PlayerView(2)
				observed := false
				for _, visible := range foreign.Entities {
					observed = observed || visible.ID == aircraft.ID
					if visible.Owner == 1 && visible.Private != nil {
						t.Fatal("foreign payload facts leaked")
					}
				}
				if !observed {
					t.Fatal("foreign course observer cannot see aircraft at", stage)
				}
				save, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				copy, err := Restore(e.catalog, save)
				if err != nil || copy.Hash() != e.Hash() {
					t.Fatal("checkpoint restore", err)
				}
				copyOwn, _ := copy.PlayerView(1)
				copyForeign, _ := copy.PlayerView(2)
				if !reflect.DeepEqual(copyOwn, own) || !reflect.DeepEqual(copyForeign, foreign) {
					t.Fatal("restored authorized views changed")
				}
				if err = os.WriteFile(filepath.Join(dir, stage+".save.json"), save, 0644); err != nil {
					t.Fatal(err)
				}
				points = append(points, point{stage, e.Tick(), e.Hash(), aircraft.ID, own, foreign})
				write("course.json", points)
			}
			t.Cleanup(func() {
				if t.Failed() {
					save, err := e.Save()
					if err == nil {
						_ = os.WriteFile(filepath.Join(dir, "failure.save.json"), save, 0644)
					}
				}
			})
			until := func(label string, limit uint32, done func() bool) {
				t.Helper()
				for range limit {
					if done() {
						return
					}
					r.step()
				}
				if !done() {
					t.Fatalf("%s: tick%d actor%+v", label, e.Tick(), aircraft)
				}
			}
			capture("01-initial-one-round")
			r.submit(1, Order{Kind: "attack", Entities: []ID{aircraft.ID}, Target: target.ID})
			until("spend final round", 600, func() bool { return aircraft.Ammo == 0 })
			capture("02-final-round")
			r.submit(1, Order{Kind: "return", Entities: []ID{aircraft.ID}})
			until("land and admit service", 800, func() bool { return aircraft.Landed && aircraft.ServiceWork > 0 })
			capture("03-service-admission")
			until("half service", 600, func() bool { return aircraft.ServiceWork >= e.serviceRequired(aircraft)/2 })
			if aircraft.Ammo != 0 {
				t.Fatal("early refill")
			}
			capture("04-half-service")
			r.submit(1, Order{Kind: "power", Entities: []ID{home.ID}, Index: 0})
			r.step()
			held := aircraft.ServiceWork
			for range 100 {
				r.step()
				if aircraft.ServiceWork != held || aircraft.Ammo != 0 {
					t.Fatal("disabled service advanced or refilled")
				}
			}
			capture("05-disabled-service")
			r.submit(1, Order{Kind: "sell", Entities: []ID{home.ID}})
			until("sold original home", 120, func() bool { return e.entity(home.ID) == nil })
			until("home loss handled", 3, func() bool { return aircraft.Home != home.ID })
			if aircraft.Ammo != 0 || aircraft.ServiceWork != 0 || !aircraft.Landed || aircraft.EmergencyTakeoffUntil == 0 {
				t.Fatal("home loss granted payload or skipped emergency departure")
			}
			capture("06-home-loss-grounded")
			until("actual emergency lift", 45, func() bool { return !aircraft.Landed })
			if aircraft.Ammo != 0 {
				t.Fatal("departure refilled payload")
			}
			capture("07-emergency-airborne")
			until("backup service admission", 800, func() bool { return aircraft.Home == backup.ID && aircraft.Landed && aircraft.ServiceWork > 0 })
			capture("08-backup-service")
			until("last empty service tick", 800, func() bool { return aircraft.ServiceWork+2 > e.serviceRequired(aircraft) })
			if aircraft.Ammo != 0 {
				t.Fatal("payload before service completion")
			}
			capture("09-before-refill")
			r.step()
			weapon, _ := e.weapon(aircraft)
			if aircraft.Ammo != weapon.Ammo || aircraft.ServiceWork != 0 || !aircraft.Landed {
				t.Fatal("ordinary final service did not refill atomically")
			}
			capture("10-refilled")
			if err := r.replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			for _, at := range points {
				replayed, err := r.replay.Seek(e.catalog, at.Tick)
				if err != nil || replayed.Hash() != at.Hash {
					t.Fatal("replay checkpoint", at.Stage, err)
				}
				own, _ := replayed.PlayerView(1)
				foreign, _ := replayed.PlayerView(2)
				if !reflect.DeepEqual(own, at.Owned) || !reflect.DeepEqual(foreign, at.Foreign) {
					t.Fatal("replay authorized view", at.Stage)
				}
			}
			packed, err := r.replay.Encode()
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(filepath.Join(dir, "course.fcr"), packed, 0644); err != nil {
				t.Fatal(err)
			}
			write("result.json", map[string]any{"status": "passed", "simulation": e.Metadata(), "tick": e.Tick(), "hash": e.Hash(), "points": len(points), "replay_views_exact": true, "scope": "Synthetic prepared infrastructure; actual final shot, Return, power, sell, emergency departure and complete service. No opening-economy claim."})
		})
	}
}
