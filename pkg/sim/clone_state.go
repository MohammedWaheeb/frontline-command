package sim

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"slices"

	"frontlinecommand/pkg/content"
)

// MarshalState serializes a State value into the sealed save envelope.
// It is byte-identical to Engine.Save for the same state and is safe to
// call from another goroutine on a value returned by CloneState.
func MarshalState(state State) ([]byte, error) {
	b, err := json.Marshal(state)
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256(b)
	return json.Marshal(saveEnvelope{Version: 1, SHA256: hex.EncodeToString(h[:]), State: b})
}

// CloneState returns a deep copy of the live state that shares no
// mutable memory with the engine, so a caller can marshal it off the
// tick loop while the engine keeps advancing. The copy is structural
// (no JSON round-trip) except for the static mission definition.
func (e *Engine) CloneState() State {
	s := e.state
	s.Telemetry = cloneTelemetry(s.Telemetry)
	s.SpawnPlayers = slices.Clone(s.SpawnPlayers)
	s.MapOriginalTiles = slices.Clone(s.MapOriginalTiles)
	s.DestroyedObjects = slices.Clone(s.DestroyedObjects)
	s.Mission = cloneMission(s.Mission)
	s.Map = cloneMap(s.Map)
	s.Players = clonePlayers(s.Players)
	s.Entities = clonePtrSlice(s.Entities, cloneEntity)
	s.Fields = clonePtrSlice(s.Fields, cloneResourceField)
	s.Stations = clonePtrSlice(s.Stations, cloneValue)
	s.Projectiles = clonePtrSlice(s.Projectiles, cloneValue)
	s.Pending = cloneScheduled(s.Pending)
	s.Log = cloneScheduled(s.Log)
	s.Results = cloneResults(s.Results)
	s.Events = cloneEvents(s.Events)
	s.Zones = slices.Clone(s.Zones)
	s.Operations = cloneOperations(s.Operations)
	s.Salvage = slices.Clone(s.Salvage)
	return s
}

func cloneValue[T any](in *T) *T {
	if in == nil {
		return nil
	}
	out := *in
	return &out
}

func clonePtrSlice[T any](in []*T, clone func(*T) *T) []*T {
	if in == nil {
		return nil
	}
	out := make([]*T, len(in))
	for i, v := range in {
		out[i] = clone(v)
	}
	return out
}

func cloneMap(m content.Map) content.Map {
	m.Tiles = slices.Clone(m.Tiles)
	m.Spawns = slices.Clone(m.Spawns)
	m.Fields = slices.Clone(m.Fields)
	m.Stations = slices.Clone(m.Stations)
	m.Regions = slices.Clone(m.Regions)
	m.Objects = slices.Clone(m.Objects)
	return m
}

func clonePlayers(in []*Player) []*Player {
	if in == nil {
		return nil
	}
	out := make([]*Player, len(in))
	for i, p := range in {
		if p == nil {
			continue
		}
		q := *p
		q.AIKnowledge = slices.Clone(q.AIKnowledge)
		q.AIFields = slices.Clone(q.AIFields)
		q.KnownFields = slices.Clone(q.KnownFields)
		q.KnownRubble = slices.Clone(q.KnownRubble)
		q.SalvageIncome = slices.Clone(q.SalvageIncome)
		q.Upgrades = slices.Clone(q.Upgrades)
		q.Cooldowns = slices.Clone(q.Cooldowns)
		q.Explored = slices.Clone(q.Explored)
		q.Memory = slices.Clone(q.Memory)
		out[i] = &q
	}
	return out
}

func cloneOrder(o Order) Order {
	o.Entities = slices.Clone(o.Entities)
	o.Points = slices.Clone(o.Points)
	return o
}

func cloneEntity(in *Entity) *Entity {
	if in == nil {
		return nil
	}
	out := *in
	out.Jobs = slices.Clone(out.Jobs)
	if in.Orders != nil {
		out.Orders = make([]Order, len(in.Orders))
		for i, o := range in.Orders {
			out.Orders[i] = cloneOrder(o)
		}
	}
	out.Path = slices.Clone(out.Path)
	if in.Landing != nil {
		l := *in.Landing
		out.Landing = &l
	}
	out.Cooldowns = slices.Clone(out.Cooldowns)
	out.Passengers = slices.Clone(out.Passengers)
	out.Contributions = slices.Clone(out.Contributions)
	out.Buffs = slices.Clone(out.Buffs)
	return &out
}

func cloneResourceField(in *ResourceField) *ResourceField {
	if in == nil {
		return nil
	}
	out := *in
	out.Queue = slices.Clone(out.Queue)
	return &out
}

func cloneScheduled(in []Scheduled) []Scheduled {
	if in == nil {
		return nil
	}
	out := make([]Scheduled, len(in))
	for i, sc := range in {
		if sc.Orders != nil {
			orders := make([]Order, len(sc.Orders))
			for j, o := range sc.Orders {
				orders[j] = cloneOrder(o)
			}
			sc.Orders = orders
		}
		out[i] = sc
	}
	return out
}

func cloneResults(in []OrderResult) []OrderResult {
	if in == nil {
		return nil
	}
	out := make([]OrderResult, len(in))
	for i, r := range in {
		r.EligibleEntities = slices.Clone(r.EligibleEntities)
		out[i] = r
	}
	return out
}

func cloneEvents(in []Event) []Event {
	if in == nil {
		return nil
	}
	out := make([]Event, len(in))
	for i, ev := range in {
		if ev.Combat != nil {
			c := *ev.Combat
			ev.Combat = &c
		}
		out[i] = ev
	}
	return out
}

func cloneOperations(in []Operation) []Operation {
	if in == nil {
		return nil
	}
	out := make([]Operation, len(in))
	for i, op := range in {
		op.Points = slices.Clone(op.Points)
		out[i] = op
	}
	return out
}

func cloneMission(in *MissionState) *MissionState {
	if in == nil {
		return nil
	}
	out := *in
	// The definition is a static authored blueprint parsed at New;
	// a JSON round-trip is the safest deep copy for its nested
	// condition/action trees and is small relative to live state.
	if b, err := json.Marshal(in.Definition); err == nil {
		var def content.Mission
		if json.Unmarshal(b, &def) == nil {
			out.Definition = def
		}
	}
	out.Objectives = cloneObjectives(in.Objectives)
	out.Triggers = cloneTriggers(in.Triggers)
	out.KnownTags = slices.Clone(out.KnownTags)
	out.Counters = slices.Clone(out.Counters)
	if in.Convoys != nil {
		out.Convoys = make([]ConvoyState, len(in.Convoys))
		for i, c := range in.Convoys {
			c.Approved = slices.Clone(c.Approved)
			out.Convoys[i] = c
		}
	}
	return &out
}

func cloneConditionProgress(in ConditionProgress) ConditionProgress {
	out := in
	if in.Children != nil {
		out.Children = make([]ConditionProgress, len(in.Children))
		for i, child := range in.Children {
			out.Children[i] = cloneConditionProgress(child)
		}
	}
	return out
}

func cloneObjectives(in []ObjectiveState) []ObjectiveState {
	if in == nil {
		return nil
	}
	out := make([]ObjectiveState, len(in))
	for i, objective := range in {
		objective.Condition = cloneConditionProgress(objective.Condition)
		out[i] = objective
	}
	return out
}

func cloneTriggers(in []TriggerState) []TriggerState {
	if in == nil {
		return nil
	}
	out := make([]TriggerState, len(in))
	for i, trigger := range in {
		trigger.Condition = cloneConditionProgress(trigger.Condition)
		out[i] = trigger
	}
	return out
}

func cloneTelemetry(in *MatchTelemetry) *MatchTelemetry {
	if in == nil {
		return nil
	}
	out := *in
	out.Events = slices.Clone(out.Events)
	if in.Players != nil {
		out.Players = make([]PlayerTelemetry, len(in.Players))
		for i, p := range in.Players {
			p.UnitsProduced = slices.Clone(p.UnitsProduced)
			p.BuildingsConstructed = slices.Clone(p.BuildingsConstructed)
			p.Timeline = slices.Clone(p.Timeline)
			out.Players[i] = p
		}
	}
	return &out
}
