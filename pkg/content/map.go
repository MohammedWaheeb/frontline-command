package content

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

type Point struct {
	X int32 `json:"x"`
	Y int32 `json:"y"`
}
type Tile struct {
	Terrain      string `json:"terrain"`
	Height       int32  `json:"height"`
	SightBlocker bool   `json:"sight_blocker,omitempty"`
	Mandatory    bool   `json:"mandatory,omitempty"`
}

func (t Tile) Passable() bool {
	return t.Terrain != "water" && t.Terrain != "cliff" && t.Terrain != "blocked"
}
func (t Tile) Cover() bool { return t.Terrain == "cover" || t.Terrain == "rubble" }

type Spawn struct {
	Position Point  `json:"position"`
	Team     uint32 `json:"team"`
}
type Field struct {
	ID       uint32 `json:"id"`
	Position Point  `json:"position"`
	Credits  int64  `json:"credits"`
}
type Station struct {
	ID       uint32 `json:"id"`
	Position Point  `json:"position"`
}
type Region struct {
	ID  string `json:"id"`
	Min Point  `json:"min"`
	Max Point  `json:"max"`
}
type Map struct {
	ID            string      `json:"id"`
	Title         string      `json:"title"`
	Author        string      `json:"author"`
	Version       string      `json:"version"`
	FormatVersion uint32      `json:"format_version"`
	Ruleset       string      `json:"ruleset"`
	Width         int32       `json:"width"`
	Height        int32       `json:"height"`
	Tiles         []Tile      `json:"tiles"`
	Spawns        []Spawn     `json:"spawns"`
	Fields        []Field     `json:"fields"`
	Stations      []Station   `json:"stations"`
	Shipment      Point       `json:"shipment"`
	Regions       []Region    `json:"regions,omitempty"`
	Objects       []MapObject `json:"objects,omitempty"`
	RequiredPacks []string    `json:"required_packs"`
}

func (m Map) InBounds(p Point) bool {
	return p.X >= 0 && p.Y >= 0 && p.X < m.Width*1000 && p.Y < m.Height*1000
}
func (m Map) TileAt(p Point) Tile {
	if !m.InBounds(p) {
		return Tile{Terrain: "blocked"}
	}
	return m.Tiles[(p.Y/1000)*m.Width+p.X/1000]
}
func DecodeMap(data []byte) (Map, error) {
	var m Map
	if len(data) > 16<<20 {
		return m, fmt.Errorf("map exceeds 16 MiB")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if e := d.Decode(&m); e != nil {
		return m, e
	}
	if d.Decode(new(any)) != io.EOF {
		return m, fmt.Errorf("trailing map content")
	}
	return m, m.Validate()
}
func (m Map) Validate() error {
	if m.FormatVersion != 1 || m.ID == "" || len(m.ID) > 80 || m.Version == "" || len(m.Title) > 100 || len(m.Author) > 100 {
		return fmt.Errorf("invalid map metadata or format version")
	}
	if m.Width < 32 || m.Height < 32 || m.Width > 256 || m.Height > 256 || len(m.Tiles) != int(m.Width*m.Height) {
		return fmt.Errorf("map dimensions must be 32–256 and match tile count")
	}
	if len(m.Spawns) < 1 || len(m.Spawns) > 4 || len(m.Fields) > 128 || len(m.Stations) > 32 || len(m.Regions) > 128 || len(m.Objects) > 512 {
		return fmt.Errorf("map object limits exceeded")
	}
	for i, t := range m.Tiles {
		switch t.Terrain {
		case "open", "cover", "rubble", "water", "cliff", "blocked", "road", "ramp":
		default:
			return fmt.Errorf("tile %d has unsupported terrain", i)
		}
		if t.Height < 0 || t.Height > 4 || t.Mandatory && !t.Passable() {
			return fmt.Errorf("tile %d invalid height/corridor", i)
		}
	}
	blocked := map[int]bool{}
	objectIDs := map[uint32]bool{}
	for _, object := range m.Objects {
		c, ok := ObjectRule(object.Class)
		if !ok || object.ID == 0 || objectIDs[object.ID] || object.Position.X%1000 != c.Width%2*500 || object.Position.Y%1000 != c.Height%2*500 || object.Position.X-c.Width*500 < 0 || object.Position.Y-c.Height*500 < 0 || object.Position.X+c.Width*500 > m.Width*1000 || object.Position.Y+c.Height*500 > m.Height*1000 {
			return fmt.Errorf("invalid map object %d", object.ID)
		}
		objectIDs[object.ID] = true
		for _, i := range object.TileIndices(m.Width) {
			if blocked[i] || !m.Tiles[i].Passable() || m.Tiles[i].Mandatory {
				return fmt.Errorf("blocked or overlapping object %d", object.ID)
			}
			blocked[i] = true
		}
	}
	validPoint := func(p Point) bool {
		return m.InBounds(p) && m.TileAt(p).Passable() && !blocked[int(p.Y/1000*m.Width+p.X/1000)]
	}
	if !validPoint(m.Shipment) || m.TileAt(m.Shipment).Mandatory {
		return fmt.Errorf("shipment site must be accessible outside mandatory corridors")
	}
	ids := map[uint32]bool{}
	for _, f := range m.Fields {
		if f.ID == 0 || ids[f.ID] || !validPoint(f.Position) || f.Credits <= 0 || f.Credits > 1000000000 {
			return fmt.Errorf("invalid supply field %d", f.ID)
		}
		ids[f.ID] = true
	}
	for _, s := range m.Stations {
		if s.ID == 0 || ids[s.ID] || !validPoint(s.Position) {
			return fmt.Errorf("invalid station %d", s.ID)
		}
		ids[s.ID] = true
	}
	regionIDs := map[string]bool{}
	for _, r := range m.Regions {
		if r.ID == "" || regionIDs[r.ID] || !m.InBounds(r.Min) || !m.InBounds(r.Max) || r.Min.X > r.Max.X || r.Min.Y > r.Max.Y {
			return fmt.Errorf("invalid objective region %s", r.ID)
		}
		regionIDs[r.ID] = true
	}
	for i, s := range m.Spawns {
		if !validPoint(s.Position) {
			return fmt.Errorf("spawn %d is blocked", i)
		}
		for y := s.Position.Y/1000 - 3; y <= s.Position.Y/1000+3; y++ {
			for x := s.Position.X/1000 - 3; x <= s.Position.X/1000+3; x++ {
				p := Point{x*1000 + 500, y*1000 + 500}
				if !validPoint(p) || m.TileAt(p).Mandatory {
					return fmt.Errorf("spawn %d needs clear 7×7 base area", i)
				}
			}
		}
		for j := 0; j < i; j++ {
			dx := s.Position.X - m.Spawns[j].Position.X
			dy := s.Position.Y - m.Spawns[j].Position.Y
			if int64(dx)*int64(dx)+int64(dy)*int64(dy) < 400000000 {
				return fmt.Errorf("spawns %d/%d too close", j, i)
			}
		}
	}
	// A bounded flood validates that spawns, resources, shipment and objectives
	// connect through traversable terrain. Movement-class clearance is checked by
	// the runtime pathfinder and the separate gameplay map review.
	seen := make([]bool, len(m.Tiles))
	start := int((m.Spawns[0].Position.Y/1000)*m.Width + m.Spawns[0].Position.X/1000)
	q := []int{start}
	seen[start] = true
	for n := 0; n < len(q); n++ {
		i := q[n]
		x, y := int32(i)%m.Width, int32(i)/m.Width
		for _, d := range []Point{{1, 0}, {0, 1}, {-1, 0}, {0, -1}} {
			nx, ny := x+d.X, y+d.Y
			if nx < 0 || ny < 0 || nx >= m.Width || ny >= m.Height {
				continue
			}
			j := int(ny*m.Width + nx)
			if !seen[j] && m.Tiles[j].Passable() && !blocked[j] {
				seen[j] = true
				q = append(q, j)
			}
		}
	}
	reachable := func(p Point) bool { return seen[int(p.Y/1000*m.Width+p.X/1000)] }
	for i, s := range m.Spawns {
		if !reachable(s.Position) {
			return fmt.Errorf("spawn %d has no route to other starts", i)
		}
	}
	for _, f := range m.Fields {
		if !reachable(f.Position) {
			return fmt.Errorf("field %d unreachable", f.ID)
		}
	}
	for _, s := range m.Stations {
		if !reachable(s.Position) {
			return fmt.Errorf("station %d unreachable", s.ID)
		}
	}
	if !reachable(m.Shipment) {
		return fmt.Errorf("shipment site unreachable")
	}
	for _, r := range m.Regions {
		p := Point{(r.Min.X + r.Max.X) / 2, (r.Min.Y + r.Max.Y) / 2}
		if !reachable(p) {
			return fmt.Errorf("region %s center unreachable", r.ID)
		}
	}
	return nil
}
