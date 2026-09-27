package sim

import "sort"

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
		if v.Owner != 0 && !e.allied(p.ID, v.Owner) {
			live[v.ID] = v
		}
	}
	keep := p.AIKnowledge[:0]
	for _, old := range p.AIKnowledge {
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
		if e.state.Tick-enemy.Seen > seconds(60) {
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
	need := false
	for _, field := range p.AIFields {
		for _, v := range own {
			if b, ok := e.buildingRule(v.Type); ok && b.Role == "supply" && distance(v.Position, field.Position) < 12000 && field.Remaining < 6000000 {
				need = true
			}
		}
	}
	if !need {
		return best, false
	}
	for _, field := range p.AIFields {
		if field.Remaining < 6000000 || e.aiThreatNear(p, field.Position, 14000) {
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
		if v.Owner == p.ID && v.Complete && v.HP > 0 && (e.role(v) == "hq" || e.role(v) == "outpost") && distance(v.Position, pos) <= 14000 {
			return true
		}
	}
	return false
}
func (e *Engine) aiConstructionPosition(p *Player, typ string, center Vec) (Vec, bool) {
	b, _ := e.buildingRule(typ)
	for r := int32(4000); r <= 13000; r += 2000 {
		for _, d := range neighbors {
			pos := Vec{X: (center.X + d.X*r) / 500 * 500, Y: (center.Y + d.Y*r) / 500 * 500}
			if e.aiInBuildRadius(p, typ, pos) && e.validPlacement(p.ID, pos, b.Width, b.Height) == "ok" {
				return pos, true
			}
		}
	}
	return Vec{}, false
}
