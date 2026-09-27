package sim

import (
	"errors"
	"frontlinecommand/pkg/content"
)

// Every condition node owns its continuous-hold timer. Holding distinguishes a
// legitimate tick-zero start from an unstarted timer across save/replay.
type ConditionProgress struct {
	Since    Tick                `json:"since"`
	Holding  bool                `json:"holding"`
	Children []ConditionProgress `json:"children,omitempty"`
}
type MissionCounter struct {
	Event string   `json:"event"`
	Owner PlayerID `json:"owner"`
	Tag   string   `json:"tag"`
	Type  string   `json:"type"`
	Count uint32   `json:"count"`
	Value int64    `json:"value"`
}

func newConditionProgress(q content.MissionCondition) ConditionProgress {
	p := ConditionProgress{}
	for _, child := range q.Children {
		p.Children = append(p.Children, newConditionProgress(child))
	}
	return p
}
func walkMissionConditions(def content.Mission, visit func(content.MissionCondition)) {
	var walk func(content.MissionCondition)
	walk = func(q content.MissionCondition) {
		visit(q)
		for _, child := range q.Children {
			walk(child)
		}
	}
	for _, o := range def.Objectives {
		walk(o.Condition)
	}
	for _, t := range def.Triggers {
		walk(t.Condition)
	}
}
func missionCounterMatches(counter MissionCounter, q content.MissionCondition) bool {
	return counter.Event == q.Event && uint32(counter.Owner) == q.Owner && counter.Tag == q.Tag && counter.Type == q.Type
}
func (e *Engine) initializeMissionCounters() {
	ms := e.state.Mission
	walkMissionConditions(ms.Definition, func(q content.MissionCondition) {
		if q.Kind != "event_count" && q.Kind != "event_value" {
			return
		}
		for _, counter := range ms.Counters {
			if missionCounterMatches(counter, q) {
				return
			}
		}
		ms.Counters = append(ms.Counters, MissionCounter{Event: q.Event, Owner: PlayerID(q.Owner), Tag: q.Tag, Type: q.Type})
	})
}

// recordMissionEvent counts only metrics declared by this scenario. Its memory
// is bounded by validated content, never by the number of events in a match.
func (e *Engine) recordMissionEvent(kind string, owner PlayerID, id ID, value int64) {
	e.recordTelemetryMetric(kind, owner, id, value)
	ms := e.state.Mission
	if ms == nil || (kind == "repair_spent" || kind == "missile_spent") && value <= 0 {
		return
	}
	entity := e.entity(id)
	for i := range ms.Counters {
		counter := &ms.Counters[i]
		if counter.Event != kind || counter.Owner != 0 && counter.Owner != owner || counter.Tag != "" && (entity == nil || entity.Tag != counter.Tag) || counter.Type != "" && (entity == nil || entity.Type != counter.Type) {
			continue
		}
		counter.Count = min(uint32(1000000000), counter.Count+1)
		counter.Value = min64(1000000000000, counter.Value+max(int64(0), value))
	}
}
func missionCompare(value, amount int64, comparator string) bool {
	if comparator == "at_most" {
		return value <= amount
	}
	return value >= amount
}
func (e *Engine) missionRegion(id string) content.Region {
	for _, region := range e.state.Map.Regions {
		if region.ID == id {
			return region
		}
	}
	return content.Region{}
}
func inMissionRegion(pos Vec, region content.Region) bool {
	return pos.X >= region.Min.X && pos.X <= region.Max.X && pos.Y >= region.Min.Y && pos.Y <= region.Max.Y
}
func (e *Engine) missionCondition(q content.MissionCondition, progress *ConditionProgress) (bool, uint32) {
	yes, count := false, uint32(0)
	switch q.Kind {
	case "all", "any", "at_least":
		for i, child := range q.Children {
			done, _ := e.missionCondition(child, &progress.Children[i])
			if done {
				count++
			}
		}
		required := uint32(len(q.Children))
		if q.Kind == "any" {
			required = 1
		}
		if q.Kind == "at_least" {
			required = q.Count
		}
		yes = count >= required
	case "timer":
		at := q.Tick
		for _, d := range e.state.Mission.Definition.Difficulty {
			if q.Wave && d.ID == e.state.Mission.Difficulty {
				at = uint32(uint64(at) * uint64(d.WaveTimeMultiplier) / 1000)
			}
		}
		yes = uint32(e.state.Tick) >= at
		count = min(at, uint32(e.state.Tick))
	case "tag_alive", "tag_destroyed", "tag_owned", "tag_operational", "tag_in_region", "tag_concealed", "tag_stationary":
		known := false
		for _, tag := range e.state.Mission.KnownTags {
			if tag == q.Tag {
				known = true
			}
		}
		for _, v := range e.state.Entities {
			if v.Tag != q.Tag || v.HP <= 0 || q.Kind != "tag_destroyed" && q.Owner != 0 && uint32(v.Owner) != q.Owner {
				continue
			}
			if q.Kind == "tag_operational" && !v.Active(e.state.Tick) || q.Kind == "tag_in_region" && (v.Container != 0 || !inMissionRegion(v.Position, e.missionRegion(q.Region))) || q.Kind == "tag_concealed" && !v.Concealed || q.Kind == "tag_stationary" && (v.Container != 0 || v.Position != v.LastPosition || e.state.Tick-v.StationarySince < Tick(q.Tick)) {
				continue
			}
			count++
		}
		if q.Kind == "tag_destroyed" {
			yes = known && count == 0
		} else {
			yes = count >= max(uint32(1), q.Count)
		}
	case "count_type":
		for _, v := range e.state.Entities {
			if v.HP > 0 && v.Complete && v.Type == q.Type && (q.Owner == 0 || uint32(v.Owner) == q.Owner) {
				count++
			}
		}
		threshold := q.Count
		if q.Compare != "at_most" {
			threshold = max(uint32(1), threshold)
		}
		yes = missionCompare(int64(count), int64(threshold), q.Compare)
	case "upgrade_owned":
		if p := e.player(PlayerID(q.Owner)); p != nil {
			yes = p.HasUpgrade(q.Type)
		}
	case "resource_threshold", "stat_threshold":
		p := e.player(PlayerID(q.Owner))
		value := int64(0)
		if p != nil {
			value = p.Credits
			if q.Kind == "stat_threshold" {
				switch q.Type {
				case "income":
					value = p.Income
				case "spent":
					value = p.Spent
				case "lost":
					value = p.Lost
				case "kills":
					value = int64(p.Kills)
				case "salvage":
					value = p.SalvageTotal
				}
			}
			yes = missionCompare(value, q.Amount, q.Compare)
			count = uint32(min64(value, 1000000000))
		}
	case "objective_complete":
		for _, o := range e.state.Mission.Objectives {
			if o.ID == q.Objective {
				yes = o.Complete
			}
		}
	case "region_entered", "region_held":
		region, enemy := e.missionRegion(q.Region), false
		for _, v := range e.state.Entities {
			if v.HP <= 0 || v.Container != 0 || v.Owner == 0 || !inMissionRegion(v.Position, region) {
				continue
			}
			if uint32(v.Owner) == q.Owner {
				count++
			} else if !e.allied(PlayerID(q.Owner), v.Owner) {
				enemy = true
			}
		}
		yes = count >= max(uint32(1), q.Count) && (q.Kind != "region_held" || !enemy)
	case "stations_owned":
		for _, station := range e.state.Stations {
			if uint32(station.Owner) == q.Owner && (q.Region == "" || inMissionRegion(station.Position, e.missionRegion(q.Region))) {
				count++
			}
		}
		yes = count >= max(uint32(1), q.Count)
	case "field_remaining":
		if field := e.field(q.Field); field != nil {
			yes = missionCompare(field.Remaining, q.Amount, q.Compare)
			count = uint32(min64(field.Remaining, 1000000000))
		}
	case "event_count", "event_value":
		for _, counter := range e.state.Mission.Counters {
			if !missionCounterMatches(counter, q) {
				continue
			}
			value, threshold := int64(counter.Count), int64(q.Count)
			if q.Kind == "event_value" {
				value, threshold = counter.Value, q.Amount
			}
			yes = missionCompare(value, threshold, q.Compare)
			count = uint32(min64(value, 1000000000))
		}
	case "convoy_completed":
		for _, convoy := range e.state.Mission.Convoys {
			if convoy.ID == q.Convoy {
				yes = convoy.Completed
			}
		}
	}
	if !yes {
		progress.Since = 0
		progress.Holding = false
		return false, count
	}
	if q.HoldTicks > 0 {
		if !progress.Holding {
			progress.Since = e.state.Tick
			progress.Holding = true
		}
		elapsed := uint32(e.state.Tick - progress.Since)
		return elapsed >= q.HoldTicks, min(q.HoldTicks, elapsed)
	}
	return true, count
}
func (e *Engine) validateMissionProgress() error {
	ms := e.state.Mission
	if ms == nil {
		return nil
	}
	if len(ms.Objectives) != len(ms.Definition.Objectives) || len(ms.Triggers) != len(ms.Definition.Triggers) {
		return errors.New("mission progress shape mismatch")
	}
	if ms.Difficulty != "easy" && ms.Difficulty != "normal" && ms.Difficulty != "hard" || ms.CheckpointTick > e.state.Tick || len(ms.Checkpoint) > 2000 || len(ms.Counters) > 512 {
		return errors.New("invalid mission progress metadata")
	}
	var check func(content.MissionCondition, ConditionProgress) bool
	check = func(q content.MissionCondition, p ConditionProgress) bool {
		if p.Since > e.state.Tick || !p.Holding && p.Since != 0 || p.Holding && q.HoldTicks == 0 || len(q.Children) != len(p.Children) {
			return false
		}
		for i, child := range q.Children {
			if !check(child, p.Children[i]) {
				return false
			}
		}
		return true
	}
	for i, o := range ms.Objectives {
		if !check(ms.Definition.Objectives[i].Condition, o.Condition) {
			return errors.New("invalid objective condition progress")
		}
	}
	for i, t := range ms.Triggers {
		if t.Last > e.state.Tick || !check(ms.Definition.Triggers[i].Condition, t.Condition) {
			return errors.New("invalid trigger condition progress")
		}
	}
	if len(ms.Definition.Players) != len(e.state.Players) {
		return errors.New("mission player shape mismatch")
	}
	for i, definition := range ms.Definition.Players {
		p := e.player(PlayerID(definition.ID))
		if p == nil || p.Team != definition.Team || p.Faction != definition.Faction || p.Controller != definition.Control(i) || p.AI != definition.AI {
			return errors.New("mission player contract mismatch")
		}
	}
	expected := []MissionCounter{}
	walkMissionConditions(ms.Definition, func(q content.MissionCondition) {
		if q.Kind != "event_count" && q.Kind != "event_value" {
			return
		}
		for _, c := range expected {
			if missionCounterMatches(c, q) {
				return
			}
		}
		expected = append(expected, MissionCounter{Event: q.Event, Owner: PlayerID(q.Owner), Tag: q.Tag, Type: q.Type})
	})
	if len(expected) != len(ms.Counters) {
		return errors.New("mission counter shape mismatch")
	}
	for i, c := range ms.Counters {
		want := expected[i]
		if c.Event != want.Event || c.Owner != want.Owner || c.Tag != want.Tag || c.Type != want.Type || c.Count > 1000000000 || c.Value < 0 || c.Value > 1000000000000 {
			return errors.New("invalid mission counter")
		}
	}
	tags := map[string]bool{}
	for _, spawn := range ms.Definition.Initial {
		tags[spawn.Tag] = true
	}
	for _, trigger := range ms.Definition.Triggers {
		for _, action := range trigger.Actions {
			if action.Spawn != nil {
				tags[action.Spawn.Tag] = true
			}
		}
	}
	seen := map[string]bool{}
	for _, tag := range ms.KnownTags {
		if !tags[tag] || seen[tag] {
			return errors.New("invalid known mission tag")
		}
		seen[tag] = true
	}
	return e.validateConvoys()
}
