package sim

// Stall observations are presentation-only, measured in simulation ticks. A
// restore/seek starts a conservative new observation window, preserving legacy
// save bytes, simulation hashes, and replay rules. Queries never update it.
const constructionStallTicks Tick = 60

type constructionObservation struct {
	work         uint32
	lastProgress Tick
}

func (e *Engine) observeConstructionProgress() {
	for id := range e.constructionProgress {
		v := e.entity(id)
		if v == nil || !v.Building || v.Complete || v.HP <= 0 || e.defeated(v.Owner) {
			delete(e.constructionProgress, id)
		}
	}
	for _, v := range e.state.Entities {
		if !v.Building || v.Complete || v.HP <= 0 || e.defeated(v.Owner) {
			continue
		}
		observation, ok := e.constructionProgress[v.ID]
		if !ok || observation.work != v.Work {
			observation = constructionObservation{v.Work, e.state.Tick}
		}
		if e.constructionProgress == nil {
			e.constructionProgress = make(map[ID]constructionObservation)
		}
		e.constructionProgress[v.ID] = observation
	}
}

func (e *Engine) constructionStalled(v *Entity) bool {
	if !v.Building || v.Complete || v.HP <= 0 || e.defeated(v.Owner) {
		return false
	}
	observation, ok := e.constructionProgress[v.ID]
	return ok && observation.work == v.Work && e.state.Tick >= observation.lastProgress && e.state.Tick-observation.lastProgress >= constructionStallTicks
}

// Keep the preview and the eventual sell credit on the same integer formula.
// Paid zero (the starting HQ) and included supply haulers never mint a refund.
func (e *Engine) sellRefund(v *Entity) int64 {
	b, _ := e.buildingRule(v.Type)
	basis := v.Paid
	if b.Role == "supply" {
		basis = max(int64(0), basis-900000)
	}
	catalogBasis := b.Cost
	if b.Role == "supply" {
		catalogBasis -= 900000
	}
	basis = min64(basis, catalogBasis)
	return basis * v.HP / (2 * v.MaxHP)
}
