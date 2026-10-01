package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

// Root-only diagnostic overlay for immutable Core20. Infrastructure, treasury,
// public terrain and one opposing initial actor are controlled fixture inputs.
// The measured actor is ordinarily trained, paid, rallied and given an accepted
// Attack-move followed by queued Hold. No actor/casualty position is rewritten.
func TestAI48GroundTaskReasonsPaidQueuedHoldSurvivesOptionalCover(t *testing.T) {
	m := fixtureMap()
	cover := Vec{X: 22500, Y: 16500}
	m.Tiles[16*m.Width+22].Terrain = "cover"
	e, err := New(content.MustBase(), Config{Map: m, Seed: 42, Players: []PlayerConfig{
		{ID: 1, Faction: "US", Team: 1},
		{ID: 2, Faction: "IR", Team: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	baseInfrastructure(e, 1)
	p := e.player(1)
	rule, ok := e.catalog.Unit("US.rifle")
	if !ok {
		t.Fatal("missing ordinary rifle rule")
	}
	p.Credits = rule.Cost
	var producer *Entity
	for _, v := range e.state.Entities {
		if v.Owner == 1 && v.Building && e.role(v) == rule.Producer {
			producer = v
			break
		}
	}
	if producer == nil || !producer.Active(e.Tick()) || p.LowPower() {
		t.Fatal("ordinary paid production prerequisites unavailable")
	}
	threat := e.spawn("IR.rifle", 2, Vec{X: 28500, Y: 17500}, true, 0)
	// This opposing initial fixture actor is wounded so ordinary combat can
	// finish without putting the healthy measured rifle into critical retreat.
	// The controlled wound is not claimed as damage caused by the tested rifle.
	threat.HP = 15000
	issue(t, e, 2, Order{Kind: "hold", Entities: []ID{threat.ID}})
	rally := Vec{X: 20500, Y: 17500}
	if err := e.Submit(1, p.LastSequence+1, []Order{
		{Kind: "rally", Entities: []ID{producer.ID}, Position: rally},
		{Kind: "train", Entities: []ID{producer.ID}, Type: rule.ID},
	}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("paid setup order rejected", result)
		}
	}
	if len(producer.Jobs) != 1 || !producer.Jobs[0].Started || producer.Jobs[0].Paid != rule.Cost || producer.Jobs[0].Work != 2 || p.Credits != 0 || p.Spent != rule.Cost || p.ReservedSupply != rule.Supply {
		t.Fatal("ordinary Train did not debit, reserve and advance", producer.Jobs, p.Credits, p.Spent, p.ReservedSupply)
	}
	var unit *Entity
	deadline := e.Tick() + Tick(rule.BuildTicks) + seconds(30)
	for e.Tick() < deadline {
		for _, v := range e.state.Entities {
			if v.Owner == 1 && v.Type == rule.ID && v.HP > 0 {
				unit = v
				break
			}
		}
		if unit != nil && len(unit.Orders) == 0 && distance(unit.Position, rally) <= 500 {
			break
		}
		e.Advance()
	}
	if unit == nil || !unit.Active(e.Tick()) || unit.Paid != rule.Cost || unit.HP != unit.MaxHP || len(unit.Orders) != 0 || distance(unit.Position, rally) > 500 || p.Supply != rule.Supply || p.ReservedSupply != 0 || p.Spent != rule.Cost || p.Credits != 0 {
		t.Fatal("paid rifle did not reach ordinary rally in bounded setup", unit, e.Tick(), p.Supply, p.ReservedSupply, p.Credits, p.Spent)
	}
	if err := e.Submit(1, p.LastSequence+1, []Order{
		{Kind: "attack_move", Entities: []ID{unit.ID}, Position: Vec{X: 31500, Y: 17500}},
		{Kind: "hold", Entities: []ID{unit.ID}, Queued: true},
	}); err != nil {
		t.Fatal(err)
	}
	e.Advance()
	if len(e.state.Results) != 2 || !e.state.Results[0].Accepted || !e.state.Results[1].Accepted || len(unit.Orders) != 2 || unit.Orders[0].Kind != "attack_move" || unit.Orders[1].Kind != "hold" || !unit.Orders[1].Queued || unit.HP != unit.MaxHP || unit.Channel != "" || unit.Container != 0 || unit.Deployed {
		t.Fatal("healthy accepted queue did not exist before AI", e.state.Results, unit)
	}
	before := append([]Order(nil), unit.Orders...)
	p.Controller, p.AI, p.AILast = "ai", "normal", e.Tick()-seconds(2)
	e.updateFog()
	view, ok := e.PlayerView(1)
	if !ok {
		t.Fatal("player 1 view unavailable")
	}
	visible := false
	for _, actor := range view.Entities {
		if actor.ID == threat.ID {
			visible = true
		}
	}
	if !visible || e.state.Map.TileAt(unit.Position).Cover() || !e.canSee(1, cover) {
		t.Fatal("current visible threat and optional cover opportunity missing", visible, unit.Position)
	}
	saved, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	twin, err := Restore(e.catalog, saved)
	if err != nil || twin.Hash() != e.Hash() {
		t.Fatal("paid queue checkpoint restore differs", err)
	}
	e.updateAI()
	twin.updateAI()
	if twin.Hash() != e.Hash() {
		t.Fatal("full AI plan differs after restore")
	}
	point, useful := e.aiCoverPosition(p, unit, p.AIGoal)
	if !useful || point != cover || !reflect.DeepEqual(unit.Orders, before) {
		t.Fatal("full cycle lacked exact useful cover or mutated queue during planning", point, useful, p.AIGoal, unit.Orders)
	}
	proposal, _ := json.Marshal(e.state.Pending)
	t.Logf("qualified_paid_queue actor=%d Paid=%d Supply=%d Spent=%d HP=%d/%d position=%v threat=%d cover=%v original=%+v pending=%s", unit.ID, unit.Paid, p.Supply, p.Spent, unit.HP, unit.MaxHP, unit.Position, threat.ID, cover, before, proposal)
	replay, err := NewReplay(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Advance()
	twin.Advance()
	if twin.Hash() != e.Hash() {
		t.Fatal("ordinary accepted execution differs after restore")
	}
	for _, result := range e.state.Results {
		if !result.Accepted {
			t.Fatal("AI order rejected by ordinary executor", result)
		}
	}
	if err := replay.Capture(e, false); err != nil {
		t.Fatal(err)
	}
	played, err := replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("one-cycle paid queue replay differs", err)
	}
	t.Logf("ordinary_executor_receipt tick=%d results=%+v actor_orders=%+v stance=%s position=%v HP=%d/%d replay_hash=%s", e.Tick(), e.state.Results, unit.Orders, unit.Stance, unit.Position, unit.HP, unit.MaxHP, e.Hash())
	if !reflect.DeepEqual(unit.Orders, before) {
		t.Fatalf("optional cover replaced a healthy accepted Attack-move + queued Hold: before=%+v after=%+v", before, unit.Orders)
	}
	start := unit.Position
	completionDeadline := e.Tick() + seconds(12)
	for e.Tick() < completionDeadline && (len(unit.Orders) != 0 || unit.Stance != "hold") {
		e.Advance()
		twin.Advance()
		if twin.Hash() != e.Hash() {
			t.Fatal("queued completion differs after restore", e.Tick())
		}
		if err := replay.Capture(e, false); err != nil {
			t.Fatal(err)
		}
	}
	if unit.HP <= 0 || unit.HP*100 < unit.MaxHP*85 || threat.HP > 0 || len(unit.Orders) != 0 || unit.Stance != "hold" || distance(unit.Position, start) < 4000 || distance(unit.Position, before[0].Position) > 500 {
		t.Fatal("ordinary queue never completed useful attack travel and Hold", e.Tick(), unit, threat.HP)
	}
	heldPosition := unit.Position
	for range seconds(1) {
		e.Advance()
		twin.Advance()
		if twin.Hash() != e.Hash() || unit.Position != heldPosition || unit.Stance != "hold" || len(unit.Orders) != 0 {
			t.Fatal("completed canonical Hold did not keep its position", e.Tick(), unit.Orders, unit.Position)
		}
		if err := replay.Capture(e, false); err != nil {
			t.Fatal(err)
		}
	}
	played, err = replay.Seek(e.catalog, e.Tick())
	if err != nil || played.Hash() != e.Hash() {
		t.Fatal("useful queue completion replay differs", err)
	}
	t.Logf("useful_completion actor=%d displacement=%d controlled_initial_enemy_HP=15000 actual_enemy_remaining_HP=%d actor_HP=%d/%d completed_Hold_position=%v tick=%d replay_hash=%s", unit.ID, distance(unit.Position, start), threat.HP, unit.HP, unit.MaxHP, heldPosition, e.Tick(), e.Hash())
}
