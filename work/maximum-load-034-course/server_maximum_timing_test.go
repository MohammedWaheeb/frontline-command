package server

// Private derivative only. The preparer inserts timing taps into the ORIGINAL
// liveMatch.run; this test does not copy or replace its ticker/serialization loop.
import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"
	"time"
)

type maximumLoopSample struct {
	Tick                sim.Tick  `json:"tick"`
	Scheduled           time.Time `json:"scheduled"`
	Started             time.Time `json:"started"`
	AdvanceNS           int64     `json:"advance_ns"`
	ArchiveNS           int64     `json:"archive_ns"`
	ReplayCheckpointNS  int64     `json:"replay_checkpoint_ns"`
	SaveEnqueueNS       int64     `json:"save_enqueue_ns"`
	PeerEncodeEnqueueNS int64     `json:"peer_encode_enqueue_ns"`
	TotalNS             int64     `json:"actor_tick_ns"`
}
type maximumPersist struct {
	Tick     uint32
	NS       int64
	Bytes    int
	SHA256   string
	RowExact bool
	Error    string
}
type maximumProbe struct {
	rows              []maximumLoopSample
	progress          chan sim.Tick
	mu                sync.Mutex
	errors            []string
	resultKeys        map[string]bool
	events            map[uint32]string
	checkpoint        []maximumPersist
	dbPath            string
	finalHash         string
	finalSave, replay []byte
	finalState        sim.State
	archiveFrames     map[sim.PlayerID]int
}

var maximumLoopProbe *maximumProbe

func maxDigest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func (p *maximumProbe) fail(format string, args ...any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.errors = append(p.errors, fmt.Sprintf(format, args...))
}
func (p *maximumProbe) finish(row maximumLoopSample, m *liveMatch, a *observerArchive, r *sim.Replay, replayErr error, views map[sim.PlayerID]sim.View, advanced bool) bool {
	if !advanced {
		return false
	}
	row.Tick = m.engine.Tick()
	p.rows = append(p.rows, row)
	// Collection is outside the measured branch, kept bounded and disclosed.
	for id, view := range views {
		for _, event := range view.Events {
			p.events[uint32(event.ID)] = event.Kind
		}
		for _, result := range view.Results {
			key := fmt.Sprintf("%d/%d/%d", id, result.Sequence, result.Index)
			p.resultKeys[key] = true
			if !result.Accepted {
				p.fail("rejected result %s: %s", key, result.Code)
			}
		}
	}
	p.progress <- row.Tick // buffered601; never synchronizes the actor with commander
	if row.Tick != 600 {
		return false
	}
	if replayErr != nil {
		p.fail("production replay checkpoint: %v", replayErr)
	}
	p.finalHash = m.engine.Hash()
	p.finalState = m.engine.StateCopy()
	var err error
	p.finalSave, err = m.engine.Save()
	if err != nil {
		p.fail("final save: %v", err)
	}
	if r != nil {
		p.replay, err = r.Encode()
		if err != nil {
			p.fail("replay encoding: %v", err)
		}
	}
	for id, frames := range a.frames {
		p.archiveFrames[id] = len(frames)
	}
	return true
}
func (p *maximumProbe) persisted(checkpoint matchCheckpoint, elapsed time.Duration, err error) {
	row := maximumPersist{Tick: checkpoint.tick, NS: elapsed.Nanoseconds(), Bytes: len(checkpoint.data), SHA256: maxDigest(checkpoint.data)}
	if err != nil {
		row.Error = err.Error()
	} else {
		// After the timed real SQLite write and before normal actor shutdown deletes
		// the active row, independently read the durable row; never alter it.
		db, e := sql.Open("sqlite", p.dbPath)
		if e == nil {
			var tick uint32
			var data []byte
			e = db.QueryRow("SELECT tick,data FROM active_matches WHERE id=?", "maximum-timing").Scan(&tick, &data)
			row.RowExact = e == nil && tick == checkpoint.tick && maxDigest(data) == row.SHA256
			db.Close()
		}
		if e != nil {
			row.Error = e.Error()
		}
	}
	p.checkpoint = append(p.checkpoint, row)
}

type maximumCommand struct {
	Tick     sim.Tick     `json:"tick"`
	Player   sim.PlayerID `json:"player"`
	Sequence uint32       `json:"sequence"`
	Orders   []sim.Order  `json:"orders"`
}
type maximumOracle struct {
	Actors      int              `json:"actors"`
	Ticks       sim.Tick         `json:"ticks"`
	FinalHash   string           `json:"final_hash"`
	InitialHash string           `json:"initial_hash"`
	Commands    []maximumCommand `json:"commands"`
}
type maximumSink struct {
	Frames   [][]byte
	Bytes    int
	Overflow bool
}

func maximumDrain(p *peer, done <-chan struct{}, result chan<- maximumSink) {
	sink := maximumSink{}
	add := func(b []byte) {
		if b == nil {
			return
		}
		sink.Bytes += len(b)
		if sink.Bytes > 32<<20 {
			sink.Overflow = true
			return
		}
		sink.Frames = append(sink.Frames, b)
	}
	for {
		select {
		case b := <-p.out:
			add(b)
		case <-done:
			for {
				select {
				case b := <-p.out:
					add(b)
				default:
					result <- sink
					return
				}
			}
		}
	}
}
func maximumSummary(rows []maximumLoopSample, field func(maximumLoopSample) int64) map[string]any {
	values := make([]int64, len(rows))
	for i, r := range rows {
		values[i] = field(r)
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return map[string]any{"samples": len(values), "p50_ms": float64(values[len(values)/2]) / 1e6, "p95_ms": float64(values[len(values)*95/100]) / 1e6, "p99_ms": float64(values[len(values)*99/100]) / 1e6, "max_ms": float64(values[len(values)-1]) / 1e6}
}
func TestMaximumActualServerActor600(t *testing.T) {
	input, out := os.Getenv("FRONTLINE_MAXIMUM_INPUT"), os.Getenv("FRONTLINE_MAXIMUM_OUTPUT")
	if input == "" || out == "" {
		t.Skip("explicit isolated artifact course only")
	}
	if testing.Short() {
		t.Skip("30-second actual ticker requires explicit course")
	}
	if err := os.Mkdir(out, 0700); err != nil {
		t.Fatal(err)
	}
	report := map[string]any{"status": "running", "scope": "Actual liveMatch.run 20Hz ticker, Engine.Advance, four permitted archive views, protobuf/delta enqueue, tick600 replay capture/save and real async SQLite checkpoint. Four bounded memory protocol sinks, no HTTP/WebSocket/advice/slow-client or reference-hardware claim. Probe collection/final replay verification excluded from measured actor branch, but co-resident capture memory and probe work can affect scheduling/GC."}
	defer func() {
		if t.Failed() {
			report["status"] = "failed"
		}
		b, _ := json.MarshalIndent(report, "", "  ")
		os.WriteFile(filepath.Join(out, "server.json"), append(b, '\n'), 0600)
	}()
	opening, err := os.ReadFile(filepath.Join(input, "opening.json"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(input, "native.json"))
	if err != nil {
		t.Fatal(err)
	}
	if maxDigest(opening) != "acdcea47599b98a9feb05df8b795b1166b0885139757e3e7df8d8cc37ecbd582" || maxDigest(raw) != "65b2a87eda9148643898eb3d12c564a69b46ee5db5c043f79bdc438917d7bd9f" {
		t.Fatal("frozen fixture drift")
	}
	var oracle maximumOracle
	if err = json.Unmarshal(raw, &oracle); err != nil {
		t.Fatal(err)
	}
	if oracle.Actors != 688 || oracle.Ticks != 600 || len(oracle.Commands) != 72 {
		t.Fatal("wrong workload")
	}
	engine, err := sim.Restore(content.MustBase(), opening)
	if err != nil {
		t.Fatal(err)
	}
	if engine.Hash() != oracle.InitialHash || len(engine.StateCopy().Entities) != 688 {
		t.Fatal("opening identity")
	}
	// Sixteen real Submit batches are staged before the four peers are ready.
	// Remaining56 enter the actual match request queue at their recorded ticks.
	submitted := 0
	for _, c := range oracle.Commands {
		if c.Tick == 0 {
			if err = engine.Submit(c.Player, c.Sequence, c.Orders); err != nil {
				t.Fatal(err)
			}
			submitted++
		}
	}
	if submitted != 16 {
		t.Fatal("opening command count")
	}
	repo, err := storage.Open(filepath.Join(out, "host.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer repo.Close()
	probe := &maximumProbe{progress: make(chan sim.Tick, 601), resultKeys: map[string]bool{}, events: map[uint32]string{}, archiveFrames: map[sim.PlayerID]int{}, dbPath: filepath.Join(out, "host.sqlite")}
	maximumLoopProbe = probe
	slots := []slot{{Player: 1}, {Player: 2}, {Player: 3}, {Player: 4}}
	match, err := newMatch("maximum-timing", engine, slots, repo, storage.Files{Root: filepath.Join(out, "objects")})
	if err != nil {
		maximumLoopProbe = nil
		t.Fatal(err)
	}
	defer func() {
		match.close()
		maximumLoopProbe = nil
		// Preserve diagnostics even if an earlier admission/timeout/assertion fails.
		report["actual_tick"] = engine.Tick()
		report["samples"] = probe.rows
		report["checkpoint"] = probe.checkpoint
		report["probe_errors"] = probe.errors
		report["archive_frames"] = probe.archiveFrames
		report["final_hash_after_close"] = engine.Hash()
		if data, saveErr := engine.Save(); saveErr == nil {
			os.WriteFile(filepath.Join(out, "closed.save.json"), data, 0600)
		} else {
			report["cleanup_save_error"] = saveErr.Error()
		}
		if len(probe.replay) > 0 {
			os.WriteFile(filepath.Join(out, "captured.replay.gz"), probe.replay, 0600)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()
	peers := map[sim.PlayerID]*peer{}
	sinks := map[sim.PlayerID]chan maximumSink{}
	for _, s := range slots {
		p := &peer{player: s.Player, out: make(chan []byte, 64), done: make(chan struct{})}
		peers[s.Player] = p
		sinks[s.Player] = make(chan maximumSink, 1)
		go maximumDrain(p, match.done, sinks[s.Player])
		if reply := match.call(ctx, matchRequest{kind: "connect", player: s.Player, peer: p}); reply.err != nil {
			t.Fatal(reply.err)
		}
	}
	var requestTimes []map[string]any
	finished := false
	for !finished {
		select {
		case tick := <-probe.progress:
			if tick == 600 {
				finished = true
				continue
			}
			for _, c := range oracle.Commands {
				if c.Tick != tick {
					continue
				}
				start := time.Now()
				reply := match.call(ctx, matchRequest{kind: "orders", player: c.Player, peer: peers[c.Player], sequence: c.Sequence, orders: c.Orders})
				requestTimes = append(requestTimes, map[string]any{"target_tick": tick, "player": c.Player, "sequence": c.Sequence, "call_ns": time.Since(start).Nanoseconds()})
				if reply.err != nil {
					t.Fatal(reply.err)
				}
				submitted++
			}
		case <-match.done:
			if engine.Tick() != 600 {
				t.Fatal("actor ended early", engine.Tick())
			}
			finished = true
		case <-ctx.Done():
			t.Fatal("real ticker course timeout", ctx.Err())
		}
	}
	<-match.done // joins the real persistence writer and ordinary void shutdown
	report["samples"] = probe.rows
	report["requests"] = requestTimes
	report["submitted_batches"] = submitted
	report["executed_results"] = len(probe.resultKeys)
	report["checkpoint"] = probe.checkpoint
	report["archive_frames"] = probe.archiveFrames
	report["hash"] = probe.finalHash
	report["probe_errors"] = probe.errors
	if len(probe.rows) != 600 || submitted != 72 || len(probe.resultKeys) != 72 || len(probe.errors) != 0 {
		t.Fatal("incomplete actual actor course")
	}
	if probe.finalHash != oracle.FinalHash {
		t.Fatal("ordinary queue timing changed frozen canonical result", probe.finalHash)
	}
	if len(probe.checkpoint) != 1 || probe.checkpoint[0].Tick != 600 || !probe.checkpoint[0].RowExact || probe.checkpoint[0].Error != "" {
		t.Fatal("checkpoint not actually persisted", probe.checkpoint)
	}
	if len(probe.archiveFrames) != 4 {
		t.Fatal("missing perspective archive")
	}
	for _, n := range probe.archiveFrames {
		if n != 151 {
			t.Fatal("missing archive frames", n)
		}
	}
	landed := 0
	for _, e := range probe.finalState.Entities {
		if e.Type == "IR.isr" && e.HP > 0 && e.Landed {
			landed++
		}
	}
	kinds := map[string]int{}
	for _, kind := range probe.events {
		kinds[kind]++
	}
	report["authorized_unique_event_counts"] = kinds
	report["landed"] = landed
	if landed != 64 || kinds["interceptor_fired"] != 24 || kinds["missile_intercepted"] != 24 {
		t.Fatal("combined workload incomplete", landed, kinds)
	}
	// Inspect actual bytes emitted by production send(), including delta privacy.
	wire := map[sim.PlayerID]map[string]int{}
	for id, ch := range sinks {
		sink := <-ch
		if sink.Overflow {
			t.Fatal("bounded32MiB per-peer sink overflow")
		}
		states, last := 0, uint32(0)
		for _, b := range sink.Frames {
			envelope := new(pb.Envelope)
			if err = proto.Unmarshal(b, envelope); err != nil {
				t.Fatal(err)
			}
			state := envelope.GetSnapshot()
			if d := envelope.GetDelta(); d != nil {
				state = d.State
				if d.BaselineTick != last {
					t.Fatal("broken delta baseline", id, last, d.BaselineTick)
				}
			}
			if state != nil {
				states++
				last = state.Tick
				if state.Player != uint32(id) {
					t.Fatal("wrong perspective")
				}
				for _, entity := range state.Entities {
					if entity.Owner != uint32(id) && entity.Private != nil {
						t.Fatal("foreign private payload")
					}
				}
			}
			if envelope.GetError() != nil {
				t.Fatal("actual protocol error", envelope.GetError().Code)
			}
		}
		wire[id] = map[string]int{"frames": len(sink.Frames), "state_frames": states, "last_tick": int(last), "bytes": sink.Bytes}
		if states != 151 || last != 600 {
			t.Fatal("missing production state delivery", id, states, last)
		}
	}
	report["wire"] = wire
	if err = os.WriteFile(filepath.Join(out, "final.save.json"), probe.finalSave, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(out, "replay.gz"), probe.replay, 0600); err != nil {
		t.Fatal(err)
	}
	restored, err := sim.Restore(content.MustBase(), probe.finalSave)
	if err != nil || restored.Hash() != oracle.FinalHash {
		t.Fatal("restore mismatch", err)
	}
	replay, err := sim.DecodeReplay(probe.replay)
	if err != nil {
		t.Fatal(err)
	}
	player, err := replay.Open(content.MustBase(), 0)
	if err != nil {
		t.Fatal(err)
	}
	for !player.Finished() {
		if err = player.Advance(); err != nil {
			t.Fatal(err)
		}
	}
	if player.Engine().Hash() != oracle.FinalHash {
		t.Fatal("full replay mismatch")
	}
	seek, err := replay.Seek(content.MustBase(), 600)
	if err != nil || seek.Hash() != oracle.FinalHash {
		t.Fatal("checkpoint replay mismatch", err)
	}
	summary := map[string]any{}
	for name, f := range map[string]func(maximumLoopSample) int64{"advance": func(s maximumLoopSample) int64 { return s.AdvanceNS }, "archive": func(s maximumLoopSample) int64 { return s.ArchiveNS }, "peer_encode_enqueue": func(s maximumLoopSample) int64 { return s.PeerEncodeEnqueueNS }, "actor_tick": func(s maximumLoopSample) int64 { return s.TotalNS }, "dequeue_lag": func(s maximumLoopSample) int64 { return s.Started.Sub(s.Scheduled).Nanoseconds() }} {
		summary[name] = maximumSummary(probe.rows, f)
	}
	report["summary"] = summary
	report["restore_full_and_checkpoint_replay_exact"] = true
	missed, over50 := 0, 0
	for i, row := range probe.rows {
		if row.Tick != sim.Tick(i+1) {
			t.Fatal("authoritative tick gap", i, row.Tick)
		}
		if row.TotalNS >= int64(50*time.Millisecond) {
			over50++
		}
		if i > 0 {
			gap := row.Scheduled.Sub(probe.rows[i-1].Scheduled)
			if gap > 75*time.Millisecond {
				missed += int((gap+25*time.Millisecond)/(50*time.Millisecond)) - 1
			}
		}
	}
	report["missed_ticker_slots"] = missed
	report["actor_ticks_at_or_over50ms"] = over50
	advance := summary["advance"].(map[string]any)
	if advance["p95_ms"].(float64) >= 25 || advance["p99_ms"].(float64) >= 40 {
		t.Fatal("simulation25/40ms gate failed")
	}
	if missed != 0 || over50 != 0 {
		t.Fatal("full actor50ms cadence gate failed", missed, over50)
	}
	report["status"] = "passed"
}
