package sim

import (
	"bytes"
	"encoding/json"
	"testing"
)

func lifecycleRemoveQualifyingAssets(e *Engine, owner PlayerID) {
	for _, actor := range e.state.Entities {
		if actor.Owner != owner {
			continue
		}
		if !actor.Building && e.role(actor) == "rig" {
			actor.HP = 0
		}
		if actor.Building {
			if rule, ok := e.buildingRule(actor.Type); ok && rule.Qualifying {
				actor.HP = 0
			}
		}
	}
	e.cleanup()
	e.recalculate()
	e.updateFog()
}

func lifecycleRestore(t *testing.T, e *Engine) *Engine {
	t.Helper()
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if e.Hash() != restored.Hash() {
		t.Fatal("lifecycle state changed during restore")
	}
	return restored
}

func lifecycleCompareViews(t *testing.T, e, restored *Engine) {
	t.Helper()
	for _, player := range e.state.Players {
		view, ok := e.PlayerView(player.ID)
		other, otherOK := restored.PlayerView(player.ID)
		a, err := json.Marshal(view)
		if err != nil {
			t.Fatal(err)
		}
		b, err := json.Marshal(other)
		if err != nil {
			t.Fatal(err)
		}
		if !ok || !otherOK || !bytes.Equal(a, b) {
			t.Fatalf("player %d lifecycle view differs after restore/replay", player.ID)
		}
	}
}

func TestLifecycleStationReleaseRequiresOrdinaryCapture(t *testing.T) {
	for _, tc := range []struct {
		name   string
		reason string
		team   uint32
	}{
		{"team_surrender", "surrender", 1},
		{"team_countdown", "countdown", 1},
		{"ffa_surrender", "surrender", 3},
		{"ffa_countdown", "countdown", 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := teamFixture(t)
			e.player(3).Team = tc.team
			station := e.state.Stations[0]
			station.Owner = 1
			engineer := e.spawn("SA.engineer", 3, Vec{X: station.Position.X, Y: station.Position.Y - 1000}, true, 500000)
			if tc.reason == "countdown" {
				lifecycleRemoveQualifyingAssets(e, 1)
				// A restored snapshot may be one tick from the public deadline.
				e.player(1).DefeatAt = e.Tick() + 1
			}
			e.updateFog()
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			formerCredits, allyCredits := e.player(1).Credits, e.player(3).Credits
			if tc.reason == "surrender" {
				issue(t, e, 1, Order{Kind: "surrender"})
			} else {
				e.Advance()
				formerCredits += 100 // Income precedes this tick's countdown expiry.
			}
			if !e.player(1).Defeated || e.player(3).Defeated || e.Outcome().Finished {
				t.Fatal("individual elimination ended a match with surviving opponents")
			}
			if station.Owner != 0 {
				t.Fatalf("eliminated player permanently locks the neutral station: owner=%d", station.Owner)
			}
			if e.player(1).Credits != formerCredits || e.player(3).Credits != allyCredits {
				t.Fatal("station release transferred prior income or refunded credits")
			}
			issue(t, e, 3, Order{Kind: "capture", Entities: []ID{engineer.ID}, Target: station.ID})
			if station.Owner != 0 || engineer.Channel != "capture" || engineer.ChannelDuration != seconds(6) {
				t.Fatal("released station bypassed its ordinary six-second capture")
			}
			restored := lifecycleRestore(t, e)
			if err = replay.Capture(e, true); err != nil {
				t.Fatal(err)
			}
			ticks(e, uint32(seconds(6)-1))
			ticks(restored, uint32(seconds(6)-1))
			if station.Owner != 0 || e.player(3).Credits != allyCredits {
				t.Fatal("station ownership or income changed before capture completed")
			}
			e.Advance()
			restored.Advance()
			if station.Owner != 3 || e.player(3).Credits != allyCredits {
				t.Fatal("station capture failed or transferred earlier income")
			}
			e.Advance()
			restored.Advance()
			if e.player(3).Credits != allyCredits+100 || e.player(1).Credits != formerCredits || e.Hash() != restored.Hash() {
				t.Fatal("station future income was duplicated, lost or paid to the defeated owner")
			}
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			for _, checkpoint := range []bool{false, true} {
				recording := *replay
				if !checkpoint {
					recording.Checkpoints = nil
				}
				seek, err := recording.Seek(e.catalog, e.Tick())
				if err != nil || seek.Hash() != e.Hash() {
					t.Fatalf("station capture replay differs (checkpoint=%v): %v", checkpoint, err)
				}
				lifecycleCompareViews(t, e, seek)
			}
		})
	}
}

func TestLifecycleCountdownCommitsFogEconomyAndPendingEffects(t *testing.T) {
	e := teamFixture(t)
	lifecycleRemoveQualifyingAssets(e, 1)
	e.player(1).Faction = "SY"
	e.player(1).DefeatAt = 1
	power := e.spawn("power", 1, Vec{X: 8000, Y: 14000}, true, 800000)
	scout := e.spawn("SY.engineer", 1, Vec{X: 30000, Y: 30000}, true, 500000)
	enemy := e.spawn("IR.tank", 2, Vec{X: 32000, Y: 30000}, true, 1200000)
	carrier := e.spawn("SY.apc", 1, Vec{X: 18000, Y: 30000}, true, 600000)
	passenger := e.spawn("SY.rifle", 1, carrier.Position, true, 250000)
	passenger.Container, passenger.State = carrier.ID, "embarked"
	carrier.Passengers = []ID{passenger.ID}
	passengerHP := passenger.HP
	home := e.spawn("SY.safehouse", 1, Vec{X: 42000, Y: 16000}, true, 700000)
	launcher := e.spawn("IR.launcher", 2, Vec{X: 50000, Y: 40000}, true, 2000000)
	launcher.Deployed = true
	e.state.Operations = []Operation{
		{Kind: "raid", Owner: 1, At: 30, Source: home.ID, Points: []Vec{{X: 45000, Y: 16000}, {X: 45000, Y: 18000}}, ReservedSupply: 4},
		{Kind: "second_volley", Owner: 2, At: 100, Source: launcher.ID, Points: []Vec{{X: 40000, Y: 40000}, launcher.Position}},
	}
	e.state.Zones = []Zone{
		{Kind: "scan", Owner: 1, Position: enemy.Position, Radius: 2000, Until: 30},
		{Kind: "scan", Owner: 2, Position: Vec{X: 40000, Y: 45000}, Radius: 1000, Until: 100},
	}
	// A crate earned from a prior ordinary kill is distinct from defeat loot.
	crate := Salvage{Owner: 1, ID: e.newID(), Position: Vec{X: 20000, Y: 40000}, Value: 40000, Until: seconds(45)}
	e.state.Salvage = []Salvage{crate}
	e.recalculate()
	e.updateFog()
	if !e.canSee(3, enemy.Position) || e.player(1).PowerCapacity == 0 || e.player(1).Supply == 0 || e.player(1).ReservedSupply != 4 {
		t.Fatal("fixture lacks the active ally sight and economy that must cease")
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if !e.player(1).Defeated || e.player(3).Defeated || e.Outcome().Finished {
		t.Fatal("countdown did not eliminate only its own player")
	}
	if e.canSee(3, enemy.Position) {
		t.Error("eliminated teammate supplies sight in the committed tick")
	}
	p := e.player(1)
	if p.Supply != 0 || p.ReservedSupply != 0 || p.PowerCapacity != 0 || p.PowerDemand != 0 || p.Tier != 1 {
		t.Errorf("committed defeated economy remains active: supply=%d reserved=%d power=%d/%d tier=%d", p.Supply, p.ReservedSupply, p.PowerCapacity, p.PowerDemand, p.Tier)
	}
	if len(e.state.Operations) != 1 || e.state.Operations[0].Owner != 2 || len(e.state.Zones) != 1 || e.state.Zones[0].Owner != 2 {
		t.Error("committed defeat retained its effects or canceled the active opponent's effects")
	}
	for _, id := range []PlayerID{1, 3} {
		view, _ := e.PlayerView(id)
		for _, warning := range view.Warnings {
			if warning.Owner == 1 {
				t.Error("committed defeat still warns of a canceled operation")
			}
		}
		for _, zone := range view.Zones {
			if zone.Owner == 1 {
				t.Error("committed defeat still shows an inactive scan")
			}
		}
		if id == 1 {
			for _, visible := range view.Visible {
				if visible {
					t.Error("defeated player's committed view retains firing vision")
					break
				}
			}
		}
	}
	for _, actor := range []*Entity{power, scout, carrier, passenger, home} {
		if actor.Owner != 1 || actor.Enabled || actor.State != "inactive" {
			t.Fatal("defeat transferred or reactivated an asset")
		}
	}
	if passenger.Container != carrier.ID || len(carrier.Passengers) != 1 || passenger.HP != passengerHP || len(e.state.Salvage) != 1 || e.state.Salvage[0] != crate {
		t.Fatal("defeat escaped, damaged or looted a transport's passengers")
	}
	view, _ := e.PlayerView(3)
	for _, actor := range view.Entities {
		if actor.ID == enemy.ID {
			t.Error("surviving teammate received hidden enemy from the eliminated scout")
		}
	}
	restored := lifecycleRestore(t, e)
	lifecycleCompareViews(t, e, restored)
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	seek, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || seek.Hash() != e.Hash() {
		t.Fatal("countdown defeat replay differs", err)
	}
	lifecycleCompareViews(t, e, seek)
	ticks(e, 30)
	ticks(restored, 30)
	if e.Hash() != restored.Hash() || passenger.HP != passengerHP || passenger.Container != carrier.ID || passenger.State != "inactive" {
		t.Fatal("inactive transport diverged or resumed after restore")
	}
}

func TestLifecycleSimultaneousCountdownDrawCommitsFinalViews(t *testing.T) {
	e := fixture(t)
	for _, id := range []PlayerID{1, 2} {
		lifecycleRemoveQualifyingAssets(e, id)
		e.player(id).DefeatAt = 1
	}
	e.spawn("US.engineer", 1, Vec{X: 20000, Y: 20000}, true, 500000)
	e.spawn("IR.engineer", 2, Vec{X: 30000, Y: 30000}, true, 500000)
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if result := e.Outcome(); !result.Finished || !result.Draw || result.WinningTeam != 0 || result.Reason != "simultaneous_elimination" || result.Tick != 1 {
		t.Fatal("same-snapshot countdown expiry was not a draw", result)
	}
	ended, defeated := 0, 0
	for _, event := range e.state.Events {
		if event.Kind == "match_ended" {
			ended++
		}
		if event.Kind == "player_defeated" {
			defeated++
		}
	}
	if ended != 1 || defeated != 2 {
		t.Fatal("draw emitted duplicated or missing lifecycle events", ended, defeated)
	}
	lifecycleCompareViews(t, e, lifecycleRestore(t, e))
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	seek, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || seek.Hash() != e.Hash() {
		t.Fatal("simultaneous elimination replay differs", err)
	}
	lifecycleCompareViews(t, e, seek)
	before := e.Hash()
	ticks(e, 2)
	if e.Tick() != 1 || e.Hash() != before {
		t.Fatal("finished draw advanced or repeated terminal side effects")
	}
}

func TestLifecycleRecoveryQualificationAtExactDeadline(t *testing.T) {
	for _, tc := range []struct {
		name     string
		typeID   string
		complete bool
		disabled bool
		qualify  bool
	}{
		{"completed_hq", "hq", true, false, true},
		{"completed_barracks", "barracks", true, false, true},
		{"disabled_factory", "factory", true, true, true},
		{"us_air_producer", "US.airfield", true, false, true},
		{"ir_air_producer", "IR.drone_hub", true, false, true},
		{"sy_air_producer", "SY.workshop_air", true, false, true},
		{"sa_air_producer", "SA.airfield", true, false, true},
		{"living_rig", "US.rig", true, false, true},
		{"foundation", "factory", false, false, false},
		{"outpost", "outpost", true, false, false},
		{"safehouse", "SY.safehouse", true, false, false},
		{"strategic_site", "strategic", true, false, false},
		{"mobile_army", "US.tank", true, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := fixture(t)
			lifecycleRemoveQualifyingAssets(e, 1)
			e.state.Tick = 600
			e.player(1).DefeatAt = 600
			asset := e.spawn(tc.typeID, 1, Vec{X: 25000, Y: 25000}, tc.complete, 0)
			asset.Enabled = !tc.disabled
			e.updateVictory()
			if tc.qualify {
				if e.player(1).Defeated || e.player(1).DefeatAt != 0 || e.Outcome().Finished {
					t.Fatal("qualifying recovery failed to cancel the exact deadline")
				}
			} else if !e.player(1).Defeated || e.Outcome().WinningTeam != 2 {
				t.Fatal("nonqualifying asset prolonged an eliminated player")
			}
		})
	}
}
