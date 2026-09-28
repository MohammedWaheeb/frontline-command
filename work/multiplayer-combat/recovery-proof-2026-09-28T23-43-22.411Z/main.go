// Test-only recovery branch from an exact earned replay. No state edits.
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
	"strings"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func writeJSON(path string, v any) {
	b, e := json.MarshalIndent(v, "", "  ")
	must(e)
	must(os.WriteFile(path, append(b, '\n'), 0644))
}
func view(e *sim.Engine, p sim.PlayerID) sim.View {
	v, ok := e.PlayerView(p)
	if !ok {
		panic("missing owner view")
	}
	return v
}
func entity(v sim.View, id sim.ID) *sim.EntityView {
	for i := range v.Entities {
		if v.Entities[i].ID == id {
			return &v.Entities[i]
		}
	}
	return nil
}
func save(e *sim.Engine, path string) []byte {
	b, err := e.Save()
	must(err)
	must(os.WriteFile(path, b, 0644))
	return b
}
func accepted(e *sim.Engine, p sim.PlayerID, seq uint32) {
	f, ok := e.PlayerFeedback(p)
	if !ok {
		panic("feedback absent")
	}
	for _, r := range f.Results {
		if r.Sequence == seq {
			if !r.Accepted {
				panic(r.Code)
			}
			return
		}
	}
	panic("execution receipt absent")
}

func branch(c *content.Catalog, raw []byte, player sim.PlayerID, factory sim.ID, faction, dir string) bool {
	must(os.MkdirAll(dir, 0755))
	e, err := sim.Restore(c, raw)
	must(err)
	must(os.WriteFile(filepath.Join(dir, "initial.save.json"), raw, 0644))
	writeJSON(filepath.Join(dir, "initial-owner-view.json"), view(e, player))
	record, err := sim.NewReplay(e)
	must(err)
	result := map[string]any{"initial_tick": e.Tick(), "initial_hash": e.Hash(), "player": player, "factory": factory, "scope": "Narrow ordinary-order branch from an earned replay. Existing orders remain; no further enemy commander inputs, state edits, free resources or victory claim."}
	defer func() { writeJSON(filepath.Join(dir, "result.json"), result) }()
	cancels := []any{}
	for len(entity(view(e, player), factory).Private.Jobs) > 0 {
		before := view(e, player)
		f := entity(before, factory)
		j := f.Private.Jobs[0]
		if j.Emergency || f.State != "prerequisite_lost" || !f.Enabled {
			result["failure"] = "candidate no longer has an ordinary blocked head"
			return false
		}
		controlRaw, err := e.Save()
		must(err)
		control, err := sim.Restore(c, controlRaw)
		must(err)
		seq := before.Economy.LastSequence + 1
		order := sim.Order{Kind: "cancel", Entities: []sim.ID{factory}, Index: 0}
		must(e.Submit(player, seq, []sim.Order{order}))
		e.Advance()
		control.Advance()
		accepted(e, player, seq)
		must(record.Capture(e, false))
		refund := int64(0)
		if j.Started && j.Required > 0 {
			refund = j.Paid * 3 * int64(j.Required-j.Work) / (4 * int64(j.Required))
		}
		actual := view(e, player).Economy.Credits - view(control, player).Economy.Credits
		if actual != refund {
			panic(fmt.Sprintf("cancel refund mismatch: %d != %d", actual, refund))
		}
		cancels = append(cancels, map[string]any{"tick": e.Tick(), "sequence": seq, "order": order, "job": j, "refund_milli": actual})
		if entity(view(e, player), factory) == nil {
			result["failure"] = "factory destroyed during ordinary cancellation"
			return false
		}
	}
	result["cancellations"] = cancels
	postCancel := save(e, filepath.Join(dir, "after-cancel.save.json"))
	writeJSON(filepath.Join(dir, "after-cancel-owner-view.json"), view(e, player))
	control, err := sim.Restore(c, postCancel)
	must(err)
	seq := view(e, player).Economy.LastSequence + 1
	order := sim.Order{Kind: "train", Entities: []sim.ID{factory}, Type: faction + ".rig"}
	must(e.Submit(player, seq, []sim.Order{order}))
	e.Advance()
	control.Advance()
	accepted(e, player, seq)
	must(record.Capture(e, false))
	f := entity(view(e, player), factory)
	if f == nil || f.Private == nil || len(f.Private.Jobs) != 1 {
		result["failure"] = "emergency job did not remain queued"
		return false
	}
	j := f.Private.Jobs[0]
	paid := view(control, player).Economy.Credits - view(e, player).Economy.Credits
	if !j.Emergency || !j.Started || j.Paid != 1200000 || paid != j.Paid || j.Required != 1200 {
		panic("unexpected authoritative emergency job/cost")
	}
	result["emergency_order"] = map[string]any{"sequence": seq, "order": order, "tick": e.Tick(), "paid_milli": paid, "job": j}
	save(e, filepath.Join(dir, "paid-job.save.json"))
	writeJSON(filepath.Join(dir, "paid-job-owner-view.json"), view(e, player))
	var midpoint *sim.Engine
	start := e.Tick()
	for e.Tick()-start < 1500 && !e.Outcome().Finished {
		e.Advance()
		if midpoint != nil {
			midpoint.Advance()
		}
		if (e.Tick()-start)%20 == 0 {
			must(record.Capture(e, false))
		}
		if e.Tick()-start == 600 {
			b := save(e, filepath.Join(dir, "midpoint.save.json"))
			midpoint, err = sim.Restore(c, b)
			must(err)
			if midpoint.Hash() != e.Hash() {
				panic("midpoint restore mismatch")
			}
			result["midpoint_hash"] = e.Hash()
			result["midpoint_tick"] = e.Tick()
		}
		feedback, _ := e.PlayerFeedback(player)
		for _, event := range feedback.Events {
			if event.Kind == "emergency_rig_ready" && event.Owner == player {
				v := view(e, player)
				found := false
				for _, unit := range v.Entities {
					if unit.Owner == player && unit.Type == faction+".rig" && unit.Health > 0 {
						found = true
					}
				}
				if !found {
					panic("ready event without actual owned rig")
				}
				if midpoint == nil || midpoint.Hash() != e.Hash() {
					panic("continued restore hash mismatch")
				}
				must(record.Capture(e, true))
				data, err := record.Encode()
				must(err)
				must(os.WriteFile(filepath.Join(dir, "recovery.replay.gz"), data, 0644))
				check := *record
				check.Checkpoints = nil
				replayed, err := check.Seek(c, e.Tick())
				must(err)
				if replayed.Hash() != e.Hash() {
					panic("branch replay mismatch")
				}
				save(e, filepath.Join(dir, "final.save.json"))
				writeJSON(filepath.Join(dir, "final-owner-view.json"), v)
				result["success"] = true
				result["completion_event"] = event
				result["final_tick"] = e.Tick()
				result["final_hash"] = e.Hash()
				result["replay_sha256"] = digest(data)
				result["full_replay_and_midpoint_restore_equal"] = true
				return true
			}
		}
		if entity(view(e, player), factory) == nil {
			result["failure"] = "factory destroyed before recovery completion"
			return false
		}
	}
	result["failure"] = "no actual completed emergency rig within bounded branch"
	return false
}

func main() {
	file := flag.String("replay", "", "Exact earned replay")
	out := flag.String("out", "", "New evidence directory")
	allowRig := flag.Bool("allow-existing-rig", false, "Prove Go queue mechanics even when the source owner already has a rig; not an exact commander-trigger proof")
	flag.Parse()
	if err := os.Mkdir(*out, 0755); err != nil {
		panic(err)
	}
	data, err := os.ReadFile(*file)
	must(err)
	r, err := sim.DecodeReplay(data)
	must(err)
	c := content.MustBase()
	initial, err := sim.Restore(c, r.Initial)
	must(err)
	participants := initial.StateCopy().Players
	full := *r
	full.Checkpoints = nil
	p, err := full.Open(c, initial.Tick())
	must(err)
	tried := map[string]bool{}
	attempts := 0
	for !p.Finished() {
		must(p.Advance())
		e := p.Engine()
		if e.Tick()%20 != 0 {
			continue
		}
		for _, owner := range participants {
			v := view(e, owner.ID)
			hasBase := false
			for _, unit := range v.Entities {
				if unit.Owner == owner.ID && unit.Health > 0 && (unit.Type == "hq" || (!*allowRig && strings.HasSuffix(unit.Type, ".rig"))) {
					hasBase = true
				}
			}
			if hasBase {
				continue
			}
			for _, f := range v.Entities {
				if f.Owner != owner.ID || f.Type != "factory" || !f.Complete || !f.Enabled || f.State != "prerequisite_lost" || f.Private == nil || len(f.Private.Jobs) == 0 || f.Private.Jobs[0].Emergency {
					continue
				}
				j := f.Private.Jobs[0]
				refund := int64(0)
				if j.Started && j.Required > 0 {
					refund = j.Paid * 3 * int64(j.Required-j.Work) / (4 * int64(j.Required))
				}
				if v.Economy.Credits+refund < 1200000 {
					continue
				}
				key := fmt.Sprintf("%d:%d:%d", owner.ID, f.ID, e.Tick()/2000)
				if tried[key] {
					continue
				}
				tried[key] = true
				attempts++
				raw, err := e.Save()
				must(err)
				dir := filepath.Join(*out, fmt.Sprintf("attempt-%02d-player-%d-tick-%d", attempts, owner.ID, e.Tick()))
				fmt.Printf("branch %s\n", dir)
				if branch(c, raw, owner.ID, f.ID, owner.Faction, dir) {
					writeJSON(filepath.Join(*out, "receipt.json"), map[string]any{"source_replay": *file, "source_replay_sha256": digest(data), "source_tick": e.Tick(), "source_hash": e.Hash(), "simulation": sim.Version, "attempts": attempts, "successful_branch": dir, "source_state_unmodified": true, "existing_rig_allowed": *allowRig})
					return
				}
			}
		}
	}
	writeJSON(filepath.Join(*out, "receipt.json"), map[string]any{"source_replay": *file, "source_replay_sha256": digest(data), "attempts": attempts, "success": false})
	panic("No surviving recovery branch found; preserved as failed proof")
}
