package sim

import (
	"encoding/json"
	"errors"
	"frontlinecommand/pkg/content"
)

type ObjectiveState struct {
	ID        string            `json:"id"`
	Complete  bool              `json:"complete"`
	Condition ConditionProgress `json:"condition"`
	Progress  uint32            `json:"progress"`
}
type TriggerState struct {
	ID        string            `json:"id"`
	Fired     uint32            `json:"fired"`
	Last      Tick              `json:"last"`
	Condition ConditionProgress `json:"condition"`
}
type MissionState struct {
	Definition     content.Mission  `json:"definition"`
	Difficulty     string           `json:"difficulty"`
	Objectives     []ObjectiveState `json:"objectives"`
	Triggers       []TriggerState   `json:"triggers"`
	KnownTags      []string         `json:"known_tags"`
	Checkpoint     string           `json:"checkpoint"`
	CheckpointTick Tick             `json:"checkpoint_tick"`
	Counters       []MissionCounter `json:"counters"`
	Convoys        []ConvoyState    `json:"convoys"`
}

func NewMission(c *content.Catalog, m content.Map, definition content.Mission, difficulty string, seed uint64) (*Engine, error) {
	var err error
	definition, err = definition.ForTutorialFaction(c, m, "")
	if err != nil {
		return nil, err
	}
	if difficulty != "easy" && difficulty != "normal" && difficulty != "hard" {
		return nil, errors.New("unknown mission difficulty")
	}
	cfg := Config{Map: m, Seed: seed, Ruleset: "scenario-v2"}
	for i, p := range definition.Players {
		cfg.Players = append(cfg.Players, PlayerConfig{ID: PlayerID(p.ID), Name: p.Name, Faction: p.Faction, Team: p.Team, AI: p.AI, Controller: p.Control(i)})
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
		objects := e.state.Entities[:0]
		for _, v := range e.state.Entities {
			if v.MapObject != 0 {
				objects = append(objects, v)
			}
		}
		e.state.Entities = objects
		e.state.NavigationRevision++
	}
	humanTeam := uint32(0)
	for i, p := range def.Players {
		if p.Control(i) == "human" {
			humanTeam = p.Team
			break
		}
	}
	for _, p := range def.Players {
		credits := p.Credits
		if p.Team != humanTeam {
			for _, d := range def.Difficulty {
				if d.ID == difficulty {
					credits = credits * int64(d.EnemyCreditsMultiplier) / 1000
				}
			}
		}
		e.player(PlayerID(p.ID)).Credits = credits
	}
	for _, o := range def.Objectives {
		e.state.Mission.Objectives = append(e.state.Mission.Objectives, ObjectiveState{ID: o.ID, Condition: newConditionProgress(o.Condition)})
	}
	for _, t := range def.Triggers {
		e.state.Mission.Triggers = append(e.state.Mission.Triggers, TriggerState{ID: t.ID, Condition: newConditionProgress(t.Condition)})
	}
	e.initializeMissionCounters()
	for _, convoy := range def.Convoys {
		e.state.Mission.Convoys = append(e.state.Mission.Convoys, ConvoyState{ID: convoy.ID})
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

// NewPracticeMission runs the authored scenario through the same Go rules but
// marks every save/result/replay as editor practice, not progression evidence.
func NewPracticeMission(c *content.Catalog, m content.Map, definition content.Mission, difficulty string, seed uint64) (*Engine, error) {
	e, err := NewMission(c, m, definition, difficulty, seed)
	if err != nil {
		return nil, err
	}
	e.state.Metadata.Ruleset = "practice-v1"
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
					b, _ := e.buildingRule(s.Type)
					if !e.scenarioFootprint(pos, b.Width, b.Height) {
						continue
					}
					for _, previous := range positions {
						if rectOverlap(pos, b.Width, b.Height, previous, b.Width, b.Height) {
							overlap = true
						}
					}
					for _, v := range e.state.Entities {
						if v.Building && v.HP > 0 {
							width, height := e.footprint(v)
							if rectOverlap(pos, b.Width, b.Height, v.Position, width, height) {
								overlap = true
							}
						}
						if !v.Building && v.HP > 0 && v.Container == 0 && (!e.isAircraft(v) || v.Landed) {
							dx, dy := max(int32(0), abs(v.Position.X-pos.X)-b.Width*500), max(int32(0), abs(v.Position.Y-pos.Y)-b.Height*500)
							r := e.radius(v)
							if int64(dx)*int64(dx)+int64(dy)*int64(dy) < int64(r)*int64(r) {
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
func (e *Engine) scenarioFootprint(pos Vec, width, height int32) bool {
	if e.resourceFootprint(pos, width, height) != "ok" {
		return false
	}
	left, top, right, bottom := pos.X-width*500, pos.Y-height*500, pos.X+width*500, pos.Y+height*500
	if left < 0 || top < 0 || right > e.state.Map.Width*1000 || bottom > e.state.Map.Height*1000 {
		return false
	}
	for y := top / 1000; y <= (bottom-1)/1000; y++ {
		for x := left / 1000; x <= (right-1)/1000; x++ {
			tile := e.state.Map.Tiles[y*e.state.Map.Width+x]
			if !tile.Passable() || tile.Mandatory {
				return false
			}
		}
	}
	return true
}
func (e *Engine) spawnScenario(s content.MissionSpawn) bool {
	if !e.scenarioSpawnSelected(s) {
		return e.state.Mission != nil
	}
	if !e.reserveScenarioSpawn(s, nil) {
		return false
	}
	p := e.player(PlayerID(s.Owner))
	u, isUnit := e.catalog.Unit(s.Type)
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
			b, _ := e.buildingRule(home.Type)
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
	if e.state.Mission == nil {
		return true
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
func (e *Engine) updateMission() {
	ms := e.state.Mission
	if ms == nil || e.state.Outcome.Finished {
		return
	}
	anyHuman := false
	for _, p := range e.state.Players {
		if p.Controller == "human" && !p.Defeated {
			anyHuman = true
		}
	}
	if !anyHuman {
		e.state.Outcome = Outcome{Finished: true, Reason: "mission_failed", Tick: e.state.Tick}
		e.emit("match_ended", 0, 0, Vec{}, "all", 0)
		return
	}
	e.updateConvoys()
	for i, t := range ms.Definition.Triggers {
		state := &ms.Triggers[i]
		if state.Fired >= max(uint32(1), t.Repeat) || state.Fired > 0 && uint32(e.state.Tick-state.Last) < t.Interval {
			continue
		}
		ready, _ := e.missionCondition(t.Condition, &state.Condition)
		if !ready {
			continue
		}
		blocked := false
		reservations := map[PlayerID]*scenarioReservation{}
		for _, action := range t.Actions {
			if action.Kind != "spawn" || !e.scenarioSpawnSelected(*action.Spawn) {
				continue
			}
			owner := PlayerID(action.Spawn.Owner)
			if reservations[owner] == nil {
				reservations[owner] = &scenarioReservation{}
			}
			if !e.reserveScenarioSpawn(*action.Spawn, reservations[owner]) {
				blocked = true
				break
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
			case "recover_tag":
				if !e.recoverScenarioTag(a.Tag, PlayerID(a.Owner)) {
					blocked = true
				}
			case "start_convoy":
				if !e.startConvoy(a.Convoy) {
					blocked = true
				}
			case "attack_tag":
				if !e.attackScenarioTag(a) {
					blocked = true
				}
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
			e.dynamicNav = nil
			e.spatial = nil
			ms = e.state.Mission
			continue
		}
		if !blocked {
			state.Fired++
			state.Last = e.state.Tick
		}
	}
	all := true
	failed := true
	for _, p := range e.state.Players {
		if p.Controller == "human" && !p.Defeated {
			failed = false
		}
	}
	for i, o := range ms.Definition.Objectives {
		state := &ms.Objectives[i]
		if !state.Complete {
			done, progress := e.missionCondition(o.Condition, &state.Condition)
			state.Progress = progress
			if done && !o.AtEnd {
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
		for i, o := range ms.Definition.Objectives {
			if o.AtEnd && !failed {
				done, progress := e.missionCondition(o.Condition, &ms.Objectives[i].Condition)
				ms.Objectives[i].Complete = done
				ms.Objectives[i].Progress = progress
			}
		}
		winning := uint32(0)
		if !failed {
			for _, p := range e.state.Players {
				if p.Controller == "human" {
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
