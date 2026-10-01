package sim

import (
	"frontlinecommand/pkg/content"
	"testing"
)

// These synthetic starting scenes isolate channel rules. Every change after the
// initial snapshot is submitted through the ordinary public order executor.
func channelContinuationFixture(t *testing.T, faction, enemyFaction string) *Engine {
	t.Helper()
	m := fixtureMap()
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 56000, Y: 8000}})
	m.Shipment = Vec{X: 32000, Y: 44000}
	m.Stations[0].Position = Vec{X: 32000, Y: 48000}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 9041, Players: []PlayerConfig{
		{ID: 1, Name: "Caster", Faction: faction, Team: 1},
		{ID: 2, Name: "Ally", Faction: "SY", Team: 1},
		{ID: 3, Name: "Enemy", Faction: enemyFaction, Team: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	return e
}

type channelContinuationRun struct {
	t        *testing.T
	e        *Engine
	replay   *Replay
	restored *Engine
}

func channelContinuationRecord(t *testing.T, e *Engine) *channelContinuationRun {
	t.Helper()
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatalf("fixture save: %v", err)
	}
	restored, err := Restore(e.catalog, replay.Initial)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatalf("fixture restore: %v", err)
	}
	return &channelContinuationRun{t: t, e: e, replay: replay}
}

func (r *channelContinuationRun) submit(owner PlayerID, orders ...Order) {
	r.t.Helper()
	sequence := r.e.player(owner).LastSequence + 1
	if err := r.e.Submit(owner, sequence, orders); err != nil {
		r.t.Fatalf("public submit: %v", err)
	}
	if r.restored != nil {
		if err := r.restored.Submit(owner, sequence, orders); err != nil {
			r.t.Fatalf("restored public submit: %v", err)
		}
	}
}

func (r *channelContinuationRun) step() {
	r.t.Helper()
	before := r.e.Tick()
	r.e.Advance()
	if r.e.Tick() != before+1 {
		r.t.Fatal("fixture ended before the intended channel sequence")
	}
	if r.restored != nil {
		r.restored.Advance()
		if r.e.Hash() != r.restored.Hash() {
			r.t.Fatalf("mid-channel restore diverged at tick %d", r.e.Tick())
		}
	}
}

func (r *channelContinuationRun) to(tick Tick) {
	r.t.Helper()
	if tick < r.e.Tick() || tick-r.e.Tick() > seconds(20) {
		r.t.Fatal("fixture tick bound", tick, r.e.Tick())
	}
	for r.e.Tick() < tick {
		r.step()
	}
}

func (r *channelContinuationRun) issue(owner PlayerID, order Order) {
	r.t.Helper()
	r.submit(owner, order)
	r.step()
	if len(r.e.state.Results) != 1 || !r.e.state.Results[0].Accepted {
		r.t.Fatalf("public %s/%s rejected: %+v", order.Kind, order.Type, r.e.state.Results)
	}
}

func (r *channelContinuationRun) checkpoint() {
	r.t.Helper()
	save, err := r.replay.CaptureCheckpoint(r.e)
	if err != nil {
		r.t.Fatal("checkpoint", err)
	}
	r.restored, err = Restore(r.e.catalog, save)
	if err != nil || r.restored.Hash() != r.e.Hash() {
		r.t.Fatal("mid-channel save restore", err)
	}
}

func (r *channelContinuationRun) finish() {
	r.t.Helper()
	if err := r.replay.Capture(r.e, false); err != nil {
		r.t.Fatal("final replay capture", err)
	}
	encoded, err := r.replay.Encode()
	if err != nil {
		r.t.Fatal("replay encode", err)
	}
	loaded, err := DecodeReplay(encoded)
	if err != nil {
		r.t.Fatal("replay decode", err)
	}
	for _, checkpoint := range []bool{true, false} {
		copy := *loaded
		if !checkpoint {
			copy.Checkpoints = nil
		}
		played, err := copy.Seek(r.e.catalog, r.e.Tick())
		if err != nil || played.Hash() != r.e.Hash() {
			r.t.Fatalf("replay checkpoint=%v mismatch: %v", checkpoint, err)
		}
	}
	r.t.Logf("public sequence tick=%d hash=%s save/full/checkpoint replay match", r.e.Tick(), r.e.Hash())
}

func channelContinuationCooldown(v *Entity, kind string) Tick {
	for _, c := range v.Cooldowns {
		if c.ID == kind {
			return c.Until
		}
	}
	return 0
}

func channelContinuationMark(v *Entity) Tick {
	for _, b := range v.Buffs {
		if b.Kind == "designated" {
			return b.Until
		}
	}
	return 0
}

func TestChannelContinuationCaptureChangesHostility(t *testing.T) {
	for _, kind := range []string{"sabotage", "designate"} {
		for _, owner := range []PlayerID{1, 2} {
			name := "own"
			if owner == 2 {
				name = "allied"
			}
			t.Run(kind+"/"+name, func(t *testing.T) {
				e := channelContinuationFixture(t, "US", "IR")
				target := e.spawn("factory", 3, Vec{X: 30000, Y: 30000}, true, 1800000)
				target.HP = target.MaxHP / 5
				engineer := e.spawn(e.player(owner).Faction+".engineer", owner, Vec{X: 27300, Y: 30000}, true, 400000)
				typ, pos := "US.elite", (Vec{X: 21000, Y: 27000})
				if kind == "designate" {
					typ, pos = "US.recon", (Vec{X: 25000, Y: 24000})
				}
				caster := e.spawn(typ, 1, pos, true, 0)
				r := channelContinuationRecord(t, e)
				if kind == "sabotage" {
					r.issue(1, Order{Kind: "move", Entities: []ID{caster.ID}, Position: Vec{X: 35000, Y: 27000}})
				}
				r.issue(owner, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: target.ID})
				start := e.Tick()
				captureAt := start + seconds(8)
				if engineer.Channel != "capture" || engineer.ChannelUntil != captureAt {
					t.Fatal("fixture capture did not begin at the entrance", engineer.Channel, engineer.Position)
				}
				offset, duration := seconds(4), seconds(6)
				if kind == "designate" {
					offset, duration = seconds(8)-10, seconds(1)
				}
				r.to(start + offset - 1)
				r.issue(1, Order{Kind: "ability", Type: kind, Entities: []ID{caster.ID}, Target: target.ID})
				castAt, position := e.Tick(), caster.Position
				if caster.Channel != kind || caster.ChannelDuration != duration || caster.ChannelUntil != castAt+duration {
					t.Fatal("fixture channel timing", caster.Channel, caster.ChannelDuration, caster.ChannelUntil)
				}
				if kind == "sabotage" {
					r.issue(1, Order{Kind: "move", Queued: true, Entities: []ID{caster.ID}, Position: Vec{X: 40000, Y: 20000}})
					if caster.Channel != kind || len(caster.Orders) != 2 {
						t.Fatal("accepted queued movement changed the active channel")
					}
				}
				r.checkpoint()
				r.to(captureAt - 1)
				if target.Owner != 3 || caster.Channel != kind || caster.Position != position {
					t.Fatal("fixture changed ownership or moved before capture completion")
				}
				r.to(captureAt)
				if target.Owner != owner {
					t.Fatal("ordinary capture missed its exact eight-second completion", target.Owner)
				}
				r.to(castAt + duration)
				r.finish()
				t.Logf("capture T=%d completed=%d cast=%d scheduled_completion=%d owner=%d disabled_until=%d mark_until=%d cooldown=%d", start, captureAt, castAt, castAt+duration, target.Owner, target.DisabledUntil, channelContinuationMark(target), channelContinuationCooldown(caster, kind))
				if kind == "sabotage" {
					if target.DisabledUntil != 0 || target.ResistanceUntil != 0 || channelContinuationCooldown(caster, kind) != captureAt+seconds(10) {
						t.Fatal("sabotage disabled a now-owned/allied captured factory or spent the success cooldown")
					}
					if len(caster.Orders) == 0 || caster.Orders[len(caster.Orders)-1].Position != (Vec{X: 40000, Y: 20000}) {
						t.Fatal("channel interruption discarded admitted queued movement")
					}
				} else if channelContinuationMark(target) != 0 || channelContinuationCooldown(caster, kind) != castAt+seconds(30) {
					t.Fatal("designation marked a now-owned/allied captured factory or refunded accepted cooldown")
				}
			})
		}
	}
}

func TestChannelContinuationSabotageAvailability(t *testing.T) {
	t.Run("power_off", func(t *testing.T) {
		e := channelContinuationFixture(t, "US", "IR")
		target := e.spawn("factory", 3, Vec{X: 30000, Y: 30000}, true, 1800000)
		caster := e.spawn("US.elite", 1, Vec{X: 28000, Y: 27000}, true, 1600000)
		r := channelContinuationRecord(t, e)
		r.issue(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{caster.ID}, Target: target.ID})
		completion := caster.ChannelUntil
		r.checkpoint()
		r.issue(3, Order{Kind: "power", Entities: []ID{target.ID}, Index: 0})
		inactiveAt, interrupted := e.Tick(), caster.Channel == ""
		r.to(completion)
		r.finish()
		if !interrupted || target.Enabled || target.DisabledUntil != 0 || target.ResistanceUntil != 0 || channelContinuationCooldown(caster, "sabotage") != inactiveAt+seconds(10) {
			t.Fatal("sabotage continued against a producer switched off by its owner", interrupted, target.DisabledUntil, channelContinuationCooldown(caster, "sabotage"))
		}
	})
	t.Run("allied_attempt_cannot_extend_disable", func(t *testing.T) {
		e := channelContinuationFixture(t, "US", "IR")
		target := e.spawn("factory", 3, Vec{X: 30000, Y: 30000}, true, 1800000)
		// Lower actor ID completes the shorter Syrian channel before the US
		// continuation is evaluated on the same tick.
		sy := e.spawn("SY.elite", 2, Vec{X: 32000, Y: 27000}, true, 1400000)
		us := e.spawn("US.elite", 1, Vec{X: 28000, Y: 27000}, true, 1600000)
		r := channelContinuationRecord(t, e)
		r.submit(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{us.ID}, Target: target.ID})
		r.submit(2, Order{Kind: "ability", Type: "sabotage", Entities: []ID{sy.ID}, Target: target.ID})
		r.step()
		if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || !e.state.Results[1].Accepted || sy.ChannelUntil != e.Tick()+seconds(5) || us.ChannelUntil != e.Tick()+seconds(6) {
			t.Fatal("simultaneous public sabotage fixture", e.state.Results)
		}
		start := e.Tick()
		r.to(start + seconds(2))
		r.checkpoint()
		r.to(start + seconds(6))
		r.finish()
		first := start + seconds(5)
		if target.DisabledUntil != first+seconds(10) || target.ResistanceUntil != first+seconds(40) || channelContinuationCooldown(us, "sabotage") != first+seconds(10) || channelContinuationCooldown(sy, "sabotage") != first+seconds(60) {
			t.Fatal("later allied sabotage extended a disabled/resistant target", target.DisabledUntil, target.ResistanceUntil, us.Cooldowns, sy.Cooldowns)
		}
	})
	t.Run("resistance_after_recovery", func(t *testing.T) {
		e := channelContinuationFixture(t, "US", "IR")
		target := e.spawn("factory", 3, Vec{X: 30000, Y: 30000}, true, 1800000)
		us := e.spawn("US.elite", 1, Vec{X: 28000, Y: 27000}, true, 1600000)
		r := channelContinuationRecord(t, e)
		r.issue(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{us.ID}, Target: target.ID})
		start := e.Tick()
		r.to(start + seconds(6))
		// Ordinary movement suppresses automatic infantry fire while waiting.
		r.issue(1, Order{Kind: "move", Entities: []ID{us.ID}, Position: Vec{X: 18000, Y: 27000}})
		r.to(start + seconds(16))
		r.issue(1, Order{Kind: "move", Entities: []ID{us.ID}, Position: Vec{X: 28000, Y: 27000}})
		r.to(start + seconds(20))
		if !target.Active(e.Tick()) || target.ResistanceUntil <= e.Tick() || e.edgeDistance(us, target) > 1000 || channelContinuationCooldown(us, "sabotage") <= e.Tick() {
			t.Fatal("post-recovery resistance fixture")
		}
		r.submit(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{us.ID}, Target: target.ID})
		r.step()
		if len(e.state.Results) != 1 || e.state.Results[0].Accepted || e.state.Results[0].Code != "invalid_sabotage" {
			t.Fatal("active resistant producer was accepted", e.state.Results)
		}
		r.finish()
	})
}

func TestChannelContinuationDesignationMovingTarget(t *testing.T) {
	for _, kind := range []string{"range", "takeoff"} {
		t.Run(kind, func(t *testing.T) {
			enemyFaction := "IR"
			if kind == "takeoff" {
				enemyFaction = "US"
			}
			e := channelContinuationFixture(t, "US", enemyFaction)
			var target *Entity
			sourcePosition := Vec{X: 20000, Y: 20000}
			goal := Vec{X: 40000, Y: 20000}
			if kind == "range" {
				target = e.spawn("IR.hauler", 3, Vec{X: 27700, Y: 20000}, true, 900000)
			} else {
				home := e.spawn("US.airfield", 3, Vec{X: 32000, Y: 30000}, true, 2200000)
				target = e.spawn("US.airlift", 3, Vec{X: 30000, Y: 30000}, true, 900000)
				target.Home = home.ID
				landing, ok := e.serviceLandingPosition(target, home)
				if !ok {
					t.Fatal("fixture has no legal aircraft parking")
				}
				target.Position, target.LastPosition, target.Anchor = landing, landing, landing
				sourcePosition = Vec{X: landing.X - 6000, Y: landing.Y}
				goal = Vec{X: landing.X + 1000, Y: landing.Y}
			}
			caster := e.spawn("US.recon", 1, sourcePosition, true, 350000)
			r := channelContinuationRecord(t, e)
			r.issue(1, Order{Kind: "ability", Type: "designate", Entities: []ID{caster.ID}, Target: target.ID})
			start, completion := e.Tick(), caster.ChannelUntil
			if caster.Channel != "designate" || completion != start+seconds(1) {
				t.Fatal("fixture did not begin designation")
			}
			r.issue(3, Order{Kind: "move", Entities: []ID{target.ID}, Position: goal})
			r.checkpoint()
			r.to(completion)
			if !e.canSeeEntity(1, target) || target.LastDamage != 0 || caster.LastDamage != 0 {
				t.Fatal("fixture lost visibility or took unrelated damage")
			}
			if kind == "range" && e.edgeDistance(caster, target) <= 7000 || kind == "takeoff" && (target.Landed || e.armor(target) != "air") {
				t.Fatal("public target movement did not invalidate the intended rule", e.edgeDistance(caster, target), target.Landed, e.armor(target))
			}
			r.finish()
			t.Logf("designation target=%s range=%d layer=%s visible=true mark_until=%d cooldown=%d", target.Type, e.edgeDistance(caster, target), e.armor(target), channelContinuationMark(target), channelContinuationCooldown(caster, "designate"))
			if channelContinuationMark(target) != 0 || channelContinuationCooldown(caster, "designate") != start+seconds(30) || caster.Channel != "" {
				t.Fatal("designation completed after a visible target left its legal range/layer or refunded cooldown")
			}
		})
	}
}

func TestChannelContinuationHostileTimingAndCost(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run("sabotage/"+faction, func(t *testing.T) {
			e := channelContinuationFixture(t, faction, "IR")
			target := e.spawn("factory", 3, Vec{X: 30000, Y: 30000}, true, 1800000)
			caster := e.spawn(faction+".elite", 1, Vec{X: 28000, Y: 27000}, true, 0)
			r := channelContinuationRecord(t, e)
			credits, spent, hp := e.player(1).Credits, e.player(1).Spent, target.HP
			r.issue(1, Order{Kind: "ability", Type: "sabotage", Entities: []ID{caster.ID}, Target: target.ID})
			start, duration := e.Tick(), seconds(6)
			if faction == "SY" {
				duration = seconds(5)
			}
			if caster.ChannelDuration != duration || channelContinuationCooldown(caster, "sabotage") != 0 || e.player(1).Credits != credits || e.player(1).Spent != spent || e.player(1).Energy != int64(e.Tick())*25 {
				t.Fatal("accepted sabotage changed timing, charged resources, or spent success cooldown early")
			}
			r.to(start + duration/2)
			r.checkpoint()
			r.to(start + duration - 1)
			if target.DisabledUntil != 0 || target.HP != hp || caster.Channel != "sabotage" {
				t.Fatal("sabotage fired or completed early")
			}
			r.to(start + duration)
			r.finish()
			if caster.Channel != "" || target.DisabledUntil != e.Tick()+seconds(10) || target.ResistanceUntil != e.Tick()+seconds(40) || channelContinuationCooldown(caster, "sabotage") != e.Tick()+seconds(60) || target.HP != hp || e.player(1).Credits != credits || e.player(1).Spent != spent || e.player(1).Energy != int64(e.Tick())*25 {
				t.Fatal("hostile sabotage changed exact completion, duration, resistance, cooldown, health, or cost")
			}
		})
	}
	for _, targetType := range []string{"IR.rig", "IR.hauler", "factory"} {
		t.Run("designation/"+targetType, func(t *testing.T) {
			e := channelContinuationFixture(t, "US", "IR")
			target := e.spawn(targetType, 3, Vec{X: 30000, Y: 30000}, true, 0)
			caster := e.spawn("US.recon", 1, Vec{X: 25000, Y: 24000}, true, 350000)
			r := channelContinuationRecord(t, e)
			credits, spent, hp := e.player(1).Credits, e.player(1).Spent, target.HP
			r.issue(1, Order{Kind: "ability", Type: "designate", Entities: []ID{caster.ID}, Target: target.ID})
			start := e.Tick()
			r.to(start + 10)
			r.checkpoint()
			r.to(start + seconds(1) - 1)
			if channelContinuationMark(target) != 0 || caster.Channel != "designate" || target.HP != hp {
				t.Fatal("designation fired or completed early")
			}
			r.to(start + seconds(1))
			r.finish()
			if channelContinuationMark(target) != e.Tick()+seconds(8) || channelContinuationCooldown(caster, "designate") != start+seconds(30) || caster.Channel != "" || target.HP != hp || e.player(1).Credits != credits || e.player(1).Spent != spent || e.player(1).Energy != int64(e.Tick())*25 {
				t.Fatal("hostile designation changed exact channel, mark, cooldown, health, or cost")
			}
		})
	}
}

func TestChannelContinuationInitialLegalitySpendsNothing(t *testing.T) {
	for _, kind := range []string{"sabotage", "designate"} {
		cases := []string{"own", "allied", "wrong_actor", "range", "fog", "wrong_target"}
		if kind == "sabotage" {
			cases = append(cases, "inactive", "resistance")
		} else {
			cases = append(cases, "air")
		}
		for _, invalid := range cases {
			t.Run(kind+"/"+invalid, func(t *testing.T) {
				e := channelContinuationFixture(t, "US", "IR")
				targetType, casterType, casterPosition := "factory", "US.elite", (Vec{X: 28000, Y: 27000})
				if kind == "designate" {
					casterType, casterPosition = "US.recon", (Vec{X: 25000, Y: 24000})
				}
				owner := PlayerID(3)
				switch invalid {
				case "own":
					owner = 1
				case "allied":
					owner = 2
				case "wrong_actor":
					casterType = "US.engineer"
				case "range":
					if kind == "sabotage" {
						casterPosition = Vec{X: 26000, Y: 27000}
					} else {
						casterPosition = Vec{X: 20000, Y: 26000}
					}
				case "fog":
					casterPosition = Vec{X: 10000, Y: 16000}
				case "wrong_target":
					if kind == "sabotage" {
						targetType = "power"
						casterPosition = Vec{X: 28800, Y: 27800}
					} else {
						targetType = "IR.engineer"
					}
				case "air":
					targetType = "IR.isr"
				}
				target := e.spawn(targetType, owner, Vec{X: 30000, Y: 30000}, true, 0)
				caster := e.spawn(casterType, 1, casterPosition, true, 0)
				if invalid == "resistance" {
					target.ResistanceUntil = seconds(30)
				}
				if invalid == "air" {
					home := e.spawn("IR.drone_hub", 3, Vec{X: 40000, Y: 30000}, true, 0)
					target.Home, target.Landed = home.ID, false
				}
				r := channelContinuationRecord(t, e)
				if invalid == "inactive" {
					r.issue(3, Order{Kind: "power", Entities: []ID{target.ID}, Index: 0})
				}
				credits, spent, energy := e.player(1).Credits, e.player(1).Spent, e.player(1).Energy
				r.submit(1, Order{Kind: "ability", Type: kind, Entities: []ID{caster.ID}, Target: target.ID})
				r.step()
				if len(e.state.Results) != 1 || e.state.Results[0].Accepted || e.state.Results[0].Code != "invalid_"+map[string]string{"sabotage": "sabotage", "designate": "designation"}[kind] || caster.Channel != "" || channelContinuationCooldown(caster, kind) != 0 || e.player(1).Credits != credits || e.player(1).Spent != spent || e.player(1).Energy != energy+25 {
					t.Fatal("initial illegal cast accepted or spent resources/cooldown", e.state.Results)
				}
			})
		}
	}
}
