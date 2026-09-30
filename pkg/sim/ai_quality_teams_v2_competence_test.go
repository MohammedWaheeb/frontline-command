package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

// These are paid, controlled policy fixtures. The setup buys infrastructure and
// units with ordinary human commands, then enables the configured AI for the
// behavior under test. They are not full-match or authored co-op competence
// evidence; there are no harness orders to the AI engineer after that handoff.
type aiTeamsV2PaidFixture struct {
	e                        *Engine
	engineer, scout, station ID
}

func aiTeamsV2Receipt(t *testing.T, e *Engine, owner PlayerID, order Order) uint32 {
	t.Helper()
	sequence := e.player(owner).LastSequence + 1
	if err := e.Submit(owner, sequence, []Order{order}); err != nil {
		t.Fatalf("submit owner=%d kind=%s: %v", owner, order.Kind, err)
	}
	e.Advance()
	for _, result := range e.state.Results {
		if result.Player == owner && result.Sequence == sequence && result.Index == 0 {
			if !result.Accepted {
				t.Fatalf("ordinary command rejected: %+v", result)
			}
			return sequence
		}
	}
	t.Fatalf("missing receipt owner=%d sequence=%d: %+v", owner, sequence, e.state.Results)
	return 0
}

func aiTeamsV2Wait(t *testing.T, e *Engine, limit int, label string, ready func() bool) {
	t.Helper()
	for i := 0; i < limit && !ready(); i++ {
		e.Advance()
	}
	if !ready() {
		t.Fatalf("%s did not complete within %d ordinary ticks at %d", label, limit, e.Tick())
	}
}

func aiTeamsV2OwnedActor(t *testing.T, e *Engine, owner PlayerID, typ string) *Entity {
	t.Helper()
	for _, actor := range e.state.Entities {
		if actor.Owner == owner && actor.Type == typ && actor.HP > 0 {
			return actor
		}
	}
	t.Fatalf("missing owned actor %d %s", owner, typ)
	return nil
}

func aiTeamsV2Move(t *testing.T, e *Engine, owner PlayerID, actor ID, point Vec) {
	t.Helper()
	aiTeamsV2Receipt(t, e, owner, Order{Kind: "move", Entities: []ID{actor}, Position: point})
	aiTeamsV2Wait(t, e, 900, "ordinary movement", func() bool {
		v := e.entity(actor)
		return v != nil && len(v.Orders) == 0 && distance(v.Position, point) < 750
	})
}

func aiTeamsV2Build(t *testing.T, e *Engine, owner PlayerID, rig ID, typ string, point Vec) *Entity {
	t.Helper()
	rule, ok := e.buildingRule(typ)
	if !ok {
		t.Fatal("missing building rule", typ)
	}
	credits := e.player(owner).Credits
	aiTeamsV2Receipt(t, e, owner, Order{Kind: "build", Entities: []ID{rig}, Type: typ, Position: point})
	v := aiTeamsV2OwnedActor(t, e, owner, typ)
	if v.Paid != rule.Cost || e.player(owner).Credits != credits-rule.Cost {
		t.Fatal("infrastructure did not pay its normal cost", typ, v.Paid, e.player(owner).Credits)
	}
	aiTeamsV2Wait(t, e, 1200, "paid construction "+typ, func() bool { return v.Complete })
	return v
}

func aiTeamsV2Train(t *testing.T, e *Engine, owner PlayerID, producer *Entity, typ string) *Entity {
	t.Helper()
	rule, ok := e.catalog.Unit(typ)
	if !ok {
		t.Fatal("missing unit rule", typ)
	}
	credits := e.player(owner).Credits
	aiTeamsV2Receipt(t, e, owner, Order{Kind: "train", Entities: []ID{producer.ID}, Type: typ})
	if e.player(owner).Credits != credits-rule.Cost || len(producer.Jobs) != 1 || !producer.Jobs[0].Started || producer.Jobs[0].Paid != rule.Cost {
		t.Fatal("unit did not pay through the ordinary production job", typ, e.player(owner).Credits, producer.Jobs)
	}
	var v *Entity
	readyEvent := false
	aiTeamsV2Wait(t, e, 900, "paid unit and automatic rally "+typ, func() bool {
		for _, event := range e.state.Events {
			if event.Kind == "unit_ready" && event.Owner == owner {
				if actor := e.entity(event.Entity); actor != nil && actor.Type == typ {
					v, readyEvent = actor, true
				}
			}
		}
		return v != nil && len(v.Orders) == 0 && distance(v.Position, producer.Rally) < 750
	})
	if !readyEvent || v.Paid != rule.Cost || v.Created < 100 {
		t.Fatal("unit lacks normal paid completion provenance", typ, v)
	}
	t.Logf("paid owner=%d actor=%d type=%s cost=%d ready=%d at=%d", owner, v.ID, typ, v.Paid, v.Created, e.Tick())
	return v
}

func aiTeamsV2PaidSetup(t *testing.T, faction string) aiTeamsV2PaidFixture {
	t.Helper()
	m := fixtureMap()
	m.ID, m.Title = "teams-v2-paid-policy", "Synthetic paid policy fixture"
	m.Stations[0].Position = Vec{X: 42000, Y: 24000}
	m.Spawns = append(m.Spawns, content.Spawn{Position: Vec{X: 8000, Y: 50000}})
	e, err := New(content.MustBase(), Config{Map: m, Seed: 28311, Players: []PlayerConfig{
		{ID: 1, Name: "Paid engineer", Faction: faction, Team: 1, Controller: "human"},
		{ID: 2, Name: "Hidden opponent", Faction: "IR", Team: 2, Controller: "human"},
		{ID: 3, Name: "Shared scout", Faction: "US", Team: 1, Controller: "human"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if e.state.Countdown != 100 || e.player(1).Credits != 6000000 || e.player(3).Credits != 6000000 {
		t.Fatal("fixture changed ordinary New economy or countdown")
	}
	for range 100 {
		e.Advance()
	}
	rig := aiTeamsV2OwnedActor(t, e, 1, faction+".rig")
	aiTeamsV2Build(t, e, 1, rig.ID, "power", Vec{X: 8000, Y: 14000})
	aiTeamsV2Move(t, e, 1, rig.ID, Vec{X: 13000, Y: 17000})
	barracks := aiTeamsV2Build(t, e, 1, rig.ID, "barracks", Vec{X: 8000, Y: 18000})
	allyRig := aiTeamsV2OwnedActor(t, e, 3, "US.rig")
	aiTeamsV2Build(t, e, 3, allyRig.ID, "power", Vec{X: 8000, Y: 46000})
	allyBarracks := aiTeamsV2Build(t, e, 3, allyRig.ID, "barracks", Vec{X: 14000, Y: 50000})
	engineer := aiTeamsV2Train(t, e, 1, barracks, faction+".engineer")
	scout := aiTeamsV2Train(t, e, 3, allyBarracks, "US.recon")
	station := e.state.Stations[0]
	aiTeamsV2Move(t, e, 3, scout.ID, station.Position)
	aiTeamsV2Receipt(t, e, 3, Order{Kind: "hold", Entities: []ID{scout.ID}})
	view, ok := e.PlayerView(1)
	if !ok || !aiTeamsV2StationObserved(view, station.ID) || distance(engineer.Position, station.Position) <= 20000 {
		t.Fatal("station must be shared-scout observed and beyond this owned engineer's local sight", engineer.Position, view.Stations)
	}
	for _, actor := range view.Entities {
		if actor.Owner == 2 {
			t.Fatal("hidden private twin control is already observed", actor)
		}
	}
	return aiTeamsV2PaidFixture{e: e, engineer: engineer.ID, scout: scout.ID, station: station.ID}
}

func aiTeamsV2StationObserved(view View, id ID) bool {
	for _, station := range view.Stations {
		if station.ID == id {
			return true
		}
	}
	return false
}

func aiTeamsV2Own(view View) []EntityView {
	var own []EntityView
	for _, v := range view.Entities {
		if v.Owner == view.Player {
			own = append(own, v)
		}
	}
	return own
}

func aiTeamsV2ActorOrders(e *Engine, view View, actor ID) []Order {
	p := e.player(view.Player)
	e.aiObserve(p, view)
	var result []Order
	for _, order := range e.aiSpecialOrders(p, view, aiTeamsV2Own(view), Vec{X: 42000, Y: 24000}) {
		for _, id := range order.Entities {
			if id == actor {
				result = append(result, order)
				break
			}
		}
	}
	return result
}

func aiTeamsV2Restore(t *testing.T, e *Engine) *Engine {
	t.Helper()
	save, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	b, err := Restore(e.catalog, save)
	if err != nil {
		t.Fatal(err)
	}
	if b.Hash() != e.Hash() {
		t.Fatal("ordinary save/restore changed state", e.Tick())
	}
	return b
}

func aiTeamsV2HiddenTwin(t *testing.T, e *Engine) *Engine {
	t.Helper()
	b := aiTeamsV2Restore(t, e)
	p := b.player(2)
	p.Credits, p.Energy, p.Upgrades = 17000000, 100000, []string{"vehicle_armor"}
	for _, v := range b.state.Entities {
		if v.Owner == 2 {
			if v.Building {
				v.Jobs = []Job{{Type: "IR.rig", Required: 800, Paid: 700000, Started: true}}
			} else {
				v.Orders = []Order{{Kind: "move", Position: Vec{X: 42000, Y: 56000}}}
			}
		}
	}
	return b
}

func TestAIQualityTeamsV2PaidDistantEngineerSurvivesSharedScoutWithdrawal(t *testing.T) {
	for _, faction := range []string{"US", "IR", "SY", "SA"} {
		t.Run(faction, func(t *testing.T) {
			f := aiTeamsV2PaidSetup(t, faction)
			e, p := f.e, f.e.player(1)
			view, _ := e.PlayerView(1)
			b := aiTeamsV2HiddenTwin(t, e)
			twinView, _ := b.PlayerView(1)
			if !reflect.DeepEqual(view, twinView) {
				t.Fatal("private opponent changes leaked into provided player view")
			}
			first := aiTeamsV2ActorOrders(e, view, f.engineer)
			if !reflect.DeepEqual(first, aiTeamsV2ActorOrders(b, twinView, f.engineer)) {
				t.Fatal("private opponent state changed engineer's public station intention")
			}
			engineer := e.entity(f.engineer)
			if len(first) != 1 || first[0].Kind != "move" || first[0].Target != 0 || first[0].Position != view.Stations[0].Position {
				t.Fatalf("distant shared-scout station needs ordinary coordinate movement before capture; paid=%d position=%+v orders=%+v", engineer.Paid, engineer.Position, first)
			}
			// AI now supplies its own ordinary commands; only the human teammate
			// receives the withdrawal order. Replay starts at this explicit phase.
			p.AI, p.Controller = "normal", "ai"
			replay, err := NewReplay(e)
			if err != nil {
				t.Fatal(err)
			}
			admitted := map[[2]uint32]string{}
			accepted := map[string]bool{}
			var copies []*Engine
			moveFog, fogMoved, channelSeen, captured, reacquired := false, false, false, false, false
			var fogPosition Vec
			var channelStart Tick
			withdrawn, withdrawalAccepted := false, false
			var withdrawalSequence uint32
			start := e.Tick()
			for range 900 {
				e.Advance()
				for _, copy := range copies {
					copy.Advance()
					if e.Tick()%40 == 0 && copy.Hash() != e.Hash() {
						t.Fatal("ordinary station approach/channel diverged after restore", e.Tick())
					}
				}
				for _, batch := range e.state.Pending {
					if batch.Player != 1 {
						continue
					}
					for i, order := range batch.Orders {
						if len(order.Entities) == 1 && order.Entities[0] == f.engineer && (order.Kind == "move" || order.Kind == "capture") {
							admitted[[2]uint32{batch.Sequence, uint32(i)}] = order.Kind
						}
					}
				}
				for _, result := range e.state.Results {
					if withdrawn && result.Player == 3 && result.Sequence == withdrawalSequence && result.Index == 0 {
						if !result.Accepted {
							t.Fatal("human scout withdrawal rejected", result)
						}
						withdrawalAccepted = true
					}
					if kind := admitted[[2]uint32{result.Sequence, uint32(result.Index)}]; result.Player == 1 && kind != "" {
						if !result.Accepted {
							t.Fatal("AI station order failed normal execution", result)
						}
						accepted[kind] = true
						t.Logf("AI receipt tick=%d sequence=%d index=%d kind=%s accepted=%t", result.Tick, result.Sequence, result.Index, kind, result.Accepted)
					}
				}
				if accepted["move"] && !withdrawn {
					sequence := e.player(3).LastSequence + 1
					withdrawalSequence = sequence
					order := Order{Kind: "move", Entities: []ID{f.scout}, Position: Vec{X: 18000, Y: 42000}}
					if err := e.Submit(3, sequence, []Order{order}); err != nil {
						t.Fatal(err)
					}
					withdrawn = true
				}
				for _, event := range e.state.Events {
					if event.Entity == f.engineer && event.Kind == "capture_interrupted" {
						t.Fatal("bounded open-terrain approach still attempted a sight-dependent remote capture", event)
					}
					if event.Entity == f.station && event.Owner == 1 && event.Kind == "station_captured" {
						captured = true
					}
				}
				current, _ := e.PlayerView(1)
				visible := aiTeamsV2StationObserved(current, f.station)
				if withdrawn && !visible && len(engineer.Orders) > 0 && engineer.Orders[0].Kind == "move" {
					if moveFog && engineer.Position != fogPosition {
						fogMoved = true
					}
					if !moveFog {
						moveFog, fogPosition = true, engineer.Position
						copies = append(copies, aiTeamsV2Restore(t, e))
						if _, err := replay.CaptureCheckpoint(e); err != nil {
							t.Fatal(err)
						}
					}
				}
				if moveFog && visible && engineer.Position != fogPosition {
					reacquired = true
				}
				if engineer.Channel == "capture" && !channelSeen {
					if !visible || engineer.ChannelDuration != seconds(6) || engineer.ChannelTarget != f.station {
						t.Fatal("capture lacks current visibility or ordinary six-second channel", engineer.ChannelDuration, engineer.ChannelTarget, current.Stations)
					}
					channelSeen, channelStart = true, e.Tick()
					copies = append(copies, aiTeamsV2Restore(t, e))
					if _, err := replay.CaptureCheckpoint(e); err != nil {
						t.Fatal(err)
					}
				}
				if err := replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
				if e.state.Stations[0].Owner == 1 {
					break
				}
			}
			if !accepted["move"] || !accepted["capture"] || !withdrawalAccepted || !moveFog || !fogMoved || !reacquired || !channelSeen || !captured || e.state.Stations[0].Owner != 1 || e.Tick()-channelStart < seconds(6) || engineer.HP != engineer.MaxHP {
				t.Fatalf("paid approach missing progress: accepted=%v withdrawal=%t fogMove=%t fogMoved=%t reacquired=%t channel=%t captured=%t owner=%d elapsed=%d", accepted, withdrawalAccepted, moveFog, fogMoved, reacquired, channelSeen, captured, e.state.Stations[0].Owner, e.Tick()-start)
			}
			for _, copy := range copies {
				if copy.Hash() != e.Hash() {
					t.Fatal("completed ordinary capture diverged after restore")
				}
			}
			for _, useCheckpoints := range []bool{false, true} {
				playback := *replay
				if !useCheckpoints {
					playback.Checkpoints = nil
				}
				replayed, err := playback.Seek(e.catalog, e.Tick())
				if err != nil || replayed.Hash() != e.Hash() {
					t.Fatalf("ordinary AI replay mismatch checkpoints=%t err=%v", useCheckpoints, err)
				}
			}
			t.Logf("paid open-terrain capture completed actor=%d station=%d tick=%d channelStart=%d fogPosition=%+v", f.engineer, f.station, e.Tick(), channelStart, fogPosition)
		})
	}
}

// This deliberately exercises the original direct remote capture, independently
// of the policy proposal. Withdrawing shared sight must still interrupt it.
func TestAIQualityTeamsV2RemoteCaptureVisibilityInterruptionRemainsFair(t *testing.T) {
	f := aiTeamsV2PaidSetup(t, "US")
	e := f.e
	sequence := aiTeamsV2Receipt(t, e, 1, Order{Kind: "capture", Entities: []ID{f.engineer}, Target: f.station})
	aiTeamsV2Receipt(t, e, 3, Order{Kind: "move", Entities: []ID{f.scout}, Position: Vec{X: 18000, Y: 42000}})
	interrupted := false
	for range 180 {
		e.Advance()
		for _, event := range e.state.Events {
			if event.Entity == f.engineer && event.Kind == "capture_interrupted" {
				interrupted = true
				t.Logf("baseline accepted remote capture sequence=%d interrupted=%d position=%+v", sequence, event.Tick, event.Position)
			}
		}
		if interrupted {
			break
		}
	}
	view, _ := e.PlayerView(1)
	engineer := e.entity(f.engineer)
	if !interrupted || aiTeamsV2StationObserved(view, f.station) || len(engineer.Orders) != 0 || engineer.Channel != "" || engineer.HP != engineer.MaxHP || e.state.Stations[0].Owner != 0 {
		t.Fatal("normal remote capture visibility interruption was weakened", interrupted, engineer, view.Stations)
	}
}

func TestAIQualityTeamsV2EngineerStationPublicRangeAndWorkControls(t *testing.T) {
	f := aiTeamsV2PaidSetup(t, "US")
	for _, control := range []string{"catalog_distant", "private_extended", "private_nearby", "no_current_station", "danger", "queued_work", "active_capture_channel"} {
		t.Run(control, func(t *testing.T) {
			e := aiTeamsV2Restore(t, f.e)
			view, _ := e.PlayerView(1)
			engineer := e.entity(f.engineer)
			want := ""
			switch control {
			case "catalog_distant", "private_extended", "private_nearby":
				view.Stations[0].Position = Vec{X: engineer.Position.X + 10000, Y: engineer.Position.Y}
				want = "move"
				for i := range view.Entities {
					if view.Entities[i].ID == f.engineer {
						if control == "catalog_distant" {
							view.Entities[i].Private.Ranges = nil
							continue
						}
						if control == "private_extended" {
							view.Entities[i].Private.Ranges.SightRadius = 11000
						} else {
							view.Stations[0].Position.X = engineer.Position.X + 8000
						}
						want = "capture"
					}
				}
			case "no_current_station":
				view.Stations = nil
			case "danger":
				view.Entities = append(view.Entities, EntityView{ID: 9001, Owner: 2, Type: "IR.rifle", Position: view.Stations[0].Position, Complete: true, Enabled: true, Health: 1000})
			case "queued_work":
				aiTeamsV2Receipt(t, e, 1, Order{Kind: "move", Entities: []ID{f.engineer}, Position: Vec{X: 16000, Y: 23000}})
				aiTeamsV2Receipt(t, e, 1, Order{Kind: "move", Entities: []ID{f.engineer}, Position: Vec{X: 20000, Y: 25000}, Queued: true})
				if len(engineer.Orders) < 2 {
					t.Fatal("normal explicit and queued movement not retained", engineer.Orders)
				}
				view, _ = e.PlayerView(1)
			case "active_capture_channel":
				aiTeamsV2Move(t, e, 1, f.engineer, Vec{X: 41000, Y: 24000})
				aiTeamsV2Receipt(t, e, 1, Order{Kind: "capture", Entities: []ID{f.engineer}, Target: f.station})
				if engineer.Channel != "capture" || engineer.ChannelDuration != seconds(6) {
					t.Fatal("normal nearby capture did not start its six-second channel", engineer.Channel)
				}
				view, _ = e.PlayerView(1)
			}
			orders := aiTeamsV2ActorOrders(e, view, f.engineer)
			if want == "" {
				if len(orders) != 0 {
					t.Fatal("station proposal replaced existing work or used unsafe/noncurrent target", orders)
				}
			} else if len(orders) != 1 || orders[0].Kind != want || want == "move" && orders[0].Target != 0 || want == "capture" && orders[0].Target != f.station {
				t.Fatalf("public owner range control=%s want=%s got=%+v", control, want, orders)
			}
		})
	}
}

// Goal contract fixtures contain only public entity descriptions; those enemy
// IDs intentionally have no live backing entity. This guards the no-cheat view
// boundary without fabricating paid full-match combat evidence.
func aiTeamsV2GoalFixture(t *testing.T, catalog *content.Catalog) (*Engine, View) {
	t.Helper()
	m := fixtureMap()
	m.ID, m.Title = "teams-v2-public-goal", "Synthetic public goal contract"
	m.Width, m.Height = 128, 128
	m.Tiles = make([]content.Tile, m.Width*m.Height)
	for i := range m.Tiles {
		m.Tiles[i].Terrain = "open"
	}
	m.Spawns = []content.Spawn{{Position: Vec{X: 18500, Y: 64500}}, {Position: Vec{X: 109500, Y: 63500}}, {Position: Vec{X: 18500, Y: 100000}}, {Position: Vec{X: 109500, Y: 100000}}}
	e, err := New(catalog, Config{Map: m, Seed: 28321, Players: []PlayerConfig{
		{ID: 1, Name: "Own", Faction: "US", Team: 1}, {ID: 2, Name: "Opponent", Faction: "IR", Team: 2},
		{ID: 3, Name: "Ally", Faction: "US", Team: 1}, {ID: 4, Name: "Other opponent", Faction: "SA", Team: 2},
	}})
	if err != nil {
		t.Fatal(err)
	}
	view, _ := e.PlayerView(1)
	view.Entities = []EntityView{{ID: 1, Owner: 1, Type: "hq", Position: m.Spawns[0].Position, Complete: true, Enabled: true, Health: 1000}}
	return e, view
}

func aiTeamsV2PublicEnemy(id ID, typ string, point Vec) EntityView {
	return EntityView{ID: id, Owner: 2, Type: typ, Position: point, Complete: true, Enabled: true, Health: 1000}
}

func aiTeamsV2ExpectGoal(t *testing.T, e *Engine, view View, point Vec, intent string) {
	t.Helper()
	goal, ok := e.aiGoal(e.player(1), view)
	if !ok || goal != point || e.player(1).AIIntent != intent {
		t.Fatalf("public goal=%+v have=%t intent=%s want=%+v/%s", goal, ok, e.player(1).AIIntent, point, intent)
	}
}

func TestAIQualityTeamsV2Core06ObservedDefenseRanksArmedRifleBeforeMedic(t *testing.T) {
	e, view := aiTeamsV2GoalFixture(t, content.MustBase())
	medic := aiTeamsV2PublicEnemy(29, "IR.medic", Vec{X: 15750, Y: 69614})
	rifle := aiTeamsV2PublicEnemy(103, "IR.rifle", Vec{X: 15648, Y: 62352})
	apc := aiTeamsV2PublicEnemy(136, "IR.apc", Vec{X: 26146, Y: 68854})
	view.Entities = append(view.Entities, medic, rifle, apc)
	for _, id := range []ID{29, 103, 136} {
		if e.entity(id) != nil {
			t.Fatal("public goal fixture unexpectedly has live enemy backing", id)
		}
	}
	aiTeamsV2ExpectGoal(t, e, view, rifle.Position, "defend")
}

func TestAIQualityTeamsV2DefenseUsesPublicArmedChannelsAndStableTies(t *testing.T) {
	for _, owner := range []PlayerID{1, 3} {
		ownerName := "own"
		if owner == 3 {
			ownerName = "ally"
		}
		for _, typ := range []string{"hq", "supply", "IR.hauler"} {
			t.Run(ownerName+"/"+typ, func(t *testing.T) {
				e, view := aiTeamsV2GoalFixture(t, content.MustBase())
				point := Vec{X: 42000, Y: 64000}
				view.Entities = []EntityView{{ID: 901, Owner: owner, Type: typ, Position: point, Complete: true, Enabled: true, Health: 1000}}
				medic := aiTeamsV2PublicEnemy(29, "IR.medic", Vec{X: 43000, Y: 64000})
				rifle := aiTeamsV2PublicEnemy(103, "IR.rifle", Vec{X: 48000, Y: 64000})
				view.Entities = append(view.Entities, medic, rifle)
				aiTeamsV2ExpectGoal(t, e, view, rifle.Position, "defend")
			})
		}
	}
	for _, control := range []string{"nearer_higher_id", "equal_distance_lower_id", "air_only_fighter", "air_only_aa", "ground_capable_air", "armed_recon", "disabled_weapon", "incomplete_weapon", "unarmed_fallback"} {
		t.Run(control, func(t *testing.T) {
			e, view := aiTeamsV2GoalFixture(t, content.MustBase())
			center := view.Entities[0].Position
			first := aiTeamsV2PublicEnemy(29, "IR.rifle", Vec{X: center.X + 9000, Y: center.Y})
			second := aiTeamsV2PublicEnemy(103, "IR.rifle", Vec{X: center.X + 5000, Y: center.Y})
			want := second.Position
			switch control {
			case "equal_distance_lower_id":
				first.Position.X, first.Position.Y = center.X, center.Y+5000
				view.Entities = append(view.Entities, second, first)
				want = first.Position
			case "air_only_fighter", "air_only_aa":
				first.Type, first.Position.X = "IR.fighter", center.X+1000
				if control == "air_only_aa" {
					first.Type = "IR.aa"
				}
			case "ground_capable_air", "armed_recon":
				first.Type, first.Position.X = "IR.medic", center.X+1000
				second.Type = "IR.strike"
				if control == "armed_recon" {
					second.Type = "US.recon"
				}
			case "disabled_weapon", "incomplete_weapon":
				first.Position.X = center.X + 1000
				if control == "disabled_weapon" {
					first.Enabled = false
				} else {
					first.Complete = false
				}
			case "unarmed_fallback":
				first.Type, second.Type = "IR.medic", "IR.engineer"
			}
			if control != "equal_distance_lower_id" {
				view.Entities = append(view.Entities, first, second)
			}
			aiTeamsV2ExpectGoal(t, e, view, want, "defend")
		})
	}
}

func TestAIQualityTeamsV2DefenseBuildingCanonicalArmorDiffersFromHauler(t *testing.T) {
	// This is an isolated public catalog contract control. Base data remains
	// unchanged; distinct channels ensure a heavy/structure mixup cannot pass.
	var pack content.Pack
	if err := json.Unmarshal(content.MustBase().JSON(), &pack); err != nil {
		t.Fatal(err)
	}
	for i := range pack.Armor {
		rule := &pack.Armor[i]
		if rule.Weapon == "small" && rule.Armor == "heavy" || rule.Weapon == "antiarmor" && rule.Armor == "structure" {
			rule.Multiplier = 0
		}
		if rule.Weapon == "small" && rule.Armor == "structure" || rule.Weapon == "antiarmor" && rule.Armor == "heavy" {
			rule.Multiplier = 1000
		}
	}
	raw, err := json.Marshal(pack)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := content.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	for _, typ := range []string{"hq", "supply", "IR.hauler"} {
		t.Run(typ, func(t *testing.T) {
			e, view := aiTeamsV2GoalFixture(t, catalog)
			center := Vec{X: 42000, Y: 64000}
			view.Entities = []EntityView{{ID: 901, Owner: 3, Type: typ, Position: center, Complete: true, Enabled: true, Health: 1000}}
			at := aiTeamsV2PublicEnemy(29, "US.at", Vec{X: 43000, Y: 64000})
			rifle := aiTeamsV2PublicEnemy(103, "IR.rifle", Vec{X: 48000, Y: 64000})
			view.Entities = append(view.Entities, at, rifle)
			want := rifle.Position
			if typ == "IR.hauler" {
				want = at.Position
			}
			aiTeamsV2ExpectGoal(t, e, view, want, "defend")
		})
	}
}

func TestAIQualityTeamsV2GoalPreservesPublicStatusPressureExploreAndPrivateBoundary(t *testing.T) {
	for _, control := range []string{"active_ally", "defeated_opponent", "defeated_ally", "friendly_actor", "outside_halo", "known_pressure", "endgame_indicator", "quiet_explore", "private_opponent_twin"} {
		t.Run(control, func(t *testing.T) {
			e, view := aiTeamsV2GoalFixture(t, content.MustBase())
			p := e.player(1)
			center := view.Entities[0].Position
			threat := aiTeamsV2PublicEnemy(103, "IR.rifle", Vec{X: center.X + 5000, Y: center.Y})
			want, intent := Vec{}, "scout"
			switch control {
			case "active_ally":
				view.Entities[0].Owner = 3
				view.Entities = append(view.Entities, threat)
				want, intent = threat.Position, "defend"
			case "defeated_opponent":
				view.Players[1].Defeated = true
				view.Entities = append(view.Entities, threat)
			case "defeated_ally":
				view.Entities[0].Owner = 3
				view.Players[2].Defeated = true
				view.Entities = append(view.Entities, threat)
			case "friendly_actor":
				threat.Owner = 3
				view.Entities = append(view.Entities, threat)
			case "outside_halo":
				threat.Position.X = center.X + 14000
				view.Entities = append(view.Entities, threat)
			case "known_pressure":
				want, intent = Vec{X: 109500, Y: 63500}, "pressure"
				p.AIKnowledge = []AIObservation{{ID: 901, Owner: 2, Type: "hq", Position: want}}
			case "endgame_indicator":
				want, intent = Vec{X: 109500, Y: 63500}, "pressure"
				view.Indicators = []StructureIndicator{{Owner: 2, Position: want}}
			case "private_opponent_twin":
				view.Entities = append(view.Entities, aiTeamsV2PublicEnemy(29, "IR.medic", Vec{X: center.X + 1000, Y: center.Y}), threat)
				b := aiTeamsV2HiddenTwin(t, e)
				first, have := e.aiGoal(p, view)
				second, secondHave := b.aiGoal(b.player(1), view)
				if first != second || have != secondHave || p.AIIntent != b.player(1).AIIntent {
					t.Fatal("hidden private opponent state changed public defense choice")
				}
				want, intent = threat.Position, "defend"
			}
			if intent == "scout" {
				_, have := e.aiGoal(p, view)
				if !have || p.AIIntent != "scout" {
					t.Fatal("no-current-threat control failed ordinary exploration", p.AIIntent, have)
				}
			} else {
				aiTeamsV2ExpectGoal(t, e, view, want, intent)
			}
		})
	}
}
