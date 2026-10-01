//go:build !(js && wasm)

package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// These are public Session regressions using the existing adapter testMap.
// The only custom input is a declared whole-credit launch budget. No save,
// replay, order log, timer, resource balance or entity is rewritten by a test.
func customMoneyConfig(t *testing.T, whole *int64, ruleset string) []byte {
	t.Helper()
	b, err := json.Marshal(CreateConfig{
		Map: testMap(), Seed: 42, Ruleset: ruleset, StartingCredits: whole,
		Players: []sim.PlayerConfig{
			{ID: 1, Name: "Alpha", Faction: "US", Team: 1},
			{ID: 2, Name: "Bravo", Faction: "IR", Team: 2},
		},
	})
	if err != nil { t.Fatal(err) }
	return b
}

func customMoneySession(t *testing.T) *Session {
	t.Helper()
	s, err := NewSession()
	if err != nil { t.Fatal(err) }
	t.Cleanup(s.Dispose)
	return s
}

func customMoneyCreate(t *testing.T, whole *int64, ruleset string) *Session {
	t.Helper()
	s := customMoneySession(t)
	info, err := s.Create(customMoneyConfig(t, whole, ruleset))
	if err != nil { t.Fatal(err) }
	if info.Tick != 0 || info.Adapter != AdapterVersion || info.Metadata.Simulation != sim.Version || info.Metadata.Protocol != 1 || len(info.Local) != 2 || info.Local[0] != 1 || info.Local[1] != 2 {
		t.Fatalf("ordinary current opening: %+v", info)
	}
	return s
}

func customMoneyDigest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func customMoneyState(t *testing.T, data []byte) (sim.State, string) {
	t.Helper()
	var env saveEnvelope
	if err := json.Unmarshal(data, &env); err != nil { t.Fatal(err) }
	if env.Version != 1 || len(env.State) == 0 || customMoneyDigest(env.State) != env.SHA256 {
		t.Fatal("native save envelope/checksum")
	}
	var state sim.State
	if err := json.Unmarshal(env.State, &state); err != nil { t.Fatal(err) }
	return state, env.SHA256
}

func customMoneyHash(t *testing.T, s *Session) string {
	t.Helper()
	h, err := s.Hash()
	if err != nil { t.Fatal(err) }
	return h
}

func customMoneySave(t *testing.T, s *Session) SaveResult {
	t.Helper()
	save, err := s.Save()
	if err != nil { t.Fatal(err) }
	state, stateHash := customMoneyState(t, save.Data)
	if save.Hash != stateHash || save.Hash != customMoneyHash(t, s) || save.Tick != state.Tick || save.Metadata != state.Metadata {
		t.Fatal("Save summary differs from its actual raw State")
	}
	// Whole-envelope SHA and engine State hash are different proof objects.
	if customMoneyDigest(save.Data) == save.Hash { t.Fatal("SaveSHA was substituted for StateHash") }
	return save
}

func customMoneyView(t *testing.T, s *Session, player sim.PlayerID) *pb.PlayerSnapshot {
	t.Helper()
	b, err := s.View(player)
	if err != nil { t.Fatal(err) }
	v := new(pb.PlayerSnapshot)
	if err := proto.Unmarshal(b, v); err != nil { t.Fatal(err) }
	if v.Metadata == nil || v.Metadata.Simulation != sim.Version || v.Metadata.Protocol != 1 || v.Metadata.Ruleset != s.Info().Metadata.Ruleset || v.Player != uint32(player) || v.Tick != uint32(s.Info().Tick) || v.Economy == nil {
		t.Fatal("full current owner wire", v)
	}
	return v
}

// A second public View drains transient Session feedback before a stable wire
// comparison. It does not edit or discard fields in the protobuf snapshot.
func customMoneyStableViews(t *testing.T, s *Session) []*pb.PlayerSnapshot {
	t.Helper()
	for _, id := range []sim.PlayerID{1, 2} { customMoneyView(t, s, id) }
	return []*pb.PlayerSnapshot{customMoneyView(t, s, 1), customMoneyView(t, s, 2)}
}

func customMoneyEqualViews(t *testing.T, got, want []*pb.PlayerSnapshot) {
	t.Helper()
	if len(got) != len(want) { t.Fatal("owner view count") }
	for i := range want {
		if !proto.Equal(got[i], want[i]) { t.Fatalf("complete owner-%d wire differs at tick %d", i+1, want[i].Tick) }
	}
}

func customMoneyStepTo(t *testing.T, s *Session, target sim.Tick) {
	t.Helper()
	for s.Info().Tick < target {
		n := min(57, int(target-s.Info().Tick))
		prior := s.Info().Tick
		info, err := s.Step(n)
		if err != nil || info.Tick != prior+sim.Tick(n) { t.Fatal("ordinary Session ticks", info, err) }
	}
}

func customMoneyPowerOrder(t *testing.T, s *Session) []byte {
	t.Helper()
	v := customMoneyView(t, s, 1)
	var rig uint32
	for _, e := range v.Entities {
		if e.Owner == 1 && e.Type == "US.rig" { rig = e.Id }
	}
	if rig == 0 { t.Fatal("public owned rig missing") }
	// This placement is the existing editor preview test's legal geometry.
	return batch(t, 1, &pb.Order{Kind: "build", Entities: []uint32{rig}, Type: "power", Position: &pb.Vec{X: 13000, Y: 13000}})
}

func customMoneyCheckBalances(t *testing.T, save SaveResult, opening, paid int64, ruleset string) {
	t.Helper()
	state, _ := customMoneyState(t, save.Data)
	stored := opening
	if opening == sim.DefaultStartingCredits { stored = 0 }
	if state.StartingCredits != stored || state.Metadata.Ruleset != ruleset || len(state.Players) != 2 {
		t.Fatal("original opening choice was lost or made noncanonical")
	}
	for _, p := range state.Players {
		wantPaid := int64(0)
		if p.ID == 1 { wantPaid = paid }
		if p.Credits != opening-wantPaid || p.Spent != wantPaid {
			t.Fatalf("actual paid balance for player %d: credits=%d spent=%d", p.ID, p.Credits, p.Spent)
		}
	}
}

func customMoneyExport(t *testing.T, s *Session) []byte {
	t.Helper()
	b, err := s.ExportReplay()
	if err != nil { t.Fatal(err) }
	return b
}

func customMoneyCheckpoint(t *testing.T, data []byte, initial, at600 SaveResult, end sim.Tick) *sim.Replay {
	t.Helper()
	r, err := sim.DecodeReplay(data)
	if err != nil { t.Fatal(err) }
	if r.Version != 2 || r.Metadata != initial.Metadata || r.FinalTick != end || !bytes.Equal(r.Initial, initial.Data) || len(r.Checkpoints) != 1 {
		t.Fatal("actual full replay/initial/sole checkpoint")
	}
	cp := r.Checkpoints[0]
	if cp.Tick != 600 || len(cp.PackedSave) == 0 || len(cp.Save) != 0 { t.Fatal("Session did not record its ordinary tick-600 packed checkpoint") }
	z, err := gzip.NewReader(bytes.NewReader(cp.PackedSave))
	if err != nil { t.Fatal(err) }
	raw, readErr := io.ReadAll(io.LimitReader(z, int64(maxSaveBytes)+1))
	closeErr := z.Close()
	if readErr != nil || closeErr != nil || len(raw) > maxSaveBytes || !bytes.Equal(raw, at600.Data) {
		t.Fatal("actual checkpoint bytes differ from the public Save at600", readErr, closeErr)
	}
	_, stateHash := customMoneyState(t, raw)
	if stateHash != at600.Hash || customMoneyDigest(raw) != customMoneyDigest(at600.Data) { t.Fatal("checkpoint StateHash/SaveSHA proof") }
	return r
}

func TestCustomStartingMoneySessionPaidSaveReplayRestart(t *testing.T) {
	whole := int64(12000)
	opening := whole * int64(sim.Scale)
	s := customMoneyCreate(t, &whole, "custom-v1")
	initial := customMoneySave(t, s)
	customMoneyCheckBalances(t, initial, opening, 0, "custom-v1")
	customMoneyStepTo(t, s, 100)
	order := customMoneyPowerOrder(t, s)
	if err := s.Submit(1, order); err != nil { t.Fatal(err) }
	if _, err := s.Step(1); err != nil { t.Fatal(err) }
	view := customMoneyView(t, s, 1)
	power, ok := content.MustBase().Building("power")
	if !ok || power.Cost <= 0 || len(view.Results) != 1 || !view.Results[0].Accepted || view.Results[0].Code != "ok" || view.Results[0].Sequence != 1 || view.Results[0].Tick != 101 || view.Economy.Credits != opening-power.Cost || view.Economy.Income != 0 {
		t.Fatal("actual paid public foundation", view.Results, view.Economy)
	}
	paid := customMoneySave(t, s)
	customMoneyCheckBalances(t, paid, opening, power.Cost, "custom-v1")
	state, _ := customMoneyState(t, paid.Data)
	foundation := false
	for _, e := range state.Entities {
		if e.Owner == 1 && e.Type == "power" && e.Building && !e.Complete && e.Paid == power.Cost { foundation = true }
	}
	if !foundation { t.Fatal("ordinary paid incomplete power foundation missing") }
	paidWire := customMoneyStableViews(t, s)
	twin := customMoneySession(t)
	if info, err := twin.Load(paid.Data, paid.Local); err != nil || info.Tick != 101 { t.Fatal("public post-spend restore", info, err) }
	if !bytes.Equal(customMoneySave(t, twin).Data, paid.Data) { t.Fatal("post-spend restore changed actual Save bytes") }
	customMoneyEqualViews(t, customMoneyStableViews(t, twin), paidWire)

	var at600 SaveResult
	wires := map[sim.Tick][]*pb.PlayerSnapshot{101: paidWire}
	hashes := map[sim.Tick]string{101: paid.Hash}
	for _, target := range []sim.Tick{600, 900} {
		for s.Info().Tick < target {
			n := min(57, int(target-s.Info().Tick))
			prior := s.Info().Tick
			for _, live := range []*Session{s, twin} {
				info, err := live.Step(n)
				if err != nil || info.Tick != prior+sim.Tick(n) { t.Fatal("ordinary restored continuation", info, err) }
			}
			a, b := customMoneySave(t, s), customMoneySave(t, twin)
			if a.Hash != b.Hash || !bytes.Equal(a.Data, b.Data) { t.Fatal("paid SaveRestore continuation diverged") }
			customMoneyEqualViews(t, customMoneyStableViews(t, s), customMoneyStableViews(t, twin))
		}
		save := customMoneySave(t, s)
		customMoneyCheckBalances(t, save, opening, power.Cost, "custom-v1")
		wires[target], hashes[target] = customMoneyStableViews(t, s), save.Hash
		if target == 600 { at600 = save }
	}
	final := customMoneySave(t, s)
	state, _ = customMoneyState(t, final.Data)
	complete := false
	for _, e := range state.Entities {
		if e.Owner == 1 && e.Type == "power" && e.Complete && e.Paid == power.Cost { complete = true }
	}
	if !complete { t.Fatal("ordinary paid construction did not complete by900") }
	full := customMoneyExport(t, s)
	r := customMoneyCheckpoint(t, full, initial, at600, 900)
	commands, _, err := r.CommandPage(0, 16)
	if err != nil || len(commands) != 1 || commands[0].Tick != 101 || commands[0].Player != 1 || commands[0].Sequence != 1 || len(commands[0].Orders) != 1 || commands[0].Orders[0].Kind != "build" {
		t.Fatal("full actual paid command log", commands, err)
	}

	// Continuous playback starts at the actual initial save and never seeks to
	// a checkpoint. The separate viewer exercises actual checkpoint selection.
	stream := customMoneySession(t)
	if info, err := stream.LoadReplay(full); err != nil || !info.Replay || info.ReplayStart != 0 || info.ReplayEnd != 900 { t.Fatal("full initial playback", info, err) }
	customMoneyStepTo(t, stream, 900)
	if customMoneyHash(t, stream) != final.Hash { t.Fatal("full initial replay diverged") }
	customMoneyEqualViews(t, customMoneyStableViews(t, stream), wires[900])
	viewer := customMoneySession(t)
	if _, err := viewer.LoadReplay(full); err != nil { t.Fatal(err) }
	for _, target := range []sim.Tick{101, 600, 900, 101} {
		if info, err := viewer.SeekReplay(target); err != nil || info.Tick != target { t.Fatal("actual seek", info, err) }
		if customMoneyHash(t, viewer) != hashes[target] { t.Fatalf("full/CP seek diverged at%d", target) }
		customMoneyEqualViews(t, customMoneyStableViews(t, viewer), wires[target])
	}
	before := customMoneyHash(t, viewer)
	if _, err := viewer.Save(); code(err) != "replay_read_only" { t.Fatal("replay Save", err) }
	if err := viewer.Submit(1, order); code(err) != "replay_read_only" { t.Fatal("replay paid submit", err) }
	if _, err := viewer.Restart(); code(err) != "replay_read_only" { t.Fatal("replay Restart", err) }
	if customMoneyHash(t, viewer) != before || !bytes.Equal(customMoneyExport(t, viewer), full) { t.Fatal("read-only rejection changed replay") }

	resumed := customMoneyExport(t, twin)
	customMoneyCheckpoint(t, resumed, paid, at600, 900)
	resumedViewer := customMoneySession(t)
	if info, err := resumedViewer.LoadReplay(resumed); err != nil || info.ReplayStart != 101 { t.Fatal("restored custom recording start", info, err) }
	before = customMoneyHash(t, resumedViewer)
	if _, err := resumedViewer.SeekReplay(100); code(err) != "replay_seek" || customMoneyHash(t, resumedViewer) != before { t.Fatal("seek before restored recording", err) }
	customMoneyStepTo(t, resumedViewer, 900)
	if customMoneyHash(t, resumedViewer) != final.Hash { t.Fatal("restored custom replay diverged") }

	for _, live := range []*Session{s, twin} {
		info, err := live.Restart()
		if err != nil || info.Tick != 0 || info.Metadata.Ruleset != "custom-v1" { t.Fatal("ordinary custom Restart", info, err) }
		restarted := customMoneySave(t, live)
		customMoneyCheckBalances(t, restarted, opening, 0, "custom-v1")
		if restarted.Hash != initial.Hash || !bytes.Equal(restarted.Data, initial.Data) { t.Fatal("post-spend Restart used current balance or standard6000") }
		fresh, err := sim.DecodeReplay(customMoneyExport(t, live))
		if err != nil || fresh.FinalTick != 0 || len(fresh.Checkpoints) != 0 || !bytes.Equal(fresh.Initial, initial.Data) { t.Fatal("Restart recorder retained prior custom match", err) }
	}
	t.Logf("public custom paid persistence: whole=%d milli=%d paid=%d actualCP600SaveSHA=%s stateHash=%s finalTick=900", whole, opening, power.Cost, customMoneyDigest(at600.Data), at600.Hash)
}

func TestCustomStartingMoneySessionDefaultCanonicalBytes(t *testing.T) {
	whole := int64(6000)
	cases := []struct { name, ruleset string; whole *int64 }{
		{"standard-omitted", "standard-v2", nil},
		{"standard-explicit6000", "standard-v2", &whole},
		{"custom-omitted", "custom-v1", nil},
		{"custom-explicit6000", "custom-v1", &whole},
	}
	var initial, paid SaveResult
	var replay []byte
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := customMoneyCreate(t, tc.whole, tc.ruleset)
			opening := customMoneySave(t, s)
			customMoneyCheckBalances(t, opening, sim.DefaultStartingCredits, 0, "standard-v2")
			if bytes.Contains(opening.Data, []byte(`"starting_credits"`)) { t.Fatal("canonical default persisted an optional amount") }
			if i == 0 { initial = opening }
			if opening.Hash != initial.Hash || !bytes.Equal(opening.Data, initial.Data) { t.Fatal("omitted/default launch changed current native bytes") }
			customMoneyStepTo(t, s, 100)
			if err := s.Submit(1, customMoneyPowerOrder(t, s)); err != nil { t.Fatal(err) }
			if _, err := s.Step(1); err != nil { t.Fatal(err) }
			v := customMoneyView(t, s, 1)
			if len(v.Results) != 1 || !v.Results[0].Accepted { t.Fatal("ordinary default paid order", v.Results) }
			power, ok := content.MustBase().Building("power")
			if !ok { t.Fatal("power catalog") }
			spent := customMoneySave(t, s)
			customMoneyCheckBalances(t, spent, sim.DefaultStartingCredits, power.Cost, "standard-v2")
			full := customMoneyExport(t, s)
			if i == 0 { paid, replay = spent, full }
			if spent.Hash != paid.Hash || !bytes.Equal(spent.Data, paid.Data) || !bytes.Equal(full, replay) { t.Fatal("canonical default paid Save/fullReplay bytes differ") }
			restored := customMoneySession(t)
			if _, err := restored.Load(spent.Data, spent.Local); err != nil { t.Fatal(err) }
			if !bytes.Equal(customMoneySave(t, restored).Data, spent.Data) { t.Fatal("canonical default restore changed bytes") }
			if _, err := restored.Restart(); err != nil { t.Fatal(err) }
			if !bytes.Equal(customMoneySave(t, restored).Data, initial.Data) { t.Fatal("canonical default Restart changed bytes") }
		})
	}
}

func customMoneyOriginalR3(t *testing.T, path string, size int, digest string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil { t.Fatal(err) }
	if len(b) != size || customMoneyDigest(b) != digest { t.Fatalf("original R3 fixture changed: %s", path) }
	return b
}

func TestCustomStartingMoneySessionRejectsOriginalR3Artifacts(t *testing.T) {
	const boundaryVersion = "0.3.8"
	if sim.Version != boundaryVersion { t.Fatalf("original036 boundary requires final simulation%s, found%s", boundaryVersion, sim.Version) }
	const savePath = "testdata/starting-money-r3-original.save.json"
	const replayPath = "testdata/starting-money-r3-original.replay.bin"
	const saveSHA = "09864830adf19bc0576353f87db77a467e960fb392603b631213435e3b07f531"
	const replaySHA = "5d1e1f2cb9aa1b9c18fd5f17eaf7cd2cfc959a6ddde929e1ae88f01cc1971937"
	oldSave := customMoneyOriginalR3(t, savePath, 733742, saveSHA)
	oldReplay := customMoneyOriginalR3(t, replayPath, 8049, replaySHA)
	state, _ := customMoneyState(t, oldSave)
	r, err := sim.DecodeReplay(oldReplay)
	if err != nil || state.Tick != 0 || state.StartingCredits != 0 || state.Metadata.Simulation != "0.3.6" || state.Metadata.Ruleset != "standard-v2" || r.Version != 2 || r.Metadata != state.Metadata || r.FinalTick != 240 || !bytes.Equal(r.Initial, oldSave) {
		t.Fatal("untouched earned R3 ordinary default fixture", err)
	}
	whole := int64(12000)
	s := customMoneyCreate(t, &whole, "custom-v1")
	before := customMoneySave(t, s)
	ops := []struct { name string; run func() error }{
		{"inspect-save", func() error { _, _, err := s.Inspect(oldSave); return err }},
		{"load-save", func() error { _, err := s.Load(oldSave, []sim.PlayerID{1}); return err }},
		{"inspect-replay", func() error { _, err := s.InspectReplay(oldReplay); return err }},
		{"load-replay", func() error { _, err := s.LoadReplay(oldReplay); return err }},
	}
	for _, op := range ops {
		t.Run(op.name, func(t *testing.T) {
			err := op.run()
			e, ok := err.(*Error)
			if !ok || e.Code != "save_incompatible" || !e.Recoverable || e.Found == nil || e.Expected == nil || *e.Found != state.Metadata || e.Expected.Simulation != sim.Version || e.Expected.ContentHash != s.ExpectedMetadata().ContentHash || !strings.Contains(strings.ToLower(e.Message), "export") {
				t.Fatalf("clear recoverable original036 mismatch: %+v", err)
			}
			after := customMoneySave(t, s)
			if after.Hash != before.Hash || !bytes.Equal(after.Data, before.Data) || s.Info().Replay { t.Fatal("rejected original replaced the active custom match") }
			if customMoneyDigest(oldSave) != saveSHA || customMoneyDigest(oldReplay) != replaySHA { t.Fatal("import mutated original buffers") }
			if !bytes.Equal(customMoneyOriginalR3(t, savePath, 733742, saveSHA), oldSave) || !bytes.Equal(customMoneyOriginalR3(t, replayPath, 8049, replaySHA), oldReplay) { t.Fatal("original files changed") }
		})
	}
}
