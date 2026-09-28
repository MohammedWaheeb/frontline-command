package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func aiUnitOrder(orders []Order, id ID) (Order, bool) {
	for _, order := range orders {
		for _, selected := range order.Entities {
			if selected == id {
				return order, true
			}
		}
	}
	return Order{}, false
}

func TestAIHealedMobileSupportGuardRejoinsOrdinaryCombat(t *testing.T) {
	for _, pair := range [][2]string{{"US.medic", "US.rifle"}, {"US.repair", "US.tank"}} {
		t.Run(pair[0], func(t *testing.T) {
			e := fixture(t)
			p := e.player(1)
			p.AI = "normal"
			source := e.spawn(pair[0], 1, Vec{X: 18000, Y: 18000}, true, 0)
			unit := e.spawn(pair[1], 1, Vec{X: 20000, Y: 18000}, true, 0)
			e.assign(unit, Order{Kind: "guard", Target: source.ID, Position: source.Position})
			e.assign(source, Order{Kind: "guard", Target: unit.ID, Position: unit.Position})
			e.recalculate()
			e.updateFog()
			goal := Vec{X: 40000, Y: 25000}
			order, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), goal), unit.ID)
			if !ok || order.Kind != "attack_move" || order.Position != goal {
				t.Fatal("healed follower stayed in reciprocal guard", order, ok)
			}
			p.AI = ""
			runQueuedTaskWithReplay(t, e, []Order{order})
			if distance(unit.Position, goal) > 1000 {
				t.Fatal("ordinary healed-unit movement did not leave recovery", unit.Position)
			}
		})
	}
}

func TestAIRecoveryRetainsWorkingGuardsAndReleasesOrphans(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	medic := e.spawn("US.medic", 1, Vec{X: 18000, Y: 18000}, true, 0)
	rifle := e.spawn("US.rifle", 1, Vec{X: 20000, Y: 18000}, true, 0)
	e.assign(rifle, Order{Kind: "guard", Target: medic.ID, Position: medic.Position})
	rifle.HP = rifle.MaxHP / 2
	e.updateFog()
	goal := Vec{X: 40000, Y: 25000}
	if o, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), goal), rifle.ID); ok {
		t.Fatal("unfinished healing interrupted", o)
	}
	rifle.HP = rifle.MaxHP
	e.assign(medic, Order{Kind: "guard", Target: rifle.ID, Position: rifle.Position})
	if o, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), goal), medic.ID); ok {
		t.Fatal("working support leader-follow interrupted", o)
	}
	medic.HP = 0
	e.recalculate()
	e.updateFog()
	if o, ok := aiUnitOrder(e.aiRecoveryOrders(p, aiOwnView(e, 1), goal), rifle.ID); !ok || o.Kind != "attack_move" {
		t.Fatal("dead recovery destination retained", o, ok)
	}
}

func aiStalledRallyFixture(t *testing.T) (*Engine, *Entity, []EntityView, Vec) {
	t.Helper()
	e := fixture(t)
	barracks := e.spawn("barracks", 1, Vec{X: 18000, Y: 18000}, true, 0)
	unit := e.spawn("US.rifle", 1, Vec{X: 22000, Y: 22000}, true, 0)
	e.assign(unit, Order{Kind: "move", Position: barracks.Rally})
	e.state.Tick = 400
	unit.StationarySince = 100
	unit.Blocked = true
	e.recalculate()
	e.updateFog()
	return e, unit, aiOwnView(e, 1), Vec{X: 40000, Y: 30000}
}
func TestAIConfirmedFailedProducerRallyReceivesOneOrdinaryGoal(t *testing.T) {
	e, unit, own, goal := aiStalledRallyFixture(t)
	o, ok := e.aiStalledRallyOrder(unit, own, goal)
	if !ok || o.Kind != "attack_move" || o.Position != goal {
		t.Fatal("confirmed stalled rally retained", o, ok)
	}
	runQueuedTaskWithReplay(t, e, []Order{o})
	if distance(unit.Position, goal) > 1000 {
		t.Fatal("ordinary resumed rally movement failed", unit.Position)
	}
	if _, ok := e.aiStalledRallyOrder(unit, aiOwnView(e, 1), goal); ok {
		t.Fatal("recovery repeated after its move was replaced")
	}
}
func TestAIStalledRallyPreservesActiveWorkAndRecentOrDamagedMovement(t *testing.T) {
	for _, condition := range []string{"working", "recent", "damaged", "other_destination", "queued", "channel", "deployed", "same_goal"} {
		t.Run(condition, func(t *testing.T) {
			e, unit, own, goal := aiStalledRallyFixture(t)
			switch condition {
			case "working":
				unit.Blocked = false
			case "recent":
				unit.StationarySince = e.Tick() - 20
			case "damaged":
				unit.HP = unit.MaxHP / 2
			case "other_destination":
				unit.Orders[0].Position = Vec{X: 33000, Y: 34000}
			case "queued":
				unit.Orders = append(unit.Orders, Order{Kind: "hold", Queued: true})
			case "channel":
				unit.Channel = "capture"
			case "deployed":
				unit.Deployed = true
			case "same_goal":
				goal = unit.Orders[0].Position
			}
			if o, ok := e.aiStalledRallyOrder(unit, own, goal); ok {
				t.Fatal("recovery stole an unrelated or active task", o)
			}
		})
	}
}
func TestAITaskRecoveryIgnoresUnseenEnemyState(t *testing.T) {
	a, unitA, ownA, goal := aiStalledRallyFixture(t)
	b, unitB, ownB, _ := aiStalledRallyFixture(t)
	for _, e := range []*Engine{a, b} {
		e.player(1).AI = "normal"
	}
	a.spawn("IR.tank", 2, Vec{X: 49000, Y: 49000}, true, 0)
	b.spawn("IR.artillery", 2, Vec{X: 52000, Y: 49000}, true, 0)
	a.updateFog()
	b.updateFog()
	x, xOK := a.aiStalledRallyOrder(unitA, ownA, goal)
	y, yOK := b.aiStalledRallyOrder(unitB, ownB, goal)
	if xOK != yOK || !reflect.DeepEqual(x, y) {
		t.Fatal("rally recovery read hidden enemy state")
	}
	unitA.Orders = []Order{{Kind: "guard", Target: 99999}}
	unitB.Orders = []Order{{Kind: "guard", Target: 99999}}
	xs := a.aiRecoveryOrders(a.player(1), aiOwnView(a, 1), goal)
	ys := b.aiRecoveryOrders(b.player(1), aiOwnView(b, 1), goal)
	if !reflect.DeepEqual(xs, ys) {
		t.Fatal("orphan recovery read hidden enemy state", xs, ys)
	}
}

func TestAIRecordedPortRecoveryProgress(t *testing.T) {
	directory := os.Getenv("FRONTLINE_AUTHORED_AI_RECOVERY")
	if directory == "" {
		t.Skip("opt-in unchanged preterminal Port save fork")
	}
	data, err := os.ReadFile(filepath.Join(directory, "diagnostic-24000.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	e, err := Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	initialHash := e.Hash()
	twin, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	recorder, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	type trapped struct {
		ID       ID       `json:"id"`
		Owner    PlayerID `json:"owner"`
		Position Vec      `json:"position"`
		Order    Order    `json:"order"`
		Moved    bool     `json:"moved_over_five_tiles"`
		Accepted []Order  `json:"accepted_recovery"`
	}
	tracked := map[ID]*trapped{}
	for _, v := range e.state.Entities {
		if v.Building || v.HP <= 0 || len(v.Orders) == 0 {
			continue
		}
		o := v.Orders[0]
		target := e.entity(o.Target)
		stalled := o.Kind == "move" && v.Blocked && e.Tick()-v.StationarySince >= seconds(12)
		healed := o.Kind == "guard" && o.Target != 0 && v.HP*100 >= v.MaxHP*85 && (target == nil || e.repairRate(target, v) > 0)
		if stalled || healed {
			tracked[v.ID] = &trapped{ID: v.ID, Owner: v.Owner, Position: v.Position, Order: o}
		}
	}
	if len(tracked) < 10 {
		t.Fatal("wrong retained congestion fixture", len(tracked))
	}
	for range 12000 {
		if e.Outcome().Finished {
			break
		}
		e.Advance()
		twin.Advance()
		for id, row := range tracked {
			if v := e.entity(id); v != nil && distance(v.Position, row.Position) > 5000 {
				row.Moved = true
			}
		}
		for _, receipt := range e.state.Results {
			if !receipt.Accepted {
				continue
			}
			for i := len(e.state.Log) - 1; i >= 0; i-- {
				batch := e.state.Log[i]
				if batch.Tick < receipt.Tick {
					break
				}
				if batch.Player != receipt.Player || batch.Sequence != receipt.Sequence {
					continue
				}
				o := batch.Orders[receipt.Index]
				for _, id := range o.Entities {
					if row := tracked[id]; row != nil {
						row.Accepted = append(row.Accepted, o)
					}
				}
			}
		}
		if e.Tick()%600 == 0 {
			if err := recorder.Capture(e, false); err != nil {
				t.Fatal(err)
			}
		}
	}
	if twin.Hash() != e.Hash() {
		t.Fatal("recovery fork restoration drift")
	}
	if err := recorder.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := recorder.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("recovery fork full replay drift", err)
	}
	moved := map[PlayerID]int{}
	rows := []*trapped{}
	for _, v := range tracked {
		rows = append(rows, v)
		if v.Moved {
			moved[v.Owner]++
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	out, _ := json.MarshalIndent(struct {
		InitialHash, FinalHash string
		Tick                   Tick
		Outcome                Outcome
		Moved                  map[PlayerID]int
		Actors                 []*trapped
	}{initialHash, e.Hash(), e.Tick(), e.Outcome(), moved, rows}, "", "  ")
	if err := os.WriteFile(filepath.Join(directory, "recovery-fork-result.json"), append(out, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
	t.Logf("unchanged_initial=%s tick%d moved=%v outcome%+v final=%s", initialHash, e.Tick(), moved, e.Outcome(), e.Hash())
	if moved[1] < 5 || moved[2] < 5 {
		t.Fatal("ordinary recovery did not free meaningful groups", moved)
	}
}

func TestAIFactionAbilityPlannedOnceForMultipleSources(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.Faction, p.AI = "SA", "normal"
	baseInfrastructure(e, 1)
	for _, pos := range []Vec{{X: 16000, Y: 14000}, {X: 18000, Y: 14000}} {
		v := e.spawn("SA.repair", 1, pos, true, 0)
		v.Deployed = true
	}
	e.spawn("IR.tank", 2, Vec{X: 21000, Y: 14000}, true, 0)
	e.recalculate()
	p.Energy = 100000
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	orders := []Order{}
	for _, o := range e.aiSpecialOrders(p, view, aiOwnView(e, 1), Vec{X: 21000, Y: 14000}) {
		if o.Kind == "ability" && o.Type == "recovery_order" {
			orders = append(orders, o)
		}
	}
	if len(orders) != 1 {
		t.Fatal("shared faction cooldown scheduled more than once", orders)
	}
	p.AI = ""
	issue(t, e, 1, orders[0])
	if !cooldown(p.Cooldowns, "recovery_order", e.Tick()) {
		t.Fatal("planned faction skill did not execute")
	}
}

func TestAIIndependentActorAbilitiesRemainAvailableTogether(t *testing.T) {
	e := fixture(t)
	p := e.player(1)
	p.AI = "normal"
	for _, pos := range []Vec{{X: 16000, Y: 14000}, {X: 18000, Y: 14000}} {
		e.spawn("US.recon", 1, pos, true, 0)
	}
	e.spawn("IR.tank", 2, Vec{X: 20000, Y: 14000}, true, 0)
	e.recalculate()
	e.updateFog()
	view, _ := e.PlayerView(1)
	e.aiObserve(p, view)
	orders := []Order{}
	for _, o := range e.aiSpecialOrders(p, view, aiOwnView(e, 1), Vec{X: 20000, Y: 14000}) {
		if o.Kind == "ability" && o.Type == "designate" {
			orders = append(orders, o)
		}
	}
	if len(orders) != 2 || orders[0].Entities[0] == orders[1].Entities[0] {
		t.Fatal("independent actor skills incorrectly collapsed", orders)
	}
	p.AI = ""
	if err := e.Submit(1, p.LastSequence+1, orders); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || !e.state.Results[1].Accepted {
		t.Fatal("ordinary actor skills did not both execute", e.state.Results)
	}
}
