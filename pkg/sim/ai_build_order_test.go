package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiBuildOrderFixture(t *testing.T, faction string) *Engine {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "normal"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

func TestAIFactionOpeningCommitsToLegalRadarAirBranch(t *testing.T) {
	for _, faction := range []string{"US", "IR"} {
		t.Run(faction, func(t *testing.T) {
			e := aiBuildOrderFixture(t, faction)
			p := e.player(1)
			counts := map[string]int32{"hq": 1, "power": 1, "supply": 1, "barracks": 1}
			if got := e.aiFactionOpeningBuild(p, counts); got != "" {
				t.Fatal("air commitment preceded recon", got)
			}
			counts["recon"] = 1
			if faction == "US" {
				if got := e.aiFactionOpeningBuild(p, counts); got != "" {
					t.Fatal("air opening consumed the ground screen budget", got)
				}
				for i := int32(0); i < 6; i++ {
					e.spawn("US.rifle", 1, Vec{X: 12000 + i*1000, Y: 14000}, true, 0)
				}
				counts["rifle"] = 6
			}
			if got := e.aiFactionOpeningBuild(p, counts); got != "radar" {
				t.Fatal("opening omitted radar prerequisite", got)
			}
			counts["radar"] = 1
			// A completed radar advances the normal opening to tier two.
			p.Tier = 2
			if got := e.aiFactionOpeningBuild(p, counts); got != content.AirProducer(faction) {
				t.Fatal("opening omitted faction air branch", got)
			}
			b, ok := e.catalog.Building(content.AirProducer(faction))
			if !ok || !reflect.DeepEqual(b.Prerequisites, []string{"radar"}) {
				t.Fatal("opening disagrees with live prerequisites", b)
			}
			counts[b.Role] = 1
			if got := e.aiFactionOpeningBuild(p, counts); got != "" {
				t.Fatal("opening bought redundant air infrastructure", got)
			}
			delete(counts, b.Role)
			p.AI = "easy"
			if got := e.aiFactionOpeningBuild(p, counts); got != "" {
				t.Fatal("Easy omitted delayed technology", got)
			}
			e.state.Tick = seconds(300)
			if got := e.aiFactionOpeningBuild(p, counts); got != content.AirProducer(faction) {
				t.Fatal("Easy permanently lost air identity", got)
			}
		})
	}
}

func TestAIFactionOpeningFirstReconPrecedesFactoryConstruction(t *testing.T) {
	for _, faction := range []string{"US", "IR"} {
		t.Run(faction, func(t *testing.T) {
			e := aiBuildOrderFixture(t, faction)
			for i, typ := range []string{"power", "supply", "barracks"} {
				v := e.spawn(typ, 1, Vec{X: int32(4000 + i*6000), Y: 20000}, true, 0)
				if typ == "supply" {
					v.IncludedHauler = true
				}
			}
			for i := int32(0); i < 2; i++ {
				e.spawn(faction+".hauler", 1, Vec{X: 16000 + i*2000, Y: 10000}, true, 0)
			}
			e.state.Tick = seconds(20)
			e.recalculate()
			e.updateFog()
			e.updateAI()
			scout := false
			for _, order := range aiQualityCommitmentsPending(e) {
				if order.Kind == "build" && order.Type == "factory" {
					t.Fatal("factory construction bypassed first scouting intention", order)
				}
				scout = scout || order.Kind == "train" && order.Type == faction+".recon"
			}
			if !scout {
				t.Fatal("waiting for scout also blocked its ordinary purchase", aiQualityCommitmentsPending(e))
			}
			// Admit the ordinary recon intention. Trigger the next decision at
			// this prepared checkpoint while its queued job still counts as recon.
			e.Advance()
			e.player(1).AILast = 0
			e.updateAI()
			expected := "radar"
			if faction == "US" {
				expected = "factory"
			}
			construction := false
			for _, order := range aiQualityCommitmentsPending(e) {
				construction = construction || order.Kind == "build" && order.Type == expected
				if faction == "IR" && order.Kind == "build" && order.Type == "factory" {
					t.Fatal("queued scout did not preserve radar/air opening", order)
				}
			}
			if !construction {
				t.Fatal("queued scout failed to release faction construction", expected, aiQualityCommitmentsPending(e))
			}
		})
	}
}

func TestAIFactionOpeningScoutHoldIsBounded(t *testing.T) {
	e := aiBuildOrderFixture(t, "US")
	p := e.player(1)
	counts := map[string]int32{"barracks": 1}
	if !e.aiFactionOpeningWaitsForScout(p, counts) {
		t.Fatal("air opening did not reserve first scout opportunity")
	}
	p.AI = "easy"
	if e.aiFactionOpeningWaitsForScout(p, counts) {
		t.Fatal("delayed Easy opening held ordinary ground construction")
	}
	p.AI, p.Tier = "normal", 3
	if e.aiFactionOpeningWaitsForScout(p, counts) {
		t.Fatal("mature base restarted opening scout hold")
	}
	p.Tier = 1
	counts["factory"] = 1
	if e.aiFactionOpeningWaitsForScout(p, counts) {
		t.Fatal("established ground opening held construction")
	}
	delete(counts, "factory")
	e.state.Mission = &MissionState{}
	if e.aiFactionOpeningWaitsForScout(p, counts) {
		t.Fatal("opening scout hold changed authored mission")
	}
}

func TestAIFactionOpeningAirAndGroundCapacityOrder(t *testing.T) {
	for _, spec := range []struct{ faction, aircraft string }{{"US", "fighter"}, {"IR", "isr"}} {
		t.Run(spec.faction, func(t *testing.T) {
			e := aiBuildOrderFixture(t, spec.faction)
			for i, typ := range []string{"power", "supply", "barracks", "radar"} {
				v := e.spawn(typ, 1, Vec{X: int32(4000 + i*6000), Y: 20000}, true, 0)
				if typ == "supply" {
					v.IncludedHauler = true
				}
			}
			for i := int32(0); i < 3; i++ {
				e.spawn("power", 1, Vec{X: 4000 + i*5000, Y: 40000}, true, 0)
			}
			e.spawn(content.AirProducer(spec.faction), 1, Vec{X: 42000, Y: 20000}, true, 0)
			for i := int32(0); i < 2; i++ {
				e.spawn(spec.faction+".hauler", 1, Vec{X: 16000 + i*2000, Y: 10000}, true, 0)
			}
			e.spawn(spec.faction+".recon", 1, Vec{X: 17000, Y: 8000}, true, 0)
			e.spawn(spec.faction+".engineer", 1, Vec{X: 19000, Y: 8000}, true, 0)
			e.state.Tick = seconds(120)
			e.recalculate()
			e.updateFog()
			e.updateAI()
			aircraft := false
			factoryBeforeAir := false
			for _, order := range aiQualityCommitmentsPending(e) {
				if order.Kind == "build" && order.Type == "factory" {
					factoryBeforeAir = true
				}
				aircraft = aircraft || order.Kind == "train" && order.Type == spec.faction+"."+spec.aircraft
			}
			if !aircraft {
				t.Fatal("opening did not queue first ordinary aircraft", aiQualityCommitmentsPending(e))
			}
			if factoryBeforeAir != (spec.faction == "US") {
				t.Fatal("ground capacity did not follow faction order", spec.faction, factoryBeforeAir)
			}
			// Advance the ordinary train admission. Only the next decision's
			// cadence is shortened at this prepared checkpoint.
			e.Advance()
			e.player(1).AILast = 0
			e.updateAI()
			factory := false
			for _, order := range aiQualityCommitmentsPending(e) {
				factory = factory || order.Kind == "build" && order.Type == "factory"
			}
			if spec.faction == "IR" && !factory {
				t.Fatal("first queued air commitment never released factory", aiQualityCommitmentsPending(e))
			}
		})
	}
}

func TestAIFactionOpeningDoesNotDisplaceChargedTierThreeOperation(t *testing.T) {
	for _, faction := range []string{"US", "IR"} {
		t.Run(faction, func(t *testing.T) {
			e, site := aiQualityCommitmentsFixture(t, faction, true)
			p := e.player(1)
			// An idle surviving builder exposes discretionary construction.
			// The prepared bank covers exactly the ordinary charged operation,
			// not a replacement air arm that this mature base never needed.
			e.entity(2).Orders = nil
			cost := int64(1200000)
			if faction == "IR" {
				cost = 1500000
			}
			p.Credits = cost
			target := e.spawn("power", 2, Vec{X: 42000, Y: 30000}, true, 500000)
			recon, _ := e.catalog.Unit(faction + ".recon")
			observer := e.spawn(recon.ID, 1, Vec{X: 42000, Y: 35000}, true, recon.Cost)
			observer.Orders = []Order{{Kind: "guard", Target: 1, Position: e.entity(1).Position}}
			e.recalculate()
			e.updateFog()
			if p.Tier != 3 || !e.canSee(1, target.Position) {
				t.Fatal("regression needs tier-three readiness and ordinary target sight")
			}
			counts := map[string]int32{"recon": 1, "radar": 1, "strategic": 1}
			if got := e.aiFactionOpeningBuild(p, counts); got != "" {
				t.Fatal("mature base restarted faction opening", got)
			}
			e.updateAI()
			activations := 0
			for _, order := range aiQualityCommitmentsPending(e) {
				if order.Kind == "build" && order.Type == content.AirProducer(faction) {
					t.Fatal("missing air producer displaced charged operation", order)
				}
				if order.Kind == "ability" && order.Type == "strategic" && reflect.DeepEqual(order.Entities, []ID{site.ID}) {
					activations++
				}
			}
			if activations != 1 {
				t.Fatal("charged operation lost its affordable planning priority", activations, aiQualityCommitmentsPending(e))
			}
			aiQualityCommitmentsAdvance(t, e)
			if p.Spent != cost || site.ChargeWork != 2 {
				t.Fatal("operation did not execute through ordinary paid rules", p.Spent, site.ChargeWork)
			}
		})
	}
}

func TestAIFactionCompositionIdentityAndLegalPurchase(t *testing.T) {
	for _, spec := range []struct {
		faction, producer, expected string
		stage                       uint32
	}{
		{"US", "airfield", "fighter", 0},
		{"IR", "drone_hub", "isr", 0},
		{"IR", "factory", "launcher", 3},
		{"SY", "barracks", "portable_aa", 1},
		{"SY", "factory", "car", 1},
		{"SA", "factory", "apc", 0},
		{"SA", "factory", "tank", 1},
	} {
		t.Run(spec.faction+"/"+spec.expected, func(t *testing.T) {
			e := aiBuildOrderFixture(t, spec.faction)
			baseInfrastructure(e, 1)
			for i := int32(0); i < 5; i++ {
				e.spawn("power", 1, Vec{X: 4000 + i*5000, Y: 40000}, true, 0)
			}
			var producer *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && e.role(v) == spec.producer {
					producer = v
				}
			}
			if producer == nil {
				producer = e.spawn(content.AirProducer(spec.faction), 1, Vec{X: 42000, Y: 16000}, true, 0)
			}
			e.recalculate()
			p := e.player(1)
			p.Credits, p.AIStage = 20000000, spec.stage
			counts := map[string]int32{"recon": 1, "engineer": 1, "rifle": 3, "at": 1}
			choice := e.aiFactionProductionRole(p, spec.producer, counts, "rifle")
			if choice != spec.expected {
				t.Fatalf("faction choice = %q, want %q", choice, spec.expected)
			}
			u, _ := e.catalog.Unit(p.Faction + "." + choice)
			before := p.Credits
			// Exercise the same ordinary production admission/execution without
			// allowing an unrelated planning cycle to spend in this fixture.
			p.AI = ""
			issue(t, e, 1, Order{Kind: "train", Entities: []ID{producer.ID}, Type: u.ID})
			if p.Credits != before-u.Cost || p.ReservedSupply != u.Supply {
				t.Fatal("faction purchase bypassed money/Supply rules", p.Credits, p.ReservedSupply, u)
			}
		})
	}
}

func TestAIFactionChoicesPreserveRecoveryMissionAndHiddenState(t *testing.T) {
	e := aiBuildOrderFixture(t, "SY")
	p := e.player(1)
	p.AIStage = 1
	counts := map[string]int32{}
	if got := e.aiFactionProductionRole(p, "barracks", counts, "rifle"); got != "recon" {
		t.Fatal("composition stole scouting recovery", got)
	}
	counts["recon"] = 1
	if got := e.aiFactionProductionRole(p, "barracks", counts, "rifle"); got != "engineer" {
		t.Fatal("composition stole engineer recovery", got)
	}
	counts["engineer"], counts["rifle"] = 1, 3
	choice := e.aiFactionProductionRole(p, "barracks", counts, "rifle")
	// Hidden enemy queues/resources must not influence the owned-count bias.
	e.player(2).Credits = 99999999
	e.entity(3).Jobs = []Job{{Type: "IR.tank"}}
	if e.aiFactionProductionRole(p, "barracks", counts, "rifle") != choice {
		t.Fatal("composition read hidden state")
	}
	e.state.Mission = &MissionState{}
	if got := e.aiFactionProductionRole(p, "barracks", counts, "rifle"); got != "rifle" || e.aiFactionOpeningBuild(p, counts) != "" {
		t.Fatal("faction policy changed authored mission", got)
	}
}

func TestAIFactionUSFightersFollowObservedDemand(t *testing.T) {
	for _, difficulty := range []string{"easy", "normal", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			e := aiBuildOrderFixture(t, "US")
			p := e.player(1)
			p.AI = difficulty
			// The ordinary US airfield requires radar/tier two; a tier-one
			// fixture must correctly reject the fighter as unavailable.
			p.Tier = 2
			e.state.Tick = seconds(40)
			counts := map[string]int32{}
			if got := e.aiFactionProductionRole(p, "airfield", counts, "strike"); got != "fighter" {
				t.Fatal("first escort fighter was lost", got)
			}
			counts["fighter"] = 1 // Includes owned and already planned jobs.
			for _, stage := range []uint32{0, 4, 8} {
				p.AIStage = stage
				if got := e.aiFactionProductionRole(p, "airfield", counts, "fighter"); got != "strike" {
					t.Fatal("ground opponent induced fighter saturation", stage, got)
				}
			}
			p.AIKnowledge = []AIObservation{{ID: 900, Type: "IR.strike", Owner: 2, Seen: e.Tick()}}
			if got := e.aiFactionProductionRole(p, "airfield", counts, "strike"); got != "fighter" {
				t.Fatal("observed enemy air did not allow second fighter", got)
			}
			counts["fighter"] = 2
			if got := e.aiFactionProductionRole(p, "airfield", counts, "fighter"); got != "strike" {
				t.Fatal("observed enemy air erased fighter investment bound", got)
			}
			counts["fighter"] = 1
			p.AIKnowledge[0].Seen = e.Tick() - seconds(31)
			if got := e.aiFactionProductionRole(p, "airfield", counts, "fighter"); got != "strike" {
				t.Fatal("stale air sighting sustained fighter saturation", got)
			}
		})
	}
}

func TestAIFactionUSAirInvestmentRequiresUsableScreenAndPreservesService(t *testing.T) {
	e := aiBuildOrderFixture(t, "US")
	p := e.player(1)
	p.AI = "hard"
	for i := int32(0); i < 12; i++ {
		e.spawn("US.recon", 1, Vec{X: 12000 + i*1000, Y: 14000}, true, 0)
	}
	if e.aiFactionAirInvestmentReady(p) {
		t.Fatal("noncombat Supply unlocked air investment")
	}
	var screen []*Entity
	for i := int32(0); i < 7; i++ {
		screen = append(screen, e.spawn("US.rifle", 1, Vec{X: 12000 + i*1000, Y: 16000}, true, 0))
	}
	if e.aiFactionAirInvestmentReady(p) {
		t.Fatal("total fourteen Supply ignored the two-Supply defender reserve")
	}
	screen = append(screen, e.spawn("US.rifle", 1, Vec{X: 20000, Y: 16000}, true, 0))
	if !e.aiFactionAirInvestmentReady(p) {
		t.Fatal("sixteen Supply with a two-Supply reserve did not release air identity")
	}
	for _, actor := range screen {
		actor.HP = actor.MaxHP / 4
	}
	if e.aiFactionAirInvestmentReady(p) {
		t.Fatal("critically damaged screen promised unavailable ground strength")
	}
	// Enemy private queues never improve this decision.
	e.entity(3).Jobs = []Job{{Type: "IR.strike"}}
	if e.aiFactionAirInvestmentReady(p) {
		t.Fatal("hidden enemy queue influenced own force feasibility")
	}
	e.state.Mission = &MissionState{}
	if !e.aiFactionAirInvestmentReady(p) {
		t.Fatal("ground investment gate changed authored mission behavior")
	}
	e.state.Mission = nil
	home := e.spawn("US.airfield", 1, Vec{X: 42000, Y: 20000}, true, 0)
	home.Jobs = []Job{{Type: "US.fighter"}}
	if !e.aiFactionAirInvestmentReady(p) {
		t.Fatal("queued owned air was denied service restoration")
	}
	home.Jobs = nil
	e.spawn("US.fighter", 1, Vec{X: 42000, Y: 20000}, true, 0)
	if !e.aiFactionAirInvestmentReady(p) {
		t.Fatal("existing owned air was denied service restoration")
	}
}

func TestAIFactionUSGroundScreenCapitalPrecedesOptionalInfrastructurePaid(t *testing.T) {
	e := aiBuildOrderFixture(t, "US")
	for i, typ := range []string{"power", "supply", "barracks", "factory"} {
		v := e.spawn(typ, 1, Vec{X: int32(4000 + i*6000), Y: 20000}, true, 0)
		if typ == "supply" {
			v.IncludedHauler = true
		}
	}
	for i := int32(0); i < 2; i++ {
		e.spawn("power", 1, Vec{X: 4000 + i*5000, Y: 40000}, true, 0)
		e.spawn("US.hauler", 1, Vec{X: 16000 + i*2000, Y: 10000}, true, 0)
	}
	e.spawn("US.recon", 1, Vec{X: 17000, Y: 8000}, true, 0)
	e.spawn("US.engineer", 1, Vec{X: 19000, Y: 8000}, true, 0)
	p := e.player(1)
	p.AI, p.Credits = "hard", 1900000
	e.state.Tick = seconds(40)
	e.recalculate()
	e.updateFog()
	bank, spent := p.Credits, p.Spent
	e.updateAI()
	cost, supply, factoryOutput := int64(0), int32(0), false
	for _, order := range aiQualityCommitmentsPending(e) {
		if order.Kind == "build" {
			t.Fatal("optional radar/air/depot claimed the first ground army bank", order)
		}
		if order.Kind == "train" {
			u, ok := e.catalog.Unit(order.Type)
			if !ok {
				t.Fatal("invalid production intention", order)
			}
			cost += u.Cost
			supply += u.Supply
			factoryOutput = factoryOutput || u.Producer == "factory" && u.Weapon != ""
		}
	}
	if !factoryOutput || cost == 0 || cost > bank {
		t.Fatal("first ground screen was not funded from ordinary capital", factoryOutput, cost, bank)
	}
	// Infrastructure/capital above are a declared checkpoint; the output below
	// must still pay ordinary catalog costs and reserve ordinary Supply.
	aiQualityCommitmentsAdvance(t, e)
	if p.Spent-spent != cost || p.Credits != bank-cost || p.ReservedSupply != supply {
		t.Fatal("screen production bypassed ordinary payment", p.Spent-spent, cost, p.Credits, bank-cost, p.ReservedSupply, supply)
	}
	t.Logf("ordinary paid screen: spent=%d credits=%d reserved_supply=%d tick=%d", cost, p.Credits, p.ReservedSupply, e.Tick())
}

func TestAIFactionUSAirInvestmentNeedsGroundDamageAndCountsGuards(t *testing.T) {
	e := aiBuildOrderFixture(t, "US")
	p := e.player(1)
	p.AI = "hard"
	for i := int32(0); i < 6; i++ {
		e.spawn("US.aa", 1, Vec{X: 12000 + i*1000, Y: 16000}, true, 0)
	}
	if e.aiFactionAirInvestmentReady(p) {
		t.Fatal("AA-only Supply unlocked aviation without a ground attack layer")
	}
	for i := int32(0); i < 2; i++ {
		v := e.spawn("US.rifle", 1, Vec{X: 19000 + i*1000, Y: 16000}, true, 0)
		v.Orders = []Order{{Kind: "guard", Target: 1, Position: e.entity(1).Position}}
		if i == 0 && e.aiFactionAirInvestmentReady(p) {
			t.Fatal("one structure-capable actor unlocked aviation")
		}
	}
	if !e.aiFactionAirInvestmentReady(p) {
		t.Fatal("usable ground guards were ignored in the capital decision")
	}
}
