package viewproto

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Independent compatibility oracle: the exact prior production conversion.
func jsonSnapshot(t testing.TB, view sim.View) *pb.PlayerSnapshot {
	t.Helper()
	data, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	out := new(pb.PlayerSnapshot)
	if err = protojson.Unmarshal(data, out); err != nil {
		t.Fatal(err)
	}
	return out
}
func wire(t testing.TB, value proto.Message) []byte {
	t.Helper()
	data, err := proto.MarshalOptions{Deterministic: true}.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func fill(value reflect.Value, rng *rand.Rand, mode int) {
	switch value.Kind() {
	case reflect.Struct:
		for i := 0; i < value.NumField(); i++ {
			fill(value.Field(i), rng, mode)
		}
	case reflect.Pointer:
		if mode == 2 && rng.Intn(3) == 0 {
			return
		}
		value.Set(reflect.New(value.Type().Elem()))
		fill(value.Elem(), rng, mode)
	case reflect.Slice:
		n := 1
		if mode == 2 {
			n = rng.Intn(4)
		}
		value.Set(reflect.MakeSlice(value.Type(), n, n))
		for i := 0; i < n; i++ {
			fill(value.Index(i), rng, mode)
		}
	case reflect.String:
		if mode == 1 {
			return
		}
		values := []string{"", "AIR & ground <field>", "قيادة الميدان", "e\u0301", "\xff\xfe\xc0\x80\xed\xa0\x80"}
		value.SetString(values[rng.Intn(len(values))])
	case reflect.Bool:
		value.SetBool(mode != 1 && rng.Intn(2) == 1)
	case reflect.Int32:
		if mode == 1 {
			return
		}
		values := []int64{0, -1, 1, math.MinInt32, math.MaxInt32}
		value.SetInt(values[rng.Intn(len(values))])
	case reflect.Int64:
		if mode == 1 {
			return
		}
		values := []int64{0, -1, 1, math.MinInt64, math.MaxInt64, 9007199254740993}
		value.SetInt(values[rng.Intn(len(values))])
	case reflect.Uint32:
		if mode == 1 {
			return
		}
		values := []uint64{0, 1, math.MaxUint32}
		value.SetUint(values[rng.Intn(len(values))])
	case reflect.Uint64:
		if mode == 1 {
			return
		}
		values := []uint64{0, 1, math.MaxUint64, 9007199254740993}
		value.SetUint(values[rng.Intn(len(values))])
	default:
		panic("untested public view type " + value.Type().String())
	}
}
func erase(value reflect.Value) {
	switch value.Kind() {
	case reflect.Pointer:
		if !value.IsNil() {
			erase(value.Elem())
		}
	case reflect.Struct:
		for i := 0; i < value.NumField(); i++ {
			erase(value.Field(i))
		}
	case reflect.Slice:
		for i := 0; i < value.Len(); i++ {
			erase(value.Index(i))
		}
	default:
		value.SetZero()
	}
}
func TestSnapshotMatchesPriorJSONContract(t *testing.T) {
	cases := []sim.View{{}}
	for mode := 1; mode <= 2; mode++ {
		for seed := int64(0); seed < 100; seed++ {
			var view sim.View
			fill(reflect.ValueOf(&view).Elem(), rand.New(rand.NewSource(seed)), mode)
			cases = append(cases, view)
		}
	}
	for index, view := range cases {
		want, got := jsonSnapshot(t, view), Snapshot(view)
		if !proto.Equal(got, want) || !bytes.Equal(wire(t, got), wire(t, want)) {
			t.Fatalf("case %d differs\ngot %s\nwant %s", index, got, want)
		}
		// The old JSON roundtrip detached every nested array, message and optional
		// pointer. Conversion must retain that boundary for asynchronous consumers.
		before := wire(t, got)
		erase(reflect.ValueOf(&view).Elem())
		if !bytes.Equal(before, wire(t, got)) {
			t.Fatalf("case %d aliases input", index)
		}
	}
}
func TestOptionalZeroPresenceAndAbsentPrivate(t *testing.T) {
	view := sim.View{Entities: []sim.EntityView{{ID: 1}, {ID: 2, Private: &sim.EntityPrivate{Ranges: &sim.EntityRanges{Interception: &sim.InterceptionView{NextChargeTicks: pointer(uint32(0))}}}}}, Projectiles: []sim.ProjectileView{{}}, Warnings: []sim.OperationWarning{{Splash: pointer(int32(0))}, {}}}
	out := Snapshot(view)
	if out.Entities[0].Private != nil {
		t.Fatal("invented private data")
	}
	if out.Entities[1].Private.EmergencyTakeoffUntil == nil || out.Entities[1].Private.Ranges.Interception.NextChargeTicks == nil || out.Projectiles[0].Splash == nil || out.Projectiles[0].PositionVisible == nil || out.Warnings[0].Splash == nil {
		t.Fatal("lost explicit zero/false presence")
	}
	if out.Warnings[1].Splash != nil {
		t.Fatal("invented warning geometry")
	}
	if !proto.Equal(out, jsonSnapshot(t, view)) {
		t.Fatal("optional wire semantics differ")
	}
	view.Entities[1].Private.Ranges.Interception.NextChargeTicks = nil
	if Snapshot(view).Entities[1].Private.Ranges.Interception.NextChargeTicks != nil {
		t.Fatal("invented deadline")
	}
}
func benchmarkView() sim.View {
	var view sim.View
	fill(reflect.ValueOf(&view).Elem(), rand.New(rand.NewSource(8)), 1)
	view.Entities = make([]sim.EntityView, 257)
	for i := range view.Entities {
		fill(reflect.ValueOf(&view.Entities[i]).Elem(), rand.New(rand.NewSource(int64(i))), 2)
		view.Entities[i].ID = sim.ID(i + 1)
	}
	view.Explored = make([]bool, 128*128)
	view.Visible = make([]bool, 128*128)
	for i := range view.Visible {
		view.Visible[i] = i%3 == 0
		view.Explored[i] = i%5 != 0
	}
	return view
}

var sink *pb.PlayerSnapshot

func BenchmarkSnapshotConversion(b *testing.B) {
	view := benchmarkView()
	for _, direct := range []bool{false, true} {
		name := "JSON"
		if direct {
			name = "Direct"
		}
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				if direct {
					sink = Snapshot(view)
				} else {
					sink = jsonSnapshot(b, view)
				}
			}
		})
	}
}

// Actual engine saves cover public/private fog, combat, parking, assignments,
// charge deadlines and restored state. Inputs are never rewritten or relabeled.
func TestActualGoSavedViewsMatchJSON(t *testing.T) {
	dirs := filepath.SplitList(os.Getenv("FRONTLINE_SNAPSHOT_SAVE_DIRS"))
	if len(dirs) == 0 {
		t.Skip("requires exact current Go save fixtures")
	}
	catalog := content.MustBase()
	saves, views := 0, 0
	for _, dir := range dirs {
		err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !strings.HasSuffix(path, ".save.json") {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			engine, err := sim.Restore(catalog, data)
			if err != nil {
				return err
			}
			before := engine.Hash()
			saves++
			for _, player := range engine.StateCopy().Players {
				view, ok := engine.PlayerView(player.ID)
				if !ok {
					t.Fatal("missing player", path, player.ID)
				}
				got, want := Snapshot(view), jsonSnapshot(t, view)
				if !proto.Equal(got, want) || !bytes.Equal(wire(t, got), wire(t, want)) {
					t.Fatalf("real save %s player%d differs", path, player.ID)
				}
				views++
			}
			if engine.Hash() != before {
				t.Fatal("view conversion changed state", path)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if saves < 20 || views < 40 {
		t.Fatal("insufficient actual save coverage", saves, views)
	}
	t.Logf("%d exact Go saves, %d player views, detached wire parity", saves, views)
}
