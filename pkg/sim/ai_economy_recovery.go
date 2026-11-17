package sim

import (
	"strconv"
	"strings"
)

// Field retry memory lives in the actor's existing serialized cooldown ledger,
// so saves, hashes and replays include it without a second AI state store.
func aiFieldRetryKey(field uint32) string {
	return "ai_field_retry:" + strconv.FormatUint(uint64(field), 10)
}

// Keep field failures bounded inside the actor's 32-entry save limit. Other
// cooldowns belong to gameplay and are preserved, including expired entries.
// Active retry entries retain insertion order; refreshing a field makes it the
// newest entry, and the oldest retries are evicted first when space is needed.
func aiRememberFailedField(v *Entity, field uint32, now Tick) bool {
	key := aiFieldRetryKey(field)
	gameplay, retries := 0, 0
	for _, c := range v.Cooldowns {
		if !strings.HasPrefix(c.ID, "ai_field_retry:") {
			gameplay++
		} else if c.ID != key && c.Until > now {
			retries++
		}
	}
	limit := min(16, 32-gameplay)
	if limit <= 0 {
		// Defer failover rather than dropping a gameplay cooldown or creating
		// a failure memory that cannot survive a save.
		return false
	}
	drop := max(0, retries-(limit-1))
	retained := v.Cooldowns[:0]
	for _, c := range v.Cooldowns {
		if strings.HasPrefix(c.ID, "ai_field_retry:") {
			if c.ID == key || c.Until <= now {
				continue
			}
			if drop > 0 {
				drop--
				continue
			}
		}
		retained = append(retained, c)
	}
	v.Cooldowns = append(retained, Cooldown{ID: key, Until: now + seconds(60)})
	return true
}

// aiBlockedCollectorOrder changes a failed collection task through ordinary
// Gather. It never changes cargo, stock, path state or resource ownership.
// Authored scenarios retain their tuned collector behavior.
func (e *Engine) aiBlockedCollectorOrder(p *Player, v *Entity) (Order, bool) {
	if e.state.Mission != nil || p == nil || v == nil || v.Owner != p.ID || !v.Active(e.Tick()) || e.role(v) != "hauler" || v.Container != 0 || v.Channel != "" || v.HaulerRetreating || !v.Blocked || e.Tick()-v.StationarySince < seconds(12) || len(v.Orders) != 1 || v.Orders[0].Kind != "gather" || v.Field == 0 {
		return Order{}, false
	}
	// A delivery-route failure needs depot recovery, not a different field.
	if v.Cargo >= 600000 || v.State == "returning_cargo" || v.State == "loading" || v.State == "unloading" || v.State == "no_supply_center" {
		return Order{}, false
	}
	known := e.haulerRoutingFor(v)
	bestID := uint32(0)
	bestScore := int64(1 << 62)
	for _, field := range p.KnownFields {
		if field.ID == v.Field || field.Remaining <= 0 || cooldown(v.Cooldowns, aiFieldRetryKey(field.ID), e.Tick()) || !e.aiCollectorFieldReachable(v, field.Position, known) {
			continue
		}
		score := dist2(v.Position, field.Position)
		if score < bestScore || score == bestScore && field.ID < bestID {
			bestID, bestScore = field.ID, score
		}
	}
	if bestID == 0 {
		return Order{}, false
	}
	// An accepted ordinary failure says nothing about the hidden blocker's
	// identity. Suppress only this actor's failed choice for one minute.
	if !aiRememberFailedField(v, v.Field, e.Tick()) {
		return Order{}, false
	}
	return Order{Kind: "gather", Entities: []ID{v.ID}, Target: ID(bestID)}, true
}

// Match loading contact, rather than accepting a nearby pathfinder fallback
// outside the field. Exact hauler radius and diagonal clearance are already
// represented by the authorized depot-routing components.
func (e *Engine) aiCollectorFieldReachable(v *Entity, field Vec, known *haulerRoutingKnowledge) bool {
	starts := map[uint32]bool{}
	sx, sy := v.Position.X/500, v.Position.Y/500
	for dy := int32(-1); dy <= 1; dy++ {
		for dx := int32(-1); dx <= 1; dx++ {
			point := Vec{X: (sx + dx) * 500, Y: (sy + dy) * 500}
			component := known.component(point)
			if component != 0 && known.engine.navigationBridgeClear(v, point, false) {
				starts[component] = true
			}
		}
	}
	for y := max(int32(0), field.Y-1000) / 500 * 500; y <= field.Y+1000; y += 500 {
		for x := max(int32(0), field.X-1000) / 500 * 500; x <= field.X+1000; x += 500 {
			point := Vec{X: x, Y: y}
			if dist2(point, field) <= 1000*1000 && starts[known.component(point)] {
				return true
			}
		}
	}
	return false
}
