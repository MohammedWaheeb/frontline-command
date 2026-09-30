package sim

import (
	"bytes"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"slices"
	"testing"
)

// Authored infrastructure isolates the completion-age rule from the opening
// build order. The paid-build regression charges through 210 ordinary seconds;
// boundary/guard controls explicitly prepare charge to isolate their condition.
// Safehouse construction, resume and Raid use ordinary submitted commands.
func raidCompletionFixture(t *testing.T, mode string) *Engine {
	t.Helper()
	def := longMission()
	def.Faction = "SY"
	def.Players[0].Faction = "SY"
	def.Players[0].Credits = 20000000
	def.Initial = nil
	for i, typ := range []string{"power", "supply", "barracks", "factory", "radar", "tech"} {
		def.Initial = append(def.Initial, content.MissionSpawn{Tag: typ, Type: typ, Owner: 1, Position: Vec{X: int32(4000 + i*6000), Y: 20000}, Count: 1})
	}
	def.Initial = append(def.Initial,
		content.MissionSpawn{Tag: "reserve-power", Type: "power", Owner: 1, Position: Vec{X: 4000, Y: 38000}, Count: 1},
		content.MissionSpawn{Tag: "raid-site", Type: "strategic", Owner: 1, Position: Vec{X: 12000, Y: 38000}, Count: 1},
	)
	house := content.MissionSpawn{Tag: "raid-house", Type: "SY.safehouse", Owner: 1, Position: Vec{X: 12000, Y: 12000}, Count: 1}
	switch mode {
	case "initial", "terminal":
		def.Initial = append(def.Initial, house)
		if mode == "terminal" {
			def.Objectives[0].Condition.Tick = 400
		}
	case "late":
		def.Triggers = []content.MissionTrigger{{ID: "late-house", Condition: content.MissionCondition{Kind: "timer", Tick: 75}, Actions: []content.MissionAction{{Kind: "spawn", Spawn: &house}}}}
	case "paid":
	default:
		t.Fatal("invalid Raid fixture mode", mode)
	}
	e := extendedMission(t, def, fixtureMap())
	if mode != "paid" {
		tagged(e, "raid-site").ChargeWork = e.strategicCharge("SY")
	}
	if e.player(1).Tier != 3 || e.player(1).LowPower() {
		t.Fatal("Raid fixture lacks active Tier 3 or normal power")
	}
	return e
}

func raidCompletionAdvanceTo(t *testing.T, engines []*Engine, until Tick) {
	t.Helper()
	for engines[0].Tick() < until {
		for _, e := range engines {
			before := e.Tick()
			e.Advance()
			if e.Tick() != before+1 {
				t.Fatal("Raid fixture stopped before requested tick", before, until, e.Outcome())
			}
		}
	}
	for _, e := range engines[1:] {
		if engines[0].Hash() != e.Hash() {
			t.Fatal("Raid continuation diverged after restore", until)
		}
	}
}

func raidCompletionClone(t *testing.T, e *Engine) *Engine {
	t.Helper()
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("Raid snapshot did not preserve state", err)
	}
	return restored
}

func raidCompletionOrder(t *testing.T, engines []*Engine, order Order, want string) {
	t.Helper()
	for _, e := range engines {
		p := e.player(1)
		credits, spent, reserved := p.Credits, p.Spent, p.ReservedSupply
		site := tagged(e, "raid-site")
		charge, operations := site.ChargeWork, len(e.state.Operations)
		if err := e.Submit(1, p.LastSequence+1, []Order{order}); err != nil {
			t.Fatal("Raid order did not reach execution", err)
		}
		e.Advance()
		if len(e.state.Results) != 1 || e.state.Results[0].Code != want {
			t.Fatalf("Raid order at tick %d: results=%+v want=%s credit_delta=%d spent_delta=%d charge=%d->%d reserved=%d->%d", e.Tick(), e.state.Results, want, p.Credits-credits, p.Spent-spent, charge, site.ChargeWork, reserved, p.ReservedSupply)
		}
		if want != "ok" && (p.Credits != credits || p.Spent != spent || p.ReservedSupply != reserved || site.ChargeWork != charge || len(e.state.Operations) != operations) {
			t.Fatal("rejected Raid spent credits, charge or Supply")
		}
	}
	for _, e := range engines[1:] {
		if engines[0].Hash() != e.Hash() {
			t.Fatal("Raid order diverged across restored copies")
		}
	}
}

func raidCompletionAbility(house ID) Order {
	return Order{Kind: "ability", Type: "strategic", Entities: []ID{house}}
}

func raidCompletionCapture(t *testing.T, replay *Replay, e *Engine) {
	t.Helper()
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
}

func raidCompletionAdvice(t *testing.T, e *Engine, house ID) {
	t.Helper()
	before, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	options, err := e.CommandAffordances(1, []ID{house})
	if err != nil || len(options.Entities) != 1 || !slices.Contains(options.Entities[0].Abilities, "strategic") {
		t.Fatal("safehouse lost strategic command family", options, err)
	}
	advice, err := e.PreviewOrderAdvice(1, []Order{raidCompletionAbility(house)})
	if err != nil || len(advice.Results) != 1 || advice.Results[0].Code != "indeterminate" || len(advice.Plans) != 0 {
		t.Fatal("Raid preview promised readiness or leaked strategic plans", advice, err)
	}
	after, err := e.Save()
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("Raid advice mutated canonical state", err)
	}
	view, ok := e.PlayerView(1)
	if !ok {
		t.Fatal("Raid owner view unavailable")
	}
	projection, err := json.Marshal(view)
	if err != nil || bytes.Contains(projection, []byte("completed_at")) || bytes.Contains(projection, []byte("created")) {
		t.Fatal("entity projection exposed completion or creation timestamp", err)
	}
}

func TestRaidCompletionReliabilityPaidBuildStartsMaturityAtCompletion(t *testing.T) {
	for _, paused := range []bool{false, true} {
		t.Run(fmt.Sprintf("paused_%t", paused), func(t *testing.T) {
			e := raidCompletionFixture(t, "paid")
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			engines := []*Engine{e}
			// No charge shortcut: authored empty site progresses at the real 20 Hz.
			for e.Tick() < seconds(210) {
				raidCompletionAdvanceTo(t, engines, min(e.Tick()+seconds(20), seconds(210)))
				raidCompletionCapture(t, replay, e)
			}
			if tagged(e, "raid-site").ChargeWork != e.strategicCharge("SY") {
				t.Fatal("ordinary 210-second charge did not make Raid ready")
			}
			checkpoints := map[Tick]string{}
			rig := e.entity(2)
			before := e.player(1).Credits
			issue(t, e, 1, Order{Kind: "build", Entities: []ID{rig.ID}, Type: "SY.safehouse", Position: Vec{X: 12000, Y: 12000}})
			var house *Entity
			for _, v := range e.state.Entities {
				if v.Owner == 1 && e.role(v) == "safehouse" {
					house = v
				}
			}
			rule, _ := e.buildingRule("SY.safehouse")
			if house == nil || house.Complete || house.Paid != rule.Cost || before-e.player(1).Credits != rule.Cost || house.Created != e.Tick() {
				t.Fatal("regression did not place a paid safehouse foundation")
			}
			created := house.Created
			raidCompletionAdvanceTo(t, engines, created+100)
			if house.Work == 0 || house.Complete {
				t.Fatal("public builder made no partial construction progress", house.Work)
			}
			if paused {
				issue(t, e, 1, Order{Kind: "stop", Entities: []ID{rig.ID}})
			}
			engines = append(engines, raidCompletionClone(t, e))
			if paused {
				work := house.Work
				raidCompletionAdvanceTo(t, engines, e.Tick()+400)
				if house.Complete || house.Work != work || e.Tick()-created < 400 {
					t.Fatal("stopped foundation did not retain work and foundation age")
				}
				raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "invalid_safehouse")
				raidCompletionOrder(t, engines, Order{Kind: "resume", Entities: []ID{rig.ID}, Target: house.ID}, "ok")
			}
			checkpoints[e.Tick()] = e.Hash()
			raidCompletionCapture(t, replay, e)
			for !house.Complete && e.Tick() < created+1800 {
				raidCompletionAdvanceTo(t, engines, e.Tick()+1)
			}
			if !house.Complete || house.Work != rule.BuildTicks*2 || house.Created != created || e.Tick()-created < 400 {
				t.Fatal("paid safehouse did not complete with retained creation age", house.Work, e.Tick())
			}
			completed := e.Tick()
			found := false
			for _, event := range e.state.Events {
				if event.Kind == "construction_complete" && event.Entity == house.ID && event.Tick == completed {
					found = true
				}
			}
			if !found {
				t.Fatal("paid completion was not observed on its authoritative event tick")
			}
			checkpoints[completed] = e.Hash()
			raidCompletionCapture(t, replay, e)
			t.Logf("paid=%d created=%d completed=%d foundation_age=%d", house.Paid, created, completed, completed-created)
			raidCompletionAdvice(t, e, house.ID)
			raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "invalid_safehouse")
			raidCompletionAdvanceTo(t, engines, completed+398)
			raidCompletionAdvice(t, e, house.ID)
			raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "invalid_safehouse")
			if e.Tick() != completed+399 {
				t.Fatal("399-tick rejection used wrong execution boundary")
			}
			checkpoints[e.Tick()] = e.Hash()
			raidCompletionCapture(t, replay, e)
			engines = append(engines, raidCompletionClone(t, e))
			credits, spent := e.player(1).Credits, e.player(1).Spent
			raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "ok")
			if e.Tick() != completed+400 || credits-e.player(1).Credits != 1200000 || e.player(1).Spent-spent != 1200000 || e.player(1).ReservedSupply != 4 || len(e.state.Operations) != 1 || tagged(e, "raid-site").ChargeWork != 2 {
				t.Fatal("400-tick acceptance changed Raid cost, charge or reservation", e.Tick(), e.player(1).ReservedSupply, e.state.Operations)
			}
			raidCompletionAdvice(t, e, house.ID)
			checkpoints[e.Tick()] = e.Hash()
			raidCompletionCapture(t, replay, e)
			engines = append(engines, raidCompletionClone(t, e))
			deployment := e.state.Operations[0].At
			if deployment != completed+400+240 {
				t.Fatal("Raid warning did not retain twelve-second deployment timer")
			}
			raidCompletionAdvanceTo(t, engines, deployment-1)
			for _, v := range e.state.Entities {
				if v.TemporaryUntil > 0 {
					t.Fatal("Raid spawned before deployment timer")
				}
			}
			raidCompletionAdvanceTo(t, engines, deployment)
			temporary := 0
			for _, v := range e.state.Entities {
				if v.TemporaryUntil > 0 {
					temporary++
					if v.Owner != 1 || v.Paid != 0 || v.TemporaryUntil != deployment+900 || (v.Type != "SY.rifle" && v.Type != "SY.at") {
						t.Fatal("Raid pair changed owner, roster, payment or lifetime", v.ID)
					}
				}
			}
			if temporary != 2 || e.player(1).ReservedSupply != 0 || e.player(1).Supply != 4 || len(e.state.Operations) != 0 {
				t.Fatal("Raid deployment lost its pair or leaked reserved Supply", temporary)
			}
			checkpoints[e.Tick()] = e.Hash()
			raidCompletionCapture(t, replay, e)
			if len(replay.Checkpoints) != 0 {
				t.Fatal("regression replay bypassed paid construction using a later checkpoint")
			}
			checkpointTicks := make([]Tick, 0, len(checkpoints))
			for at := range checkpoints {
				checkpointTicks = append(checkpointTicks, at)
			}
			slices.Sort(checkpointTicks)
			for _, at := range checkpointTicks {
				hash := checkpoints[at]
				played, err := replay.Seek(e.catalog, at)
				if err != nil || played.Hash() != hash {
					t.Fatal("full initial replay diverged at Raid checkpoint", at, err)
				}
			}
			t.Logf("rejected_399=%d accepted_400=%d deployed=%d full_replay_checkpoints=%d hash=%s", completed+399, completed+400, deployment, len(checkpoints), e.Hash())
		})
	}
}

func TestRaidCompletionReliabilityAuthoredBoundary(t *testing.T) {
	for _, mode := range []string{"initial", "late"} {
		t.Run(mode, func(t *testing.T) {
			e := raidCompletionFixture(t, mode)
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			completed := Tick(0)
			if mode == "late" {
				completed = 75
				raidCompletionAdvanceTo(t, []*Engine{e}, completed-1)
				if tagged(e, "raid-house") != nil {
					t.Fatal("late authored safehouse arrived before its trigger")
				}
				e.Advance()
			}
			house := tagged(e, "raid-house")
			if house == nil || !house.Complete || house.Created != completed {
				t.Fatal("scenario did not author a complete safehouse at its declared tick")
			}
			engines := []*Engine{e, raidCompletionClone(t, e)}
			raidCompletionAdvanceTo(t, engines, completed+398)
			raidCompletionAdvice(t, e, house.ID)
			raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "invalid_safehouse")
			if e.Tick() != completed+399 {
				t.Fatal("authored maturity rejection missed exact 399 boundary")
			}
			engines = append(engines, raidCompletionClone(t, e))
			raidCompletionOrder(t, engines, raidCompletionAbility(house.ID), "ok")
			if e.Tick() != completed+400 || e.player(1).ReservedSupply != 4 {
				t.Fatal("authored safehouse missed exact 400 maturity boundary")
			}
			view, ok := e.PlayerView(1)
			item := originEntity(t, view, house.ID)
			wantOrigin := ""
			if mode == "initial" {
				wantOrigin = "initial:8"
			}
			if !ok || item == nil || item.Private == nil || item.Private.MissionOrigin != wantOrigin || house.Created != completed {
				t.Fatal("completion timing changed authored mission-origin semantics", item, err)
			}
			raidCompletionCapture(t, replay, e)
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("authored completion full replay drift", err)
			}
			t.Logf("mode=%s complete=%d reject=%d accept=%d origin=%q hash=%s", mode, completed, completed+399, completed+400, wantOrigin, e.Hash())
		})
	}
}

func TestRaidCompletionReliabilityActivePrerequisiteAndTerminalGuards(t *testing.T) {
	for _, tag := range []string{"raid-house", "raid-site", "radar", "tech", "power", "reserve-power"} {
		t.Run("disabled_"+tag, func(t *testing.T) {
			e := raidCompletionFixture(t, "initial")
			raidCompletionAdvanceTo(t, []*Engine{e}, 400)
			target, house := tagged(e, tag), tagged(e, "raid-house")
			issue(t, e, 1, Order{Kind: "power", Entities: []ID{target.ID}, Index: 0})
			if tag == "power" || tag == "reserve-power" {
				other := "power"
				if tag == "power" {
					other = "reserve-power"
				}
				issue(t, e, 1, Order{Kind: "power", Entities: []ID{tagged(e, other).ID}, Index: 0})
			}
			want := "strategic_not_ready"
			if tag == "raid-house" {
				want = "invalid_safehouse"
			}
			raidCompletionOrder(t, []*Engine{e}, raidCompletionAbility(house.ID), want)
			issue(t, e, 1, Order{Kind: "power", Entities: []ID{target.ID}, Index: 1})
			if tag == "power" || tag == "reserve-power" {
				other := "power"
				if tag == "power" {
					other = "reserve-power"
				}
				issue(t, e, 1, Order{Kind: "power", Entities: []ID{tagged(e, other).ID}, Index: 1})
			}
			raidCompletionOrder(t, []*Engine{e}, raidCompletionAbility(house.ID), "ok")
		})
	}
	for _, terminal := range []string{"defeated", "finished"} {
		t.Run(terminal, func(t *testing.T) {
			mode := "initial"
			if terminal == "finished" {
				mode = "terminal"
			}
			e := raidCompletionFixture(t, mode)
			raidCompletionAdvanceTo(t, []*Engine{e}, 400)
			if terminal == "defeated" {
				issue(t, e, 1, Order{Kind: "surrender"})
			}
			before := e.Hash()
			err := e.Submit(1, e.player(1).LastSequence+1, []Order{raidCompletionAbility(tagged(e, "raid-house").ID)})
			want := "player_inactive"
			if terminal == "finished" {
				want = "match_finished"
			}
			if err == nil || err.Error() != want || before != e.Hash() {
				t.Fatal("terminal player/match admitted Raid or mutated state", err)
			}
		})
	}
}
