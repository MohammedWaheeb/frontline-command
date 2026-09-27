package sim

import (
	"frontlinecommand/pkg/content"
	"sort"
)

func (e *Engine) weapon(v *Entity) (content.Weapon, bool) {
	if v.Building {
		b, _ := e.buildingRule(v.Type)
		return e.catalog.Weapon(b.Weapon)
	}
	u, _ := e.catalog.Unit(v.Type)
	return e.catalog.Weapon(u.Weapon)
}
func (e *Engine) firingPlatform(v *Entity) *Entity {
	if v.Container == 0 {
		return v
	}
	parent := e.entity(v.Container)
	if parent != nil && parent.Building && parent.Active(e.state.Tick) && parent.Channel != "transit" && parent.Channel != "conversion" {
		return parent
	}
	return nil
}
func (e *Engine) weaponDistance(v, target *Entity) int32 {
	if platform := e.firingPlatform(v); platform != nil {
		return e.edgeDistance(platform, target)
	}
	return e.edgeDistance(v, target)
}
func (e *Engine) canAttack(a, b *Entity) bool {
	if a == nil || b == nil || e.defeated(a.Owner) || e.defeated(b.Owner) {
		return false
	}
	if e.role(b) == "support_plane" && b.DisabledUntil > e.state.Tick {
		return false
	}
	w, ok := e.weapon(a)
	if !ok || a.HP <= 0 || b.HP <= 0 || b.Container != 0 || e.allied(a.Owner, b.Owner) {
		return false
	}
	if w.Kind == "tactical" {
		return e.armor(b) != "air"
	}
	return e.catalog.Multiplier(w.Kind, e.armor(b)) > 0
}
func (e *Engine) pickTarget(v *Entity) *Entity {
	if len(v.Orders) > 0 && v.Orders[0].Kind == "attack" {
		target := e.entity(v.Orders[0].Target)
		if target != nil && e.canAttack(v, target) && e.canSeeEntity(v.Owner, target) {
			return target
		}
		return nil
	}
	leash := e.combatLeash(v)
	w, _ := e.weapon(v)
	if current := e.entity(v.Target); current != nil && current.Owner != 0 && e.canAttack(v, current) && e.canSeeEntity(v.Owner, current) && (len(v.Orders) > 0 && v.Orders[0].Kind == "attack_move" || distance(v.Anchor, current.Position) <= leash) {
		return current
	}
	var best *Entity
	priority := -1
	score := int64(1 << 62)
	center, searchRadius := v.Anchor, leash+6000
	if len(v.Orders) > 0 && v.Orders[0].Kind == "attack_move" {
		center = v.Position
		searchRadius = w.MaxRange + 6000
	}
	for _, target := range e.nearby(center, searchRadius) {
		if target.Owner == 0 || !e.canAttack(v, target) || !e.canSeeEntity(v.Owner, target) || e.defeated(target.Owner) {
			continue
		}
		if distance(v.Anchor, target.Position) > leash && (len(v.Orders) == 0 || v.Orders[0].Kind != "attack_move") {
			continue
		}
		pr := 0
		if target.Target == v.ID {
			pr = 2
		} else if t := e.entity(target.Target); t != nil && e.allied(v.Owner, t.Owner) {
			pr = 1
		}
		w, _ := e.weapon(v)
		pr = pr*2000 + int(e.catalog.Multiplier(w.Kind, e.armor(target)))
		d := dist2(v.Position, target.Position)
		if pr > priority || pr == priority && (d < score || d == score && (best == nil || target.ID < best.ID)) {
			best = target
			priority = pr
			score = d
		}
	}
	return best
}
func (e *Engine) updateCombat() {
	e.rebuildSpatial()
	for _, v := range e.state.Entities {
		if v.HP <= 0 || !v.Enabled || v.DisabledUntil > e.state.Tick || !v.Complete || e.firingPlatform(v) == nil || v.Channel != "" || v.PackingUntil > e.state.Tick || v.DeployUntil > e.state.Tick || e.defeated(v.Owner) || e.hasBuff(v, "recall") || e.hasBuff(v, "exit_lock") {
			continue
		}
		if e.isAircraft(v) && v.Landed {
			continue
		}
		w, armed := e.weapon(v)
		if !armed {
			continue
		}
		// The second charge of an accepted volley is reserved for its timed shot;
		// automatic targeting must not spend it during the 1.5-second interval.
		if e.pendingVolley(v.ID) {
			continue
		}
		o := Order{}
		if len(v.Orders) > 0 {
			o = v.Orders[0]
		}
		if o.Kind == "build" || o.Kind == "repair" || o.Kind == "capture" || o.Kind == "salvage" || o.Kind == "board" || o.Kind == "return" {
			continue
		}
		mobileFire := e.role(v) == "tank" || e.role(v) == "car" || e.role(v) == "apc" || e.role(v) == "gunship" || e.fixedWing(v)
		if o.Kind == "move" && !mobileFire {
			continue
		}
		e.updateOrderAnchor(v)
		var target *Entity
		point := o.Position
		if o.Kind == "force_fire" {
			if !e.explored(v.Owner, point) {
				continue
			}
		} else {
			target = e.pickTarget(v)
			if target == nil {
				v.Target = 0
				v.AimUntil = 0
				continue
			}
			v.Target = target.ID
			point = target.Position
			v.LastTarget = point
		}
		dist := distance(v.Position, point) - e.radius(v)
		if target != nil {
			dist = e.weaponDistance(v, target)
		}
		if dist > w.MaxRange || dist < w.MinRange {
			v.AimUntil = 0
			if !v.Building && v.Stance != "hold" && o.Kind == "" && w.Kind != "tactical" {
				v.Orders = []Order{{Kind: v.Stance, Position: v.Anchor}}
			}
			continue
		}
		desired := direction(point.X-v.Position.X, point.Y-v.Position.Y)
		if e.armor(v) == "infantry" {
			v.Facing, v.TurretFacing = desired, desired
		} else if e.fixedWing(v) {
			v.TurretFacing = v.Facing
			if abs(angleDifference(v.Facing, desired)) > 35000 {
				v.AimUntil = 0
				continue
			}
		} else {
			v.TurretFacing = turn(v.TurretFacing, desired, 9000)
			if abs(angleDifference(v.TurretFacing, desired)) > 9000 {
				v.AimUntil = 0
				continue
			}
		}
		if w.Kind == "tactical" {
			if !v.Deployed {
				if v.DeployUntil == 0 {
					e.changeDeployment(v, true)
				}
				continue
			}
			if v.Charges <= 0 || !e.canSee(v.Owner, point) {
				continue
			}
		}
		if w.Ammo > 0 && w.Kind != "tactical" && v.Ammo <= 0 {
			e.returnForService(v)
			continue
		}
		burst := v.VolleyLeft > 0 && e.state.Tick >= v.VolleyAt
		if !burst && e.state.Tick < v.FireAt {
			continue
		}
		if !mobileFire && v.Container == 0 && v.Position != v.LastPosition {
			continue
		}
		if v.AimUntil == 0 && !burst {
			windup := w.WindupTicks
			if e.isAircraft(v) && target != nil && e.hasBuff(target, "designated") && e.player(v.Owner).Faction == "US" {
				windup = 3
			}
			v.AimUntil = e.state.Tick + Tick(windup)
			v.State = "aiming"
			continue
		}
		if !burst && e.state.Tick < v.AimUntil {
			continue
		}
		if w.Kind == "tactical" {
			cost := int64(400000)
			if w.ID != "MISSILE" {
				cost = 300000
			}
			p := e.player(v.Owner)
			if p.Credits < cost {
				continue
			}
			p.Credits -= cost
			p.Spent += cost
			e.recordMissionEvent("missile_spent", p.ID, v.ID, cost)
			v.Charges--
			v.RevealedUntil = e.state.Tick + seconds(6)
			v.PublicRevealUntil = e.state.Tick + seconds(6)
		} else if w.Ammo > 0 {
			v.Ammo--
		}
		damage := w.Damage
		if w.Kind != "tactical" {
			p := e.player(v.Owner)
			if p.HasUpgrade("weapons_training") && v.TemporaryUntil == 0 {
				damage = damage * 110 / 100
			}
			if v.Rank == 1 {
				damage = damage * 105 / 100
			} else if v.Rank >= 2 {
				damage = damage * 110 / 100
			}
			if e.ambushReady(v) {
				damage = damage * 120 / 100
				setCooldown(&v.Cooldowns, "ambush", e.state.Tick+seconds(30))
			}
		}
		e.launch(v, target, point, w, damage)
		v.AimUntil = 0
		v.Concealed = false
		v.RevealedUntil = max(v.RevealedUntil, e.state.Tick+seconds(6))
		v.LastDealt = e.state.Tick
		v.EverDealt = true
		v.State = "firing"
		e.removeBuff(v, "disperse")
		if burst {
			v.VolleyLeft--
			v.VolleyAt = e.state.Tick + Tick(w.VolleySpacingTicks)
		} else {
			interval := w.IntervalTicks
			if w.Kind == "tactical" {
				interval = 20
			}
			if v.Building && e.player(v.Owner).LowPower() {
				interval *= 2
			}
			v.FireAt = e.state.Tick + Tick(interval)
			v.VolleyLeft = w.Volley - 1
			v.VolleyAt = e.state.Tick + Tick(w.VolleySpacingTicks)
		}
		if e.isAircraft(v) && v.Ammo == 0 {
			e.returnForService(v)
		}
	}
}
func (e *Engine) launch(v, target *Entity, point Vec, w content.Weapon, amount int64) {
	p := &Projectile{ID: e.newID(), Owner: v.Owner, Shooter: v.ID, Weapon: w.ID, Origin: v.Position, Position: v.Position, Impact: point, Damage: amount, Splash: w.Splash, ImpactAt: e.state.Tick}
	if target != nil && w.Kind != "shell" && w.Kind != "tactical" {
		p.Target = target.ID
	}
	switch w.Kind {
	case "small":
	case "shell":
		p.ImpactAt += seconds(2)
	case "tactical":
		p.ImpactAt += seconds(8)
		p.Interceptable = true
	default:
		p.ImpactAt += Tick(max(1, distance(v.Position, point)*20/12000))
	}
	e.state.Projectiles = append(e.state.Projectiles, p)
	e.emit("weapon_fired", v.Owner, v.ID, v.Position, "visible", 0)
	if p.Interceptable {
		e.emit("missile_warning", v.Owner, 0, point, "all", int64(p.ImpactAt))
	}
}
func (e *Engine) updateProjectiles() {
	for _, v := range e.state.Entities {
		if !v.Active(e.state.Tick) || e.defeated(v.Owner) {
			continue
		}
		fixed := e.role(v) == "abm"
		mobile := v.Type == "SA.mobile_abm" && v.Deployed
		if !fixed && !mobile {
			continue
		}
		if v.Charges <= 0 || e.state.Tick < v.FireAt {
			continue
		}
		coverage := int32(14000)
		if mobile {
			coverage = 10000
		}
		var selected *Projectile
		for _, p := range e.state.Projectiles {
			if !p.Interceptable || p.InterceptAt > 0 || p.ImpactAt > e.state.Tick+seconds(3) || e.allied(v.Owner, p.Owner) || distance(v.Position, p.Impact) > coverage {
				continue
			}
			if selected == nil || p.ImpactAt < selected.ImpactAt || p.ImpactAt == selected.ImpactAt && p.ID < selected.ID {
				selected = p
			}
		}
		if selected != nil {
			selected.ReservedBy = v.ID
			selected.InterceptAt = e.state.Tick + 10
			v.Charges--
			interval := seconds(1)
			if fixed && e.player(v.Owner).LowPower() {
				interval *= 2
			}
			v.FireAt = e.state.Tick + interval
			e.emit("interceptor_fired", v.Owner, v.ID, v.Position, "visible", 0)
		}
	}
	keep := e.state.Projectiles[:0]
	for _, p := range e.state.Projectiles {
		if p.InterceptAt > 0 && e.state.Tick >= p.InterceptAt {
			e.emit("missile_intercepted", p.Owner, 0, p.Impact, "all", 0)
			continue
		}
		if p.Target != 0 {
			if target := e.entity(p.Target); target != nil && target.HP > 0 {
				p.Impact = target.Position
			}
		}
		if e.state.Tick < p.ImpactAt {
			remaining := int32(p.ImpactAt - e.state.Tick)
			p.Position.X += (p.Impact.X - p.Position.X) / max(1, remaining)
			p.Position.Y += (p.Impact.Y - p.Position.Y) / max(1, remaining)
			keep = append(keep, p)
			continue
		}
		w, _ := e.catalog.Weapon(p.Weapon)
		if p.Splash > 0 {
			for _, target := range e.state.Entities {
				if target.HP <= 0 || target.Container != 0 || e.defeated(target.Owner) {
					continue
				}
				d := e.distanceTo(target, p.Impact)
				if d >= p.Splash {
					continue
				}
				amount := e.projectileDamage(p, target, w)
				if d > 500 {
					amount = amount * int64(p.Splash-d) / int64(p.Splash-500)
				}
				if e.allied(p.Owner, target.Owner) {
					amount /= 2
				}
				if amount > 0 {
					e.damages = append(e.damages, damage{target.ID, p.Shooter, p.Owner, amount, w.Kind})
				}
			}
		} else if target := e.entity(p.Target); target != nil && target.HP > 0 && target.Container == 0 && !e.defeated(target.Owner) {
			if w.Kind == "antiair" && e.hasBuff(target, "decoy") {
				e.removeBuff(target, "decoy")
				e.emit("decoy_triggered", target.Owner, target.ID, target.Position, "visible", 0)
			} else {
				amount := e.projectileDamage(p, target, w)
				if amount > 0 {
					e.damages = append(e.damages, damage{target.ID, p.Shooter, p.Owner, amount, w.Kind})
				}
			}
		} else if p.Target == 0 && w.Kind == "cannon" {
			for _, target := range e.state.Entities {
				if target.HP > 0 && target.Container == 0 && !e.defeated(target.Owner) && e.distanceTo(target, p.Impact) < 200 && !e.allied(p.Owner, target.Owner) {
					amount := e.projectileDamage(p, target, w)
					if amount > 0 {
						e.damages = append(e.damages, damage{target.ID, p.Shooter, p.Owner, amount, w.Kind})
						break
					}
				}
			}
		}
		e.emit("impact", p.Owner, 0, p.Impact, "visible", 0)
	}
	e.state.Projectiles = keep
}
func (e *Engine) projectileDamage(p *Projectile, target *Entity, w content.Weapon) int64 {
	armor := e.armor(target)
	amount := p.Damage
	if p.Strategic || w.Kind == "tactical" {
		if armor == "air" {
			return 0
		}
		switch armor {
		case "infantry":
			amount = amount * 30 / 100
		case "light", "heavy":
			if p.Weapon == "SKYBREAKER" {
				amount = amount * 75 / 100
			} else {
				amount = amount * 70 / 100
			}
		}
		return amount
	}
	amount = amount * int64(e.catalog.Multiplier(w.Kind, armor)) / 1000
	if armor == "infantry" && e.state.Map.TileAt(target.Position).Cover() && (w.Kind == "small" || w.Kind == "auto") {
		amount = amount * 75 / 100
	}
	if target.Type == "SA.tank" && target.Deployed && (w.Kind == "small" || w.Kind == "auto" || w.Kind == "cannon" || w.Kind == "antiarmor") {
		amount = amount * 85 / 100
	}
	if e.hasBuff(target, "shieldline") && w.Kind == "airground" && (armor == "light" || armor == "heavy") {
		amount = amount * 80 / 100
	}
	return amount
}
func (e *Engine) resolveDamage() {
	// Attribute actual damage proportionally within each victim's simultaneous
	// batch. Lifetime attribution is capped at max HP to avoid heal/XP farming.
	sort.SliceStable(e.damages, func(i, j int) bool {
		if e.damages[i].Target != e.damages[j].Target {
			return e.damages[i].Target < e.damages[j].Target
		}
		return e.damages[i].Shooter < e.damages[j].Shooter
	})
	for start := 0; start < len(e.damages); {
		end := start + 1
		for end < len(e.damages) && e.damages[end].Target == e.damages[start].Target {
			end++
		}
		v := e.entity(e.damages[start].Target)
		if v == nil || v.HP <= 0 || e.defeated(v.Owner) {
			start = end
			continue
		}
		total := int64(0)
		for _, d := range e.damages[start:end] {
			total += d.Amount
		}
		actual := min64(v.HP, total)
		if actual == v.HP {
			for _, d := range e.damages[start:end] {
				if d.Amount > 0 && !e.allied(d.Owner, v.Owner) {
					v.SalvageEligible = true
				}
			}
		}
		rewardable := min64(actual, max(int64(0), v.MaxHP-v.AttributedDamage))
		for _, d := range e.damages[start:end] {
			if !e.allied(d.Owner, v.Owner) && d.Shooter != 0 {
				portion := rewardable * d.Amount / total
				if portion > 0 {
					found := false
					for i := range v.Contributions {
						if v.Contributions[i].Attacker == d.Shooter {
							v.Contributions[i].Damage += portion
							found = true
							break
						}
					}
					if !found {
						v.Contributions = append(v.Contributions, Contribution{d.Shooter, d.Owner, portion})
					}
					v.AttributedDamage += portion
				}
			}
		}
		v.HP -= actual
		v.LastDamage = e.state.Tick
		v.EverDamaged = true
		v.Concealed = false
		v.RevealedUntil = max(v.RevealedUntil, e.state.Tick+seconds(6))
		if v.Channel != "" && v.Channel != "board" && v.Channel != "unload" {
			e.interruptChannel(v)
		}
		e.emit("under_attack", v.Owner, v.ID, v.Position, "owner", actual)
		start = end
	}
}
func (e *Engine) cleanup() {
	e.expireSalvage()
	for _, v := range e.state.Entities {
		if v.TemporaryUntil > 0 && e.state.Tick >= v.TemporaryUntil {
			v.HP = 0
			v.Contributions = nil
		}
	}
	// Transport loss can kill passengers with lower creation IDs. Resolve all
	// such losses before the single accounting/event pass so actor age cannot
	// omit a passenger's destruction or count it twice.
	for _, v := range e.state.Entities {
		if v.HP <= 0 {
			e.releasePassengers(v)
		}
	}
	for _, v := range e.state.Entities {
		if v.HP > 0 {
			continue
		}
		e.awardExperience(v)
		e.dropSalvage(v)
		if v.Building {
			e.state.NavigationRevision++
		}
		e.destroyMapObject(v)
		e.emit("destroyed", v.Owner, v.ID, v.Position, "visible", 0)
		if p := e.player(v.Owner); p != nil {
			p.Lost += v.Paid
		}
	}
	alive := e.state.Entities[:0]
	for _, v := range e.state.Entities {
		if v.HP > 0 {
			alive = append(alive, v)
		}
	}
	e.state.Entities = alive
}
func (e *Engine) awardExperience(v *Entity) {
	strategicPlane := e.role(v) == "support_plane"
	if v.Building || e.defeated(v.Owner) || v.TemporaryUntil > 0 && !strategicPlane {
		return
	}
	u, _ := e.catalog.Unit(v.Type)
	if u.Weapon == "" && !strategicPlane {
		return
	}
	total := int64(0)
	var killer PlayerID
	var largest int64
	for _, c := range v.Contributions {
		if c.Damage > largest {
			killer, largest = c.Owner, c.Damage
		}
	}
	if p := e.player(killer); p != nil {
		p.Kills++
	}
	for _, c := range v.Contributions {
		total += c.Damage
	}
	if total == 0 {
		return
	}
	for _, c := range v.Contributions {
		a := e.entity(c.Attacker)
		if a == nil || a.HP <= 0 || a.Building || a.TemporaryUntil > 0 || e.defeated(a.Owner) {
			continue
		}
		au, _ := e.catalog.Unit(a.Type)
		if au.Weapon == "" {
			continue
		}
		a.Experience += v.Paid * c.Damage / total
		oldRank := a.Rank
		if a.Experience >= a.Paid*3 && a.Paid > 0 {
			a.Rank = 2
		} else if a.Experience >= a.Paid*3/2 && a.Paid > 0 {
			a.Rank = max(a.Rank, 1)
		}
		if oldRank < 2 && a.Rank == 2 {
			old := a.MaxHP
			a.MaxHP = a.MaxHP * 110 / 100
			a.HP = a.HP * a.MaxHP / old
		}
	}
}
func (e *Engine) removeBuff(v *Entity, kind string) {
	out := v.Buffs[:0]
	for _, b := range v.Buffs {
		if b.Kind != kind {
			out = append(out, b)
		}
	}
	v.Buffs = out
}

func (e *Engine) combatLeash(v *Entity) int32 {
	if v.Building || v.Container != 0 {
		w, _ := e.weapon(v)
		return w.MaxRange + 6000
	}
	if v.Stance == "aggressive" {
		return 12000
	}
	return 6000
}
