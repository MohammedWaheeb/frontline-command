package sim

import (
	"reflect"
	"testing"
)

func aiQualityStrategicPlan(e *Engine, goal Vec) []Order {
	view, _ := e.PlayerView(1)
	e.aiObserve(e.player(1), view)
	return e.aiSpecialOrders(e.player(1), view, aiOwnView(e, 1), goal)
}

func aiQualitySourceOrders(orders []Order, source ID) []Order {
	var chosen []Order
	for _, order := range orders {
		for _, id := range order.Entities {
			if id == source {
				chosen = append(chosen, order)
				break
			}
		}
	}
	return chosen
}

func aiQualityStrategicOrder(orders []Order) (Order, bool) {
	for _, order := range orders {
		if order.Kind == "ability" && order.Type == "strategic" {
			return order, true
		}
	}
	return Order{}, false
}

func TestAIQualityLauncherUsesObservedGroundTargetAcrossFullRange(t *testing.T) {
	for _, typ := range []string{"US.launcher", "IR.launcher", "SY.launcher", "SA.launcher"} {
		for _, deployed := range []bool{false, true} {
			t.Run(typ+map[bool]string{false: "/mobile", true: "/deployed"}[deployed], func(t *testing.T) {
				e := fixture(t)
				p := e.player(1)
				p.AI, p.Faction, p.Credits = "hard", typ[:2], 600000
				launcher := e.spawn(typ, 1, Vec{X: 15000, Y: 20000}, true, 0)
				launcher.Deployed = deployed
				air := e.spawn("IR.fighter", 2, Vec{X: 38000, Y: 20000}, true, 0)
				air.Landed = false
				e.spawn(typ[:2]+".recon", 1, Vec{X: 38000, Y: 25000}, true, 0)
				e.spawn("IR.tank", 2, Vec{X: 18500, Y: 20000}, true, 0)
				point := Vec{X: 42000, Y: 20000}
				if typ == "IR.launcher" {
					point.X = 54000
				}
				target := e.spawn("power", 2, point, true, 0)
				e.spawn(typ[:2]+".recon", 1, Vec{X: point.X, Y: 25000}, true, 0)
				e.recalculate()
				e.updateFog()
				weapon, _ := e.weapon(launcher)
				if !e.canSeeEntity(1, air) || !e.canSeeEntity(1, target) || e.edgeDistance(launcher, target) > weapon.MaxRange {
					t.Fatal("fixture must show air and a distant legal target")
				}
				orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, point), launcher.ID)
				if len(orders) != 1 || orders[0].Kind != "attack" || orders[0].Target != target.ID {
					t.Fatalf("launcher did not choose distant legal ground target: %+v", orders)
				}
				if code := e.execute(1, orders[0]); code != "ok" {
					t.Fatal("chosen attack failed ordinary validation", code)
				}
			})
		}
	}
}

func TestAIQualityVolleyUsesLegalObservedPointAndPaidMagazine(t *testing.T) {
	for _, scenario := range []string{"near_goal", "far_goal", "insufficient_credits", "one_charge", "second_shot_pending"} {
		t.Run(scenario, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI, p.Faction, p.Credits = "hard", "IR", 600000
			launcher := e.spawn("IR.launcher", 1, Vec{X: 12000, Y: 25000}, true, 0)
			launcher.Deployed, launcher.Charges = true, 2
			target := e.spawn("power", 2, Vec{X: 32000, Y: 25000}, true, 0)
			e.spawn("IR.recon", 1, Vec{X: 32000, Y: 29000}, true, 0)
			goal := Vec{X: 15000, Y: 25000}
			if scenario == "far_goal" {
				goal.X = 62000
				e.spawn("IR.recon", 1, Vec{X: 62000, Y: 29000}, true, 0)
			}
			if scenario == "insufficient_credits" {
				p.Credits = 599000
			}
			if scenario == "one_charge" {
				launcher.Charges = 1
			}
			if scenario == "second_shot_pending" {
				launcher.Charges = 1
				e.state.Operations = append(e.state.Operations, Operation{Kind: "second_volley", Owner: 1, Source: launcher.ID, At: 30, Points: []Vec{target.Position, launcher.Position}})
			}
			e.recalculate()
			e.updateFog()
			orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, goal), launcher.ID)
			if scenario == "second_shot_pending" {
				if len(orders) != 0 {
					t.Fatal("planner would interrupt committed second missile", orders)
				}
				return
			}
			wantVolley := scenario == "near_goal" || scenario == "far_goal"
			if len(orders) != 1 || (orders[0].Type == "volley") != wantVolley {
				t.Fatalf("expected one paid missile intention, volley=%v: %+v", wantVolley, orders)
			}
			if wantVolley && (len(orders[0].Points) != 2 || orders[0].Points[0] != target.Position || orders[0].Points[1] != target.Position) {
				t.Fatal("volley used goal outside legal ring rather than visible alternative", orders)
			}
			if code := e.execute(1, orders[0]); code != "ok" {
				t.Fatal("planner emitted illegal missile intention", code, orders)
			}
		})
	}
}

func TestAIQualityStrategicUsesFactionCostAndOwnedTargets(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, _ := strategicFixture(t, faction)
			p := e.player(1)
			p.AI = "hard"
			cost := int64(1200000)
			if faction == "IR" {
				cost = 1500000
			}
			if faction == "SA" {
				cost = 1000000
			}
			p.Credits = cost
			e.state.Tick = seconds(20)
			goal := Vec{X: 60000, Y: 8000}
			if faction == "US" || faction == "IR" {
				target := e.spawn("power", 2, Vec{X: 45000, Y: 20000}, true, 0)
				e.spawn(faction+".recon", 1, Vec{X: 45000, Y: 24000}, true, 0)
				goal = target.Position
			}
			if faction == "SY" {
				house := e.spawn("SY.safehouse", 1, Vec{X: 42000, Y: 20000}, true, 0)
				house.Created, house.CompletedAt = 0, 0
			}
			e.recalculate()
			e.updateFog()
			order, ok := aiQualityStrategicOrder(aiQualityStrategicPlan(e, goal))
			if !ok {
				t.Fatal("ready faction operation was incorrectly gated by common cost or hostile-goal vision")
			}
			if code := e.execute(1, order); code != "ok" || p.Credits != 0 {
				t.Fatal("strategic intention failed actual cost/target validation", code, p.Credits, order)
			}
		})
	}
}

func TestAIQualityStrategicSkipsKnownUnreadySiteAndPrerequisites(t *testing.T) {
	for _, scenario := range []string{"disabled_site", "low_power", "lost_tier", "uncharged", "insufficient_credits"} {
		t.Run(scenario, func(t *testing.T) {
			e, site := strategicFixture(t, "IR")
			p := e.player(1)
			p.AI = "hard"
			target := e.spawn("power", 2, Vec{X: 45000, Y: 20000}, true, 0)
			e.spawn("IR.recon", 1, Vec{X: 45000, Y: 24000}, true, 0)
			switch scenario {
			case "disabled_site":
				site.Enabled = false
			case "low_power":
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.role(v) == "power" {
						v.Enabled = false
					}
				}
			case "lost_tier":
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.role(v) == "tech" {
						v.Enabled = false
					}
				}
			case "uncharged":
				site.ChargeWork = 0
			case "insufficient_credits":
				p.Credits = 1499000
			}
			e.recalculate()
			e.updateFog()
			if order, ok := aiQualityStrategicOrder(aiQualityStrategicPlan(e, target.Position)); ok {
				t.Fatal("planner repeated a known illegal strategic activation", scenario, order)
			}
		})
	}
}

func TestAIQualityRaidSelectsMatureActiveHousesWithinSupply(t *testing.T) {
	e, _ := strategicFixture(t, "SY")
	p := e.player(1)
	p.AI, p.Credits = "hard", 1500000
	e.state.Tick = seconds(20)
	young := e.spawn("SY.safehouse", 1, Vec{X: 40000, Y: 12000}, true, 0)
	disabled := e.spawn("SY.safehouse", 1, Vec{X: 45000, Y: 12000}, true, 0)
	disabled.Created, disabled.CompletedAt, disabled.Enabled = 0, 0, false
	good := e.spawn("SY.safehouse", 1, Vec{X: 40000, Y: 23000}, true, 0)
	good.Created, good.CompletedAt = 0, 0
	other := e.spawn("SY.safehouse", 1, Vec{X: 48000, Y: 23000}, true, 0)
	other.Created, other.CompletedAt = 0, 0
	e.recalculate()
	p.ReservedSupply = 94
	e.updateFog()
	order, ok := aiQualityStrategicOrder(aiQualityStrategicPlan(e, Vec{X: 60000, Y: 8000}))
	if !ok || !reflect.DeepEqual(order.Entities, []ID{good.ID}) {
		t.Fatal("raid ignored house age/activity or available Supply", order, young.ID, disabled.ID)
	}
	if code := e.execute(1, order); code != "ok" {
		t.Fatal("selected raid did not pass ordinary validation", code)
	}
}

func TestAIQualityABMDeploysForWarningAndRetainsChargedCoverage(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Faction = "hard", "SA"
	abm := e.spawn("SA.mobile_abm", 1, Vec{X: 12000, Y: 12000}, true, 0)
	e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Impact: Vec{X: 9000, Y: 12000}, ImpactAt: seconds(8), Interceptable: true})
	e.updateFog()
	orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, Vec{X: 55000, Y: 55000}), abm.ID)
	if len(orders) != 1 || orders[0].Kind != "deploy" {
		t.Fatal("visible missile warning did not prepare empty mobile interception", orders)
	}
	abm.Deployed, abm.Charges = true, 1
	e.state.Projectiles = nil
	orders = aiQualitySourceOrders(aiQualityStrategicPlan(e, Vec{X: 55000, Y: 55000}), abm.ID)
	for _, order := range orders {
		if order.Kind == "pack" {
			t.Fatal("charged home coverage packed with no evidence of relocation need", orders)
		}
	}
}

func TestAIQualityFactionAbilitiesUseActualEnergyAndRequireActiveHQ(t *testing.T) {
	for _, scenario := range []string{"sweep_35", "power_45", "combined_50", "disabled_hq"} {
		t.Run(scenario, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "hard"
			baseInfrastructure(e, 1)
			goal := Vec{X: 55000, Y: 8000}
			p.Explored[8*64+55] = true
			want := "recon_sweep"
			p.Energy = 35000
			if scenario != "sweep_35" {
				p.Faction, p.Energy, want = "SA", 45000, "emergency_power"
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.role(v) == "power" {
						v.Enabled = false
					}
				}
			}
			if scenario == "combined_50" || scenario == "disabled_hq" {
				p.Energy = 50000
				repair := e.spawn("SA.repair", 1, Vec{X: 16000, Y: 12000}, true, 0)
				tank := e.spawn("SA.tank", 1, Vec{X: 18500, Y: 12000}, true, 0)
				tank.HP /= 2
				_ = repair
				e.spawn("IR.rifle", 2, Vec{X: 23000, Y: 12000}, true, 0)
			}
			if scenario == "disabled_hq" {
				e.entity(1).Enabled = false
				want = ""
			}
			e.recalculate()
			e.updateFog()
			orders := aiQualityStrategicPlan(e, goal)
			energy := p.Energy
			var casts []string
			for _, order := range orders {
				if order.Kind != "ability" || !aiFactionAbility(order.Type) {
					continue
				}
				casts = append(casts, order.Type)
				if code := e.execute(1, order); code != "ok" {
					t.Fatal("faction plan overspent or omitted known prerequisite", code, orders, energy)
				}
			}
			if want == "" && len(casts) != 0 || want != "" && (len(casts) != 1 || casts[0] != want) {
				t.Fatal("did not use legal exact-cost command ability", want, casts, orders)
			}
		})
	}
}

func TestAIQualityDesignationUsesObservedFootprintAndParkedAircraft(t *testing.T) {
	for _, typ := range []string{"power", "IR.fighter"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "hard"
			recon := e.spawn("US.recon", 1, Vec{X: 16000, Y: 18000}, true, 0)
			point := Vec{X: 20000, Y: 18000}
			if typ == "power" {
				point.X = 24200
			}
			target := e.spawn(typ, 2, point, true, 0)
			target.Landed = true
			e.updateFog()
			if e.edgeDistance(recon, target) > 7000 || !e.canSeeEntity(1, target) {
				t.Fatal("fixture must offer legal observed designation")
			}
			orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, point), recon.ID)
			if len(orders) != 1 || orders[0].Type != "designate" || orders[0].Target != target.ID {
				t.Fatal("designation omitted known footprint or parked-aircraft armor", orders)
			}
			if code := e.execute(1, orders[0]); code != "ok" {
				t.Fatal("designation did not pass ordinary validator", code)
			}
		})
	}
}

func TestAIQualityStrategicPlanningIgnoresHiddenAlternatives(t *testing.T) {
	a, b := fixture(t), fixture(t)
	var source ID
	for _, e := range []*Engine{a, b} {
		p := e.player(1)
		p.AI, p.Faction = "hard", "IR"
		launcher := e.spawn("IR.launcher", 1, Vec{X: 16000, Y: 20000}, true, 0)
		launcher.Deployed, launcher.Charges = true, 2
		source = launcher.ID
		e.spawn("power", 2, Vec{X: 36000, Y: 20000}, true, 0)
		e.spawn("IR.recon", 1, Vec{X: 36000, Y: 25000}, true, 0)
		e.updateFog()
	}
	hidden := b.spawn("power", 2, Vec{X: 50000, Y: 50000}, true, 0)
	b.updateFog()
	if b.canSeeEntity(1, hidden) {
		t.Fatal("hidden alternative unexpectedly visible")
	}
	goal := Vec{X: 36000, Y: 20000}
	before := aiQualitySourceOrders(aiQualityStrategicPlan(a, goal), source)
	after := aiQualitySourceOrders(aiQualityStrategicPlan(b, goal), source)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("hidden alternative changed strategic choice", before, after)
	}
}

func TestAIQualityGroundDeploymentDoesNotStrandSupportOrLongRangePressure(t *testing.T) {
	for _, typ := range []string{"SA.tank", "SA.repair"} {
		t.Run(typ, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI, p.Faction = "hard", "SA"
			source := e.spawn(typ, 1, Vec{X: 18000, Y: 22000}, true, 0)
			target := e.spawn("IR.tank", 2, Vec{X: 30000, Y: 22000}, true, 0)
			e.spawn("SA.recon", 1, Vec{X: 26000, Y: 27000}, true, 0)
			if typ == "SA.repair" {
				e.spawn("SA.tank", 1, Vec{X: 20000, Y: 22000}, true, 0)
			}
			e.updateFog()
			orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, target.Position), source.ID)
			if typ == "SA.tank" {
				for _, order := range orders {
					if order.Kind == "deploy" {
						t.Fatal("hull-down outside weapon range stranded an advancing tank", orders)
					}
				}
			} else if len(orders) != 1 || orders[0].Kind != "deploy" {
				t.Fatal("support guard displaced committed service deployment", orders)
			}
		})
	}
}

func TestAIQualityBeaconSkipsOwnedCapAndPendingPlacements(t *testing.T) {
	for _, scenario := range []string{"existing", "pending"} {
		t.Run(scenario, func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI, p.Faction, p.Credits = "hard", "IR", 2000000
			observer := e.spawn("IR.recon", 1, Vec{X: 18000, Y: 20000}, true, 0)
			e.spawn("IR.tank", 2, Vec{X: 24000, Y: 20000}, true, 0)
			for i := range 3 {
				position := Vec{X: 45000, Y: 10000 + int32(i)*5000}
				owner := e.spawn("IR.recon", 1, position, true, 0)
				if scenario == "pending" {
					e.beginChannel(owner, "beacon", 0, seconds(4))
				} else {
					beacon := e.spawn("IR.beacon", 1, position, true, 0)
					beacon.Builder = owner.ID
				}
			}
			e.updateFog()
			for range 3 {
				orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, Vec{X: 24000, Y: 20000}), observer.ID)
				for _, order := range orders {
					if order.Type == "beacon" {
						code := e.execute(1, order)
						t.Fatal("planner exceeded existing or committed three-beacon cap", scenario, code, order)
					}
				}
			}
		})
	}
}

func TestAIQualityDisperseRequiresAffectedOwnedInfantry(t *testing.T) {
	for _, haveInfantry := range []bool{false, true} {
		t.Run(map[bool]string{false: "empty_vehicle_group", true: "owned_infantry_group"}[haveInfantry], func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI, p.Faction, p.Energy = "hard", "SY", 45000
			baseInfrastructure(e, 1)
			leader := e.spawn("SY.tank", 1, Vec{X: 20000, Y: 22000}, true, 0)
			e.spawn("IR.tank", 2, Vec{X: 27000, Y: 22000}, true, 0)
			var infantry *Entity
			if haveInfantry {
				infantry = e.spawn("SY.rifle", 1, Vec{X: 21000, Y: 25000}, true, 0)
			}
			e.recalculate()
			e.updateFog()
			var cast Order
			for _, order := range aiQualityStrategicPlan(e, leader.Position) {
				if order.Type == "disperse" {
					cast = order
					break
				}
			}
			if !haveInfantry {
				if cast.Kind != "" {
					code := e.execute(1, cast)
					t.Fatal("empty owned area spent45 Command Energy without an infantry beneficiary", code, p.Energy, cast)
				}
				return
			}
			if cast.Kind == "" {
				t.Fatal("visible threatened owned infantry lost legal Disperse")
			}
			if code := e.execute(1, cast); code != "ok" || !e.hasBuff(infantry, "disperse") || p.Energy != 0 {
				t.Fatal("selected Disperse did not affect owned infantry at ordinary cost", code, p.Energy, cast)
			}
		})
	}
}

func TestAIQualitySharedBudgetPreservesConstructionSavings(t *testing.T) {
	e, _ := strategicFixture(t, "IR")
	p := e.player(1)
	p.AI, p.Credits = "hard", 3000000
	launcher := e.spawn("IR.launcher", 1, Vec{X: 16000, Y: 25000}, true, 0)
	launcher.Deployed, launcher.Charges = true, 2
	target := e.spawn("power", 2, Vec{X: 36000, Y: 25000}, true, 0)
	e.spawn("IR.recon", 1, Vec{X: 36000, Y: 30000}, true, 0)
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	orders := e.aiSpecialOrdersWithBudget(p, view, aiOwnView(e, 1), target.Position, 0)
	for _, order := range orders {
		if order.Kind == "attack" && order.Entities[0] == launcher.ID || order.Type == "volley" || order.Type == "beacon" || order.Type == "strategic" {
			t.Fatal("optional special spending consumed reserved infrastructure credits", order)
		}
	}
	if p.Credits != 3000000 || launcher.Charges != 2 {
		t.Fatal("planning mutated money or magazine", p.Credits, launcher.Charges)
	}
}

func TestAIQualityVolleyReserveIncludesDuePlanningTick(t *testing.T) {
	for _, due := range []bool{false, true} {
		t.Run(map[bool]string{false: "future_second_shot", true: "due_before_special_update"}[due], func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.Faction, p.Credits = "IR", 600000
			launcher := e.spawn("IR.launcher", 1, Vec{X: 16000, Y: 22000}, true, 0)
			launcher.Deployed, launcher.Charges = true, 2
			point := Vec{X: 36000, Y: 22000}
			e.spawn("IR.recon", 1, Vec{X: 36000, Y: 27000}, true, 0)
			e.updateFog()
			order := Order{Kind: "ability", Type: "volley", Entities: []ID{launcher.ID}, Points: []Vec{point, point}}
			if code := e.execute(1, order); code != "ok" {
				t.Fatal(code)
			}
			if due {
				e.state.Tick = e.state.Operations[0].At
			}
			reserve := e.aiCommittedVolleyCredits(p)
			if due {
				e.updateSpecial()
				if p.Credits != 0 || launcher.Charges != 0 {
					t.Fatal("accepted second shot was not ordinarily paid", p.Credits, launcher.Charges)
				}
			}
			if reserve != 300000 {
				t.Fatal("planning omitted an accepted second shot that still owes credits", due, reserve, p.Credits)
			}
		})
	}
}

func TestAIQualityLauncherFiresNormallyAndReplaysDeterministically(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI, p.Credits = "hard", 1000000
	launcher := e.spawn("US.launcher", 1, Vec{X: 16000, Y: 22000}, true, 0)
	target := e.spawn("power", 2, Vec{X: 42000, Y: 22000}, true, 0)
	e.spawn("US.recon", 1, Vec{X: 42000, Y: 27000}, true, 0)
	e.recalculate()
	e.updateFog()
	orders := aiQualitySourceOrders(aiQualityStrategicPlan(e, target.Position), launcher.ID)
	if len(orders) != 1 || orders[0].Kind != "attack" {
		t.Fatal("launcher lacks ordinary closing attack", orders)
	}
	p.AI = ""
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	fired := false
	for range 120 {
		e.Advance()
		restored.Advance()
		if e.Hash() != restored.Hash() {
			t.Fatal("ordinary planned launch diverged after restore", e.Tick())
		}
		for _, projectile := range e.state.Projectiles {
			if projectile.Shooter == launcher.ID && projectile.Interceptable {
				fired = true
			}
		}
		if fired {
			break
		}
	}
	if !fired || launcher.Charges != 0 || p.Credits != 600000 || !launcher.Deployed {
		t.Fatal("planned closing attack did not set up and buy its missile normally", fired, launcher.Charges, p.Credits, launcher.State)
	}
	t.Logf("paid launch tick=%d credits=%d hash=%s", e.Tick(), p.Credits, e.Hash())
}
