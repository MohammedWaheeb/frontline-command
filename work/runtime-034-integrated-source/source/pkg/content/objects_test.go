package content

import "testing"

func objectMap() Map {
	m := Map{ID: "objects", Version: "1", FormatVersion: 1, Width: 32, Height: 32, Spawns: []Spawn{{Position: Point{8000, 8000}}}, Shipment: Point{24000, 24000}, Tiles: make([]Tile, 32*32)}
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	return m
}
func TestObjectMapValidation(t *testing.T) {
	m := objectMap()
	m.Objects = []MapObject{{ID: 1, Class: "garrison", Position: Point{16500, 16500}}}
	if err := m.Validate(); err != nil {
		t.Fatal(err)
	}
	m.Objects[0].Position.X = 16000
	if err := m.Validate(); err == nil {
		t.Fatal("accepted misaligned footprint")
	}
	m.Objects[0].Position.X = 16500
	m.Tiles[16*32+16].Mandatory = true
	if err := m.Validate(); err == nil {
		t.Fatal("object blocked mandatory corridor")
	}
	m.Tiles[16*32+16].Mandatory = false
	m.Objects = append(m.Objects, MapObject{ID: 2, Class: "light_prop", Position: Point{16500, 16500}})
	if err := m.Validate(); err == nil {
		t.Fatal("accepted overlapping props")
	}
}
func TestObjectsCannotSealRequiredRoute(t *testing.T) {
	m := objectMap()
	for y := 0; y < 32; y++ {
		m.Tiles[y*32+16].Terrain = "cliff"
	}
	m.Tiles[16*32+16].Terrain = "open"
	if err := m.Validate(); err != nil {
		t.Fatal("open route rejected", err)
	}
	m.Objects = []MapObject{{ID: 1, Class: "light_prop", Position: Point{16500, 16500}}}
	if err := m.Validate(); err == nil {
		t.Fatal("prop sealed required route")
	}
}
