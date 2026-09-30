package sim

import (
	"math/rand"
	"testing"
)

func TestObstacleLookupRetainsPriorGeometry(t *testing.T) {
	e := fixture(t)
	types := []string{"IR.beacon", "US.support_plane", "unknown", ""}
	for _, unit := range e.catalog.Units() {
		types = append(types, unit.ID)
	}
	for _, kind := range types {
		for flags := 0; flags < 32; flags++ {
			v := &Entity{ID: 99, Type: kind, Position: Vec{X: 18001, Y: 19002}, HP: 100000, Building: flags&1 != 0, Landed: flags&2 != 0}
			if flags&4 != 0 {
				v.HP = 0
			}
			if flags&8 != 0 {
				v.Container = 123
			}
			if flags&16 != 0 {
				v.Landing = &LandingReservation{Home: 55, Position: Vec{X: 23003, Y: 24004}}
			}
			a, ar, ab := e.groundObstacle(v)
			b, br, bb := e.referenceGroundObstacleLookup(v)
			if kind == "IR.beacon" {
				if a != (Vec{}) || ar != 0 || ab {
					t.Fatalf("passive beacon flags%d obstructs locomotion: %v/%d/%v", flags, a, ar, ab)
				}
				combatRadius := int32(300)
				if v.Building {
					combatRadius = 0
				}
				if got := e.radius(v); got != combatRadius {
					t.Fatalf("passive beacon flags%d combat radius %d != %d", flags, got, combatRadius)
				}
			}
			if a != b || ar != br || ab != bb {
				t.Fatalf("%s flags%d: geometry %v/%d/%v != %v/%d/%v", kind, flags, a, ar, ab, b, br, bb)
			}
		}
	}
}

func TestClearanceLookupMatchesPriorDecisions(t *testing.T) {
	e := fixture(t)
	rng := rand.New(rand.NewSource(81277))
	units := e.catalog.Units()
	for i := 0; i < 300; i++ {
		v := &Entity{ID: ID(10 + i), Type: units[i%len(units)].ID, HP: 100000,
			Position: Vec{X: int32(rng.Intn(64000)), Y: int32(rng.Intn(64000))}, Landed: i%3 == 0}
		if i%5 == 0 {
			v.Landing = &LandingReservation{Home: 1, Position: Vec{X: int32(rng.Intn(64000)), Y: int32(rng.Intn(64000))}}
		}
		if i%7 == 0 {
			v.Building = true
			v.FootprintWidth, v.FootprintHeight = int32(1+i%4), int32(1+i%3)
		}
		if i%11 == 0 {
			v.Container = 500
		}
		if i%13 == 0 {
			v.HP = 0
		}
		e.state.Entities = append(e.state.Entities, v)
	}
	for i := 0; i < len(e.state.Map.Tiles); i += 43 {
		e.state.Map.Tiles[i].Terrain = "blocked"
	}
	before := e.Hash()
	for i := 0; i < 600; i++ {
		p := Vec{X: int32(rng.Intn(66000) - 1000), Y: int32(rng.Intn(66000) - 1000)}
		if i < 300 {
			p = e.state.Entities[i].Position
		}
		for _, r := range []int32{0, 200, 600, 1400} {
			for flags := 0; flags < 4; flags++ {
				ignore, structure := ID(i%310), ID((i+19)%310)
				got := e.clearExcept(p, r, ignore, structure, flags&1 != 0, flags&2 != 0)
				want := e.referenceClearExceptLookup(p, r, ignore, structure, flags&1 != 0, flags&2 != 0)
				if got != want {
					t.Fatalf("query%d %v radius%d flags%d: %v != %v", i, p, r, flags, got, want)
				}
			}
		}
	}
	if e.Hash() != before {
		t.Fatal("clearance query changed authoritative state")
	}
}

var clearanceLookupSink bool

func BenchmarkClearanceLookup(b *testing.B) {
	e, _ := exteriorMaximumFixture(b)
	queries := make([]Vec, 256)
	rng := rand.New(rand.NewSource(117))
	for i := range queries {
		queries[i] = Vec{X: 20000 + int32(rng.Intn(120000)), Y: 20000 + int32(rng.Intn(120000))}
	}
	for _, row := range []struct {
		name string
		fn   func(Vec, int32, ID, ID, bool, bool) bool
	}{{"Prior", e.referenceClearExceptLookup}, {"SingleLookup", e.clearExcept}} {
		b.Run(row.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				clearanceLookupSink = row.fn(queries[i%len(queries)], 400, 0, 0, i%3 == 0, true)
			}
		})
	}
}
