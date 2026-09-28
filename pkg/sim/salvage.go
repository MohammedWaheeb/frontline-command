package sim

func (e *Engine) salvage(id ID) *Salvage {
	for i := range e.state.Salvage {
		if e.state.Salvage[i].ID == id && e.state.Salvage[i].Until > e.state.Tick {
			return &e.state.Salvage[i]
		}
	}
	return nil
}
func (e *Engine) dropSalvage(v *Entity) {
	if v.Building || e.defeated(v.Owner) || v.TemporaryUntil > 0 || v.Paid <= 0 || !v.SalvageEligible {
		return
	}
	u, _ := e.catalog.Unit(v.Type)
	if u.Weapon == "" || (u.Armor != "light" && u.Armor != "heavy") {
		return
	}
	e.state.Salvage = append(e.state.Salvage, Salvage{Owner: v.Owner, ID: e.newID(), Position: v.Position, Value: min64(v.Paid*8/100, 120000), Until: e.state.Tick + seconds(45)})
}
func (e *Engine) collectSalvage(v *Entity) {
	crate := e.salvage(v.ChannelTarget)
	if crate == nil || e.allied(v.Owner, crate.Owner) {
		return
	}
	p := e.player(v.Owner)
	recent := int64(0)
	keep := p.SalvageIncome[:0]
	for _, entry := range p.SalvageIncome {
		if e.state.Tick-entry.Tick < seconds(60) {
			recent += entry.Amount
			keep = append(keep, entry)
		}
	}
	p.SalvageIncome = keep
	amount := max(int64(0), min64(crate.Value, min64(400000-recent, 3000000-p.SalvageTotal)))
	p.Credits += amount
	p.Income += amount
	p.SalvageTotal += amount
	p.SalvageIncome = append(p.SalvageIncome, SalvageIncome{e.state.Tick, amount})
	crate.Until = e.state.Tick
	if len(v.Orders) > 0 {
		e.completeMovementOrder(v)
	}
	kind := "salvage_collected"
	if amount == 0 {
		kind = "salvage_capped"
	}
	e.emit(kind, v.Owner, v.ID, v.Position, "owner", amount)
}

func (e *Engine) expireSalvage() {
	keep := e.state.Salvage[:0]
	for _, s := range e.state.Salvage {
		if s.Until > e.state.Tick {
			keep = append(keep, s)
		}
	}
	e.state.Salvage = keep
}
