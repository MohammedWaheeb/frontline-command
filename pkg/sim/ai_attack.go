package sim

import (
	"strconv"
	"strings"
)

// Wave bookkeeping uses bounded, namespaced strategy cooldowns already included
// in save/hash: one player entry records the original cohort size and deadline,
// and one cooldown per owned member records that same deadline. No hidden actor
// or new unsaved planner cache is consulted. Expired cohort records are replaced.
const aiWavePrefix = "ai_wave_size:"

func (e *Engine) aiWaveCombat(v *Entity) bool {
	if v == nil || v.Building || v.Container != 0 || !v.Active(e.Tick()) || e.isAircraft(v) {
		return false
	}
	u, ok := e.catalog.Unit(v.Type)
	if !ok || u.Weapon == "" || u.Role == "recon" || u.Role == "engineer" || u.Role == "launcher" {
		return false
	}
	w, ok := e.catalog.Weapon(u.Weapon)
	return ok && w.Kind != "tactical"
}

func (e *Engine) aiWaveRally(p *Player, own []EntityView, goal Vec) Vec {
	center := Vec{}
	foundHQ := false
	for _, observed := range own {
		if observed.Type == "hq" {
			center = observed.Position
			foundHQ = true
			break
		}
	}
	if !foundHQ {
		for _, observed := range own {
			if e.aiWaveCombat(e.entity(observed.ID)) {
				center = observed.Position
				break
			}
		}
	}
	terrain := e.aiScoutTerrainKnowledge(p)
	component := terrain.component(center)
	var representative *Entity
	for _, observed := range own {
		v := e.entity(observed.ID)
		if e.aiWaveCombat(v) && (representative == nil || e.radius(v) > e.radius(representative)) {
			representative = v
		}
	}
	var routes *haulerRoutingKnowledge
	starts := map[uint32]bool{}
	if representative != nil {
		routes = e.haulerRoutingFor(representative)
		origin := Vec{X: representative.Position.X / 500 * 500, Y: representative.Position.Y / 500 * 500}
		for dy := int32(-500); dy <= 500; dy += 500 {
			for dx := int32(-500); dx <= 500; dx += 500 {
				point := Vec{X: origin.X + dx, Y: origin.Y + dy}
				if c := routes.component(point); c != 0 && routes.engine.navigationBridgeClear(representative, point, false) {
					starts[c] = true
				}
			}
		}
	}
	// Prefer a short forward rendezvous connected to an owned combat actor
	// using authorized terrain/building geometry and its actual clearance.
	// Dynamic occupancy remains an ordinary route-execution responsibility.
	best, score := center, int64(1<<62)
	for dy := int32(-7000); dy <= 7000; dy += 1000 {
		for dx := int32(-7000); dx <= 7000; dx += 1000 {
			point := Vec{X: center.X + dx + 500, Y: center.Y + dy + 500}
			if component == 0 || terrain.component(point) != component || distance(center, point) < 4000 || distance(center, point) > 7500 || routes != nil && !starts[routes.component(point)] {
				continue
			}
			d := dist2(point, goal)
			if d < score {
				best, score = point, d
			}
		}
	}
	return best
}

// Preserve explicit/working duties when coordinating an existing cohort too.
func (e *Engine) aiWaveCanRedirect(v *Entity) bool {
	return v.Channel == "" && !v.Deployed && v.DeployUntil == 0 && v.PackingUntil == 0 && v.Stance != "hold" &&
		(!v.EverDealt || e.Tick()-v.LastDealt >= seconds(3)) &&
		(len(v.Orders) == 0 || len(v.Orders) == 1 && !v.Orders[0].Queued && (v.Orders[0].Kind == "attack_move" || v.Orders[0].Kind == "move" && cooldown(v.Cooldowns, "ai_wave_staging", e.Tick())))
}

// Cohort membership starts only after ordinary Submit admission succeeds. A
// rejected global backlog or saturated own command window cannot turn staging
// reinforcements into singleton members of an assault that never launched.
func (e *Engine) aiCommitWaveRelease(p *Player, ids []ID) {
	if !e.aiSkirmishPolicy(p).Enabled || len(ids) == 0 {
		return
	}
	until := e.Tick() + seconds(120)
	keep := p.Cooldowns[:0]
	for _, c := range p.Cooldowns {
		if !strings.HasPrefix(c.ID, aiWavePrefix) {
			keep = append(keep, c)
		}
	}
	p.Cooldowns = append(keep, Cooldown{ID: aiWavePrefix + strconv.Itoa(len(ids)), Until: until})
	setCooldown(&p.Cooldowns, "ai_wave_stage", 0)
	for _, id := range ids {
		if v := e.entity(id); v != nil && v.Owner == p.ID {
			setCooldown(&v.Cooldowns, "ai_wave_member", until)
			setCooldown(&v.Cooldowns, "ai_wave_staging", 0)
		}
	}
}

// aiWaveOrders stages only uncommitted combat actors. Active members retain
// their sortie; newly produced actors rendezvous for the next cohort. Earlier
// recovery/ability intentions win normal actor arbitration and are excluded.
func (e *Engine) aiWaveOrders(p *Player, own []EntityView, goal Vec, haveGoal bool, prior []Order) ([]Order, map[ID]bool) {
	claimed := map[ID]bool{}
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || !haveGoal {
		return nil, claimed
	}
	haveCombat := false
	for _, observed := range own {
		if e.aiWaveCombat(e.entity(observed.ID)) {
			haveCombat = true
			break
		}
	}
	if !haveCombat {
		return nil, claimed
	}
	rally := e.aiWaveRally(p, own, goal)
	used := map[ID]bool{}
	for _, order := range prior {
		for _, id := range order.Entities {
			used[id] = true
		}
	}
	original, deadline := 0, Tick(0)
	for _, c := range p.Cooldowns {
		if strings.HasPrefix(c.ID, aiWavePrefix) && c.Until > e.Tick() {
			original, _ = strconv.Atoi(strings.TrimPrefix(c.ID, aiWavePrefix))
			deadline = c.Until
			break
		}
	}
	members, staged := []*Entity{}, []*Entity{}
	for _, observed := range own {
		v := e.entity(observed.ID)
		if !e.aiWaveCombat(v) {
			continue
		}
		claimed[v.ID] = true
		if cooldown(v.Cooldowns, "ai_wave_member", e.Tick()) && deadline > 0 {
			members = append(members, v)
			continue
		}
		if used[v.ID] || v.Channel != "" || v.Deployed || v.DeployUntil > 0 || v.PackingUntil > 0 || v.HP*100 < v.MaxHP*int64(policy.RetreatPercent) || v.Stance == "hold" || v.EverDealt && e.Tick()-v.LastDealt < seconds(3) {
			continue
		}
		if len(v.Orders) > 1 || len(v.Orders) == 1 && (v.Orders[0].Queued || v.Orders[0].Kind != "move" && v.Orders[0].Kind != "attack_move") {
			continue
		}
		// The cohort deadline frees the next wave; it is not a withdrawal
		// order. Let a surviving paid assault finish its ordinary attack-move
		// instead of routing it across the map back to the friendly rally.
		// Immediate defense below can still redirect it, and prior recovery,
		// actual cohort losses and working/explicit duties keep their priority.
		if len(v.Orders) == 1 && v.Orders[0].Kind == "attack_move" {
			continuing := false
			for _, c := range v.Cooldowns {
				if c.ID == "ai_wave_member" && c.Until > 0 && c.Until <= e.Tick() {
					continuing = true
					break
				}
			}
			if continuing {
				continue
			}
		}
		if len(v.Orders) == 1 && v.Orders[0].Kind == "move" && !cooldown(v.Cooldowns, "ai_wave_staging", e.Tick()) {
			producerRally := false
			for _, source := range own {
				if source.Private != nil && source.Complete && source.Private.Rally == v.Orders[0].Position {
					u, _ := e.catalog.Unit(v.Type)
					if b, ok := e.buildingRule(source.Type); ok && b.Role == u.Producer {
						producerRally = true
						break
					}
				}
			}
			if !producerRally {
				continue
			}
		}
		staged = append(staged, v)
	}
	orders := []Order{}
	if original > 0 && len(members)*2 < original {
		setCooldown(&p.Cooldowns, "ai_wave_regroup", e.Tick()+policy.RegroupTicks)
		for _, v := range members {
			setCooldown(&v.Cooldowns, "ai_wave_member", 0)
			if !used[v.ID] && p.AIIntent != "defend" && e.aiWaveCanRedirect(v) && v.HP*100 >= v.MaxHP*int64(policy.RetreatPercent) {
				setCooldown(&v.Cooldowns, "ai_wave_staging", e.Tick()+seconds(180))
				orders = append(orders, Order{Kind: "move", Entities: []ID{v.ID}, Position: rally})
			}
		}
		for i := range p.Cooldowns {
			if strings.HasPrefix(p.Cooldowns[i].ID, aiWavePrefix) {
				p.Cooldowns[i].Until = 0
			}
		}
		members = nil
	}
	// Immediate public defense bypasses the offensive readiness gate.
	if p.AIIntent == "defend" {
		for _, observed := range own {
			v := e.entity(observed.ID)
			if claimed[v.ID] && !used[v.ID] && e.aiWaveCanRedirect(v) && v.HP*100 >= v.MaxHP*int64(policy.RetreatPercent) && (len(v.Orders) == 0 || len(v.Orders) == 1 && (v.Orders[0].Kind == "attack_move" || cooldown(v.Cooldowns, "ai_wave_staging", e.Tick())) && distance(v.Orders[0].Position, goal) > 4000) {
				orders = append(orders, Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal})
			}
		}
		return orders, claimed
	}
	for _, v := range members {
		if !used[v.ID] && e.aiWaveCanRedirect(v) && len(v.Orders) == 0 && v.HP*100 >= v.MaxHP*int64(policy.RetreatPercent) {
			orders = append(orders, Order{Kind: "attack_move", Entities: []ID{v.ID}, Position: goal})
		}
	}
	// Keep one local reserve on Normal/Hard once a useful cohort exists.
	if p.AI != "easy" && len(staged) > int(policy.MinWaveUnits) {
		staged = staged[1:]
	}
	power, ready, ground := int32(0), 0, 0
	for _, v := range staged {
		u, _ := e.catalog.Unit(v.Type)
		power += max(int32(1), int32(int64(u.Supply)*v.HP/v.MaxHP))
		if w, ok := e.catalog.Weapon(u.Weapon); ok && e.catalog.Multiplier(w.Kind, "structure") > 0 {
			ground++
		}
		if distance(v.Position, rally) <= 6500 {
			ready++
		}
	}
	stagingUntil := Tick(0)
	for _, c := range p.Cooldowns {
		if c.ID == "ai_wave_stage" {
			stagingUntil = c.Until
		}
	}
	if len(staged) > 0 && stagingUntil == 0 {
		stagingUntil = e.Tick() + seconds(40)
		setCooldown(&p.Cooldowns, "ai_wave_stage", stagingUntil)
	}
	release := ground >= 2 && len(staged) >= int(policy.MinWaveUnits) && power >= policy.WavePower && ready*100 >= len(staged)*int(policy.ReadyPercent) && e.Tick() >= policy.FirstAttackTick && !cooldown(p.Cooldowns, "ai_wave_regroup", e.Tick())
	// A bounded staging deadline relaxes rendezvous, never combat strength.
	if ground >= 2 && stagingUntil > 0 && e.Tick() >= stagingUntil && len(staged) >= int(policy.MinWaveUnits) && power >= policy.WavePower && e.Tick() >= policy.FirstAttackTick && !cooldown(p.Cooldowns, "ai_wave_regroup", e.Tick()) {
		release = true
	}
	groupCount := (len(staged) + 63) / 64
	if policy.AllowHarassment && len(staged) >= 10 {
		groupCount = max(groupCount, 2)
	}
	available := e.aiCommandCapacity(p) - len(prior) - len(orders)
	if release && len(members) == 0 && groupCount <= available {
		// Two simultaneous groups are useful only with enough force for each.
		groups := make([][]ID, groupCount)
		for i, v := range staged {
			groups[i%len(groups)] = append(groups[i%len(groups)], v.ID)
		}
		for i, ids := range groups {
			target := goal
			if i == 1 {
				flank := Vec{X: goal.X + 3000, Y: goal.Y - 3000}
				terrain := e.aiScoutTerrainKnowledge(p)
				if terrain.component(flank) == terrain.component(rally) && terrain.component(flank) != 0 {
					target = flank
				}
			}
			orders = append(orders, Order{Kind: "attack_move", Entities: ids, Position: target})
		}
	} else {
		for _, v := range staged {
			if len(v.Orders) == 0 && distance(v.Position, rally) > 1500 || len(v.Orders) == 1 && (v.Orders[0].Kind == "attack_move" || distance(v.Orders[0].Position, rally) > 1500) {
				setCooldown(&v.Cooldowns, "ai_wave_staging", e.Tick()+seconds(180))
				orders = append(orders, Order{Kind: "move", Entities: []ID{v.ID}, Position: rally})
			}
		}
	}
	return orders, claimed
}
