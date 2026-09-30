package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// These checks use ordinary Advance/Submit. The short fixtures declare their
// existing capital/assets before the first tick; the Core-06 opening below is
// unmodified New state with no external orders or manufactured gameplay state.
func aiQualityEconomyFirstVehicleWrite(t *testing.T, label string, data []byte) {
	t.Helper()
	root := os.Getenv("AI_QUALITY_ECONOMY_FIRST_VEHICLE_EVIDENCE")
	if root == "" {
		return
	}
	dir := filepath.Join(root, strings.ReplaceAll(t.Name(), "/", "_"))
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(filepath.Join(dir, label), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal("evidence must not overwrite an earlier run", err)
	}
	if _, err = file.Write(data); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
}

func aiQualityEconomyFirstVehicleJSON(t *testing.T, label string, value any) {
	t.Helper()
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleWrite(t, label, append(data, '\n'))
}

func aiQualityEconomyFirstVehicleDump(t *testing.T, e *Engine, label string) {
	t.Helper()
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleWrite(t, label+".save.json", saved)
	aiQualityEconomyFirstVehicleJSON(t, label+".trace.json", struct {
		Hash     string      `json:"state_hash"`
		Commands []Scheduled `json:"commands"`
		Pending  []Scheduled `json:"pending"`
	}{e.Hash(), e.state.Log, e.state.Pending})
}

func aiQualityEconomyFirstVehicleAdvance(t *testing.T, e *Engine) {
	t.Helper()
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Errorf("ordinary first-vehicle course rejected an order at %d: %+v", e.Tick(), result)
		}
	}
	for _, p := range e.state.Players {
		if p.Credits < 0 || p.Supply+p.ReservedSupply > 100 {
			t.Fatal("ordinary resource limits violated", e.Tick(), p.ID, p.Credits, p.Supply, p.ReservedSupply)
		}
	}
	for _, batch := range e.state.Pending {
		used := map[ID]bool{}
		if len(batch.Orders) > 32 {
			t.Fatal("ordinary command batch exceeded 32 orders", batch)
		}
		for _, order := range batch.Orders {
			for _, id := range order.Entities {
				actor := e.entity(id)
				if actor == nil || actor.Owner != batch.Player || used[id] {
					t.Fatal("unowned or repeated submitted actor", batch, id)
				}
				used[id] = true
			}
		}
	}
}

type aiQualityEconomyFirstVehicleFixture struct {
	E        *Engine
	Factory  *Entity
	Barracks *Entity
	Supply   *Entity
	Power    *Entity
}

func aiQualityEconomyFirstVehicleBusySupply(f *aiQualityEconomyFirstVehicleFixture) Order {
	unit, _ := f.E.catalog.Unit(f.E.player(1).Faction + ".hauler")
	// Declared capital funds this real pre-existing collector job; its normal
	// payment occurs in the setup tick, before the tested remaining bank.
	f.E.player(1).Credits += unit.Cost
	return Order{Kind: "train", Entities: []ID{f.Supply.ID}, Type: unit.ID}
}

func aiQualityEconomyFirstVehicleFixtureNew(t *testing.T, faction string, bank int64, configure func(*aiQualityEconomyFirstVehicleFixture) []Order) *aiQualityEconomyFirstVehicleFixture {
	t.Helper()
	m := fixtureMap()
	m.Fields, m.Stations = nil, nil
	e, err := New(content.MustBase(), Config{Map: m, Seed: 28001, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Faction: faction, Team: 1, AI: "normal"}, {ID: 2, Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	f := &aiQualityEconomyFirstVehicleFixture{E: e}
	f.Power = e.spawn("power", 1, Vec{X: 4000, Y: 20000}, true, 500000)
	f.Supply = e.spawn("supply", 1, Vec{X: 10000, Y: 20000}, true, 1800000)
	f.Supply.IncludedHauler = true
	f.Barracks = e.spawn("barracks", 1, Vec{X: 16000, Y: 20000}, true, 600000)
	f.Factory = e.spawn("factory", 1, Vec{X: 22000, Y: 20000}, true, 1800000)
	e.spawn(faction+".recon", 1, Vec{X: 18000, Y: 14000}, true, 350000)
	engineer, _ := e.catalog.Unit(faction + ".engineer")
	e.player(1).Credits = bank + engineer.Cost
	e.player(1).AIStage = 1 // the unchanged factory cadence prefers a tank.
	orders := []Order{{Kind: "guard", Entities: []ID{2}, Target: 1, Position: e.entity(1).Position}, {Kind: "train", Entities: []ID{f.Barracks.ID}, Type: engineer.ID}}
	if configure != nil {
		orders = append(orders, configure(f)...)
	}
	// A public Guard preserves these declared observers without an optional
	// idle recon beacon or a new scout waypoint consuming the fixture's bank.
	for _, v := range e.state.Entities {
		if v.Owner == 1 && e.role(v) == "recon" {
			orders = append(orders, Order{Kind: "guard", Entities: []ID{v.ID}, Position: v.Position})
		}
	}
	e.recalculate()
	e.updateFog()
	aiQualityEconomyFirstVehicleDump(t, e, "declared-checkpoint")
	if err = e.Submit(1, e.player(1).LastSequence+1, orders); err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleAdvance(t, e)
	if len(f.Barracks.Jobs) != 1 || !f.Barracks.Jobs[0].Started || f.Barracks.Jobs[0].Paid != engineer.Cost || len(e.entity(2).Orders) != 1 || e.entity(2).Orders[0].Kind != "guard" {
		t.Fatal("ordinary paid engineer/working builder setup did not execute", f.Barracks.Jobs, e.entity(2).Orders)
	}
	if e.player(1).Credits != bank {
		t.Fatal("declared capital minus normal setup costs must leave the requested bank", bank, e.player(1).Credits, e.player(1).Spent)
	}
	aiQualityEconomyFirstVehicleDump(t, e, "paid-setup")
	return f
}

func aiQualityEconomyFirstVehicleRun(t *testing.T, f *aiQualityEconomyFirstVehicleFixture, want string, bank int64) {
	t.Helper()
	e := f.E
	checkpoint, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, checkpoint)
	if err != nil {
		t.Fatal("declared checkpoint restore failed", err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	spent := e.player(1).Spent
	for e.Tick() < 41 {
		aiQualityEconomyFirstVehicleAdvance(t, e)
		twin.Advance()
	}
	aiQualityEconomyFirstVehicleDump(t, e, "first-cycle")
	if e.Hash() != twin.Hash() {
		t.Error("save/restore continuation differs at the first ordinary production cycle")
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	encoded, err := replay.Encode()
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleWrite(t, "checkpoint-replay.fcr", encoded)
	played, err := replay.Seek(e.catalog, e.Tick())
	playedHash := ""
	if played != nil {
		playedHash = played.Hash()
	}
	if err != nil || playedHash != e.Hash() {
		t.Error("ordinary AI checkpoint replay differs", err)
	}
	cost := int64(0)
	if want != "" {
		u, _ := e.catalog.Unit(want)
		cost = u.Cost
		if len(f.Factory.Jobs) != 1 || f.Factory.Jobs[0].Type != want || !f.Factory.Jobs[0].Started || f.Factory.Jobs[0].Paid != cost {
			t.Errorf("cash-short first-vehicle choice did not start the required ordinary paid job: want %s/%d jobs=%+v", want, cost, f.Factory.Jobs)
		}
	} else if len(f.Factory.Jobs) != 0 {
		t.Errorf("protected constraint/commitment admitted an unwanted factory job: %+v", f.Factory.Jobs)
	}
	if e.player(1).Credits != bank-cost || e.player(1).Spent != spent+cost {
		t.Errorf("first-cycle payment must equal the ordinary accepted job price: bank=%d want=%d spent_delta=%d want=%d", e.player(1).Credits, bank-cost, e.player(1).Spent-spent, cost)
	}
	aiQualityEconomyFirstVehicleJSON(t, "receipt.json", map[string]any{"tick": e.Tick(), "want": want, "bank_before": bank, "bank_after": e.player(1).Credits, "spent_before": spent, "spent_after": e.player(1).Spent, "factory_jobs": f.Factory.Jobs, "state_hash": e.Hash(), "restore_hash": twin.Hash(), "replay_hash": playedHash, "replay_scope": "AI continuation from paid external setup checkpoint; manual setup is not regenerated"})
}

func TestAIQualityEconomyFirstVehicleCashGap(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			f := aiQualityEconomyFirstVehicleFixtureNew(t, faction, 850000, nil)
			tank, _ := f.E.catalog.Unit(faction + ".tank")
			car, _ := f.E.catalog.Unit(faction + ".car")
			if tank.Cost+300000 <= 850000 || car.Cost+300000 > 850000 {
				t.Fatal("cash gap must retain the unchanged ordinary 300k cushion", tank.Cost, car.Cost)
			}
			aiQualityEconomyFirstVehicleRun(t, f, car.ID, 850000)
		})
	}
}

func TestAIQualityEconomyFirstVehicleMarginThreshold(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, equal := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s_equal_%t", faction, equal), func(t *testing.T) {
				car, _ := content.MustBase().Unit(faction + ".car")
				bank, want := car.Cost+300000-1, ""
				if equal {
					bank, want = bank+1, car.ID
				}
				f := aiQualityEconomyFirstVehicleFixtureNew(t, faction, bank, nil)
				aiQualityEconomyFirstVehicleRun(t, f, want, bank)
			})
		}
	}
}

func TestAIQualityEconomyFirstVehicleReadinessAndWorkingJobs(t *testing.T) {
	for _, mode := range []string{"preferred_affordable", "owned_armed", "working_armed", "queued_armed", "queued_armed_affordable_alternative", "working_builder", "unarmed_repair", "tactical_launcher"} {
		t.Run(mode, func(t *testing.T) {
			bank, want := int64(850000), ""
			if mode == "preferred_affordable" {
				bank, want = 1600000, "US.tank"
			}
			if mode == "queued_armed_affordable_alternative" {
				bank = 1300000
			}
			if mode == "unarmed_repair" || mode == "tactical_launcher" || mode == "working_builder" {
				want = "US.car"
			}
			var working *Entity
			f := aiQualityEconomyFirstVehicleFixtureNew(t, "US", bank, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
				e := f.E
				switch mode {
				case "preferred_affordable":
					return []Order{aiQualityEconomyFirstVehicleBusySupply(f)}
				case "owned_armed":
					e.spawn("US.car", 1, Vec{X: 14000, Y: 26000}, true, 500000)
				case "working_builder":
					e.player(1).Credits += 800000
					return []Order{{Kind: "train", Entities: []ID{1}, Type: "US.rig"}}
				case "unarmed_repair":
					e.spawn("US.repair", 1, Vec{X: 14000, Y: 26000}, true, 600000)
				case "tactical_launcher":
					e.spawn("radar", 1, Vec{X: 28000, Y: 20000}, true, 1400000)
					e.spawn("tech", 1, Vec{X: 34000, Y: 20000}, true, 2200000)
					e.spawn("power", 1, Vec{X: 40000, Y: 20000}, true, 500000)
					launcher := e.spawn("US.launcher", 1, Vec{X: 14000, Y: 26000}, true, 2000000)
					launcher.Deployed = true
				case "working_armed", "queued_armed", "queued_armed_affordable_alternative":
					working = e.spawn("factory", 1, Vec{X: 28000, Y: 26000}, true, 1800000)
					if mode == "working_armed" {
						e.player(1).Credits += 500000
						return []Order{{Kind: "train", Entities: []ID{working.ID}, Type: "US.car"}}
					}
					e.player(1).Credits += 600000
					orders := []Order{{Kind: "train", Entities: []ID{working.ID}, Type: "US.repair"}, {Kind: "train", Entities: []ID{working.ID}, Type: "US.car"}}
					if mode == "queued_armed_affordable_alternative" {
						orders = append(orders, aiQualityEconomyFirstVehicleBusySupply(f))
					}
					return orders
				}
				return nil
			})
			beforeWork := uint32(0)
			if working != nil {
				beforeWork = working.Jobs[0].Work
			}
			if mode == "queued_armed_affordable_alternative" && f.E.aiPlanningBudget(f.E.player(1), aiOwnView(f.E, 1)) != 800000 {
				t.Fatal("queued readiness control must still afford a distinct car plus its 300k margin")
			}
			aiQualityEconomyFirstVehicleRun(t, f, want, bank)
			if working != nil && (len(working.Jobs) == 0 || working.Jobs[0].Work <= beforeWork || !working.Jobs[0].Started) {
				t.Fatal("working owned queue was disturbed instead of continuing normally", working.Jobs)
			}
			if (mode == "queued_armed" || mode == "queued_armed_affordable_alternative") && (len(working.Jobs) != 2 || working.Jobs[1].Type != "US.car" || working.Jobs[1].Started || working.Jobs[1].Paid != 0) {
				t.Fatal("queued armed commitment must remain unpaid behind its progressing front job", working.Jobs)
			}
		})
	}
}

func TestAIQualityEconomyFirstVehicleEarlierPlannedVehicle(t *testing.T) {
	var second *Entity
	f := aiQualityEconomyFirstVehicleFixtureNew(t, "US", 1400000, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
		second = f.E.spawn("factory", 1, Vec{X: 28000, Y: 26000}, true, 1800000)
		return []Order{aiQualityEconomyFirstVehicleBusySupply(f)}
	})
	// The first car leaves900k, enough for a second500k car plus300k margin.
	// Only its earlier planned armed commitment may suppress that duplicate.
	aiQualityEconomyFirstVehicleRun(t, f, "US.car", 1400000)
	if len(second.Jobs) != 0 {
		t.Fatal("earlier planned first vehicle must preserve the later factory cadence", second.Jobs)
	}
}

func TestAIQualityEconomyFirstVehicleOwnedConstraints(t *testing.T) {
	for _, mode := range []string{"margin", "disabled_factory", "lost_prerequisite", "full_supply", "last_two_supply", "collector_savings"} {
		t.Run(mode, func(t *testing.T) {
			bank := int64(850000)
			if mode == "margin" {
				bank = 799000
			}
			f := aiQualityEconomyFirstVehicleFixtureNew(t, "US", bank, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
				e := f.E
				if mode == "full_supply" || mode == "last_two_supply" {
					n := int32(49)
					if mode == "last_two_supply" {
						n = 48
					}
					for i := int32(0); i < n; i++ {
						e.spawn("US.rifle", 1, Vec{X: 4000 + i%10*1800, Y: 28000 + i/10*1800}, true, 200000)
					}
				}
				if mode == "collector_savings" {
					e.state.Map.Fields = []content.Field{{ID: 1, Position: Vec{X: 10000, Y: 23000}, Credits: 36000000}}
					e.state.Fields = []*ResourceField{{ID: 1, Position: Vec{X: 10000, Y: 23000}, Remaining: 36000000}}
				}
				return nil
			})
			if mode == "disabled_factory" || mode == "lost_prerequisite" {
				target := f.Factory.ID
				if mode == "lost_prerequisite" {
					target = f.Supply.ID
				}
				if err := f.E.Submit(1, f.E.player(1).LastSequence+1, []Order{{Kind: "power", Entities: []ID{target}, Index: 0}}); err != nil {
					t.Fatal(err)
				}
				aiQualityEconomyFirstVehicleAdvance(t, f.E)
			}
			want := ""
			if mode == "last_two_supply" {
				want = "US.car"
				if f.E.player(1).Supply+f.E.player(1).ReservedSupply != 98 {
					t.Fatal("legal last-two-slot control must begin at committed Supply98")
				}
			}
			aiQualityEconomyFirstVehicleRun(t, f, want, bank)
			if mode == "collector_savings" {
				p := f.E.player(1)
				if len(p.AIFields) == 0 || p.AIFields[0].Remaining == 0 || f.E.aiPlanningBudget(p, aiOwnView(f.E, 1)) != bank {
					t.Fatal("public supplies and actual uncommitted bank must support the distinct collector reservation", p.AIFields, p.Credits)
				}
			}
		})
	}
}

func TestAIQualityEconomyFirstVehicleMobileInterceptionCounter(t *testing.T) {
	f := aiQualityEconomyFirstVehicleFixtureNew(t, "SA", 850000, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
		e := f.E
		e.spawn("radar", 1, Vec{X: 28000, Y: 20000}, true, 1400000)
		for i := int32(0); i < 17; i++ {
			e.spawn("SA.rifle", 1, Vec{X: 4000 + i%9*1800, Y: 28000 + i/9*1800}, true, 250000)
		}
		return nil
	})
	if f.E.player(1).Tier != 2 || f.E.player(1).Supply < 35 {
		t.Fatal("retained mobile interception branch needs ordinary Tier2 and existing Supply35")
	}
	aiQualityEconomyFirstVehicleRun(t, f, "", 850000)
}

func TestAIQualityEconomyFirstVehicleObservedAirCounter(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		for _, mode := range []string{"saving", "affordable"} {
			t.Run(faction+"_"+mode, func(t *testing.T) {
				catalog := content.MustBase()
				aa, _ := catalog.Unit(faction + ".aa")
				bank, want := int64(850000), ""
				if mode == "affordable" {
					bank, want = aa.Cost+300000, aa.ID
				}
				f := aiQualityEconomyFirstVehicleFixtureNew(t, faction, bank, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
					e := f.E
					e.spawn("power", 2, Vec{X: 34000, Y: 30000}, true, 500000)
					e.spawn("radar", 2, Vec{X: 40000, Y: 30000}, true, 1400000)
					home := e.spawn("IR.drone_hub", 2, Vec{X: 28000, Y: 24000}, true, 1500000)
					air, _ := e.catalog.Unit("IR.fighter")
					fighter := e.spawn(air.ID, 2, Vec{X: 26000, Y: 24000}, true, air.Cost)
					fighter.Home, fighter.Landed = home.ID, true
					e.spawn(faction+".recon", 1, Vec{X: 24000, Y: 26000}, true, 350000)
					if mode == "affordable" {
						return []Order{aiQualityEconomyFirstVehicleBusySupply(f)}
					}
					return nil
				})
				view, _ := f.E.PlayerView(1)
				visible := false
				for _, observed := range view.Entities {
					visible = visible || observed.Owner == 2 && observed.Type == "IR.fighter"
				}
				if !visible {
					t.Fatal("urgent counter fixture must expose an ordinary armed air contact")
				}
				aiQualityEconomyFirstVehicleRun(t, f, want, bank)
				seen := false
				for _, observation := range f.E.player(1).AIKnowledge {
					seen = seen || observation.Owner == 2 && observation.Type == "IR.fighter"
				}
				if !seen {
					t.Fatal("observed urgent air must remain ordinary public AI knowledge")
				}
			})
		}
	}
}

func TestAIQualityEconomyFirstVehicleHiddenTwin(t *testing.T) {
	f := aiQualityEconomyFirstVehicleFixtureNew(t, "US", 850000, nil)
	e := f.E
	saved, _ := e.Save()
	twin, err := Restore(e.catalog, saved)
	if err != nil {
		t.Fatal(err)
	}
	// Only undisclosed opponent capital and assets differ in the twin. The
	// owned state/starting perspective and all public rules remain identical.
	twin.player(2).Credits = 123456
	for _, v := range twin.state.Entities {
		if v.Owner == 2 {
			v.Position.X -= 2000
		}
	}
	twin.spawn("IR.tank", 2, Vec{X: 50000, Y: 50000}, true, 1150000)
	twin.recalculate()
	twin.updateFog()
	left, _ := e.PlayerView(1)
	right, _ := twin.PlayerView(1)
	if !reflect.DeepEqual(left, right) {
		t.Fatal("hidden twin changed the permitted player perspective")
	}
	aiQualityEconomyFirstVehicleDump(t, twin, "hidden-twin-checkpoint")
	for e.Tick() < 41 {
		aiQualityEconomyFirstVehicleAdvance(t, e)
		aiQualityEconomyFirstVehicleAdvance(t, twin)
	}
	aiQualityEconomyFirstVehicleDump(t, e, "first-cycle")
	aiQualityEconomyFirstVehicleDump(t, twin, "hidden-twin-first-cycle")
	if !reflect.DeepEqual(e.entity(f.Factory.ID).Jobs, twin.entity(f.Factory.ID).Jobs) || e.player(1).Credits != twin.player(1).Credits || !reflect.DeepEqual(e.state.Log, twin.state.Log) || !reflect.DeepEqual(e.state.Pending, twin.state.Pending) {
		t.Fatal("undisclosed enemy capital/assets changed first-vehicle selection or ordinary inputs")
	}
	if len(f.Factory.Jobs) != 1 || f.Factory.Jobs[0].Type != "US.car" || f.Factory.Jobs[0].Paid != 500000 || e.player(1).Credits != 350000 {
		t.Fatal("publicly identical cash gap must pay one ordinary car in both twins", f.Factory.Jobs, e.player(1).Credits)
	}
}

func TestAIQualityEconomyFirstVehiclePendingVolleyReservation(t *testing.T) {
	var launcher *Entity
	point := Vec{X: 40000, Y: 30000}
	f := aiQualityEconomyFirstVehicleFixtureNew(t, "IR", 1200000, func(f *aiQualityEconomyFirstVehicleFixture) []Order {
		e := f.E
		e.spawn("radar", 1, Vec{X: 28000, Y: 20000}, true, 1400000)
		e.spawn("tech", 1, Vec{X: 34000, Y: 20000}, true, 2200000)
		e.spawn("power", 1, Vec{X: 4000, Y: 26000}, true, 500000)
		launcher = e.spawn("IR.launcher", 1, Vec{X: 20000, Y: 30000}, true, 2000000)
		launcher.Deployed, launcher.Charges = true, 2
		e.spawn("IR.engineer", 1, Vec{X: 39000, Y: 29000}, true, 400000)
		return nil
	})
	e := f.E
	for e.Tick() < 20 {
		aiQualityEconomyFirstVehicleAdvance(t, e)
	}
	if err := e.Submit(1, e.player(1).LastSequence+1, []Order{{Kind: "ability", Entities: []ID{launcher.ID}, Type: "volley", Points: []Vec{point, point}}}); err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleAdvance(t, e)
	if e.player(1).Credits != 900000 || len(e.state.Operations) != 1 || e.state.Operations[0].Kind != "second_volley" || e.state.Operations[0].At != 51 {
		t.Fatal("ordinary first volley must leave a real 300k pending payment", e.player(1).Credits, e.state.Operations)
	}
	if budget := e.aiPlanningBudget(e.player(1), aiOwnView(e, 1)); budget != 600000 {
		t.Fatal("pending second shot must reduce the planning bank once", budget)
	}
	aiQualityEconomyFirstVehicleDump(t, e, "accepted-first-shot")
	aiQualityEconomyFirstVehicleRun(t, f, "", 900000)
	for e.Tick() < 51 {
		aiQualityEconomyFirstVehicleAdvance(t, e)
	}
	aiQualityEconomyFirstVehicleDump(t, e, "paid-second-shot")
	if e.player(1).Credits != 600000 || launcher.Charges != 0 || len(e.state.Operations) != 0 {
		t.Fatal("first vehicle must preserve actual delayed normal payment", e.player(1).Credits, launcher.Charges, e.state.Operations)
	}
}

func TestAIQualityEconomyFirstVehicleOrdinaryRootUnion(t *testing.T) {
	battlefield, mapBytes := aiCompetenceMap(t, "copper-junction")
	cfg := Config{Map: battlefield, Seed: 28001, Ruleset: "standard-v2", Players: []PlayerConfig{{ID: 1, Name: "US normal bot 1", Faction: "US", Team: 1, AI: "normal"}, {ID: 2, Name: "IR normal bot 2", Faction: "IR", Team: 2, AI: "normal"}}}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	var initialHash string
	switch Version {
	case "0.3.5":
		initialHash = "d7fc23e4ee10525528e5939c6235f913b607b2ead798e8787694facc8baf2cb3"
	case "0.3.6":
		initialHash = "45b363f6bc09adc08495f11f43a91ce95de65734129c40de98d48e153a626e31"
	case "0.3.7":
		initialHash = "51c49b41ea21f8c644bafdad5cd82792f6f6bc9b0e0ae34e1cff1bac9dd4eb42"
	default:
		t.Fatal("ordinary reproduction has no bound initial New state oracle", Version)
	}
	if e.Hash() != initialHash || e.Tick() != 0 || e.state.Countdown != 100 {
		t.Fatal("ordinary reproduction must start at exact saved root union New state", e.Hash(), e.Tick(), e.state.Countdown)
	}
	aiQualityEconomyFirstVehicleJSON(t, "config.json", cfg)
	aiQualityEconomyFirstVehicleWrite(t, "authored-map.json", mapBytes)
	aiQualityEconomyFirstVehicleDump(t, e, "initial")
	initial, _ := e.Save()
	restored, err := Restore(e.catalog, initial)
	if err != nil || restored.Hash() != e.Hash() {
		t.Fatal("ordinary initial save did not restore exactly", err)
	}
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	type milestone struct {
		FactoryComplete Tick   `json:"factory_complete"`
		FirstVehicle    Tick   `json:"first_paid_vehicle"`
		FirstType       string `json:"first_paid_type"`
		FirstPaid       int64  `json:"first_paid_cost"`
	}
	first := map[PlayerID]*milestone{1: {}, 2: {}}
	trace := []any{}
	var checkpoint []byte
	for e.Tick() < 6100 && !e.Outcome().Finished {
		beforeCredits := map[PlayerID]int64{1: e.player(1).Credits, 2: e.player(2).Credits}
		aiQualityEconomyFirstVehicleAdvance(t, e)
		for _, v := range e.state.Entities {
			if !v.Building || e.role(v) != "factory" || v.Owner == 0 {
				continue
			}
			m := first[v.Owner]
			if m == nil {
				continue
			}
			if v.Complete && m.FactoryComplete == 0 {
				m.FactoryComplete = e.Tick()
			}
			for _, job := range v.Jobs {
				u, ok := e.catalog.Unit(job.Type)
				if !job.Research && ok && job.Started && job.Paid == u.Cost && u.Producer == "factory" && u.Weapon != "" && u.Role != "launcher" && m.FirstVehicle == 0 {
					m.FirstVehicle, m.FirstType, m.FirstPaid = e.Tick(), job.Type, job.Paid
				}
			}
		}
		if len(e.state.Results) > 0 || beforeCredits[1] != e.player(1).Credits || beforeCredits[2] != e.player(2).Credits {
			trace = append(trace, map[string]any{"tick": e.Tick(), "results": append([]OrderResult(nil), e.state.Results...), "us_bank": e.player(1).Credits, "ir_bank": e.player(2).Credits, "us_spent": e.player(1).Spent, "ir_spent": e.player(2).Spent})
		}
		if e.Tick() == 3861 || e.Tick() == 3862 {
			aiQualityEconomyFirstVehicleDump(t, e, fmt.Sprintf("tick-%06d", e.Tick()))
		}
		if e.Tick() == 3600 {
			checkpoint, err = e.Save()
			if err != nil {
				t.Fatal(err)
			}
		}
		if e.Tick()%200 == 0 {
			if err = replay.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err = replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	encoded, err := replay.Encode()
	if err != nil {
		t.Fatal(err)
	}
	aiQualityEconomyFirstVehicleWrite(t, "full-from-New.fcr", encoded)
	aiQualityEconomyFirstVehicleWrite(t, "tick-003600.save.json", checkpoint)
	aiQualityEconomyFirstVehicleDump(t, e, "final")
	aiQualityEconomyFirstVehicleJSON(t, "execution-trace.json", trace)
	played, replayErr := replay.Seek(e.catalog, e.Tick())
	checkpointTwin, checkpointErr := Restore(e.catalog, checkpoint)
	if checkpointErr == nil {
		for checkpointTwin.Tick() < e.Tick() && !checkpointTwin.Outcome().Finished {
			checkpointTwin.Advance()
		}
	}
	fullHash, checkpointHash := "", ""
	if played != nil {
		fullHash = played.Hash()
	}
	if checkpointTwin != nil {
		checkpointHash = checkpointTwin.Hash()
	}
	aiQualityEconomyFirstVehicleJSON(t, "receipt.json", map[string]any{"current_root_union_reproduction": true, "source_basis": "Current root union; gameplay from Core-14 manifest c572d73fc778c688963394e0817da77f09b0a7553b7c086a9be4e75e3a7277f0; fixture rebound to actual saved initial hauler schema", "initial_save_reference_sha256": "c7422a1daaf6bf5dbcc0f31855178fcdbff3a21e20d924036b0a1a24d029338f", "tick": e.Tick(), "milestones": first, "final_hash": e.Hash(), "full_from_New_replay_hash": fullHash, "checkpoint_3600_continuation_hash": checkpointHash, "replay_error": fmt.Sprint(replayErr), "checkpoint_error": fmt.Sprint(checkpointErr), "claim": "first affordable generic factory choice only; no superiority/tempo/balance claim"})
	t.Logf("ordinary root union actual milestones: US factory=%d first paid %s=%d cost=%d; IR factory=%d first paid %s=%d cost=%d", first[1].FactoryComplete, first[1].FirstType, first[1].FirstVehicle, first[1].FirstPaid, first[2].FactoryComplete, first[2].FirstType, first[2].FirstVehicle, first[2].FirstPaid)
	if e.Tick() != 6100 || replayErr != nil || checkpointErr != nil || fullHash != e.Hash() || checkpointHash != e.Hash() {
		t.Error("ordinary New opening must reach the recorded horizon with exact full replay and checkpoint continuation", e.Tick(), replayErr, checkpointErr, fullHash, checkpointHash, e.Hash())
	}
	if first[1].FactoryComplete != 2676 || first[2].FactoryComplete != 2702 {
		t.Error("the retained paid construction prefix changed before either first factory", first)
	}
	// Tick 3862 is the actual recorded legal cheap-car witness after US AT
	// spending, not a new opening target or a claim about the entire idle period.
	if first[1].FirstVehicle == 0 || first[1].FirstVehicle > 3862 {
		t.Errorf("recorded affordable first-vehicle opportunity was missed: US first paid %s at %d; recorded legal witness tick 3862", first[1].FirstType, first[1].FirstVehicle)
	}
	if first[2].FirstVehicle == 0 {
		t.Error("IR normal factory production disappeared from the ordinary opening")
	}
}
