package sim

// These helpers are shared with execution. They describe existing rules;
// projections must never become a second source of gameplay constants.
type interceptionParameters struct {
	radius         int32
	capacity       int32
	required, rate uint32
	interval       Tick
	mobile         bool
}

func (e *Engine) interceptionParameters(v *Entity) (interceptionParameters, bool) {
	p := e.player(v.Owner)
	if p == nil {
		return interceptionParameters{}, false
	}
	if e.role(v) == "abm" {
		rule := interceptionParameters{radius: 14000, capacity: 2, required: 24 * 20 * 2, rate: 2, interval: seconds(1)}
		if p.LowPower() {
			rule.rate = 1
			rule.interval *= 2
		}
		return rule, true
	}
	if v.Type == "SA.mobile_abm" {
		rule := interceptionParameters{radius: 10000, capacity: 1, required: 30 * 20 * 2, rate: 2, interval: seconds(1), mobile: true}
		if p.HasUpgrade("SA.interception") {
			rule.required = 25 * 20 * 2
		}
		return rule, true
	}
	return interceptionParameters{}, false
}

func (e *Engine) sightRange(v *Entity) int32 {
	radius := int32(9000)
	if !v.Building {
		u, _ := e.catalog.Unit(v.Type)
		radius = u.Sight
	}
	if e.state.Map.TileAt(v.Position).Height > 0 {
		radius += 2000
	}
	if e.hasBuff(v, "relay") {
		radius += 3000
	}
	return radius
}

func (e *Engine) detectionRange(v *Entity) int32 {
	radius := int32(3000)
	if !v.Building {
		u, _ := e.catalog.Unit(v.Type)
		radius = max(radius, u.Detection)
	}
	return radius
}

func (e *Engine) buildRange(v *Entity) int32 {
	if v.Complete && v.HP > 0 && (e.role(v) == "hq" || e.role(v) == "outpost") {
		return 14000
	}
	return 0
}

type InterceptionAssignment struct {
	Projectile  ID   `json:"projectile"`
	Impact      Vec  `json:"impact"`
	InterceptAt Tick `json:"intercept_at"`
}

type InterceptionView struct {
	Radius           int32                    `json:"radius"`
	Capacity         int32                    `json:"capacity"`
	Active           bool                     `json:"active"`
	Ready            bool                     `json:"ready"`
	RechargeRequired uint32                   `json:"recharge_required"`
	RechargeRate     uint32                   `json:"recharge_rate"`
	NextChargeTicks  *uint32                  `json:"next_charge_ticks,omitempty"`
	FireReadyAt      Tick                     `json:"fire_ready_at"`
	Assignments      []InterceptionAssignment `json:"assignments"`
}

// Sight and detection are distance upper bounds, not a visibility mask. Ground
// sources additionally need the existing terrain line-of-sight test. All of
// this information is placed only inside the exact owner's private entity.
type EntityRanges struct {
	SightRadius     int32             `json:"sight_radius"`
	DetectionRadius int32             `json:"detection_radius"`
	AirborneSight   bool              `json:"airborne_sight"`
	BuildRadius     int32             `json:"build_radius"`
	Interception    *InterceptionView `json:"interception,omitempty"`
}

func (e *Engine) ownerRanges(v *Entity) *EntityRanges {
	out := &EntityRanges{}
	p := e.player(v.Owner)
	if p == nil {
		return out
	}
	perceives := v.HP > 0 && !p.Defeated && v.Container == 0 && (!v.Building || v.Complete) && !(e.role(v) == "support_plane" && v.DisabledUntil > e.Tick())
	if perceives {
		out.SightRadius, out.DetectionRadius = e.sightRange(v), e.detectionRange(v)
		out.AirborneSight = e.isAircraft(v) && !v.Landed
	}
	if !p.Defeated {
		out.BuildRadius = e.buildRange(v)
	}
	if rule, ok := e.interceptionParameters(v); ok {
		active := v.Active(e.Tick()) && !p.Defeated && (!rule.mobile || v.Deployed)
		defense := &InterceptionView{Radius: rule.radius, Capacity: rule.capacity, Active: active, Ready: active && v.Charges > 0 && e.Tick() >= v.FireAt, RechargeRequired: rule.required, FireReadyAt: v.FireAt}
		if active {
			defense.RechargeRate = rule.rate
			if e.hasBuff(v, "shieldline") {
				defense.RechargeRate *= 2
			}
			if v.Charges < rule.capacity {
				remaining := uint32(0)
				if v.ChargeWork < rule.required {
					remaining = rule.required - v.ChargeWork
				}
				ticks := max(uint32(1), (remaining+defense.RechargeRate-1)/defense.RechargeRate)
				defense.NextChargeTicks = &ticks
			}
		}
		// Only actual assignments to this owned defender; every listed target
		// already has a public interceptable-projectile impact warning. There
		// is no hidden body, route, launcher, or victim in this record.
		for _, projectile := range e.state.Projectiles {
			if projectile.Interceptable && projectile.ReservedBy == v.ID && projectile.InterceptAt > e.Tick() {
				defense.Assignments = append(defense.Assignments, InterceptionAssignment{projectile.ID, projectile.Impact, projectile.InterceptAt})
			}
		}
		out.Interception = defense
	}
	return out
}
