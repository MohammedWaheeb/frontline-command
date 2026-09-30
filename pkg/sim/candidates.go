package sim

import (
	"errors"
	"frontlinecommand/pkg/content"
)

// Independent probes are restricted to contextual intentions that can be
// checked without applying spending, production or ability effects.
var candidateKinds = map[string]bool{"move": true, "rally": true, "repair": true, "resume": true, "board": true, "guard": true, "escort": true, "capture": true, "attack": true, "gather": true, "gather_depot": true, "retreat_when_attacked": true, "salvage": true, "unload": true, "return": true}

// PreviewCandidates checks alternatives independently against one tick. Never
// interpret these as a sequential purchase/queue/ability batch. The planner must
// recheck its selected final intentions with PreviewOrders.
func (e *Engine) PreviewCandidates(player PlayerID, orders []Order) ([]OrderResult, error) {
	save, err := e.SaveForAdvice()
	if err != nil {
		return nil, err
	}
	return PreviewSavedCandidates(e.catalog, save, player, orders)
}
func PreviewSavedCandidates(c *content.Catalog, save []byte, player PlayerID, orders []Order) ([]OrderResult, error) {
	for _, o := range orders {
		if !candidateKinds[o.Kind] {
			return nil, errors.New("unsupported_candidate")
		}
	}
	preview, err := Restore(c, save)
	if err != nil {
		return nil, err
	}
	p := preview.player(player)
	if p != nil {
		p.LastSequence = 0
		p.CommandCount = 0
	}
	preview.state.Pending = nil
	if err := preview.Submit(player, 1, orders); err != nil {
		return nil, err
	}
	results := make([]OrderResult, 0, len(orders))
	for i, o := range preview.state.Pending[0].Orders {
		effective, code := preview.eligibleOrder(p, o)
		if code == "ok" {
			code = preview.previewKnowledge(p, effective)
		}
		if code == "ok" {
			selected := make([]*Entity, 0, len(effective.Entities))
			for _, id := range effective.Entities {
				selected = append(selected, preview.entity(id))
			}
			switch effective.Kind {
			case "rally": // Affordances already require a building. No mutation.
			case "resume":
				code = preview.validateResume(player, selected[0], preview.entity(effective.Target))
			default:
				code = preview.validateMobileOrder(player, effective, selected)
			}
		}
		results = append(results, OrderResult{Player: player, Index: int32(i), Accepted: code == "ok" || code == "indeterminate", Code: code, Tick: preview.state.Tick, EligibleEntities: effective.Entities})
	}
	return results, nil
}
