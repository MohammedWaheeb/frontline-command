package sim

import (
	"reflect"
	"slices"
	"testing"
)

// Synthetic starting power and barracks are seeded. The reconnaissance squad is
// bought through ordinary production, then all stance and movement changes use
// public submissions. The inherited recorder checks full and checkpoint replay.
func reconObservePaidFixture(t *testing.T, faction string) (*channelContinuationRun, *Entity) {
	t.Helper()
	return reconObservePreparedFixture(t, faction, "IR", nil)
}

func reconObservePreparedFixture(t *testing.T, faction, enemyFaction string, prepare func(*Engine)) (*channelContinuationRun, *Entity) {
	t.Helper()
	e := channelContinuationFixture(t, faction, enemyFaction)
	e.spawn("power", 1, Vec{X: 14000, Y: 20000}, true, 0)
	producer := e.spawn("barracks", 1, Vec{X: 21000, Y: 21000}, true, 0)
	if prepare != nil {
		prepare(e)
	}
	r := channelContinuationRecord(t, e)
	u, ok := e.catalog.Unit(faction + ".recon")
	if !ok {
		t.Fatal("missing canonical reconnaissance squad")
	}
	credits, spent := e.player(1).Credits, e.player(1).Spent
	r.issue(1, Order{Kind: "train", Type: u.ID, Entities: []ID{producer.ID}})
	var actor *Entity
	for n := uint32(0); n <= u.BuildTicks+2; n++ {
		for _, v := range e.state.Entities {
			if v.Owner == 1 && v.Type == u.ID {
				actor = v
			}
		}
		if actor != nil {
			break
		}
		r.step()
	}
	if actor == nil || actor.Paid != u.Cost || e.player(1).Credits != credits-u.Cost || e.player(1).Spent != spent+u.Cost || e.player(1).Supply != u.Supply || e.player(1).ReservedSupply != 0 {
		t.Fatal("ordinary paid reconnaissance production did not complete")
	}
	goal := Vec{X: 20500, Y: 30500}
	r.issue(1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
	for n := Tick(0); n < seconds(10) && len(actor.Orders) != 0; n++ {
		r.step()
	}
	if len(actor.Orders) != 0 || distance(actor.Position, goal) > 180 {
		t.Fatal("ordinary reconnaissance movement did not reach the test position")
	}
	r.issue(1, Order{Kind: "hold", Entities: []ID{actor.ID}})
	return r, actor
}

func reconObserveEvent(t *testing.T, e *Engine, actor *Entity, kind string, count int) {
	t.Helper()
	reconObserveEventAt(t, e, actor, kind, count, actor.Position)
}

func reconObserveEventAt(t *testing.T, e *Engine, actor *Entity, kind string, count int, position Vec) {
	t.Helper()
	got := 0
	for _, event := range e.state.Events {
		if event.Kind != kind || event.Entity != actor.ID {
			continue
		}
		got++
		if event.Owner != actor.Owner || event.Scope != "owner" || event.Position != position || event.Tick != e.Tick() || event.Value != 0 || event.Text != "" {
			t.Fatal("Observe event disclosed unexpected data", event)
		}
	}
	if got != count {
		t.Fatalf("Observe event %s count=%d want=%d", kind, got, count)
	}
	for _, player := range e.state.Players {
		feedback, _ := e.PlayerFeedback(player.ID)
		for _, event := range feedback.Events {
			if event.Kind == kind && event.Entity == actor.ID && player.ID != actor.Owner {
				t.Fatal("Observe owner event leaked to another player", player.ID, event)
			}
		}
	}
}

func reconObserveOwnedView(t *testing.T, e *Engine, actor *Entity) EntityView {
	t.Helper()
	view, ok := e.PlayerView(actor.Owner)
	if !ok {
		t.Fatal("owned view missing")
	}
	for _, v := range view.Entities {
		if v.ID == actor.ID {
			if v.Private == nil || v.Private.Ranges == nil {
				t.Fatal("owned Observe state/ranges missing")
			}
			return v
		}
	}
	t.Fatal("owned reconnaissance squad omitted")
	return EntityView{}
}

func TestReconObservePublicPaidChannelSightAndPersistence(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			r, actor := reconObservePaidFixture(t, faction)
			e := r.e
			position := actor.Position
			probe := Vec{X: position.X + 12500, Y: position.Y}
			before := reconObserveOwnedView(t, e, actor)
			credits, spent, supply, hp := e.player(1).Credits, e.player(1).Spent, e.player(1).Supply, actor.HP
			energy, tick := e.player(1).Energy, e.Tick()
			weapon, armed := e.weapon(actor)
			if e.canSee(1, probe) || before.Private.ReconObserve {
				t.Fatal("fixture already has Observe sight")
			}
			options, err := e.CommandAffordances(1, []ID{actor.ID})
			if err != nil || len(options.Entities) != 1 || !slices.Contains(options.Entities[0].Abilities, "observe") {
				t.Fatal("canonical recon Observe affordance missing", err)
			}
			r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
			start, completion := e.Tick(), actor.ChannelUntil
			if actor.ReconObserve || actor.Channel != "observe" || actor.ChannelDuration != 40 || completion != start+40 || actor.Anchor != position || actor.Stance != "hold" || len(actor.Orders) != 0 {
				t.Fatal("Observe admission changed its exact channel/anchor law")
			}
			reconObserveEvent(t, e, actor, "observe_started", 1)
			pending := reconObserveOwnedView(t, e, actor)
			if pending.Private.ReconObserve || pending.State != "observe" || pending.ChannelUntil != completion || pending.Progress != 0 || pending.Private.Ranges.SightRadius != before.Private.Ranges.SightRadius {
				t.Fatal("pending Observe was exposed as active or granted early sight")
			}
			r.to(start + 20)
			r.checkpoint()
			if reconObserveOwnedView(t, e, actor).Progress != 500 {
				t.Fatal("Observe midpoint progress is not its actual channel clock")
			}
			r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
			if actor.ChannelUntil != completion || actor.ChannelDuration != 40 || actor.ReconObserve {
				t.Fatal("repeated On restarted or completed Observe")
			}
			reconObserveEvent(t, e, actor, "observe_started", 0)
			r.to(completion - 1)
			if actor.ReconObserve || e.canSee(1, probe) || actor.Position != position {
				t.Fatal("Observe granted sight or moved before its 40-tick completion")
			}
			r.to(completion)
			active := reconObserveOwnedView(t, e, actor)
			if !actor.ReconObserve || !active.Private.ReconObserve || actor.Channel != "" || actor.ChannelDuration != 0 || actor.ChannelUntil != 0 || actor.Position != position || actor.Anchor != position || len(actor.Orders) != 0 || actor.Stance != "hold" || !e.canSee(1, probe) {
				t.Fatal("Observe did not activate at its exact stationary completion")
			}
			if active.Private.Ranges.SightRadius != before.Private.Ranges.SightRadius+3000 || active.Private.Ranges.DetectionRadius != before.Private.Ranges.DetectionRadius || actor.HP != hp || e.player(1).Credits != credits || e.player(1).Spent != spent || e.player(1).Supply != supply {
				t.Fatal("Observe changed detection, health, or paid resources")
			}
			currentWeapon, currentArmed := e.weapon(actor)
			if currentWeapon != weapon || currentArmed != armed || e.armor(actor) != "infantry" || e.player(1).Energy != energy+int64(e.Tick()-tick)*25 {
				t.Fatal("Observe changed the weapon/armor or charged Command Energy")
			}
			reconObserveEvent(t, e, actor, "observe_ready", 1)
			r.checkpoint()
			r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
			if !actor.ReconObserve || actor.Channel != "" {
				t.Fatal("repeated active On toggled or restarted Observe")
			}
			reconObserveEvent(t, e, actor, "observe_started", 0)
			reconObserveEvent(t, e, actor, "observe_ready", 0)
			r.issue(1, Order{Kind: "ability", Type: "observe", Index: 1, Entities: []ID{actor.ID}})
			if actor.ReconObserve || actor.Channel != "" || reconObserveOwnedView(t, e, actor).Private.Ranges.SightRadius != before.Private.Ranges.SightRadius || e.canSee(1, probe) {
				t.Fatal("explicit Off failed to remove Observe sight")
			}
			reconObserveEvent(t, e, actor, "observe_canceled", 1)
			r.issue(1, Order{Kind: "ability", Type: "observe", Index: 1, Entities: []ID{actor.ID}})
			reconObserveEvent(t, e, actor, "observe_canceled", 0)
			r.finish()
		})
	}
}

func TestReconObservePublicQueuedMovementCancels(t *testing.T) {
	for _, active := range []bool{false, true} {
		t.Run(map[bool]string{false: "pending", true: "active"}[active], func(t *testing.T) {
			r, actor := reconObservePaidFixture(t, "US")
			e := r.e
			r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
			completion, start := actor.ChannelUntil, actor.Position
			if active {
				r.to(completion)
			}
			r.checkpoint()
			goal := Vec{X: start.X, Y: start.Y + 3000}
			r.issue(1, Order{Kind: "move", Queued: true, Entities: []ID{actor.ID}, Position: goal})
			if actor.ReconObserve || actor.Channel != "" || actor.Position == start || len(actor.Orders) == 0 || actor.Orders[0].Kind != "move" {
				t.Fatal("queued first movement left Observe pending/active or failed to move")
			}
			reconObserveEventAt(t, e, actor, "observe_canceled", 1, start)
			r.to(e.Tick() + 40)
			if actor.ReconObserve || reconObserveOwnedView(t, e, actor).Private.ReconObserve {
				t.Fatal("canceled channel later reactivated Observe")
			}
			r.finish()
		})
	}
}

func TestReconObservePublicOffPreservesUnrelatedIntent(t *testing.T) {
	r, actor := reconObservePaidFixture(t, "US")
	goal := Vec{X: actor.Position.X, Y: actor.Position.Y + 4000}
	r.issue(1, Order{Kind: "move", Entities: []ID{actor.ID}, Position: goal})
	orders, anchor := cloneOrders(actor.Orders), actor.Anchor
	r.issue(1, Order{Kind: "ability", Type: "observe", Index: 1, Entities: []ID{actor.ID}})
	if !reflect.DeepEqual(actor.Orders, orders) || actor.Anchor != anchor || actor.ReconObserve || actor.Channel != "" {
		t.Fatal("idempotent Off discarded unrelated movement intent")
	}
	reconObserveEvent(t, r.e, actor, "observe_canceled", 0)
	r.checkpoint()
	r.to(r.e.Tick() + 30)
	r.finish()
}

func TestReconObservePublicOffCancelsPendingWithoutRestart(t *testing.T) {
	r, actor := reconObservePaidFixture(t, "IR")
	e := r.e
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	completion := actor.ChannelUntil
	r.to(e.Tick() + 10)
	r.checkpoint()
	r.issue(1, Order{Kind: "ability", Type: "observe", Index: 1, Entities: []ID{actor.ID}})
	if actor.ReconObserve || actor.Channel != "" || actor.ChannelUntil != 0 || actor.ChannelDuration != 0 || len(actor.Orders) != 0 || actor.Stance != "hold" {
		t.Fatal("explicit Off did not cancel pending Observe")
	}
	reconObserveEvent(t, e, actor, "observe_canceled", 1)
	r.to(completion + 1)
	if actor.ReconObserve {
		t.Fatal("explicit Off left a pending activation behind")
	}
	r.finish()
}

func TestReconObservePublicSightDoesNotDetectConcealedSquads(t *testing.T) {
	var target *Entity
	r, actor := reconObservePreparedFixture(t, "US", "SY", func(e *Engine) {
		position := Vec{X: 32500, Y: 30500}
		e.state.Map.Tiles[position.Y/1000*e.state.Map.Width+position.X/1000].Terrain = "cover"
		target = e.spawn("SY.rifle", 3, position, true, 250000)
	})
	e := r.e
	if !target.Concealed || e.canSee(1, target.Position) || e.canSeeEntity(1, target) {
		t.Fatal("concealed squad fixture was exposed before Observe")
	}
	detection := reconObserveOwnedView(t, e, actor).Private.Ranges.DetectionRadius
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	r.to(actor.ChannelUntil)
	if !actor.ReconObserve || !e.canSee(1, target.Position) || !target.Concealed || e.canSeeEntity(1, target) || e.detectsConcealment(actor, target) || reconObserveOwnedView(t, e, actor).Private.Ranges.DetectionRadius != detection {
		t.Fatal("Observe confused added terrain sight with added concealment detection")
	}
	for _, owner := range []PlayerID{1, 2} {
		view, _ := e.PlayerView(owner)
		for _, entity := range view.Entities {
			if entity.ID == target.ID {
				t.Fatal("Observe transmitted a concealed enemy squad", owner)
			}
		}
	}
	r.checkpoint()
	r.to(e.Tick() + 10)
	r.finish()
}

func TestReconObservePublicAutomaticFireRetainsStationaryStance(t *testing.T) {
	var target *Entity
	r, actor := reconObservePreparedFixture(t, "US", "IR", func(e *Engine) {
		target = e.spawn("IR.engineer", 3, Vec{X: 24500, Y: 37500}, true, 400000)
	})
	e := r.e
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	r.to(actor.ChannelUntil)
	position, hp := actor.Position, target.HP
	r.checkpoint()
	r.issue(3, Order{Kind: "move", Entities: []ID{target.ID}, Position: Vec{X: position.X + 2500, Y: position.Y}})
	for n := Tick(0); n < seconds(6); n++ {
		r.step()
		if actor.EverDealt && actor.AimUntil > e.Tick() {
			break
		}
	}
	if !actor.EverDealt || target.HP >= hp || actor.AimUntil <= e.Tick() || actor.Target != target.ID || !actor.ReconObserve || actor.Position != position || len(actor.Orders) != 0 || actor.Stance != "hold" {
		t.Fatal("ordinary stationary automatic fire did not retain Observe")
	}
	aim := actor.AimUntil
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	if actor.AimUntil != aim || actor.Target != target.ID || !actor.ReconObserve || actor.Position != position || actor.Channel != "" {
		t.Fatal("idempotent On reset an ongoing automatic aim or restarted Observe")
	}
	reconObserveEvent(t, e, actor, "observe_started", 0)
	reconObserveEvent(t, e, actor, "observe_canceled", 0)
	for _, owner := range []PlayerID{2, 3} {
		view, _ := e.PlayerView(owner)
		found := false
		for _, entity := range view.Entities {
			if entity.ID == actor.ID {
				found = true
				if entity.Private != nil {
					t.Fatal("Observe private flag/ranges leaked", owner)
				}
			}
		}
		if !found {
			t.Fatal("visible nonowned actor needed for privacy check was absent", owner)
		}
	}
	r.checkpoint()
	r.to(e.Tick() + 10)
	r.finish()
}

func TestReconObservePublicExplicitAttackCancels(t *testing.T) {
	var target *Entity
	r, actor := reconObservePreparedFixture(t, "US", "IR", func(e *Engine) {
		target = e.spawn("IR.engineer", 3, Vec{X: 27500, Y: 30500}, true, 400000)
	})
	e := r.e
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	r.to(actor.ChannelUntil)
	r.checkpoint()
	position := actor.Position
	r.issue(1, Order{Kind: "attack", Entities: []ID{actor.ID}, Target: target.ID})
	if actor.ReconObserve || actor.Channel != "" || len(actor.Orders) == 0 || actor.Orders[0].Kind != "attack" || actor.Orders[0].Target != target.ID {
		t.Fatal("explicit accepted attack retained Observe or lost the new intent")
	}
	reconObserveEventAt(t, e, actor, "observe_canceled", 1, position)
	r.to(e.Tick() + 40)
	if !actor.EverDealt || actor.ReconObserve {
		t.Fatal("ordinary explicit attack did not fire after canceling Observe")
	}
	r.finish()
}

func TestReconObservePublicDamageInterruptsPendingChannel(t *testing.T) {
	var attacker *Entity
	r, actor := reconObservePreparedFixture(t, "US", "IR", func(e *Engine) {
		attacker = e.spawn("IR.car", 3, Vec{X: 20500, Y: 38500}, true, 500000)
		// Face the incoming threat toward the observation position before recording;
		// the test isolates damage interruption within the unchanged 40-tick channel.
		attacker.Facing, attacker.TurretFacing = 270000, 270000
	})
	e := r.e
	hp := actor.HP
	r.issue(1, Order{Kind: "ability", Type: "observe", Entities: []ID{actor.ID}})
	completion := actor.ChannelUntil
	r.checkpoint()
	r.issue(3, Order{Kind: "attack", Entities: []ID{attacker.ID}, Target: actor.ID})
	for e.Tick() < completion && actor.Channel == "observe" {
		r.step()
	}
	if actor.HP >= hp || actor.Channel != "" || actor.ChannelUntil != 0 || actor.ChannelDuration != 0 || actor.ReconObserve || e.Tick() >= completion {
		t.Fatalf("ordinary incoming damage failed to interrupt pending Observe: tick=%d completion=%d hp=%d originalHP=%d actor=%+v attacker=%+v edgeDistance=%d visible=%v", e.Tick(), completion, actor.HP, hp, *actor, *attacker, e.edgeDistance(attacker, actor), e.canSeeEntity(attacker.Owner, actor))
	}
	reconObserveEvent(t, e, actor, "observe_canceled", 1)
	r.to(completion)
	if actor.ReconObserve || actor.HP <= 0 {
		t.Fatal("interrupted pending channel reactivated or fixture lost its actor")
	}
	r.finish()
}
