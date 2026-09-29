package sim

import (
	"sort"
	"testing"
	"time"
)

// A legal late-game snapshot: each player has 100 Supply, 12 workers,
// 60 structures, 16 weapon defenses, four drone hubs and a charged strategic
// site. Strategic missiles add load without pretending launchers cost 1 Supply.
func TestExteriorMaximumCombinedReturnsRoutesInterception(t *testing.T) {
	if testing.Short() || raceInstrumentation {
		t.Skip("native combined workload runs without race instrumentation")
	}
	e, aircraft := exteriorMaximumFixture(t)
	armies := map[PlayerID][]ID{}
	sites := map[PlayerID]*Entity{}
	for i, p := range e.state.Players {
		buildingIndex, scoutIndex := 0, 0
		for _, v := range e.state.Entities {
			if v.Owner != p.ID {
				continue
			}
			if v.Building {
				typ := v.Type
				switch {
				case buildingIndex >= 1 && buildingIndex <= 8:
					typ = "abm"
				case buildingIndex == 21:
					typ = "radar"
				case buildingIndex == 22:
					typ = "tech"
				case buildingIndex == 23:
					typ = "strategic"
				}
				if typ != v.Type {
					b, ok := e.buildingRule(typ)
					if !ok {
						t.Fatal("missing building", typ)
					}
					v.Type = typ
					v.HP = b.HP
					v.MaxHP = b.HP
					v.Paid = b.Cost
					v.FootprintWidth = b.Width
					v.FootprintHeight = b.Height
					v.FootprintType = typ
				}
				if typ == "abm" {
					v.Charges = 2
				}
				if typ == "strategic" {
					v.ChargeWork = e.strategicCharge(p.Faction)
					sites[p.ID] = v
				}
				buildingIndex++
				continue
			}
			if e.role(v) != "recon" {
				continue
			}
			if scoutIndex == 0 {
				// Actual sight of the next enemy base, without granting global fog.
				target := (i + 1) % 4
				v.Position = Vec{X: int32(8000+(target%2)*90000) - 4000, Y: int32(8000+(target/2)*90000) + 6000}
				v.Anchor = v.Position
				v.LastPosition = v.Position
			} else {
				armies[p.ID] = append(armies[p.ID], v.ID)
			}
			scoutIndex++
		}
	}
	e.recalculate()
	e.updateFog()
	for i, p := range e.state.Players {
		if p.Supply != 100 || p.Tier != 3 || p.LowPower() {
			t.Fatal("illegal combined fixture", p.ID, p.Supply, p.Tier, p.PowerDemand, p.PowerCapacity)
		}
		target := (i + 1) % 4
		x, y := int32(8000+(target%2)*90000), int32(8000+(target/2)*90000)
		points := []Vec{{X: x, Y: y}, {X: x + 2000, Y: y}, {X: x + 4000, Y: y}}
		if err := e.Submit(p.ID, p.LastSequence+1, []Order{{Kind: "ability", Type: "strategic", Entities: []ID{sites[p.ID].ID}, Points: points}}); err != nil {
			t.Fatal(err)
		}
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Restore(e.catalog, saved); err != nil {
		t.Fatal("invalid combined maximum snapshot", err)
	}
	measurements := make([]time.Duration, 0, 600)
	peakProjectiles, interceptions, fired, peakReturning := 0, 0, 0, 0
	for tick := 0; tick < 600; tick++ {
		if tick%80 == 0 {
			for _, p := range e.state.Players {
				ids := armies[p.ID]
				for start := 0; start < len(ids); start += 64 {
					goal := Vec{X: 74000 + int32(tick/80%2)*12000, Y: 74000 + int32(tick/80%2)*12000}
					if err = e.Submit(p.ID, p.LastSequence+1, []Order{{Kind: "move", Entities: ids[start:min(start+64, len(ids))], Position: goal}}); err != nil {
						t.Fatal(err)
					}
				}
			}
		}
		start := time.Now()
		e.Advance()
		measurements = append(measurements, time.Since(start))
		for _, result := range e.state.Results {
			if !result.Accepted {
				t.Fatal("stress order rejected", result)
			}
		}
		peakProjectiles = max(peakProjectiles, len(e.state.Projectiles))
		returning := 0
		for _, id := range aircraft {
			if v := e.entity(id); v != nil && !v.Landed {
				returning++
			}
		}
		peakReturning = max(peakReturning, returning)
		for _, event := range e.state.Events {
			switch event.Kind {
			case "interceptor_fired":
				fired++
			case "missile_intercepted":
				interceptions++
			}
		}
	}
	if peakProjectiles < 24 || fired != 24 || interceptions != 24 || peakReturning != 64 {
		t.Fatal("combined workload did not exercise all systems", peakProjectiles, fired, interceptions, peakReturning)
	}
	for _, id := range aircraft {
		v := e.entity(id)
		if v == nil || !v.Landed {
			t.Fatal("combined workload lost or stranded returning aircraft", id)
		}
	}
	sort.Slice(measurements, func(i, j int) bool { return measurements[i] < measurements[j] })
	p50, p95, p99 := measurements[300], measurements[570], measurements[594]
	t.Logf("legal initial688 actors,64 simultaneous returns,332 mass-routed scouts,24 strategic missiles intercepted: p50=%s p95=%s p99=%s; native host only", p50, p95, p99)
	if p95 > 25*time.Millisecond || p99 > 40*time.Millisecond {
		t.Fatal("combined native tick budget exceeded")
	}
}
