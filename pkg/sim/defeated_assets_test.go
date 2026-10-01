package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

func defeatedAssetsFixture(t *testing.T) *Engine {
	t.Helper()
	cfg := botMatrixConfig(3, false)
	for i := range cfg.Players {
		cfg.Players[i].AI = ""
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

func TestDefeatedAssetsCannotBeAttackedCapturedOrDesignated(t *testing.T) {
	e := defeatedAssetsFixture(t)
	attacker := e.spawn("US.tank", 1, Vec{X: 15000, Y: 15000}, true, 1300000)
	engineer := e.spawn("US.engineer", 1, Vec{X: 17000, Y: 15000}, true, 500000)
	recon := e.spawn("US.recon", 1, Vec{X: 15000, Y: 17000}, true, 350000)
	wreck := e.spawn("IR.tank", 2, Vec{X: 19000, Y: 15000}, true, 1200000)
	building := e.spawn("power", 2, Vec{X: 18000, Y: 18000}, true, 800000)
	building.HP = building.MaxHP / 5
	e.updateFog()
	if !e.canAttack(attacker, wreck) || !e.validCapture(engineer, building.ID) {
		t.Fatal("fixture was not targetable before defeat")
	}
	e.defeat(e.player(2))
	e.updateFog()
	if e.canAttack(attacker, wreck) {
		t.Error("inactive wreck can be attacked")
	}
	if e.validCapture(engineer, building.ID) || e.captureBuilding(1, building) {
		t.Error("inactive structure can transfer ownership")
	}
	if code := e.cast(e.player(1), []*Entity{recon}, Order{Kind: "ability", Type: "designate", Target: wreck.ID}); code == "ok" {
		t.Error("inactive wreck can be designated")
	}
	hp := wreck.HP
	e.damages = []damage{{Target: wreck.ID, Shooter: attacker.ID, Owner: 1, Amount: hp * 2, Kind: "cannon"}}
	e.resolveDamage()
	e.cleanup()
	if wreck.HP != hp || attacker.Experience != 0 || len(e.state.Salvage) != 0 || e.player(1).Kills != 0 {
		t.Error("defeated assets supplied damage, salvage or experience")
	}
}

func TestDefeatInterruptsPendingCaptureAndAbilityChannels(t *testing.T) {
	for _, kind := range []string{"capture", "designate", "sabotage"} {
		t.Run(kind, func(t *testing.T) {
			e := defeatedAssetsFixture(t)
			source := e.spawn("US.engineer", 1, Vec{X: 15000, Y: 15000}, true, 500000)
			target := e.spawn("factory", 2, Vec{X: 17000, Y: 15000}, true, 1800000)
			target.HP = target.MaxHP / 5
			e.updateFog()
			e.beginChannel(source, kind, target.ID, 1)
			e.defeat(e.player(2))
			e.state.Tick++
			e.updateFog()
			e.updateSupport()
			if target.Owner != 2 || target.DisabledUntil != 0 || len(target.Buffs) != 0 || source.Channel != "" {
				t.Fatal("channel affected an inactive defeated asset", source.Channel, target.Owner, target.DisabledUntil, target.Buffs)
			}
		})
	}
}

func TestDefeatStopsPendingOperationsAndScanSight(t *testing.T) {
	e := defeatedAssetsFixture(t)
	e.player(3).Team = e.player(2).Team
	launcher := e.spawn("IR.launcher", 2, Vec{X: 30000, Y: 30000}, true, 2000000)
	launcher.Deployed = true
	launcher.Charges = 2
	e.state.Operations = []Operation{{Kind: "second_volley", Owner: 2, Source: launcher.ID, At: 1, Points: []Vec{{X: 45000, Y: 30000}, launcher.Position}}}
	e.state.Zones = []Zone{{Kind: "scan", Owner: 2, Position: Vec{X: 30000, Y: 45000}, Radius: 3000, Start: 0, Until: 100}}
	e.updateFog()
	if !e.canSee(3, Vec{X: 30000, Y: 45000}) {
		t.Fatal("fixture scan not active")
	}
	e.defeat(e.player(2))
	e.state.Tick = 1
	e.updateFog()
	if e.canSee(3, Vec{X: 30000, Y: 45000}) {
		t.Error("defeated ally still provides scan sight")
	}
	e.updateSpecial()
	if len(e.state.Projectiles) != 0 || len(e.state.Operations) != 0 {
		t.Error("defeated launcher fired pending unfired missile")
	}
	e.state.Tick = seconds(35 * 60)
	view, _ := e.PlayerView(1)
	for _, indicator := range view.Indicators {
		if indicator.Owner == 2 {
			t.Error("inactive structure receives endgame indicator")
		}
	}
}

func TestAlreadyFiredProjectileSurvivesShooterDefeatWithoutWreckRewards(t *testing.T) {
	e := defeatedAssetsFixture(t)
	shooter := e.spawn("IR.tank", 2, Vec{X: 16000, Y: 16000}, true, 1200000)
	target := e.spawn("US.tank", 1, Vec{X: 20000, Y: 16000}, true, 1300000)
	target.HP = 1
	weapon, _ := e.weapon(shooter)
	e.launch(shooter, target, target.Position, weapon, weapon.Damage)
	e.defeat(e.player(2))
	e.state.Tick = 100
	e.updateProjectiles()
	e.resolveDamage()
	e.cleanup()
	if target.HP > 0 {
		t.Fatal("already fired projectile disappeared when shooter surrendered")
	}
	if shooter.Experience != 0 || shooter.Rank != 0 {
		t.Fatal("inactive wreck gained experience")
	}
}

func TestDefeatedVisibleTargetsRejectOrdersAndReleaseExistingAttack(t *testing.T) {
	e := defeatedAssetsFixture(t)
	attacker := e.spawn("US.tank", 1, Vec{X: 15000, Y: 15000}, true, 1300000)
	target := e.spawn("IR.tank", 2, Vec{X: 22000, Y: 15000}, true, 1200000)
	e.updateFog()
	issue(t, e, 1, Order{Kind: "attack", Entities: []ID{attacker.ID}, Target: target.ID})
	e.defeat(e.player(2))
	e.Advance()
	if len(attacker.Orders) != 0 || attacker.Target != 0 {
		t.Fatal("visible inactive target leaves an attack stuck")
	}
	if err := e.Submit(1, e.player(1).LastSequence+1, []Order{{Kind: "attack", Entities: []ID{attacker.ID}, Target: target.ID}}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 1 || e.state.Results[0].Accepted || e.state.Results[0].Code != "inactive_target" {
		t.Fatal("inactive target accepted", e.state.Results)
	}
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 100; i++ {
		e.Advance()
		restored.Advance()
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("defeated state diverged after restore")
	}
}
