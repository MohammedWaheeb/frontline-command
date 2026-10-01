package sim

import "testing"

// These are explicitly prepared mechanics worlds, not natural bot openings.
// The hub/prerequisites come from the existing qualified drone fixture. Every
// Shahed in the paid cases is subsequently bought through ordinary Submit/train.
func shahedPreparedV1(t *testing.T, target bool, aa bool) (*balanceRun, ID, *Entity, *Entity) {
	t.Helper()
	e, home := droneServiceFixture(t)
	var enemy, friendly *Entity
	if target {
		enemy = e.spawn("US.engineer", 2, Vec{X: 60000, Y: 35000}, true, 400000)
		friendly = e.spawn("IR.repair", 1, Vec{X: 61000, Y: 35000}, true, 600000)
		// A stationary unarmed owned observer gives ordinary current sight; the
		// test never grants omniscience or queries hidden target state to issue orders.
		e.spawn("IR.engineer", 1, Vec{X: 62000, Y: 37000}, true, 400000)
		e.player(1).Credits -= 1000000
		e.player(1).Spent += 1000000
		e.player(2).Credits -= 400000
		e.player(2).Spent += 400000
	}
	if aa {
		rule, _ := e.catalog.Unit("US.aa")
		defender := e.spawn("US.aa", 2, Vec{X: 55000, Y: 35000}, true, rule.Cost)
		// This prepared defense watches the declared west approach. Ordinary
		// sight, turret turning, windup, projectiles and damage still resolve it.
		defender.Facing, defender.TurretFacing = 180000, 180000
		e.player(2).Credits -= rule.Cost
		e.player(2).Spent += rule.Cost
	}
	e.recalculate()
	e.updateFog()
	return droneRecord(t, e, t.Name()), home, enemy, friendly
}

func shahedPaidTrainV1(t *testing.T, r *balanceRun, home ID) *Entity {
	t.Helper()
	e := r.e
	start, credits, spent, supply := e.Tick(), e.player(1).Credits, e.player(1).Spent, e.player(1).Supply
	r.submit(1, Order{Kind: "train", Entities: []ID{home}, Type: "IR.shahed"})
	r.step()
	jobs := e.entity(home).Jobs
	if len(jobs) != 1 || !jobs[0].Started || jobs[0].Paid != 400000 || jobs[0].Service != home || jobs[0].Supply != 1 || e.player(1).Credits != credits-400000 || e.player(1).Spent != spent+400000 || e.player(1).ReservedSupply != 1 {
		t.Fatal("Shahed did not reserve one real paid job, Supply and home slot")
	}
	for i := 1; i < 360; i++ { r.step() }
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Type == "IR.shahed" && v.Created == start+360 {
			if v.Paid != 400000 || v.Home != home || !v.Landed || v.Ammo != 1 || v.Endurance != 2400 || v.HP != 140000 || v.ShahedCommitted || e.player(1).Supply != supply+1 || e.player(1).ReservedSupply != 0 {
				t.Fatal("paid 18-second production changed initial resources or reservation")
			}
			return v
		}
	}
	t.Fatal("normal 18-second paid production did not deliver the Shahed")
	return nil
}

func shahedMoveV1(t *testing.T, r *balanceRun, v *Entity, point Vec) {
	t.Helper()
	r.submit(v.Owner, Order{Kind: "move", Entities: []ID{v.ID}, Position: point})
	for i := 0; i < 400; i++ {
		r.step()
		if v.ShahedCommitted || v.Ammo != 1 { t.Fatal("ordinary Move spent or committed the payload") }
		if len(v.Orders) == 0 && distance(v.Position, point) <= 250 { return }
	}
	t.Fatal("normal flight did not reach its declared Move point")
}

func shahedNoProjectileV1(t *testing.T, e *Engine) {
	t.Helper()
	for _, p := range e.state.Projectiles { if p.Weapon == "IR_SHAHED" { t.Fatal("one physical payload created a lingering projectile") } }
}

func TestIranShahedLifecyclePaidCapacityHeldUntilTerminal(t *testing.T) {
	r, home, _, _ := shahedPreparedV1(t, false, false)
	var drones []*Entity
	for i := 0; i < 6; i++ { drones = append(drones, shahedPaidTrainV1(t, r, home)) }
	e := r.e
	credits, spent := e.player(1).Credits, e.player(1).Spent
	r.submit(1, Order{Kind: "train", Entities: []ID{home}, Type: "IR.shahed"})
	r.step()
	if e.freeService(1) != 0 || len(e.entity(home).Jobs) != 1 || e.entity(home).Jobs[0].Started || e.player(1).Credits != credits { t.Fatal("seventh job bypassed occupied physical capacity or charged while waiting") }
	v := drones[0]
	point := Vec{X: v.Position.X+6000, Y: v.Position.Y}
	if !e.canSee(1, point) { t.Fatal("fixture attack point is not currently visible") }
	r.submit(1, Order{Kind: "force_fire", Entities: []ID{v.ID}, Position: point})
	r.step()
	if !v.ShahedCommitted || v.Landed || v.Ammo != 0 || v.Home != home || e.freeService(1) != 0 || e.player(1).Supply != 6 || e.entity(home).Jobs[0].Started { t.Fatal("commitment freed capacity, returned, or spent a second purchase") }
	for i := 0; i < 80 && e.entity(v.ID) != nil; i++ { r.step(); shahedNoProjectileV1(t, e) }
	if e.entity(v.ID) != nil || e.player(1).Supply != 5 || e.player(1).Lost != 400000 || e.player(1).Spent != spent { t.Fatal("physical terminal consumption failed exact-once Supply/loss/payment accounting") }
	r.step()
	if len(e.entity(home).Jobs) != 1 || !e.entity(home).Jobs[0].Started || e.entity(home).Jobs[0].Paid != 400000 || e.entity(home).Jobs[0].Service != home || e.player(1).Credits != credits-400000 || e.player(1).Spent != spent+400000 || e.player(1).ReservedSupply != 1 { t.Fatal("freed terminal slot did not start the waiting paid job exactly once") }
	r.finish(map[string]any{"prepared_infrastructure": true, "six_paid_aircraft": true, "seventh_waited_for_terminal_capacity": true, "one_terminal_loss": 400000})
}

func TestIranShahedLifecycleOnePhysicalImpactArmorFriendlyAndPersistence(t *testing.T) {
	r, home, enemy, friendly := shahedPreparedV1(t, true, false)
	v := shahedPaidTrainV1(t, r, home)
	shahedMoveV1(t, r, v, Vec{X: 45000, Y: 35000})
	point, enemyHP, friendlyHP := enemy.Position, enemy.HP, friendly.HP
	r.submit(1, Order{Kind: "attack", Entities: []ID{v.ID}, Target: enemy.ID})
	r.step()
	if !v.ShahedCommitted || v.LastTarget != point || v.Target != 0 || v.Ammo != 0 || len(v.Orders) != 1 || v.Orders[0].Kind != "move" || v.Orders[0].Position != point || v.Home != home { t.Fatal("active visible attack did not become a fixed physical commitment") }
	save, err := r.replay.CaptureCheckpoint(r.e)
	if err != nil { t.Fatal(err) }
	twin, err := Restore(r.e.catalog, save)
	if err != nil || twin.Hash() != r.e.Hash() { t.Fatalf("committed Save/Restore: %v", err) }
	var impacts int
	for i := 0; i < 100 && r.e.entity(v.ID) != nil; i++ {
		r.step(); twin.Advance()
		if twin.Hash() != r.e.Hash() { t.Fatal("committed continuation diverged") }
		shahedNoProjectileV1(t, r.e)
		for _, event := range r.e.state.Events { if event.Kind == "impact" && event.Combat != nil && event.Combat.Weapon == "IR_SHAHED" { impacts++ } }
	}
	if r.e.entity(v.ID) != nil || enemy.HP != enemyHP-143000 || friendly.HP != friendlyHP-110000 || impacts != 1 || r.e.player(1).Lost != 400000 { t.Fatal("single impact did not apply 65% infantry, 50% allied mechanical splash and one loss") }
	for i := 0; i < 40; i++ { r.step(); twin.Advance(); shahedNoProjectileV1(t, r.e) }
	if enemy.HP != enemyHP-143000 || friendly.HP != friendlyHP-110000 || twin.Hash() != r.e.Hash() { t.Fatal("consumed payload resurrected, rearmed or hit twice") }
	// Remove all checkpoints to prove the actual production/attack command replay.
	r.replay.Checkpoints = nil
	r.finish(map[string]any{"prepared_infrastructure_and_recipients": true, "paid_payload": 400000, "enemy_hp_damage": 143000, "friendly_hp_damage": 110000, "terminal_impacts": impacts, "committed_restore_continuation": true})
}

func TestIranShahedLifecycleActualAAKillsApproachWithoutPayload(t *testing.T) {
	r, home, enemy, _ := shahedPreparedV1(t, true, true)
	v := shahedPaidTrainV1(t, r, home)
	// The last approach is commanded from outside hostile AA sight. Its real
	// weapon launches and ordinary projectiles, not injected damage, stop this flight.
	shahedMoveV1(t, r, v, Vec{X: 44000, Y: 35000})
	t.Logf("AA staging tick=%d drone=%d pos=%+v hp=%d endurance=%d supply=%d lost=%d projectiles=%+v", r.e.Tick(), v.ID, v.Position, v.HP, v.Endurance, r.e.player(1).Supply, r.e.player(1).Lost, r.e.state.Projectiles)
	var defender *Entity
	for _, actor := range r.e.state.Entities { if actor.Type == "US.aa" { defender = actor; t.Logf("AA staging defender=%d pos=%+v anchor=%+v stance=%s orders=%+v facing=%d turret=%d target=%d fire_at=%d aim_until=%d leash=%d", actor.ID, actor.Position, actor.Anchor, actor.Stance, actor.Orders, actor.Facing, actor.TurretFacing, actor.Target, actor.FireAt, actor.AimUntil, r.e.combatLeash(actor)) } }
	if defender == nil { t.Fatal("prepared actual AA defender missing") }
	seenVisible, seenLeash := false, false
	logAA := func(reason string) { t.Logf("AA timeline reason=%s tick=%d drone_pos=%+v drone_hp=%d last_damage=%d defender_pos=%+v anchor=%+v stance=%s orders=%+v facing=%d turret=%d target=%d fire_at=%d aim_until=%d can_see=%t edge=%d anchor_distance=%d leash=%d", reason, r.e.Tick(), v.Position, v.HP, v.LastDamage, defender.Position, defender.Anchor, defender.Stance, defender.Orders, defender.Facing, defender.TurretFacing, defender.Target, defender.FireAt, defender.AimUntil, r.e.canSeeEntity(2, v), r.e.weaponDistance(defender, v), distance(defender.Anchor, v.Position), r.e.combatLeash(defender)) }
	hp := enemy.HP
	r.submit(1, Order{Kind: "attack", Entities: []ID{v.ID}, Target: enemy.ID})
	r.step()
	if !v.ShahedCommitted { t.Fatal("visible ground target did not admit commitment") }
	var aaLaunches, payloadImpacts int
	var defenseSequence uint32
	var defenseAt Tick
	defenseAccepted := false
	for i := 0; i < 100 && r.e.entity(v.ID) != nil; i++ {
		// Deliberate ordinary AA defense uses only current defender sight. The
		// original passive Guard acquired at its six-tile leash, too late for
		// this west-to-east crossing's second shot and turret reversal.
		if defenseSequence == 0 && r.e.canSeeEntity(2, v) {
			defenseAt, defenseSequence = r.e.Tick(), r.e.player(2).LastSequence+1
			r.submit(2, Order{Kind: "attack", Entities: []ID{defender.ID}, Target: v.ID})
			logAA("public_defense_submitted")
		}
		beforeHP, beforeTarget, beforeTurret, beforeAim, beforeFire := v.HP, defender.Target, defender.TurretFacing, defender.AimUntil, defender.FireAt
		r.step(); shahedNoProjectileV1(t, r.e)
		if defenseSequence != 0 && !defenseAccepted {
			for _, result := range r.e.state.Results {
				if result.Player == 2 && result.Sequence == defenseSequence && result.Index == 0 {
					if !result.Accepted || result.Code != "ok" || result.AppliedCount != 1 || len(result.EligibleEntities) != 1 || result.EligibleEntities[0] != defender.ID {
						t.Fatalf("ordinary public AA defense was not applied once to its owned source: %+v", result)
					}
					defenseAccepted = true
					t.Logf("AA public defense applied at tick=%d submitted=%d receipt=%+v", r.e.Tick(), defenseAt, result)
				}
			}
			if !defenseAccepted { t.Fatal("ordinary public AA defense execution receipt absent") }
		}
		if !seenVisible && r.e.canSeeEntity(2, v) { seenVisible = true; logAA("first_visible") }
		if !seenLeash && distance(defender.Anchor, v.Position) <= r.e.combatLeash(defender) { seenLeash = true; logAA("first_leash_legal") }
		if beforeHP != v.HP { logAA("drone_hp_changed") }
		if beforeTarget != defender.Target || beforeTurret != defender.TurretFacing || beforeAim != defender.AimUntil || beforeFire != defender.FireAt { logAA("defender_state_changed") }
		for _, event := range r.e.state.Events {
			if event.Kind == "weapon_fired" && event.Combat != nil && event.Combat.Weapon == "AA" { aaLaunches++; logAA("aa_launch"); t.Logf("AA launch event=%+v", event) }
			if event.Kind == "impact" && event.Combat != nil && event.Combat.Weapon == "AA" { logAA("aa_projectile_impact"); t.Logf("AA projectile impact event=%+v", event) }
			if event.Kind == "impact" && event.Combat != nil && event.Combat.Weapon == "IR_SHAHED" { payloadImpacts++; logAA("shahed_terminal_impact") }
		}
	}
	defenseRecorded := false
	for _, scheduled := range r.e.state.Log {
		if scheduled.Player != 2 || scheduled.Sequence != defenseSequence { continue }
		for _, order := range scheduled.Orders { if order.Kind == "attack" && order.Target == v.ID && len(order.Entities) == 1 && order.Entities[0] == defender.ID { defenseRecorded = true } }
	}
	if defenseSequence == 0 || !defenseAccepted || !defenseRecorded { t.Fatal("current-visible public AA defense was not submitted, applied and recorded for replay") }
	if r.e.entity(v.ID) != nil || aaLaunches < 2 || payloadImpacts != 0 || enemy.HP != hp || r.e.player(1).Lost != 400000 || r.e.player(1).Supply != 3 { // two prepared infantry Supply and repair truck remain
		t.Fatalf("ordinary AA failed to stop paid approach without a lingering/double payload: tick=%d alive=%t aa_launches=%d impacts=%d target_hp=%d initial_target_hp=%d lost=%d supply=%d drone_hp=%d drone_pos=%+v", r.e.Tick(), r.e.entity(v.ID) != nil, aaLaunches, payloadImpacts, enemy.HP, hp, r.e.player(1).Lost, r.e.player(1).Supply, v.HP, v.Position)
	}
	r.finish(map[string]any{"prepared_infrastructure_defense_and_recipients": true, "real_aa_launches": aaLaunches, "payload_impacts": payloadImpacts, "target_unchanged": true, "public_defense_submission_tick": defenseAt, "public_defense_applied_once": defenseAccepted, "public_defense_recorded_for_full_replay": defenseRecorded})
}

func TestIranShahedLifecycleFixedPointDoesNotFollowMovingTarget(t *testing.T) {
	r, home, enemy, _ := shahedPreparedV1(t, true, false)
	v := shahedPaidTrainV1(t, r, home)
	shahedMoveV1(t, r, v, Vec{X: 45000, Y: 35000})
	point, hp := enemy.Position, enemy.HP
	r.submit(1, Order{Kind: "attack", Entities: []ID{v.ID}, Target: enemy.ID})
	r.step()
	r.submit(2, Order{Kind: "move", Entities: []ID{enemy.ID}, Position: Vec{X: 75000, Y: 35000}})
	r.step()
	var impacts int
	for i := 0; i < 100 && r.e.entity(v.ID) != nil; i++ {
		if v.LastTarget != point || v.Target != 0 { t.Fatal("committed actor tracked a moving target identity") }
		r.step()
		for _, event := range r.e.state.Events {
			if event.Kind == "impact" && event.Combat != nil && event.Combat.Weapon == "IR_SHAHED" { impacts++; if event.Position != point { t.Fatal("impact chased new target position") } }
		}
	}
	if r.e.entity(v.ID) != nil || impacts != 1 || enemy.HP != hp || distance(enemy.Position, point) <= 1200 { t.Fatal("moving target did not escape the earned fixed-point payload") }
	r.finish(map[string]any{"prepared_infrastructure_and_recipients": true, "fixed_point": point, "terminal_impacts": impacts, "moving_target_escaped": true})
}

func TestIranShahedLifecyclePreparedContactAAAndEnduranceBoundaries(t *testing.T) {
	for _, mode := range []string{"lethal_aa_on_contact", "nonlethal_aa_on_contact", "last_endurance_tick_contact", "zero_endurance_far"} {
		t.Run(mode, func(t *testing.T) {
			e, home := droneServiceFixture(t)
			target := e.spawn("US.engineer", 2, Vec{X: 60000, Y: 35000}, true, 400000)
			v := droneFixtureActor(e, home, "IR.shahed")
			v.Landed, v.ShahedCommitted, v.Ammo, v.RepeatSortie = false, true, 0, false
			v.Position, v.LastPosition, v.LastTarget = target.Position, target.Position, target.Position
			v.Orders = []Order{{Kind: "move", Position: target.Position}}
			if mode == "zero_endurance_far" { v.Position, v.LastPosition = Vec{X: 55000, Y: 35000}, Vec{X: 55000, Y: 35000} }
			if mode == "zero_endurance_far" || mode == "last_endurance_tick_contact" { v.Endurance = 1 }
			if mode == "lethal_aa_on_contact" || mode == "nonlethal_aa_on_contact" {
				hit := int64(140000)
				if mode == "nonlethal_aa_on_contact" { hit = 70000 }
				// Explicit prepared due-projectile boundary. Ordinary updateProjectiles
				// and resolveDamage still decide survival before physical detonation.
				e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Weapon: "AA", Origin: Vec{X: 55000, Y: 35000}, Position: v.Position, Impact: v.Position, Target: v.ID, Damage: hit, ImpactAt: e.Tick()+1})
			}
			e.recalculate(); e.updateFog()
			r := droneRecord(t, e, t.Name())
			hp := target.HP
			r.step()
			want := hp
			if mode == "nonlethal_aa_on_contact" || mode == "last_endurance_tick_contact" { want -= 143000 }
			if e.entity(v.ID) != nil || target.HP != want { t.Fatal("contact/ordinary AA/last-endurance ordering changed") }
			shahedNoProjectileV1(t, e)
			r.finish(map[string]any{"prepared_boundary": mode, "target_damage": hp-target.HP, "consumed_once": true})
		})
	}
}
