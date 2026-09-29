// contentcheck validates authored files with the same rules as live play.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

func main() {
	root := flag.String("content", "", "authored content directory; omit to check catalog and positional map files")
	release := flag.Bool("release", false, "require the complete base content inventory")
	flag.Parse()
	var err error
	if *root == "" && !*release {
		err = singleMaps(flag.Args())
	} else {
		if *root == "" {
			*root = "content"
		}
		if len(flag.Args()) > 0 {
			err = fmt.Errorf("choose -content or positional map files, not both")
		} else {
			err = check(*root, *release)
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "Content validation:", err)
		os.Exit(1)
	}
}

// Preserve the original catalog/positional-map CLI used by authoring checks.
func singleMaps(paths []string) error {
	c, err := content.Base()
	if err != nil {
		return err
	}
	fmt.Printf("Rules %s: %d units, %d buildings, %d upgrades; SHA-256 %s\n", content.Version, len(c.Units()), len(c.Buildings()), len(c.Upgrades()), c.Hash())
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		if info.Size() > 16<<20 {
			return fmt.Errorf("%s: map exceeds 16 MiB", path)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		m, err := content.DecodeMap(data)
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		fmt.Printf("Validated map %s (%dx%d, %d starts)\n", m.ID, m.Width, m.Height, len(m.Spawns))
	}
	return nil
}

func files(dir string, limit int64, visit func(string, []byte) error) error {
	count := 0
	return filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".json" {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlink content is not packaged: %s", path)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		count++
		if count > 256 || info.Size() > limit {
			return fmt.Errorf("content limit exceeded: %s", path)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err = visit(path, data); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		return nil
	})
}

func check(root string, release bool) error {
	catalog, err := content.Base()
	if err != nil {
		return err
	}
	maps := map[string]content.Map{}
	missions := map[string]content.Mission{}
	if err = files(filepath.Join(root, "maps"), 16<<20, func(_ string, data []byte) error {
		m, err := content.DecodeMap(data)
		if err != nil {
			return err
		}
		if _, ok := maps[m.ID]; ok {
			return fmt.Errorf("duplicate map ID %s", m.ID)
		}
		maps[m.ID] = m
		return nil
	}); err != nil {
		return err
	}
	if err = files(filepath.Join(root, "missions"), 2<<20, func(_ string, data []byte) error {
		var header struct {
			MapID string `json:"map_id"`
		}
		if err := json.Unmarshal(data, &header); err != nil {
			return err
		}
		m, ok := maps[header.MapID]
		if !ok {
			return fmt.Errorf("missing map %s", header.MapID)
		}
		mission, err := content.DecodeMission(data, catalog, m)
		if err != nil {
			return err
		}
		if _, ok := missions[mission.ID]; ok {
			return fmt.Errorf("duplicate mission ID %s", mission.ID)
		}
		factions := []string{""}
		if len(mission.TutorialVariants) > 0 {
			factions = nil
			for _, variant := range mission.TutorialVariants {
				factions = append(factions, variant.Faction)
			}
		}
		for _, faction := range factions {
			selected, err := mission.ForTutorialFaction(catalog, m, faction)
			if err != nil {
				return err
			}
			for _, difficulty := range []string{"easy", "normal", "hard"} {
				engine, err := sim.NewMission(catalog, m, selected, difficulty, 1)
				if err != nil {
					return fmt.Errorf("%s %s cannot launch: %w", mission.ID, difficulty, err)
				}
				save, err := engine.Save()
				if err != nil {
					return err
				}
				restored, err := sim.Restore(catalog, save)
				if err != nil {
					return fmt.Errorf("%s opening save: %w", mission.ID, err)
				}
				if engine.Hash() != restored.Hash() {
					return fmt.Errorf("%s opening save hash differs", mission.ID)
				}
			}
		}
		missions[mission.ID] = mission
		return nil
	}); err != nil {
		return err
	}
	if release {
		if err = complete(maps, missions); err != nil {
			return err
		}
		if err = launchIndex(root, maps, missions); err != nil {
			return err
		}
	}
	fmt.Printf("Validated %d maps and %d missions against content %s, simulation %s.\n", len(maps), len(missions), catalog.Hash(), sim.Version)
	fmt.Println("Schema/launch/save checks do not certify mission completion, balance, UI or art.")
	return nil
}

func complete(maps map[string]content.Map, missions map[string]content.Mission) error {
	counts := map[string]int{}
	campaigns := map[string]int{}
	for _, m := range missions {
		counts[m.Mode]++
		if m.Mode == "campaign" {
			campaigns[m.Faction]++
		}
		optional, failure, checkpoint := false, false, false
		for _, o := range m.Objectives {
			optional = optional || o.Optional
			failure = failure || o.Failure
		}
		for _, t := range m.Triggers {
			for _, a := range t.Actions {
				checkpoint = checkpoint || a.Kind == "checkpoint"
			}
		}
		if m.Briefing == "" || m.Debrief == "" || !optional || !failure || !checkpoint {
			return fmt.Errorf("%s needs briefing/debrief, optional objective, explicit failure and mid-mission checkpoint", m.ID)
		}
		difficulty := map[string]bool{}
		for _, d := range m.Difficulty {
			difficulty[d.ID] = true
		}
		if !difficulty["easy"] || !difficulty["normal"] || !difficulty["hard"] {
			return fmt.Errorf("%s needs all three declared difficulty profiles", m.ID)
		}
	}
	if counts["tutorial"] != 5 || counts["campaign"] != 24 || counts["coop"] != 2 {
		return fmt.Errorf("base release requires 5 tutorials, 24 campaign missions and 2 co-op scenarios; found %v", counts)
	}
	for _, f := range []string{"US", "IR", "SY", "SA"} {
		if campaigns[f] != 6 {
			return fmt.Errorf("%s campaign requires six missions, found %d", f, campaigns[f])
		}
	}
	if len(maps) < 8 {
		return fmt.Errorf("base release requires at least eight maps")
	}
	return nil
}

func launchIndex(root string, maps map[string]content.Map, missions map[string]content.Mission) error {
	var index struct {
		FormatVersion uint32   `json:"format_version"`
		LaunchMaps    []string `json:"launch_maps"`
	}
	data, err := os.ReadFile(filepath.Join(root, "release.json"))
	if err != nil {
		return err
	}
	if len(data) > 8192 {
		return fmt.Errorf("release index exceeds 8 KiB")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&index); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return fmt.Errorf("trailing release index data")
	}
	if index.FormatVersion != 1 || len(index.LaunchMaps) != 8 {
		return fmt.Errorf("release index needs format_version 1 and eight distinct launch_maps")
	}
	expected := map[string]int{"Copper Junction": 2, "Relay Heights": 2, "Dry River": 2, "Industrial Valley": 4, "Border Depots": 4, "Port Outskirts": 4, "Convoy Union": 0, "Twin Outposts": 0}
	seen := map[string]bool{}
	titles := map[string]bool{}
	coop := map[string]bool{}
	for _, m := range missions {
		if m.Mode == "coop" {
			coop[m.MapID] = true
		}
	}
	for _, id := range index.LaunchMaps {
		m, ok := maps[id]
		players, known := expected[m.Title]
		if !ok || seen[id] || !known || titles[m.Title] {
			return fmt.Errorf("launch map %s is missing, repeated, or has an unexpected design title", id)
		}
		seen[id] = true
		titles[m.Title] = true
		if players > 0 && len(m.Spawns) != players || players == 0 && !coop[id] {
			return fmt.Errorf("launch map %s has wrong player count or no co-op scenario", id)
		}
	}
	campaignMaps := map[string]bool{}
	for _, m := range missions {
		if m.Mode == "campaign" {
			if seen[m.MapID] || campaignMaps[m.MapID] {
				return fmt.Errorf("campaign %s needs its own authored layout in addition to the launch maps", m.ID)
			}
			campaignMaps[m.MapID] = true
		}
	}
	return nil
}
