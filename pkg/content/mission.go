package content

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Mission files are declarative content authored by Claude/editor, never code.
type Mission struct {
	ID           string              `json:"id"`
	Version      string              `json:"version"`
	Title        string              `json:"title"`
	MapID        string              `json:"map_id"`
	Faction      string              `json:"faction"`
	Mode         string              `json:"mode"`
	Briefing     string              `json:"briefing"`
	Debrief      string              `json:"debrief"`
	RulesNotice  string              `json:"rules_notice"`
	DefaultBases bool                `json:"default_bases"`
	Players      []MissionPlayer     `json:"players"`
	Initial      []MissionSpawn      `json:"initial"`
	Objectives   []MissionObjective  `json:"objectives"`
	Triggers     []MissionTrigger    `json:"triggers"`
	Difficulty   []MissionDifficulty `json:"difficulty"`
}
type MissionPlayer struct {
	ID      uint32 `json:"id"`
	Faction string `json:"faction"`
	Name    string `json:"name"`
	Team    uint32 `json:"team"`
	AI      string `json:"ai"`
	Credits int64  `json:"credits"`
}
type MissionSpawn struct {
	Tag      string `json:"tag"`
	Type     string `json:"type"`
	Owner    uint32 `json:"owner"`
	Position Point  `json:"position"`
	Count    uint32 `json:"count"`
}
type MissionObjective struct {
	ID        string           `json:"id"`
	Text      string           `json:"text"`
	Optional  bool             `json:"optional"`
	Failure   bool             `json:"failure"`
	Condition MissionCondition `json:"condition"`
}
type MissionCondition struct {
	Kind      string `json:"kind"`
	Tick      uint32 `json:"tick"`
	Owner     uint32 `json:"owner"`
	Type      string `json:"type"`
	Tag       string `json:"tag"`
	Region    string `json:"region"`
	Amount    int64  `json:"amount"`
	Count     uint32 `json:"count"`
	Objective string `json:"objective"`
	HoldTicks uint32 `json:"hold_ticks"`
}
type MissionAction struct {
	Kind      string        `json:"kind"`
	Spawn     *MissionSpawn `json:"spawn,omitempty"`
	Objective string        `json:"objective,omitempty"`
	Text      string        `json:"text,omitempty"`
	Owner     uint32        `json:"owner,omitempty"`
	Amount    int64         `json:"amount,omitempty"`
	Region    string        `json:"region,omitempty"`
}
type MissionTrigger struct {
	ID        string           `json:"id"`
	Condition MissionCondition `json:"condition"`
	Actions   []MissionAction  `json:"actions"`
	Repeat    uint32           `json:"repeat"`
	Interval  uint32           `json:"interval"`
}

// Difficulty adjusts declared scenario budgets/wave timings, never unit stats.
type MissionDifficulty struct {
	ID                     string `json:"id"`
	EnemyCreditsMultiplier int32  `json:"enemy_credits_multiplier"`
	WaveTimeMultiplier     int32  `json:"wave_time_multiplier"`
}

func DecodeMission(data []byte, c *Catalog, m Map) (Mission, error) {
	var v Mission
	if len(data) > 2<<20 {
		return v, fmt.Errorf("mission exceeds 2 MiB")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return v, err
	}
	if d.Decode(new(any)) != io.EOF {
		return v, fmt.Errorf("trailing mission data")
	}
	return v, v.Validate(c, m)
}
func (v Mission) Validate(c *Catalog, m Map) error {
	if v.ID == "" || len(v.ID) > 80 || v.Version == "" || v.MapID != m.ID || len(v.Title) > 100 || len(v.Briefing) > 16000 || len(v.Debrief) > 16000 || !ValidFaction(v.Faction) {
		return fmt.Errorf("invalid mission metadata")
	}
	switch v.Mode {
	case "campaign", "tutorial", "coop":
	default:
		return fmt.Errorf("invalid mission mode")
	}
	if len(v.Players) < 1 || len(v.Players) > 4 || len(v.Players) > len(m.Spawns) || len(v.Initial) > 256 || len(v.Objectives) < 1 || len(v.Objectives) > 32 || len(v.Triggers) > 128 {
		return fmt.Errorf("mission object limits exceeded")
	}
	players := map[uint32]bool{}
	for _, p := range v.Players {
		if p.ID == 0 || players[p.ID] || !ValidFaction(p.Faction) || p.Credits < 0 || p.Credits > 1000000000 || p.AI != "" && p.AI != "easy" && p.AI != "normal" && p.AI != "hard" {
			return fmt.Errorf("invalid mission player")
		}
		players[p.ID] = true
	}
	tags := map[string]bool{}
	checkSpawn := func(s MissionSpawn) error {
		if s.Tag == "" || len(s.Tag) > 80 || strings.HasPrefix(s.Type, "map.") || !players[s.Owner] || s.Count < 1 || s.Count > 32 || !m.InBounds(s.Position) || !m.TileAt(s.Position).Passable() {
			return fmt.Errorf("invalid spawn %s", s.Tag)
		}
		if _, u := c.Unit(s.Type); !u {
			if _, b := c.Building(s.Type); !b {
				return fmt.Errorf("unknown spawn type %s", s.Type)
			}
		}
		tags[s.Tag] = true
		return nil
	}
	for _, s := range v.Initial {
		if err := checkSpawn(s); err != nil {
			return err
		}
	}
	for _, t := range v.Triggers {
		for _, a := range t.Actions {
			if a.Spawn != nil {
				if err := checkSpawn(*a.Spawn); err != nil {
					return err
				}
			}
		}
	}
	objectives := map[string]bool{}
	required := 0
	for _, o := range v.Objectives {
		if o.ID == "" || objectives[o.ID] || len(o.Text) > 1000 {
			return fmt.Errorf("invalid objective")
		}
		objectives[o.ID] = true
		if !o.Optional && !o.Failure {
			required++
		}
	}
	if required == 0 {
		return fmt.Errorf("mission has no required victory objective")
	}
	regions := map[string]bool{}
	for _, r := range m.Regions {
		regions[r.ID] = true
	}
	checkCondition := func(q MissionCondition) error {
		if q.HoldTicks > 108000 || q.Tick > 108000 || q.Count > 688 || q.Amount < 0 || q.Amount > 1000000000 {
			return fmt.Errorf("condition out of bounds")
		}
		if q.Owner != 0 && !players[q.Owner] {
			return fmt.Errorf("condition owner missing")
		}
		switch q.Kind {
		case "timer":
		case "region_entered", "region_held":
			if !regions[q.Region] {
				return fmt.Errorf("condition region missing")
			}
		case "tag_destroyed", "tag_alive":
			if !tags[q.Tag] {
				return fmt.Errorf("condition tag missing")
			}
		case "resource_threshold":
			if q.Owner == 0 {
				return fmt.Errorf("resource owner missing")
			}
		case "count_type":
			if _, ok := c.Unit(q.Type); !ok {
				if _, ok = c.Building(q.Type); !ok {
					return fmt.Errorf("condition type missing")
				}
			}
		case "objective_complete":
			if !objectives[q.Objective] {
				return fmt.Errorf("referenced objective missing")
			}
		default:
			return fmt.Errorf("unsupported condition %s", q.Kind)
		}
		return nil
	}
	for _, o := range v.Objectives {
		if err := checkCondition(o.Condition); err != nil {
			return err
		}
		if o.Condition.Kind == "objective_complete" && o.Condition.Objective == o.ID {
			return fmt.Errorf("self-referential objective")
		}
	}
	dependencies := map[string]string{}
	for _, o := range v.Objectives {
		if o.Condition.Kind == "objective_complete" {
			dependencies[o.ID] = o.Condition.Objective
		}
	}
	for id := range dependencies {
		seen := map[string]bool{}
		for next := id; next != ""; next = dependencies[next] {
			if seen[next] {
				return fmt.Errorf("cyclic objective dependency")
			}
			seen[next] = true
		}
	}
	ids := map[string]bool{}
	totalSpawns := uint32(0)
	for _, s := range v.Initial {
		totalSpawns += s.Count
	}
	for _, t := range v.Triggers {
		if t.ID == "" || ids[t.ID] || len(t.Actions) < 1 || len(t.Actions) > 16 || t.Repeat > 24 || t.Repeat > 1 && t.Interval < 20 {
			return fmt.Errorf("invalid trigger %s", t.ID)
		}
		ids[t.ID] = true
		if err := checkCondition(t.Condition); err != nil {
			return err
		}
		for _, a := range t.Actions {
			switch a.Kind {
			case "spawn":
				if a.Spawn == nil {
					return fmt.Errorf("spawn action needs definition")
				}
				totalSpawns += a.Spawn.Count * max(uint32(1), t.Repeat)
			case "complete_objective":
				if !objectives[a.Objective] {
					return fmt.Errorf("action objective missing")
				}
			case "warning", "checkpoint":
				if len(a.Text) == 0 || len(a.Text) > 2000 {
					return fmt.Errorf("action text missing")
				}
			case "credits":
				if !players[a.Owner] || a.Amount < 0 || a.Amount > 100000000 {
					return fmt.Errorf("invalid scenario grant")
				}
			case "attack_region":
				if !players[a.Owner] || !regions[a.Region] {
					return fmt.Errorf("invalid attack region")
				}
			default:
				return fmt.Errorf("unsupported action %s", a.Kind)
			}
		}
	}
	if totalSpawns > 4096 {
		return fmt.Errorf("scenario spawn budget exceeds 4096")
	}
	difficulty := map[string]bool{}
	for _, d := range v.Difficulty {
		if (d.ID != "easy" && d.ID != "normal" && d.ID != "hard") || difficulty[d.ID] || d.EnemyCreditsMultiplier < 500 || d.EnemyCreditsMultiplier > 2000 || d.WaveTimeMultiplier < 500 || d.WaveTimeMultiplier > 2000 {
			return fmt.Errorf("invalid scenario difficulty")
		}
		difficulty[d.ID] = true
	}
	return nil
}
