package sim

import "frontlinecommand/pkg/content"

// Catalog.Building protects external callers with a fresh prerequisite slice.
// The single-owner simulation keeps a private read-only copy per type so hot
// collision and sight loops do not allocate millions of those slices. This
// derived cache is excluded from saves and never changes gameplay state.
func (e *Engine) buildingRule(id string) (content.Building, bool) {
	if b, ok := e.buildingRules[id]; ok {
		return b, true
	}
	b, ok := e.catalog.Building(id)
	if !ok {
		return b, false
	}
	if e.buildingRules == nil {
		e.buildingRules = map[string]content.Building{}
	}
	e.buildingRules[id] = b
	return b, true
}
