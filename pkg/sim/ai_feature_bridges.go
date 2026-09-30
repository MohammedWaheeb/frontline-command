package sim

// Add the one-way drone to the existing paid air composition, preserving the
// first ISR and the fighter/ground-air mix. Production still pays/reserves normally.
func (e *Engine) aiAirFeatureChoice(p *Player, counts map[string]int32, choice string) string {
	if p.Faction == "IR" && (choice == "strike" || choice == "gunship") && p.Tier >= 2 && counts["isr"] > 0 && counts["shahed"] < 2 && p.AIStage%4 == 1 {
		if _, available := e.catalog.Unit("IR.shahed"); available {
			return "shahed"
		}
	}
	return choice
}

func aiShahedCommitted(v *Entity) bool {
	return v != nil && v.Type == "IR.shahed" && v.ShahedCommitted
}

// The ordinary strike ranking resolves only the supplied public snapshot.
// Check route safety from remembered public AA; never fetch a live enemy actor.
func (e *Engine) aiShahedTarget(p *Player, view View, source *Entity, goal Vec) (EntityView, bool) {
	if source == nil || source.Type != "IR.shahed" || aiShahedCommitted(source) {
		return EntityView{}, false
	}
	filtered := view
	filtered.Entities = make([]EntityView, 0, len(view.Entities))
	for _, target := range view.Entities {
		if !e.aiAirDanger(p, target.Position) && !e.aiAirRouteDanger(p, source.Position, target.Position) {
			filtered.Entities = append(filtered.Entities, target)
		}
	}
	return e.aiStrikeTarget(p, filtered, source, goal)
}

// A stationary scout may observe a known threat after its income exploration
// job completes. Retain moving/guarding/channelled scouts and public mission work.
func (e *Engine) aiReconObserveUseful(p *Player, view View, v *Entity) bool {
	if p.AI == "easy" || !e.reconObserveActor(v) || v.ReconObserve || v.Channel != "" || len(v.Orders) != 0 ||
		!v.Active(e.Tick()) || v.Container != 0 || v.HP*2 < v.MaxHP || v.LastPosition != v.Position {
		return false
	}
	incomeKnown := false
	for _, field := range p.AIFields {
		incomeKnown = incomeKnown || field.Remaining > 0
	}
	if !incomeKnown {
		return false
	}
	// Observe earns additional sight only beyond the current ordinary radius.
	// Effective own sight includes upgrades/buffs; close targets retain normal skills.
	sight := e.sightRange(v)
	for _, enemy := range p.AIKnowledge {
		d := distance(v.Position, enemy.Position)
		if aiActiveOpponent(p, view, enemy.Owner) && e.Tick()-enemy.Seen <= seconds(30) && d > sight && d <= sight+reconObserveSightBonus {
			return true
		}
	}
	return false
}

// Radar acquires a hidden remembered/public-indicator goal. The cast range,
// power, source cooldown and energy are checked by the ordinary helper, and the
// shared planning ledger reserves one payment before another ability can use it.
func (e *Engine) aiRadarPulseOrder(p *Player, view View, own []EntityView, goal Vec, used map[ID]bool) (Order, bool) {
	if p.AI == "easy" || e.canSee(p.ID, goal) {
		return Order{}, false
	}
	knownGoal := false
	for _, enemy := range p.AIKnowledge {
		knownGoal = knownGoal || aiActiveOpponent(p, view, enemy.Owner) && enemy.Position == goal
	}
	for _, indicator := range view.Indicators {
		knownGoal = knownGoal || aiActiveOpponent(p, view, indicator.Owner) && indicator.Position == goal
	}
	if !knownGoal {
		return Order{}, false
	}
	var source *Entity
	order := Order{Kind: "ability", Type: "radar_pulse", Position: goal}
	for _, observed := range own {
		if observed.Owner != p.ID || used[observed.ID] {
			continue
		}
		v := e.entity(observed.ID)
		if v == nil || e.radarPulseReadyCode(p, v, order) != "ok" {
			continue
		}
		if source == nil || v.ID < source.ID {
			source = v
		}
	}
	if source == nil {
		return Order{}, false
	}
	order.Entities = []ID{source.ID}
	return order, true
}
