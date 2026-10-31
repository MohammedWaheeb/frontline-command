package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func TestAIPolicyDifficultyChangesCommitmentAndInvestment(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	policies := make([]aiPolicy, 0, 3)
	for _, difficulty := range []string{"easy", "normal", "hard"} {
		p.AI = difficulty
		policies = append(policies, e.aiSkirmishPolicy(p))
	}
	easy, normal, hard := policies[0], policies[1], policies[2]
	if !easy.Enabled || !normal.Enabled || !hard.Enabled || easy.WavePower >= normal.WavePower || normal.WavePower >= hard.WavePower || easy.MinWaveUnits >= normal.MinWaveUnits || normal.MinWaveUnits >= hard.MinWaveUnits {
		t.Fatal("difficulty does not change army commitment", policies)
	}
	if easy.FirstAttackTick <= normal.FirstAttackTick || normal.FirstAttackTick <= hard.FirstAttackTick || easy.RegroupTicks <= normal.RegroupTicks || normal.RegroupTicks <= hard.RegroupTicks {
		t.Fatal("difficulty does not change pressure timing", policies)
	}
	if easy.AllowHarassment || !hard.AllowHarassment || easy.AllowStrategic || easy.AllowTransport || easy.MaxFactories != 1 || normal.MaxFactories != 2 || hard.CapacityCredits >= normal.CapacityCredits || hard.RetreatPercent <= normal.RetreatPercent {
		t.Fatal("difficulty does not change tactical/investment horizon", policies)
	}
}

func TestAIPolicyDelaysTechnologyAndAvoidsUnusedEasyInfrastructure(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "easy"
	e.state.Tick = seconds(299)
	if e.aiPolicyTechReady(p) || e.aiPolicyInfrastructureAllowed(p, "tech") || e.aiPolicyInfrastructureAllowed(p, "strategic") || e.aiPolicyInfrastructureAllowed(p, "SY.safehouse") {
		t.Fatal("Easy bought delayed/unused infrastructure")
	}
	for _, role := range []string{"hq", "power", "supply", "barracks", "factory", "radar"} {
		if !e.aiPolicyInfrastructureAllowed(p, role) {
			t.Fatal("essential logistics delayed", role)
		}
	}
	e.state.Tick = seconds(300)
	if !e.aiPolicyTechReady(p) || !e.aiPolicyInfrastructureAllowed(p, "tech") {
		t.Fatal("Easy never unlocks ordinary technology")
	}
	for _, difficulty := range []string{"normal", "hard"} {
		p.AI = difficulty
		if !e.aiPolicyInfrastructureAllowed(p, "strategic") || !e.aiPolicyInfrastructureAllowed(p, "SY.safehouse") {
			t.Fatal("capable difficulty lost useful infrastructure", difficulty)
		}
	}
}

func TestAIPolicyAuthoredMissionKeepsLegacyChoices(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "easy"
	e.state.Mission = &MissionState{}
	if e.aiSkirmishPolicy(p).Enabled || !e.aiPolicyTechReady(p) || !e.aiPolicyInfrastructureAllowed(p, "strategic") || e.aiPolicyAALimit(p, 12) != 4 {
		t.Fatal("new skirmish intentions leaked into authored mission")
	}
}

func TestAIPolicyEasyFullPlannerSkipsUnusedInfrastructure(t *testing.T) {
	for _, spec := range []struct {
		faction, normalBuild string
		strategicPresent     bool
	}{
		{"US", "strategic", false},
		{"IR", "strategic", false},
		{"SY", "strategic", false},
		{"SA", "strategic", false},
		{"SY", "SY.safehouse", true},
	} {
		t.Run(spec.faction+"/"+spec.normalBuild, func(t *testing.T) {
			// Declared complete checkpoint infrastructure isolates optional
			// construction intentions; this is not a paid normal-start trace.
			e := aiBuildOrderFixture(t, spec.faction)
			baseInfrastructure(e, 1)
			for i := int32(0); i < 5; i++ {
				e.spawn("power", 1, Vec{X: 4000 + i*5000, Y: 42000}, true, 0)
			}
			e.spawn("depot", 1, Vec{X: 12000, Y: 30000}, true, 0)
			e.spawn("abm", 1, Vec{X: 21000, Y: 30000}, true, 0)
			e.spawn(content.AirProducer(spec.faction), 1, Vec{X: 42000, Y: 20000}, true, 0)
			for i := int32(0); i < 2; i++ {
				e.spawn(spec.faction+".hauler", 1, Vec{X: 16000 + i*2000, Y: 10000}, true, 0)
			}
			e.spawn(spec.faction+".recon", 1, Vec{X: 17000, Y: 8000}, true, 0)
			if spec.faction == "US" {
				// The Normal positive control must also meet its ordinary
				// ground-screen policy before optional infrastructure is useful.
				for i := int32(0); i < 6; i++ {
					e.spawn("US.rifle", 1, Vec{X: 12000 + i*1000, Y: 14000}, true, 0)
				}
			}
			if spec.strategicPresent {
				e.spawn("strategic", 1, Vec{X: 34000, Y: 34000}, true, 0)
			}
			p := e.player(1)
			p.AI, p.Credits = "easy", 30000000
			e.state.Tick = seconds(400)
			e.recalculate()
			e.updateFog()
			if p.Tier != 3 || p.LowPower() {
				t.Fatal("checkpoint needs rich, powered tier-three construction")
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			normal, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			normal.player(1).AI = "normal"
			e.updateAI()
			for _, order := range aiQualityCommitmentsPending(e) {
				if order.Kind == "build" && (order.Type == "strategic" || order.Type == "SY.safehouse") {
					t.Fatal("Easy full planner bought an unusable feature", order)
				}
			}
			// Positive control proves all earlier ladder goals and ordinary
			// placement/prerequisites leave this optional branch reachable.
			normal.updateAI()
			found := false
			for _, order := range aiQualityCommitmentsPending(normal) {
				found = found || order.Kind == "build" && order.Type == spec.normalBuild
			}
			if !found {
				t.Fatal("normal control did not reach optional infrastructure", spec.normalBuild, aiQualityCommitmentsPending(normal))
			}
		})
	}
}

func TestAIPolicyHardCounterScaleAndRestore(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Controller = "hard", "ai"
	if e.aiPolicyAALimit(p, 12) != 8 || e.aiPolicyAALimit(p, 1) != 1 || e.aiPolicyAALimit(p, 0) != 1 {
		t.Fatal("Hard counter budget lacks mixed bounded scaling")
	}
	before := e.Hash()
	policy := e.aiSkirmishPolicy(p)
	if before != e.Hash() {
		t.Fatal("policy selection mutated simulation")
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	if restored.aiSkirmishPolicy(restored.player(1)) != policy || e.Hash() != restored.Hash() {
		t.Fatal("policy differs across save/restore")
	}
}
