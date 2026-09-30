package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func aiQualityEconomySavingsDump(t *testing.T, e *Engine, label string) {
	t.Helper()
	dir := os.Getenv("AI_QUALITY_ECONOMY_SAVINGS_EVIDENCE")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
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
	name := strings.ReplaceAll(t.Name(), "/", "_") + "-" + label
	for suffix, data := range map[string][]byte{".save.json": saved, ".trace.json": trace} {
		if err := os.WriteFile(filepath.Join(dir, name+suffix), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
}

// Capital and existing structures are declared checkpoint inputs. The paid
// factory head and every lost HQ/rig/prerequisite use normal admitted commands;
// no credits, work, cargo, or ownership are changed after the first advance.
func aiQualityEconomySavingsFixture(t *testing.T, faction, mode string) (*Engine, *Entity, *Entity) {
	t.Helper()
	m := fixtureMap()
	m.Fields, m.Stations = nil, nil
	e, err := New(content.MustBase(), Config{Map: m, Seed: 105, Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "normal"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
	e.spawn("supply", 1, Vec{X: 10000, Y: 20000}, true, 1800000).IncludedHauler = true
	e.spawn("barracks", 1, Vec{X: 16000, Y: 20000}, true, 600000)
	factory := e.spawn("factory", 1, Vec{X: 22000, Y: 20000}, true, 1800000)
	outpost := e.spawn("outpost", 1, Vec{X: 34000, Y: 12000}, true, 1000000)
	e.spawn(faction+".hauler", 1, Vec{X: 10000, Y: 15000}, true, 900000)
	recon, _ := e.catalog.Unit(faction + ".recon")
	e.spawn(recon.ID, 1, Vec{X: 16000, Y: 15000}, true, recon.Cost)
	p := e.player(1)
	p.Credits = 900000
	targets := []*Entity{e.entity(1), e.entity(2)}
	producer := factory
	typ := ""
	if mode == "hq" {
		p.Credits = 700000
		targets = []*Entity{e.entity(2)}
		producer = e.entity(1)
	}
	if mode == "blocked" {
		radar := e.spawn("radar", 1, Vec{X: 28000, Y: 20000}, true, 1400000)
		targets = append(targets, radar)
		typ = faction + ".artillery"
		p.Credits = 250000
	}
	if mode == "working" {
		typ = faction + ".car"
	}
	if typ != "" {
		unit, _ := e.catalog.Unit(typ)
		p.Credits += unit.Cost
	}
	shooters := []*Entity{}
	for _, target := range targets {
		target.HP = 1 // Declared prior battle damage, before any command executes.
		shooter := e.spawn("IR.at", 2, Vec{X: target.Position.X, Y: target.Position.Y + 5000}, true, 500000)
		e.assign(shooter, Order{Kind: "move", Position: Vec{X: 52000, Y: 48000}})
		shooters = append(shooters, shooter)
	}
	e.recalculate()
	e.updateFog()
	aiQualityEconomySavingsDump(t, e, "initial")
	if typ != "" {
		if err := e.Submit(1, 1, []Order{{Kind: "train", Entities: []ID{factory.ID}, Type: typ}}); err != nil {
			t.Fatal(err)
		}
		aiQualityEconomyRecoveryAdvance(t, e)
		unit, _ := e.catalog.Unit(typ)
		if len(factory.Jobs) != 1 || !factory.Jobs[0].Started || factory.Jobs[0].Paid != unit.Cost {
			t.Fatal("fixture front job did not begin and pay normally", factory.Jobs)
		}
	}
	aiQualityEconomyRecoveryLose(t, e, targets, shooters)
	if e.countRole(1, "rig", false) != 0 || e.countRole(1, "hauler", false) != 1 || p.Income != 0 || len(p.AIFields) != 0 || e.has(1, "hq") != (mode == "hq") {
		t.Fatal("lost checkpoint has wrong builder, income, stock, or HQ inputs")
	}
	aiQualityEconomySavingsDump(t, e, "lost")
	return e, producer, outpost
}

func aiQualityEconomySavingsHoldAndPay(t *testing.T, faction, mode string) {
	t.Helper()
	e, producer, outpost := aiQualityEconomySavingsFixture(t, faction, mode)
	p := e.player(1)
	if mode == "blocked" {
		head, bank, spent := producer.Jobs[0], p.Credits, p.Spent
		if e.jobReady(p, producer, &head) || !head.Started || head.Work == 0 {
			t.Fatal("real paid head must stall at its ordinary work after prerequisite loss")
		}
		refund := head.Paid * 3 * int64(head.Required-head.Work) / (4 * int64(head.Required))
		for range 85 {
			if len(producer.Jobs) == 0 {
				break
			}
			aiQualityEconomyRecoveryAdvance(t, e)
		}
		if len(producer.Jobs) != 0 || p.Credits != bank+refund || p.Spent != spent || p.Income != 0 {
			aiQualityEconomySavingsDump(t, e, "wrong-cancel-accounting")
			t.Fatal("normal cancellation must refund once before further purchases", bank, refund, p.Credits, spent, p.Spent)
		}
		aiQualityEconomySavingsDump(t, e, "actual-front-refund")
		t.Logf("actual blocked cancellation paid=%d work=%d/%d refund=%d bank=%d", head.Paid, head.Work, head.Required, refund, p.Credits)
	}
	order := Order{Kind: "train", Entities: []ID{producer.ID}, Type: faction + ".rig"}
	job, code := e.productionJob(p, producer, order)
	if code != "ok" || !e.jobReady(p, producer, &job) {
		t.Fatal("builder saving target must retain ordinary prerequisites", code)
	}
	cost, _, _ := e.aiOrderReservation(p, &order)
	if _, _, _, code = e.productionAllocation(p, &job); code != "insufficient_credits" || p.Credits >= cost {
		t.Fatal("normal allocation must identify the real cash-shortage checkpoint", code, p.Credits, cost)
	}
	bank, spent, income, start := p.Credits, p.Spent, p.Income, e.Tick()
	aiQualityEconomySavingsDump(t, e, "saving-start")
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for range 90 {
		aiQualityEconomyRecoveryAdvance(t, e)
		aiQualityEconomyRecoveryAdvance(t, twin)
		if p.Credits != bank || p.Spent != spent || p.Income != income {
			aiQualityEconomySavingsDump(t, e, "savings-consumed")
			t.Fatalf("full AI cycle consumes builder savings while ordinary cost is unaffordable: mode=%s cost=%d tick=%d bank=%d->%d spent=%d->%d", mode, cost, e.Tick(), bank, p.Credits, spent, p.Spent)
		}
		if len(producer.Jobs) != 0 || e.Hash() != twin.Hash() {
			t.Fatal("saving created an unpaid/invalid rig or restore continuation differed", producer.Jobs)
		}
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("full AI saving replay from actual loss/refund checkpoint differs", err)
	}
	aiQualityEconomySavingsDump(t, e, "held")
	// A normal sale, not a grant, makes the saved bank sufficient. It is an
	// explicit user input to both twins; AI-only replay below starts after sale.
	outpostRule, _ := e.buildingRule(outpost.Type)
	saleRefund := min64(outpost.Paid, outpostRule.Cost) * outpost.HP / (2 * outpost.MaxHP)
	for _, engine := range []*Engine{e, twin} {
		if err := engine.Submit(1, engine.player(1).LastSequence+1, []Order{{Kind: "sell", Entities: []ID{outpost.ID}}}); err != nil {
			t.Fatal(err)
		}
	}
	for range 180 {
		aiQualityEconomyRecoveryAdvance(t, e)
		aiQualityEconomyRecoveryAdvance(t, twin)
		if e.Hash() != twin.Hash() || p.Spent != spent || p.Income != income {
			t.Fatal("ordinary sale or saved continuation changed real spending")
		}
		if e.entity(outpost.ID) == nil {
			break
		}
		if p.Credits != bank || len(producer.Jobs) != 0 {
			t.Fatal("planner spent the sale refund before ordinary channel completion")
		}
	}
	if e.entity(outpost.ID) != nil || p.Credits != bank+saleRefund || p.Credits < cost {
		t.Fatal("ordinary full-health outpost sale must actually fund the builder", bank, saleRefund, p.Credits)
	}
	aiQualityEconomySavingsDump(t, e, "actual-sale-refund")
	paidReplay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	for range 85 {
		aiQualityEconomyRecoveryAdvance(t, e)
		aiQualityEconomyRecoveryAdvance(t, twin)
		if len(producer.Jobs) > 0 && producer.Jobs[0].Started {
			break
		}
	}
	// Saving ends once the bank is sufficient. Other producers may then do
	// ordinary paid work; require the builder's exact payment and full ledger.
	postFundingSpend := p.Spent - spent
	if len(producer.Jobs) != 1 || !producer.Jobs[0].Started || producer.Jobs[0].Type != order.Type || producer.Jobs[0].Paid != cost || producer.Jobs[0].Emergency != job.Emergency || producer.Jobs[0].Supply != 0 || postFundingSpend < cost || p.Credits != bank+saleRefund-postFundingSpend || p.Income != income || e.Hash() != twin.Hash() {
		t.Fatal("saved money did not begin exactly one ordinary paid builder job", producer.Jobs, bank, saleRefund, cost, p.Credits, postFundingSpend)
	}
	trains := 0
	for _, batch := range e.state.Log {
		if batch.Player == 1 && batch.Tick > start {
			for _, order := range batch.Orders {
				if order.Kind == "train" && order.Type == faction+".rig" {
					trains++
				}
			}
		}
	}
	if trains != 1 {
		t.Fatal("normal savings recovery duplicated builder orders", trains)
	}
	if err := paidReplay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	paidPlayed, err := paidReplay.Seek(e.catalog, e.Tick())
	if err != nil || paidPlayed.Hash() != e.Hash() {
		t.Fatal("full AI paid continuation replay from actual sale checkpoint differs", err)
	}
	aiQualityEconomySavingsDump(t, e, "ordinary-paid-rig")
	t.Logf("ordinary saved builder mode=%s held=%d cost=%d sale=%d otherSpend=%d bank=%d paidTick=%d emergency=%v", mode, bank, cost, saleRefund, postFundingSpend-cost, p.Credits, e.Tick(), job.Emergency)
}

func TestAIQualityEconomySavingsIdleFactory(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) { aiQualityEconomySavingsHoldAndPay(t, faction, "idle") })
	}
}

func TestAIQualityEconomySavingsBlockedRefund(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) { aiQualityEconomySavingsHoldAndPay(t, faction, "blocked") })
	}
}

func TestAIQualityEconomySavingsHQ(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) { aiQualityEconomySavingsHoldAndPay(t, faction, "hq") })
	}
}

func TestAIQualityEconomySavingsWorkingFront(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			e, factory, _ := aiQualityEconomySavingsFixture(t, faction, "working")
			p := e.player(1)
			start, head, bank, spent := e.Tick(), factory.Jobs[0], p.Credits, p.Spent
			if !e.jobReady(p, factory, &head) || !head.Started {
				t.Fatal("control front must be a normally paid progressing job")
			}
			for range 90 {
				aiQualityEconomyRecoveryAdvance(t, e)
			}
			if len(factory.Jobs) != 1 || factory.Jobs[0].Type != head.Type || factory.Jobs[0].Work <= head.Work || factory.Jobs[0].Paid != head.Paid || p.Spent <= spent || p.Credits != bank-(p.Spent-spent) || p.Income != 0 {
				t.Fatal("progressing investment must survive and not invent an emergency saving goal", head, factory.Jobs, bank, p.Credits, spent, p.Spent)
			}
			for _, batch := range e.state.Log {
				if batch.Player == 1 && batch.Tick > start {
					for _, order := range batch.Orders {
						if order.Kind == "cancel" || order.Kind == "train" && order.Type == faction+".rig" {
							t.Fatal("progressing front was replaced by emergency recovery", order)
						}
					}
				}
			}
			aiQualityEconomySavingsDump(t, e, "working-preserved")
			t.Logf("normal working control work=%d->%d ordinary other spending=%d bank=%d", head.Work, factory.Jobs[0].Work, p.Spent-spent, p.Credits)
		})
	}
}
