package sim

import (
	"errors"
	"slices"
	"strings"
)

// CommandAffordances describes command families, not present affordability,
// readiness, target legality or successful execution. Lists are stable IDs.
type CommandAffordances struct {
	Tick           Tick               `json:"tick"`
	Player         PlayerID           `json:"player"`
	Entities       []EntityAffordance `json:"entities"`
	PlayerCommands []string           `json:"player_commands"`
}
type EntityAffordance struct {
	ID         ID                 `json:"id"`
	Commands   []string           `json:"commands"`
	Abilities  []string           `json:"abilities"`
	Builds     []string           `json:"builds"`
	Trains     []string           `json:"trains"`
	Research   []string           `json:"research"`
	Production []ProductionStatus `json:"production_status,omitempty"`
}

func (e *Engine) CommandAffordances(player PlayerID, ids []ID) (CommandAffordances, error) {
	result := CommandAffordances{Tick: e.state.Tick, Player: player, Entities: []EntityAffordance{}, PlayerCommands: []string{}}
	p := e.player(player)
	if p == nil || p.Defeated || p.Controller == "script" {
		return result, errors.New("player_inactive")
	}
	if len(ids) > 64 {
		return result, errors.New("selection_limit")
	}
	seen := map[ID]bool{}
	for _, id := range ids {
		v := e.entity(id)
		if seen[id] || v == nil || v.Owner != player {
			return result, errors.New("not_owner")
		}
		seen[id] = true
		options := e.entityAffordance(p, v)
		options.Production = e.productionStatuses(p, v, options)
		result.Entities = append(result.Entities, options)
	}
	slices.SortFunc(result.Entities, func(a, b EntityAffordance) int {
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	if !e.state.Outcome.Finished {
		result.PlayerCommands = []string{"ping", "repair_reserve", "surrender", "surrender_cancel", "surrender_vote"}
		if e.state.Mission != nil && len(e.state.Mission.Convoys) > 0 {
			result.PlayerCommands = append(result.PlayerCommands, "convoy_hold", "convoy_advance")
		}
		if e.state.Metadata.Ruleset == "practice-v1" && e.state.Mission == nil {
			result.PlayerCommands = append(result.PlayerCommands, "practice_spawn", "practice_remove", "practice_restore", "practice_resources", "practice_fog")
		}
		slices.Sort(result.PlayerCommands)
	}
	return result, nil
}

func (e *Engine) entityAffordance(p *Player, v *Entity) EntityAffordance {
	a := EntityAffordance{ID: v.ID, Commands: []string{}, Abilities: []string{}, Builds: []string{}, Trains: []string{}, Research: []string{}}
	role := e.role(v)
	actorCode := e.ownedOrderActorCode(v)
	// Disabled buildings retain their catalog menus and producer_disabled
	// advice. Order filtering still rejects them before command execution.
	if e.state.Outcome.Finished || actorCode != "ok" && !(v.Building && actorCode == "unit_disabled") {
		return a
	}
	add := func(names ...string) { a.Commands = append(a.Commands, names...) }
	if v.Building {
		add("rally")
		if v.Complete && v.MapObject == 0 {
			add("sell", "power")
		}
		if !v.Complete || len(v.Jobs) > 0 {
			add("cancel")
		}
		for _, u := range e.catalog.Units() {
			if u.Faction == p.Faction && (u.Producer == role || role == "factory" && u.Role == "rig" && !e.hasSurvivingHQ(p.ID)) {
				a.Trains = append(a.Trains, u.ID)
			}
		}
		for _, u := range e.catalog.Upgrades() {
			if u.Producer == role && (u.Faction == "" || u.Faction == p.Faction) {
				a.Research = append(a.Research, u.ID)
			}
		}
		if len(a.Trains) > 0 {
			add("train")
		}
		if len(a.Research) > 0 {
			add("research")
		}
	} else {
		if v.Type == "IR.beacon" {
			add("stop", "hold")
		} else {
			add("move", "attack_move", "patrol", "stop", "hold", "guard", "escort", "aggressive")
		}
		if w, ok := e.weapon(v); ok {
			add("attack")
			if w.Kind == "shell" || w.Kind == "cannon" || v.Type == "IR.shahed" {
				add("force_fire")
			}
		}
		if role == "rig" {
			add("build", "resume")
			for _, b := range e.catalog.Buildings() {
				if !strings.HasPrefix(b.ID, "map.") && (b.Faction == "" || b.Faction == p.Faction) {
					a.Builds = append(a.Builds, b.ID)
				}
			}
		}
		if role == "engineer" {
			if _, ok := e.buildingRule(fieldBarricadeType); ok {
				add("build", "resume")
				a.Builds = append(a.Builds, fieldBarricadeType)
			}
		}
		if role == "hauler" {
			add("gather", "gather_depot", "retreat_when_attacked")
		}
		if role == "engineer" && v.TemporaryUntil == 0 {
			add("capture")
		}
		if role == "medic" || role == "engineer" || role == "repair" {
			add("repair")
		}
		if v.Type == "SY.engineer" || v.Type == "SY.repair" {
			add("salvage")
		}
		if e.armor(v) == "infantry" && v.TemporaryUntil == 0 {
			add("board")
		}
		if e.isAircraft(v) {
			add("return", "repeat_sortie")
		}
		if role == "launcher" || v.Type == "SA.tank" || v.Type == "SA.mobile_abm" || v.Type == "SA.repair" {
			add("deploy", "pack")
		}
	}
	if e.capacity(v) > 0 {
		add("unload")
	}
	if e.reconObserveActor(v) {
		a.Abilities = append(a.Abilities, "observe")
	}
	switch v.Type {
	case "US.recon":
		a.Abilities = append(a.Abilities, "designate")
	case "IR.recon":
		a.Abilities = append(a.Abilities, "beacon")
	case "IR.launcher":
		a.Abilities = append(a.Abilities, "volley")
	}
	if role == "elite" {
		a.Abilities = append(a.Abilities, "sabotage")
	}
	if role == "radar" {
		a.Abilities = append(a.Abilities, "radar_pulse")
	}
	if p.Faction == "US" && e.isAircraft(v) && role != "airlift" {
		a.Abilities = append(a.Abilities, "decoy")
	}
	if p.Faction == "SY" && role == "safehouse" {
		a.Abilities = append(a.Abilities, "transfer", "strategic")
	}
	if (p.Faction == "US" || p.Faction == "IR") || p.Faction == "SA" && (role == "hq" || role == "outpost" || v.Type == "SA.mobile_abm") {
		a.Abilities = append(a.Abilities, "strategic")
	}
	switch p.Faction {
	case "US":
		a.Abilities = append(a.Abilities, "recon_sweep")
		if v.Type == "US.airfield" {
			a.Abilities = append(a.Abilities, "rapid_sortie")
		}
	case "IR":
		if v.Type == "IR.isr" {
			a.Abilities = append(a.Abilities, "relay_boost")
		}
		if e.isAircraft(v) {
			a.Abilities = append(a.Abilities, "drone_recall")
		}
	case "SY":
		a.Abilities = append(a.Abilities, "rapid_transfer", "disperse")
	case "SA":
		a.Abilities = append(a.Abilities, "recovery_order")
		if role == "hq" {
			a.Abilities = append(a.Abilities, "emergency_power")
		}
	}
	if len(a.Abilities) > 0 {
		add("ability")
	}
	for _, list := range [][]string{a.Commands, a.Abilities, a.Builds, a.Trains, a.Research} {
		slices.Sort(list)
	}
	return a
}
