package sim

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"runtime/pprof"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Long-soak probe (hidden-bug hunt, 2026-11-09). Plays full-length AI games
// on the real skirmish maps and reports what short tests cannot see:
//   - tick-time spikes that are NOT A* work (non-navigation hot paths);
//   - the solo replay checkpoint (Save + compress every 600 ticks, as the WASM
//     session does on the game loop) and its growth;
//   - collections in State/Engine/Player/Entity that grow with match length;
//   - Hash/Save size and cost growth and the live heap.
//
// Opt-in only: FRONTLINE_SOAK=1. FRONTLINE_SOAK_TICKS overrides the length,
// FRONTLINE_SOAK_OUT names a directory for CSV and CPU profiles.
func TestSoakProbe(t *testing.T) {
	if os.Getenv("FRONTLINE_SOAK") != "1" {
		t.Skip("set FRONTLINE_SOAK=1 to run the long-soak probe")
	}
	ticks := 36000
	if v, err := strconv.Atoi(os.Getenv("FRONTLINE_SOAK_TICKS")); err == nil && v > 0 {
		ticks = v
	}
	out := os.Getenv("FRONTLINE_SOAK_OUT") // must be absolute: go test runs in the package dir
	cases := []lateGameCase{
		{"industrial-valley", 1, 4, ticks},
		{"border-depots", 2, 4, ticks},
		{"port-outskirts", 3, 4, ticks},
		{"copper-junction", 4, 2, ticks},
		{"relay-heights", 5, 2, ticks},
		{"dry-river", 6, 2, ticks},
	}
	if only := os.Getenv("FRONTLINE_SOAK_ONLY"); only != "" {
		cases = slices.DeleteFunc(cases, func(c lateGameCase) bool { return !strings.Contains(only, c.battlefield) })
	}
	for _, c := range cases {
		c := c
		t.Run(fmt.Sprintf("%s-s%d-n%d", c.battlefield, c.seed, c.players), func(t *testing.T) {
			t.Parallel()
			soakOne(t, c, out)
		})
	}
}

type soakTick struct {
	tick     Tick
	ns       int64
	nav      uint64
	entities int
}

func soakOne(t *testing.T, c lateGameCase, out string) {
	e := lateGameEngine(t, c)
	rec, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	var prof *os.File
	if out != "" && os.Getenv("FRONTLINE_SOAK_PROFILE") == "1" { // one profile per process: use with FRONTLINE_SOAK_ONLY
		prof, _ = os.Create(filepath.Join(out, c.battlefield+".cpu.pprof"))
	}
	var csv strings.Builder
	csv.WriteString("tick,entities,projectiles,state_json_bytes,hash_ms,save_ms,heap_mb,replay_bytes,checkpoint_ms,checkpoint_packed_bytes\n")
	var rows []soakTick
	lens := map[string][]int{}
	var lensTicks []Tick
	var checkpointMs []float64
	var lastCheckpointMs float64
	var lastPacked int
	finishedAt := Tick(0)
	for i := 0; i < c.ticks; i++ {
		if e.Outcome().Finished {
			finishedAt = e.Tick()
			break
		}
		if prof != nil && i == c.ticks/3 { // profile the late two thirds only
			pprof.StartCPUProfile(prof)
		}
		before := e.navExpansions
		start := time.Now()
		e.Advance()
		ns := time.Since(start).Nanoseconds()
		rows = append(rows, soakTick{e.Tick(), ns, e.navExpansions - before, len(e.state.Entities)})
		// Mirror cmd/wasm Session.advance: capture every 30 s of game time.
		if e.Tick()%Tick(30*TickRate) == 0 {
			start = time.Now()
			if err := rec.Capture(e, true); err != nil {
				t.Fatalf("replay capture at tick %d: %v", e.Tick(), err)
			}
			lastCheckpointMs = float64(time.Since(start).Microseconds()) / 1000
			checkpointMs = append(checkpointMs, lastCheckpointMs)
			lastPacked = len(rec.Checkpoints[len(rec.Checkpoints)-1].PackedSave)
		}
		if e.Tick()%2000 == 0 {
			lensTicks = append(lensTicks, e.Tick())
			for k, v := range soakLens(e) {
				for len(lens[k]) < len(lensTicks)-1 {
					lens[k] = append(lens[k], 0)
				}
				lens[k] = append(lens[k], v)
			}
			start = time.Now()
			b, _ := json.Marshal(e.state)
			_ = e.Hash()
			hashMs := float64(time.Since(start).Microseconds()) / 2000 // marshal + hash, halved ≈ one hash
			start = time.Now()
			_, _ = e.Save()
			saveMs := float64(time.Since(start).Microseconds()) / 1000
			runtime.GC()
			var ms runtime.MemStats
			runtime.ReadMemStats(&ms)
			fmt.Fprintf(&csv, "%d,%d,%d,%d,%.1f,%.1f,%.1f,%d,%.1f,%d\n", e.Tick(), len(e.state.Entities), len(e.state.Projectiles), len(b), hashMs, saveMs, float64(ms.HeapAlloc)/1e6, soakReplayBytes(rec), lastCheckpointMs, lastPacked)
		}
	}
	if prof != nil {
		pprof.StopCPUProfile()
		prof.Close()
	}
	if out != "" {
		os.WriteFile(filepath.Join(out, c.battlefield+".csv"), []byte(csv.String()), 0o644)
	}

	// Tick-time summary and non-navigation spikes.
	ns := make([]int64, len(rows))
	for i, r := range rows {
		ns[i] = r.ns
	}
	sorted := slices.Clone(ns)
	slices.Sort(sorted)
	pct := func(p int) float64 { return float64(sorted[len(sorted)*p/100]) / 1e6 }
	t.Logf("%d ticks (finished at %d): tick ms p50=%.2f p95=%.2f p99=%.2f max=%.1f", len(rows), finishedAt, pct(50), pct(95), pct(99), float64(sorted[len(sorted)-1])/1e6)
	byCost := slices.Clone(rows)
	sort.Slice(byCost, func(i, j int) bool { return byCost[i].ns > byCost[j].ns })
	var spikes []string
	for _, r := range byCost {
		if r.ns < 25e6 || len(spikes) >= 12 {
			break
		}
		kind := "nav"
		if r.nav < 30000 {
			kind = "NON-NAV"
		}
		spikes = append(spikes, fmt.Sprintf("tick %d %.1fms nav=%d ents=%d %s", r.tick, float64(r.ns)/1e6, r.nav, r.entities, kind))
	}
	t.Logf("slowest ticks >25ms: %s", strings.Join(spikes, "; "))
	if len(checkpointMs) > 0 {
		cp := slices.Clone(checkpointMs)
		slices.Sort(cp)
		t.Logf("replay checkpoint (sync Save+compress, every 600 ticks): n=%d median=%.1fms max=%.1fms last=%.1fms; replay held in memory=%d bytes", len(cp), cp[len(cp)/2], cp[len(cp)-1], checkpointMs[len(checkpointMs)-1], soakReplayBytes(rec))
	}
	t.Logf("growth table:\n%s", csv.String())

	// Collections that keep growing while the entity count does not.
	if len(lensTicks) >= 4 {
		var keys []string
		for k := range lens {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		entities := lens["State.Entities"]
		var grow []string
		for _, k := range keys {
			v := lens[k]
			if len(v) < len(lensTicks) {
				continue
			}
			q := len(v) / 4
			early, late := v[q], v[len(v)-1]
			entEarly, entLate := 1, 1
			if len(entities) == len(v) {
				entEarly, entLate = max(entities[q], 1), max(entities[len(v)-1], 1)
			}
			if late > 64 && late > 3*max(early, 1) && float64(late)/float64(max(early, 1)) > 2*float64(entLate)/float64(entEarly) {
				grow = append(grow, fmt.Sprintf("%s %d -> %d (entities %d -> %d)", k, early, late, entEarly, entLate))
			}
		}
		t.Logf("collections growing faster than entities (tick %d -> %d): %s", lensTicks[len(lensTicks)/4], lensTicks[len(lensTicks)-1], strings.Join(grow, "; "))
		var top []string
		for _, k := range keys {
			v := lens[k]
			top = append(top, fmt.Sprintf("%s=%d", k, v[len(v)-1]))
		}
		t.Logf("final collection sizes: %s", strings.Join(top, " "))
	}
}

func soakReplayBytes(r *Replay) int {
	n := len(r.Initial)
	for _, c := range r.Chunks {
		n += len(c.Data)
	}
	for _, c := range r.Checkpoints {
		n += len(c.PackedSave)
	}
	return n
}

// soakLens returns the length of every slice and map reachable one level into
// State, Engine, Players and Entities (summed over players and entities).
func soakLens(e *Engine) map[string]int {
	out := map[string]int{}
	collect := func(prefix string, v reflect.Value) {
		t := v.Type()
		for i := 0; i < t.NumField(); i++ {
			f := v.Field(i)
			switch f.Kind() {
			case reflect.Slice, reflect.Map:
				out[prefix+t.Field(i).Name] += f.Len()
				if f.Kind() == reflect.Map {
					// map[k][]T: also count the inner elements.
					it := f.MapRange()
					inner, any := 0, false
					for it.Next() {
						if m := it.Value(); m.Kind() == reflect.Slice || m.Kind() == reflect.Map {
							inner += m.Len()
							any = true
						}
					}
					if any {
						out[prefix+t.Field(i).Name+"[*]"] += inner
					}
				}
			}
		}
	}
	collect("Engine.", reflect.ValueOf(e).Elem())
	collect("State.", reflect.ValueOf(&e.state).Elem())
	for _, p := range e.state.Players {
		collect("Player.", reflect.ValueOf(p).Elem())
	}
	for _, en := range e.state.Entities {
		collect("Entity.", reflect.ValueOf(en).Elem())
	}
	return out
}

// TestSoakDissect replays one window of a real game and profiles only the
// slow ticks that did little A* work. FRONTLINE_DISSECT=map:seed:players:from:to
// and FRONTLINE_SOAK_OUT (absolute) for the profile and the window-start save.
// The game is deterministic, so pass 2 runs exactly the same ticks as pass 1.
func TestSoakDissect(t *testing.T) {
	spec := strings.Split(os.Getenv("FRONTLINE_DISSECT"), ":")
	if len(spec) != 5 {
		t.Skip("set FRONTLINE_DISSECT=map:seed:players:from:to")
	}
	seed, _ := strconv.Atoi(spec[1])
	players, _ := strconv.Atoi(spec[2])
	from, _ := strconv.Atoi(spec[3])
	to, _ := strconv.Atoi(spec[4])
	out := os.Getenv("FRONTLINE_SOAK_OUT")
	e := lateGameEngine(t, lateGameCase{spec[0], uint64(seed), players, to})
	for int(e.Tick()) < from && !e.Outcome().Finished {
		e.Advance()
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if out != "" {
		os.WriteFile(filepath.Join(out, fmt.Sprintf("%s-%d.save", spec[0], from)), save, 0o644)
	}
	type obs struct {
		ns  []int64
		nav uint64
	}
	ticks := map[Tick]*obs{}
	for pass := 0; pass < 3; pass++ { // three timing passes; take the min per tick to cut host noise
		r, err := Restore(e.catalog, save)
		if err != nil {
			t.Fatal(err)
		}
		for int(r.Tick()) < to && !r.Outcome().Finished {
			before := r.navExpansions
			start := time.Now()
			r.Advance()
			o := ticks[r.Tick()]
			if o == nil {
				o = &obs{}
				ticks[r.Tick()] = o
			}
			o.ns = append(o.ns, time.Since(start).Nanoseconds())
			o.nav = r.navExpansions - before
		}
	}
	spike := map[Tick]bool{}
	var list []string
	for tk, o := range ticks {
		m := slices.Min(o.ns)
		if m > 20e6 && o.nav < 30000 {
			spike[tk] = true
			list = append(list, fmt.Sprintf("%d:%.0fms/nav%d", tk, float64(m)/1e6, o.nav))
		}
	}
	sort.Strings(list)
	t.Logf("non-nav spike ticks (min of 3 passes > 20ms): %d: %s", len(list), strings.Join(list, " "))
	if out == "" || len(spike) == 0 {
		return
	}
	f, _ := os.Create(filepath.Join(out, spec[0]+"-dissect.cpu.pprof"))
	pprof.StartCPUProfile(f)
	for rep := 0; rep < 5; rep++ {
		r, _ := Restore(e.catalog, save)
		for int(r.Tick()) < to && !r.Outcome().Finished {
			if spike[r.Tick()+1] {
				pprof.Do(context.Background(), pprof.Labels("spike", "1"), func(context.Context) { r.Advance() })
			} else {
				r.Advance()
			}
		}
	}
	pprof.StopCPUProfile()
	f.Close()
}
