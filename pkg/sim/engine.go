package sim

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"frontlinecommand/pkg/content"
	"io"
	"sort"
)

func New(c *content.Catalog, cfg Config) (*Engine, error) {
	if c == nil {
		return nil, errors.New("missing content catalog")
	}
	if err := cfg.Map.Validate(); err != nil {
		return nil, err
	}
	if len(cfg.Players) < 1 || len(cfg.Players) > 4 || len(cfg.Players) > len(cfg.Map.Spawns) {
		return nil, errors.New("player count does not fit map")
	}
	// Deep-copy map input so external callers cannot mutate an active match.
	b, _ := json.Marshal(cfg.Map)
	var gameMap content.Map
	json.Unmarshal(b, &gameMap)
	if cfg.Ruleset == "" {
		cfg.Ruleset = "standard-v2"
	}
	if cfg.Seed == 0 {
		cfg.Seed = 1
	}
	e := &Engine{catalog: c, state: State{Metadata: Metadata{Version, 1, c.Hash(), gameMap.Version, cfg.Ruleset, cfg.Seed}, Map: gameMap, RNG: cfg.Seed, NextID: 1, NextEvent: 1, Countdown: 100}, visible: map[PlayerID][]bool{}}
	ids := map[PlayerID]bool{}
	for i, pc := range cfg.Players {
		if pc.Controller == "" {
			pc.Controller = "human"
			if pc.AI != "" {
				pc.Controller = "ai"
			}
		}
		if pc.Controller != "human" && pc.Controller != "ai" && pc.Controller != "script" || pc.Controller == "ai" && pc.AI == "" || pc.Controller != "ai" && pc.AI != "" {
			return nil, errors.New("invalid controller")
		}
		if pc.ID == 0 || ids[pc.ID] || !content.ValidFaction(pc.Faction) || len(pc.Name) > 48 {
			return nil, errors.New("invalid player")
		}
		if pc.AI != "" && pc.AI != "easy" && pc.AI != "normal" && pc.AI != "hard" {
			return nil, errors.New("invalid AI difficulty")
		}
		ids[pc.ID] = true
		if pc.Team == 0 {
			pc.Team = uint32(pc.ID)
		}
		p := &Player{PlayerConfig: pc, Credits: 6000000, Explored: make([]bool, len(gameMap.Tiles)), RepairReserve: 0, Tier: 1}
		e.state.Players = append(e.state.Players, p)
		pos := gameMap.Spawns[i].Position
		e.spawn("hq", pc.ID, pos, true, 0)
		e.spawn(pc.Faction+".rig", pc.ID, Vec{X: pos.X + 3200, Y: pos.Y}, true, 0)
	}
	sort.Slice(e.state.Players, func(i, j int) bool { return e.state.Players[i].ID < e.state.Players[j].ID })
	for _, f := range gameMap.Fields {
		e.state.Fields = append(e.state.Fields, &ResourceField{ID: f.ID, Position: f.Position, Remaining: f.Credits})
	}
	sort.Slice(e.state.Fields, func(i, j int) bool { return e.state.Fields[i].ID < e.state.Fields[j].ID })
	for _, s := range gameMap.Stations {
		e.state.Stations = append(e.state.Stations, &ObjectiveStation{ID: e.newID(), Position: s.Position})
	}
	for _, o := range gameMap.Objects {
		v := e.spawn("map."+o.Class, 0, o.Position, true, 0)
		v.MapObject = o.ID
	}
	e.recalculate()
	e.updateFog()
	return e, nil
}
func (e *Engine) newID() ID { id := e.state.NextID; e.state.NextID++; return id }
func (e *Engine) player(id PlayerID) *Player {
	for _, p := range e.state.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}
func (e *Engine) defeated(id PlayerID) bool {
	p := e.player(id)
	return p != nil && p.Defeated
}
func (e *Engine) entity(id ID) *Entity {
	i := sort.Search(len(e.state.Entities), func(i int) bool { return e.state.Entities[i].ID >= id })
	if i < len(e.state.Entities) && e.state.Entities[i].ID == id {
		return e.state.Entities[i]
	}
	return nil
}
func (e *Engine) field(id uint32) *ResourceField {
	for _, f := range e.state.Fields {
		if f.ID == id {
			return f
		}
	}
	return nil
}
func (e *Engine) allied(a, b PlayerID) bool {
	pa, pb := e.player(a), e.player(b)
	return pa != nil && pb != nil && pa.Team == pb.Team
}
func (e *Engine) role(v *Entity) string {
	if v.Building {
		b, _ := e.buildingRule(v.Type)
		return b.Role
	}
	u, _ := e.catalog.Unit(v.Type)
	return u.Role
}
func (e *Engine) has(p PlayerID, role string) bool {
	for _, v := range e.state.Entities {
		if v.Owner == p && v.Building && v.Active(e.state.Tick) && e.role(v) == role {
			return true
		}
	}
	return false
}
func (e *Engine) spawn(typ string, owner PlayerID, pos Vec, complete bool, paid int64) *Entity {
	v := &Entity{ID: e.newID(), Type: typ, Owner: owner, Position: pos, LastPosition: pos, Anchor: pos, Rally: pos, Complete: complete, Enabled: true, State: "idle", Stance: "guard", Paid: paid, Created: e.state.Tick, StationarySince: e.state.Tick, LastProgress: e.state.Tick}
	if u, ok := e.catalog.Unit(typ); ok {
		v.HP = u.HP
		v.MaxHP = u.HP
		if w, ok := e.catalog.Weapon(u.Weapon); ok {
			v.Ammo = w.Ammo
			if w.Kind == "tactical" {
				v.Charges = 1
			}
		}
		if u.Armor == "air" {
			v.Endurance = 2400
			v.Landed = true
		}
		if p := e.player(owner); p != nil && p.HasUpgrade("vehicle_armor") && (u.Armor == "light" || u.Armor == "heavy") {
			v.MaxHP = v.MaxHP * 110 / 100
			v.HP = v.MaxHP
		}
	} else if b, ok := e.buildingRule(typ); ok {
		v.Building = true
		v.MaxHP = b.HP
		v.HP = b.HP
		if !complete {
			v.HP = b.HP / 10
			v.State = "constructing"
		}
		v.Rally = Vec{X: pos.X + b.Width*500 + 1500, Y: pos.Y + b.Height*500 + 1000}
	} else {
		panic("spawn unknown validated type: " + typ)
	}
	e.state.Entities = append(e.state.Entities, v)
	if v.Building {
		e.state.NavigationRevision++
	}
	return v
}
func (e *Engine) recalculate() {
	for _, p := range e.state.Players {
		p.Supply = 0
		p.ReservedSupply = 0
		p.PowerCapacity = 0
		p.PowerDemand = 0
		p.Tier = 1
	}
	for _, v := range e.state.Entities {
		p := e.player(v.Owner)
		if p == nil || p.Defeated || v.HP <= 0 {
			continue
		}
		if v.Building {
			b, _ := e.buildingRule(v.Type)
			if v.Active(e.state.Tick) {
				p.PowerCapacity += b.PowerCapacity
				p.PowerDemand += b.PowerDemand
				if b.Role == "hq" && e.hasBuff(v, "emergency_power") {
					p.PowerCapacity += 80
				}
			}
		} else {
			u, _ := e.catalog.Unit(v.Type)
			p.Supply += u.Supply
		}
		for _, j := range v.Jobs {
			if j.Started {
				p.ReservedSupply += j.Supply
			}
		}
	}
	for _, p := range e.state.Players {
		if e.has(p.ID, "radar") {
			p.Tier = 2
			if e.has(p.ID, "tech") {
				p.Tier = 3
			}
		}
	}
	for _, op := range e.state.Operations {
		if p := e.player(op.Owner); p != nil {
			p.ReservedSupply += op.ReservedSupply
		}
	}
}
func (e *Engine) Tick() Tick         { return e.state.Tick }
func (e *Engine) Metadata() Metadata { return e.state.Metadata }
func (e *Engine) Outcome() Outcome   { return e.state.Outcome }
func (e *Engine) Hash() string {
	b, _ := json.Marshal(e.state)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
func (e *Engine) StateCopy() State {
	b, _ := json.Marshal(e.state)
	var s State
	json.Unmarshal(b, &s)
	return s
}
func (e *Engine) emit(kind string, owner PlayerID, id ID, pos Vec, scope string, value int64) {
	e.state.Events = append(e.state.Events, Event{ID: e.state.NextEvent, Tick: e.state.Tick, Kind: kind, Owner: owner, Entity: id, Position: pos, Scope: scope, Value: value})
	e.state.NextEvent++
}
func (e *Engine) Advance() {
	if e.state.Outcome.Finished {
		return
	}
	e.state.Tick++
	e.state.Events = nil
	e.state.Results = nil
	e.damages = nil
	e.pathBudget = 12
	if e.state.Countdown > 0 {
		e.state.Countdown--
		return
	}
	e.recalculate()
	e.updateFog()
	e.executePending()
	e.updateAI()
	e.recalculate()
	e.updateEconomy()
	e.updateMovement()
	e.updateFog()
	e.updateAircraft()
	e.updateCombat()
	e.updateProjectiles()
	e.resolveDamage()
	e.updateSupport()
	e.updateSpecial()
	e.cleanup()
	e.recalculate()
	e.updateFog()
	e.updateMission()
	e.updateVictory()
}
func (e *Engine) updateVictory() {
	if e.state.Mission != nil {
		if !e.state.Outcome.Finished && e.state.Tick >= seconds(90*60)+100 {
			e.state.Outcome = Outcome{Finished: true, Draw: true, Reason: "time_limit", Tick: e.state.Tick}
		}
		return
	}
	for _, p := range e.state.Players {
		if p.Defeated {
			continue
		}
		qualifies := false
		for _, v := range e.state.Entities {
			if v.Owner != p.ID || v.HP <= 0 {
				continue
			}
			if !v.Building && e.role(v) == "rig" {
				qualifies = true
				break
			}
			if v.Building && v.Complete {
				b, _ := e.buildingRule(v.Type)
				if b.Qualifying {
					qualifies = true
					break
				}
			}
		}
		if qualifies {
			p.DefeatAt = 0
		} else if p.DefeatAt == 0 {
			p.DefeatAt = e.state.Tick + seconds(30)
			e.emit("defeat_countdown", p.ID, 0, Vec{}, "all", int64(p.DefeatAt))
		} else if e.state.Tick >= p.DefeatAt {
			e.defeat(p)
		}
	}
	teams := []uint32{}
	for _, p := range e.state.Players {
		if p.Defeated {
			continue
		}
		found := false
		for _, t := range teams {
			if t == p.Team {
				found = true
			}
		}
		if !found {
			teams = append(teams, p.Team)
		}
	}
	initialTeams := map[uint32]bool{}
	for _, p := range e.state.Players {
		initialTeams[p.Team] = true
	}
	if len(teams) == 0 {
		e.state.Outcome = Outcome{Finished: true, Draw: true, Reason: "simultaneous_elimination", Tick: e.state.Tick}
	} else if len(teams) == 1 && len(initialTeams) > 1 {
		e.state.Outcome = Outcome{Finished: true, WinningTeam: teams[0], Reason: "elimination", Tick: e.state.Tick}
	} else if e.state.Tick >= seconds(90*60)+100 {
		e.state.Outcome = Outcome{Finished: true, Draw: true, Reason: "time_limit", Tick: e.state.Tick}
	}
	if e.state.Outcome.Finished {
		e.emit("match_ended", 0, 0, Vec{}, "all", int64(e.state.Outcome.WinningTeam))
	}
}
func (e *Engine) defeat(p *Player) {
	p.Defeated = true
	p.DefeatAt = 0
	for _, v := range e.state.Entities {
		if v.Owner == p.ID {
			v.State = "inactive"
			v.Orders = nil
			v.Jobs = nil
			v.Enabled = false
			v.Concealed = false
		}
	}
	e.emit("player_defeated", p.ID, 0, Vec{}, "all", 0)
}
func (e *Engine) hasBuff(v *Entity, kind string) bool {
	for _, b := range v.Buffs {
		if b.Kind == kind && b.Until > e.state.Tick {
			return true
		}
	}
	return false
}
func cooldown(cs []Cooldown, id string, now Tick) bool {
	for _, c := range cs {
		if c.ID == id && c.Until > now {
			return true
		}
	}
	return false
}
func setCooldown(cs *[]Cooldown, id string, until Tick) {
	for i := range *cs {
		if (*cs)[i].ID == id {
			(*cs)[i].Until = until
			return
		}
	}
	*cs = append(*cs, Cooldown{id, until})
}

type saveEnvelope struct {
	Version uint32          `json:"version"`
	SHA256  string          `json:"sha256"`
	State   json.RawMessage `json:"state"`
}

func (e *Engine) Save() ([]byte, error) {
	b, err := json.Marshal(e.state)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(b)
	return json.Marshal(saveEnvelope{1, hex.EncodeToString(sum[:]), b})
}
func Restore(c *content.Catalog, data []byte) (*Engine, error) {
	if c == nil || len(data) > 64<<20 {
		return nil, errors.New("save exceeds 64 MiB or missing catalog")
	}
	var env saveEnvelope
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(&env); err != nil {
		return nil, err
	}
	if d.Decode(new(any)) != io.EOF {
		return nil, errors.New("trailing save data")
	}
	sum := sha256.Sum256(env.State)
	if env.Version != 1 || env.SHA256 != hex.EncodeToString(sum[:]) {
		return nil, errors.New("save checksum or format mismatch; preserve file for export")
	}
	e := &Engine{catalog: c, visible: map[PlayerID][]bool{}}
	d = json.NewDecoder(bytes.NewReader(env.State))
	d.DisallowUnknownFields()
	if err := d.Decode(&e.state); err != nil {
		return nil, err
	}
	s := &e.state
	if s.Metadata.Simulation != Version || s.Metadata.Protocol != 1 || s.Metadata.ContentHash != c.Hash() {
		return nil, errors.New("incompatible simulation/content version; preserve file for export")
	}
	if err := s.Map.Validate(); err != nil {
		return nil, err
	}
	if len(s.Players) < 1 || len(s.Players) > 4 || len(s.Entities) > 4096 || len(s.Projectiles) > 8192 || len(s.Pending) > 1024 || s.NextID == 0 || s.Tick > seconds(90*60)+101 {
		return nil, errors.New("invalid state bounds")
	}
	lastP := PlayerID(0)
	for _, p := range s.Players {
		if p == nil || p.ID <= lastP || !content.ValidFaction(p.Faction) || p.Credits < 0 || p.Credits > 1000000000000 || p.Energy < 0 || p.Energy > 100000 || len(p.Explored) != len(s.Map.Tiles) {
			return nil, errors.New("invalid saved player")
		}
		lastP = p.ID
	}
	lastID := ID(0)
	for _, v := range s.Entities {
		if v == nil || v.ID <= lastID || v.ID >= s.NextID || (v.Owner != 0 || v.MapObject == 0) && e.player(v.Owner) == nil || v.HP < 0 || v.HP > v.MaxHP || v.MaxHP <= 0 || v.MaxHP > 200000000 || len(v.Orders) > 10 || len(v.Jobs) > 6 || len(v.Path) > 65536 || !s.Map.InBounds(v.Position) {
			return nil, fmt.Errorf("invalid saved entity")
		}
		lastID = v.ID
		if v.Building {
			if _, ok := c.Building(v.Type); !ok {
				return nil, errors.New("unknown saved building")
			}
		} else if _, ok := c.Unit(v.Type); !ok {
			return nil, errors.New("unknown saved unit")
		}
	}
	if err := e.validateState(); err != nil {
		return nil, err
	}
	e.computeVisibility()
	return e, nil
}
