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
	ID               string              `json:"id"`
	Version          string              `json:"version"`
	Title            string              `json:"title"`
	MapID            string              `json:"map_id"`
	Faction          string              `json:"faction"`
	Mode             string              `json:"mode"`
	Briefing         string              `json:"briefing"`
	Debrief          string              `json:"debrief"`
	RulesNotice      string              `json:"rules_notice"`
	DefaultBases     bool                `json:"default_bases"`
	Players          []MissionPlayer     `json:"players"`
	Initial          []MissionSpawn      `json:"initial"`
	Objectives       []MissionObjective  `json:"objectives"`
	PublicTasks      []MissionPublicTask `json:"public_tasks,omitempty"`
	Triggers         []MissionTrigger    `json:"triggers"`
	Difficulty       []MissionDifficulty `json:"difficulty"`
	Convoys          []MissionConvoy     `json:"convoys,omitempty"`
	TutorialVariants []TutorialVariant   `json:"tutorial_variants,omitempty"`
}

// Tutorial variants are explicitly authored substitutions, never guessed role
// mappings. Enemy composition stays in the parent; only human initial assets,
// briefing and the complete lesson script change for the selected faction.
type TutorialVariant struct {
	Faction    string             `json:"faction"`
	Briefing   string             `json:"briefing"`
	Initial    []MissionSpawn     `json:"initial"`
	Objectives []MissionObjective `json:"objectives"`
	Triggers   []MissionTrigger   `json:"triggers"`
}
type MissionPlayer struct {
	Controller string `json:"controller,omitempty"`
	ID         uint32 `json:"id"`
	Faction    string `json:"faction"`
	Name       string `json:"name"`
	Team       uint32 `json:"team"`
	AI         string `json:"ai"`
	Credits    int64  `json:"credits"`
}
type MissionSpawn struct {
	Difficulties []string `json:"difficulties,omitempty"`
	Tag          string   `json:"tag"`
	Type         string   `json:"type"`
	Owner        uint32   `json:"owner"`
	Position     Point    `json:"position"`
	Count        uint32   `json:"count"`
}
type MissionObjective struct {
	AtEnd     bool             `json:"at_end,omitempty"`
	ID        string           `json:"id"`
	Text      string           `json:"text"`
	Optional  bool             `json:"optional"`
	Failure   bool             `json:"failure"`
	Condition MissionCondition `json:"condition"`
}
// Public tasks are explicit briefing/marker declarations. They never derive
// geometry, participants or actor identities from private goal conditions.
type MissionPublicTask struct {
	ID             string `json:"id"`
	Objective      string `json:"objective"`
	Kind           string `json:"kind"`
	Marker         string `json:"marker"`
	Region         string `json:"region"`
	Team           uint32 `json:"team"`
	MissionVersion string `json:"mission_version"`
	MapVersion     string `json:"map_version"`
}
type MissionCondition struct {
	Children  []MissionCondition `json:"children,omitempty"`
	Field     uint32             `json:"field,omitempty"`
	Event     string             `json:"event,omitempty"`
	Compare   string             `json:"compare,omitempty"`
	Convoy    string             `json:"convoy,omitempty"`
	Wave      bool               `json:"wave,omitempty"`
	Kind      string             `json:"kind"`
	Tick      uint32             `json:"tick"`
	Owner     uint32             `json:"owner"`
	Type      string             `json:"type"`
	Tag       string             `json:"tag"`
	Region    string             `json:"region"`
	Amount    int64              `json:"amount"`
	Count     uint32             `json:"count"`
	Objective string             `json:"objective"`
	HoldTicks uint32             `json:"hold_ticks"`
}

func (p MissionPlayer) Control(index int) string {
	if p.Controller != "" {
		return p.Controller
	}
	if p.AI != "" {
		return "ai"
	}
	if index == 0 {
		return "human"
	}
	return "script"
}

type MissionAction struct {
	Tag       string        `json:"tag,omitempty"`
	TargetTag string        `json:"target_tag,omitempty"`
	Convoy    string        `json:"convoy,omitempty"`
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

// Convoys use authored region routes; rules and commander approval stay in Go.
type MissionConvoy struct {
	ID             string     `json:"id"`
	Tag            string     `json:"tag"`
	Routes         [][]string `json:"routes"`
	CountdownTicks uint32     `json:"countdown_ticks"`
}

// MissionEvent is the bounded metric vocabulary. Event values are milliunits
// for paid repair/ammunition and salvage, and otherwise count occurrences.
func MissionEvent(event string) bool {
	switch event {
	case "construction_complete", "foundation_placed", "unit_ready", "emergency_rig_ready", "research_complete", "cargo_delivered", "building_captured", "station_captured", "destroyed", "weapon_fired", "interceptor_fired", "aircraft_serviced", "service_lost", "salvage_collected", "salvage_capped", "raid_canceled", "raid_exit_blocked", "repair_spent", "missile_spent", "convoy_completed", "missile_intercepted", "ability_activated", "strategic_activated", "scenario_recovered":
		return true
	}
	return false
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
	if len(v.TutorialVariants) > 0 {
		if err := v.validateTutorialVariants(c, m); err != nil {
			return err
		}
	}
	if v.ID == "" || len(v.ID) > 80 || v.Version == "" || len(v.Version) > 80 || len(v.RulesNotice) > 16000 || v.MapID != m.ID || len(v.Title) > 100 || len(v.Briefing) > 16000 || len(v.Debrief) > 16000 || !ValidFaction(v.Faction) {
		return fmt.Errorf("invalid mission metadata")
	}
	switch v.Mode {
	case "campaign", "tutorial", "coop":
	default:
		return fmt.Errorf("invalid mission mode")
	}
	if len(v.Players) < 1 || len(v.Players) > 4 || len(v.Players) > len(m.Spawns) || len(v.Initial) > 256 || len(v.Objectives) < 1 || len(v.Objectives) > 32 || len(v.Triggers) > 128 || len(v.Convoys) > 3 {
		return fmt.Errorf("mission object limits exceeded")
	}
	players := map[uint32]bool{}
	controllers := map[uint32]string{}
	teams := map[uint32]uint32{}
	humanTeam := uint32(0)
	humans := 0
	for i, p := range v.Players {
		if p.ID == 0 || p.ID > 4 || p.Team == 0 || p.Team > 4 || len(p.Name) > 48 || players[p.ID] || !ValidFaction(p.Faction) || p.Credits < 0 || p.Credits > 1000000000 || p.AI != "" && p.AI != "easy" && p.AI != "normal" && p.AI != "hard" {
			return fmt.Errorf("invalid mission player")
		}
		players[p.ID] = true
		teams[p.ID] = p.Team
		controller := p.Control(i)
		controllers[p.ID] = controller
		if controller != "human" && controller != "ai" && controller != "script" || controller == "ai" && p.AI == "" || controller != "ai" && p.AI != "" {
			return fmt.Errorf("invalid scenario controller")
		}
		if controller == "human" {
			humans++
			if humanTeam != 0 && p.Team != humanTeam {
				return fmt.Errorf("scenario humans must share a team")
			}
			humanTeam = p.Team
		}
	}
	if humans < 1 || humans > 2 || v.Mode != "coop" && humans != 1 {
		return fmt.Errorf("invalid scenario human slot count")
	}
	tags := map[string]bool{}
	tagSpawns := map[string][]MissionSpawn{}
	tagOwners := map[string]uint32{}
	checkSpawn := func(s MissionSpawn) error {
		if s.Tag == "" || len(s.Tag) > 80 || strings.HasPrefix(s.Type, "map.") || !players[s.Owner] || s.Count < 1 || s.Count > 32 || !m.InBounds(s.Position) || !m.TileAt(s.Position).Passable() {
			return fmt.Errorf("invalid spawn %s", s.Tag)
		}
		if _, u := c.Unit(s.Type); !u {
			if _, b := c.Building(s.Type); !b {
				return fmt.Errorf("unknown spawn type %s", s.Type)
			}
		}
		if owner, ok := tagOwners[s.Tag]; ok && owner != s.Owner {
			return fmt.Errorf("tag must have one declared owner")
		}
		tagOwners[s.Tag] = s.Owner
		tagSpawns[s.Tag] = append(tagSpawns[s.Tag], s)
		seenDifficulties := map[string]bool{}
		for _, difficulty := range s.Difficulties {
			if teams[s.Owner] == humanTeam || seenDifficulties[difficulty] || difficulty != "easy" && difficulty != "normal" && difficulty != "hard" {
				return fmt.Errorf("difficulty composition may change only enemy spawns")
			}
			seenDifficulties[difficulty] = true
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
			if a.Spawn != nil && a.Kind != "spawn" {
				return fmt.Errorf("spawn payload on non-spawn action")
			}
			if a.Spawn != nil {
				if err := checkSpawn(*a.Spawn); err != nil {
					return err
				}
			}
		}
	}
	objectives := map[string]bool{}
	endObjectives := map[string]bool{}
	required := 0
	for _, o := range v.Objectives {
		if o.ID == "" || len(o.ID) > 80 || objectives[o.ID] || len(o.Text) > 1000 || o.AtEnd && (!o.Optional || o.Failure) {
			return fmt.Errorf("invalid objective")
		}
		objectives[o.ID] = true
		endObjectives[o.ID] = o.AtEnd
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
	if err := v.validatePublicTasks(m, humanTeam); err != nil {
		return err
	}
	fields := map[uint32]bool{}
	for _, f := range m.Fields {
		fields[f.ID] = true
	}
	convoys := map[string]bool{}
	for _, convoy := range v.Convoys {
		if v.Mode != "coop" || convoy.ID == "" || len(convoy.ID) > 80 || convoys[convoy.ID] || !tags[convoy.Tag] || teams[tagOwners[convoy.Tag]] != humanTeam || controllers[tagOwners[convoy.Tag]] != "script" || len(convoy.Routes) < 1 || len(convoy.Routes) > 4 || convoy.CountdownTicks < 60 || convoy.CountdownTicks > 600 {
			return fmt.Errorf("invalid convoy definition")
		}
		convoys[convoy.ID] = true
		for _, spawn := range tagSpawns[convoy.Tag] {
			unit, ok := c.Unit(spawn.Type)
			if !ok || unit.Armor == "air" || unit.Weapon != "" {
				return fmt.Errorf("convoys require unarmed ground units")
			}
		}
		for _, route := range convoy.Routes {
			if len(route) < 1 || len(route) > 16 || len(route) != len(convoy.Routes[0]) {
				return fmt.Errorf("invalid convoy route")
			}
			for _, region := range route {
				if !regions[region] {
					return fmt.Errorf("convoy region missing")
				}
			}
		}
	}
	nodes := 0
	var checkCondition func(MissionCondition, int) error
	checkCondition = func(q MissionCondition, depth int) error {
		nodes++
		if nodes > 512 || depth > 6 || len(q.Children) > 16 {
			return fmt.Errorf("mission condition complexity exceeded")
		}
		if q.Wave && q.Kind != "timer" {
			return fmt.Errorf("wave timing only applies to timers")
		}
		if q.HoldTicks > 108000 || q.Tick > 108000 || q.Count > 688 || q.Amount < 0 || q.Amount > 1000000000 {
			return fmt.Errorf("condition out of bounds")
		}
		if q.Owner != 0 && !players[q.Owner] {
			return fmt.Errorf("condition owner missing")
		}
		if q.Compare != "" && q.Compare != "at_least" && q.Compare != "at_most" {
			return fmt.Errorf("unsupported condition comparator")
		}
		composite := q.Kind == "all" || q.Kind == "any" || q.Kind == "at_least"
		if composite {
			if len(q.Children) < 1 || q.Kind == "at_least" && (q.Count == 0 || int(q.Count) > len(q.Children)) {
				return fmt.Errorf("invalid composite condition")
			}
			for _, child := range q.Children {
				if err := checkCondition(child, depth+1); err != nil {
					return err
				}
			}
			return nil
		}
		if len(q.Children) != 0 {
			return fmt.Errorf("leaf condition cannot have children")
		}
		switch q.Kind {
		case "timer":
		case "region_entered", "region_held":
			if !regions[q.Region] || q.Owner == 0 {
				return fmt.Errorf("condition region/owner missing")
			}
			if q.Type != "" {
				if _, unit := c.Unit(q.Type); !unit {
					if _, building := c.Building(q.Type); !building {
						return fmt.Errorf("unknown region condition type %s", q.Type)
					}
				}
			}
		case "tag_destroyed", "tag_alive", "tag_owned", "tag_operational", "tag_in_region", "tag_concealed", "tag_stationary":
			if !tags[q.Tag] {
				return fmt.Errorf("condition tag missing")
			}
			if q.Kind == "tag_owned" && q.Owner == 0 {
				return fmt.Errorf("tag owner missing")
			}
			if q.Kind == "tag_in_region" && !regions[q.Region] {
				return fmt.Errorf("tag region missing")
			}
		case "upgrade_owned":
			if _, ok := c.Upgrade(q.Type); !ok || q.Owner == 0 {
				return fmt.Errorf("upgrade/owner missing")
			}
		case "resource_threshold", "stat_threshold":
			if q.Owner == 0 {
				return fmt.Errorf("resource owner missing")
			}
			if q.Kind == "stat_threshold" && q.Type != "income" && q.Type != "spent" && q.Type != "lost" && q.Type != "kills" && q.Type != "salvage" {
				return fmt.Errorf("unknown player statistic")
			}
		case "count_type":
			if _, ok := c.Unit(q.Type); !ok {
				if _, ok = c.Building(q.Type); !ok {
					return fmt.Errorf("condition type missing")
				}
			}
		case "objective_complete", "objective_incomplete":
			if !objectives[q.Objective] || endObjectives[q.Objective] {
				return fmt.Errorf("referenced objective missing")
			}
		case "stations_owned":
			if q.Owner == 0 || q.Region != "" && !regions[q.Region] {
				return fmt.Errorf("station owner/region missing")
			}
		case "field_remaining":
			if !fields[q.Field] {
				return fmt.Errorf("condition field missing")
			}
		case "event_count", "event_value":
			if !MissionEvent(q.Event) || q.Tag != "" && !tags[q.Tag] {
				return fmt.Errorf("unknown mission event/tag")
			}
			if q.Type != "" {
				if _, ok := c.Unit(q.Type); !ok {
					if _, ok = c.Building(q.Type); !ok {
						return fmt.Errorf("event type missing")
					}
				}
			}
		case "convoy_completed":
			if !convoys[q.Convoy] {
				return fmt.Errorf("condition convoy missing")
			}
		default:
			return fmt.Errorf("unsupported condition %s", q.Kind)
		}
		return nil
	}
	dependencies := map[string][]string{}
	var collectDependencies func(string, MissionCondition)
	collectDependencies = func(id string, q MissionCondition) {
		if q.Kind == "objective_complete" || q.Kind == "objective_incomplete" {
			dependencies[id] = append(dependencies[id], q.Objective)
		}
		for _, child := range q.Children {
			collectDependencies(id, child)
		}
	}
	var hasWave func(MissionCondition) bool
	hasWave = func(q MissionCondition) bool {
		if q.Wave {
			return true
		}
		for _, child := range q.Children {
			if hasWave(child) {
				return true
			}
		}
		return false
	}
	for _, o := range v.Objectives {
		if hasWave(o.Condition) {
			return fmt.Errorf("wave timing cannot change objective timers")
		}
		if err := checkCondition(o.Condition, 0); err != nil {
			return err
		}
		collectDependencies(o.ID, o.Condition)
	}
	visiting, visited := map[string]bool{}, map[string]bool{}
	var acyclic func(string) bool
	acyclic = func(id string) bool {
		if visiting[id] {
			return false
		}
		if visited[id] {
			return true
		}
		visiting[id] = true
		for _, next := range dependencies[id] {
			if !acyclic(next) {
				return false
			}
		}
		visiting[id] = false
		visited[id] = true
		return true
	}
	for id := range objectives {
		if !acyclic(id) {
			return fmt.Errorf("cyclic objective dependency")
		}
	}
	ids := map[string]bool{}
	totalSpawns := uint32(0)
	for _, s := range v.Initial {
		totalSpawns += s.Count
	}
	for _, t := range v.Triggers {
		if t.ID == "" || len(t.ID) > 80 || ids[t.ID] || len(t.Actions) < 1 || len(t.Actions) > 16 || t.Repeat > 24 || t.Repeat > 1 && t.Interval < 20 {
			return fmt.Errorf("invalid trigger %s", t.ID)
		}
		ids[t.ID] = true
		if err := checkCondition(t.Condition, 0); err != nil {
			return err
		}
		wave := hasWave(t.Condition)
		waveSpawns := 0
		for _, a := range t.Actions {
			if a.TargetTag != "" && a.Kind != "attack_tag" {
				return fmt.Errorf("target tag on non-attack action")
			}
			if wave {
				switch a.Kind {
				case "spawn":
					if a.Spawn != nil && teams[a.Spawn.Owner] != humanTeam {
						waveSpawns++
					} else {
						return fmt.Errorf("wave may spawn only enemies")
					}
				case "credits", "attack_region", "attack_tag":
					if teams[a.Owner] == humanTeam {
						return fmt.Errorf("wave may modify only enemies")
					}
				case "warning", "checkpoint":
				default:
					return fmt.Errorf("wave cannot alter player objectives or units")
				}
			}
			switch a.Kind {
			case "spawn":
				if a.Spawn == nil {
					return fmt.Errorf("spawn action needs definition")
				}
				totalSpawns += a.Spawn.Count * max(uint32(1), t.Repeat)
			case "complete_objective":
				if !objectives[a.Objective] || endObjectives[a.Objective] {
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
			case "recover_tag":
				for _, convoy := range v.Convoys {
					if convoy.Tag == a.Tag {
						return fmt.Errorf("convoy control cannot be transferred to a player")
					}
				}
				if !players[a.Owner] || !tags[a.Tag] || teams[a.Owner] != humanTeam || teams[tagOwners[a.Tag]] != humanTeam || controllers[a.Owner] != "human" {
					return fmt.Errorf("recovery requires allied tagged entities")
				}
				for _, spawn := range tagSpawns[a.Tag] {
					unit, ok := c.Unit(spawn.Type)
					if !ok || unit.Armor == "air" {
						return fmt.Errorf("recovery supports ground units only")
					}
				}
			case "start_convoy":
				if !convoys[a.Convoy] {
					return fmt.Errorf("action convoy missing")
				}
			case "attack_region":
				if !players[a.Owner] || !regions[a.Region] {
					return fmt.Errorf("invalid attack region")
				}
			case "attack_tag":
				if !players[a.Owner] || controllers[a.Owner] == "human" || !tags[a.Tag] || tagOwners[a.Tag] != a.Owner || !tags[a.TargetTag] || teams[tagOwners[a.TargetTag]] == teams[a.Owner] {
					return fmt.Errorf("tagged attack requires nonhuman attackers and enemy target tags")
				}
				for _, spawn := range tagSpawns[a.Tag] {
					if _, ok := c.Unit(spawn.Type); !ok {
						return fmt.Errorf("tagged attack sources must be units")
					}
				}
			default:
				return fmt.Errorf("unsupported action %s", a.Kind)
			}
		}
		if wave && waveSpawns == 0 {
			return fmt.Errorf("wave timer needs enemy reinforcement")
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
