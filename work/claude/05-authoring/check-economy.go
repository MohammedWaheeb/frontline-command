//go:build ignore

// Actual Go harvest measurement on unchanged shipping maps. Prepared symmetric
// economies isolate supply loading routes; this is not an opening-build test.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"math"
	"os"
)

type routeRecord struct {
	Map             string        `json:"map"`
	Spawn           int           `json:"spawn"`
	Field           uint32        `json:"field"`
	Supply          sim.Vec       `json:"requested_supply"`
	ActualSupply    sim.Vec       `json:"actual_supply"`
	IncomeMilli     int64         `json:"income_millicredits"`
	Deliveries      int           `json:"deliveries"`
	IncomeAtSeconds map[int]int64 `json:"income_at_seconds"`
}

func economyMust(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	radial := flag.Bool("radial", true, "use radial rather than identically oriented supply placement")
	flag.Parse()
	c, err := content.Base()
	economyMust(err)
	records := []routeRecord{}
	for _, id := range []string{"copper-junction", "relay-heights", "dry-river", "industrial-valley", "border-depots", "port-outskirts"} {
		b, err := os.ReadFile("content/maps/" + id + ".json")
		economyMust(err)
		m, err := content.DecodeMap(b)
		economyMust(err)
		for pair := 0; pair < len(m.Spawns); pair += 2 {
			def := content.Mission{ID: "measured-supply-routes", Version: "1", Title: "Prepared economy measurement", MapID: m.ID, Faction: "US", Mode: "coop", Objectives: []content.MissionObjective{{ID: "measurement", Text: "Continue measurement", Condition: content.MissionCondition{Kind: "timer", Tick: 108000}}}}
			rr := []routeRecord{}
			for j := 0; j < 2; j++ {
				start := m.Spawns[pair+j].Position
				field := m.Fields[0]
				best := math.Inf(1)
				for _, f := range m.Fields {
					if f.Credits != 36000000 {
						continue
					}
					distance := math.Hypot(float64(f.Position.X-start.X), float64(f.Position.Y-start.Y))
					if distance < best {
						best = distance
						field = f
					}
				}
				dx, dy := float64(field.Position.X-start.X), float64(field.Position.Y-start.Y)
				sx, sy := dx/best, dy/best
				at := func(a, b float64) content.Point {
					return content.Point{X: int32(math.Round((float64(start.X)+sx*a-sy*b)/1000))*1000 + 500, Y: int32(math.Round((float64(start.Y)+sy*a+sx*b)/1000))*1000 + 500}
				}
				owner := uint32(j + 1)
				def.Players = append(def.Players, content.MissionPlayer{ID: owner, Faction: "US", Name: fmt.Sprintf("Spawn%d", pair+j+1), Team: 1, Controller: "human"})
				supply := at(5500, 0)
				haulerA, haulerB := at(6500, 4000), at(6500, -4000)
				if !*radial {
					supply = content.Point{X: field.Position.X, Y: field.Position.Y + 5000}
					haulerA = content.Point{X: field.Position.X - 4000, Y: field.Position.Y + 8000}
					haulerB = content.Point{X: field.Position.X + 4000, Y: field.Position.Y + 8000}
				}
				def.Initial = append(def.Initial, content.MissionSpawn{Tag: fmt.Sprintf("hq-%d", owner), Type: "hq", Owner: owner, Count: 1, Position: start}, content.MissionSpawn{Tag: fmt.Sprintf("power-%d", owner), Type: "power", Owner: owner, Count: 1, Position: at(-5000, -4500)}, content.MissionSpawn{Tag: fmt.Sprintf("supply-%d", owner), Type: "supply", Owner: owner, Count: 1, Position: supply}, content.MissionSpawn{Tag: fmt.Sprintf("hauler-%d-a", owner), Type: "US.hauler", Owner: owner, Count: 1, Position: haulerA}, content.MissionSpawn{Tag: fmt.Sprintf("hauler-%d-b", owner), Type: "US.hauler", Owner: owner, Count: 1, Position: haulerB})
				rr = append(rr, routeRecord{Map: id, Spawn: pair + j + 1, Field: field.ID, Supply: supply, IncomeAtSeconds: map[int]int64{}})
			}
			e, err := sim.NewMission(c, m, def, "normal", 1)
			if err != nil {
				panic(fmt.Sprintf("%s pair%d: %v", id, pair, err))
			}
			for e.Tick() < 100 {
				e.Advance()
			}
			s := e.StateCopy()
			for j := 0; j < 2; j++ {
				for _, v := range s.Entities {
					if v.Owner == sim.PlayerID(j+1) && v.Type == "supply" {
						rr[j].ActualSupply = v.Position
					}
				}
				ids := []sim.ID{}
				for _, v := range s.Entities {
					if v.Owner == sim.PlayerID(j+1) && v.Type == "US.hauler" {
						ids = append(ids, v.ID)
					}
				}
				economyMust(e.Submit(sim.PlayerID(j+1), 1, []sim.Order{{Kind: "gather", Entities: ids, Target: sim.ID(rr[j].Field)}}))
			}
			for e.Tick() < 12100 {
				e.Advance()
				if e.Tick() == 103 {
					fmt.Fprintf(os.Stderr, "%s pair%d orders %+v\n", id, pair, e.StateCopy().Results)
				}
				if e.Tick()%20 != 0 {
					continue
				}
				s = e.StateCopy()
				for j, p := range s.Players {
					rr[j].IncomeMilli = p.Income
					if (int(e.Tick())-100)%1200 == 0 {
						rr[j].IncomeAtSeconds[(int(e.Tick())-100)/20] = p.Income
					}
				}
			}
			s = e.StateCopy()
			for j, p := range s.Players {
				if p.Income == 0 {
					diagnostic, _ := json.MarshalIndent(s, "", "  ")
					os.WriteFile("work/claude/05-authoring/evidence/zero-income-state.json", diagnostic, 0644)
				}
				rr[j].IncomeMilli = p.Income
				rr[j].Deliveries = int(p.Income / 600000)
				records = append(records, rr[j])
				fmt.Printf("%s spawn%d: %.0f credits in600s, %+v\n", id, rr[j].Spawn, float64(p.Income)/1000, rr[j].IncomeAtSeconds)
			}
		}
	}
	b, err := json.MarshalIndent(records, "", "  ")
	economyMust(err)
	filename := "economy-aligned.json"
	if *radial {
		filename = "economy-radial.json"
	}
	economyMust(os.WriteFile("work/claude/05-authoring/evidence/"+filename, append(b, '\n'), 0644))
}
