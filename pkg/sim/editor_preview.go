package sim

import (
	"errors"
	"frontlinecommand/pkg/content"
)

type EditorPreviewRequest struct {
	Kind     string `json:"kind"`
	UnitType string `json:"unit_type"`
	From     *Vec   `json:"from"`
	To       *Vec   `json:"to,omitempty"`
}
type EditorPreviewResult struct {
	Kind         string  `json:"kind"`
	Code         string  `json:"code"`
	Reachable    *bool   `json:"reachable,omitempty"`
	Path         []Vec   `json:"path,omitempty"`
	VisibleTiles []int32 `json:"visible_tiles,omitempty"`
	Layer        string  `json:"layer"`
}

// PreviewEditor evaluates only an authored map in an isolated scratch world.
// It uses the same collision, bounded route search and visibility computation as
// a running match, without inventing starting bases or consulting live state.
// Aircraft previews represent flight, ground units their normal catalog radius.
func PreviewEditor(c *content.Catalog, m content.Map, req EditorPreviewRequest) (EditorPreviewResult, error) {
	result := EditorPreviewResult{Kind: req.Kind, Code: "ok", Layer: "ground"}
	if c == nil {
		return result, errors.New("missing_catalog")
	}
	if err := m.Validate(); err != nil {
		return result, err
	}
	if req.Kind != "path" && req.Kind != "sight" || req.From == nil || req.Kind == "path" && req.To == nil || req.Kind == "sight" && req.To != nil {
		return result, errors.New("invalid_preview")
	}
	unit, ok := c.Unit(req.UnitType)
	if !ok {
		return result, errors.New("unknown_unit")
	}
	if !m.InBounds(*req.From) || req.To != nil && !m.InBounds(*req.To) {
		return result, errors.New("outside_map")
	}
	air := unit.Armor == "air"
	if air {
		result.Layer = "air"
	}
	e := &Engine{catalog: c, state: State{Map: m, NextID: 1, NextEvent: 1, Players: []*Player{{PlayerConfig: PlayerConfig{ID: 1, Faction: unit.Faction, Team: 1}, Explored: make([]bool, len(m.Tiles))}}}, pathBudget: 1}
	for _, object := range m.Objects {
		entity := e.spawn("map."+object.Class, 0, object.Position, true, 0)
		entity.MapObject = object.ID
	}
	if !e.clear(*req.From, unit.Radius, 0, air, false) {
		result.Code = "blocked_start"
		return result, nil
	}
	source := e.spawn(req.UnitType, 1, *req.From, true, 0)
	source.Landed = !air
	if req.Kind == "sight" {
		e.computeVisibility()
		for index, visible := range e.visible[1] {
			if visible {
				result.VisibleTiles = append(result.VisibleTiles, int32(index))
			}
		}
		return result, nil
	}
	path := e.findPath(source, *req.To, false)
	reached := len(path) > 0
	result.Reachable = &reached
	if !reached {
		result.Code = "unreachable"
		return result, nil
	}
	result.Path = append([]Vec{*req.From}, path...)
	if path[len(path)-1] != *req.To {
		result.Code = "adjusted_destination"
	}
	return result, nil
}
