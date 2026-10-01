package sim

import (
	"bytes"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

// This fixture seeds infrastructure and a legal treasury only. The measured
// support actor is ordinarily trained, paid and routed to an isolated rally;
// Blocked, retry failures and twelve stationary seconds come from execution.
func aiGroundSupportPaidBlocked(t testing.TB, typ string) (*Engine, ID, ID) {
	t.Helper()
	m := fixtureMap()
	m.Stations[0].Position = Vec{X: 34500, Y: 34500}
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 56000}})
	for y := int32(16); y <= 25; y++ {
		for x := int32(46); x <= 51; x++ {
			if x == 46 || x == 51 || y == 16 || y == 25 {
				m.Tiles[y*m.Width+x].Terrain = "cliff"
			}
		}
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{
		{ID: 1, Faction: typ[:2], Team: 1},
		{ID: 2, Faction: "IR", Team: 2},
		{ID: 3, Faction: "SY", Team: 1},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	baseInfrastructure(e, 1)
	p := e.player(1)
	rule, ok := e.catalog.Unit(typ)
	if !ok || rule.Weapon != "" || rule.Role != "engineer" && rule.Role != "medic" && rule.Role != "repair" {
		t.Fatal("invalid support corpus", typ)
	}
	p.Credits, p.RepairReserve = rule.Cost+350000, 300000
	var producer *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Building && e.role(v) == rule.Producer {
			producer = v
			break
		}
	}
	if producer == nil || !producer.Active(e.Tick()) || p.LowPower() {
		t.Fatal("missing legal compatible active producer")
	}
	rally := Vec{X: 48500, Y: 20500}
	if err := e.Submit(1, p.LastSequence+1, []Order{
		{Kind: "rally", Entities: []ID{producer.ID}, Position: rally},
		{Kind: "train", Entities: []ID{producer.ID}, Type: typ},
	}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	aiGroundSupportResults(t, e)
	if len(producer.Jobs) != 1 || !producer.Jobs[0].Started || producer.Jobs[0].Paid != rule.Cost || producer.Jobs[0].Work != 2 || p.Credits != 350000 || p.Spent != rule.Cost || p.ReservedSupply != rule.Supply {
		t.Fatal("ordinary paid support queue did not debit/reserve/progress", producer.Jobs, p.Credits, p.Spent, p.ReservedSupply)
	}
	var source *Entity
	deadline := Tick(rule.BuildTicks) + seconds(18)
	for e.Tick() < deadline {
		for _, v := range e.state.Entities {
			if v.Owner == 1 && v.Type == typ && v.HP > 0 {
				source = v
				break
			}
		}
		if source != nil && source.Blocked && source.RouteFailures >= 2 && e.Tick()-source.StationarySince >= seconds(12) {
			break
		}
		e.Advance()
	}
	if source == nil || source.Paid != rule.Cost || !source.Active(e.Tick()) || source.HP != source.MaxHP || !source.Blocked || source.RouteFailures < 2 || e.Tick()-source.StationarySince < seconds(12) || len(source.Orders) != 1 || source.Orders[0].Kind != "move" || source.Orders[0].Position != rally || source.Orders[0].Queued || source.Container != 0 || source.Channel != "" || p.Supply != rule.Supply || p.ReservedSupply != 0 || p.Credits != 350000 || p.Spent != rule.Cost {
		t.Fatal("ordinary paid blocked rally fixture did not complete", typ, e.Tick(), source, p.Credits, p.Spent)
	}
	t.Logf("paid_blocked_receipt type=%s producer=%s source=%d Paid=%d Supply=%d spent=%d tick=%d created=%d stationary_since=%d route_failures=%d position=%v sole_Move=%v", typ, producer.Type, source.ID, source.Paid, p.Supply, p.Spent, e.Tick(), source.Created, source.StationarySince, source.RouteFailures, source.Position, source.Orders[0].Position)
	return e, source.ID, producer.ID
}

func aiGroundSupportResults(t testing.TB, e *Engine) {
	t.Helper()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("normal support execution rejected", result)
		}
	}
}

func aiGroundSupportClone(t testing.TB, e *Engine) *Engine {
	t.Helper()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil || twin.Hash() != e.Hash() {
		t.Fatal("support restore mismatch", err)
	}
	return twin
}

func aiGroundSupportPending(e *Engine, actor ID) []Order {
	var orders []Order
	for _, batch := range e.state.Pending {
		for _, order := range batch.Orders {
			for _, id := range order.Entities {
				if id == actor {
					orders = append(orders, order)
					break
				}
			}
		}
	}
	return orders
}

// No bypassed executor is used for Stop, the subsequent role task or healing.
// Every tick includes a saved twin; replay reconstructs the complete execution.
func aiGroundSupportRun(t *testing.T, e *Engine, source, target ID, kind string, workLimit int, done func(*Engine) bool) {
	t.Helper()
	p, v := e.player(1), e.entity(source)
	p.AI, p.AILast = "hard", e.Tick()-seconds(1)
	e.recalculate()
	e.updateFog()
	beforeCredits, beforeSpent, beforeHP := p.Credits, p.Spent, e.entity(target)
	var targetHP int64
	if beforeHP != nil {
		targetHP = beforeHP.HP
	}
	own := aiOwnView(e, 1)
	proposalsValid := true
	for _, goal := range []Vec{{X: 6000, Y: 5000}, v.Orders[0].Position} {
		oldHash := e.Hash()
		order, ok := e.aiStalledRallyOrder(v, own, goal)
		if oldHash != e.Hash() {
			t.Fatal("rally proposal mutated state")
		}
		t.Logf("same_goal=%v recovery_proposal=%v exists=%v", goal == v.Orders[0].Position, order, ok)
		if !ok || order.Kind != "stop" || order.Target != 0 || order.Position != (Vec{}) || order.Queued || !reflect.DeepEqual(order.Entities, []ID{source}) {
			proposalsValid = false
		}
	}
	twin := aiGroundSupportClone(t, e)
	e.updateAI()
	twin.updateAI()
	a, _ := json.Marshal(e.state.Pending)
	b, _ := json.Marshal(twin.state.Pending)
	if !bytes.Equal(a, b) || e.Hash() != twin.Hash() {
		t.Fatal("full support chooser, payload or cursor differs after restore")
	}
	chosen := aiGroundSupportPending(e, source)
	t.Logf("full_cycle_selected_source_orders=%v full_pending=%s", chosen, a)
	if !proposalsValid || len(chosen) != 1 || chosen[0].Kind != "stop" {
		t.Fatal("healthy paid specialist remained on confirmed failed automatic rally through full chooser", chosen)
	}
	if p.Credits != beforeCredits || p.Spent != beforeSpent || beforeHP != nil && beforeHP.HP != targetHP {
		t.Fatal("planning mutated credits or beneficiary health")
	}
	position := v.Position
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	advance := func() {
		e.Advance()
		twin.Advance()
		aiGroundSupportResults(t, e)
		if e.Hash() != twin.Hash() {
			t.Fatal("support ordinary restore execution drift", e.Tick())
		}
		if err := replay.Capture(e, false); err != nil {
			t.Fatal(err)
		}
	}
	advance()
	if len(v.Orders) != 0 || v.Blocked || v.Position != position || v.HP != v.MaxHP {
		t.Fatal("selected normal Stop failed", v.Orders, v.Blocked, v.Position)
	}
	t.Logf("admitted_Stop source=%d tick=%d position=%v", source, e.Tick(), v.Position)
	workChosen := false
	for i := 0; i < int(seconds(1)); i++ {
		advance()
		for _, order := range aiGroundSupportPending(e, source) {
			if order.Kind == "attack_move" {
				t.Fatal("unarmed support received attack_move", order)
			}
			if order.Kind == kind && order.Target == target {
				workChosen = true
			}
		}
		if workChosen {
			break
		}
	}
	if !workChosen {
		t.Fatal("next ordinary AI cycle did not select meaningful support work", kind, target, aiGroundSupportPending(e, source), v.Orders)
	}
	advance()
	if len(v.Orders) != 1 || v.Orders[0].Kind != kind || v.Orders[0].Target != target {
		t.Fatal("chosen next-cycle support work did not execute", v.Orders)
	}
	t.Logf("admitted_role_work source=%d kind=%s target=%d tick=%d", source, kind, target, e.Tick())
	for i := 0; i < workLimit && !done(e); i++ {
		advance()
		if i == 79 {
			twin = aiGroundSupportClone(t, e)
		}
		for _, order := range v.Orders {
			if order.Kind == "attack_move" {
				t.Fatal("unarmed support task became attack_move", order)
			}
		}
	}
	if !done(e) {
		t.Fatal("normal support work did not complete within bounded execution", kind, v.Orders, e.Tick())
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("support full replay differs", err)
	}
	t.Logf("support_restore_replay_receipt type=%s work=%s tick=%d hash=%s", v.Type, kind, e.Tick(), e.Hash())
}

func TestAIQualityGroundSupportAllPaidRolesRecoverAndRestore(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, role := range []string{"engineer", "medic", "repair"} {
			typ := faction + "." + role
			t.Run(typ, func(t *testing.T) {
				e, source, producer := aiGroundSupportPaidBlocked(t, typ)
				v, p := e.entity(source), e.player(1)
				var recipient *Entity
				kind := "guard"
				if role == "engineer" {
					recipient = e.entity(producer)
					recipient.HP = recipient.MaxHP * 84 / 100
					kind = "repair"
				} else {
					casualty := faction + ".rifle"
					position := Vec{X: v.Position.X, Y: v.Position.Y + 2500}
					if role == "repair" {
						casualty = faction + ".car"
						position.X += 2000
					}
					recipient = e.spawn(casualty, 1, position, true, 0)
					recipient.HP = recipient.MaxHP / 2
					issue(t, e, 1, Order{Kind: "hold", Entities: []ID{recipient.ID}})
				}
				damage := recipient.MaxHP - recipient.HP
				spent := p.Spent
				aiGroundSupportRun(t, e, source, recipient.ID, kind, 240, func(engine *Engine) bool {
					target := engine.entity(recipient.ID)
					return target != nil && target.HP == target.MaxHP
				})
				repairCost := (damage + 9) / 10
				if role == "medic" {
					repairCost = 0
				}
				if p.Spent != spent+repairCost || p.Credits != 350000-repairCost || recipient.HP != recipient.MaxHP || v.Paid <= 0 {
					t.Fatal("actual recipient restoration or ordinary repair payment differs", recipient.HP, recipient.MaxHP, p.Spent, spent, p.Credits, repairCost)
				}
				t.Logf("work_completion_receipt type=%s restored_HP=%d actual_repair_cost=%d credits=%d", typ, damage, repairCost, p.Credits)
			})
		}
	}
}

func TestAIQualityGroundSupportPreservesQueuedExplicitAndActiveTasks(t *testing.T) {
	for _, role := range []string{"engineer", "medic", "repair"} {
		base, source, producer := aiGroundSupportPaidBlocked(t, "US."+role)
		for _, condition := range []string{"queued_next", "queued_front", "unrelated_manual_goal", "moving", "recent", "channel", "deployed", "deploying", "packing", "disabled", "low_health", "container", "explicit_repair", "unarmed_attack", "incomplete_producer", "foreign_producer", "wrong_owner_private", "incompatible_producer"} {
			t.Run(role+"/"+condition, func(t *testing.T) {
				e := aiGroundSupportClone(t, base)
				v := e.entity(source)
				own := aiOwnView(e, 1)
				switch condition {
				case "queued_next":
					issue(t, e, 1, Order{Kind: "move", Entities: []ID{source}, Position: Vec{X: 20000, Y: 24000}, Queued: true})
				case "queued_front":
					v.Orders[0].Queued = true
				case "unrelated_manual_goal":
					v.Orders[0].Position = Vec{X: 48500, Y: 21500}
				case "moving":
					v.Blocked = false
				case "recent":
					v.StationarySince = e.Tick() - seconds(2)
				case "channel":
					v.Channel, v.ChannelUntil = "capture", e.Tick()+seconds(6)
				case "deployed":
					v.Deployed = true
				case "deploying":
					v.DeployUntil = e.Tick() + seconds(2)
				case "packing":
					v.PackingUntil = e.Tick() + seconds(2)
				case "disabled":
					v.DisabledUntil = e.Tick() + seconds(10)
				case "low_health":
					v.HP = v.MaxHP / 2
				case "container":
					v.Container = producer
				case "explicit_repair":
					v.Orders[0] = Order{Kind: "repair", Target: producer}
				case "unarmed_attack":
					v.Orders[0].Kind = "attack_move"
				case "incomplete_producer", "foreign_producer", "wrong_owner_private", "incompatible_producer":
					for i := range own {
						if own[i].ID != producer {
							continue
						}
						if condition == "incomplete_producer" {
							own[i].Complete = false
						}
						if condition == "foreign_producer" {
							own[i].Private = nil
						}
						if condition == "wrong_owner_private" {
							own[i].Owner = 3
						}
						if condition == "incompatible_producer" {
							if role == "repair" {
								own[i].Type = "barracks"
							} else {
								own[i].Type = "factory"
							}
						}
					}
				}
				hash := e.Hash()
				before, _ := json.Marshal(v.Orders)
				if order, ok := e.aiStalledRallyOrder(v, own, Vec{X: 6000, Y: 5000}); ok {
					t.Fatal("support recovery stole queued, unrelated or active work", order)
				}
				after, _ := json.Marshal(v.Orders)
				if e.Hash() != hash || !bytes.Equal(before, after) {
					t.Fatal("preservation query changed state or queues")
				}
			})
		}
	}
}

func TestAIQualityGroundSupportArmedRallyCompatibility(t *testing.T) {
	e, actor, own, goal := aiStalledRallyFixture(t)
	order, ok := e.aiStalledRallyOrder(actor, own, goal)
	if !ok || order.Kind != "attack_move" || order.Position != goal {
		t.Fatal("armed automatic rally behavior changed", order, ok)
	}
	if order, ok := e.aiStalledRallyOrder(actor, own, actor.Orders[0].Position); ok {
		t.Fatal("unchanged armed assault goal was replaced", order)
	}
}

func TestAIQualityGroundSupportPaidEngineersCaptureReachableStation(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, source, _ := aiGroundSupportPaidBlocked(t, faction+".engineer")
			station := e.state.Stations[0]
			station.Position = Vec{X: e.entity(source).Position.X, Y: e.entity(source).Position.Y + 2200}
			aiGroundSupportRun(t, e, source, station.ID, "capture", 200, func(engine *Engine) bool { return engine.state.Stations[0].Owner == 1 })
			if station.Owner != 1 || e.entity(source).Container != 0 {
				t.Fatal("normal reachable station capture did not complete")
			}
			t.Logf("capture_completion_receipt faction=%s station=%d owner=%d", faction, station.ID, station.Owner)
		})
	}
}

func TestAIQualityGroundSupportPaidSyrianCollectorsSalvage(t *testing.T) {
	for _, role := range []string{"engineer", "repair"} {
		t.Run(role, func(t *testing.T) {
			e, source, _ := aiGroundSupportPaidBlocked(t, "SY."+role)
			victim := e.spawn("IR.tank", 2, Vec{X: e.entity(source).Position.X, Y: e.entity(source).Position.Y + 1800}, true, 1600000)
			e.damages = []damage{{Target: victim.ID, Owner: 1, Shooter: source, Amount: victim.HP, Kind: "cannon"}}
			e.resolveDamage()
			e.cleanup()
			e.damages = nil
			e.updateFog()
			if len(e.state.Salvage) != 1 || e.state.Salvage[0].Value != 120000 {
				t.Fatal("ordinary capped salvage was not produced")
			}
			crate := e.state.Salvage[0]
			credits, spent := e.player(1).Credits, e.player(1).Spent
			aiGroundSupportRun(t, e, source, crate.ID, "salvage", 120, func(engine *Engine) bool { return engine.salvage(crate.ID) == nil })
			if e.player(1).Credits != credits+120000 || e.player(1).Spent != spent || e.player(1).SalvageTotal != 120000 {
				t.Fatal("ordinary salvage did not pay exactly once", e.player(1).Credits, e.player(1).SalvageTotal)
			}
		})
	}
}

func TestAIQualityGroundSupportHiddenAndAlliedPrivateStateIndependent(t *testing.T) {
	a, source, _ := aiGroundSupportPaidBlocked(t, "US.engineer")
	b := aiGroundSupportClone(t, a)
	enemy := b.spawn("IR.tank", 2, Vec{X: 54000, Y: 12000}, true, 1600000)
	b.player(2).Credits = 99000000
	b.entity(3).Jobs = []Job{{Type: "IR.tank", Paid: 9912345, Started: true}}
	b.player(3).Credits = 88000000
	for _, v := range b.state.Entities {
		if v.Owner == 3 && v.Building {
			v.Jobs = []Job{{Type: "SY.engineer", Paid: 987654, Started: true}}
			v.Rally = Vec{X: 12000, Y: 52000}
		}
	}
	a.updateFog()
	b.updateFog()
	av, _ := a.PlayerView(1)
	bv, _ := b.PlayerView(1)
	if b.canSeeEntity(1, enemy) || !reflect.DeepEqual(av, bv) {
		t.Fatal("hidden/private controls altered complete authorized View")
	}
	for _, e := range []*Engine{a, b} {
		e.player(1).AI, e.player(1).AILast = "hard", e.Tick()-seconds(1)
		e.updateAI()
	}
	x, _ := json.Marshal(a.state.Pending)
	y, _ := json.Marshal(b.state.Pending)
	if !bytes.Equal(x, y) || !reflect.DeepEqual(aiGroundSupportPending(a, source), aiGroundSupportPending(b, source)) || a.player(1).AIScout != b.player(1).AIScout || a.player(1).AIGoal != b.player(1).AIGoal || a.player(1).AIStage != b.player(1).AIStage {
		t.Fatal("support complete chosen plans or saved cursors used hidden/private state")
	}
	if orders := aiGroundSupportPending(a, source); len(orders) != 1 || orders[0].Kind != "stop" {
		t.Fatal("hidden/private parity lacked useful selected support recovery", orders)
	}
}
