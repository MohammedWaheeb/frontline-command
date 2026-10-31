package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// Existing capital/assets are declared before the first tick. Income, the busy
// first queue, new foundations and their output all use ordinary execution.
func aiCapacityFixture(t *testing.T, faction string) (*Engine, *Entity) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 911, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
	e.spawn("supply", 1, Vec{X: 16000, Y: 14000}, true, 1800000).IncludedHauler = true
	e.spawn("barracks", 1, Vec{X: 10000, Y: 24000}, true, 600000)
	factory := e.spawn("factory", 1, Vec{X: 18000, Y: 24000}, true, 1800000)
	e.spawn("power", 1, Vec{X: 26000, Y: 24000}, true, 500000)
	e.spawn("power", 1, Vec{X: 32000, Y: 24000}, true, 500000)
	e.spawn("radar", 1, Vec{X: 26000, Y: 16000}, true, 1400000)
	for i := int32(0); i < 10; i++ {
		e.spawn(faction+".rifle", 1, Vec{X: 4000 + i*2200, Y: 34000}, true, 200000)
	}
	orders := []Order{}
	for i := int32(0); i < 2; i++ {
		hauler := e.spawn(faction+".hauler", 1, Vec{X: 15000 + i*2000, Y: 9000}, true, 900000)
		orders = append(orders, Order{Kind: "gather", Entities: []ID{hauler.ID}})
	}
	e.player(1).Credits = 12000000
	e.recalculate()
	e.updateFog()
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	for e.Tick() < 4000 && e.player(1).Income < 1200000 {
		e.Advance()
	}
	if e.player(1).Income < 1200000 {
		t.Fatal("ordinary collectors failed to earn the capacity policy's income floor", e.player(1).Income)
	}
	issue(t, e, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: faction + ".car"})
	if len(factory.Jobs) != 1 || !factory.Jobs[0].Started || factory.Jobs[0].Paid == 0 || factory.Jobs[0].Work == 0 {
		t.Fatal("existing factory must have a real progressing paid job", factory.Jobs)
	}
	return e, factory
}

func aiCapacityInputs(e *Engine) ([]EntityView, map[string]int32, int32) {
	own := aiOwnView(e, 1)
	counts := map[string]int32{}
	planned := e.player(1).Supply + e.player(1).ReservedSupply
	for _, observed := range own {
		v := e.entity(observed.ID)
		counts[e.role(v)]++
		for _, job := range v.Jobs {
			if u, ok := e.catalog.Unit(job.Type); ok && !job.Research {
				counts[u.Role]++
				if !job.Started {
					planned += u.Supply
				}
			}
		}
	}
	return own, counts, planned
}

func TestAICapacityPaidGrowthAndOutput(t *testing.T) {
	for _, difficulty := range []string{"normal", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			e, first := aiCapacityFixture(t, "US")
			p := e.player(1)
			p.AI = difficulty
			own, counts, planned := aiCapacityInputs(e)
			build := e.aiCapacityBuild(p, own, counts, planned, e.aiPlanningBudget(p, own))
			if build != "factory" {
				t.Fatal("rich utilized factory should choose bounded capacity growth", build, p.Income, p.Supply, e.aiPowerMargin(p, own))
			}
			pos, ok := e.aiConstructionPosition(p, build, e.entity(1).Position)
			if !ok {
				t.Fatal("fixture must admit normal observed placement")
			}
			// This isolates the helper's paid execution contract; the autonomous
			// planner regression below checks its construction priorities.
			p.AI = ""
			before := p.Spent
			issue(t, e, 1, Order{Kind: "build", Entities: []ID{2}, Type: build, Position: pos})
			var second *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && e.role(v) == "factory" && v.ID != first.ID {
					second = v
				}
			}
			b, _ := e.buildingRule(build)
			if second == nil || second.Paid != b.Cost || p.Spent != before+b.Cost {
				t.Fatal("new factory must be an ordinary paid foundation", second, p.Spent-before)
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			twin, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			limit := e.Tick() + 2600
			for !second.Complete && e.Tick() < limit {
				e.Advance()
				twin.Advance()
			}
			if !second.Complete || e.Hash() != twin.Hash() {
				t.Fatal("paid second factory failed construction or restored continuation diverged", second.Work, second.Position, e.entity(2).Position)
			}
			for _, engine := range []*Engine{e, twin} {
				if err := engine.Submit(1, engine.player(1).LastSequence+1, []Order{{Kind: "train", Entities: []ID{second.ID}, Type: "US.car"}}); err != nil {
					t.Fatal(err)
				}
				engine.Advance()
			}
			u, _ := e.catalog.Unit("US.car")
			if len(second.Jobs) != 1 || !second.Jobs[0].Started || second.Jobs[0].Paid != u.Cost || p.Spent != before+b.Cost+u.Cost {
				t.Fatal("additional producer failed to pay for ordinary output", second.Jobs, p.Spent-before)
			}
			for len(second.Jobs) > 0 && e.Tick() < limit+1000 {
				e.Advance()
				twin.Advance()
			}
			if len(second.Jobs) != 0 || e.countRole(1, "car", false) != 2 || e.Hash() != twin.Hash() {
				t.Fatal("second queue did not deliver an ordinary vehicle or restored continuation diverged")
			}
			if p.Credits != 12000000+p.Income-p.Spent {
				t.Fatal("capacity growth violated ordinary income/spending accounting", p.Credits, p.Income, p.Spent)
			}
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("paid capacity checkpoint replay diverged", err)
			}
			t.Logf("%s: earned=%d second factory paid=%d second output paid=%d cars=%d tick=%d restore/replay hashes equal", difficulty, p.Income, b.Cost, u.Cost, e.countRole(1, "car", false), e.Tick())
		})
	}
}

func TestAICapacityConstraintsAndDifficulty(t *testing.T) {
	for _, mode := range []string{"easy", "mission", "full_supply", "little_headroom", "budget_reserved", "no_income", "no_builder", "lost_collector", "foundation", "unused_factory", "unpaid_queue", "blocked_queue", "second_factory", "power_shortage", "normal_reserve", "normal_policy_floor", "normal_policy_ready", "hard_reserve"} {
		t.Run(mode, func(t *testing.T) {
			e, factory := aiCapacityFixture(t, "US")
			p := e.player(1)
			p.AI = "normal"
			own, counts, planned := aiCapacityInputs(e)
			budget := e.aiPlanningBudget(p, own)
			want := ""
			switch mode {
			case "easy":
				p.AI = "easy"
			case "mission":
				e.state.Mission = &MissionState{}
			case "full_supply":
				planned = 100
			case "little_headroom":
				planned = 89
			case "budget_reserved":
				budget = 0
			case "no_income":
				p.Income = 0
			case "no_builder":
				e.entity(2).HP = 0
			case "lost_collector":
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.role(v) == "hauler" {
						v.HP = 0
						break
					}
				}
			case "foundation":
				e.spawn("power", 1, Vec{X: 32000, Y: 16000}, false, 500000)
				own, counts, planned = aiCapacityInputs(e)
			case "unused_factory":
				factory.Jobs = nil
			case "unpaid_queue":
				factory.Jobs[0].Started = false
			case "blocked_queue":
				factory.DisabledUntil = e.Tick() + 100
			case "second_factory":
				e.spawn("factory", 1, Vec{X: 40000, Y: 24000}, true, 1800000)
				own, counts, planned = aiCapacityInputs(e)
			case "power_shortage":
				p.PowerCapacity = p.PowerDemand
			case "normal_reserve":
				budget = 3300000
			case "normal_policy_floor":
				// Cost plus the production reserve is affordable, but the
				// public difficulty policy deliberately requires more surplus.
				budget = 4300000
			case "normal_policy_ready":
				budget, want = e.aiSkirmishPolicy(p).CapacityCredits, "factory"
			case "hard_reserve":
				p.AI, budget, want = "hard", 3300000, "factory"
			}
			if got := e.aiCapacityBuild(p, own, counts, planned, budget); got != want {
				t.Fatalf("capacity constraint %s: got %q want %q", mode, got, want)
			}
		})
	}
}

func TestAICapacityFullCompatibleAirSlots(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SA", "SY"} {
		t.Run(faction, func(t *testing.T) {
			e, factory := aiCapacityFixture(t, faction)
			// Keep the idle-factory control independent of air utilization.
			factory.Jobs = nil
			p := e.player(1)
			p.AI = "hard"
			typ := content.AirProducer(faction)
			home := e.spawn(typ, 1, Vec{X: 38000, Y: 16000}, true, 0)
			b, _ := e.buildingRule(typ)
			air := faction + ".fighter"
			if faction == "SY" {
				air = "SY.scout_drone"
			}
			for i := int32(0); i < b.ServiceSlots; i++ {
				v := e.spawn(air, 1, Vec{X: 38000 + i*1500, Y: 10000}, true, 0)
				v.Home = home.ID
			}
			e.recalculate()
			e.updateFog()
			own, counts, planned := aiCapacityInputs(e)
			want := typ
			if faction == "SY" {
				want = ""
			}
			if got := e.aiCapacityBuild(p, own, counts, planned, p.Credits); got != want {
				t.Fatal("full service slots must permit bounded useful air expansion", got, want, e.aiAirProductionMargin(own, b.Role))
			}
			spare := e.spawn(typ, 1, Vec{X: 44000, Y: 24000}, false, b.Cost)
			own, counts, planned = aiCapacityInputs(e)
			if got := e.aiCapacityBuild(p, own, counts, planned, p.Credits); got != "" {
				t.Fatal("paid second air foundation must suppress a third producer", got, spare.ID)
			}
		})
	}
}

// A cash-short routine tank choice must not leave a second affordable combat
// purchase idle forever merely because an earlier vehicle already exists.
func TestAICapacityAffordableReinforcementAfterExistingVehicle(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, mode := range []string{"normal", "hard", "easy", "mission", "urgent", "actor_reserved", "full_supply", "reserved_budget"} {
			t.Run(faction+"/"+mode, func(t *testing.T) {
				m := fixtureMap()
				m.Fields, m.Stations = nil, nil
				e, err := New(content.MustBase(), Config{Map: m, Seed: 912, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
				if err != nil {
					t.Fatal(err)
				}
				e.state.Countdown = 0
				e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
				e.spawn("supply", 1, Vec{X: 10000, Y: 20000}, true, 1800000).IncludedHauler = true
				e.spawn("barracks", 1, Vec{X: 16000, Y: 20000}, true, 600000)
				factory := e.spawn("factory", 1, Vec{X: 22000, Y: 20000}, true, 1800000)
				car, _ := e.catalog.Unit(faction + ".car")
				e.spawn(car.ID, 1, Vec{X: 14000, Y: 14000}, true, car.Cost)
				p := e.player(1)
				// Declared continuation checkpoint: prior assets plus an ordinary
				// bank that affords one cheaper vehicle and the 300k cushion.
				p.Credits, p.AI = car.Cost+300000, "normal"
				if mode == "hard" || mode == "easy" {
					p.AI = mode
				}
				if mode == "mission" {
					e.state.Mission = &MissionState{}
				}
				e.recalculate()
				e.updateFog()
				own, _, planned := aiCapacityInputs(e)
				budget := p.Credits
				prior := []Order{}
				if mode == "actor_reserved" {
					prior = append(prior, Order{Kind: "rally", Entities: []ID{factory.ID}, Position: factory.Rally})
				}
				if mode == "full_supply" {
					planned = 100
				}
				if mode == "reserved_budget" {
					budget = 0
				}
				preferred := faction + ".tank"
				tank, _ := e.catalog.Unit(preferred)
				if p.Credits >= tank.Cost+300000 {
					t.Fatal("checkpoint must expose an actual routine purchase cash gap", p.Credits, tank.Cost)
				}
				got := e.aiFirstFactoryVehicle(p, factory, own, preferred, budget, planned, prior, mode == "urgent")
				if mode != "normal" && mode != "hard" {
					if got != preferred {
						t.Fatal("legacy/urgent/recovery constraints must preserve the saving choice", got, preferred)
					}
					return
				}
				if got != car.ID {
					t.Fatal("affordable second vehicle should preserve spending momentum", got, car.ID)
				}
				p.AI = ""
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				twin, err := Restore(e.catalog, saved)
				if err != nil {
					t.Fatal(err)
				}
				for _, engine := range []*Engine{e, twin} {
					issue(t, engine, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: got})
				}
				if p.Credits != 300000 || p.Spent != car.Cost || len(factory.Jobs) != 1 || factory.Jobs[0].Paid != car.Cost || !factory.Jobs[0].Started {
					t.Fatal("reinforcement must pay normal price and retain the normal margin", p.Credits, p.Spent, factory.Jobs)
				}
				for e.Tick() < Tick(car.BuildTicks+100) && len(factory.Jobs) > 0 {
					e.Advance()
					twin.Advance()
				}
				if len(factory.Jobs) != 0 || e.countRole(1, "car", false) != 2 || e.Hash() != twin.Hash() {
					t.Fatal("ordinary second purchase failed output or restored determinism")
				}
				t.Logf("%s %s: existing combat vehicle plus paid reinforcement=%d, bank=%d, cars=2, restored hash equal", faction, mode, car.Cost, p.Credits)
			})
		}
	}
}

// The routine cheaper-combat fallback must not continually consume the bank
// reserved for the first repair support of an existing combat force.
func TestAICapacityPreservesFirstRepairSavings(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, difficulty := range []string{"normal", "hard"} {
			for _, threshold := range []string{"below_margin", "exact_margin"} {
				t.Run(faction+"/"+difficulty+"/"+threshold, func(t *testing.T) {
					m := fixtureMap()
					m.Fields, m.Stations = nil, nil
					e, err := New(content.MustBase(), Config{Map: m, Seed: 913, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
					if err != nil {
						t.Fatal(err)
					}
					e.state.Countdown = 0
					e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
					e.spawn("supply", 1, Vec{X: 10000, Y: 20000}, true, 1800000).IncludedHauler = true
					e.spawn("barracks", 1, Vec{X: 16000, Y: 20000}, true, 600000)
					factory := e.spawn("factory", 1, Vec{X: 22000, Y: 20000}, true, 1800000)
					car, _ := e.catalog.Unit(faction + ".car")
					repair, _ := e.catalog.Unit(faction + ".repair")
					e.spawn(car.ID, 1, Vec{X: 14000, Y: 14000}, true, car.Cost)
					p := e.player(1)
					// Declared cash-short/exact-price continuation checkpoints;
					// all output below follows normal admission and payment.
					bank := repair.Cost + 300000
					if threshold == "below_margin" {
						bank--
						if bank <= car.Cost+300000 {
							t.Fatal("saving fixture must expose a strictly affordable cheaper combat choice", bank, car.Cost)
						}
					}
					p.Credits, p.AI = bank, difficulty
					e.recalculate()
					e.updateFog()
					own, _, planned := aiCapacityInputs(e)
					got := e.aiFirstFactoryVehicle(p, factory, own, repair.ID, bank, planned, nil, false)
					if got != repair.ID {
						t.Fatal("first repair savings were replaced by cheaper combat production", got, repair.ID, bank)
					}
					if p.Credits != bank || p.Spent != 0 || len(factory.Jobs) != 0 {
						t.Fatal("saving decision must not mutate ordinary credits or production", p.Credits, p.Spent, factory.Jobs)
					}
					if threshold == "below_margin" {
						return
					}
					p.AI = ""
					saved, err := e.Save()
					if err != nil {
						t.Fatal(err)
					}
					twin, err := Restore(e.catalog, saved)
					if err != nil {
						t.Fatal(err)
					}
					for _, engine := range []*Engine{e, twin} {
						issue(t, engine, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: repair.ID})
					}
					if p.Credits != 300000 || p.Spent != repair.Cost || len(factory.Jobs) != 1 || !factory.Jobs[0].Started || factory.Jobs[0].Paid != repair.Cost {
						t.Fatal("exact-threshold repair support must pay ordinary cost and retain 300k", p.Credits, p.Spent, factory.Jobs)
					}
					for len(factory.Jobs) > 0 && e.Tick() < Tick(repair.BuildTicks+100) {
						e.Advance()
						twin.Advance()
					}
					if len(factory.Jobs) != 0 || e.countRole(1, "repair", false) != 1 || e.countRole(1, "car", false) != 1 || e.Hash() != twin.Hash() {
						t.Fatal("paid first repair support failed output or restored determinism")
					}
					t.Logf("%s %s: first repair paid=%d bank=%d cars=1 repair=1 restored hash equal", faction, difficulty, repair.Cost, p.Credits)
				})
			}
		}
	}
}

// This is a declared rich checkpoint with real collector deliveries and a
// progressing paid first queue. Once enabled, the bot gets no external orders:
// updateAI must choose, pay, finish and use its second factory itself.
func TestAICapacityPlannerBuildsAndUsesSecondFactory(t *testing.T) {
	for _, difficulty := range []string{"normal", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			e, first := aiCapacityFixture(t, "US")
			p := e.player(1)
			// These existing checkpoint assets satisfy the optional air/scout
			// opening. The fixture's three power plants also fund both factories.
			airfield, _ := e.buildingRule("US.airfield")
			e.spawn(airfield.ID, 1, Vec{X: 38000, Y: 16000}, true, airfield.Cost)
			for i, role := range []string{"recon", "engineer"} {
				u, _ := e.catalog.Unit("US." + role)
				e.spawn(u.ID, 1, Vec{X: 14000 + int32(i)*2000, Y: 18000}, true, u.Cost)
			}
			e.recalculate()
			e.updateFog()
			start, incomeBefore := e.Tick(), p.Income
			p.AI, p.Controller = difficulty, "ai"
			var second *Entity
			foundationAt, completeAt, outputAt := Tick(0), Tick(0), Tick(0)
			outputType, outputPaid := "", int64(0)
			factoryRule, _ := e.buildingRule("factory")
			for e.Tick()-start < 5000 && outputAt == 0 && !e.Outcome().Finished {
				e.Advance()
				if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 || p.Credits != 12000000+p.Income-p.Spent {
					t.Fatal("autonomous capacity growth violated ordinary economy limits/ledger", e.Tick(), p.Credits, p.Income, p.Spent, p.Supply, p.ReservedSupply)
				}
				if e.countRole(1, "factory", true) > 2 {
					t.Fatal("autonomous capacity growth exceeded two factories")
				}
				if second == nil {
					for _, v := range e.state.Entities {
						if v.Owner == p.ID && e.role(v) == "factory" && v.ID != first.ID {
							second, foundationAt = v, e.Tick()
							if v.Paid != factoryRule.Cost {
								t.Fatal("autonomous second factory did not pay ordinary construction cost", v.Paid, factoryRule.Cost)
							}
							break
						}
					}
				}
				if second == nil || !second.Complete {
					continue
				}
				if completeAt == 0 {
					completeAt = e.Tick()
				}
				for _, job := range second.Jobs {
					u, ok := e.catalog.Unit(job.Type)
					if ok && !job.Research && !job.Emergency && job.Started && job.Paid == u.Cost && job.Paid > 0 && u.Producer == "factory" {
						outputAt, outputType, outputPaid = e.Tick(), u.ID, job.Paid
						break
					}
				}
			}
			if second == nil || !second.Complete || outputAt == 0 {
				t.Fatalf("AI failed to build and use its second paid factory within 5000 ticks: difficulty=%s start=%d tick=%d foundation=%d complete=%d income=%d bank=%d spent=%d first_jobs=%+v second=%+v", difficulty, start, e.Tick(), foundationAt, completeAt, p.Income, p.Credits, p.Spent, first.Jobs, second)
			}
			t.Logf("%s autonomous AI: earned before=%d after=%d second factory paid=%d foundation=%d complete=%d own job=%s paid=%d at=%d elapsed=%d bank=%d ledger equal", difficulty, incomeBefore, p.Income, second.Paid, foundationAt, completeAt, outputType, outputPaid, outputAt, e.Tick()-start, p.Credits)
		})
	}
}
