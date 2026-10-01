package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
)

type AIObservation struct {
	ID       ID       `json:"id"`
	Owner    PlayerID `json:"owner"`
	Type     string   `json:"type"`
	Position Vec      `json:"position"`
	Seen     Tick     `json:"seen"`
}

func (e *Engine) aiObserve(p *Player, view View) {
	live := map[ID]EntityView{}
	for _, v := range view.Entities {
		if aiActiveOpponent(p, view, v.Owner) {
			live[v.ID] = v
		}
	}
	keep := p.AIKnowledge[:0]
	for _, old := range p.AIKnowledge {
		if !aiActiveOpponent(p, view, old.Owner) {
			continue
		}
		if _, found := live[old.ID]; found {
			continue
		}
		_, structure := e.buildingRule(old.Type)
		age := seconds(60)
		if structure {
			age = seconds(300)
		}
		if e.state.Tick-old.Seen > age || e.canSee(p.ID, old.Position) {
			continue
		}
		keep = append(keep, old)
	}
	p.AIKnowledge = keep
	for _, v := range view.Entities {
		if _, found := live[v.ID]; found {
			p.AIKnowledge = append(p.AIKnowledge, AIObservation{v.ID, v.Owner, v.Type, v.Position, e.state.Tick})
		}
	}
	sort.Slice(p.AIKnowledge, func(i, j int) bool { return p.AIKnowledge[i].ID < p.AIKnowledge[j].ID })
	// AIFields has no per-field timestamp. Seed missing public memories only,
	// preserving existing AI observations; current sight refreshes them below.
	for _, field := range view.KnownFields {
		found := false
		for _, known := range p.AIFields {
			if known.ID == field.ID {
				found = true
				break
			}
		}
		if !found {
			p.AIFields = append(p.AIFields, FieldView{ID: field.ID, Position: field.Position, Remaining: field.Remaining})
		}
	}
	for _, field := range view.Fields {
		found := false
		for i := range p.AIFields {
			if p.AIFields[i].ID == field.ID {
				p.AIFields[i] = field
				found = true
				break
			}
		}
		if !found {
			p.AIFields = append(p.AIFields, field)
		}
	}
	sort.Slice(p.AIFields, func(i, j int) bool { return p.AIFields[i].ID < p.AIFields[j].ID })
}
func (e *Engine) aiThreatNear(p *Player, point Vec, radius int32) bool {
	for _, enemy := range p.AIKnowledge {
		if e.state.Tick-enemy.Seen > seconds(30) {
			continue
		}
		if distance(enemy.Position, point) < radius {
			return true
		}
	}
	return false
}
func (e *Engine) aiAirDanger(p *Player, point Vec) bool {
	for _, enemy := range p.AIKnowledge {
		age := seconds(60)
		if _, structure := e.buildingRule(enemy.Type); structure {
			// Fixed defenses retain their observed location for the same five
			// minutes as aiObserve. Losing sight is no evidence of destruction.
			age = seconds(300)
		}
		if e.state.Tick-enemy.Seen > age {
			continue
		}
		weapon := ""
		if u, ok := e.catalog.Unit(enemy.Type); ok {
			weapon = u.Weapon
		}
		if b, ok := e.buildingRule(enemy.Type); ok {
			weapon = b.Weapon
		}
		if w, ok := e.catalog.Weapon(weapon); ok && w.Kind == "antiair" && distance(enemy.Position, point) < w.MaxRange+3000 {
			return true
		}
	}
	return false
}
func (e *Engine) aiExpansion(p *Player, own []EntityView) (Vec, bool) {
	var best Vec
	score := int64(1 << 62)
	need, exhausted := false, true
	haulers := int32(0)
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.role(v) == "hauler" {
			haulers++
		}
		if v.Building && e.role(v) == "supply" && !v.IncludedHauler {
			haulers++
		}
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && u.Role == "hauler" {
				haulers++
			}
		}
	}
	// A new depot includes a paid hauler and must fit the ordinary eight-hauler
	// cap. Existing haulers can still haul from farther known fields at the cap.
	if haulers >= 8 {
		return best, false
	}
	for _, field := range p.AIFields {
		for _, v := range own {
			if b, ok := e.buildingRule(v.Type); ok && b.Role == "supply" && distance(v.Position, field.Position) < 12000 && field.Remaining < 6000000 {
				need = true
			}
			if b, ok := e.buildingRule(v.Type); ok && b.Role == "supply" && distance(v.Position, field.Position) < 12000 && field.Remaining > 0 {
				exhausted = false
			}
		}
	}
	if !need {
		return best, false
	}
	for _, field := range p.AIFields {
		minimum := int64(6000000)
		if exhausted {
			// Recovery may use a smaller remnant, but buying its depot must
			// still repay the known infrastructure cost. Existing haulers can
			// long-haul a smaller field without buying another base.
			supply, _ := e.buildingRule("supply")
			minimum = supply.Cost
			if !e.aiInBuildRadius(p, "supply", field.Position) {
				outpost, _ := e.buildingRule("outpost")
				minimum += outpost.Cost
			}
		}
		if field.Remaining < minimum || e.aiThreatNear(p, field.Position, 14000) {
			continue
		}
		covered := false
		d := int64(1 << 62)
		for _, v := range own {
			if b, ok := e.buildingRule(v.Type); ok {
				if b.Role == "supply" && distance(v.Position, field.Position) < 12000 {
					covered = true
				}
				if b.Role == "hq" || b.Role == "outpost" {
					d = min(d, dist2(v.Position, field.Position))
				}
			}
		}
		if !covered && d < score {
			best, score = field.Position, d
		}
	}
	return best, score < int64(1<<62)
}
func (e *Engine) aiInBuildRadius(p *Player, typ string, pos Vec) bool {
	if typ == "outpost" || typ == "hq" && !e.has(p.ID, "hq") {
		return true
	}
	for _, v := range e.state.Entities {
		radius := e.buildRange(v)
		if v.Owner == p.ID && radius > 0 && distance(v.Position, pos) <= radius {
			return true
		}
	}
	return false
}
func (e *Engine) aiConstructionPosition(p *Player, typ string, center Vec) (Vec, bool) {
	b, _ := e.buildingRule(typ)
	known := e.aiPlacementKnowledge(p)
	for r := int32(4000); r <= 13000; r += 2000 {
		for _, d := range neighbors {
			pos := Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500}
			if e.aiInBuildRadius(p, typ, pos) && known.validPlacement(p.ID, pos, b.Width, b.Height) == "ok" {
				return pos, true
			}
		}
	}
	return Vec{}, false
}

// Reuse the ordinary geometry checker against a view-only collision set. A
// concealed enemy cannot change the AI's chosen placement; actual execution may
// reject it, just as it would reject a human's otherwise reasonable intention.
func (e *Engine) aiPlacementKnowledge(p *Player) *Engine {
	known := *e
	known.state = e.state
	known.state.Map = e.aiPlanningMap(p)
	known.state.Entities = nil
	known.state.Fields = nil
	known.state.Stations = nil
	view, _ := e.PlayerView(p.ID)
	for _, observed := range view.Entities {
		if observed.Private != nil && observed.Private.Container != 0 {
			continue
		}
		_, building := e.buildingRule(observed.Type)
		known.state.Entities = append(known.state.Entities, &Entity{ID: observed.ID, Owner: observed.Owner, Type: observed.Type, Position: observed.Position, HP: 1, Building: building, Landed: observed.Landed, FootprintWidth: observed.FootprintWidth, FootprintHeight: observed.FootprintHeight, FootprintType: observed.FootprintType})
	}
	for _, field := range p.AIFields {
		known.state.Fields = append(known.state.Fields, &ResourceField{ID: field.ID, Position: field.Position, Remaining: field.Remaining})
	}
	for _, station := range view.Stations {
		known.state.Stations = append(known.state.Stations, &ObjectiveStation{ID: station.ID, Position: station.Position, Owner: station.Owner})
	}
	return &known
}

// Terrain changes at neutral objects become knowledge only through the ordinary
// observed-rubble record. Share immutable authored data and detach changed tiles
// before restoring unknown destruction, so planning never mutates the real map.
func (e *Engine) aiPlanningMap(p *Player) content.Map {
	m := e.state.Map
	if len(e.state.MapOriginalTiles) == 0 || len(p.KnownRubble) == len(e.state.DestroyedObjects) {
		return m
	}
	m.Tiles = append([]content.Tile(nil), m.Tiles...)
	knownTiles := map[int32]bool{}
	for _, object := range m.Objects {
		if !containsObject(p.KnownRubble, object.ID) {
			continue
		}
		for _, index := range object.TileIndices(m.Width) {
			knownTiles[int32(index)] = true
		}
	}
	for _, original := range e.state.MapOriginalTiles {
		if !knownTiles[original.Index] {
			m.Tiles[original.Index] = original.Tile
		}
	}
	return m
}
