package sim

import (
	"fmt"
)

func (e *Engine) validateState() error {
	s := &e.state
	if err := e.validateMapObjects(); err != nil {
		return err
	}
	if s.Metadata.MapVersion != s.Map.Version || s.Metadata.Seed == 0 || s.NextID > 1000000 || len(s.Fields) > 128 || len(s.Stations) > 32 || len(s.Zones) > 128 || len(s.Operations) > 128 || len(s.Log) > 200000 || len(s.Events) > 16384 || len(s.Results) > 4096 {
		return fmt.Errorf("invalid saved metadata or collection bounds")
	}
	ids := map[ID]bool{}
	claim := func(id ID) bool {
		if id == 0 || id >= s.NextID || ids[id] {
			return false
		}
		ids[id] = true
		return true
	}
	for _, v := range s.Entities {
		if !claim(v.ID) || v.Cargo < 0 || v.Cargo > 600000 || v.Paid < 0 || v.Paid > 1000000000 || v.Ammo < 0 || v.Ammo > 32 || v.Charges < 0 || v.Charges > 2 || v.Endurance > 2400 || len(v.Passengers) > 3 || len(v.Buffs) > 256 || len(v.Cooldowns) > 32 || len(v.Contributions) > 4096 || v.Experience < 0 || v.Rank > 2 {
			return fmt.Errorf("invalid saved entity state %d", v.ID)
		}
		if v.Building {
			b, _ := e.buildingRule(v.Type)
			if v.Work > b.BuildTicks*2 {
				return fmt.Errorf("construction work out of bounds")
			}
		}
		for _, j := range v.Jobs {
			if j.Required == 0 || j.Required > 216000 || j.Work > j.Required || j.Paid < 0 || j.Supply < 0 || j.Supply > 100 {
				return fmt.Errorf("invalid saved production job")
			}
			if j.Research {
				if _, ok := e.catalog.Upgrade(j.Type); !ok {
					return fmt.Errorf("unknown saved research")
				}
			} else if _, ok := e.catalog.Unit(j.Type); !ok {
				return fmt.Errorf("unknown saved production")
			}
		}
		if v.Container != 0 {
			parent := e.entity(v.Container)
			if parent == nil || parent.Owner != v.Owner || parent.ID == v.ID {
				return fmt.Errorf("invalid passenger container")
			}
			found := false
			for _, id := range parent.Passengers {
				if id == v.ID {
					found = true
				}
			}
			if !found {
				return fmt.Errorf("passenger reservation mismatch")
			}
		}
		seenPassengers := map[ID]bool{}
		for _, id := range v.Passengers {
			passenger := e.entity(id)
			if seenPassengers[id] || passenger == nil || passenger.Container != v.ID {
				return fmt.Errorf("invalid saved passengers")
			}
			seenPassengers[id] = true
		}
		if err := e.validateSavedOrders(v.Orders, false); err != nil {
			return err
		}
		for _, pt := range v.Path {
			if !s.Map.InBounds(pt) {
				return fmt.Errorf("saved path leaves map")
			}
		}
	}
	fields := map[uint32]bool{}
	for _, f := range s.Fields {
		if f == nil || f.ID == 0 || fields[f.ID] || f.Remaining < 0 || f.Remaining > 1000000000 || !s.Map.InBounds(f.Position) || len(f.Queue) > 32 {
			return fmt.Errorf("invalid saved resource field")
		}
		fields[f.ID] = true
		seen := map[ID]bool{}
		for _, id := range f.Queue {
			if seen[id] {
				return fmt.Errorf("duplicate loading reservation")
			}
			seen[id] = true
		}
	}
	for _, v := range s.Stations {
		if v == nil || !claim(v.ID) || !s.Map.InBounds(v.Position) || v.Owner != 0 && e.player(v.Owner) == nil {
			return fmt.Errorf("invalid saved station")
		}
	}
	for _, p := range s.Projectiles {
		if p == nil || !claim(p.ID) || e.player(p.Owner) == nil || !s.Map.InBounds(p.Impact) || !s.Map.InBounds(p.Position) || p.Damage < 0 || p.Damage > 100000000 || p.Splash < 0 || p.Splash > 10000 {
			return fmt.Errorf("invalid saved projectile")
		}
		if _, ok := e.catalog.Weapon(p.Weapon); !ok && p.Weapon != "SKYBREAKER" && p.Weapon != "SATURATION" {
			return fmt.Errorf("unknown projectile weapon")
		}
	}
	for _, p := range s.Players {
		if p.Controller != "human" && p.Controller != "ai" && p.Controller != "script" || p.Controller == "script" && p.AI != "" {
			return fmt.Errorf("invalid saved controller")
		}
		if len(p.AIKnowledge) > 4096 || len(p.AIFields) > 128 || !s.Map.InBounds(p.AIGoal) {
			return fmt.Errorf("invalid AI knowledge bounds")
		}
		seenKnowledge := map[ID]bool{}
		for _, observation := range p.AIKnowledge {
			_, unit := e.catalog.Unit(observation.Type)
			_, building := e.buildingRule(observation.Type)
			if observation.ID == 0 || seenKnowledge[observation.ID] || observation.Seen > s.Tick || !s.Map.InBounds(observation.Position) || e.player(observation.Owner) == nil || (!unit && !building) {
				return fmt.Errorf("invalid AI observation")
			}
			seenKnowledge[observation.ID] = true
		}
		seenFields := map[uint32]bool{}
		for _, field := range p.AIFields {
			if field.ID == 0 || seenFields[field.ID] || !s.Map.InBounds(field.Position) || field.Remaining < 0 || field.Remaining > 1000000000 {
				return fmt.Errorf("invalid AI supply observation")
			}
			seenFields[field.ID] = true
		}
		switch p.AIIntent {
		case "", "scout", "pressure", "defend":
		default:
			return fmt.Errorf("invalid AI intent")
		}
		if p.CommandWindow > s.Tick || p.CommandCount > 160 || p.PingWindow > s.Tick || p.PingCount > 3 {
			return fmt.Errorf("invalid saved command window")
		}
		if p.SalvageTotal < 0 || p.SalvageTotal > 3000000 || len(p.SalvageIncome) > 4096 {
			return fmt.Errorf("invalid salvage ledger")
		}
		for _, entry := range p.SalvageIncome {
			if entry.Tick > s.Tick || entry.Amount < 0 || entry.Amount > 120000 {
				return fmt.Errorf("invalid salvage payment")
			}
		}
		if p.Supply < 0 || p.Supply > 100 || p.ReservedSupply < 0 || p.ReservedSupply > 100 || p.Supply+p.ReservedSupply > 100 || p.RepairReserve < 0 || len(p.Memory) > 4096 || len(p.Cooldowns) > 64 || len(p.Upgrades) > 64 {
			return fmt.Errorf("invalid player reservations")
		}
		for _, u := range p.Upgrades {
			if _, ok := e.catalog.Upgrade(u); !ok {
				return fmt.Errorf("unknown saved upgrade")
			}
		}
		for _, m := range p.Memory {
			if !s.Map.InBounds(m.Position) || m.Seen > s.Tick {
				return fmt.Errorf("invalid fog memory")
			}
		}
	}
	for _, scheduled := range s.Pending {
		if scheduled.Tick <= s.Tick || scheduled.Tick > s.Tick+1 || e.player(scheduled.Player) == nil {
			return fmt.Errorf("invalid scheduled order")
		}
		if err := e.validateSavedOrders(scheduled.Orders, true); err != nil {
			return err
		}
	}
	logged := uint32(0)
	for _, command := range s.Log {
		logged += uint32(len(command.Orders))
	}
	if logged != s.LogOrders || logged > 32768 || s.LogBase > 10000000 {
		return fmt.Errorf("invalid replay window")
	}
	if len(s.Salvage) > 4096 {
		return fmt.Errorf("salvage collection limit")
	}
	for _, crate := range s.Salvage {
		if !claim(crate.ID) || e.player(crate.Owner) == nil || !s.Map.InBounds(crate.Position) || crate.Value < 0 || crate.Value > 120000 || crate.Until > s.Tick+seconds(45) {
			return fmt.Errorf("invalid salvage crate")
		}
	}
	for _, z := range s.Zones {
		if e.player(z.Owner) == nil || !s.Map.InBounds(z.Position) || z.Radius < 0 || z.Radius > 20000 || z.Until < z.Start {
			return fmt.Errorf("invalid saved zone")
		}
		if z.Kind != "scan" && z.Kind != "shieldline" {
			return fmt.Errorf("unknown saved zone")
		}
	}
	for _, o := range s.Operations {
		if e.player(o.Owner) == nil || len(o.Points) > 6 || o.ReservedSupply < 0 || o.ReservedSupply > 12 {
			return fmt.Errorf("invalid saved operation")
		}
		switch o.Kind {
		case "skybreaker":
			if len(o.Points) != 3 {
				return fmt.Errorf("skybreaker needs impact, entry and pass points")
			}
		case "second_volley":
			if len(o.Points) != 2 {
				return fmt.Errorf("volley needs two points")
			}
		case "raid":
			if len(o.Points) != 2 {
				return fmt.Errorf("raid needs two marked exits")
			}
		default:
			return fmt.Errorf("unknown saved operation")
		}
		for _, p := range o.Points {
			if !s.Map.InBounds(p) {
				return fmt.Errorf("operation outside map")
			}
		}
	}
	if s.Mission != nil {
		ms := s.Mission
		if err := ms.Definition.Validate(e.catalog, s.Map); err != nil {
			return err
		}
		if len(ms.Triggers) != len(ms.Definition.Triggers) || len(ms.Objectives) != len(ms.Definition.Objectives) || len(ms.KnownTags) > 4096 {
			return fmt.Errorf("mission progress shape mismatch")
		}
		for i, v := range ms.Triggers {
			if v.ID != ms.Definition.Triggers[i].ID || v.Fired > max(uint32(1), ms.Definition.Triggers[i].Repeat) {
				return fmt.Errorf("invalid mission trigger progress")
			}
		}
		for i, v := range ms.Objectives {
			if v.ID != ms.Definition.Objectives[i].ID {
				return fmt.Errorf("invalid objective progress")
			}
		}
	}
	return nil
}
func (e *Engine) validateSavedOrders(orders []Order, batch bool) error {
	limit := 10
	if batch {
		limit = 32
	}
	if len(orders) > limit {
		return fmt.Errorf("saved order limit")
	}
	for _, o := range orders {
		if !orderKinds[o.Kind] || len(o.Entities) > 64 || len(o.Points) > 6 || len(o.Type) > 80 || o.Index < 0 || o.Index > 1000000 {
			return fmt.Errorf("invalid saved order")
		}
		for _, p := range o.Points {
			if !e.state.Map.InBounds(p) {
				return fmt.Errorf("order outside map")
			}
		}
	}
	return nil
}
