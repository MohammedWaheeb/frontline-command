package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"sort"
)

func containsObject(ids []uint32, id uint32) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}
func (e *Engine) destroyMapObject(v *Entity) {
	if v.MapObject == 0 || containsObject(e.state.DestroyedObjects, v.MapObject) {
		return
	}
	for _, object := range e.state.Map.Objects {
		if object.ID != v.MapObject {
			continue
		}
		e.state.DestroyedObjects = append(e.state.DestroyedObjects, object.ID)
		sort.Slice(e.state.DestroyedObjects, func(i, j int) bool { return e.state.DestroyedObjects[i] < e.state.DestroyedObjects[j] })
		for _, index := range object.TileIndices(e.state.Map.Width) {
			e.state.MapOriginalTiles = append(e.state.MapOriginalTiles, OriginalTile{Index: int32(index), Tile: e.state.Map.Tiles[index]})
			e.state.Map.Tiles[index].Terrain = "rubble"
			e.state.Map.Tiles[index].SightBlocker = false
		}
		sort.Slice(e.state.MapOriginalTiles, func(i, j int) bool { return e.state.MapOriginalTiles[i].Index < e.state.MapOriginalTiles[j].Index })
		return
	}
}
func (e *Engine) observeRubble(p *Player) {
	for _, object := range e.state.Map.Objects {
		if containsObject(p.KnownRubble, object.ID) || !containsObject(e.state.DestroyedObjects, object.ID) {
			continue
		}
		if e.canSee(p.ID, object.Position) {
			p.KnownRubble = append(p.KnownRubble, object.ID)
		}
	}
	sort.Slice(p.KnownRubble, func(i, j int) bool { return p.KnownRubble[i] < p.KnownRubble[j] })
}
func (e *Engine) validateMapObjects() error {
	live := map[uint32]*Entity{}
	for _, v := range e.state.Entities {
		if v.MapObject == 0 {
			if len(v.Type) >= 4 && v.Type[:4] == "map." {
				return fmt.Errorf("map entity missing object identity")
			}
			continue
		}
		if live[v.MapObject] != nil || !v.Building || !v.Complete || len(v.Jobs) != 0 || v.Paid != 0 || v.Owner != 0 && (e.role(v) != "garrison" || len(v.Passengers) == 0) {
			return fmt.Errorf("invalid map object state")
		}
		live[v.MapObject] = v
	}
	destroyed := map[uint32]bool{}
	for _, id := range e.state.DestroyedObjects {
		if id == 0 || destroyed[id] || live[id] != nil {
			return fmt.Errorf("duplicate map destruction")
		}
		destroyed[id] = true
	}
	valid := map[uint32]bool{}
	expectedTiles := map[int32]bool{}
	for _, object := range e.state.Map.Objects {
		valid[object.ID] = true
		v := live[object.ID]
		if destroyed[object.ID] {
			for _, index := range object.TileIndices(e.state.Map.Width) {
				expectedTiles[int32(index)] = true
				if e.state.Map.Tiles[index].Terrain != "rubble" || e.state.Map.Tiles[index].SightBlocker {
					return fmt.Errorf("missing deterministic debris footprint")
				}
			}
		} else if v == nil || v.Type != "map."+object.Class || v.Position != object.Position {
			return fmt.Errorf("missing or mismatched map object")
		}
	}
	if len(e.state.MapOriginalTiles) != len(expectedTiles) {
		return fmt.Errorf("original terrain history missing")
	}
	previous := int32(-1)
	for _, tile := range e.state.MapOriginalTiles {
		if tile.Index <= previous || !expectedTiles[tile.Index] || !tile.Tile.Passable() {
			return fmt.Errorf("invalid original terrain history")
		}
		previous = tile.Index
	}
	if len(expectedTiles) > 0 {
		if err := e.MapBlueprint().Validate(); err != nil {
			return err
		}
	}
	for id := range live {
		if !valid[id] {
			return fmt.Errorf("unknown live map object")
		}
	}
	for id := range destroyed {
		if !valid[id] {
			return fmt.Errorf("unknown destroyed map object")
		}
	}
	for _, p := range e.state.Players {
		seen := map[uint32]bool{}
		for _, id := range p.KnownRubble {
			if seen[id] || !destroyed[id] {
				return fmt.Errorf("invalid observed rubble")
			}
			seen[id] = true
		}
	}
	return nil
}

// MapBlueprint returns a detached copy of the original public map definition.
// Rendering resumes from this baseline plus PlayerView.Rubble, never from
// globally destroyed terrain that the selected player has not observed.
func (e *Engine) MapBlueprint() content.Map {
	data, _ := json.Marshal(e.state.Map)
	var m content.Map
	_ = json.Unmarshal(data, &m)
	for _, tile := range e.state.MapOriginalTiles {
		if tile.Index >= 0 && int(tile.Index) < len(m.Tiles) {
			m.Tiles[tile.Index] = tile.Tile
		}
	}
	return m
}
