package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func aiQualityEconomyRecoveryDump(t *testing.T, e *Engine, label string) {
	t.Helper()
	dir := os.Getenv("AI_QUALITY_ECONOMY_RECOVERY_EVIDENCE")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	name := strings.ReplaceAll(t.Name(), "/", "_") + "-" + label
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	trace, err := json.MarshalIndent(struct {
		Hash     string      `json:"state_hash"`
		Metadata Metadata    `json:"metadata"`
		Map      content.Map `json:"map"`
		Commands []Scheduled `json:"commands"`
		Pending  []Scheduled `json:"pending"`
	}{e.Hash(), e.Metadata(), e.state.Map, e.state.Log, e.state.Pending}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	for path, data := range map[string][]byte{name + ".save.json": saved, name + ".trace.json": trace} {
		if err := os.WriteFile(filepath.Join(dir, path), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func aiQualityEconomyRecoveryAdvance(t *testing.T, e *Engine) {
	t.Helper()
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("normal recovery execution rejected an order", e.Tick(), result)
		}
	}
	p := e.player(1)
	if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 || e.countRole(1, "rig", true) > 4 || e.countRole(1, "hauler", true) > 8 {
		t.Fatal("recovery bypassed ordinary money or allocation limits", *p)
	}
	for _, batch := range e.state.Pending {
		if len(batch.Orders) > 32 {
			t.Fatal("recovery bypassed ordinary command batching")
		}
		used := map[ID]bool{}
		for _, order := range batch.Orders {
			for _, id := range order.Entities {
				actor := e.entity(id)
				if actor == nil || actor.Owner != batch.Player || used[id] {
					t.Fatal("recovery submitted an unowned or duplicate actor", batch, id)
				}
				used[id] = true
			}
		}
	}
}

// Fragile starting assets are declared battle damage. All recorded casualties
// below are inflicted by admitted normal enemy Attack orders, never removal.
func aiQualityEconomyRecoveryLose(t *testing.T, e *Engine, targets []*Entity, shooters []*Entity) {
	t.Helper()
	attacks := []Order{}
	for i, shooter := range shooters {
		attacks = append(attacks, Order{Kind: "attack", Entities: []ID{shooter.ID}, Target: targets[min(i, len(targets)-1)].ID})
	}
	if err := e.Submit(2, e.player(2).LastSequence+1, attacks); err != nil {
		t.Fatal(err)
	}
	destroyed := map[ID]bool{}
	for range 120 {
		aiQualityEconomyRecoveryAdvance(t, e)
		for _, event := range e.state.Events {
			if event.Kind == "destroyed" {
				destroyed[event.Entity] = true
			}
		}
		gone := true
		for _, target := range targets {
			gone = gone && e.entity(target.ID) == nil && destroyed[target.ID]
		}
		if gone {
			moves := []Order{}
			for i, shooter := range shooters {
				moves = append(moves, Order{Kind: "move", Entities: []ID{shooter.ID}, Position: Vec{X: 50000 + int32(i%5)*1000, Y: 46000 + int32(i/5)*1000}})
			}
			if err := e.Submit(2, e.player(2).LastSequence+1, moves); err != nil {
				t.Fatal(err)
			}
			aiQualityEconomyRecoveryAdvance(t, e)
			return
		}
	}
	t.Fatal("declared hostile loss did not execute normally", e.Tick(), destroyed)
}

func aiQualityEconomyRecoveryFactory(t *testing.T, faction, mode string) (*Engine, *Entity, *Replay) {
	t.Helper()
	m := fixtureMap()
	m.Fields, m.Stations = nil, nil
	difficulty := "normal"
	if mode == "manual" {
		difficulty = ""
	}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 87, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: difficulty}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
	e.spawn("supply", 1, Vec{X: 10000, Y: 20000}, true, 1800000).IncludedHauler = true
	e.spawn("barracks", 1, Vec{X: 16000, Y: 20000}, true, 600000)
	factory := e.spawn("factory", 1, Vec{X: 22000, Y: 20000}, true, 1800000)
	radar := e.spawn("radar", 1, Vec{X: 28000, Y: 20000}, true, 1400000)
	typ := faction + ".artillery"
	if mode == "working" || mode == "lowpower" || mode == "working_queued" {
		typ = faction + ".car"
	}
	if mode == "lowpower" {
		for i := int32(0); i < 3; i++ {
			e.spawn("abm", 1, Vec{X: 34000 + i*5000, Y: 20000}, true, 1800000)
		}
	}
	unit, _ := e.catalog.Unit(typ)
	e.player(1).Credits = unit.Cost + 1200000
	targets := []*Entity{e.entity(1), e.entity(2), radar}
	if mode == "living" {
		targets = []*Entity{e.entity(1), radar}
	}
	shooters := []*Entity{}
	for _, target := range targets {
		target.HP = 1
		shooter := e.spawn("IR.at", 2, Vec{X: target.Position.X, Y: target.Position.Y + 5000}, true, 500000)
		e.assign(shooter, Order{Kind: "move", Position: Vec{X: 52000, Y: 48000}})
		shooters = append(shooters, shooter)
	}
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyRecoveryDump(t, e, "initial")
	orders := []Order{{Kind: "train", Entities: []ID{factory.ID}, Type: typ}}
	if mode == "unpaid" {
		orders = append(orders, orders[0])
	}
	if err := e.Submit(1, 1, orders); err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyRecoveryAdvance(t, e)
	if len(factory.Jobs) == 0 || !factory.Jobs[0].Started || factory.Jobs[0].Paid != unit.Cost {
		t.Fatal("front job must first be normally admitted and paid", factory.Jobs)
	}
	aiQualityEconomyRecoveryLose(t, e, targets, shooters)
	if mode == "unpaid" {
		issue(t, e, 1, Order{Kind: "cancel", Entities: []ID{factory.ID}, Index: 0})
	}
	if mode == "queued" || mode == "working_queued" {
		issue(t, e, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: faction + ".rig"})
	}
	if mode == "living" {
		issue(t, e, 1, Order{Kind: "move", Entities: []ID{2}, Position: Vec{X: 32000, Y: 10000}})
	}
	if mode == "disabled" {
		issue(t, e, 1, Order{Kind: "power", Entities: []ID{factory.ID}})
	}
	if e.has(1, "hq") || len(factory.Jobs) == 0 || mode != "living" && e.countRole(1, "rig", false) != 0 || e.player(1).Income != 0 {
		t.Fatal("factory recovery checkpoint has the wrong loss/queue/input", factory.Jobs, *e.player(1))
	}
	return e, factory, replay
}

func TestAIQualityEconomyRecoveryBlockedFactoryNormalLoss(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, mode := range []string{"paid", "unpaid", "queued"} {
			t.Run(faction+"/"+mode, func(t *testing.T) {
				e, factory, replay := aiQualityEconomyRecoveryFactory(t, faction, mode)
				p := e.player(1)
				start, bank, spent, head := e.Tick(), p.Credits, p.Spent, factory.Jobs[0]
				if e.jobReady(p, factory, &head) || !factory.Active(e.Tick()) {
					t.Fatal("the real front job must be blocked by lost prerequisites")
				}
				refund := int64(0)
				if head.Started {
					refund = head.Paid * 3 * int64(head.Required-head.Work) / (4 * int64(head.Required))
				}
				aiQualityEconomyRecoveryDump(t, e, "blocked")
				// Replay regenerates AI commands, so its AI recovery initial input
				// is the real blocked checkpoint after the manual setup commands.
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				saved, _ := e.Save()
				twin, err := Restore(e.catalog, saved)
				if err != nil {
					t.Fatal(err)
				}
				cancelTick := Tick(0)
				for range 120 {
					aiQualityEconomyRecoveryAdvance(t, e)
					aiQualityEconomyRecoveryAdvance(t, twin)
					for _, batch := range e.state.Log {
						if batch.Player != 1 || batch.Tick <= start {
							continue
						}
						for _, order := range batch.Orders {
							if order.Kind == "cancel" && order.Index == 0 && len(order.Entities) == 1 && order.Entities[0] == factory.ID {
								cancelTick = batch.Tick
							}
						}
					}
					if cancelTick != 0 && e.Tick() >= cancelTick {
						break
					}
				}
				if cancelTick == 0 || cancelTick > start+41 {
					t.Fatal("lost HQ/rig leaves the real factory front job stalled", e.Tick(), factory.Jobs, p.Credits, p.Spent, p.DefeatAt)
				}
				if p.Credits != bank+refund-(p.Spent-spent) || p.Income != 0 || e.Hash() != twin.Hash() {
					t.Fatal("normal cancellation/refund or restored continuation differs", bank, refund, p.Credits, p.Spent, spent)
				}
				for _, batch := range e.state.Log {
					if batch.Player == 1 && batch.Tick == cancelTick {
						cost := int64(0)
						for _, order := range batch.Orders {
							reservation, _, _ := e.aiOrderReservation(p, &order)
							cost += reservation
							if order.Kind == "train" && order.Entities[0] == factory.ID {
								t.Fatal("cancellation cycle also trained through the occupied actor")
							}
						}
						if cost > bank {
							t.Fatal("planner spent a refund before normal cancellation executed", cost, bank)
						}
					}
				}
				for range 90 {
					if len(factory.Jobs) > 0 && factory.Jobs[0].Emergency && factory.Jobs[0].Started {
						break
					}
					aiQualityEconomyRecoveryAdvance(t, e)
					aiQualityEconomyRecoveryAdvance(t, twin)
				}
				if len(factory.Jobs) == 0 || !factory.Jobs[0].Emergency || !factory.Jobs[0].Started || factory.Jobs[0].Paid != 1200000 || factory.Jobs[0].Required != 1200 || factory.Jobs[0].Supply != 0 {
					t.Fatal("recovery did not start an ordinary paid zero-Supply emergency rig", factory.Jobs)
				}
				aiQualityEconomyRecoveryDump(t, e, "paid-rig")
				readyValue := int64(0)
				for range 1250 {
					aiQualityEconomyRecoveryAdvance(t, e)
					aiQualityEconomyRecoveryAdvance(t, twin)
					for _, event := range e.state.Events {
						if event.Kind == "emergency_rig_ready" && event.Owner == 1 {
							readyValue = event.Value
						}
					}
					if e.Tick()%500 == 0 {
						if err := replay.Capture(e, false); err != nil {
							t.Fatal(err)
						}
					}
					if e.countRole(1, "rig", false) > 0 {
						break
					}
				}
				trains, cancels := 0, 0
				for _, batch := range e.state.Log {
					if batch.Player == 1 && batch.Tick > start {
						for _, order := range batch.Orders {
							if len(order.Entities) == 1 && order.Entities[0] == factory.ID {
								if order.Kind == "cancel" {
									cancels++
								}
								if order.Kind == "train" && order.Type == faction+".rig" {
									trains++
								}
							}
						}
					}
				}
				wantTrains := 1
				if mode == "queued" {
					wantTrains = 0
				}
				if readyValue != 1200000 || e.countRole(1, "rig", false) != 1 || cancels != 1 || trains != wantTrains || p.DefeatAt != 0 || e.Outcome().Finished || e.Hash() != twin.Hash() {
					t.Fatal("emergency recovery duplicated, failed, or changed ordinary defeat/restore", readyValue, cancels, trains, e.Tick())
				}
				if err := replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
				played, err := replay.Seek(e.catalog, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("full AI recovery replay from the real blocked checkpoint differs", err)
				}
				aiQualityEconomyRecoveryDump(t, e, "final")
				t.Logf("normal blocked checkpoint=%d cancel=%d ready=%d paid=%d work=%d refund=%d emergency=%d trains=%d", start, cancelTick, e.Tick(), head.Paid, head.Work, refund, readyValue, trains)
			})
		}
	}
}

func TestAIQualityEconomyRecoveryManualFactoryLegality(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, factory, replay := aiQualityEconomyRecoveryFactory(t, faction, "manual")
			head, bank, spent := factory.Jobs[0], e.player(1).Credits, e.player(1).Spent
			refund := head.Paid * 3 * int64(head.Required-head.Work) / (4 * int64(head.Required))
			issue(t, e, 1, Order{Kind: "cancel", Entities: []ID{factory.ID}, Index: 0})
			if e.player(1).Credits != bank+refund || e.player(1).Spent != spent || len(factory.Jobs) != 0 {
				t.Fatal("ordinary manual cancel did not apply recorded refund once")
			}
			issue(t, e, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: faction + ".rig"})
			if len(factory.Jobs) != 1 || factory.Jobs[0].Paid != 1200000 || !factory.Jobs[0].Emergency || factory.Jobs[0].Required != 1200 || e.player(1).Credits != bank+refund-1200000 || e.player(1).Spent != spent+1200000 {
				t.Fatal("manual recovery must pay the existing emergency rig cost", factory.Jobs)
			}
			aiQualityEconomyRecoveryDump(t, e, "manual-paid")
			for range 650 {
				aiQualityEconomyRecoveryAdvance(t, e)
				if e.Tick()%500 == 0 {
					if err := replay.Capture(e, false); err != nil {
						t.Fatal(err)
					}
				}
				if e.countRole(1, "rig", false) == 1 {
					break
				}
			}
			if e.countRole(1, "rig", false) != 1 || e.player(1).Credits != bank+refund-1200000 || e.player(1).Spent != spent+1200000 {
				t.Fatal("normal manual emergency rig did not complete with exact payment")
			}
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("full human paid/loss/cancel/production replay from New differs", err)
			}
			aiQualityEconomyRecoveryDump(t, e, "manual-final")
		})
	}
}

func TestAIQualityEconomyRecoveryPreservesWorkingPromises(t *testing.T) {
	for _, mode := range []string{"working", "lowpower", "working_queued", "living", "disabled", "complete", "alternate"} {
		t.Run(mode, func(t *testing.T) {
			e, factory, _ := aiQualityEconomyRecoveryFactory(t, "US", mode)
			if mode == "complete" {
				// Declared full-work checkpoint: preserve a paid exit/prerequisite
				// wait rather than discard its already completed investment.
				factory.Jobs[0].Work = factory.Jobs[0].Required
			}
			var alternate *Entity
			if mode == "alternate" {
				alternate = e.spawn("factory", 1, Vec{X: 36000, Y: 10000}, true, 1800000)
				e.recalculate()
				e.updateFog()
			}
			start, work := e.Tick(), factory.Jobs[0].Work
			for range 90 {
				aiQualityEconomyRecoveryAdvance(t, e)
			}
			for _, batch := range e.state.Log {
				if batch.Player == 1 && batch.Tick > start {
					for _, order := range batch.Orders {
						if order.Kind == "cancel" && order.Entities[0] == factory.ID {
							t.Fatal("recovery canceled a working, complete, disabled or promised job", mode)
						}
						if order.Kind == "train" && order.Type == "US.rig" && mode != "alternate" {
							t.Fatal("recovery duplicated an existing reachable builder promise", mode)
						}
					}
				}
			}
			if mode == "working" || mode == "lowpower" || mode == "working_queued" {
				if len(factory.Jobs) == 0 || factory.Jobs[0].Work <= work {
					t.Fatal("ordinary working front job did not progress")
				}
				if mode == "lowpower" && (!e.player(1).LowPower() || factory.Jobs[0].Work != work+90) {
					t.Fatal("low-power recovery changed normal half-speed work", factory.Jobs)
				}
			}
			if mode == "alternate" && (len(alternate.Jobs) != 1 || !alternate.Jobs[0].Emergency || alternate.Jobs[0].Paid != 1200000 || factory.Jobs[0].Work != work) {
				t.Fatal("idle eligible alternate must precede blocked investment cancellation", alternate.Jobs, factory.Jobs)
			}
		})
	}
}

func aiQualityEconomyRecoveryCollector(t *testing.T, faction, condition string) (*Engine, *Entity, *Replay) {
	t.Helper()
	m := fixtureMap()
	m.Spawns[0].Position = Vec{X: 10000, Y: 10000}
	m.Stations = nil
	m.Fields[0] = content.Field{ID: 1, Position: Vec{X: 20000, Y: 10000}, Credits: 3600000}
	e, err := New(content.MustBase(), Config{Map: m, Seed: 89, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "normal"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("power", 1, Vec{X: 4000, Y: 10000}, true, 500000)
	supply := e.spawn("supply", 1, Vec{X: 16000, Y: 10000}, true, 1800000)
	if condition == "margin" || condition == "lowpower" {
		for i, typ := range []string{"barracks", "factory", "radar", "tech"} {
			e.spawn(typ, 1, Vec{X: int32(26000 + i*6000), Y: 24000}, true, 0)
		}
		if condition == "lowpower" {
			e.spawn("abm", 1, Vec{X: 44000, Y: 32000}, true, 1800000)
			e.spawn("depot", 1, Vec{X: 44000, Y: 40000}, true, 1000000)
		}
	}
	targets := []*Entity{}
	shooters := []*Entity{}
	if condition == "nohq" {
		e.entity(1).HP = 1
		targets = append(targets, e.entity(1))
		shooter := e.spawn("IR.at", 2, Vec{X: 6000, Y: 8000}, true, 500000)
		e.assign(shooter, Order{Kind: "move", Position: Vec{X: 52000, Y: 46000}})
		shooters = append(shooters, shooter)
	}
	for i := int32(0); i < 10; i++ {
		shooter := e.spawn("IR.at", 2, Vec{X: 17000 + i%5*700, Y: 13000 + i/5*700}, true, 500000)
		e.assign(shooter, Order{Kind: "move", Position: Vec{X: 52000, Y: 46000}})
		shooters = append(shooters, shooter)
	}
	e.player(1).Credits = 900000
	e.recalculate()
	e.updateFog()
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyRecoveryDump(t, e, "initial")
	aiQualityEconomyRecoveryAdvance(t, e)
	var included *Entity
	for _, unit := range e.state.Entities {
		if unit.Owner == 1 && e.role(unit) == "hauler" {
			included = unit
		}
	}
	if included == nil || !supply.IncludedHauler || included.Paid != 900000 || e.player(1).Spent != 0 {
		t.Fatal("included collector must be issued by normal supply-center lifecycle")
	}
	targets = append(targets, included)
	aiQualityEconomyRecoveryLose(t, e, targets, shooters)
	if e.countRole(1, "hauler", true) != 0 || e.player(1).Credits != 900000 || e.player(1).Income != 0 || !supply.IncludedHauler || !supply.Active(e.Tick()) {
		t.Fatal("lost-collector checkpoint must retain exactly its real bootstrap bank", *e.player(1))
	}
	if condition == "margin" && (e.player(1).LowPower() || e.aiPowerMargin(e.player(1), aiOwnView(e, 1)) >= 35) || condition == "lowpower" && !e.player(1).LowPower() {
		t.Fatal("active-power fixture does not express the real margin control", *e.player(1))
	}
	return e, supply, replay
}

func TestAIQualityEconomyRecoveryCollectorBootstrapLifecycle(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, supply, replay := aiQualityEconomyRecoveryCollector(t, faction, "nohq")
			p := e.player(1)
			start := e.Tick()
			stock := e.state.Fields[0].Remaining
			lostCargo := e.state.Map.Fields[0].Credits - stock
			if !e.canSee(1, e.state.Fields[0].Position) || lostCargo <= 0 || stock <= 3500000 {
				t.Fatal("lost included cargo must leave observed stock sufficient for a normal HQ", stock, lostCargo)
			}
			aiQualityEconomyRecoveryDump(t, e, "lost-included")
			// Human setup/loss is separately replayed by the manual control;
			// this recorder covers every AI command from this real checkpoint.
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			saved, _ := e.Save()
			twin, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			for range 90 {
				aiQualityEconomyRecoveryAdvance(t, e)
				aiQualityEconomyRecoveryAdvance(t, twin)
				if len(supply.Jobs) > 0 {
					break
				}
			}
			if len(supply.Jobs) != 1 || supply.Jobs[0].Type != faction+".hauler" || !supply.Jobs[0].Started || supply.Jobs[0].Paid != 900000 || supply.Jobs[0].Supply != 0 || p.Credits != 0 || p.Spent != 900000 || e.has(1, "hq") {
				t.Fatal("HQ savings stranded the last ordinary affordable collector", e.Tick(), supply.Jobs, p.Credits, p.Spent)
			}
			aiQualityEconomyRecoveryDump(t, e, "paid-collector")
			mid, _ := e.Save()
			midTwin, err := Restore(e.catalog, mid)
			if err != nil {
				t.Fatal(err)
			}
			var cargoTwin *Engine
			cargoSaved := false
			for range 5900 {
				aiQualityEconomyRecoveryAdvance(t, e)
				aiQualityEconomyRecoveryAdvance(t, twin)
				aiQualityEconomyRecoveryAdvance(t, midTwin)
				if cargoTwin != nil {
					aiQualityEconomyRecoveryAdvance(t, cargoTwin)
				}
				if !cargoSaved {
					for _, unit := range e.state.Entities {
						if unit.Owner == 1 && e.role(unit) == "hauler" && unit.Cargo > 0 {
							cargoSaved = true
							aiQualityEconomyRecoveryDump(t, e, "cargo")
							save, _ := e.Save()
							cargoTwin, err = Restore(e.catalog, save)
							if err != nil {
								t.Fatal(err)
							}
							break
						}
					}
				}
				if e.Tick()%500 == 0 {
					if err := replay.Capture(e, false); err != nil {
						t.Fatal(err)
					}
				}
				if e.has(1, "hq") {
					break
				}
			}
			trains := 0
			for _, batch := range e.state.Log {
				if batch.Player == 1 && batch.Tick > start {
					for _, order := range batch.Orders {
						if order.Kind == "train" && order.Type == faction+".hauler" {
							trains++
						}
					}
				}
			}
			if !e.has(1, "hq") || p.Income != stock || p.Spent != 4400000 || p.Credits != stock-3500000 || trains != 1 || e.Outcome().Finished || !cargoSaved {
				t.Fatal("normal deliveries did not fund and complete the ordinary HQ", start, e.Tick(), p.Credits, p.Income, p.Spent, e.countRole(1, "hauler", false))
			}
			if e.Hash() != twin.Hash() || e.Hash() != midTwin.Hash() || e.Hash() != cargoTwin.Hash() {
				t.Fatal("blocked, paid-job or cargo checkpoint continuation differs")
			}
			if err := replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
			played, err := replay.Seek(e.catalog, e.Tick())
			if err != nil || played.Hash() != e.Hash() {
				t.Fatal("full AI paid-hauler/cargo/HQ checkpoint replay differs", err)
			}
			aiQualityEconomyRecoveryDump(t, e, "final")
			t.Logf("included collector lost=%d cargo lost=%d paid=%d HQ complete=%d income=%d spent=%d bank=%d hash=%s", start, lostCargo, 900000, e.Tick(), p.Income, p.Spent, p.Credits, e.Hash())
		})
	}
}

func TestAIQualityEconomyRecoveryActivePowerCollectorBudget(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, condition := range []string{"margin", "lowpower"} {
			t.Run(faction+"/"+condition, func(t *testing.T) {
				e, supply, _ := aiQualityEconomyRecoveryCollector(t, faction, condition)
				start := e.Tick()
				for range 90 {
					aiQualityEconomyRecoveryAdvance(t, e)
					if len(supply.Jobs) > 0 {
						break
					}
				}
				if len(supply.Jobs) != 1 || supply.Jobs[0].Paid != 900000 || e.player(1).Credits != 0 || e.player(1).Spent != 900000 || e.countRole(1, "power", false) != 1 {
					t.Fatal("surplus policy spent collector funds on an unnecessary plant", start, e.Tick(), supply.Jobs, *e.player(1))
				}
				work := supply.Jobs[0].Work
				for range 20 {
					aiQualityEconomyRecoveryAdvance(t, e)
				}
				step := uint32(40)
				if condition == "lowpower" {
					step = 20
				}
				if supply.Jobs[0].Work != work+step {
					t.Fatal("collector bootstrap changed normal power-dependent work", supply.Jobs)
				}
				aiQualityEconomyRecoveryDump(t, e, "paid-collector")
			})
		}
	}
}

func TestAIQualityEconomyRecoveryCollectorKnowledgeAndPrerequisiteControls(t *testing.T) {
	for _, condition := range []string{"absent_power", "disabled_supply", "unknown_stock", "pending_included", "queued", "live"} {
		t.Run(condition, func(t *testing.T) {
			e := fixture(t)
			if condition == "unknown_stock" {
				// Hide the controlled field before New: the normal fixture has
				// already remembered it publicly, so clearing AIFields cannot
				// establish unknown stock after public-memory intake.
				m := fixtureMap()
				m.Fields[0].Position = Vec{X: 50000, Y: 40000}
				var err error
				e, err = New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{{ID: 1, Name: "Alpha", Faction: "US", Team: 1}, {ID: 2, Name: "Bravo", Faction: "IR", Team: 2}}})
				if err != nil { t.Fatal(err) }
				e.state.Countdown = 0
			}
			supply := e.spawn("supply", 1, Vec{X: 14000, Y: 18000}, true, 1800000)
			supply.IncludedHauler = true
			power := e.spawn("power", 1, Vec{X: 4000, Y: 18000}, true, 500000)
			e.player(1).AI, e.player(1).Credits = "normal", 900000
			e.player(1).AIFields = []FieldView{{ID: 1, Position: e.state.Fields[0].Position, Remaining: 3600000}}
			switch condition {
			case "absent_power":
				power.HP = 0
			case "disabled_supply":
				supply.Enabled = false
			case "unknown_stock":
				e.player(1).AIFields = nil
			case "pending_included":
				e.spawn("supply", 1, Vec{X: 14000, Y: 26000}, false, 1800000)
			case "queued":
				supply.Jobs = []Job{{Type: "US.hauler", Required: 1000}}
			case "live":
				e.spawn("US.hauler", 1, Vec{X: 14000, Y: 16000}, true, 900000)
			}
			if condition == "unknown_stock" {
				e.recalculate()
				e.updateFog()
				view, ok := e.PlayerView(1)
				if !ok || len(view.Fields) != 0 || len(view.KnownFields) != 0 || len(e.player(1).AIFields) != 0 {
					t.Fatal("unknown-stock fixture has current sight or remembered public/AI stock", view.Fields, view.KnownFields, e.player(1).AIFields)
				}
			}
			orders := aiQualityEconomyPlan(e)
			if condition == "unknown_stock" && len(e.player(1).AIFields) != 0 {
				t.Fatal("unknown-stock planning acquired a field without authorized sight or public memory", e.player(1).AIFields)
			}
			for _, order := range orders {
				if order.Kind == "train" && order.Type == "US.hauler" && order.Entities[0] == supply.ID {
					t.Fatal("first-collector recovery ignored a prerequisite or existing promise", condition, orders)
				}
			}
			if condition == "absent_power" {
				found := false
				for _, order := range orders {
					found = found || order.Kind == "build" && order.Type == "power"
				}
				if !found {
					t.Fatal("actually missing power must retain its normal necessary priority")
				}
			}
		})
	}
}

func TestAIQualityEconomyRecoveryHiddenInputsDoNotChangeIntentions(t *testing.T) {
	for _, condition := range []string{"factory", "collector"} {
		t.Run(condition, func(t *testing.T) {
			var e *Engine
			if condition == "factory" {
				e, _, _ = aiQualityEconomyRecoveryFactory(t, "IR", "paid")
			} else {
				e, _, _ = aiQualityEconomyRecoveryCollector(t, "IR", "nohq")
			}
			saved, _ := e.Save()
			twin, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			if e.canSeeEntity(1, e.entity(3)) {
				t.Fatal("opponent hidden-state control is visible")
			}
			twin.player(2).Credits = 100000000
			twin.entity(3).Jobs = []Job{{Type: "IR.rig", Required: 1200}}
			twin.entity(4).Position = Vec{X: 50000, Y: 55000}
			if condition == "collector" {
				if e.canSee(1, e.state.Fields[1].Position) {
					t.Fatal("fogged stock control is visible")
				}
				twin.state.Fields[1].Remaining = 0
			}
			e.state.Tick, twin.state.Tick = 160, 160
			e.updateAI()
			twin.updateAI()
			left, right := []Order{}, []Order{}
			for _, batch := range e.state.Pending {
				if batch.Player == 1 {
					left = append(left, batch.Orders...)
				}
			}
			for _, batch := range twin.state.Pending {
				if batch.Player == 1 {
					right = append(right, batch.Orders...)
				}
			}
			if !reflect.DeepEqual(left, right) || e.player(1).Credits != twin.player(1).Credits || e.player(1).Spent != twin.player(1).Spent {
				t.Fatal("unseen opponent bank/queue/position or stock changed recovery", left, right)
			}
		})
	}
}

func TestAIQualityEconomyRecoveryFullSupplyFrontJob(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, factory, _ := aiQualityEconomyRecoveryFactory(t, faction, "paid")
			issue(t, e, 1, Order{Kind: "cancel", Entities: []ID{factory.ID}, Index: 0})
			for i := int32(0); i < 25; i++ {
				unit := e.spawn(faction+".tank", 1, Vec{X: 36000 + i%5*1800, Y: 34000 + i/5*1800}, true, 0)
				e.assign(unit, Order{Kind: "hold"})
			}
			e.recalculate()
			e.updateFog()
			issue(t, e, 1, Order{Kind: "train", Entities: []ID{factory.ID}, Type: faction + ".car"})
			if len(factory.Jobs) != 1 || factory.Jobs[0].Started || e.player(1).Supply != 100 {
				t.Fatal("full-Supply fixture must admit an unpaid normal head")
			}
			if _, _, _, code := e.productionAllocation(e.player(1), &factory.Jobs[0]); code != "supply_blocked" {
				t.Fatal("front job must wait for ordinary live Supply", code)
			}
			start := e.Tick()
			for range 90 {
				aiQualityEconomyRecoveryAdvance(t, e)
				if len(factory.Jobs) > 0 && factory.Jobs[0].Emergency && factory.Jobs[0].Started {
					break
				}
			}
			if len(factory.Jobs) != 1 || !factory.Jobs[0].Emergency || factory.Jobs[0].Paid != 1200000 || factory.Jobs[0].Supply != 0 || e.player(1).Supply != 100 || e.countRole(1, "tank", false) != 25 {
				t.Fatal("unpaid allocation blocker stranded a legal zero-Supply rig", start, e.Tick(), factory.Jobs)
			}
			aiQualityEconomyRecoveryDump(t, e, "paid-zero-Supply-rig")
		})
	}
}

func TestAIQualityEconomyRecoveryDifficultyCadence(t *testing.T) {
	for _, difficulty := range []string{"easy", "hard"} {
		t.Run(difficulty, func(t *testing.T) {
			e, factory, _ := aiQualityEconomyRecoveryFactory(t, "US", "paid")
			e.player(1).AI = difficulty
			period := Tick(80)
			if difficulty == "hard" {
				period = 20
			}
			start := e.Tick()
			for e.Tick() < period+1 {
				aiQualityEconomyRecoveryAdvance(t, e)
			}
			cancels := 0
			for _, batch := range e.state.Log {
				if batch.Player == 1 && batch.Tick > start {
					for _, order := range batch.Orders {
						if order.Kind == "cancel" && order.Entities[0] == factory.ID {
							cancels++
							if batch.Tick != period+1 {
								t.Fatal("emergency cancellation changed the ordinary difficulty cadence", batch.Tick)
							}
						}
					}
				}
			}
			if cancels != 1 {
				t.Fatal("blocked queue received no first-cycle normal cancellation", difficulty, factory.Jobs)
			}
		})
	}
}
