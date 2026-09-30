package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// All comparisons use the unchanged canonical engine predicates, never the
// prepared implementation as its own oracle. Probes stay in the actual
// ring-12 endpoint/elbow coordinate envelope that this context serves.
func assertNavigationConnectionGeometry(t *testing.T, e *Engine, v *Entity, dynamic bool) {
	t.Helper()
	before := e.Hash()
	q := e.prepareNavigationConnectionGeometry(v, dynamic)
	if q.clear(v.Position) != e.clear(v.Position, e.radius(v), v.ID, false, dynamic) {
		t.Fatal("prepared origin differs from canonical ground clearance")
	}
	sx, sy := v.Position.X/500, v.Position.Y/500
	for ring := int32(1); ring <= 12; ring++ {
		for dy := -ring; dy <= ring; dy++ {
			for dx := -ring; dx <= ring; dx++ {
				if abs(dx) != ring && abs(dy) != ring {
					continue
				}
				p := Vec{X: (sx + dx) * 500, Y: (sy + dy) * 500}
				if got, want := q.clear(p), e.clear(p, e.radius(v), v.ID, false, dynamic); got != want {
					t.Fatalf("prepared endpoint differs: dynamic=%v radius=%d p=%v got=%v want=%v", dynamic, q.radius, p, got, want)
				}
				for _, from := range [3]Vec{v.Position, {X: p.X, Y: v.Position.Y}, {X: v.Position.X, Y: p.Y}} {
					probe := *v
					probe.Position = from
					if got, want := q.bridgeClear(from, p), e.navigationBridgeClear(&probe, p, dynamic); got != want {
						t.Fatalf("prepared sweep differs: dynamic=%v radius=%d from=%v goal=%v got=%v want=%v", dynamic, q.radius, from, p, got, want)
					}
				}
				gotElbow, gotCost, gotOK := q.connection(p)
				wantElbow, wantCost, wantOK := e.offGridNavigationConnection(v, p, dynamic)
				if gotElbow != wantElbow || gotCost != wantCost || gotOK != wantOK {
					t.Fatalf("prepared connection differs: dynamic=%v goal=%v got=(%v,%d,%v) want=(%v,%d,%v)", dynamic, p, gotElbow, gotCost, gotOK, wantElbow, wantCost, wantOK)
				}
			}
		}
	}
	if len(q.colliders) > len(e.state.Entities) || cap(q.colliders) > len(e.state.Entities) {
		t.Fatal("query geometry exceeded its current entity bound")
	}
	if e.Hash() != before {
		t.Fatal("query preparation or geometry changed authoritative state")
	}
}

func TestNavigationConnectionGeometryCatalogOracle(t *testing.T) {
	for _, typ := range []string{"US.recon", "US.rig", "US.hauler"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			v := e.spawn(typ, 1, Vec{X: 22025, Y: 22075}, true, 0)
			// This is isolated predicate geometry, not a paid army performance
			// fixture. Every current catalog unit exercises classification.
			for i, u := range e.catalog.Units() {
				other := e.spawn(u.ID, 1, Vec{X: 24000 + int32(i%10)*400, Y: 24000 + int32(i/10)*400}, true, 0)
				if u.Armor == "air" {
					switch i % 3 {
					case 0:
						other.Landed = false
					case 2:
						other.Landed = false
						other.Landing = &LandingReservation{Home: 1, Position: Vec{X: other.Position.X - 1000, Y: other.Position.Y}}
					}
				}
			}
			captured := e.spawn("US.airfield", 1, Vec{X: 30000, Y: 18000}, true, 0)
			captured.Type, captured.Owner = "IR.drone_hub", 2
			e.spawn("power", 1, Vec{X: 26000, Y: 18000}, true, 0).HP = 0
			carrier := e.spawn("US.apc", 1, Vec{X: 40000, Y: 22000}, true, 0)
			passenger := e.spawn("US.recon", 1, v.Position, true, 0)
			passenger.Container, carrier.Passengers = carrier.ID, []ID{passenger.ID}
			for y := int32(16); y <= 28; y++ {
				for x := int32(16); x <= 28; x++ {
					tile := &e.state.Map.Tiles[y*e.state.Map.Width+x]
					tile.Height = (x + y) % 5
					tile.SightBlocker = x%2 == 0
					if (x*7+y*11)%23 == 0 && (x < 21 || x > 23 || y < 21 || y > 23) {
						tile.Terrain = []string{"water", "cliff", "blocked"}[(x+y)%3]
					}
				}
			}
			for _, dynamic := range []bool{false, true} {
				assertNavigationConnectionGeometry(t, e, v, dynamic)
			}
		})
	}
}

func TestNavigationConnectionGeometryEnvelope(t *testing.T) {
	for _, kind := range []string{"retained_rectangle", "ground_circle", "remote_service_circle"} {
		t.Run(kind, func(t *testing.T) {
			for _, offset := range []int32{-1, 0, 1} {
				e := fixture(t)
				v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
				var other *Entity
				switch kind {
				case "retained_rectangle":
					other = e.spawn("US.airfield", 1, Vec{X: 31350 + offset, Y: 22000}, true, 0)
					other.Type, other.Owner = "IR.drone_hub", 2
				case "ground_circle":
					other = e.spawn("US.recon", 1, Vec{X: 28700 + offset, Y: 22000}, true, 0)
				case "remote_service_circle":
					home := e.spawn("IR.drone_hub", 2, Vec{X: 34000, Y: 22000}, true, 0)
					other = e.spawn("IR.strike", 2, Vec{X: 35000, Y: 22000}, true, 0)
					other.Landed, other.Home = false, home.ID
					other.Orders = []Order{{Kind: "return"}}
					other.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: 30050 + offset, Y: 22000}}
				}
				q := e.prepareNavigationConnectionGeometry(v, true)
				present := false
				for _, shape := range q.colliders {
					present = present || shape.id == other.ID
				}
				if present != (offset <= 0) {
					t.Fatalf("actual shape envelope inclusion changed: kind=%s offset=%d present=%v", kind, offset, present)
				}
				assertNavigationConnectionGeometry(t, e, v, true)
			}
		})
	}
}

func TestNavigationConnectionGeometryFreshCurrentShapes(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	other := e.spawn("US.recon", 1, Vec{X: 24000, Y: 22000}, true, 0)
	e.mobileObstacleCells(e.radius(v)) // Deliberately warm this tick's old raster.
	for _, change := range []func(){
		func() { other.Position = Vec{X: 26000, Y: 23000} },
		func() { other.Enabled = false; other.DisabledUntil = e.state.Tick + seconds(10) },
		func() { other.HP = 0 },
		func() { other.HP = other.MaxHP; e.spawn("US.hauler", 1, Vec{X: 25000, Y: 22000}, true, 0) },
		func() { e.state.Map.Tiles[23*e.state.Map.Width+23].Terrain = "blocked" },
	} {
		change()
		assertNavigationConnectionGeometry(t, e, v, true)
	}
	// Existing origin controls cover remote reservation release, grounded
	// Home loss, takeoff and destruction without advancing the tick.
}

func TestNavigationConnectionGeometryFreshServiceShapes(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	home := e.spawn("IR.drone_hub", 2, Vec{X: 34000, Y: 22000}, true, 0)
	craft := e.spawn("IR.strike", 2, Vec{X: 35000, Y: 22000}, true, 0)
	craft.Landed, craft.Home = false, home.ID
	craft.Orders = []Order{{Kind: "return"}}
	craft.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: 26000, Y: 24000}}
	e.mobileObstacleCells(e.radius(v))
	for _, change := range []func(){
		func() {},
		func() { craft.Landing.Position = Vec{X: 30000, Y: 25000} },
		func() { craft.Landing = nil },
		func() { craft.Position = Vec{X: 26000, Y: 24000}; craft.Landed, craft.Home = true, 0 },
		func() { craft.Landed = false },
		func() { craft.Landing = &LandingReservation{Home: home.ID, Position: Vec{X: 26000, Y: 24000}}; craft.Home = home.ID },
		func() { craft.HP = 0 },
	} {
		change()
		for _, dynamic := range []bool{false, true} {
			assertNavigationConnectionGeometry(t, e, v, dynamic)
		}
	}
}

func TestNavigationConnectionGeometryRoundedStepOracle(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.rifle", 1, Vec{X: 20819, Y: 20303}, true, 0)
	e.spawn("power", 2, Vec{X: 22000, Y: 19000}, true, 0)
	goal := Vec{X: 20936, Y: 20347}
	q := e.prepareNavigationConnectionGeometry(v, true)
	if !q.clear(v.Position) || !q.clear(goal) || q.bridgeClear(v.Position, goal) || e.navigationBridgeClear(v, goal, true) {
		t.Fatal("rounded-step corner witness no longer has clear endpoints and an obstructed sweep")
	}
	assertNavigationConnectionGeometry(t, e, v, true)
}

func TestNavigationConnectionGeometryMapHeightAndMaximum(t *testing.T) {
	for _, dimensions := range []Vec{{X: 64, Y: 96}, {X: 256, Y: 256}} {
		m := fixtureMap()
		m.Width, m.Height = dimensions.X, dimensions.Y
		m.Tiles = make([]content.Tile, int(m.Width*m.Height))
		for i := range m.Tiles {
			m.Tiles[i] = content.Tile{Terrain: "open", Height: int32(i % 5), SightBlocker: i%7 == 0}
		}
		e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}})
		if err != nil {
			t.Fatal(err)
		}
		v := e.spawn("US.hauler", 1, Vec{X: m.Width*1000 - 2025, Y: m.Height*1000 - 1475}, true, 0)
		for _, dynamic := range []bool{false, true} {
			assertNavigationConnectionGeometry(t, e, v, dynamic)
		}
	}
}

func TestNavigationConnectionGeometryBoundAndStableOrder(t *testing.T) {
	e := fixture(t)
	e.state.Entities = nil
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	for i := 0; i < 4095; i++ {
		e.spawn("US.recon", 1, Vec{X: 25000, Y: 24000}, true, 0)
	}
	q := e.prepareNavigationConnectionGeometry(v, true)
	if len(q.colliders) != 4095 || cap(q.colliders) > 4096 {
		t.Fatal("maximum saved-entity collection lost shapes or exceeded capacity", len(q.colliders), cap(q.colliders))
	}
	for i, shape := range q.colliders {
		if shape.id != e.state.Entities[i+1].ID {
			t.Fatal("prepared collider order differs from authoritative entity order")
		}
	}
}

func TestNavigationConnectionGeometryZeroIDOracle(t *testing.T) {
	e := fixture(t)
	v := e.spawn("US.recon", 1, Vec{X: 22025, Y: 22075}, true, 0)
	// ID-zero data is an isolated oracle edge case, not an accepted save.
	// Canonical clear and sweep intentionally have different ignore rules.
	e.state.Entities = append(e.state.Entities, &Entity{ID: 0, HP: 1, Building: true, Position: Vec{X: 24500, Y: 22000}, FootprintWidth: 2, FootprintHeight: 2})
	assertNavigationConnectionGeometry(t, e, v, false)
}
