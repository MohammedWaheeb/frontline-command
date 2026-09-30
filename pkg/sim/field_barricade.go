package sim

const fieldBarricadeType = "barrier"
const fieldBarricadeRangeSquared = int64(3000 * 3000)

// This utility uses normal paid construction, not an ability channel. A mixed
// selection chooses one builder and creates exactly one foundation.
func isFieldBarricadeOrder(o Order) bool {
	return o.Kind == "build" && o.Type == fieldBarricadeType
}

func (e *Engine) constructionBuilder(v *Entity, typ string) bool {
	if v == nil {
		return false
	}
	return e.role(v) == "rig" || typ == fieldBarricadeType && e.role(v) == "engineer"
}

func (e *Engine) fieldBarricadeBuilder(player PlayerID, ids []ID, pos Vec) (*Entity, string) {
	// Preflight every supplied identity before ignoring ineligible owned actors.
	// A nil/foreign/duplicate source never becomes a paid partial selection.
	sources, code := e.ownedOrderSelection(player, ids)
	if code != "ok" {
		return nil, code
	}
	var best *Entity
	var bestDistance int64
	eligible := false
	for _, source := range sources {
		if e.ownedOrderActorCode(source) != "ok" || !e.constructionBuilder(source, fieldBarricadeType) {
			continue
		}
		eligible = true
		d := dist2(source.Position, pos)
		if d > fieldBarricadeRangeSquared {
			continue
		}
		if best == nil || d < bestDistance || d == bestDistance && source.ID < best.ID {
			best, bestDistance = source, d
		}
	}
	if best != nil {
		return best, "ok"
	}
	if eligible {
		return nil, "outside_builder_radius"
	}
	return nil, "builder_required"
}

func (e *Engine) startFieldBarricade(p *Player, o Order) string {
	builder, code := e.fieldBarricadeBuilder(p.ID, o.Entities, o.Position)
	if code != "ok" {
		return code
	}
	return e.startBuilding(p, builder, o)
}

func (e *Engine) previewFieldBarricade(p *Player, o Order) string {
	builder, code := e.fieldBarricadeBuilder(p.ID, o.Entities, o.Position)
	if code != "ok" {
		return code
	}
	_, code = e.buildingRequirements(p, builder, o)
	if code == "ok" {
		// Collision must remain deferred, as for every ordinary Build preview.
		return "indeterminate"
	}
	return code
}
