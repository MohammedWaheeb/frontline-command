package sim

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
)

var orderKinds = map[string]bool{"ping": true, "move": true, "attack_move": true, "attack": true, "force_fire": true, "stop": true, "hold": true, "guard": true, "aggressive": true, "build": true, "resume": true, "train": true, "research": true, "cancel": true, "sell": true, "power": true, "rally": true, "gather": true, "salvage": true, "repair": true, "capture": true, "board": true, "unload": true, "return": true, "deploy": true, "pack": true, "ability": true, "surrender": true, "repair_reserve": true}

// Submit only schedules intentions. Spending, targeting and prerequisites are
// revalidated at execution; receipts never imply that gameplay already happened.
func (e *Engine) Submit(player PlayerID, sequence uint32, orders []Order) error {
	p := e.player(player)
	if p == nil || p.Defeated {
		return errors.New("player_inactive")
	}
	if e.state.Outcome.Finished {
		return errors.New("match_finished")
	}
	if e.state.Countdown > 0 {
		return errors.New("match_starting")
	}
	if sequence == 0 || sequence <= p.LastSequence {
		return errors.New("stale_sequence")
	}
	if len(orders) == 0 || len(orders) > 32 || len(e.state.Pending) >= 128 {
		return errors.New("command_limit")
	}
	for _, o := range orders {
		if !orderKinds[o.Kind] || len(o.Entities) > 64 || len(o.Points) > 6 || len(o.Type) > 80 || o.Index < 0 || o.Index > 1000000 {
			return errors.New("invalid_order")
		}
		seen := map[ID]bool{}
		for _, id := range o.Entities {
			v := e.entity(id)
			if seen[id] || v == nil || v.Owner != player || v.HP <= 0 {
				return errors.New("not_owner")
			}
			seen[id] = true
		}
		if o.Kind != "surrender" && o.Kind != "repair_reserve" && o.Kind != "ping" && len(o.Entities) == 0 {
			return errors.New("selection_empty")
		}
		switch o.Kind {
		case "move", "attack_move", "build", "force_fire", "rally", "guard", "aggressive", "ping", "unload":
			if !e.state.Map.InBounds(o.Position) {
				return errors.New("outside_map")
			}
		}
		for _, pt := range o.Points {
			if !e.state.Map.InBounds(pt) {
				return errors.New("outside_map")
			}
		}
	}
	// Copy client buffers and canonicalize selections for stable formation order.
	if e.state.Tick-p.CommandWindow >= seconds(1) {
		p.CommandWindow = e.state.Tick
		p.CommandCount = 0
	}
	if p.CommandCount+uint32(len(orders)) > 160 {
		return errors.New("command_rate_exceeded")
	}
	p.CommandCount += uint32(len(orders))
	b, _ := json.Marshal(orders)
	var copyOrders []Order
	json.Unmarshal(b, &copyOrders)
	for i := range copyOrders {
		sort.Slice(copyOrders[i].Entities, func(a, b int) bool { return copyOrders[i].Entities[a] < copyOrders[i].Entities[b] })
	}
	p.LastSequence = sequence
	e.state.Pending = append(e.state.Pending, Scheduled{e.state.Tick + 1, player, sequence, copyOrders})
	return nil
}
func (e *Engine) executePending() {
	sort.SliceStable(e.state.Pending, func(i, j int) bool {
		a, b := e.state.Pending[i], e.state.Pending[j]
		if a.Tick != b.Tick {
			return a.Tick < b.Tick
		}
		if a.Player != b.Player {
			return a.Player < b.Player
		}
		return a.Sequence < b.Sequence
	})
	pending := e.state.Pending
	e.state.Pending = nil
	for _, s := range pending {
		if s.Tick > e.state.Tick {
			e.state.Pending = append(e.state.Pending, s)
			continue
		}
		e.state.Log = append(e.state.Log, s)
		e.state.LogOrders += uint32(len(s.Orders))
		for i, o := range s.Orders {
			code := e.execute(s.Player, o)
			e.state.Results = append(e.state.Results, OrderResult{s.Player, s.Sequence, int32(i), code == "ok", code, e.state.Tick})
		}
	}
	for e.state.LogOrders > 32768 && len(e.state.Log) > 0 {
		e.state.LogOrders -= uint32(len(e.state.Log[0].Orders))
		e.state.Log[0] = Scheduled{}
		e.state.Log = e.state.Log[1:]
		e.state.LogBase++
	}
}
func (e *Engine) execute(player PlayerID, o Order) string {
	p := e.player(player)
	if p == nil || p.Defeated {
		return "player_inactive"
	}
	if o.Kind == "surrender" {
		e.defeat(p)
		return "ok"
	}
	if o.Kind == "repair_reserve" {
		p.RepairReserve = int64(o.Index) * 1000
		return "ok"
	}
	if o.Kind == "ping" {
		if e.state.Tick-p.PingWindow >= seconds(5) {
			p.PingWindow = e.state.Tick
			p.PingCount = 0
		}
		if p.PingCount >= 3 {
			return "ping_rate_exceeded"
		}
		p.PingCount++
		kind := o.Type
		switch kind {
		case "attack", "defend", "assist", "danger":
		default:
			kind = "attention"
		}
		e.emit("tactical_ping", p.ID, 0, o.Position, "team", 0)
		e.state.Events[len(e.state.Events)-1].Text = kind
		return "ok"
	}
	selected := make([]*Entity, 0, len(o.Entities))
	for _, id := range o.Entities {
		v := e.entity(id)
		if v == nil || v.HP <= 0 || v.Owner != player {
			return "not_owner"
		}
		if v.Container != 0 {
			return "unit_embarked"
		}
		if e.role(v) == "support_plane" {
			return "unit_not_controllable"
		}
		selected = append(selected, v)
	}
	if len(selected) == 0 {
		return "selection_empty"
	}
	v := selected[0]
	switch o.Kind {
	case "build":
		if len(selected) != 1 {
			return "one_builder_required"
		}
		return e.startBuilding(p, v, o)
	case "resume":
		target := e.entity(o.Target)
		if e.role(v) != "rig" || target == nil || target.Owner != player || !target.Building || target.Complete {
			return "invalid_foundation"
		}
		if builder := e.entity(target.Builder); builder != nil && builder.HP > 0 && len(builder.Orders) > 0 && builder.Orders[0].Target == target.ID {
			return "builder_assigned"
		}
		target.Builder = v.ID
		o.Kind = "build"
		e.assign(v, o)
		return "ok"
	case "train", "research":
		if len(selected) != 1 {
			return "one_producer_required"
		}
		return e.enqueue(p, v, o)
	case "cancel":
		if len(selected) != 1 {
			return "one_producer_required"
		}
		return e.cancel(p, v, o.Index)
	case "sell":
		if !v.Building || !v.Complete || v.MapObject != 0 {
			return "completed_building_required"
		}
		v.Channel = "sell"
		v.ChannelUntil = e.state.Tick + seconds(5)
		v.ChannelStartDamage = v.LastDamage
		v.State = "selling"
		return "ok"
	case "power":
		if !v.Building || !v.Complete || v.MapObject != 0 {
			return "completed_building_required"
		}
		v.Enabled = o.Index == 1
		return "ok"
	case "rally":
		if !v.Building {
			return "producer_required"
		}
		v.Rally = o.Position
		return "ok"
	case "ability":
		return e.cast(p, selected, o)
	case "deploy", "pack":
		for _, v := range selected {
			if e.role(v) != "launcher" && v.Type != "SA.tank" && v.Type != "SA.mobile_abm" && v.Type != "SA.repair" {
				return "cannot_deploy"
			}
		}
		for _, v := range selected {
			e.changeDeployment(v, o.Kind == "deploy")
		}
		return "ok"
	}
	for _, v := range selected {
		if v.Container != 0 && o.Kind != "unload" {
			return "unit_embarked"
		}
		if v.Building && o.Kind != "unload" {
			return "mobile_unit_required"
		}
		if v.DisabledUntil > e.state.Tick {
			return "unit_disabled"
		}
		if o.Queued && len(v.Orders) >= 10 {
			return "queue_full"
		}
		switch o.Kind {
		case "attack":
			target := e.entity(o.Target)
			if target == nil || !e.canSeeEntity(player, target) || e.allied(player, target.Owner) {
				return "target_not_visible"
			}
			if !e.canAttack(v, target) {
				return "illegal_target_layer"
			}
		case "force_fire":
			w, ok := e.weapon(v)
			if !ok || (w.Kind != "shell" && w.Kind != "cannon") {
				return "cannot_force_fire"
			}
			if !e.explored(player, o.Position) {
				return "unexplored_target"
			}
		case "gather":
			if e.role(v) != "hauler" {
				return "hauler_required"
			}
			if o.Target != 0 {
				f := e.field(uint32(o.Target))
				if f == nil || !e.explored(player, f.Position) {
					return "unknown_field"
				}
			}
		case "salvage":
			if v.Type != "SY.engineer" && v.Type != "SY.repair" {
				return "salvage_collector_required"
			}
			if crate := e.salvage(o.Target); crate == nil || e.allied(player, crate.Owner) || !e.canSee(player, crate.Position) {
				return "salvage_not_visible"
			}
		case "repair":
			target := e.entity(o.Target)
			if target == nil || target.Owner != player || e.repairRate(v, target) == 0 || v.ID == target.ID {
				return "invalid_repair_target"
			}
		case "capture":
			if e.role(v) != "engineer" || v.TemporaryUntil != 0 {
				return "engineer_required"
			}
			if !e.validCapture(v, o.Target) {
				return "invalid_capture_target"
			}
		case "board":
			target := e.entity(o.Target)
			if !e.canBoard(v, target) || !e.canSeeEntity(player, target) {
				return "invalid_transport"
			}
		case "unload":
			if e.capacity(v) == 0 {
				return "transport_required"
			}
		case "return":
			if e.armor(v) != "air" {
				return "aircraft_required"
			}
		}
	}
	for i, v := range selected {
		copyOrder := o
		copyOrder.Entities = nil
		if len(selected) > 1 && (o.Kind == "move" || o.Kind == "attack_move") {
			copyOrder.Position = e.formationPoint(o.Position, i, len(selected))
		}
		e.assign(v, copyOrder)
	}
	return "ok"
}
func (e *Engine) assign(v *Entity, o Order) {
	if o.Queued && len(v.Orders) > 0 {
		v.Orders = append(v.Orders, o)
		return
	}
	if v.Channel == "sabotage" {
		setCooldown(&v.Cooldowns, "sabotage", e.state.Tick+seconds(10))
	}
	v.Channel = ""
	v.ChannelUntil = 0
	v.Path = nil
	v.NextRouteAt = 0
	v.PathResolved = false
	v.PassUntil = 0
	v.Target = 0
	v.AimUntil = 0
	v.RouteFailures = 0
	v.Blocked = false
	v.LastProgress = e.state.Tick
	v.Orders = []Order{o}
	v.Anchor = v.Position
	v.Stance = "guard"
	if o.Kind == "stop" || o.Kind == "hold" {
		v.Orders = nil
		v.State = "idle"
		if o.Kind == "hold" {
			v.Stance = "hold"
		}
	}
	if o.Kind == "guard" || o.Kind == "aggressive" {
		v.Anchor = o.Position
		v.Stance = o.Kind
	}
	if o.Kind == "gather" {
		v.Field = uint32(o.Target)
		v.Depot = 0
		v.State = "gathering"
	}
	if o.Kind == "move" || o.Kind == "attack_move" || o.Kind == "return" {
		if v.Deployed || v.DeployUntil > 0 {
			e.changeDeployment(v, false)
		}
	}
}
func (e *Engine) formationPoint(pos Vec, index, count int) Vec {
	cols := 1
	for cols*cols < count {
		cols++
	}
	x := int32(index%cols) - int32(cols-1)/2
	y := int32(index/cols) - int32((count-1)/cols)/2
	return Vec{X: clamp(pos.X+x*1800, 1000, e.state.Map.Width*1000-1000), Y: clamp(pos.Y+y*1800, 1000, e.state.Map.Height*1000-1000)}
}
func (e *Engine) prerequisites(p *Player, refs []string) bool {
	for _, r := range refs {
		if !e.has(p.ID, r) {
			return false
		}
	}
	return true
}
func (e *Engine) countRole(p PlayerID, role string, includeReserved bool) int32 {
	var n int32
	for _, v := range e.state.Entities {
		if v.Owner != p || v.HP <= 0 {
			continue
		}
		if e.role(v) == role {
			n++
		}
		if includeReserved {
			if v.Building && e.role(v) == "supply" && !v.IncludedHauler && role == "hauler" {
				n++
			}
			for _, j := range v.Jobs {
				if j.Started {
					u, ok := e.catalog.Unit(j.Type)
					if ok && u.Role == role {
						n++
					}
				}
			}
		}
	}
	return n
}
func (e *Engine) startBuilding(p *Player, rig *Entity, o Order) string {
	if e.role(rig) != "rig" || rig.Container != 0 {
		return "rig_required"
	}
	b, ok := e.catalog.Building(o.Type)
	if !ok || strings.HasPrefix(o.Type, "map.") || b.Faction != "" && b.Faction != p.Faction {
		return "unknown_building"
	}
	if !e.prerequisites(p, b.Prerequisites) {
		return "missing_prerequisite"
	}
	if p.Credits < b.Cost {
		return "insufficient_credits"
	}
	var structures, defenses int32
	for _, v := range e.state.Entities {
		if v.Owner == p.ID && v.Building && v.HP > 0 {
			structures++
			d, _ := e.catalog.Building(v.Type)
			if d.Defense {
				defenses++
			}
		}
	}
	if structures >= 60 {
		return "structure_cap"
	}
	if b.Defense && defenses >= 16 {
		return "defense_cap"
	}
	if b.Role == "strategic" && e.countRole(p.ID, "strategic", true) >= 1 {
		return "strategic_limit"
	}
	if b.Role == "safehouse" && e.countRole(p.ID, "safehouse", true) >= 3 {
		return "safehouse_limit"
	}
	if b.Role == "supply" && e.countRole(p.ID, "hauler", true) >= 8 {
		return "hauler_limit"
	}
	inRadius := b.Role == "outpost" || b.Role == "hq" && !e.has(p.ID, "hq")
	if !inRadius {
		for _, v := range e.state.Entities {
			if v.Owner == p.ID && v.Complete && v.HP > 0 && (e.role(v) == "hq" || e.role(v) == "outpost") && distance(v.Position, o.Position) <= 14000 {
				inRadius = true
				break
			}
		}
	}
	if !inRadius {
		return "outside_build_radius"
	}
	if code := e.validPlacement(p.ID, o.Position, b.Width, b.Height); code != "ok" {
		return code
	}
	p.Credits -= b.Cost
	p.Spent += b.Cost
	foundation := e.spawn(b.ID, p.ID, o.Position, false, b.Cost)
	foundation.Builder = rig.ID
	e.assign(rig, Order{Kind: "build", Target: foundation.ID, Position: o.Position})
	e.emit("foundation_placed", p.ID, foundation.ID, o.Position, "visible", 0)
	return "ok"
}
func (e *Engine) enqueue(p *Player, v *Entity, o Order) string {
	if !v.Building || !v.Active(e.state.Tick) {
		return "producer_disabled"
	}
	if len(v.Jobs) >= 6 {
		return "queue_full"
	}
	role := e.role(v)
	if o.Kind == "research" {
		u, ok := e.catalog.Upgrade(o.Type)
		if !ok || u.Producer != role || u.Faction != "" && u.Faction != p.Faction {
			return "wrong_research_producer"
		}
		if p.Tier < u.Tier {
			return "missing_tier"
		}
		if p.HasUpgrade(u.ID) {
			return "already_researched"
		}
		for _, other := range e.state.Entities {
			if other.Owner == p.ID {
				for _, j := range other.Jobs {
					if j.Type == u.ID {
						return "already_queued"
					}
				}
			}
		}
		v.Jobs = append(v.Jobs, Job{Type: u.ID, Research: true, Required: u.BuildTicks * 2})
		return "ok"
	}
	u, ok := e.catalog.Unit(o.Type)
	if !ok || u.Faction != p.Faction {
		return "unknown_unit"
	}
	emergency := u.Role == "rig" && role == "factory" && !e.has(p.ID, "hq")
	if u.Producer != role && !emergency {
		return "wrong_producer"
	}
	if p.Tier < u.Tier {
		return "missing_tier"
	}
	v.Jobs = append(v.Jobs, Job{Type: u.ID, Required: u.BuildTicks * 2, Emergency: emergency})
	if emergency {
		v.Jobs[len(v.Jobs)-1].Required = 1200
	}
	return "ok"
}
func (e *Engine) cancel(p *Player, v *Entity, index int32) string {
	if v.Building && !v.Complete {
		b, _ := e.catalog.Building(v.Type)
		remaining := int64(b.BuildTicks*2 - v.Work)
		refund := v.Paid * 3 * remaining / (4 * int64(b.BuildTicks*2))
		p.Credits += refund
		v.HP = 0
		v.Contributions = nil
		return "ok"
	}
	if int(index) >= len(v.Jobs) {
		return "job_not_found"
	}
	j := v.Jobs[index]
	if j.Started && j.Required > 0 {
		p.Credits += j.Paid * 3 * int64(j.Required-j.Work) / (4 * int64(j.Required))
	}
	v.Jobs = append(v.Jobs[:index], v.Jobs[index+1:]...)
	e.recalculate()
	return "ok"
}
