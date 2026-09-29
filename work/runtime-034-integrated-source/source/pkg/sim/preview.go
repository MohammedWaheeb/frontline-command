package sim

import (
	"frontlinecommand/pkg/content"
	"slices"
	"strings"
)

// PreviewOrders is advisory and fog-safe. Accepted means that submitting an
// intention is reasonable, never a promise of execution. Code "indeterminate"
// explicitly defers geometry, abilities, non-owned targets and dependent batch
// effects to execution. It must not be shown as a green placement guarantee.
// Exact owned-only checks run on a detached copy at the current tick, without
// combat, economy, navigation or a change to the live command log or RNG.
func (e *Engine) PreviewOrders(player PlayerID, orders []Order) ([]OrderResult, error) {
	save, err := e.SaveForAdvice()
	if err != nil {
		return nil, err
	}
	return PreviewSavedOrders(e.catalog, save, player, orders)
}

// SaveForAdvice captures an internal, detached-preview input. It is not a
// resumable user save: pending submissions and replay/event history are omitted
// because advice never executes them. Work therefore does not grow with the
// command-log window. Call only at a tick boundary on the owning match actor.
func (e *Engine) SaveForAdvice() ([]byte, error) {
	state := e.state // Headers only; Save reads these shared slices synchronously.
	state.Log, state.Pending, state.Events, state.Results = nil, nil, nil, nil
	state.Telemetry = nil
	state.LogOrders, state.LogBase = 0, 0
	snapshot := Engine{state: state}
	return snapshot.Save()
}

// PreviewSavedOrders lets a host capture one immutable tick in its match actor
// and do the bounded clone work outside that actor. The save is never returned
// to a client. It has the same fog-safe contract as PreviewOrders.
func PreviewSavedOrders(c *content.Catalog, save []byte, player PlayerID, orders []Order) ([]OrderResult, error) {
	preview, err := Restore(c, save)
	if err != nil {
		return nil, err
	}
	result, err := preview.previewDetachedAdvice(player, orders)
	return result.Results, err
}

func (e *Engine) previewDetachedAdvice(player PlayerID, orders []Order) (OrderPreview, error) {
	// Preview is not command admission: sequence, pending and command-rate
	// counters belong exclusively to actual submitted commands.
	p := e.player(player)
	if p != nil {
		p.LastSequence = 0
		p.CommandCount = 0
	}
	e.state.Pending = nil
	e.state.Results = nil
	e.state.Events = nil
	if err := e.Submit(player, 1, orders); err != nil {
		return OrderPreview{}, err
	}
	plans := e.strategicPlans(p, e.state.Pending[0].Orders)
	results := make([]OrderResult, 0, len(orders))
	deferred := false
	for i, o := range e.state.Pending[0].Orders {
		code := e.previewKnowledge(p, o)
		if code == "ok" {
			if deferred {
				code = "indeterminate"
			} else {
				switch o.Kind {
				case "build":
					_, code = e.buildingRequirements(p, e.entity(o.Entities[0]), o)
					if code == "ok" {
						code = "indeterminate"
					}
				case "ability", "convoy_hold", "convoy_advance", "practice_spawn", "practice_remove", "practice_restore", "practice_resources", "practice_fog":
					code = "indeterminate"
				default:
					code = e.execute(player, o)
				}
			}
		}
		if code == "indeterminate" {
			deferred = true
		}
		results = append(results, OrderResult{Player: player, Index: int32(i), Accepted: code == "ok" || code == "indeterminate", Code: code, Tick: e.state.Tick})
	}
	return OrderPreview{Tick: e.state.Tick, Results: results, Plans: plans}, nil
}

// Check only private information belonging to this player and public target
// properties. The non-owned branches never call execute: even visible enemies
// have private cooldowns, passengers, resistance and production state.
func (e *Engine) previewKnowledge(p *Player, o Order) string {
	if p.Defeated || e.state.Outcome.Finished {
		return "player_inactive"
	}
	if strings.HasPrefix(o.Kind, "practice_") {
		return "indeterminate"
	}
	if len(o.Entities) == 0 {
		return "ok"
	}
	for _, id := range o.Entities {
		v := e.entity(id)
		if v.Container != 0 {
			return "unit_embarked"
		}
		if e.role(v) == "support_plane" {
			return "unit_not_controllable"
		}
		a := e.entityAffordance(p, v)
		if !slices.Contains(a.Commands, o.Kind) {
			return "unsupported_command"
		}
		if o.Queued && len(v.Orders) >= 10 {
			return "queue_full"
		}
		if o.Kind == "ability" && id == o.Entities[0] && !slices.Contains(a.Abilities, o.Type) {
			return "unsupported_ability"
		}
	}
	if (o.Kind == "build" || o.Kind == "train" || o.Kind == "research" || o.Kind == "cancel") && len(o.Entities) != 1 {
		return "one_selection_required"
	}
	// These source checks use only owned information, including when a visible
	// enemy target means the remaining target checks must be deferred.
	switch o.Kind {
	case "move", "attack_move", "patrol", "stop", "hold", "guard", "escort", "aggressive", "attack", "force_fire", "gather", "salvage", "repair", "capture", "board", "unload", "return":
		selected := make([]*Entity, 0, len(o.Entities))
		for _, id := range o.Entities {
			selected = append(selected, e.entity(id))
		}
		if code := e.validateMobileSources(o, selected); code != "ok" {
			return code
		}
	}
	if o.Kind == "return" && o.Target != 0 {
		selected := make([]*Entity, 0, len(o.Entities))
		for _, id := range o.Entities {
			selected = append(selected, e.entity(id))
		}
		if code := e.validateRebase(p.ID, o, selected); code != "ok" {
			return code
		}
		for _, v := range selected {
			// Hidden aircraft can obstruct departure. Advice must not expose
			// them, so execution alone checks grounded takeoff geometry.
			if v.Home != o.Target && v.Landed {
				return "indeterminate"
			}
		}
		return "ok"
	}
	// Only these commands interpret Target as an entity/object ID. Irrelevant
	// target fields cannot cause another command to inspect a guessed enemy.
	switch o.Kind {
	case "attack", "capture", "board", "guard", "escort", "repair", "resume", "ability":
		if o.Target == 0 {
			if o.Kind == "guard" || o.Kind == "ability" {
				return "ok"
			}
			return "target_not_visible"
		}
		target := e.entity(o.Target)
		if target == nil || !e.canSeeEntity(p.ID, target) {
			if o.Kind == "capture" {
				for _, station := range e.state.Stations {
					if station.ID == o.Target && e.canSee(p.ID, station.Position) {
						if station.Owner == p.ID || e.defeated(station.Owner) || e.allied(p.ID, station.Owner) {
							return "invalid_capture_target"
						}
						return "indeterminate"
					}
				}
			}
			return "target_not_visible"
		}
		if e.defeated(target.Owner) {
			return "inactive_target"
		}
		if target.Owner == p.ID {
			return "ok"
		}
		switch o.Kind {
		case "repair", "resume":
			return "owned_target_required"
		case "guard", "escort":
			if !e.allied(p.ID, target.Owner) {
				return "friendly_target_required"
			}
		case "capture":
			// Health is quantized exactly as in PlayerView. Do not inspect a
			// hidden passenger list or exact enemy HP below that resolution.
			if target.MapObject != 0 || !target.Building || !target.Complete || e.allied(p.ID, target.Owner) || e.role(target) == "hq" || e.role(target) == "strategic" || target.HP*1000/target.MaxHP >= 250 {
				return "invalid_capture_target"
			}
		case "board":
			if target.Owner != 0 || e.role(target) != "garrison" || !target.Complete {
				return "invalid_transport"
			}
		case "attack":
			if e.allied(p.ID, target.Owner) {
				return "target_not_visible"
			}
			for _, id := range o.Entities {
				w, ok := e.weapon(e.entity(id))
				if !ok || w.Kind == "tactical" && e.armor(target) == "air" || w.Kind != "tactical" && e.catalog.Multiplier(w.Kind, e.armor(target)) == 0 {
					return "illegal_target_layer"
				}
			}
		}
		return "indeterminate"
	case "gather":
		if o.Target != 0 {
			f := e.field(uint32(o.Target))
			if f == nil || !e.explored(p.ID, f.Position) {
				return "unknown_field"
			}
		}
	case "salvage":
		crate := e.salvage(o.Target)
		if crate == nil || !e.canSee(p.ID, crate.Position) {
			return "salvage_not_visible"
		}
		if e.allied(p.ID, crate.Owner) {
			return "salvage_not_visible"
		}
	}
	return "ok"
}
