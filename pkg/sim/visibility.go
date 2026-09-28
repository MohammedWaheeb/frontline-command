package sim

func (e *Engine) lineOfSight(a, b Vec) bool {
	x, y, tx, ty := a.X/1000, a.Y/1000, b.X/1000, b.Y/1000
	dx, dy := abs(tx-x), -abs(ty-y)
	sx, sy := int32(-1), int32(-1)
	if x < tx {
		sx = 1
	}
	if y < ty {
		sy = 1
	}
	err := dx + dy
	for x != tx || y != ty {
		twice := 2 * err
		if twice >= dy {
			err += dy
			x += sx
		}
		if twice <= dx {
			err += dx
			y += sy
		}
		if x == tx && y == ty {
			return true
		}
		if x < 0 || y < 0 || x >= e.state.Map.Width || y >= e.state.Map.Height {
			return false
		}
		t := e.state.Map.Tiles[y*e.state.Map.Width+x]
		if t.SightBlocker || t.Terrain == "cliff" {
			return false
		}
	}
	return true
}
func (e *Engine) computeVisibility() {
	e.visible = make(map[PlayerID][]bool, len(e.state.Players))
	for _, p := range e.state.Players {
		e.visible[p.ID] = make([]bool, len(e.state.Map.Tiles))
		if e.state.Metadata.Ruleset == "practice-v1" && e.state.PracticeReveal {
			for i := range e.visible[p.ID] {
				e.visible[p.ID][i] = true
			}
		}
	}
	for _, v := range e.state.Entities {
		p := e.player(v.Owner)
		if v.HP <= 0 || p == nil || p.Defeated || v.Container != 0 || v.Building && !v.Complete {
			continue
		}
		if e.role(v) == "support_plane" && v.DisabledUntil > e.state.Tick {
			continue
		}
		radius := int32(9000)
		air := false
		if !v.Building {
			u, _ := e.catalog.Unit(v.Type)
			radius = u.Sight
			air = u.Armor == "air" && !v.Landed
		}
		if e.state.Map.TileAt(v.Position).Height > 0 {
			radius += 2000
		}
		if e.hasBuff(v, "relay") {
			radius += 3000
		}

		if e.fogCache == nil {
			e.fogCache = map[ID]fogSource{}
		}
		cached, ok := e.fogCache[v.ID]
		if !ok || cached.position != v.Position || cached.radius != radius || cached.air != air || cached.revision != e.state.NavigationRevision {
			cached = fogSource{position: v.Position, radius: radius, air: air, revision: e.state.NavigationRevision}
			x0, x1 := max(int32(0), (v.Position.X-radius)/1000), min(e.state.Map.Width-1, (v.Position.X+radius)/1000)
			y0, y1 := max(int32(0), (v.Position.Y-radius)/1000), min(e.state.Map.Height-1, (v.Position.Y+radius)/1000)
			for y := y0; y <= y1; y++ {
				for x := x0; x <= x1; x++ {
					pos := Vec{X: x*1000 + 500, Y: y*1000 + 500}
					if dist2(v.Position, pos) > int64(radius)*int64(radius) || !air && !e.lineOfSight(v.Position, pos) {
						continue
					}
					cached.tiles = append(cached.tiles, y*e.state.Map.Width+x)
				}
			}
			e.fogCache[v.ID] = cached
		}
		for _, idx := range cached.tiles {
			e.visible[v.Owner][idx] = true
		}

	}
	for _, p := range e.state.Players {
		for _, ally := range e.state.Players {
			if p.ID == ally.ID || p.Team != ally.Team || p.Defeated || ally.Defeated {
				continue
			}
			for i, v := range e.visible[ally.ID] {
				if v {
					e.visible[p.ID][i] = true
				}
			}
		}
	}
	if len(e.fogCache) > len(e.state.Entities)*2+100 {
		live := map[ID]fogSource{}
		for _, v := range e.state.Entities {
			if c, ok := e.fogCache[v.ID]; ok {
				live[v.ID] = c
			}
		}
		e.fogCache = live
	}
	for _, z := range e.state.Zones {
		if z.Kind != "scan" || e.defeated(z.Owner) || e.state.Tick < z.Start || e.state.Tick >= z.Until {
			continue
		}
		for y := max(int32(0), (z.Position.Y-z.Radius)/1000); y <= min(e.state.Map.Height-1, (z.Position.Y+z.Radius)/1000); y++ {
			for x := max(int32(0), (z.Position.X-z.Radius)/1000); x <= min(e.state.Map.Width-1, (z.Position.X+z.Radius)/1000); x++ {
				if dist2(z.Position, Vec{X: x*1000 + 500, Y: y*1000 + 500}) <= int64(z.Radius)*int64(z.Radius) {
					for _, p := range e.state.Players {
						if e.allied(z.Owner, p.ID) && !p.Defeated {
							e.visible[p.ID][y*e.state.Map.Width+x] = true
						}
					}
				}
			}
		}
	}
}
func (e *Engine) updateFog() {
	e.computeVisibility()
	for _, p := range e.state.Players {
		fog := e.visible[p.ID]
		e.observeRubble(p)
		for i, v := range fog {
			if v {
				p.Explored[i] = true
			}
		}
		memory := p.Memory[:0]
		for _, m := range p.Memory {
			v := e.entity(m.ID)
			if e.canSee(p.ID, m.Position) && (v == nil || v.HP <= 0 || v.Owner == p.ID) {
				continue
			}
			memory = append(memory, m)
		}
		p.Memory = memory
		for _, v := range e.state.Entities {
			if !v.Building || v.Owner == p.ID || v.HP <= 0 || !e.canSeeEntity(p.ID, v) {
				continue
			}
			m := Memory{ID: v.ID, Type: v.Type, Owner: v.Owner, Position: v.Position, Seen: e.state.Tick, FootprintWidth: v.FootprintWidth, FootprintHeight: v.FootprintHeight, FootprintType: v.FootprintType}
			found := false
			for i := range p.Memory {
				if p.Memory[i].ID == v.ID {
					p.Memory[i] = m
					found = true
					break
				}
			}
			if !found {
				p.Memory = append(p.Memory, m)
			}
		}
	}
}
func (e *Engine) canSee(p PlayerID, pos Vec) bool {
	if !e.state.Map.InBounds(pos) {
		return false
	}
	bits := e.visible[p]
	i := int(pos.Y/1000*e.state.Map.Width + pos.X/1000)
	return i < len(bits) && bits[i]
}
func (e *Engine) explored(p PlayerID, pos Vec) bool {
	if !e.state.Map.InBounds(pos) {
		return false
	}
	player := e.player(p)
	return player != nil && player.Explored[pos.Y/1000*e.state.Map.Width+pos.X/1000]
}
func (e *Engine) canSeeEntity(player PlayerID, v *Entity) bool {
	if v.HP <= 0 || v.Container != 0 {
		return false
	}
	if e.state.Metadata.Ruleset == "practice-v1" && e.state.PracticeReveal {
		return true
	}
	if v.Owner == player || e.allied(player, v.Owner) {
		return true
	}
	if v.PublicRevealUntil > e.state.Tick {
		return true
	}
	if !e.canSee(player, v.Position) {
		return false
	}
	if !v.Concealed {
		return true
	}
	for _, source := range e.state.Entities {
		if e.allied(player, source.Owner) && e.detectsConcealment(source, v) {
			return true
		}
	}
	return false
}

func (e *Engine) detectsConcealment(source, target *Entity) bool {
	if source.HP <= 0 || source.Owner == 0 || source.Container != 0 || e.defeated(source.Owner) || source.Building && !source.Complete || e.role(source) == "support_plane" && source.DisabledUntil > e.state.Tick {
		return false
	}
	radius := int32(3000)
	if !source.Building {
		u, _ := e.catalog.Unit(source.Type)
		radius = max(radius, u.Detection)
	}
	// A grounded scout has ground sight; another unit's shared vision cannot
	// let its detector see through a cliff. Foundations grant no sight.
	return distance(source.Position, target.Position) <= radius && (e.isAircraft(source) && !source.Landed || e.lineOfSight(source.Position, target.Position))
}
func (e *Engine) detectedByEnemy(v *Entity) bool {
	for _, source := range e.state.Entities {
		if !e.allied(v.Owner, source.Owner) && e.detectsConcealment(source, v) {
			return true
		}
	}
	return false
}
func (e *Engine) ambushReady(v *Entity) bool {
	if !v.Concealed || v.Container != 0 || v.Channel != "" || e.state.Tick-v.ConcealedSince < seconds(6) || cooldown(v.Cooldowns, "ambush", e.state.Tick) || e.detectedByEnemy(v) {
		return false
	}
	w, ok := e.weapon(v)
	return ok && w.Kind == "small"
}

type EconomyView struct {
	LastSequence   uint32     `json:"last_sequence"`
	Credits        int64      `json:"credits"`
	Energy         int64      `json:"energy"`
	Supply         int32      `json:"supply"`
	ReservedSupply int32      `json:"reserved_supply"`
	PowerCapacity  int32      `json:"power_capacity"`
	PowerDemand    int32      `json:"power_demand"`
	Tier           int32      `json:"tier"`
	Income         int64      `json:"income"`
	RepairReserve  int64      `json:"repair_reserve"`
	Upgrades       []string   `json:"upgrades"`
	Cooldowns      []Cooldown `json:"cooldowns"`
}
type EntityPrivate struct {
	AmbushReady  bool       `json:"ambush_ready"`
	RepeatSortie bool       `json:"repeat_sortie"`
	HP           int64      `json:"hp"`
	MaxHP        int64      `json:"max_hp"`
	Jobs         []Job      `json:"jobs"`
	Orders       []Order    `json:"orders"`
	Rally        Vec        `json:"rally"`
	Cargo        int64      `json:"cargo"`
	Home         ID         `json:"home"`
	Ammo         int32      `json:"ammo"`
	Endurance    uint32     `json:"endurance"`
	Charges      int32      `json:"charges"`
	ChargeWork   uint32     `json:"charge_work"`
	ServiceWork  uint32     `json:"service_work"`
	Experience   int64      `json:"experience"`
	Cooldowns    []Cooldown `json:"cooldowns"`
	Passengers   []ID       `json:"passengers"`
	Container    ID         `json:"container"`
}
type EntityView struct {
	FootprintWidth  int32          `json:"footprint_width"`
	FootprintHeight int32          `json:"footprint_height"`
	FootprintType   string         `json:"footprint_type"`
	MapObject       uint32         `json:"map_object"`
	TurretFacing    int32          `json:"turret_facing"`
	ChannelUntil    Tick           `json:"channel_until"`
	ID              ID             `json:"id"`
	Type            string         `json:"type"`
	Owner           PlayerID       `json:"owner"`
	Position        Vec            `json:"position"`
	Facing          int32          `json:"facing"`
	Health          int32          `json:"health"`
	State           string         `json:"state"`
	Complete        bool           `json:"complete"`
	Enabled         bool           `json:"enabled"`
	Landed          bool           `json:"landed"`
	Deployed        bool           `json:"deployed"`
	Concealed       bool           `json:"concealed"`
	Progress        int32          `json:"progress"`
	Rank            uint32         `json:"rank"`
	Private         *EntityPrivate `json:"private,omitempty"`
}
type PlayerSummary struct {
	SurrenderVote     bool     `json:"surrender_vote"`
	ID                PlayerID `json:"id"`
	Name              string   `json:"name"`
	Faction           string   `json:"faction"`
	Team              uint32   `json:"team"`
	Color             uint32   `json:"color"`
	Defeated          bool     `json:"defeated"`
	DefeatAt          Tick     `json:"defeat_at"`
	StrategicProgress int32    `json:"strategic_progress"`
}
type ProjectileView struct {
	ID            ID       `json:"id"`
	Owner         PlayerID `json:"owner"`
	Weapon        string   `json:"weapon"`
	Position      Vec      `json:"position"`
	Impact        Vec      `json:"impact"`
	ImpactAt      Tick     `json:"impact_at"`
	Interceptable bool     `json:"interceptable"`
	Warning       bool     `json:"warning"`
}
type FieldView struct {
	ID        uint32 `json:"id"`
	Position  Vec    `json:"position"`
	Remaining int64  `json:"remaining"`
}
type StationView struct {
	ID       ID       `json:"id"`
	Position Vec      `json:"position"`
	Owner    PlayerID `json:"owner"`
}
type View struct {
	Debrief     *Debrief             `json:"debrief,omitempty"`
	Warnings    []OperationWarning   `json:"warnings"`
	Rubble      []uint32             `json:"rubble"`
	Salvage     []Salvage            `json:"salvage"`
	Zones       []ZoneView           `json:"zones"`
	Indicators  []StructureIndicator `json:"indicators"`
	Mission     *MissionView         `json:"mission,omitempty"`
	Metadata    Metadata             `json:"metadata"`
	Tick        Tick                 `json:"tick"`
	Countdown   uint32               `json:"countdown"`
	Player      PlayerID             `json:"player"`
	Economy     EconomyView          `json:"economy"`
	Players     []PlayerSummary      `json:"players"`
	Entities    []EntityView         `json:"entities"`
	Projectiles []ProjectileView     `json:"projectiles"`
	Fields      []FieldView          `json:"fields"`
	Stations    []StationView        `json:"stations"`
	Explored    []bool               `json:"explored"`
	Visible     []bool               `json:"visible"`
	Memory      []Memory             `json:"memory"`
	Events      []Event              `json:"events"`
	Results     []OrderResult        `json:"results"`
	ShipmentAt  Tick                 `json:"shipment_at"`
	Outcome     Outcome              `json:"outcome"`
}

type ZoneView struct {
	Kind     string   `json:"kind"`
	Owner    PlayerID `json:"owner"`
	Position Vec      `json:"position"`
	Radius   int32    `json:"radius"`
	Start    Tick     `json:"start"`
	Until    Tick     `json:"until"`
}

// These positions are minimap warnings only. They never grant target IDs or
// firing vision, update fog memories, or include a hidden structure's health.
type StructureIndicator struct {
	Owner    PlayerID `json:"owner"`
	Position Vec      `json:"position"`
}
type ObjectiveView struct {
	ID       string `json:"id"`
	Text     string `json:"text"`
	Optional bool   `json:"optional"`
	Failure  bool   `json:"failure"`
	Complete bool   `json:"complete"`
	Progress uint32 `json:"progress"`
	Required uint32 `json:"required"`
}
type MissionView struct {
	Version        string          `json:"version"`
	Convoys        []ConvoyState   `json:"convoys"`
	ID             string          `json:"id"`
	Title          string          `json:"title"`
	Difficulty     string          `json:"difficulty"`
	Checkpoint     string          `json:"checkpoint"`
	CheckpointTick Tick            `json:"checkpoint_tick"`
	Objectives     []ObjectiveView `json:"objectives"`
}

// PlayerView is the sole network serialization source. Never serialize State
// into a match socket, even for allies or reconnects.
func (e *Engine) PlayerView(id PlayerID) (View, bool) {
	p := e.player(id)
	if p == nil {
		return View{}, false
	}
	view := View{Metadata: e.state.Metadata, Tick: e.state.Tick, Countdown: e.state.Countdown, Player: id, Economy: EconomyView{p.LastSequence, p.Credits, p.Energy, p.Supply, p.ReservedSupply, p.PowerCapacity, p.PowerDemand, p.Tier, p.Income, p.RepairReserve, append([]string(nil), p.Upgrades...), append([]Cooldown(nil), p.Cooldowns...)}, Explored: append([]bool(nil), p.Explored...), Visible: append([]bool(nil), e.visible[id]...), Memory: append([]Memory(nil), p.Memory...), ShipmentAt: e.state.ShipmentAt, Outcome: e.state.Outcome}
	view.Rubble = append([]uint32(nil), p.KnownRubble...)
	view.Debrief = e.Debrief()
	view.Warnings = e.operationWarnings(id)
	for _, player := range e.state.Players {
		s := PlayerSummary{ID: player.ID, Name: player.Name, Faction: player.Faction, Team: player.Team, Color: player.Color, Defeated: player.Defeated, DefeatAt: player.DefeatAt, StrategicProgress: -1, SurrenderVote: player.Team == p.Team && player.SurrenderVote}
		for _, v := range e.state.Entities {
			if v.Owner == player.ID && v.HP > 0 && v.Complete && e.role(v) == "strategic" {
				s.StrategicProgress = int32(v.ChargeWork * 1000 / e.strategicCharge(player.Faction))
			}
		}
		view.Players = append(view.Players, s)
	}
	for _, v := range e.state.Entities {
		if v.HP <= 0 {
			continue
		}
		if v.Owner != id && !e.canSeeEntity(id, v) {
			continue
		}
		s := EntityView{TurretFacing: v.TurretFacing, ChannelUntil: v.ChannelUntil, ID: v.ID, Type: v.Type, Owner: v.Owner, Position: v.Position, Facing: v.Facing, Health: int32(v.HP * 1000 / v.MaxHP), State: v.State, Complete: v.Complete, Enabled: v.Enabled && v.DisabledUntil <= e.state.Tick, Landed: v.Landed, Deployed: v.Deployed, Concealed: v.Concealed, Rank: v.Rank}
		s.MapObject = v.MapObject
		s.FootprintWidth, s.FootprintHeight, s.FootprintType = v.FootprintWidth, v.FootprintHeight, v.FootprintType
		if v.Building && !v.Complete {
			b, _ := e.buildingRule(v.Type)
			s.Progress = int32(v.Work * 1000 / (b.BuildTicks * 2))
		}
		if v.Building && v.Channel == "sell" && v.ChannelUntil > e.Tick() {
			// The channel is authoritative even when a queued production job
			// updates the building's ordinary activity state in the same tick.
			s.State = "selling"
			s.Progress = clamp(1000-int32((v.ChannelUntil-e.Tick())*1000/seconds(5)), 0, 1000)
		}
		if until := max(v.DeployUntil, v.PackingUntil); !v.Building && until > e.Tick() && until > v.DeploymentStarted {
			s.Progress = clamp(int32(uint64(e.Tick()-v.DeploymentStarted)*1000/uint64(until-v.DeploymentStarted)), 0, 1000)
		}
		if v.Owner == id {
			s.Private = &EntityPrivate{e.ambushReady(v), v.RepeatSortie, v.HP, v.MaxHP, append([]Job(nil), v.Jobs...), cloneOrders(v.Orders), v.Rally, v.Cargo, v.Home, v.Ammo, v.Endurance, v.Charges, v.ChargeWork, v.ServiceWork, v.Experience, append([]Cooldown(nil), v.Cooldowns...), append([]ID(nil), v.Passengers...), v.Container}
		} else {
			switch s.State {
			case "insufficient_credits", "service_full", "supply_blocked", "prerequisite_lost", "rig_limit", "hauler_limit", "elite_limit", "no_known_supplies", "no_supply_center":
				s.State = "idle"
			}
		}
		view.Entities = append(view.Entities, s)
	}
	for _, f := range e.state.Fields {
		if e.canSee(id, f.Position) {
			view.Fields = append(view.Fields, FieldView{f.ID, f.Position, f.Remaining})
		}
	}
	for _, s := range e.state.Stations {
		if e.canSee(id, s.Position) {
			view.Stations = append(view.Stations, StationView{s.ID, s.Position, s.Owner})
		}
	}
	for _, v := range e.state.Projectiles {
		warning := v.Interceptable || v.Strategic
		if !warning && !e.canSee(id, v.Position) {
			continue
		}
		p := ProjectileView{ID: v.ID, Owner: v.Owner, Weapon: v.Weapon, Position: v.Position, Impact: v.Impact, ImpactAt: v.ImpactAt, Interceptable: v.Interceptable, Warning: warning}
		if warning && !e.canSee(id, v.Position) {
			p.Position = v.Impact
		}
		if !warning && !e.canSee(id, v.Impact) {
			p.Impact = v.Position
		}
		view.Projectiles = append(view.Projectiles, p)
	}
	for _, event := range e.state.Events {
		if event.Scope == "all" || event.Scope == "owner" && event.Owner == id || event.Scope == "team" && e.allied(id, event.Owner) || event.Scope == "visible" && e.canSee(id, event.Position) {
			if event.Kind == "impact" && event.Entity != 0 {
				// Seeing an explosion must not identify a concealed, embarked,
				// destroyed or out-of-sight victim. Never infer from fog memory.
				target := e.entity(event.Entity)
				if target == nil || !e.canSeeEntity(id, target) {
					event.Entity = 0
				}
			}
			view.Events = append(view.Events, event)
		}
	}
	for _, r := range e.state.Results {
		if r.Player == id {
			view.Results = append(view.Results, r)
		}
	}
	for _, crate := range e.state.Salvage {
		if crate.Until > e.state.Tick && e.canSee(id, crate.Position) {
			view.Salvage = append(view.Salvage, crate)
		}
	}
	for _, zone := range e.state.Zones {
		if zone.Until <= e.state.Tick {
			continue
		}
		show := e.allied(id, zone.Owner) || zone.Kind == "shieldline" || e.canSee(id, zone.Position)
		if !show && zone.Kind == "scan" {
			for _, v := range e.state.Entities {
				if v.Owner == id && v.HP > 0 && distance(v.Position, zone.Position) <= zone.Radius {
					show = true
					break
				}
			}
		}
		if show {
			view.Zones = append(view.Zones, ZoneView{zone.Kind, zone.Owner, zone.Position, zone.Radius, zone.Start, zone.Until})
		}
	}
	if e.state.Mission == nil && e.state.Tick >= seconds(35*60) && (e.state.Tick-seconds(35*60))%seconds(90) < seconds(5) {
		for _, v := range e.state.Entities {
			if !v.Building || !v.Complete || v.HP <= 0 || e.defeated(v.Owner) || e.allied(id, v.Owner) {
				continue
			}
			if b, ok := e.buildingRule(v.Type); ok && b.Qualifying {
				view.Indicators = append(view.Indicators, StructureIndicator{v.Owner, v.Position})
			}
		}
	}
	if ms := e.state.Mission; ms != nil {
		view.Mission = &MissionView{ID: ms.Definition.ID, Version: ms.Definition.Version, Title: ms.Definition.Title, Difficulty: ms.Difficulty, Checkpoint: ms.Checkpoint, CheckpointTick: ms.CheckpointTick}
		for _, convoy := range ms.Convoys {
			copy := convoy
			copy.Approved = append([]PlayerID(nil), convoy.Approved...)
			view.Mission.Convoys = append(view.Mission.Convoys, copy)
		}
		for i, objective := range ms.Definition.Objectives {
			progress := ms.Objectives[i]
			required := objective.Condition.Count
			if objective.Condition.HoldTicks > 0 {
				required = objective.Condition.HoldTicks
			}
			view.Mission.Objectives = append(view.Mission.Objectives, ObjectiveView{objective.ID, objective.Text, objective.Optional, objective.Failure, progress.Complete, progress.Progress, required})
		}
	}
	return view, true
}
func cloneOrders(src []Order) []Order {
	out := make([]Order, len(src))
	for i, o := range src {
		o.Entities = append([]ID(nil), o.Entities...)
		o.Points = append([]Vec(nil), o.Points...)
		out[i] = o
	}
	return out
}
