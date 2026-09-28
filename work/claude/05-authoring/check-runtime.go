//go:build ignore

// Isolated authored-content audit; not a replacement for objective playthroughs.
package main

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"sort"
)

type record struct {
	ID            string               `json:"id"`
	Difficulty    string               `json:"difficulty"`
	Faction       string               `json:"faction"`
	Tick          sim.Tick             `json:"tick"`
	Outcome       sim.Outcome          `json:"outcome"`
	Missing       []string             `json:"missing_initial_tags"`
	Objectives    []sim.ObjectiveState `json:"objectives"`
	Checkpoint    string               `json:"checkpoint"`
	Hash          string               `json:"hash"`
	RestoredEqual bool                 `json:"restored_equal"`
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	c, err := content.Base()
	must(err)
	paths, err := filepath.Glob("content/missions/*.json")
	must(err)
	sort.Strings(paths)
	records := []record{}
	for _, path := range paths {
		b, err := os.ReadFile(path)
		must(err)
		var head struct {
			MapID string `json:"map_id"`
		}
		must(json.Unmarshal(b, &head))
		mb, err := os.ReadFile("content/maps/" + head.MapID + ".json")
		must(err)
		m, err := content.DecodeMap(mb)
		must(err)
		def, err := content.DecodeMission(b, c, m)
		must(err)
		factions := []string{""}
		if len(def.TutorialVariants) > 0 {
			factions = nil
			for _, v := range def.TutorialVariants {
				factions = append(factions, v.Faction)
			}
		}
		for _, faction := range factions {
			selected, err := def.ForTutorialFaction(c, m, faction)
			must(err)
			for _, difficulty := range []string{"easy", "normal", "hard"} {
				e, err := sim.NewMission(c, m, selected, difficulty, 1)
				must(err)
				for e.Tick() < 350 && !e.Outcome().Finished {
					e.Advance()
				}
				save, err := e.Save()
				must(err)
				restored, err := sim.Restore(c, save)
				must(err)
				for e.Tick() < 700 && !e.Outcome().Finished {
					e.Advance()
					restored.Advance()
				}
				s := e.StateCopy()
				alive := map[string]bool{}
				for _, v := range s.Entities {
					if v.HP > 0 {
						alive[v.Tag] = true
					}
				}
				missing := []string{}
				for _, g := range selected.Initial {
					selected := len(g.Difficulties) == 0
					for _, d := range g.Difficulties {
						selected = selected || d == difficulty
					}
					if selected && !alive[g.Tag] {
						missing = append(missing, g.Tag)
					}
				}
				r := record{def.ID, difficulty, selected.Faction, e.Tick(), e.Outcome(), missing, s.Mission.Objectives, s.Mission.Checkpoint, e.Hash(), e.Hash() == restored.Hash()}
				records = append(records, r)
				fmt.Printf("%s %-6s tick%d terminal=%v missing=%v restore=%v\n", def.ID, difficulty, e.Tick(), e.Outcome().Finished, missing, r.RestoredEqual)
				if e.Tick() != 700 || e.Outcome().Finished || len(missing) != 0 {
					panic("unexpected opening outcome or missing original group; inspect scenario")
				}
				if !r.RestoredEqual {
					panic("restore diverged")
				}
			}
		}
	}
	out, err := json.MarshalIndent(records, "", "  ")
	must(err)
	must(os.WriteFile("work/claude/05-authoring/evidence/early-runtime.json", append(out, '\n'), 0644))
}
