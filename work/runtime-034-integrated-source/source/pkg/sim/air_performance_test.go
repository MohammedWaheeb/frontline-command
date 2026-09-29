package sim

import (
	"sort"
	"testing"
	"time"
)

// Four Iranian rosters allow the legal maximum688 actors while fielding64
// one-Supply ISR drones. The map is synthetic, not a faction-balance scenario.
func maximumAirReturnFixture(t testing.TB) (*Engine, []ID) {
	e := maximumFactionFixture(t, []string{"IR", "IR", "IR", "IR"})
	aircraft := []ID{}
	for i, p := range e.state.Players {
		hubs := []*Entity{}
		buildings := 0
		units := 0
		for _, v := range e.state.Entities {
			if v.Owner != p.ID {
				continue
			}
			if v.Building {
				typ := v.Type
				if buildings >= 1 && buildings <= 16 {
					typ = "aa_post"
				}
				if buildings >= 17 && buildings <= 20 {
					typ = "IR.drone_hub"
				}
				if typ != v.Type {
					b, _ := e.buildingRule(typ)
					v.Type = typ
					v.HP = b.HP
					v.MaxHP = b.HP
					v.FootprintWidth = b.Width
					v.FootprintHeight = b.Height
					v.FootprintType = typ
					v.Paid = b.Cost
				}
				if typ == "IR.drone_hub" {
					hubs = append(hubs, v)
				}
				buildings++
				continue
			}
			if e.role(v) != "recon" {
				continue
			}
			if units >= 16 {
				units++
				continue
			}
			u, _ := e.catalog.Unit("IR.isr")
			v.Type = u.ID
			v.HP = u.HP / 2
			v.MaxHP = u.HP
			v.Paid = u.Cost
			v.Landed = false
			v.Endurance = 2400
			v.Home = hubs[units/4].ID
			v.Position = Vec{X: 68000 + int32(i%2)*16000 + int32(units%4)*1400, Y: 68000 + int32(i/2)*16000 + int32(units/4)*1400}
			v.Anchor = v.Position
			v.LastPosition = v.Position
			v.Orders = []Order{{Kind: "return"}}
			aircraft = append(aircraft, v.ID)
			units++
		}
	}
	e.recalculate()
	e.updateFog()
	for _, p := range e.state.Players {
		if p.Supply != 100 || p.PowerCapacity < p.PowerDemand {
			t.Fatal("stress fixture violates supply or power", p.ID, p.Supply, p.PowerCapacity, p.PowerDemand)
		}
	}
	if len(e.state.Entities) != 688 || len(aircraft) != 64 {
		t.Fatal("air return fixture count")
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Restore(e.catalog, saved); err != nil {
		t.Fatal("air fixture invalid", err)
	}
	return e, aircraft
}
func TestMaximumActorsSimultaneousAirReturn(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("native worst-air workload runs without race instrumentation")
	}
	e, aircraft := maximumAirReturnFixture(t)
	measurements := make([]time.Duration, 0, 2400)
	landed := map[ID]bool{}
	peakReturning := 0
	for tick := 0; tick < 2400; tick++ {
		start := time.Now()
		e.Advance()
		measurements = append(measurements, time.Since(start))
		returning := 0
		for _, id := range aircraft {
			v := e.entity(id)
			if v == nil || v.HP <= 0 {
				t.Fatalf("aircraft%d lost during unobstructed legal return at tick%d", id, e.Tick())
			}
			if v.Landed {
				landed[id] = true
			} else {
				returning++
			}
		}
		peakReturning = max(peakReturning, returning)
		if len(landed) == len(aircraft) {
			break
		}
	}
	if len(landed) != 64 {
		t.Fatalf("only%d/64 drones reached a legal pad by endurance deadline", len(landed))
	}
	for i, id := range aircraft {
		a := e.entity(id)
		for _, other := range aircraft[i+1:] {
			b := e.entity(other)
			if a.Landed && b.Landed && distance(a.Position, b.Position) < e.radius(a)+e.radius(b) {
				t.Fatal("landed drones overlap", a.ID, b.ID)
			}
		}
	}
	sort.Slice(measurements, func(i, j int) bool { return measurements[i] < measurements[j] })
	p50, p95, p99 := measurements[len(measurements)/2], measurements[len(measurements)*95/100], measurements[len(measurements)*99/100]
	t.Logf("688actors,64simultaneousreturns,64weapondefenses: ticks=%d peakreturning=%d p50=%s p95=%s p99=%s; nativehostonly", len(measurements), peakReturning, p50, p95, p99)
	if p95 > 25*time.Millisecond || p99 > 40*time.Millisecond {
		t.Fatal("air return tick budget exceeded")
	}
}
