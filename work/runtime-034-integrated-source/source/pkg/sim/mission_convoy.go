package sim

import (
	"errors"
	"frontlinecommand/pkg/content"
	"sort"
)

// ConvoyState stores only authored route progress and commander decisions. It
// uses normal ground movement, collision and damage. Countdown is sim time.
type ConvoyState struct {
	ID             string     `json:"id"`
	Active         bool       `json:"active"`
	Completed      bool       `json:"completed"`
	Held           bool       `json:"held"`
	Moving         bool       `json:"moving"`
	Route          uint32     `json:"route"`
	Waypoint       uint32     `json:"waypoint"`
	CountdownUntil Tick       `json:"countdown_until"`
	Approved       []PlayerID `json:"approved"`
}

func (e *Engine) convoy(id string) (*ConvoyState, content.MissionConvoy) {
	if e.state.Mission != nil {
		for i := range e.state.Mission.Convoys {
			if e.state.Mission.Convoys[i].ID == id {
				return &e.state.Mission.Convoys[i], e.state.Mission.Definition.Convoys[i]
			}
		}
	}
	return nil, content.MissionConvoy{}
}
func (e *Engine) convoyActors(tag string) []*Entity {
	actors := []*Entity{}
	for _, v := range e.state.Entities {
		if v.Tag == tag && v.HP > 0 {
			actors = append(actors, v)
		}
	}
	return actors
}
func (e *Engine) startConvoy(id string) bool {
	state, def := e.convoy(id)
	if state == nil || state.Active || state.Completed {
		return false
	}
	for _, c := range e.state.Mission.Convoys {
		if c.ID == id {
			break
		}
		if !c.Completed {
			return false
		}
	}
	for _, c := range e.state.Mission.Convoys {
		if c.Active {
			return false
		}
	}
	actors := e.convoyActors(def.Tag)
	if len(actors) == 0 {
		return false
	}
	for _, v := range actors {
		if v.Building || e.isAircraft(v) || v.Container != 0 || e.defeated(v.Owner) {
			return false
		}
	}
	state.Active = true
	state.CountdownUntil = e.state.Tick + Tick(def.CountdownTicks)
	e.convoyNotice("convoy_countdown", state, def)
	for _, v := range actors {
		e.assign(v, Order{Kind: "hold"})
	}
	return true
}
func (e *Engine) convoyNotice(kind string, state *ConvoyState, def content.MissionConvoy) {
	actors := e.convoyActors(def.Tag)
	if len(actors) == 0 {
		return
	}
	value := int64(state.CountdownUntil)
	if kind == "convoy_completed" {
		value = 1
	}
	e.emit(kind, actors[0].Owner, actors[0].ID, actors[0].Position, "team", value)
	e.state.Events[len(e.state.Events)-1].Text = state.ID
}
func (e *Engine) convoyControl(p *Player, o Order) string {
	if p == nil || p.Defeated || p.Controller != "human" {
		return "convoy_commander_required"
	}
	state, def := e.convoy(o.Type)
	if state == nil || !state.Active || state.Completed {
		return "convoy_not_active"
	}
	actors := e.convoyActors(def.Tag)
	if len(actors) == 0 || !e.allied(p.ID, actors[0].Owner) {
		return "convoy_unavailable"
	}
	if o.Kind == "convoy_hold" {
		state.Held = true
		state.Moving = false
		state.CountdownUntil = 0
		state.Approved = nil
		for _, v := range actors {
			e.assign(v, Order{Kind: "hold"})
		}
		e.convoyNotice("convoy_held", state, def)
		return "ok"
	}
	if o.Kind != "convoy_advance" {
		return "invalid_convoy_order"
	}
	if o.Index < 0 || int(o.Index) >= len(def.Routes) {
		return "convoy_route_missing"
	}
	if !state.Held {
		return "convoy_not_held"
	}
	if state.Route != uint32(o.Index) {
		state.Route = uint32(o.Index)
		state.Approved = nil
	}
	found := false
	for _, id := range state.Approved {
		if id == p.ID {
			found = true
		}
	}
	if !found {
		state.Approved = append(state.Approved, p.ID)
		sort.Slice(state.Approved, func(i, j int) bool { return state.Approved[i] < state.Approved[j] })
	}
	agreed := true
	for _, commander := range e.state.Players {
		if commander.Controller != "human" || commander.Defeated || commander.Team != p.Team {
			continue
		}
		voted := false
		for _, id := range state.Approved {
			if id == commander.ID {
				voted = true
			}
		}
		if !voted {
			agreed = false
		}
	}
	if agreed {
		state.Held = false
		state.Approved = nil
		state.CountdownUntil = e.state.Tick + Tick(def.CountdownTicks)
		e.convoyNotice("convoy_countdown", state, def)
	}
	return "ok"
}
func (e *Engine) updateConvoys() {
	for i := range e.state.Mission.Convoys {
		state, def := &e.state.Mission.Convoys[i], e.state.Mission.Definition.Convoys[i]
		if !state.Active || state.Held {
			continue
		}
		actors := e.convoyActors(def.Tag)
		if len(actors) == 0 {
			continue
		} // Authored tag_destroyed failure decides outcome.
		if state.Moving {
			region := e.missionRegion(def.Routes[state.Route][state.Waypoint])
			arrived := true
			for _, actor := range actors {
				if actor.Container != 0 || !inMissionRegion(actor.Position, region) {
					arrived = false
				}
			}
			if !arrived {
				continue
			}
			for _, actor := range actors {
				e.assign(actor, Order{Kind: "hold"})
			}
			state.Moving = false
			state.Waypoint++
			if int(state.Waypoint) == len(def.Routes[state.Route]) {
				state.Active = false
				state.Completed = true
				state.CountdownUntil = 0
				e.convoyNotice("convoy_completed", state, def)
				continue
			}
			state.CountdownUntil = e.state.Tick + Tick(def.CountdownTicks)
			e.convoyNotice("convoy_countdown", state, def)
			continue
		}
		if e.state.Tick < state.CountdownUntil {
			continue
		}
		region := e.missionRegion(def.Routes[state.Route][state.Waypoint])
		// Authored regions need enough area for each truck to arrive. Formation
		// points are clamped to this explicit region, never to hidden enemy state.
		goal := Vec{X: (region.Min.X + region.Max.X) / 2, Y: (region.Min.Y + region.Max.Y) / 2}
		for j, actor := range actors {
			point := e.formationPoint(goal, j, len(actors))
			point.X = clamp(point.X, region.Min.X, region.Max.X)
			point.Y = clamp(point.Y, region.Min.Y, region.Max.Y)
			e.assign(actor, Order{Kind: "move", Position: point})
		}
		state.Moving = true
		state.CountdownUntil = 0
		e.convoyNotice("convoy_advancing", state, def)
	}
}
func (e *Engine) validateConvoys() error {
	ms := e.state.Mission
	if len(ms.Convoys) != len(ms.Definition.Convoys) {
		return errors.New("convoy progress shape mismatch")
	}
	active, unfinished := 0, false
	for i, state := range ms.Convoys {
		def := ms.Definition.Convoys[i]
		if state.ID != def.ID || int(state.Route) >= len(def.Routes) || int(state.Waypoint) > len(def.Routes[state.Route]) || len(state.Approved) > 2 || state.CountdownUntil > e.state.Tick+Tick(def.CountdownTicks) {
			return errors.New("invalid convoy progress")
		}
		if state.Active {
			active++
		}
		if state.Completed && (state.Active || state.Held || state.Moving || state.CountdownUntil != 0 || int(state.Waypoint) != len(def.Routes[state.Route])) || state.Active && state.Completed || state.Held && (!state.Active || state.Moving || state.CountdownUntil != 0) || state.Moving && (!state.Active || state.CountdownUntil != 0) || !state.Active && !state.Completed && (state.Held || state.Moving || state.Waypoint != 0 || state.Route != 0 || state.CountdownUntil != 0 || len(state.Approved) != 0) || state.Active && !state.Held && !state.Moving && state.CountdownUntil == 0 || state.Active && int(state.Waypoint) >= len(def.Routes[state.Route]) || len(state.Approved) > 0 && !state.Held {
			return errors.New("inconsistent convoy state")
		}
		if unfinished && (state.Active || state.Completed) {
			return errors.New("convoys must start sequentially")
		}
		if !state.Completed {
			unfinished = true
		}
		last := PlayerID(0)
		for _, id := range state.Approved {
			p := e.player(id)
			if p == nil || p.Controller != "human" || id <= last {
				return errors.New("invalid convoy approval")
			}
			last = id
		}
	}
	if active > 1 {
		return errors.New("multiple active convoys")
	}
	return nil
}
