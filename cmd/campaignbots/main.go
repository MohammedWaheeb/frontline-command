// campaignbots plays every campaign mission headlessly with randomized
// bot commanders and reports whether each mission loads, runs fast,
// accepts orders, saves/restores and makes progress under many play styles.
//
// Usage:
//
//	go run ./cmd/campaignbots -ticks 12000 -seeds 3 -workers 8 \
//	  -out work/campaign-bot-sweep/report.md -json work/campaign-bot-sweep/report.json
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"frontlinecommand/internal/botsweep"
	"frontlinecommand/pkg/sim"
)

func csv(value string, all []string) ([]string, error) {
	if value == "all" || value == "" {
		return all, nil
	}
	var out []string
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		found := false
		for _, candidate := range all {
			if candidate == item {
				found = true
			}
		}
		if !found {
			return nil, fmt.Errorf("%q is not one of %v", item, all)
		}
		out = append(out, item)
	}
	return out, nil
}

func main() {
	contentDir := flag.String("content", "content", "content directory")
	missionsFlag := flag.String("missions", "all", "all or comma-separated campaign mission ids")
	botsFlag := flag.String("bots", "all", "all or comma-separated bot names")
	difficultyFlag := flag.String("difficulties", "rotate", "rotate (cycle easy/normal/hard per run) or one difficulty")
	seeds := flag.Int("seeds", 3, "random bot seeds per mission/bot combination")
	seedBase := flag.Uint64("seed-base", 19027, "first simulation/bot seed")
	ticks := flag.Int("ticks", 12000, "maximum ticks per run (20 ticks = 1 game second)")
	workers := flag.Int("workers", runtime.NumCPU(), "parallel runs")
	outMD := flag.String("out", "", "optional Markdown report path")
	outJSON := flag.String("json", "", "optional JSON report path")
	failOn := flag.String("fail-on", "error", "exit nonzero on: error, stalled, or none")
	flag.Parse()

	refs, err := botsweep.CampaignMissions(*contentDir)
	if err != nil {
		log.Fatal(err)
	}
	allIDs := make([]string, 0, len(refs))
	for _, ref := range refs {
		allIDs = append(allIDs, ref.ID)
	}
	missionIDs, err := csv(*missionsFlag, allIDs)
	if err != nil {
		log.Fatal(err)
	}
	botNames, err := csv(*botsFlag, botsweep.Names())
	if err != nil {
		log.Fatal(err)
	}
	difficulties := []string{"easy", "normal", "hard"}
	if *difficultyFlag != "rotate" {
		ok := false
		for _, d := range difficulties {
			ok = ok || d == *difficultyFlag
		}
		if !ok {
			log.Fatalf("-difficulties must be rotate, easy, normal or hard")
		}
		difficulties = []string{*difficultyFlag}
	}

	var configs []botsweep.Config
	for _, mission := range missionIDs {
		for _, bot := range botNames {
			for s := 0; s < *seeds; s++ {
				configs = append(configs, botsweep.Config{
					ContentDir:       *contentDir,
					MissionID:        mission,
					Difficulty:       difficulties[len(configs)%len(difficulties)],
					Bot:              bot,
					Seed:             *seedBase + uint64(s)*7919,
					BotSeed:          *seedBase + uint64(s)*104729 + uint64(len(configs)),
					MaxTicks:         sim.Tick(*ticks),
					DecisionInterval: 20,
					CheckSaveRestore: true,
				})
			}
		}
	}

	fmt.Printf("campaign bot sweep: %d missions x %d bots x %d seeds = %d runs, <= %d ticks each, %d workers\n",
		len(missionIDs), len(botNames), *seeds, len(configs), *ticks, *workers)
	started := time.Now()
	var mutex sync.Mutex
	completed := 0
	results, err := botsweep.RunAll(configs, *workers, func(r botsweep.Result) {
		mutex.Lock()
		completed++
		fmt.Printf("[%d/%d] %-28s %-6s %-9s seed=%-8d %-17s ticks=%-6d %dms obj=%d/%d orders=%d/%d\n",
			completed, len(configs), r.Mission, r.Difficulty, r.Bot, r.BotSeed, r.Verdict, r.Ticks, r.WallMS,
			r.ObjectivesComplete, r.ObjectivesTotal, r.OrdersAccepted, r.OrdersIssued)
		mutex.Unlock()
	})
	if err != nil {
		log.Fatal(err)
	}
	elapsed := time.Since(started)
	sort.Slice(results, func(i, j int) bool {
		if results[i].Faction != results[j].Faction {
			return results[i].Faction < results[j].Faction
		}
		if results[i].Mission != results[j].Mission {
			return results[i].Mission < results[j].Mission
		}
		if results[i].Bot != results[j].Bot {
			return results[i].Bot < results[j].Bot
		}
		return results[i].BotSeed < results[j].BotSeed
	})

	report := buildReport(results, elapsed, *ticks)
	fmt.Println(report)
	if *outMD != "" {
		if err := os.MkdirAll(filepath.Dir(*outMD), 0755); err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(*outMD, []byte(report), 0644); err != nil {
			log.Fatal(err)
		}
	}
	if *outJSON != "" {
		data, err := json.MarshalIndent(results, "", "  ")
		if err != nil {
			log.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(*outJSON), 0755); err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(*outJSON, data, 0644); err != nil {
			log.Fatal(err)
		}
	}

	bad := 0
	for _, r := range results {
		if r.Verdict == botsweep.VerdictError || *failOn == "stalled" && r.Verdict == botsweep.VerdictTimeoutStalled {
			bad++
		}
	}
	if bad > 0 && *failOn != "none" {
		log.Fatalf("%d runs failed the -fail-on=%s gate", bad, *failOn)
	}
}

func counts(results []botsweep.Result, key func(botsweep.Result) string) map[string]map[string]int {
	out := map[string]map[string]int{}
	for _, r := range results {
		k := key(r)
		if out[k] == nil {
			out[k] = map[string]int{}
		}
		out[k][r.Verdict]++
		out[k]["total"]++
	}
	return out
}

func buildReport(results []botsweep.Result, elapsed time.Duration, ticks int) string {
	var b strings.Builder
	verdicts := counts(results, func(botsweep.Result) string { return "all" })["all"]
	var totalTicks, totalWall int64
	saveChecked, saveOK := 0, 0
	for _, r := range results {
		totalTicks += int64(r.Ticks)
		totalWall += r.WallMS
		if r.SaveRestoreChecked {
			saveChecked++
		}
		if r.SaveRestoreChecked && r.SaveRestoreOK {
			saveOK++
		}
	}
	fmt.Fprintf(&b, "# Campaign bot sweep report\n\n")
	fmt.Fprintf(&b, "Runs: %d. Tick budget per run: %d. Wall time: %s. Simulated ticks: %d (%.0f ticks/sec aggregate).\n\n",
		len(results), ticks, elapsed.Round(time.Second), totalTicks, float64(totalTicks)/elapsed.Seconds())
	fmt.Fprintf(&b, "Verdicts: win %d, loss %d, timeout-progress %d, timeout-stalled %d, error %d.\n\n",
		verdicts[botsweep.VerdictWin], verdicts[botsweep.VerdictLoss],
		verdicts[botsweep.VerdictTimeoutProgress], verdicts[botsweep.VerdictTimeoutStalled], verdicts[botsweep.VerdictError])
	fmt.Fprintf(&b, "Save/restore checks actually performed: %d/%d; hash matched: %d/%d.\n\n", saveChecked, len(results), saveOK, saveChecked)

	for _, section := range []struct {
		title string
		key   func(botsweep.Result) string
	}{
		{"By faction", func(r botsweep.Result) string { return r.Faction }},
		{"By bot", func(r botsweep.Result) string { return r.Bot }},
		{"By mission", func(r botsweep.Result) string { return r.Faction + " " + r.Mission }},
	} {
		data := counts(results, section.key)
		keys := make([]string, 0, len(data))
		for k := range data {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		fmt.Fprintf(&b, "## %s\n\n", section.title)
		fmt.Fprintf(&b, "| | runs | win | loss | timeout-progress | timeout-stalled | error |\n|---|---:|---:|---:|---:|---:|---:|\n")
		for _, k := range keys {
			v := data[k]
			fmt.Fprintf(&b, "| %s | %d | %d | %d | %d | %d | %d |\n", k, v["total"],
				v[botsweep.VerdictWin], v[botsweep.VerdictLoss],
				v[botsweep.VerdictTimeoutProgress], v[botsweep.VerdictTimeoutStalled], v[botsweep.VerdictError])
		}
		b.WriteString("\n")
	}

	fmt.Fprintf(&b, "## Errors and stalls\n\n")
	problems := 0
	for _, r := range results {
		if r.Verdict == botsweep.VerdictError || r.Verdict == botsweep.VerdictTimeoutStalled {
			problems++
			fmt.Fprintf(&b, "- %s (%s, %s, bot %s, bot seed %d): %s. %s\n",
				r.Mission, r.Faction, r.Difficulty, r.Bot, r.BotSeed, r.Verdict, r.Error)
		}
	}
	if problems == 0 {
		b.WriteString("None.\n")
	}
	fmt.Fprintf(&b, "\n## Bot wins\n\n")
	wins := 0
	for _, r := range results {
		if r.Verdict == botsweep.VerdictWin {
			wins++
			fmt.Fprintf(&b, "- %s (%s, %s) by bot %s, bot seed %d, at tick %d.\n", r.Mission, r.Faction, r.Difficulty, r.Bot, r.BotSeed, r.Ticks)
		}
	}
	if wins == 0 {
		b.WriteString("None in this sweep.\n")
	}
	return b.String()
}
