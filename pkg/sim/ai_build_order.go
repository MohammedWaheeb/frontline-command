package sim

import "frontlinecommand/pkg/content"

// Construction is planned before unit purchases. Hold optional construction for
// the first ordinary recon intention so a just-completed barracks cannot send
// the US/Iran opening down the factory branch in that same planning cycle.
func (e *Engine) aiFactionOpeningWaitsForScout(p *Player, counts map[string]int32) bool {
	policy := e.aiSkirmishPolicy(p)
	return policy.Enabled && p.Tier < 3 && (p.Faction == "US" || p.Faction == "IR") &&
		counts["recon"] == 0 && counts["factory"] == 0 && counts["barracks"] > 0 &&
		(p.AI != "easy" || e.Tick() >= policy.TechAfter)
}

// Keep the first air purchase affordable before saving for a factory. One
// actual or queued aircraft is enough to release the hold; this does not wait
// for a perfect sortie or grant production without ordinary money/service.
func (e *Engine) aiFactionOpeningWaitsForAir(p *Player, counts map[string]int32) bool {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || p.Tier >= 3 || counts["factory"] > 0 || p.AI == "easy" && e.Tick() < policy.TechAfter {
		return false
	}
	switch p.Faction {
	case "IR":
		return counts["drone_hub"] > 0 && counts["isr"]+counts["strike"]+counts["shahed"] == 0
	}
	return false
}

// US aviation supplements a usable ground screen instead of consuming the
// first army's capital. Existing aircraft and queued aircraft always permit
// service restoration. Only owned live actors/jobs are inspected; queued ground
// jobs cannot promise a defense before they actually complete. One defender in
// addition to the policy cohort keeps this investment compatible with reserves.
func (e *Engine) aiFactionAirInvestmentReady(p *Player) bool {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || p.Faction != "US" {
		return true
	}
	power, actors, ground := int32(0), int32(0), int32(0)
	reservePower, reserveGround := int32(0), int32(0)
	for _, v := range e.state.Entities {
		if v.Owner != p.ID || v.HP <= 0 {
			continue
		}
		if u, ok := e.catalog.Unit(v.Type); ok && u.Armor == "air" {
			return true
		}
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && !job.Research && u.Armor == "air" {
				return true
			}
		}
		if e.aiWaveCombat(v) && v.Channel == "" && v.DeployUntil == 0 && v.PackingUntil == 0 && v.HP*100 >= v.MaxHP*int64(policy.RetreatPercent) {
			u, _ := e.catalog.Unit(v.Type)
			strength := max(int32(1), int32(int64(u.Supply)*v.HP/v.MaxHP))
			structure := int32(0)
			if w, ok := e.catalog.Weapon(u.Weapon); ok && e.catalog.Multiplier(w.Kind, "structure") > 0 {
				structure = 1
			}
			if actors == 0 {
				reservePower, reserveGround = strength, structure
			}
			power += strength
			ground += structure
			actors++
		}
	}
	// Entity storage is stable ID order, matching the offensive reserve. Guard
	// duties still count as owned defensive capability for capital planning.
	if p.AI != "easy" && actors > policy.MinWaveUnits {
		power -= reservePower
		ground -= reserveGround
		actors--
	}
	return power >= policy.WavePower && actors >= policy.MinWaveUnits && ground >= 2
}

// Essential recovery and the scouting/defense emergency branches must precede
// this discretionary opening. US funds a viable ground screen before aviation;
// Iran commits to radar/drones before a factory. Counts
// include existing foundations/jobs, so no persistent opening stage is needed.
// Tier three has left the opening: rebuilding an absent air arm must not reserve
// the bank ahead of an already charged strategic operation.
func (e *Engine) aiFactionOpeningBuild(p *Player, counts map[string]int32) string {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || p.Tier >= 3 || counts["recon"] == 0 || p.Faction != "US" && p.Faction != "IR" || !e.aiFactionAirInvestmentReady(p) {
		return ""
	}
	// Easy learns an infantry/vehicle opening before its delayed air branch.
	if p.AI == "easy" && e.Tick() < policy.TechAfter {
		return ""
	}
	if counts["radar"] == 0 {
		return "radar"
	}
	if counts["airfield"]+counts["drone_hub"]+counts["workshop_air"] == 0 {
		return content.AirProducer(p.Faction)
	}
	return ""
}

// Compose from owned counts and saved faction/stage only. The caller applies
// observed-threat counter overrides afterwards, then ordinary affordability and
// production admission. Do not replace emergency scouting or engineer recovery.
func (e *Engine) aiFactionProductionRole(p *Player, producer string, counts map[string]int32, fallback string) string {
	if !e.aiSkirmishPolicy(p).Enabled {
		return fallback
	}
	choice := fallback
	switch producer {
	case "barracks":
		if counts["recon"] == 0 {
			return "recon"
		}
		if counts["engineer"] == 0 {
			return "engineer"
		}
		if p.Faction == "SY" {
			cycle := [...]string{"rifle", "portable_aa", "at", "rifle", "rifle", "medic"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
			if choice == "portable_aa" && counts["portable_aa"] >= max(int32(1), min(int32(4), (counts["rifle"]+counts["at"])/3)) || choice == "medic" && counts["medic"] >= 2 {
				choice = "rifle"
			}
		}
	case "factory":
		switch p.Faction {
		case "US":
			cycle := [...]string{"car", "tank", "aa", "tank", "repair", "tank"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
		case "IR":
			cycle := [...]string{"car", "aa", "tank", "artillery", "repair", "artillery"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
			if choice == "artillery" && (p.Tier < 2 || counts["artillery"] >= 3) {
				choice = "tank"
			}
			if p.Tier >= 3 && counts["launcher"] < 2 && p.AIStage%4 == 3 {
				choice = "launcher"
			}
		case "SY":
			cycle := [...]string{"car", "car", "aa", "tank", "repair", "car"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
		case "SA":
			cycle := [...]string{"apc", "tank", "aa", "tank", "repair", "tank"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
		}
		if choice == "repair" && counts["repair"] >= 2 {
			choice = "tank"
		}
	case "airfield", "drone_hub", "workshop_air":
		if p.Faction == "US" {
			cycle := [...]string{"fighter", "strike", "strike", "gunship"}
			choice = cycle[p.AIStage%uint32(len(cycle))]
			if counts["fighter"] == 0 {
				choice = "fighter"
			}
			fighterLimit := int32(1)
			if e.aiKnownAirThreat(p) {
				fighterLimit = 2
			}
			if choice == "fighter" && counts["fighter"] >= fighterLimit {
				choice = "strike"
			}
		} else if p.Faction == "IR" {
			if counts["isr"] == 0 {
				choice = "isr"
			} else if p.Tier >= 2 && p.AIStage%3 == 1 && counts["shahed"] < 2 {
				choice = "shahed"
			} else {
				choice = "strike"
			}
		}
	}
	u, ok := e.catalog.Unit(p.Faction + "." + choice)
	if !ok || u.Producer != producer || u.Tier > p.Tier {
		return fallback
	}
	return choice
}
