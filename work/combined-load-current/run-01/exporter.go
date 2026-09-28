package sim

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

// This prepared late-game geometry exercises the approved actor limits. It is
// not a shipping map, a build-up journey, or a faction-balance claim. After the
// opening save, every change uses normal Submit/Advance, including all returns.
func TestExportCurrentCombinedBrowserLoad(t *testing.T) {
	dir := os.Getenv("FRONTLINE_COMBINED_LOAD_DIR")
	if dir == "" {
		t.Skip("explicit isolated fixture export only")
	}
	if err := os.Mkdir(dir, 0755); err != nil {
		t.Fatal("refuse to replace earlier evidence", err)
	}
	write := func(name string, value any) {
		t.Helper()
		data, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dir, name), append(data, '\n'), 0600); err != nil {
			t.Fatal(err)
		}
	}
	e, aircraft := exteriorMaximumFixture(t)
	armies, flyers := map[PlayerID][]ID{}, map[PlayerID][]ID{}
	sites := map[PlayerID]*Entity{}
	for i, p := range e.state.Players {
		buildingIndex, scoutIndex := 0, 0
		for _, v := range e.state.Entities {
			if v.Owner != p.ID {
				continue
			}
			if v.Building {
				typ := v.Type
				switch {
				case buildingIndex >= 1 && buildingIndex <= 8:
					typ = "abm"
				case buildingIndex == 21:
					typ = "radar"
				case buildingIndex == 22:
					typ = "tech"
				case buildingIndex == 23:
					typ = "strategic"
				}
				if typ != v.Type {
					b, ok := e.buildingRule(typ)
					if !ok {
						t.Fatal("missing building", typ)
					}
					v.Type, v.HP, v.MaxHP, v.Paid = typ, b.HP, b.HP, b.Cost
					v.FootprintWidth, v.FootprintHeight, v.FootprintType = b.Width, b.Height, typ
				}
				if typ == "abm" {
					v.Charges = 2
				}
				if typ == "strategic" {
					v.ChargeWork = e.strategicCharge(p.Faction)
					sites[p.ID] = v
				}
				buildingIndex++
				continue
			}
			if v.Type == "IR.isr" {
				v.Orders = nil
				flyers[p.ID] = append(flyers[p.ID], v.ID)
				continue
			}
			if e.role(v) != "recon" {
				continue
			}
			if scoutIndex == 0 {
				// A real scout reveals the next enemy base; no global fog grant.
				target := (i + 1) % 4
				v.Position = Vec{X: int32(8000+(target%2)*90000) - 4000, Y: int32(8000+(target/2)*90000) + 6000}
				v.Anchor, v.LastPosition = v.Position, v.Position
			} else {
				armies[p.ID] = append(armies[p.ID], v.ID)
			}
			scoutIndex++
		}
	}
	e.state.NavigationRevision++
	e.recalculate()
	e.updateFog()
	if len(e.state.Entities) != 688 || len(aircraft) != 64 {
		t.Fatal("wrong actor or aircraft maximum")
	}
	for _, p := range e.state.Players {
		if p.Supply != 100 || p.Tier != 3 || p.LowPower() || len(flyers[p.ID]) != 16 || len(armies[p.ID]) != 83 || sites[p.ID] == nil {
			t.Fatal("illegal fixture", p.ID, p.Supply, p.Tier, p.PowerDemand, p.PowerCapacity)
		}
	}
	opening, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(dir, "opening.json"), opening, 0600); err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, opening)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("opening restore", err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	type request struct {
		Tick     uint32   `json:"tick"`
		Player   PlayerID `json:"player"`
		Sequence uint32   `json:"sequence"`
		Orders   []Order  `json:"orders"`
	}
	type observation struct {
		Tick        Tick   `json:"tick"`
		Hash        string `json:"hash"`
		Entities    int    `json:"entities"`
		Projectiles int    `json:"projectiles"`
		Events      int    `json:"events"`
		ViewSHA256  string `json:"view_sha256"`
	}
	commands := []request{}
	frames := []observation{}
	initialHash := e.Hash()
	var sequence uint32
	const ticks = 600
	peakProjectiles, fired, intercepted, peakReturning, landed := 0, 0, 0, 0, 0
	measurements := []time.Duration{}
	// Cleanup also retains useful authoritative state if any strict gate fails.
	t.Cleanup(func() {
		saved, saveErr := e.Save()
		if saveErr != nil {
			t.Errorf("final save: %v", saveErr)
		} else if err := os.WriteFile(filepath.Join(dir, "final.save.json"), saved, 0600); err != nil {
			t.Error(err)
		}
		if err := replay.Capture(e, false); err != nil {
			t.Error(err)
		}
		data, err := json.Marshal(replay)
		if err == nil {
			err = os.WriteFile(filepath.Join(dir, "replay.json"), data, 0600)
		}
		if err != nil {
			t.Error(err)
		}
		result := map[string]any{
			"scope": "prepared legal688 actors;64 ordinary aircraft returns;332 mass-routed scouts;24 paid strategic missiles and finite interception;natural owner1 view;not a shipping map, balance result, long match or reference-hardware certification",
			"ticks": ticks, "actual_tick": e.Tick(), "actors": 688, "aircraft": 64, "landed": landed,
			"initial_hash": initialHash, "final_hash": e.Hash(), "commands": commands, "frames": frames,
			"peak_projectiles": peakProjectiles, "interceptors_fired": fired, "missiles_intercepted": intercepted, "peak_returning": peakReturning, "passed": !t.Failed(),
		}
		if len(measurements) > 0 {
			sort.Slice(measurements, func(i, j int) bool { return measurements[i] < measurements[j] })
			result["native_advance_ms"] = map[string]float64{"p50": float64(measurements[len(measurements)*50/100]) / float64(time.Millisecond), "p95": float64(measurements[len(measurements)*95/100]) / float64(time.Millisecond), "p99": float64(measurements[len(measurements)*99/100]) / float64(time.Millisecond)}
		}
		data, err = json.MarshalIndent(result, "", "  ")
		if err == nil {
			err = os.WriteFile(filepath.Join(dir, "native.json"), append(data, '\n'), 0600)
		}
		if err != nil {
			t.Error(err)
		}
	})
	submit := func(p PlayerID, orders []Order) {
		t.Helper()
		sequence++
		commands = append(commands, request{uint32(e.Tick()), p, sequence, orders})
		if err := e.Submit(p, sequence, orders); err != nil {
			t.Fatal("ordinary order", err)
		}
	}
	// Sequential global request IDs match OfflineTransport across perspectives.
	for i, p := range e.state.Players {
		submit(p.ID, []Order{{Kind: "return", Entities: flyers[p.ID]}})
		target := (i + 1) % 4
		x, y := int32(8000+(target%2)*90000), int32(8000+(target/2)*90000)
		submit(p.ID, []Order{{Kind: "ability", Type: "strategic", Entities: []ID{sites[p.ID].ID}, Points: []Vec{{X: x, Y: y}, {X: x + 2000, Y: y}, {X: x + 4000, Y: y}}}})
	}
	for tick := 0; tick < ticks; tick++ {
		if tick%80 == 0 {
			for _, p := range e.state.Players {
				ids := armies[p.ID]
				for start := 0; start < len(ids); start += 64 {
					goal := Vec{X: 74000 + int32(tick/80%2)*12000, Y: 74000 + int32(tick/80%2)*12000}
					submit(p.ID, []Order{{Kind: "move", Entities: ids[start:min(start+64, len(ids))], Position: goal}})
				}
			}
		}
		start := time.Now()
		e.Advance()
		measurements = append(measurements, time.Since(start))
		for _, result := range e.state.Results {
			if !result.Accepted {
				t.Fatal("execution rejected", result)
			}
		}
		peakProjectiles = max(peakProjectiles, len(e.state.Projectiles))
		returning := 0
		landed = 0
		for _, id := range aircraft {
			v := e.entity(id)
			if v == nil || v.HP <= 0 {
				t.Fatal("aircraft lost", id, e.Tick())
			}
			if v.Landed {
				landed++
			} else {
				returning++
			}
		}
		peakReturning = max(peakReturning, returning)
		for _, event := range e.state.Events {
			switch event.Kind {
			case "interceptor_fired":
				fired++
			case "missile_intercepted":
				intercepted++
			}
		}
		if e.Tick()%4 == 0 {
			view, ok := e.PlayerView(1)
			if !ok {
				t.Fatal("owner view missing")
			}
			data, err := json.Marshal(view)
			if err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(data)
			frames = append(frames, observation{e.Tick(), e.Hash(), len(view.Entities), len(view.Projectiles), len(view.Events), hex.EncodeToString(digest[:])})
		}
		if e.Tick() == 300 || e.Tick() == 600 {
			save, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			check, err := Restore(e.catalog, save)
			if err != nil || check.Hash() != e.Hash() {
				t.Fatal("midpoint/final restore", err)
			}
			for _, p := range e.state.Players {
				before, _ := e.PlayerView(p.ID)
				after, _ := check.PlayerView(p.ID)
				a, _ := json.Marshal(before)
				b, _ := json.Marshal(after)
				if !bytes.Equal(a, b) {
					t.Fatal("restore changed authorized view", p.ID, e.Tick())
				}
			}
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			write(fmt.Sprintf("checkpoint-%03d.json", e.Tick()), map[string]any{"tick": e.Tick(), "hash": e.Hash(), "four_views_exact": true})
		}
	}
	if len(commands) != 72 || len(frames) != 150 || peakProjectiles < 24 || fired != 24 || intercepted != 24 || peakReturning != 64 || landed != 64 {
		t.Fatal("combined workload incomplete", len(commands), len(frames), peakProjectiles, fired, intercepted, peakReturning, landed)
	}
	for _, frame := range frames {
		if frame.Tick != 300 && frame.Tick != 600 {
			continue
		}
		replayed, err := replay.Seek(e.catalog, frame.Tick)
		if err != nil || replayed.Hash() != frame.Hash {
			t.Fatal("checkpoint replay", frame.Tick, err)
		}
		full := *replay
		full.Checkpoints = nil
		replayed, err = full.Seek(e.catalog, frame.Tick)
		if err != nil || replayed.Hash() != frame.Hash {
			t.Fatal("full replay", frame.Tick, err)
		}
	}
	t.Logf("688 actors,64 returned,24 missiles intercepted,72 public batches,150 owner frames; final %s", e.Hash())
}
