package sim

import (
	"fmt"
	"sort"
)

// Match telemetry is deterministic saved state. It is never part of a live
// opponent's view: a complete debrief is released only when the match finishes.
type EconomySample struct {
	Tick     Tick   `json:"tick"`
	Credits  int64  `json:"credits"`
	Income   int64  `json:"income"`
	Spent    int64  `json:"spent"`
	Supply   int32  `json:"supply"`
	Stations uint32 `json:"stations"`
}
type ProductionCount struct {
	Type  string `json:"type"`
	Count uint32 `json:"count"`
}
type PlayerTelemetry struct {
	Player               PlayerID          `json:"player"`
	UnitsProduced        []ProductionCount `json:"units_produced"`
	BuildingsConstructed []ProductionCount `json:"buildings_constructed"`
	UnitsLost            uint32            `json:"units_lost"`
	BuildingsLost        uint32            `json:"buildings_lost"`
	RepairSpent          int64             `json:"repair_spent"`
	MissileSpent         int64             `json:"missile_spent"`
	InterceptorsFired    uint32            `json:"interceptors_fired"`
	StationControlTicks  uint32            `json:"station_control_ticks"`
	Timeline             []EconomySample   `json:"timeline"`
}
type DebriefEvent struct {
	Tick   Tick     `json:"tick"`
	Kind   string   `json:"kind"`
	Player PlayerID `json:"player"`
	Type   string   `json:"type"`
	Text   string   `json:"text"`
}
type MatchTelemetry struct {
	Players       []PlayerTelemetry `json:"players"`
	Events        []DebriefEvent    `json:"events"`
	OmittedEvents uint32            `json:"omitted_events"`
}
type DebriefPlayer struct {
	Player              PlayerID        `json:"player"`
	Name                string          `json:"name"`
	Faction             string          `json:"faction"`
	Team                uint32          `json:"team"`
	Color               uint32          `json:"color"`
	Defeated            bool            `json:"defeated"`
	Credits             int64           `json:"credits"`
	Income              int64           `json:"income"`
	Spent               int64           `json:"spent"`
	LostValue           int64           `json:"lost_value"`
	UnitsSurviving      uint32          `json:"units_surviving"`
	StructuresSurviving uint32          `json:"structures_surviving"`
	ExploredTiles       uint32          `json:"explored_tiles"`
	Metrics             PlayerTelemetry `json:"metrics"`
}
type Debrief struct {
	Players       []DebriefPlayer `json:"players"`
	Events        []DebriefEvent  `json:"events"`
	OmittedEvents uint32          `json:"omitted_events"`
}

func (e *Engine) ensureTelemetry() {
	if e.state.Telemetry != nil {
		return
	}
	e.state.Telemetry = &MatchTelemetry{}
	for _, p := range e.state.Players {
		e.state.Telemetry.Players = append(e.state.Telemetry.Players, PlayerTelemetry{Player: p.ID})
	}
}
func (e *Engine) playerTelemetry(owner PlayerID) *PlayerTelemetry {
	e.ensureTelemetry()
	for i := range e.state.Telemetry.Players {
		if e.state.Telemetry.Players[i].Player == owner {
			return &e.state.Telemetry.Players[i]
		}
	}
	return nil
}
func addProduction(list *[]ProductionCount, typ string) {
	i := sort.Search(len(*list), func(i int) bool { return (*list)[i].Type >= typ })
	if i < len(*list) && (*list)[i].Type == typ {
		(*list)[i].Count++
		return
	}
	*list = append(*list, ProductionCount{})
	copy((*list)[i+1:], (*list)[i:])
	(*list)[i] = ProductionCount{Type: typ, Count: 1}
}
func (e *Engine) recordTelemetryMetric(kind string, owner PlayerID, id ID, value int64) {
	stats := e.playerTelemetry(owner)
	if stats == nil {
		return
	}
	v := e.entity(id)
	switch kind {
	case "unit_ready":
		if v != nil && !v.Building {
			addProduction(&stats.UnitsProduced, v.Type)
		}
	case "construction_complete":
		if v != nil && v.Building {
			addProduction(&stats.BuildingsConstructed, v.Type)
		}
	case "destroyed":
		if v == nil || e.defeated(owner) {
			return
		}
		for _, event := range e.state.Events {
			if event.Kind == "building_sold" && event.Entity == id {
				return
			}
		}
		if v.Building {
			stats.BuildingsLost++
		} else {
			stats.UnitsLost++
		}
	case "repair_spent":
		stats.RepairSpent += max(int64(0), value)
	case "missile_spent":
		stats.MissileSpent += max(int64(0), value)
	case "interceptor_fired":
		stats.InterceptorsFired++
	}
}
func (e *Engine) recordDebriefEvent(event Event) {
	switch event.Kind {
	case "player_defeated", "defeat_countdown", "building_captured", "station_captured", "objective_complete", "objective_failed", "checkpoint", "strategic_activated", "match_ended", "mission_complete", "mission_failed":
	default:
		return
	}
	e.ensureTelemetry()
	typ := ""
	if v := e.entity(event.Entity); v != nil {
		typ = v.Type
	}
	t := e.state.Telemetry
	if len(t.Events) >= 256 {
		// Preserve opening milestones and the latest224, with an explicit omission count.
		copy(t.Events[32:], t.Events[33:])
		t.Events = t.Events[:255]
		t.OmittedEvents++
	}
	t.Events = append(t.Events, DebriefEvent{Tick: event.Tick, Kind: event.Kind, Player: event.Owner, Type: typ, Text: event.Text})
}
func (e *Engine) sampleTelemetry(initial bool) {
	e.ensureTelemetry()
	if !initial {
		for _, event := range e.state.Events {
			e.recordDebriefEvent(event)
		}
	}
	for _, p := range e.state.Players {
		stats := e.playerTelemetry(p.ID)
		stations := uint32(0)
		if !p.Defeated {
			for _, s := range e.state.Stations {
				if s.Owner == p.ID {
					stations++
				}
			}
		}
		if !initial {
			stats.StationControlTicks += stations
		}
		if len(stats.Timeline) > 0 && !e.state.Outcome.Finished && e.state.Tick%seconds(20) != 0 {
			continue
		}
		if len(stats.Timeline) > 0 && stats.Timeline[len(stats.Timeline)-1].Tick == e.state.Tick {
			continue
		}
		stats.Timeline = append(stats.Timeline, EconomySample{Tick: e.state.Tick, Credits: p.Credits, Income: p.Income, Spent: p.Spent, Supply: p.Supply, Stations: stations})
	}
}

// Debrief returns an independent post-match copy, never private live state.
func (e *Engine) Debrief() *Debrief {
	if !e.state.Outcome.Finished {
		return nil
	}
	result := &Debrief{}
	if e.state.Telemetry != nil {
		result.Events = append([]DebriefEvent(nil), e.state.Telemetry.Events...)
		result.OmittedEvents = e.state.Telemetry.OmittedEvents
	}
	for _, p := range e.state.Players {
		entry := DebriefPlayer{Player: p.ID, Name: p.Name, Faction: p.Faction, Team: p.Team, Color: p.Color, Defeated: p.Defeated, Credits: p.Credits, Income: p.Income, Spent: p.Spent, LostValue: p.Lost, Metrics: PlayerTelemetry{Player: p.ID}}
		if e.state.Telemetry != nil {
			for _, stats := range e.state.Telemetry.Players {
				if stats.Player == p.ID {
					entry.Metrics = stats
					entry.Metrics.UnitsProduced = append([]ProductionCount(nil), stats.UnitsProduced...)
					entry.Metrics.BuildingsConstructed = append([]ProductionCount(nil), stats.BuildingsConstructed...)
					entry.Metrics.Timeline = append([]EconomySample(nil), stats.Timeline...)
					break
				}
			}
		}
		for _, explored := range p.Explored {
			if explored {
				entry.ExploredTiles++
			}
		}
		if !p.Defeated {
			for _, v := range e.state.Entities {
				if v.Owner == p.ID && v.HP > 0 {
					if v.Building {
						entry.StructuresSurviving++
					} else {
						entry.UnitsSurviving++
					}
				}
			}
		}
		result.Players = append(result.Players, entry)
	}
	return result
}
func (e *Engine) validateTelemetry() error {
	t := e.state.Telemetry
	if t == nil {
		return nil
	}
	if len(t.Players) != len(e.state.Players) || len(t.Events) > 256 || t.OmittedEvents > 1000000 {
		return fmt.Errorf("invalid telemetry bounds")
	}
	for i, stats := range t.Players {
		if stats.Player != e.state.Players[i].ID || len(stats.Timeline) > 544 || stats.RepairSpent < 0 || stats.RepairSpent > 1000000000000 || stats.MissileSpent < 0 || stats.MissileSpent > 1000000000000 || stats.StationControlTicks > uint32(e.state.Tick)*32 || stats.UnitsLost > 1000000 || stats.BuildingsLost > 1000000 || stats.InterceptorsFired > 1000000 {
			return fmt.Errorf("invalid player telemetry")
		}
		for j, sample := range stats.Timeline {
			if sample.Tick > e.state.Tick || j > 0 && sample.Tick <= stats.Timeline[j-1].Tick || sample.Credits < 0 || sample.Income < 0 || sample.Spent < 0 || sample.Supply < 0 || sample.Supply > 100 || sample.Stations > 32 {
				return fmt.Errorf("invalid economy timeline")
			}
		}
		for group, list := range [][]ProductionCount{stats.UnitsProduced, stats.BuildingsConstructed} {
			if len(list) > 100 {
				return fmt.Errorf("invalid production telemetry")
			}
			for j, item := range list {
				_, unit := e.catalog.Unit(item.Type)
				_, building := e.buildingRule(item.Type)
				if item.Count == 0 || item.Count > 1000000 || group == 0 && !unit || group == 1 && !building || j > 0 && item.Type <= list[j-1].Type {
					return fmt.Errorf("invalid production counter")
				}
			}
		}
	}
	for i, event := range t.Events {
		if event.Tick > e.state.Tick || i > 0 && event.Tick < t.Events[i-1].Tick || len(event.Kind) > 64 || len(event.Type) > 100 || len(event.Text) > 1000 || event.Player != 0 && e.player(event.Player) == nil {
			return fmt.Errorf("invalid debrief event")
		}
	}
	return nil
}
