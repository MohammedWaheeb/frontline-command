package sim

import (
	"encoding/json"
	"errors"
	"frontlinecommand/pkg/content"
)

type ObjectiveState struct {
	ID       string `json:"id"`
	Complete bool   `json:"complete"`
	Since    Tick   `json:"since"`
	Progress uint32 `json:"progress"`
}
type TriggerState struct {
	ID    string `json:"id"`
	Fired uint32 `json:"fired"`
	Last  Tick   `json:"last"`
	Since Tick   `json:"since"`
}
type MissionState struct {
	Definition     content.Mission  `json:"definition"`
	Difficulty     string           `json:"difficulty"`
	Objectives     []ObjectiveState `json:"objectives"`
	Triggers       []TriggerState   `json:"triggers"`
	KnownTags      []string         `json:"known_tags"`
	Checkpoint     string           `json:"checkpoint"`
	CheckpointTick Tick             `json:"checkpoint_tick"`
}

func NewMission(c *content.Catalog, m content.Map, definition content.Mission, difficulty string, seed uint64) (*Engine, error) {
	if err := definition.Validate(c, m); err != nil {
		return nil, err
	}
	if difficulty != "easy" && difficulty != "normal" && difficulty != "hard" {
		return nil, errors.New("unknown mission difficulty")
	}
	cfg := Config{Map: m, Seed: seed, Ruleset: "scenario-v2"}
	for _, p := range definition.Players {
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(p.ID), Name: p.Name, Faction: p.Faction, Team: p.Team, AI: p.AI})
	}
	e, err := New(c, cfg)
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(definition)
	var def content.Mission
	json.Unmarshal(b, &def)
	e.state.Mission = &MissionState{Definition: def, Difficulty: difficulty, Checkpoint: "opening", CheckpointTick: 0}
	if !def.DefaultBases {
		e.state.Entities = nil
		e.state.NavigationRevision++
	}
	for _, p := range def.Players {
		credits := p.Credits
		if p.AI != "" {
			for _, d := range def.Difficulty {
				if d.ID == difficulty {
					credits = credits * int64(d.EnemyCreditsMultiplier) / 1000
				}
			}
		}
		e.player(PlayerID(p.ID)).Credits = credits
	}
	for _, o := range def.Objectives {
		e.state.Mission.Objectives = append(e.state.Mission.Objectives, ObjectiveState{ID: o.ID})
	}
	for _, t := range def.Triggers {
		e.state.Mission.Triggers = append(e.state.Mission.Triggers, TriggerState{ID: t.ID})
	}
	for _, s := range def.Initial {
		if !e.spawnScenario(s) {
			return nil, errors.New("initial mission spawn exceeds capacity or has no legal position")
		}
	}
	e.recalculate()
	e.updateFog()
	return e, nil
}
func (e *Engine) scenarioPositions(s content.MissionSpawn) ([]Vec, bool) {
	positions := []Vec{}
	u, isUnit := e.catalog.Unit(s.Type)
	radius := int32(1000)
	air := false
	if isUnit {
		radius = u.Radius
		air = u.Armor == "air"
	}
	for i := uint32(0); i < s.Count; i++ {
		base := Vec{X: s.Position.X + int32(i%4)*2000, Y: s.Position.Y + int32(i/4)*2000}
		found := false
		for r := int32(0); r <= 4000 && !found; r += 1000 {
			for _, d := range neighbors {
				pos := Vec{X: base.X + d.X*r, Y: base.Y + d.Y*r}
				if !e.clear(pos, radius, 0, air, true) {
					continue
				}
				overlap := false
				for _, p := range positions {
					if distance(p, pos) < radius*2 {
						overlap = true
						break
					}
				}
				if overlap {
					continue
				}
				if !isUnit {
					b, _ := e.catalog.Building(s.Type)
					for _, v := range e.state.Entities {
						if v.Building && v.HP > 0 {
							other, _ := e.catalog.Building(v.Type)
							if rectOverlap(pos, b.Width, b.Height, v.Position, other.Width, other.Height) {
								overlap = true
							}
						}
					}
					if overlap {
						continue
					}
				}
				positions = append(positions, pos)
				found = true
				break
			}
		}
		if !found {
			return nil, false
		}
	}
	return positions, true
}
func (e *Engine) spawnScenario(s content.MissionSpawn) bool {
	p := e.player(PlayerID(s.Owner))
	if p == nil || p.Defeated {
		return false
	}
	u, isUnit := e.catalog.Unit(s.Type)
	if isUnit {
		if p.Supply+p.ReservedSupply+int32(s.Count)*u.Supply > 100 {
			return false
		}
		caps := map[string]int32{"rig": 4, "hauler": 8, "elite": 1}
		if limit, ok := caps[u.Role]; ok && e.countRole(p.ID, u.Role, true)+int32(s.Count) > limit {
			return false
		}
	}
	positions, ok := e.scenarioPositions(s)
	if !ok {
		return false
	}
	homes := []ID{}
	if isUnit && u.Armor == "air" {
		for _, home := range e.state.Entities {
			if home.Owner != p.ID || !home.Building || !home.Complete || home.HP <= 0 {
				continue
			}
			b, _ := e.catalog.Building(home.Type)
			used := int32(0)
			for _, v := range e.state.Entities {
				if v.Home == home.ID && v.HP > 0 {
					used++
				}
				for _, j := range v.Jobs {
					if j.Started && j.Service == home.ID {
						used++
					}
				}
			}
			for j := used; j < b.ServiceSlots; j++ {
				homes = append(homes, home.ID)
			}
		}
		if len(homes) < int(s.Count) {
			return false
		}
	}
	for i, pos := range positions {
		v := e.spawn(s.Type, p.ID, pos, true, 0)
		v.Tag = s.Tag
		if v.Building {
			v.IncludedHauler = true
		} else {
			v.Paid = u.Cost
		}
		if isUnit && u.Armor == "air" {
			v.Home = homes[i]
			v.Landed = false
		}
		e.recalculate()
	}
	known := false
	for _, tag := range e.state.Mission.KnownTags {
		if tag == s.Tag {
			known = true
		}
	}
	if !known {
		e.state.Mission.KnownTags = append(e.state.Mission.KnownTags, s.Tag)
	}
	e.emit("scenario_reinforcement", p.ID, 0, s.Position, "all", int64(s.Count))
	return true
}
func (e *Engine) missionCondition(q content.MissionCondition, since *Tick) (bool, uint32) {
	yes := false
	count := uint32(0)
	switch q.Kind {
	case "timer":
		at := q.Tick
		for _, d := range e.state.Mission.Definition.Difficulty {
			if d.ID == e.state.Mission.Difficulty {
				at = uint32(uint64(at) * uint64(d.WaveTimeMultiplier) / 1000)
			}
		}
		yes = uint32(e.state.Tick) >= at
	case "tag_alive", "tag_destroyed":
		known := false
		for _, tag := range e.state.Mission.KnownTags {
			if tag == q.Tag {
				known = true
			}
		}
		for _, v := range e.state.Entities {
			if v.Tag == q.Tag && v.HP > 0 {
				count++
			}
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
		yes = count >= max(uint32(1), q.Count)
	case "resource_threshold":
		p := e.player(PlayerID(q.Owner))
		yes = p != nil && p.Credits >= q.Amount
	case "objective_complete":
		for _, o := range e.state.Mission.Objectives {
			if o.ID == q.Objective {
				yes = o.Complete
			}
		}
	case "region_entered", "region_held":
		var region content.Region
		for _, r := range e.state.Map.Regions {
			if r.ID == q.Region {
				region = r
			}
		}
		enemy := false
		for _, v := range e.state.Entities {
			if v.HP <= 0 || v.Container != 0 || v.Position.X < region.Min.X || v.Position.X > region.Max.X || v.Position.Y < region.Min.Y || v.Position.Y > region.Max.Y {
				continue
			}
			if q.Owner == 0 || uint32(v.Owner) == q.Owner {
				count++
			} else if !e.allied(PlayerID(q.Owner), v.Owner) {
				enemy = true
			}
		}
		yes = count >= max(uint32(1), q.Count) && (q.Kind != "region_held" || !enemy)
	}
	if !yes {
		*since = 0
		return false, 0
	}
	if q.HoldTicks > 0 {
		if *since == 0 {
			*since = e.state.Tick
		}
		elapsed := uint32(e.state.Tick - *since)
		return elapsed >= q.HoldTicks, min(q.HoldTicks, elapsed)
	}
	return true, count
}
func (e *Engine) updateMission() {
	ms := e.state.Mission
	if ms == nil || e.state.Outcome.Finished {
		return
	}
	for i, t := range ms.Definition.Triggers {
		state := &ms.Triggers[i]
		if state.Fired >= max(uint32(1), t.Repeat) || state.Fired > 0 && uint32(e.state.Tick-state.Last) < t.Interval {
			continue
		}
		ready, _ := e.missionCondition(t.Condition, &state.Since)
		if !ready {
			continue
		}
		blocked := false
		for _, a := range t.Actions {
			if a.Kind == "spawn" {
				p := e.player(PlayerID(a.Spawn.Owner))
				if u, ok := e.catalog.Unit(a.Spawn.Type); ok && p.Supply+p.ReservedSupply+int32(a.Spawn.Count)*u.Supply > 100 {
					blocked = true
				}
				if _, ok := e.scenarioPositions(*a.Spawn); !ok {
					blocked = true
				}
			}
		}
		if blocked {
			continue
		}
		// A bounded trigger is transactional: a later blocked reinforcement must
		// not repeat earlier grants on its next attempt or after save/reload.
		rollback, _ := json.Marshal(e.state)
		for _, a := range t.Actions {
			switch a.Kind {
			case "spawn":
				if !e.spawnScenario(*a.Spawn) {
					blocked = true
				}
			case "complete_objective":
				for j := range ms.Objectives {
					if ms.Objectives[j].ID == a.Objective {
						ms.Objectives[j].Complete = true
					}
				}
			case "warning":
				e.emit("mission_warning", PlayerID(a.Owner), 0, Vec{}, "all", 0)
				e.state.Events[len(e.state.Events)-1].Text = a.Text
			case "checkpoint":
				ms.Checkpoint = a.Text
				ms.CheckpointTick = e.state.Tick
				e.emit("checkpoint", 0, 0, Vec{}, "all", 0)
				e.state.Events[len(e.state.Events)-1].Text = a.Text
			case "credits":
				p := e.player(PlayerID(a.Owner))
				p.Credits += a.Amount
				p.Income += a.Amount
			case "attack_region":
				var goal Vec
				for _, r := range e.state.Map.Regions {
					if r.ID == a.Region {
						goal = Vec{X: (r.Min.X + r.Max.X) / 2, Y: (r.Min.Y + r.Max.Y) / 2}
					}
				}
				for _, v := range e.state.Entities {
					if uint32(v.Owner) == a.Owner && v.HP > 0 && !v.Building {
						if _, ok := e.weapon(v); ok {
							e.assign(v, Order{Kind: "attack_move", Position: goal})
						}
					}
				}
			}
			if blocked {
				break
			}
		}
		if blocked {
			var restored State
			_ = json.Unmarshal(rollback, &restored)
			e.state = restored
			e.navCache = nil
			ms = e.state.Mission
			continue
		}
		if !blocked {
			state.Fired++
			state.Last = e.state.Tick
		}
	}
	all := true
	failed := false
	for i, o := range ms.Definition.Objectives {
		state := &ms.Objectives[i]
		if !state.Complete {
			done, progress := e.missionCondition(o.Condition, &state.Since)
			state.Progress = progress
			if done {
				state.Complete = true
				e.emit("objective_complete", 0, 0, Vec{}, "all", 0)
				e.state.Events[len(e.state.Events)-1].Text = o.ID
			}
		}
		if o.Failure && state.Complete {
			failed = true
		}
		if !o.Optional && !o.Failure && !state.Complete {
			all = false
		}
	}
	if failed || all {
		winning := uint32(0)
		if !failed {
			for _, p := range e.state.Players {
				if p.AI == "" {
					winning = p.Team
					break
				}
			}
		}
		reason := "mission_complete"
		if failed {
			reason = "mission_failed"
		}
		e.state.Outcome = Outcome{Finished: true, WinningTeam: winning, Reason: reason, Tick: e.state.Tick}
		e.emit("match_ended", 0, 0, Vec{}, "all", int64(winning))
	}
}
