package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiQualityCommitmentsFixture(t *testing.T, faction string, charged bool) (*Engine, *Entity) {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 42, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "hard"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	baseInfrastructure(e, 1)
	p := e.player(1)
	p.RepairReserve = 300000
	// Temporarily disabled production is ordinary owned state. Keep active
	// radar/tech, adequate power, two collectors, and the existing builder so
	// a ready activation can be isolated from essential recovery purchases.
	for _, v := range e.state.Entities {
		if v.Owner != 1 {
			continue
		}
		if v.Building {
			rule, _ := e.buildingRule(v.Type)
			v.Paid = rule.Cost
			if rule.Role == "supply" || rule.Role == "barracks" || rule.Role == "factory" {
				v.Enabled = false
			}
		} else if e.role(v) == "rig" {
			v.Orders = []Order{{Kind: "guard", Target: 1, Position: e.entity(1).Position}}
		}
	}
	for _, point := range []Vec{{X: 32000, Y: 12000}, {X: 38000, Y: 12000}} {
		rule, _ := e.buildingRule("power")
		e.spawn("power", 1, point, true, rule.Cost)
	}
	for i := int32(0); i < 2; i++ {
		rule, _ := e.catalog.Unit(faction + ".hauler")
		e.spawn(rule.ID, 1, Vec{X: 14000 + i*2000, Y: 15000}, true, rule.Cost)
	}
	var site *Entity
	if charged {
		rule, _ := e.buildingRule("strategic")
		site = e.spawn(rule.ID, 1, Vec{X: 32000, Y: 36000}, true, rule.Cost)
		site.ChargeWork = e.strategicCharge(faction)
	}
	e.state.Tick = seconds(2)
	e.recalculate()
	e.updateFog()
	if p.LowPower() || p.Tier != 3 {
		t.Fatal("fixture needs normal power and active Tier 3")
	}
	return e, site
}

func aiQualityCommitmentsPending(e *Engine) []Order {
	var orders []Order
	for _, scheduled := range e.state.Pending {
		if scheduled.Player == 1 {
			orders = append(orders, scheduled.Orders...)
		}
	}
	return orders
}

func aiQualityCommitmentsAdvance(t *testing.T, e *Engine, replicas ...*Engine) {
	t.Helper()
	e.Advance()
	for _, restored := range replicas {
		if restored == nil {
			continue
		}
		restored.Advance()
		if restored.Hash() != e.Hash() {
			t.Fatal("controlled checkpoint diverged during normal execution", e.Tick())
		}
	}
	for _, result := range e.state.Results {
		if result.Player == 1 && !result.Accepted {
			t.Errorf("normal submitted intention rejected: %+v", result)
		}
	}
}

func TestAIQualityCommitmentsStrategicPreservesAffordableMissile(t *testing.T) {
	for _, faction := range []string{"US", "IR"} {
		for _, tight := range []bool{false, true} {
			t.Run(faction+map[bool]string{false: "/remaining_activation_budget", true: "/exact_paid_control"}[tight], func(t *testing.T) {
				e, site := aiQualityCommitmentsFixture(t, faction, true)
				p := e.player(1)
				cost := int64(1200000)
				if faction == "IR" {
					cost = 1500000
				}
				rule, _ := e.catalog.Unit(faction + ".launcher")
				launcher := e.spawn(rule.ID, 1, Vec{X: 16000, Y: 30000}, true, rule.Cost)
				launcher.Deployed, launcher.Charges = true, 1
				w, _ := e.weapon(launcher)
				shot := aiMissileShotCost(w.ID)
				targetRule, _ := e.buildingRule("power")
				target := e.spawn(targetRule.ID, 2, Vec{X: 42000, Y: 30000}, true, targetRule.Cost)
				recon, _ := e.catalog.Unit(faction + ".recon")
				observer := e.spawn(recon.ID, 1, Vec{X: 42000, Y: 35000}, true, recon.Cost)
				if faction == "IR" {
					// A legal standing task isolates missile spending from the
					// observer's independently affordable optional Beacon.
					observer.Orders = []Order{{Kind: "guard", Target: launcher.ID, Position: launcher.Position}}
				}
				p.Credits = 2 * cost
				if tight {
					p.Credits = cost + shot
				}
				e.recalculate()
				e.updateFog()
				if !e.canSee(1, target.Position) || e.edgeDistance(launcher, target) > w.MaxRange || e.edgeDistance(launcher, target) < w.MinRange {
					t.Fatal("fixture target must be currently visible in the normal missile ring")
				}
				bank, spent, energy, charge := p.Credits, p.Spent, p.Energy, site.ChargeWork
				var restored *Engine
				if faction == "US" && !tight {
					// This proves save/restore from this controlled legal planning
					// checkpoint, not an ordinary economy played from New.
					save, err := e.Save()
					if err != nil {
						t.Fatal(err)
					}
					restored, err = Restore(e.catalog, save)
					if err != nil || restored.Hash() != e.Hash() {
						t.Fatal("controlled preplanning checkpoint did not restore exactly", err)
					}
				}
				e.updateAI()
				if restored != nil {
					restored.updateAI()
					if !reflect.DeepEqual(aiQualityCommitmentsPending(e), aiQualityCommitmentsPending(restored)) || restored.Hash() != e.Hash() {
						t.Fatal("restored full planning changed chosen batches, resources or cursors")
					}
					t.Logf("controlled preplanning save/restore produced identical full AI state and batches: hash=%s", e.Hash())
				}
				orders := aiQualityCommitmentsPending(e)
				activations, attacks := 0, 0
				for _, order := range orders {
					if order.Kind == "ability" && order.Type == "strategic" {
						activations++
					}
					if order.Kind == "attack" && reflect.DeepEqual(order.Entities, []ID{launcher.ID}) && order.Target == target.ID {
						attacks++
					}
				}
				if activations != 1 || attacks != 1 {
					t.Errorf("one paid activation must preserve its separately affordable missile: activations=%d attacks=%d orders=%+v", activations, attacks, orders)
				}
				if p.Credits != bank || p.Spent != spent || p.Energy != energy || site.ChargeWork != charge {
					t.Fatal("planning spent authoritative resources or charge")
				}
				p.AI = ""
				if restored != nil {
					restored.player(1).AI = ""
				}
				aiQualityCommitmentsAdvance(t, e, restored)
				activated := 0
				for _, event := range e.state.Events {
					if event.Kind == "strategic_activated" && event.Owner == 1 && event.Value == cost {
						activated++
					}
				}
				if activated != 1 || p.Spent-spent != cost || site.ChargeWork != 2 {
					t.Fatal("ordinary activation must pay once and consume one charge", activated, p.Spent-spent, site.ChargeWork)
				}
				for range 24 {
					if launcher.Charges == 0 {
						break
					}
					aiQualityCommitmentsAdvance(t, e, restored)
				}
				fired := false
				for _, projectile := range e.state.Projectiles {
					if projectile.Shooter == launcher.ID && !projectile.Strategic {
						fired = true
					}
				}
				t.Logf("ordinary receipts: tick=%d activation=%d fired=%v credits=%d spent=%d charge=%d missile_charges=%d", e.Tick(), activated, fired, p.Credits, p.Spent-spent, site.ChargeWork, launcher.Charges)
				if !fired || launcher.Charges != 0 || p.Credits != bank-cost-shot || p.Spent-spent != cost+shot || p.Credits < 0 {
					t.Error("retained missile must fire, pay its normal cost, and leave the exact bank")
				}
			})
		}
	}
}

func TestAIQualityCommitmentsShieldUsesOneChargeAcrossGoalRefresh(t *testing.T) {
	e, site := aiQualityCommitmentsFixture(t, "SA", true)
	p := e.player(1)
	p.Credits, p.AIGoal = 2000000, e.entity(1).Position
	rule, _ := e.buildingRule("outpost")
	forward := e.spawn(rule.ID, 1, Vec{X: 38000, Y: 30000}, true, rule.Cost)
	recon, _ := e.catalog.Unit("SA.recon")
	e.spawn(recon.ID, 1, Vec{X: 42000, Y: 35000}, true, recon.Cost)
	targetRule, _ := e.buildingRule("power")
	target := e.spawn(targetRule.ID, 2, Vec{X: 44000, Y: 30000}, true, targetRule.Cost)
	e.recalculate()
	e.updateFog()
	if !e.canSee(1, target.Position) || distance(forward.Position, target.Position) >= distance(e.entity(1).Position, target.Position) {
		t.Fatal("refreshed observed goal must prefer a different owned anchor")
	}
	bank, charge := p.Credits, site.ChargeWork
	e.updateAI()
	orders := aiQualityCommitmentsPending(e)
	activations := []Order{}
	for _, order := range orders {
		if order.Kind == "ability" && order.Type == "strategic" {
			activations = append(activations, order)
		}
	}
	if p.AIGoal != target.Position || len(activations) != 1 || !reflect.DeepEqual(activations[0].Entities, []ID{1}) {
		t.Errorf("a refreshed goal must retain only its earlier player charge commitment: goal=%+v activations=%+v", p.AIGoal, activations)
	}
	if p.Credits != bank || site.ChargeWork != charge {
		t.Fatal("planning debited the activation")
	}
	p.AI = ""
	aiQualityCommitmentsAdvance(t, e)
	activated := 0
	for _, event := range e.state.Events {
		if event.Kind == "strategic_activated" && event.Owner == 1 && event.Value == 1000000 {
			activated++
		}
	}
	t.Logf("ordinary shield receipts: activations=%d credits=%d spent=%d charge=%d zones=%+v results=%+v", activated, p.Credits, p.Spent, site.ChargeWork, e.state.Zones, e.state.Results)
	if activated != 1 || p.Credits != 1000000 || p.Spent != 1000000 || site.ChargeWork != 2 || len(e.state.Zones) != 1 || e.state.Zones[0].Anchor != 1 || !e.hasBuff(e.entity(1), "shield_anchor") || e.hasBuff(forward, "shield_anchor") {
		t.Error("one legal Shieldline order must consume one ordinary charge/payment and retain its original anchor")
	}
}

func TestAIQualityCommitmentsBuilderTrainLeavesRapidSortieEnergy(t *testing.T) {
	for _, energy := range []int64{50000, 49999} {
		t.Run(map[bool]string{true: "affordable", false: "short_energy_control"}[energy == 50000], func(t *testing.T) {
			e, _ := aiQualityCommitmentsFixture(t, "US", false)
			p := e.player(1)
			e.entity(2).HP = 0
			e.cleanup()
			rule, _ := e.buildingRule("US.airfield")
			home := e.spawn(rule.ID, 1, Vec{X: 24000, Y: 36000}, true, rule.Cost)
			jet := droneFixtureActor(e, home.ID, "US.strike")
			jet.ServiceWork, jet.Ammo = 1, 0
			goal := e.entity(3).Position
			p.AIKnowledge = []AIObservation{{ID: 3, Owner: 2, Type: "hq", Position: goal}}
			p.Explored[goal.Y/1000*e.state.Map.Width+goal.X/1000] = true
			rig, _ := e.catalog.Unit("US.rig")
			p.Credits, p.Energy = rig.Cost, energy
			e.recalculate()
			e.updateFog()
			if e.canSee(1, goal) || !e.explored(1, goal) || p.LowPower() || !home.Active(e.Tick()) || jet.ServiceWork+200 >= e.serviceRequired(jet) {
				t.Fatal("fixture needs an unseen explored goal and useful ordinary rearming")
			}
			e.updateAI()
			orders := aiQualityCommitmentsPending(e)
			trains, sorties, sweeps := 0, 0, 0
			for _, order := range orders {
				if order.Kind == "train" && order.Type == "US.rig" && reflect.DeepEqual(order.Entities, []ID{1}) {
					trains++
				}
				if order.Kind == "ability" && order.Type == "rapid_sortie" {
					sorties++
				}
				if order.Kind == "ability" && order.Type == "recon_sweep" {
					sweeps++
				}
			}
			wantSorties := 0
			if energy == 50000 {
				wantSorties = 1
			}
			if trains != 1 || sweeps != 0 || sorties != wantSorties {
				t.Errorf("retained HQ recovery must leave real Energy for an independent airfield: trains=%d sweeps=%d sorties=%d orders=%+v", trains, sweeps, sorties, orders)
			}
			if p.Energy != energy || p.Credits != rig.Cost || p.Spent != 0 || jet.ServiceWork != 1 || jet.Ammo != 0 {
				t.Fatal("planning changed real funds, service work or ammunition")
			}
			p.AI = ""
			aiQualityCommitmentsAdvance(t, e)
			wantEnergy, wantWork := energy+25, uint32(3)
			if wantSorties == 1 {
				wantEnergy, wantWork = 25, 4
			}
			job := e.entity(1).Jobs
			t.Logf("ordinary recovery/sortie receipts: credits=%d spent=%d energy=%d service_work=%d ammo=%d jobs=%+v results=%+v", p.Credits, p.Spent, p.Energy, jet.ServiceWork, jet.Ammo, job, e.state.Results)
			if p.Credits != 0 || p.Spent != rig.Cost || p.Energy != wantEnergy || jet.ServiceWork != wantWork || jet.Ammo != 0 || e.hasBuff(home, "rapid_sortie") != (wantSorties == 1) || len(job) != 1 || !job[0].Started || job[0].Paid != rig.Cost || cooldown(p.Cooldowns, "recon_sweep", e.Tick()) {
				t.Error("normal recovery/sortie must preserve exact paid credit, Energy, service-rate and ammo semantics")
			}
		})
	}
}

func TestAIQualityCommitmentsStandaloneStrategicControl(t *testing.T) {
	e, site := aiQualityCommitmentsFixture(t, "US", true)
	p := e.player(1)
	p.AI, p.Credits = "", 1200000
	recon, _ := e.catalog.Unit("US.recon")
	e.spawn(recon.ID, 1, Vec{X: 42000, Y: 35000}, true, recon.Cost)
	rule, _ := e.buildingRule("power")
	target := e.spawn(rule.ID, 2, Vec{X: 42000, Y: 30000}, true, rule.Cost)
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	own := aiOwnView(e, 1)
	before := e.Hash()
	standalone := e.aiSpecialOrders(p, view, own, target.Position)
	explicit := e.aiSpecialOrdersWithBudget(p, view, own, target.Position, 1200000)
	if !reflect.DeepEqual(standalone, explicit) || e.Hash() != before {
		t.Fatal("no-prior wrapper changed standalone planning or mutated state")
	}
	activation, ok := aiQualityStrategicOrder(standalone)
	if !ok || !reflect.DeepEqual(activation.Entities, []ID{site.ID}) {
		t.Fatal("standalone control lost its ordinary ready activation", standalone)
	}
	if err := e.Submit(1, p.LastSequence+1, standalone); err != nil {
		t.Fatal(err)
	}
	aiQualityCommitmentsAdvance(t, e)
	if p.Credits != 0 || p.Spent != 1200000 || site.ChargeWork != 2 {
		t.Fatal("standalone control must pay and consume one charge through ordinary execution", p.Credits, p.Spent, site.ChargeWork)
	}
}
