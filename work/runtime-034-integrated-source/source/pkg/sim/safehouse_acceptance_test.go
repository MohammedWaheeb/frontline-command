package sim

import (
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

type safehouseSetup struct {
	engine              *Engine
	source, destination ID
	passengers          []ID
}

// Synthetic geometry only. Passengers enter through ordinary accepted orders.
func safehouseAcceptanceFixture(t *testing.T, mode string) safehouseSetup {
	t.Helper()
	e, err := New(content.MustBase(), Config{Map: fixtureMap(), Seed: 913, Players: []PlayerConfig{{ID: 1, Faction: "SY", Team: 1}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	source := e.spawn("SY.safehouse", 1, Vec{X: 14000, Y: 18000}, true, 800000)
	destination := e.spawn("SY.safehouse", 1, Vec{X: 38000, Y: 36000}, true, 800000)
	a := e.spawn("SY.rifle", 1, Vec{X: 12000, Y: 18000}, true, 250000)
	b := e.spawn("SY.engineer", 1, Vec{X: 16000, Y: 18000}, true, 500000)
	a.HP, b.HP = 123456, 99999
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{a.ID, b.ID}, Target: source.ID})
	ticks(e, 40)
	if a.Container != source.ID || b.Container != source.ID {
		t.Fatal("fixture did not board through ordinary channels")
	}
	switch mode {
	case "prepared":
		e.player(1).Upgrades = []string{"SY.prepared_exits"}
	case "rapid":
		e.player(1).Upgrades = []string{"SY.prepared_exits"}
		setCooldown(&e.player(1).Cooldowns, "rapid_transfer_window", e.Tick()+seconds(10))
	}
	return safehouseSetup{e, source.ID, destination.ID, []ID{a.ID, b.ID}}
}

func transportImpact(e *Engine, target ID, at Tick, lethal bool) {
	unit, _ := e.catalog.Unit("IR.rifle")
	if e.armor(e.entity(target)) == "air" {
		unit, _ = e.catalog.Unit("IR.aa")
	}
	amount := int64(1000)
	if lethal {
		amount = 20000000
	}
	position := e.entity(target).Position
	e.state.Projectiles = append(e.state.Projectiles, &Projectile{ID: e.newID(), Owner: 2, Target: target, Weapon: unit.Weapon, Origin: position, Position: position, Impact: position, ImpactAt: at, Damage: amount})
}

func transferOrder(s safehouseSetup) Order {
	return Order{Kind: "ability", Type: "transfer", Entities: []ID{s.source}, Target: s.destination}
}
func safehousePassengersRemain(t *testing.T, e *Engine, s safehouseSetup) {
	t.Helper()
	if len(e.entity(s.source).Passengers) != len(s.passengers) {
		t.Fatal("source capacity changed after cancellation")
	}
	for _, id := range s.passengers {
		if e.entity(id) == nil || e.entity(id).Container != s.source || e.entity(id).Position != e.entity(s.source).Position {
			t.Fatal("canceled passenger left source", id)
		}
	}
}

func TestSafehouseDamageCancelsAtEveryPreparationTick(t *testing.T) {
	for _, mode := range []string{"normal", "prepared", "rapid"} {
		t.Run(mode, func(t *testing.T) {
			setup := safehouseAcceptanceFixture(t, mode)
			save, err := setup.engine.Save()
			if err != nil {
				t.Fatal(err)
			}
			duration := setup.engine.transferDuration(1)
			for _, endpoint := range []ID{setup.source, setup.destination} {
				for offset := Tick(0); offset <= duration; offset++ {
					e, err := Restore(setup.engine.catalog, save)
					if err != nil {
						t.Fatal(err)
					}
					s := setup
					s.engine = e
					start := e.Tick() + 1
					transportImpact(e, endpoint, start+offset, false)
					issue(t, e, 1, transferOrder(s))
					for e.Tick() < start+offset {
						e.Advance()
					}
					if e.entity(endpoint).LastDamage != start+offset || e.entity(s.source).Channel != "" {
						t.Fatalf("endpoint=%d offset=%d/%d failed same-tick cancellation", endpoint, offset, duration)
					}
					safehousePassengersRemain(t, e, s)
					if e.entity(s.passengers[0]).HP != 123456 || e.entity(s.passengers[1]).HP != 99999 {
						t.Fatal("nonlethal house damage injured occupants")
					}
					canceled := 0
					for _, event := range e.state.Events {
						if event.Kind == "transfer_canceled" {
							canceled++
						}
					}
					if canceled != 1 {
						t.Fatal("cancellation must emit exactly one owner event", canceled)
					}
				}
			}
			t.Logf("mode=%s duration=%d: %d source/destination impact boundaries canceled atomically; full passenger HP preserved", mode, duration, 2*(duration+1))
		})
	}
}

func TestSafehouseEndpointLossBeforeAtAndAfterCompletion(t *testing.T) {
	for _, mode := range []string{"normal", "prepared", "rapid"} {
		setup := safehouseAcceptanceFixture(t, mode)
		save, _ := setup.engine.Save()
		duration := setup.engine.transferDuration(1)
		for _, sourceLost := range []bool{false, true} {
			for _, offset := range []Tick{0, duration / 2, duration, duration + 1} {
				t.Run(fmt.Sprintf("%s-source-%v-tick-%d", mode, sourceLost, offset), func(t *testing.T) {
					e, err := Restore(setup.engine.catalog, save)
					if err != nil {
						t.Fatal(err)
					}
					s := setup
					s.engine = e
					target := s.destination
					if sourceLost {
						target = s.source
					}
					start := e.Tick() + 1
					transportImpact(e, target, start+offset, true)
					issue(t, e, 1, transferOrder(s))
					for e.Tick() < start+offset {
						e.Advance()
					}
					if e.entity(target) != nil {
						t.Fatal("scheduled lethal projectile did not destroy endpoint")
					}
					for i, id := range s.passengers {
						unit := e.entity(id)
						if unit == nil {
							t.Fatal("legal escape incorrectly lost passenger")
						}
						initial := []int64{123456, 99999}[i]
						if offset <= duration && !sourceLost {
							if unit.Container != s.source || unit.HP != initial {
								t.Fatal("destination loss moved or injured source passenger")
							}
						} else if offset <= duration {
							if unit.Container != 0 || unit.HP != initial/2 || distance(unit.Position, setup.engine.entity(s.source).Position) > 4200 {
								t.Fatal("source destruction did not apply ground garrison escape", unit.HP, unit.Position)
							}
						} else if unit.Container != 0 || unit.HP != initial || distance(unit.Position, setup.engine.entity(s.destination).Position) > 4200 {
							t.Fatal("post-completion loss retroactively changed transfer")
						}
					}
				})
			}
		}
	}
}

func TestSafehouseExitLockBlocksCaptureForTwoSeconds(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "rapid")
	e := s.engine
	issue(t, e, 1, transferOrder(s))
	ticks(e, 60)
	engineer := e.entity(s.passengers[1])
	if engineer.Container != 0 || !e.hasBuff(engineer, "exit_lock") {
		t.Fatal("transfer did not produce locked exit")
	}
	target := e.spawn("power", 2, Vec{X: engineer.Position.X + 2500, Y: engineer.Position.Y}, true, 500000)
	target.HP = target.MaxHP / 5
	e.updateFog()
	order := Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID}
	if code := e.execute(1, order); code == "ok" {
		t.Fatal("fresh safehouse exit can capture before its two-second lock expires")
	}
	ticks(e, 39)
	if code := e.execute(1, order); code == "ok" {
		t.Fatal("exit capture lock expired a tick early")
	}
	e.Advance()
	if code := e.execute(1, order); code != "ok" {
		t.Fatal("exit capture lock did not release after exactly two seconds", code)
	}
}

func TestSafehouseTransferWarningsOnlyRevealVisibleDestinationAtFinalThreeSeconds(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	observer := e.spawn("IR.recon", 2, Vec{X: 44000, Y: 36000}, true, 300000)
	observer.Stance = "hold"
	e.updateFog()
	if e.canSee(2, e.entity(s.source).Position) || !e.canSee(2, e.entity(s.destination).Position) {
		t.Fatal("invalid fog fixture")
	}
	issue(t, e, 1, transferOrder(s))
	completion := e.entity(s.source).ChannelUntil
	for e.Tick() < completion-seconds(3)-1 {
		e.Advance()
	}
	view, _ := e.PlayerView(2)
	for _, warning := range view.Warnings {
		if warning.Kind == "transfer" {
			t.Fatal("exit warning began early")
		}
	}
	e.Advance()
	view, _ = e.PlayerView(2)
	found := 0
	for _, warning := range view.Warnings {
		if warning.Kind == "transfer" {
			found++
			if warning.Position != e.entity(s.destination).Position || warning.At != completion || warning.Source != 0 || len(warning.Exits) != 0 {
				t.Fatal("warning leaks a hidden source or unrelated geometry", warning)
			}
		}
	}
	if found != 1 {
		t.Fatal("visible destination missing final-three-second warning", found)
	}
	observer.Position = Vec{X: 60000, Y: 56000}
	e.updateFog()
	view, _ = e.PlayerView(2)
	for _, warning := range view.Warnings {
		if warning.Kind == "transfer" {
			t.Fatal("warning revealed a fogged destination")
		}
	}
}

func sealTransportArea(e *Engine, center Vec, sealed bool) {
	terrain := "open"
	if sealed {
		terrain = "blocked"
	}
	for y := center.Y/1000 - 4; y <= center.Y/1000+4; y++ {
		for x := center.X/1000 - 4; x <= center.X/1000+4; x++ {
			e.state.Map.Tiles[y*e.state.Map.Width+x].Terrain = terrain
		}
	}
	e.state.NavigationRevision++
	e.updateFog()
}

func TestSafehouseBlockedAcceptanceCompletionAndRetryAreAtomic(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "rapid")
	e := s.engine
	destination := e.entity(s.destination)
	sealTransportArea(e, destination.Position, true)
	issueRejected := func(code string) {
		t.Helper()
		if err := e.Submit(1, e.player(1).LastSequence+1, []Order{transferOrder(s)}); err != nil {
			t.Fatal(err)
		}
		e.Advance()
		if len(e.state.Results) != 1 || e.state.Results[0].Code != code {
			t.Fatal("unexpected transfer result", e.state.Results)
		}
	}
	issueRejected("exit_blocked")
	if !cooldown(e.player(1).Cooldowns, "rapid_transfer_window", e.Tick()) {
		t.Fatal("illegal attempt consumed rapid transfer")
	}
	safehousePassengersRemain(t, e, s)
	sealTransportArea(e, destination.Position, false)
	issue(t, e, 1, transferOrder(s))
	if e.entity(s.source).ChannelUntil-e.Tick() != 60 {
		t.Fatal("legal retry did not use the retained rapid window")
	}
	sealTransportArea(e, destination.Position, true)
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	ticks(e, 60)
	ticks(restored, 60)
	if e.Hash() != restored.Hash() {
		t.Fatal("blocked completion diverged across save/restore")
	}
	safehousePassengersRemain(t, e, s)
	if e.entity(s.source).Channel != "" {
		t.Fatal("blocked completion did not cancel")
	}
	sealTransportArea(e, destination.Position, false)
	issue(t, e, 1, transferOrder(s))
	if e.entity(s.source).ChannelUntil-e.Tick() != 100 {
		t.Fatal("accepted interrupted rapid transfer was incorrectly refunded or stacked")
	}
	ticks(e, 100)
	for _, id := range s.passengers {
		if e.entity(id).Container != 0 {
			t.Fatal("clearing exits did not permit a fresh transfer")
		}
	}
}

func TestSafehouseSimultaneousTransfersSerializeAndUnloadCancels(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	other := e.spawn("SY.safehouse", 1, Vec{X: 24000, Y: 36000}, true, 800000)
	passenger := e.spawn("SY.rifle", 1, Vec{X: 22000, Y: 36000}, true, 250000)
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{passenger.ID}, Target: other.ID})
	ticks(e, 40)
	if passenger.Container != other.ID {
		t.Fatal("second source failed to board")
	}
	orders := []Order{transferOrder(s), {Kind: "ability", Type: "transfer", Entities: []ID{other.ID}, Target: s.destination}}
	if err := e.Submit(1, e.player(1).LastSequence+1, orders); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || e.state.Results[1].Code != "transfer_active" {
		t.Fatal("simultaneous transfers were not serialized", e.state.Results)
	}
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{s.source}})
	if e.entity(s.source).Channel == "transit" {
		t.Fatal("explicit unload did not cancel preparation")
	}
	canceled := 0
	for _, event := range e.state.Events {
		if event.Kind == "transfer_canceled" {
			canceled++
		}
	}
	if canceled != 1 {
		t.Fatal("manual cancellation did not emit one owner warning", canceled)
	}
	ticks(e, 40)
	for _, id := range s.passengers {
		if e.entity(id).Container != 0 || distance(e.entity(id).Position, e.entity(s.source).Position) > 4200 {
			t.Fatal("canceled transfer unloaded at wrong endpoint")
		}
	}
	issue(t, e, 1, orders[1])
	ticks(e, 120)
	if passenger.Container != 0 || distance(passenger.Position, e.entity(s.destination).Position) > 4200 {
		t.Fatal("canceled source retained the per-player transfer reservation")
	}
}

func TestSafehouseTransferSaveReplayAndExactExitFireLock(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	enemy := e.spawn("IR.rig", 2, Vec{X: 41500, Y: 36000}, true, 1200000)
	enemy.Stance = "hold"
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	issue(t, e, 1, transferOrder(s))
	until := e.entity(s.source).ChannelUntil
	for e.Tick() < until-1 {
		e.Advance()
	}
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	restored.Advance()
	if e.Hash() != restored.Hash() {
		t.Fatal("completion diverged across boundary restore")
	}
	rifle := e.entity(s.passengers[0])
	before := enemy.HP
	for range 39 {
		e.Advance()
		restored.Advance()
	}
	if rifle.EverDealt || enemy.HP != before {
		t.Fatal("exit fired before two-second lock")
	}
	for range 60 {
		e.Advance()
		restored.Advance()
	}
	if !rifle.EverDealt || enemy.HP >= before || e.Hash() != restored.Hash() {
		t.Fatal("ordinary fire did not resume deterministically after exit lock")
	}
	if err = replay.Capture(e, true); err != nil {
		t.Fatal(err)
	}
	encoded, err := replay.Encode()
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := DecodeReplay(encoded)
	if err != nil {
		t.Fatal(err)
	}
	seeked, err := loaded.Seek(e.catalog, e.Tick())
	if err != nil || seeked.Hash() != e.Hash() {
		t.Fatal("transfer replay differs", err)
	}
	t.Logf("transfer started=%d completed=%d; save at tick%d; replayed to tick%d hash=%s", until-120, until, until-1, e.Tick(), e.Hash())
}

func TestSafehousePreparationCannotPickUpLateBoarders(t *testing.T) {
	s := safehouseAcceptanceFixture(t, "normal")
	e := s.engine
	issue(t, e, 1, Order{Kind: "unload", Entities: []ID{s.source}})
	ticks(e, 40)
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{s.passengers[0]}, Target: s.source})
	ticks(e, 40)
	issue(t, e, 1, Order{Kind: "board", Entities: []ID{s.passengers[1]}, Target: s.source})
	if e.entity(s.passengers[1]).Channel != "board" {
		t.Fatal("late boarder did not start")
	}
	issue(t, e, 1, transferOrder(s))
	for range 120 {
		if e.entity(s.passengers[1]).Container != 0 {
			t.Fatal("unselected late boarder entered a transfer already preparing")
		}
		e.Advance()
	}
	if e.entity(s.passengers[0]).Container != 0 || distance(e.entity(s.passengers[0]).Position, e.entity(s.destination).Position) > 4200 {
		t.Fatal("original passenger failed to transfer")
	}
	if distance(e.entity(s.passengers[1]).Position, e.entity(s.source).Position) > 4200 {
		t.Fatal("late boarder bypassed preparation duration")
	}
}
