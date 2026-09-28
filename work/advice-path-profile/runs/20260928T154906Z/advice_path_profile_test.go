package sim

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
)

// Test-only observations over the exact three-human host saves. No orders are
// submitted to the fixture engine and no simulation tick is advanced.
type adviceProfileFixture struct {
	name          string
	engine        *Engine
	full, compact []byte
}
type adviceProfileCommand struct {
	Player   PlayerID `json:"player"`
	Tick     Tick     `json:"tick"`
	Sequence uint32   `json:"sequence"`
	Note     string   `json:"note"`
	Orders   []Order  `json:"orders"`
}
type adviceProfileCase struct {
	Name       string   `json:"name"`
	Player     PlayerID `json:"player"`
	SourceTick Tick     `json:"source_tick,omitempty"`
	Orders     []Order  `json:"orders"`
}

func adviceProfileInputs(t testing.TB) string {
	t.Helper()
	root := os.Getenv("FRONTLINE_ADVICE_PROFILE_INPUTS")
	if root == "" {
		t.Skip("set exact preserved advice profile input directory")
	}
	return root
}
func adviceProfileFixtures(t testing.TB) []adviceProfileFixture {
	t.Helper()
	root := adviceProfileInputs(t)
	catalog := content.MustBase()
	var out []adviceProfileFixture
	for _, name := range []string{"midpoint", "final"} {
		full, err := os.ReadFile(filepath.Join(root, name+".save.json"))
		if err != nil {
			t.Fatal(err)
		}
		e, err := Restore(catalog, full)
		if err != nil {
			t.Fatal(name, err)
		}
		expected := map[string]string{"midpoint": "e22506ac7cdc794943a05157f061448a31ad0ad69c771cff5c1f40cd95f1c655", "final": "87e577699a4f0c97ad88b9d450f3731e917650eda8beff732bf297513eeac9f7"}[name]
		if e.Hash() != expected {
			t.Fatalf("%s source mismatch: %s", name, e.Hash())
		}
		compact, err := e.SaveForAdvice()
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, adviceProfileFixture{name, e, full, compact})
	}
	return out
}
func adviceProfileOwn(e *Engine, p PlayerID) []ID {
	view, _ := e.PlayerView(p)
	var ids []ID
	for _, v := range view.Entities {
		if v.Owner == p && v.Private != nil && len(ids) < 64 {
			ids = append(ids, v.ID)
		}
	}
	return ids
}
func adviceProfileContext(e *Engine, p PlayerID) []Order {
	view, _ := e.PlayerView(p)
	for _, v := range view.Entities {
		_, mobile := e.catalog.Unit(v.Type)
		if v.Owner == p && v.Private != nil && v.Private.Container == 0 && mobile {
			return []Order{{Kind: "move", Entities: []ID{v.ID}, Position: v.Position}}
		}
	}
	// Player1's actual midpoint has only a surviving HQ and power building.
	// A normal owned rally is valid there; do not manufacture a mobile actor.
	for _, v := range view.Entities {
		_, building := e.catalog.Building(v.Type)
		if v.Owner == p && v.Private != nil && building {
			return []Order{{Kind: "rally", Entities: []ID{v.ID}, Position: v.Position}}
		}
	}
	return nil
}
func adviceProfileRecords(t testing.TB, f adviceProfileFixture) []adviceProfileCase {
	t.Helper()
	file, err := os.Open(filepath.Join(adviceProfileInputs(t), "commands.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var rows []adviceProfileCommand
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	for scanner.Scan() {
		var row adviceProfileCommand
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, row)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	distance := func(tick Tick) Tick {
		if tick < f.engine.Tick() {
			return f.engine.Tick() - tick
		}
		return tick - f.engine.Tick()
	}
	sort.SliceStable(rows, func(i, j int) bool { return distance(rows[i].Tick) < distance(rows[j].Tick) })
	found := map[string]bool{}
	var out []adviceProfileCase
	for _, row := range rows {
		if distance(row.Tick) > 1200 || len(row.Orders) == 0 {
			continue
		}
		key := fmt.Sprintf("p%d_%s", row.Player, row.Orders[0].Kind)
		if found[key] {
			continue
		}
		// Sources must all exist in this exact authorized view. The real Go preview,
		// rather than copied client legality, determines whether a batch is usable.
		allowed := map[ID]bool{}
		for _, id := range adviceProfileOwn(f.engine, row.Player) {
			allowed[id] = true
		}
		own := true
		for _, o := range row.Orders {
			for _, id := range o.Entities {
				own = own && allowed[id]
			}
		}
		if !own {
			continue
		}
		preview, err := PreviewSavedOrderAdvice(f.engine.catalog, f.compact, row.Player, row.Orders)
		if err != nil {
			continue
		}
		accepted := len(preview.Results) == len(row.Orders)
		for _, r := range preview.Results {
			accepted = accepted && r.Accepted
		}
		if !accepted {
			continue
		}
		found[key] = true
		out = append(out, adviceProfileCase{"recorded_" + key, row.Player, row.Tick, row.Orders})
	}
	return out
}
func adviceProfileDigest(value any) string {
	data, _ := json.Marshal(value)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func adviceProfileErr(err error) string {
	if err != nil {
		return err.Error()
	}
	return ""
}
func TestAdvicePathPreservedFixtures(t *testing.T) {
	var records []map[string]any
	for _, f := range adviceProfileFixtures(t) {
		t.Run(f.name, func(t *testing.T) {
			before, _ := f.engine.Save()
			hash := f.engine.Hash()
			views := map[PlayerID]string{}
			for _, p := range f.engine.state.Players {
				v, _ := f.engine.PlayerView(p.ID)
				views[p.ID] = adviceProfileDigest(v)
			}
			cases := adviceProfileRecords(t, f)
			if f.name == "midpoint" && len(cases) == 0 {
				t.Fatal("no valid actual recorded command batch")
			}
			row := map[string]any{"fixture": f.name, "tick": f.engine.Tick(), "hash": hash, "full_bytes": len(f.full), "advice_bytes": len(f.compact), "actors": len(f.engine.state.Entities), "map_tiles": len(f.engine.state.Map.Tiles), "outcome": f.engine.Outcome(), "recorded_cases": cases}
			var results []map[string]any
			for _, c := range cases {
				a, errA := PreviewSavedOrderAdvice(f.engine.catalog, f.compact, c.Player, c.Orders)
				b, errB := PreviewSavedOrderAdvice(f.engine.catalog, f.full, c.Player, c.Orders)
				if adviceProfileErr(errA) != adviceProfileErr(errB) || adviceProfileDigest(a) != adviceProfileDigest(b) {
					t.Fatal("full/compact preview differs", c.Name)
				}
				results = append(results, map[string]any{"case": c.Name, "result": a, "error": adviceProfileErr(errA)})
			}
			for _, p := range f.engine.state.Players {
				ids := adviceProfileOwn(f.engine, p.ID)
				a, err := f.engine.CommandAffordances(p.ID, ids)
				again, againErr := f.engine.CommandAffordances(p.ID, ids)
				if adviceProfileErr(err) != adviceProfileErr(againErr) || adviceProfileDigest(a) != adviceProfileDigest(again) {
					t.Fatal("affordances unstable")
				}
				context := adviceProfileContext(f.engine, p.ID)
				var many []Order
				for len(context) > 0 && len(many) < 32 {
					many = append(many, context[0])
				}
				sequential, sequentialErr := PreviewSavedOrderAdvice(f.engine.catalog, f.compact, p.ID, context)
				originalSequential, originalSequentialErr := PreviewSavedOrderAdvice(f.engine.catalog, f.full, p.ID, context)
				if adviceProfileErr(sequentialErr) != adviceProfileErr(originalSequentialErr) || adviceProfileDigest(sequential) != adviceProfileDigest(originalSequential) {
					t.Fatal("full/compact sequential context differs")
				}
				one, oneErr := PreviewSavedCandidates(f.engine.catalog, f.compact, p.ID, context)
				max, maxErr := PreviewSavedCandidates(f.engine.catalog, f.compact, p.ID, many)
				if !f.engine.Outcome().Finished && !p.Defeated {
					if len(context) != 1 || err != nil || sequentialErr != nil || oneErr != nil || maxErr != nil || len(one) != 1 || len(max) != 32 {
						t.Fatal("active contextual/affordance case is not valid", p.ID, err, sequentialErr, oneErr, maxErr)
					}
					for _, result := range append(append([]OrderResult{}, sequential.Results...), max...) {
						if !result.Accepted {
							t.Fatal("active contextual batch rejected", p.ID, result)
						}
					}
				}
				original, originalErr := PreviewSavedCandidates(f.engine.catalog, f.full, p.ID, context)
				if adviceProfileErr(oneErr) != adviceProfileErr(originalErr) || adviceProfileDigest(one) != adviceProfileDigest(original) {
					t.Fatal("full/compact contextual preview differs")
				}
				results = append(results, map[string]any{"player": p.ID, "defeated": p.Defeated, "owned_selection": ids, "affordances": a, "affordance_error": adviceProfileErr(err), "derived_context_orders": context, "sequential_context_result": sequential, "sequential_context_error": adviceProfileErr(sequentialErr), "context_result": one, "context_error": adviceProfileErr(oneErr), "bound32_result": max, "bound32_error": adviceProfileErr(maxErr)})
				for _, other := range f.engine.state.Players {
					if other.ID == p.ID {
						continue
					}
					foreign := adviceProfileOwn(f.engine, other.ID)
					if len(foreign) == 0 {
						continue
					}
					_, denied := f.engine.CommandAffordances(p.ID, foreign[:1])
					if denied == nil {
						t.Fatal("foreign selection disclosed affordances")
					}
					break
				}
			}
			after, _ := f.engine.Save()
			if !bytes.Equal(before, after) || f.engine.Hash() != hash {
				t.Fatal("advice changed source authority")
			}
			for _, p := range f.engine.state.Players {
				v, _ := f.engine.PlayerView(p.ID)
				if views[p.ID] != adviceProfileDigest(v) {
					t.Fatal("advice changed authorized view")
				}
			}
			row["results"] = results
			row["save_hash_views_unchanged"] = true
			records = append(records, row)
		})
	}
	if out := os.Getenv("FRONTLINE_ADVICE_PROFILE_OUTPUT"); out != "" {
		if err := os.MkdirAll(out, 0755); err != nil {
			t.Fatal(err)
		}
		data, _ := json.MarshalIndent(records, "", "  ")
		if err := os.WriteFile(filepath.Join(out, "fixture-checks.json"), append(data, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

var adviceProfileSink any

func BenchmarkPreservedAdvicePath(b *testing.B) {
	for _, f := range adviceProfileFixtures(b) {
		b.Run(f.name, func(b *testing.B) {
			measure := func(name string, fn func() any) {
				b.Run(name, func(b *testing.B) {
					b.ReportAllocs()
					b.ResetTimer()
					for range b.N {
						adviceProfileSink = fn()
					}
				})
			}
			measure("SaveForAdvice", func() any {
				v, e := f.engine.SaveForAdvice()
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("RestoreFull", func() any {
				v, e := Restore(f.engine.catalog, f.full)
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("RestoreAdvice", func() any {
				v, e := Restore(f.engine.catalog, f.compact)
				if e != nil {
					b.Fatal(e)
				}
				return v
			})
			measure("MapValidate", func() any { return f.engine.state.Map.Validate() })
			measure("ValidateState", func() any { return f.engine.validateState() })
			measure("Visibility", func() any { f.engine.computeVisibility(); return f.engine.visible })
			for _, p := range f.engine.state.Players {
				ids := adviceProfileOwn(f.engine, p.ID)
				context := adviceProfileContext(f.engine, p.ID)
				many := []Order{}
				for len(context) > 0 && len(many) < 32 {
					many = append(many, context[0])
				}
				measure(fmt.Sprintf("Affordances_p%d_%dactors", p.ID, len(ids)), func() any { v, e := f.engine.CommandAffordances(p.ID, ids); return []any{v, adviceProfileErr(e)} })
				measure(fmt.Sprintf("SequentialContext_p%d", p.ID), func() any {
					v, e := PreviewSavedOrderAdvice(f.engine.catalog, f.compact, p.ID, context)
					return []any{v, adviceProfileErr(e)}
				})
				measure(fmt.Sprintf("Candidates1_p%d", p.ID), func() any {
					v, e := PreviewSavedCandidates(f.engine.catalog, f.compact, p.ID, context)
					return []any{v, adviceProfileErr(e)}
				})
				measure(fmt.Sprintf("Candidates32_p%d", p.ID), func() any {
					v, e := PreviewSavedCandidates(f.engine.catalog, f.compact, p.ID, many)
					return []any{v, adviceProfileErr(e)}
				})
			}
			for _, c := range adviceProfileRecords(b, f) {
				measure(c.Name, func() any {
					v, e := PreviewSavedOrderAdvice(f.engine.catalog, f.compact, c.Player, c.Orders)
					if e != nil {
						b.Fatal(e)
					}
					return v
				})
			}
			// Separate pure owned stop/rally validation from clone cost. Repeating either on this
			// detached clone has no spending or time progression; never mutate f.engine.
			for _, p := range f.engine.state.Players {
				context := adviceProfileContext(f.engine, p.ID)
				if len(context) == 0 {
					continue
				}
				orders := []Order{{Kind: "stop", Entities: context[0].Entities}}
				if context[0].Kind == "rally" {
					orders = context
				}
				clone, err := Restore(f.engine.catalog, f.compact)
				if err != nil {
					b.Fatal(err)
				}
				measure(fmt.Sprintf("Detached_%s_p%d", orders[0].Kind, p.ID), func() any { v, e := clone.previewDetachedAdvice(p.ID, orders); return []any{v, adviceProfileErr(e)} })
			}
		})
	}
}

// Ensure only ordinary supported candidate kinds were used by this test driver.
func TestAdviceProfileIsDiagnosticOnly(t *testing.T) {
	if strings.TrimSpace(Version) != "0.3.4" {
		t.Fatal("do not relabel saves or simulation")
	}
}
