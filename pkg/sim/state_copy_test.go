package sim

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"frontlinecommand/pkg/content"
)

// StateCopy is a detached backend/debug view. Keep its former JSON round-trip
// shape, including nil versus empty optional slices, without doing that work on
// the game loop. Filling by reflection also covers fields added to State later.
func TestStateCopyMatchesJSONAndOwnsEveryMutableField(t *testing.T) {
	if got := (&Engine{}).StateCopy(); !reflect.DeepEqual(got, State{}) {
		t.Fatal("StateCopy changed nil fields in a zero state")
	}
	for _, empty := range []bool{false, true} {
		t.Run(map[bool]string{false: "populated", true: "empty-slices"}[empty], func(t *testing.T) {
			e := &Engine{}
			fillSnapshotValue(reflect.ValueOf(&e.state).Elem(), empty, 0)
			before, err := json.Marshal(e.state)
			if err != nil {
				t.Fatal(err)
			}
			var oracle State
			if err := json.Unmarshal(before, &oracle); err != nil {
				t.Fatal(err)
			}
			copy := e.StateCopy()
			if !reflect.DeepEqual(copy, oracle) {
				t.Fatal("StateCopy changed the JSON round-trip value or optional-slice shape")
			}
			mutateSnapshotValue(reflect.ValueOf(&copy).Elem())
			after, err := json.Marshal(e.state)
			if err != nil || string(after) != string(before) {
				t.Fatal("mutating a detached StateCopy changed live state", err)
			}
		})
	}
}

func TestStateCopyRetainsJSONNormalizationOfNativeConfigStrings(t *testing.T) {
	for _, field := range []string{"name", "ruleset"} {
		t.Run(field, func(t *testing.T) {
			cfg := Config{Map: fixtureMap(), Seed: 9, Players: []PlayerConfig{{ID: 1, Name: "Commander", Faction: "US", Team: 1}}}
			if field == "name" {
				cfg.Players[0].Name = "Commander\xff\xfe"
			} else {
				cfg.Ruleset = "custom\xff\xfe"
			}
			e, err := New(content.MustBase(), cfg)
			if err != nil {
				t.Fatal(err)
			}
			before, err := json.Marshal(e.state)
			if err != nil {
				t.Fatal(err)
			}
			var oracle State
			if err := json.Unmarshal(before, &oracle); err != nil {
				t.Fatal(err)
			}
			copy := e.StateCopy()
			if !reflect.DeepEqual(copy, oracle) {
				t.Fatal("StateCopy changed JSON's per-byte invalid UTF-8 replacement")
			}
			if field == "name" && !strings.HasSuffix(copy.Players[0].Name, "\ufffd\ufffd") || field == "ruleset" && !strings.HasSuffix(copy.Metadata.Ruleset, "\ufffd\ufffd") {
				t.Fatal("fixture did not exercise two consecutive invalid bytes")
			}
			mutateSnapshotValue(reflect.ValueOf(&copy).Elem())
			after, err := json.Marshal(e.state)
			if err != nil || string(after) != string(before) {
				t.Fatal("fallback StateCopy shared mutable state", err)
			}
		})
	}
}

func fillSnapshotValue(v reflect.Value, empty bool, depth int) {
	if depth > 16 {
		return
	}
	switch v.Kind() {
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			fillSnapshotValue(v.Field(i), empty, depth+1)
			if empty && v.Field(i).Kind() == reflect.Slice && strings.Contains(v.Type().Field(i).Tag.Get("json"), ",omitempty") {
				v.Field(i).Set(reflect.MakeSlice(v.Field(i).Type(), 0, 0))
			}
		}
	case reflect.Pointer:
		v.Set(reflect.New(v.Type().Elem()))
		fillSnapshotValue(v.Elem(), empty, depth+1)
	case reflect.Slice:
		v.Set(reflect.MakeSlice(v.Type(), 1, 1))
		fillSnapshotValue(v.Index(0), empty, depth+1)
		if empty && v.Type().Elem().Kind() != reflect.Struct && v.Type().Elem().Kind() != reflect.Pointer {
			v.SetLen(0)
		}
	case reflect.String:
		v.SetString("snapshot-field")
	case reflect.Bool:
		v.SetBool(true)
	case reflect.Int, reflect.Int32, reflect.Int64:
		v.SetInt(7)
	case reflect.Uint, reflect.Uint32, reflect.Uint64:
		v.SetUint(7)
	}
}

func mutateSnapshotValue(v reflect.Value) {
	switch v.Kind() {
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			mutateSnapshotValue(v.Field(i))
		}
	case reflect.Pointer:
		if !v.IsNil() {
			mutateSnapshotValue(v.Elem())
		}
	case reflect.Slice:
		for i := 0; i < v.Len(); i++ {
			mutateSnapshotValue(v.Index(i))
		}
	case reflect.String:
		v.SetString("changed-detached-field")
	case reflect.Bool:
		v.SetBool(!v.Bool())
	case reflect.Int, reflect.Int32, reflect.Int64:
		v.SetInt(v.Int() + 1)
	case reflect.Uint, reflect.Uint32, reflect.Uint64:
		v.SetUint(v.Uint() + 1)
	}
}
