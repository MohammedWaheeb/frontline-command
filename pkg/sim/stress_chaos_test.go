package sim

// Stress agent C: chaos orders + save/restore fuzz. Gated by STRESS=1.
// Run: STRESS=1 go test ./pkg/sim/ -run TestStressChaos -count=1 -timeout 1800s -v

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"testing"
	"time"

	"frontlinecommand/pkg/content"
)

type agentCIssues struct {
	list []string
}

func (a *agentCIssues) add(format string, args ...any) {
	if len(a.list) < 200 {
		a.list = append(a.list, fmt.Sprintf(format, args...))
	}
}
func (a *agentCIssues) panicf(where string, tick Tick, r any) {
	a.add("PANIC %s tick=%d: %v", where, tick, r)
}

// --- panic-safe wrappers -------------------------------------------------

func agentCSafeAdvance(e *Engine) (panicked any) {
	defer func() { panicked = recover() }()
	e.Advance()
	return nil
}

func agentCSafeSubmit(e *Engine, p PlayerID, seq uint32, orders []Order) (err error, panicked any) {
	defer func() { panicked = recover() }()
	err = e.Submit(p, seq, orders)
	return err, nil
}

func agentCSafeSave(e *Engine) (data []byte, err error, panicked any) {
	defer func() { panicked = recover() }()
	data, err = e.Save()
	return data, err, nil
}

func agentCSafeRestore(c *content.Catalog, data []byte) (re *Engine, err error, panicked any) {
	defer func() { panicked = recover() }()
	re, err = Restore(c, data)
	return re, err, nil
}

// --- shared checks -------------------------------------------------------

func agentCInvariants(e *Engine, iss *agentCIssues, where string) {
	for _, p := range e.state.Players {
		if p == nil {
			iss.add("%s tick=%d: nil player", where, e.Tick())
			continue
		}
		if p.Credits < 0 || p.Credits > 1000000000000 {
			iss.add("%s tick=%d p%d credits out of range: %d", where, e.Tick(), p.ID, p.Credits)
		}
		if p.Supply < 0 || p.ReservedSupply < 0 || p.Supply > 100000 || p.ReservedSupply > 100000 {
			iss.add("%s tick=%d p%d supply invariant: supply=%d reserved=%d", where, e.Tick(), p.ID, p.Supply, p.ReservedSupply)
		}
		if p.Energy < 0 || p.Energy > 100000 {
			iss.add("%s tick=%d p%d energy out of range: %d", where, e.Tick(), p.ID, p.Energy)
		}
	}
	if len(e.state.Entities) > 4096 {
		iss.add("%s tick=%d: entity count %d > 4096", where, e.Tick(), len(e.state.Entities))
	}
	for _, v := range e.state.Entities {
		if v == nil {
			iss.add("%s tick=%d: nil entity", where, e.Tick())
			continue
		}
		if v.HP < 0 || v.HP > v.MaxHP || v.MaxHP <= 0 {
			iss.add("%s tick=%d: entity %d (%s) HP invariant HP=%d MaxHP=%d", where, e.Tick(), v.ID, v.Type, v.HP, v.MaxHP)
		}
		if !e.state.Map.InBounds(v.Position) {
			iss.add("%s tick=%d: entity %d (%s) out of bounds at %+v", where, e.Tick(), v.ID, v.Type, v.Position)
		}
		if len(v.Orders) > 12 || len(v.Jobs) > 6 {
			iss.add("%s tick=%d: entity %d orders/jobs overflow orders=%d jobs=%d", where, e.Tick(), v.ID, len(v.Orders), len(v.Jobs))
		}
	}
	if e.state.NextID == 0 {
		iss.add("%s tick=%d: NextID==0", where, e.Tick())
	}
}

func agentCSaveRestoreCheck(c *content.Catalog, e *Engine, iss *agentCIssues, where string) {
	sv, err, pan := agentCSafeSave(e)
	if pan != nil {
		iss.panicf(where+" Save", e.Tick(), pan)
		return
	}
	if err != nil {
		iss.add("%s tick=%d: Save error: %v", where, e.Tick(), err)
		return
	}
	re, err, pan := agentCSafeRestore(c, sv)
	if pan != nil {
		iss.panicf(where+" Restore(valid)", e.Tick(), pan)
		return
	}
	if err != nil {
		iss.add("%s tick=%d: Restore(valid save) error: %v", where, e.Tick(), err)
		return
	}
	if re.Hash() != e.Hash() {
		iss.add("%s tick=%d: Save/Restore hash mismatch restored=%s original=%s", where, e.Tick(), re.Hash(), e.Hash())
	}
}

func agentCLoadMap(t *testing.T, name string) content.Map {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	mp, err := content.DecodeMap(data)
	if err != nil {
		t.Fatal(err)
	}
	return mp
}

func agentCNewGame(t *testing.T, catalog *content.Catalog, mp content.Map, seed uint64, factions []string) *Engine {
	t.Helper()
	// The three curated maps expose 2 spawns each (verified from content), so
	// player count is capped at len(mp.Spawns); 3-4P is impossible on them.
	n := len(mp.Spawns)
	if n > 4 {
		n = 4
	}
	if n < 2 {
		t.Fatalf("map has %d spawns", n)
	}
	cfg := Config{Map: mp, Seed: seed, Ruleset: "standard-v2"}
	for i := 0; i < n; i++ {
		cfg.Players = append(cfg.Players, PlayerConfig{
			ID: PlayerID(i + 1), Name: fmt.Sprintf("chaos%d", i),
			Faction: factions[i%len(factions)], Team: uint32(i + 1), AI: "normal",
		})
	}
	e, err := New(catalog, cfg)
	if err != nil {
		t.Fatalf("New(seed=%d): %v", seed, err)
	}
	return e
}

func agentCOwnEntities(e *Engine, p PlayerID) []*Entity {
	var out []*Entity
	for _, v := range e.state.Entities {
		if v != nil && v.Owner == p && v.HP > 0 {
			out = append(out, v)
		}
	}
	return out
}

func agentCOtherEntity(e *Engine, p PlayerID) *Entity {
	for _, v := range e.state.Entities {
		if v != nil && v.Owner != 0 && v.Owner != p && v.HP > 0 {
			return v
		}
	}
	return nil
}

// acceptedInvalid tracks a Submit-accepted order that must be rejected at
// execution time (state.Results) and must not be reported Accepted.
type agentCAccepted struct {
	player PlayerID
	seq    uint32
	desc   string
}

// --- chaos burst ---------------------------------------------------------

// agentCChaosBurst submits garbage, one order per Submit so acceptance is
// attributable. definitivelyInvalid orders must be rejected by Submit itself
// (see validation in Submit); semanticallyInvalid orders may pass Submit but
// must be rejected at execution. Returns accepted orders to verify after the
// next Advance.
func agentCChaosBurst(e *Engine, rng *rand.Rand, seqs map[PlayerID]uint32, iss *agentCIssues, where string) []agentCAccepted {
	var pending []agentCAccepted
	if e.state.Outcome.Finished || e.state.Countdown > 0 {
		return pending
	}
	players := e.state.Players
	submit := func(p PlayerID, o Order, desc string, definitivelyInvalid bool) {
		seqs[p]++
		seq := seqs[p]
		err, pan := agentCSafeSubmit(e, p, seq, []Order{o})
		if pan != nil {
			iss.panicf(where+" Submit("+desc+")", e.Tick(), pan)
			return
		}
		if err == nil {
			if definitivelyInvalid {
				iss.add("%s tick=%d: Submit ACCEPTED definitively-invalid order (%s) p%d seq=%d order=%+v",
					where, e.Tick(), desc, p, seq, o)
			}
			pending = append(pending, agentCAccepted{p, seq, desc})
		}
	}

	// Random submitter, including a nonexistent player.
	if err, pan := agentCSafeSubmit(e, PlayerID(999), 424242, []Order{{Kind: "move", Entities: []ID{1}, Position: Vec{}}}); pan != nil {
		iss.panicf(where+" Submit(nonexistent player)", e.Tick(), pan)
	} else if err == nil {
		iss.add("%s tick=%d: Submit ACCEPTED order for nonexistent player 999", where, e.Tick())
	}

	for _, pl := range players {
		p := pl.ID
		if pl.Defeated {
			continue
		}
		own := agentCOwnEntities(e, p)
		var ownID ID
		var rigID ID
		var buildingID ID
		if len(own) > 0 {
			ownID = own[rng.Intn(len(own))].ID
		}
		for _, v := range own {
			if !v.Building && e.role(v) == "rig" && rigID == 0 {
				rigID = v.ID
			}
			if v.Building && v.Complete && buildingID == 0 {
				buildingID = v.ID
			}
		}
		if rigID == 0 {
			rigID = ownID
		}
		if buildingID == 0 {
			buildingID = ownID
		}
		w, h := e.state.Map.Width, e.state.Map.Height
		inBounds := Vec{X: int32(rng.Intn(int(w))) * 1000, Y: int32(rng.Intn(int(h))) * 1000}
		oob := []Vec{
			{X: -1000, Y: -1},
			{X: w*1000 + 9999, Y: 0},
			{X: 0, Y: h*1000 + 12345},
			{X: -2147483000, Y: 2147483000},
		}[rng.Intn(4)]
		hugePoints := make([]Vec, 500)
		for i := range hugePoints {
			hugePoints[i] = inBounds
		}
		hugeEntities := make([]ID, 200)
		for i := range hugeEntities {
			hugeEntities[i] = ownID // duplicates and >64 cap
		}

		// Definitively invalid: Submit must reject synchronously.
		submit(p, Order{Kind: "move", Entities: []ID{999999}, Position: inBounds}, "nonexistent entity ID 999999", true)
		if other := agentCOtherEntity(e, p); other != nil {
			submit(p, Order{Kind: "move", Entities: []ID{other.ID}, Position: inBounds}, "other player's entity", true)
		}
		submit(p, Order{Kind: "move", Entities: nil, Position: inBounds}, "empty Entities", true)
		submit(p, Order{Kind: "nuke_everything_xyz", Entities: []ID{ownID}, Position: inBounds}, "unknown Kind", true)
		submit(p, Order{Kind: "", Entities: []ID{ownID}, Position: inBounds}, "empty Kind", true)
		submit(p, Order{Kind: "move", Entities: []ID{ownID}, Position: oob}, "out-of-bounds Position", true)
		submit(p, Order{Kind: "patrol", Entities: []ID{ownID}, Position: inBounds, Points: []Vec{oob}}, "out-of-bounds Points entry", true)
		submit(p, Order{Kind: "patrol", Entities: []ID{ownID}, Position: inBounds, Points: hugePoints}, "huge Points slice (500)", true)
		submit(p, Order{Kind: "move", Entities: hugeEntities, Position: inBounds}, "huge/duplicated Entities slice (200)", true)
		submit(p, Order{Kind: "move", Entities: []ID{ownID, ownID}, Position: inBounds}, "duplicated entity in selection", true)
		submit(p, Order{Kind: "move", Entities: []ID{ownID}, Position: inBounds, Type: string(make([]byte, 200))}, "overlong Type string", true)
		submit(p, Order{Kind: "move", Entities: []ID{ownID}, Position: inBounds, Index: -5}, "negative Index", true)
		submit(p, Order{Kind: "move", Entities: []ID{ownID}, Position: inBounds, Index: 2000000}, "Index > 1e6", true)

		// Semantically invalid: may pass Submit, must fail at execution
		// without being reported Accepted and without mutating state.
		submit(p, Order{Kind: "build", Entities: []ID{rigID}, Position: inBounds, Type: "ZZZ.not_a_building"}, "build invalid type", false)
		submit(p, Order{Kind: "build", Entities: []ID{rigID}, Position: inBounds, Type: pl.Faction + ".rig"}, "build unit-type as building (invalid/unaffordable path)", false)
		submit(p, Order{Kind: "train", Entities: []ID{buildingID}, Type: "ZZZ.not_a_unit"}, "train invalid type", false)
		submit(p, Order{Kind: "research", Entities: []ID{buildingID}, Type: "ZZZ.not_an_upgrade"}, "research invalid type", false)
		submit(p, Order{Kind: "ability", Entities: []ID{ownID}, Type: "ZZZ.not_an_ability", Position: inBounds}, "ability invalid type", false)
		submit(p, Order{Kind: "build", Entities: []ID{ownID, rigID}, Position: inBounds, Type: "ZZZ.not_a_building"}, "build with two builders + invalid type", false)
		submit(p, Order{Kind: "attack", Entities: []ID{ownID}, Target: 999999}, "attack nonexistent target", false)
		submit(p, Order{Kind: "cancel", Entities: []ID{buildingID}, Index: 9999}, "cancel nonexistent queue index", false)

		// Sequence abuse. First an order Submit accepts (train-invalid passes
		// Submit validation), then duplicate and out-of-order reuses.
		seqs[p]++
		goodSeq := seqs[p]
		err, pan := agentCSafeSubmit(e, p, goodSeq, []Order{{Kind: "train", Entities: []ID{buildingID}, Type: "ZZZ.seq_probe"}})
		if pan != nil {
			iss.panicf(where+" Submit(seq probe)", e.Tick(), pan)
		} else if err == nil {
			pending = append(pending, agentCAccepted{p, goodSeq, "train invalid type (seq probe)"})
			if err2, pan2 := agentCSafeSubmit(e, p, goodSeq, []Order{{Kind: "train", Entities: []ID{buildingID}, Type: "ZZZ.seq_probe"}}); pan2 != nil {
				iss.panicf(where+" Submit(duplicate seq)", e.Tick(), pan2)
			} else if err2 == nil {
				iss.add("%s tick=%d: Submit ACCEPTED duplicate sequence p%d seq=%d", where, e.Tick(), p, goodSeq)
			}
			if goodSeq > 1 {
				if err2, pan2 := agentCSafeSubmit(e, p, goodSeq-1, []Order{{Kind: "train", Entities: []ID{buildingID}, Type: "ZZZ.seq_probe"}}); pan2 != nil {
					iss.panicf(where+" Submit(out-of-order seq)", e.Tick(), pan2)
				} else if err2 == nil {
					iss.add("%s tick=%d: Submit ACCEPTED out-of-order sequence p%d seq=%d (last=%d)", where, e.Tick(), p, goodSeq-1, goodSeq)
				}
			}
		}
		if err, pan := agentCSafeSubmit(e, p, 0, []Order{{Kind: "ping", Position: inBounds}}); pan != nil {
			iss.panicf(where+" Submit(seq 0)", e.Tick(), pan)
		} else if err == nil {
			iss.add("%s tick=%d: Submit ACCEPTED sequence 0 p%d", where, e.Tick(), p)
		}

		// Oversized batch (>32 orders).
		batch := make([]Order, 40)
		for i := range batch {
			batch[i] = Order{Kind: "stop", Entities: []ID{ownID}}
		}
		seqs[p]++
		if err, pan := agentCSafeSubmit(e, p, seqs[p], batch); pan != nil {
			iss.panicf(where+" Submit(oversized batch)", e.Tick(), pan)
		} else if err == nil {
			iss.add("%s tick=%d: Submit ACCEPTED oversized batch (40 orders) p%d seq=%d", where, e.Tick(), p, seqs[p])
		}
		// Empty batch.
		seqs[p]++
		if err, pan := agentCSafeSubmit(e, p, seqs[p], nil); pan != nil {
			iss.panicf(where+" Submit(empty batch)", e.Tick(), pan)
		} else if err == nil {
			iss.add("%s tick=%d: Submit ACCEPTED empty batch p%d seq=%d", where, e.Tick(), p, seqs[p])
		}
	}
	return pending
}

// agentCCheckExecution verifies, immediately after the Advance that executes
// scheduled orders, that no tracked garbage order was reported Accepted.
func agentCCheckExecution(e *Engine, pending []agentCAccepted, iss *agentCIssues, where string) {
	for _, acc := range pending {
		for _, r := range e.state.Results {
			if r.Player == acc.player && r.Sequence == acc.seq && r.Accepted {
				iss.add("%s tick=%d: invalid order ACCEPTED AT EXECUTION (%s) p%d seq=%d index=%d code=%q",
					where, e.Tick(), acc.desc, acc.player, acc.seq, r.Index, r.Code)
			}
		}
	}
}

// --- main test -----------------------------------------------------------

func TestStressChaos(t *testing.T) {
	if os.Getenv("STRESS") != "1" {
		t.Skip("STRESS=1")
	}
	catalog := content.MustBase()
	factions := []string{"US", "IR", "SY", "SA"}
	mapNames := []string{"copper-junction", "relay-heights", "dry-river"}
	maps := make([]content.Map, len(mapNames))
	for i, n := range mapNames {
		maps[i] = agentCLoadMap(t, n)
	}
	maxTick := seconds(90*60) + 200

	// Part 1: chaos orders in 6 bot games.
	for game := 0; game < 6; game++ {
		where := fmt.Sprintf("chaos-game%d", game)
		mp := maps[game%len(maps)]
		e := agentCNewGame(t, catalog, mp, uint64(77000+game*131), factions[game%4:])
		rng := rand.New(rand.NewSource(int64(1234 + game)))
		seqs := map[PlayerID]uint32{}
		for _, p := range e.state.Players {
			seqs[p.ID] = 1000
		}
		iss := &agentCIssues{}
		start := time.Now()
		bursts := 0
		for !e.Outcome().Finished && e.Tick() < maxTick {
			if pan := agentCSafeAdvance(e); pan != nil {
				iss.panicf(where+" Advance", e.Tick(), pan)
				break
			}
			if e.Tick()%37 == 0 {
				pending := agentCChaosBurst(e, rng, seqs, iss, where)
				bursts++
				agentCInvariants(e, iss, where+" post-burst")
				agentCSaveRestoreCheck(catalog, e, iss, where+" post-burst")
				if len(iss.list) > 0 {
					break
				}
				// Execute scheduled garbage, then verify none was Accepted.
				if pan := agentCSafeAdvance(e); pan != nil {
					iss.panicf(where+" Advance(post-burst)", e.Tick(), pan)
					break
				}
				agentCCheckExecution(e, pending, iss, where)
				agentCInvariants(e, iss, where+" post-execution")
				if len(iss.list) > 0 {
					break
				}
			}
		}
		out := e.Outcome()
		if !out.Finished {
			iss.add("%s: NO_FINISH tick=%d outcome=%+v", where, e.Tick(), out)
		}
		agentCSaveRestoreCheck(catalog, e, iss, where+" final")
		t.Logf("%s map=%s ticks=%d (%.1f min) wall=%s bursts=%d finished=%v reason=%q winner=%v issues=%d",
			where, mapNames[game%len(maps)], e.Tick(), float64(e.Tick())/1200.0, time.Since(start).Round(time.Millisecond),
			bursts, out.Finished, out.Reason, out.WinningTeam, len(iss.list))
		for _, s := range iss.list {
			t.Errorf("%s", s)
		}
	}

	// Part 2: save/restore fuzz in 2 games.
	for game := 0; game < 2; game++ {
		where := fmt.Sprintf("fuzz-game%d", game)
		e := agentCNewGame(t, catalog, maps[game%len(maps)], uint64(99000+game*77), factions)
		iss := &agentCIssues{}
		start := time.Now()
		corruptDone := map[Tick]bool{}
		for e.Tick() < 3000 && !e.Outcome().Finished {
			if pan := agentCSafeAdvance(e); pan != nil {
				iss.panicf(where+" Advance", e.Tick(), pan)
				break
			}
			if e.Tick()%13 == 0 {
				agentCSaveRestoreCheck(catalog, e, iss, where)
				if len(iss.list) > 0 {
					break
				}
			}
			// Corrupted-save suite at a few ticks from a fresh valid save.
			if (e.Tick() == 260 || e.Tick() == 1300 || e.Tick() == 2996) && !corruptDone[e.Tick()] {
				corruptDone[e.Tick()] = true
				sv, err, pan := agentCSafeSave(e)
				if pan != nil {
					iss.panicf(where+" Save(for corruption)", e.Tick(), pan)
					break
				}
				if err != nil {
					iss.add("%s tick=%d: Save(for corruption) error: %v", where, e.Tick(), err)
					break
				}
				flip := func(pos int) []byte {
					b := append([]byte(nil), sv...)
					if pos >= 0 && pos < len(b) {
						b[pos] ^= 0xFF
					}
					return b
				}
				variants := map[string][]byte{
					"nil":              nil,
					"empty":            {},
					"garbage":          []byte("this is not a save {{{"),
					"truncated-1":      sv[:1],
					"truncated-half":   sv[:len(sv)/2],
					"truncated-minus1": sv[:len(sv)-1],
					"flip-first":       flip(0),
					"flip-10":          flip(10),
					"flip-middle":      flip(len(sv) / 2),
					"flip-last":        flip(len(sv) - 1),
					"trailing-byte":    append(append([]byte(nil), sv...), 'x'),
					"trailing-json":    append(append([]byte(nil), sv...), []byte(` {}`)...),
					"zeros-1k":         make([]byte, 1024),
					"only-braces":      []byte(`{}`),
					"wrong-version-envelope": []byte(`{"version":99,"sha256":"` +
						"0000000000000000000000000000000000000000000000000000000000000000" +
						`","state":{}}`),
				}
				for name, data := range variants {
					re, err, pan := agentCSafeRestore(catalog, data)
					if pan != nil {
						iss.add("%s tick=%d: Restore(corrupt %q) PANICKED: %v", where, e.Tick(), name, pan)
						continue
					}
					if err == nil {
						h := ""
						if re != nil {
							h = re.Hash()
						}
						iss.add("%s tick=%d: Restore ACCEPTED corrupted save variant %q (err=nil, hash=%s, valid hash=%s)",
							where, e.Tick(), name, h, e.Hash())
					}
				}
				if len(iss.list) > 0 {
					break
				}
			}
		}
		t.Logf("%s ticks=%d wall=%s corruptSuites=%d issues=%d",
			where, e.Tick(), time.Since(start).Round(time.Millisecond), len(corruptDone), len(iss.list))
		for _, s := range iss.list {
			t.Errorf("%s", s)
		}
	}
}
