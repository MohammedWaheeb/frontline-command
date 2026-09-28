// Offline verification only. Imports the frozen candidate without editing it.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	"os"
	"path/filepath"
	"strconv"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	file := flag.String("replay", "", "Exact host replay bytes")
	output := flag.String("out", "", "Evidence directory")
	describe := flag.Bool("describe", false, "Print the verifier contract without starting a replay")
	flag.Parse()
	if *describe {
		encoded, err := json.Marshal(map[string]any{"simulation": sim.Version, "content_hash": content.MustBase().Hash(), "initial_countdown_ticks": true, "verification": "initial/checkpoint/midpoint-restored"})
		must(err)
		fmt.Println(string(encoded))
		return
	}
	data, err := os.ReadFile(*file)
	must(err)
	replay, err := sim.DecodeReplay(data)
	must(err)
	catalog := content.MustBase()
	initial, err := sim.Restore(catalog, replay.Initial)
	must(err)
	indexed, err := replay.Seek(catalog, replay.FinalTick)
	must(err)
	full := *replay
	full.Checkpoints = nil
	playback, err := full.Open(catalog, initial.Tick())
	must(err)
	midpoint := initial.Tick() + (replay.FinalTick-initial.Tick())/2
	var midpointSave []byte
	var midpointHash string
	eventKinds := map[string]int{}
	seenEvents := map[uint32]bool{}
	initialState := initial.StateCopy()
	if initialState.Mission != nil || initialState.Metadata.Ruleset != "standard-v2" {
		panic("not a standard non-mission start")
	}
	participants := initialState.Players
	for _, p := range participants {
		if p.Credits != 6000000 {
			panic("nonstandard starting credits")
		}
	}
	for !playback.Finished() {
		must(playback.Advance())
		e := playback.Engine()
		if e.Tick() == midpoint {
			midpointSave, err = e.Save()
			must(err)
			midpointHash = e.Hash()
		}
		for _, participant := range participants {
			feedback, _ := e.PlayerFeedback(participant.ID)
			for _, event := range feedback.Events {
				if !seenEvents[event.ID] {
					seenEvents[event.ID] = true
					eventKinds[event.Kind]++
				}
			}
		}
	}
	final := playback.Engine()
	if final.Hash() != indexed.Hash() {
		panic("full replay / final checkpoint hash mismatch")
	}
	if !final.Outcome().Finished || final.Outcome().Reason != "elimination" || final.Outcome().Draw {
		panic("not ordinary decisive elimination")
	}
	restored, err := sim.Restore(catalog, midpointSave)
	must(err)
	if restored.Hash() != midpointHash {
		panic("midpoint restore mismatch")
	}
	resumed := *replay
	resumed.Initial = midpointSave
	resumed.Checkpoints = nil
	continued, err := resumed.Seek(catalog, replay.FinalTick)
	must(err)
	if continued.Hash() != final.Hash() {
		panic("midpoint-to-result replay mismatch")
	}
	commands := map[sim.PlayerID]map[string]int{}
	var offset uint64
	for {
		page, next, err := replay.CommandPage(offset, 1000)
		must(err)
		for _, batch := range page {
			if commands[batch.Player] == nil {
				commands[batch.Player] = map[string]int{}
			}
			for _, order := range batch.Orders {
				if order.Kind == "surrender" || order.Kind == "surrender_vote" || order.Kind == "practice" {
					panic("forbidden acceptance acceleration")
				}
				commands[batch.Player][order.Kind]++
			}
		}
		if next == 0 {
			break
		}
		offset = next
	}
	state := final.StateCopy()
	players := []any{}
	for _, p := range state.Players {
		if p.Income <= 0 || p.Spent <= 0 || commands[p.ID]["train"] == 0 || commands[p.ID]["build"] == 0 {
			panic("participant lacked actual paid economy/production")
		}
		players = append(players, map[string]any{"id": p.ID, "faction": p.Faction, "team": p.Team, "ai": p.AI, "spent_milli": p.Spent, "income_milli": p.Income, "lost_milli": p.Lost, "kills": p.Kills, "defeated": p.Defeated, "orders": commands[p.ID]})
	}
	must(os.MkdirAll(*output, 0755))
	must(os.WriteFile(filepath.Join(*output, "midpoint.save.json"), midpointSave, 0644))
	finalSave, err := final.Save()
	must(err)
	must(os.WriteFile(filepath.Join(*output, "final.save.json"), finalSave, 0644))
	digest := sha256.Sum256(data)
	result := map[string]any{"simulation": sim.Version, "seed_uint64": strconv.FormatUint(replay.Metadata.Seed, 10), "replay_sha256": hex.EncodeToString(digest[:]), "initial_tick": initial.Tick(), "initial_countdown_ticks": initialState.Countdown, "midpoint_tick": midpoint, "final_tick": final.Tick(), "midpoint_hash": midpointHash, "final_hash": final.Hash(), "full_checkpoint_and_resumed_hashes_equal": true, "map_id": state.Map.ID, "outcome": final.Outcome(), "players": players, "events": eventKinds, "telemetry": state.Telemetry, "lobby": replay.LobbyInfo(), "scope": "Actual host orders replayed from initial state; ordinary paid production and combat, no fixture mutations. Save/restore verification is offline, not live multiplayer checkpoint resume."}
	encoded, err := json.MarshalIndent(result, "", "  ")
	must(err)
	must(os.WriteFile(filepath.Join(*output, "audit.json"), encoded, 0644))
	fmt.Println(string(encoded))
}
