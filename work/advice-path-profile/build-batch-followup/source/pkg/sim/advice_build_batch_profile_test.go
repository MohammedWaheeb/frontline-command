package sim

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

// Diagnostic only: the capture tick was not recorded. These are exact replay
// states near the periodic client time bracket, never the exact timed-out state.
var buildAdviceTicks = []Tick{1272, 1527, 1713, 1884}

type capturedBuildAdvice struct {
	Independent bool    `json:"independent"`
	Entities    []ID    `json:"entities"`
	Orders      []Order `json:"orders"`
}

func buildAdviceInputs(t testing.TB) (string, capturedBuildAdvice) {
	t.Helper()
	root := os.Getenv("FRONTLINE_BUILD_ADVICE_INPUTS")
	if root == "" {
		t.Skip("explicit diagnostic only")
	}
	raw, err := os.ReadFile(filepath.Join(root, "request.json"))
	if err != nil {
		t.Fatal(err)
	}
	var req capturedBuildAdvice
	if err = json.Unmarshal(raw, &req); err != nil {
		t.Fatal(err)
	}
	if req.Independent || len(req.Entities) != 0 || len(req.Orders) != 24 {
		t.Fatal("not captured request")
	}
	for _, o := range req.Orders {
		if o.Kind != "build" || o.Type != "barracks" || len(o.Entities) != 1 || o.Entities[0] != 6 {
			t.Fatal("unexpected captured order")
		}
	}
	return root, req
}
func buildAdviceDigest(v any) string {
	raw, _ := json.Marshal(v)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func buildAdviceWrite(t testing.TB, path string, v any) {
	t.Helper()
	raw, err := json.MarshalIndent(v, "", "  ")
	if err == nil {
		err = os.WriteFile(path, append(raw, '\n'), 0644)
	}
	if err != nil {
		t.Fatal(err)
	}
}
func TestCapturedBuildAdviceReconstruction(t *testing.T) {
	root, req := buildAdviceInputs(t)
	out := os.Getenv("FRONTLINE_BUILD_ADVICE_OUTPUT")
	if out == "" {
		t.Fatal("missing output directory")
	}
	if err := os.MkdirAll(out, 0755); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "earned.replay.gz"))
	if err != nil {
		t.Fatal(err)
	}
	replay, err := DecodeReplay(raw)
	if err != nil {
		t.Fatal(err)
	}
	replaySum := sha256.Sum256(raw)
	catalog := content.MustBase()
	full := *replay
	full.Checkpoints = nil
	play, err := full.Open(catalog, buildAdviceTicks[0])
	if err != nil {
		t.Fatal(err)
	}
	var rows []map[string]any
	for _, tick := range buildAdviceTicks {
		for play.Engine().Tick() < tick {
			if err = play.Advance(); err != nil {
				t.Fatal(err)
			}
		}
		engine := play.Engine()
		indexed, err := replay.Seek(catalog, tick)
		if err != nil {
			t.Fatal(err)
		}
		if indexed.Hash() != engine.Hash() {
			t.Fatal("indexed/full replay state differs", tick)
		}
		before, err := engine.Save()
		if err != nil {
			t.Fatal(err)
		}
		hash := engine.Hash()
		views := map[PlayerID]string{}
		for _, p := range engine.state.Players {
			v, _ := engine.PlayerView(p.ID)
			views[p.ID] = buildAdviceDigest(v)
		}
		compact, err := engine.SaveForAdvice()
		if err != nil {
			t.Fatal(err)
		}
		a, err := PreviewSavedOrderAdvice(catalog, compact, 3, req.Orders)
		if err != nil {
			t.Fatal(err)
		}
		b, err := PreviewSavedOrderAdvice(catalog, before, 3, req.Orders)
		if err != nil || buildAdviceDigest(a) != buildAdviceDigest(b) {
			t.Fatal("compact/full advice differs", tick, err)
		}
		if len(a.Results) != 24 {
			t.Fatal("missing batch results")
		}
		aff, err := engine.CommandAffordances(3, req.Entities)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = PreviewSavedOrderAdvice(catalog, compact, 2, req.Orders); err == nil {
			t.Fatal("foreign rig request allowed")
		}
		after, err := engine.Save()
		if err != nil || !bytes.Equal(before, after) || engine.Hash() != hash {
			t.Fatal("source state changed", err)
		}
		for _, p := range engine.state.Players {
			v, _ := engine.PlayerView(p.ID)
			if views[p.ID] != buildAdviceDigest(v) {
				t.Fatal("source view changed", p.ID)
			}
		}
		name := fmt.Sprintf("tick-%d", tick)
		if err = os.WriteFile(filepath.Join(out, name+".save.json"), before, 0644); err != nil {
			t.Fatal(err)
		}
		owner, _ := engine.PlayerView(3)
		buildAdviceWrite(t, filepath.Join(out, name+".owner.json"), owner)
		codes := map[string]int{}
		for _, r := range a.Results {
			codes[r.Code]++
		}
		rig := engine.entity(6)
		rows = append(rows, map[string]any{"tick": tick, "hash": hash, "full_bytes": len(before), "advice_bytes": len(compact), "actors": len(engine.state.Entities), "rig_owner": rig.Owner, "rig_state": rig.State, "rig_orders": rig.Orders, "affordances": aff, "result": a, "codes": codes, "all_views_unchanged": true, "full_indexed_hash_equal": true, "full_compact_advice_equal": true, "save_unchanged": true})
	}
	buildAdviceWrite(t, filepath.Join(out, "reconstruction.json"), map[string]any{"scope": "exact neighboring replay states; exact server capture tick unknown", "replay_sha256": hex.EncodeToString(replaySum[:]), "final_tick": replay.FinalTick, "metadata": replay.Metadata, "states": rows})
}

var buildAdviceSink any

func BenchmarkCapturedBuildAdvice(b *testing.B) {
	_, req := buildAdviceInputs(b)
	out := os.Getenv("FRONTLINE_BUILD_ADVICE_OUTPUT")
	catalog := content.MustBase()
	for _, tick := range buildAdviceTicks {
		b.Run(fmt.Sprintf("tick%d", tick), func(b *testing.B) {
			raw, err := os.ReadFile(filepath.Join(out, fmt.Sprintf("tick-%d.save.json", tick)))
			if err != nil {
				b.Fatal(err)
			}
			engine, err := Restore(catalog, raw)
			if err != nil {
				b.Fatal(err)
			}
			compact, err := engine.SaveForAdvice()
			if err != nil {
				b.Fatal(err)
			}
			measure := func(name string, f func() any) {
				b.Run(name, func(b *testing.B) {
					b.ReportAllocs()
					b.ResetTimer()
					for range b.N {
						buildAdviceSink = f()
					}
				})
			}
			measure("EmptyAffordances", func() any {
				v, e := engine.CommandAffordances(3, req.Entities)
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("SaveForAdvice", func() any {
				v, e := engine.SaveForAdvice()
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("RestoreAdvice", func() any {
				v, e := Restore(catalog, compact)
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("SavedBatch24", func() any {
				v, e := PreviewSavedOrderAdvice(catalog, compact, 3, req.Orders)
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("SavedFirstOrder", func() any {
				v, e := PreviewSavedOrderAdvice(catalog, compact, 3, req.Orders[:1])
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			// Every detached invocation gets a fresh clone outside the timing window;
			// unlike an actual HTTP request this stage excludes Restore deliberately.
			b.Run("DetachedBatch24", func(b *testing.B) {
				b.ReportAllocs()
				for range b.N {
					b.StopTimer()
					clone, e := Restore(catalog, compact)
					if e != nil {
						b.Fatal(e)
					}
					b.StartTimer()
					v, e := clone.previewDetachedAdvice(3, req.Orders)
					if e != nil {
						b.Fatal(e)
					}
					buildAdviceSink = v
				}
			})
		})
	}
}
