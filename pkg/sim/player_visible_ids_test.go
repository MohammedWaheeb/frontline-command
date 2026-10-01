package sim

import (
	"reflect"
	"slices"
	"testing"
)

func TestPlayerVisibleEntityIDsExactlyMatchPublicView(t *testing.T) {
	e := fixture(t)
	e.spawn("IR.tank", 2, Vec{X: 9000, Y: 8000}, true, 0)
	hidden := e.spawn("IR.tank", 2, Vec{X: 55000, Y: 55000}, true, 0)
	concealed := e.spawn("IR.tank", 2, Vec{X: 10000, Y: 8000}, true, 0)
	concealed.Concealed = true
	dead := e.spawn("IR.tank", 2, Vec{X: 11000, Y: 8000}, true, 0)
	dead.HP = 0
	e.updateFog()
	_ = hidden
	if ids, ok := e.PlayerVisibleEntityIDs(99); ok || ids != nil {
		t.Fatal("unknown viewer admitted")
	}
	for tick := 0; tick < 120; tick++ {
		for _, id := range []PlayerID{1, 2} {
			view, ok := e.PlayerView(id)
			if !ok {
				t.Fatal("missing fixture player")
			}
			expected := make([]ID, len(view.Entities))
			for i, entity := range view.Entities {
				expected[i] = entity.ID
			}
			ids, ok := e.PlayerVisibleEntityIDs(id)
			if !ok || !reflect.DeepEqual(ids, expected) || !slices.IsSorted(ids) {
				t.Fatalf("tick%d player%d IDs differ: %v %v", tick, id, ids, expected)
			}
			if len(ids) > 0 {
				ids[0] = 99
				again, _ := e.PlayerVisibleEntityIDs(id)
				if len(again) > 0 && again[0] == 99 {
					t.Fatal("returned IDs alias engine state")
				}
			}
		}
		e.Advance()
	}
}
