package sim

// These descriptions describe ordinary skirmish/multiplayer opponents. Authored
// missions retain their scripted planner, prices and difficulty tuning.
const (
	AIEasyDescription   = "Slower, smaller attack waves; longer regrouping, delayed technology and no harassment. Normal costs and fog of war."
	AINormalDescription = "Balanced attack waves, mixed armies and production growth when resources allow. Normal costs and fog of war."
	AIHardDescription   = "Larger coordinated attack waves, faster regrouping, stronger counters to scouted forces and extra production. Normal costs and fog of war."
)

// aiPolicy changes intentions only. Ordinary admission/execution continues to
// enforce all spending, prerequisite, Supply, service and visibility rules.
// Values are derived from saved public configuration; no new save state or RNG
// is required. An inactive policy preserves authored campaign/co-op behavior.
type aiPolicy struct {
	Enabled         bool
	WavePower       int32
	MinWaveUnits    int32
	ReadyPercent    int32
	FirstAttackTick Tick
	RegroupTicks    Tick
	RetreatPercent  int32
	CounterPercent  int32
	AllowHarassment bool
	AllowStrategic  bool
	AllowTransport  bool
	TechAfter       Tick
	MaxFactories    int32
	CapacityCredits int64
}

func (e *Engine) aiSkirmishPolicy(p *Player) aiPolicy {
	if p == nil || p.AI == "" || e.state.Mission != nil {
		return aiPolicy{}
	}
	policy := aiPolicy{
		Enabled: true, WavePower: 10, MinWaveUnits: 4, ReadyPercent: 70,
		FirstAttackTick: seconds(80), RegroupTicks: seconds(18), RetreatPercent: 35,
		CounterPercent: 65, AllowStrategic: true, AllowTransport: true,
		TechAfter: seconds(100), MaxFactories: 2, CapacityCredits: 4500000,
	}
	switch p.AI {
	case "easy":
		policy.WavePower, policy.MinWaveUnits, policy.ReadyPercent = 6, 3, 60
		policy.FirstAttackTick, policy.RegroupTicks = seconds(160), seconds(35)
		policy.RetreatPercent, policy.CounterPercent = 25, 40
		policy.AllowStrategic, policy.AllowTransport = false, false
		policy.TechAfter, policy.MaxFactories = seconds(300), 1
	case "hard":
		policy.WavePower, policy.MinWaveUnits, policy.ReadyPercent = 14, 5, 75
		policy.FirstAttackTick, policy.RegroupTicks = seconds(55), seconds(10)
		policy.RetreatPercent, policy.CounterPercent = 50, 100
		policy.AllowHarassment = true
		policy.TechAfter, policy.CapacityCredits = seconds(65), 3200000
	}
	return policy
}

// Delay discretionary technology, never essential power/supply/production or
// recovery. Easy still eventually researches generic useful upgrades normally.
func (e *Engine) aiPolicyTechReady(p *Player) bool {
	policy := e.aiSkirmishPolicy(p)
	return !policy.Enabled || e.Tick() >= policy.TechAfter
}

func (e *Engine) aiPolicyInfrastructureAllowed(p *Player, role string) bool {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled {
		return true
	}
	switch role {
	case "tech":
		return e.Tick() >= policy.TechAfter
	case "strategic":
		return policy.AllowStrategic
	case "safehouse", "SY.safehouse":
		return policy.AllowTransport
	}
	return true
}

// Scale only from recently observed armed air, passed by the ordinary planner.
// Retain a ground floor and a bounded investment rather than mirroring all air.
func (e *Engine) aiPolicyAALimit(p *Player, observedAir int32) int32 {
	policy := e.aiSkirmishPolicy(p)
	if !policy.Enabled || p.AI != "hard" {
		return max(int32(1), min(int32(4), observedAir))
	}
	return max(int32(1), min(int32(8), (observedAir*policy.CounterPercent+99)/100))
}
