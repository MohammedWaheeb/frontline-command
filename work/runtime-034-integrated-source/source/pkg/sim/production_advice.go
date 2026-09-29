package sim

// ProductionStatus is a single independent menu option at the current tick.
// Code describes queue admission or location-independent construction checks.
// WaitsFor describes an unpaid job's start condition; it never forbids queueing.
// "indeterminate" construction still needs actual site/visibility validation.
type ProductionStatus struct {
	Kind     string `json:"kind"`
	Type     string `json:"type"`
	Code     string `json:"code"`
	WaitsFor string `json:"waits_for,omitempty"`
}

// Shared by real enqueueing and read-only production-menu advice.
func (e *Engine) productionJob(p *Player, v *Entity, o Order) (Job, string) {
	if !v.Building || !v.Active(e.state.Tick) {
		return Job{}, "producer_disabled"
	}
	if len(v.Jobs) >= 6 {
		return Job{}, "queue_full"
	}
	role := e.role(v)
	if o.Kind == "research" {
		u, ok := e.catalog.Upgrade(o.Type)
		if !ok || u.Producer != role || u.Faction != "" && u.Faction != p.Faction {
			return Job{}, "wrong_research_producer"
		}
		if p.Tier < u.Tier {
			return Job{}, "missing_tier"
		}
		if p.HasUpgrade(u.ID) {
			return Job{}, "already_researched"
		}
		for _, other := range e.state.Entities {
			if other.Owner == p.ID {
				for _, job := range other.Jobs {
					if job.Type == u.ID {
						return Job{}, "already_queued"
					}
				}
			}
		}
		return Job{Type: u.ID, Research: true, Required: u.BuildTicks * 2}, "ok"
	}
	u, ok := e.catalog.Unit(o.Type)
	if !ok || u.Faction != p.Faction {
		return Job{}, "unknown_unit"
	}
	emergency := u.Role == "rig" && role == "factory" && !e.has(p.ID, "hq")
	if u.Producer != role && !emergency {
		return Job{}, "wrong_producer"
	}
	if p.Tier < u.Tier {
		return Job{}, "missing_tier"
	}
	job := Job{Type: u.ID, Required: u.BuildTicks * 2, Emergency: emergency}
	if emergency {
		job.Required = 1200
	}
	return job, "ok"
}

// Allocation requirements for a job at the head of a production queue. It reads
// only this player's units, credits and reservations, and never takes a slot.
func (e *Engine) productionAllocation(p *Player, j *Job) (cost int64, supply int32, service ID, code string) {
	if j.Research {
		u, _ := e.catalog.Upgrade(j.Type)
		cost = u.Cost
		if p.HasUpgrade(u.ID) {
			return 0, 0, 0, "already_researched"
		}
	} else {
		u, _ := e.catalog.Unit(j.Type)
		cost, supply = u.Cost, u.Supply
		if j.Emergency {
			cost = 1200000
		}
		if p.Supply+p.ReservedSupply+supply > 100 {
			return 0, 0, 0, "supply_blocked"
		}
		for role, limit := range map[string]int32{"rig": 4, "hauler": 8, "elite": 1} {
			if u.Role == role && e.countRole(p.ID, role, true) >= limit {
				return 0, 0, 0, role + "_limit"
			}
		}
		if u.Armor == "air" {
			service = e.freeService(p.ID)
			if service == 0 {
				return 0, 0, 0, "service_full"
			}
		}
	}
	if p.Credits < cost {
		return 0, 0, 0, "insufficient_credits"
	}
	return cost, supply, service, "ok"
}

func (e *Engine) productionStatuses(p *Player, v *Entity, options EntityAffordance) []ProductionStatus {
	result := []ProductionStatus{}
	for _, typ := range options.Builds {
		_, code := e.buildingCatalogRequirements(p, v, typ)
		if code == "ok" {
			code = "indeterminate"
		}
		result = append(result, ProductionStatus{Kind: "build", Type: typ, Code: code})
	}
	for _, group := range []struct {
		kind  string
		types []string
	}{{"train", options.Trains}, {"research", options.Research}} {
		for _, typ := range group.types {
			job, code := e.productionJob(p, v, Order{Kind: group.kind, Type: typ})
			status := ProductionStatus{Kind: group.kind, Type: typ, Code: code}
			if code == "ok" {
				switch {
				case len(v.Jobs) > 0:
					status.WaitsFor = "queued"
				case !e.jobReady(p, v, &job):
					status.WaitsFor = "prerequisite_lost"
				default:
					_, _, _, waiting := e.productionAllocation(p, &job)
					if waiting != "ok" {
						status.WaitsFor = waiting
					}
				}
			}
			result = append(result, status)
		}
	}
	return result
}
