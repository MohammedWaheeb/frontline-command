package sim

import "frontlinecommand/pkg/content"

// aiCapacityBuild is discretionary skirmish growth, below essential recovery
// and expansion in the caller's priority order. It makes no reservations and
// spends nothing: the returned type still needs ordinary placement and Build.
// The income ledger proves some actual earnings, rather than treating starting
// capital as sustained income; it is not an estimate of future income rate.
func (e *Engine) aiCapacityBuild(p *Player, own []EntityView, counts map[string]int32, plannedSupply int32, budget int64) string {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || p.AI != "normal" && p.AI != "hard" || plannedSupply > 88 {
		return ""
	}
	minimumSupply, income, reserve := int32(20), int64(1200000), int64(2500000)
	if p.AI == "hard" {
		minimumSupply, income, reserve = 14, 600000, 1500000
	}
	if plannedSupply < minimumSupply || p.Income < income {
		return ""
	}
	active := map[string]int32{}
	var rig *Entity
	factoryBusy := false
	for _, observed := range own {
		if observed.Owner != p.ID {
			continue
		}
		v := e.entity(observed.ID)
		if v == nil || v.Owner != p.ID || v.HP <= 0 {
			continue
		}
		// Any paid foundation already has a claim on builder time and power.
		if v.Building && !v.Complete {
			return ""
		}
		if !v.Active(e.Tick()) || v.Channel != "" {
			continue
		}
		role := e.role(v)
		active[role]++
		if role == "rig" && len(v.Orders) == 0 && rig == nil {
			rig = v
		}
		if role == "factory" && len(v.Jobs) > 0 {
			job := v.Jobs[0]
			u, ok := e.catalog.Unit(job.Type)
			if ok && !job.Research && !job.Emergency && job.Started && job.Paid > 0 && job.Work > 0 && u.Producer == "factory" && u.Role != "rig" && e.jobReady(p, v, &job) {
				factoryBusy = true
			}
		}
	}
	if rig == nil || active["hq"] == 0 || active["supply"] == 0 || active["hauler"] < 2 || active["barracks"] == 0 || active["factory"] == 0 {
		return ""
	}
	useful := func(typ string) bool {
		b, ok := e.buildingRule(typ)
		if !ok || budget < policy.CapacityCredits || budget < b.Cost+reserve || e.aiPowerMargin(p, own) < b.PowerDemand {
			return false
		}
		_, code := e.buildingCatalogRequirements(p, rig, typ)
		return code == "ok"
	}
	// Full compatible slots are utilization too: zero margin, not only a lost
	// home with negative margin, justifies a second paid air producer. Syria's
	// ordinary plan only uses scout drones, so more scouting slots are needless.
	air := content.AirProducer(p.Faction)
	if b, ok := e.buildingRule(air); ok && p.Faction != "SY" && counts[b.Role] == 1 && active[b.Role] == 1 && e.aiCommittedAirSupply(own) < 28 && e.aiAirProductionMargin(own, b.Role) == 0 && useful(air) {
		return air
	}
	if counts["factory"] > 0 && counts["factory"] < policy.MaxFactories && active["factory"] == counts["factory"] && factoryBusy && useful("factory") {
		return "factory"
	}
	return ""
}
