package sim

import (
	"encoding/json"
	"testing"
)

// The recovery prefix now buys a replacement collector before routine
// production. With that purchase not advancing AIStage, stage one legitimately
// chooses AA in both twins; stage two is the APC control used by the original
// defeated-aircraft regression. No opponent aircraft is needed for this choice.
func TestAIQualityUnionStageOneCompositionIsIndependentOfDefeatedAir(t *testing.T) {
	a, b := aiEndgameFixture(t, 3), aiEndgameFixture(t, 3)
	for _, e := range []*Engine{a, b} {
		baseInfrastructure(e, 1)
		p := e.player(1)
		p.AI, p.Controller, p.AIStage = "normal", "ai", 1
		e.state.Tick = seconds(2)
	}
	b.spawn("IR.fighter", 2, Vec{X: 13000, Y: 10000}, true, 0)
	for _, e := range []*Engine{a, b} {
		e.defeat(e.player(2))
		e.recalculate()
		e.updateFog()
		e.updateAI()
		aa := 0
		for _, batch := range e.state.Pending {
			for _, order := range batch.Orders {
				if order.Kind == "train" && len(order.Entities) == 1 && e.role(e.entity(order.Entities[0])) == "factory" && order.Type == "US.aa" {
					aa++
				}
			}
		}
		if aa != 1 {
			t.Fatalf("ordinary stage-one AA intentions=%d want=1: %+v", aa, e.state.Pending)
		}
	}
	first, err := json.Marshal(a.state.Pending)
	if err != nil {
		t.Fatal(err)
	}
	second, err := json.Marshal(b.state.Pending)
	if err != nil {
		t.Fatal(err)
	}
	if string(first) != string(second) {
		t.Fatal("defeated aircraft altered legitimate stage-one production", string(first), string(second))
	}
}

// This is a controlled three-player infrastructure checkpoint, not a full
// ordinary bot match. The engineer is bought and produced through normal
// commands. Normal surrender releases the station, after which the AI itself
// submits and completes the ordinary six-second neutral-station capture.
func TestAIQualityUnionSurrenderStationCapturedByPaidEngineer(t *testing.T) {
	e := aiEndgameFixture(t, 3)
	baseInfrastructure(e, 1)
	p := e.player(1)
	station := e.state.Stations[0]
	station.Owner = 2
	var producer *Entity
	for _, actor := range e.state.Entities {
		if actor.Owner == p.ID && e.role(actor) == "barracks" {
			producer = actor
			break
		}
	}
	if producer == nil {
		t.Fatal("missing owned producer")
	}
	rally := Vec{X: station.Position.X, Y: station.Position.Y - 1000}
	issue(t, e, p.ID, Order{Kind: "rally", Entities: []ID{producer.ID}, Position: rally})
	rule, ok := e.catalog.Unit("US.engineer")
	if !ok {
		t.Fatal("missing engineer rule")
	}
	credits := p.Credits
	issue(t, e, p.ID, Order{Kind: "train", Entities: []ID{producer.ID}, Type: rule.ID})
	if p.Credits != credits-rule.Cost || len(producer.Jobs) != 1 || producer.Jobs[0].Paid != rule.Cost {
		t.Fatal("engineer production did not pay the normal cost", p.Credits, producer.Jobs)
	}
	var engineer *Entity
	for range 1000 {
		e.Advance()
		for _, actor := range e.state.Entities {
			if actor.Owner == p.ID && actor.Type == rule.ID && actor.Paid == rule.Cost {
				engineer = actor
				break
			}
		}
		if engineer != nil && len(engineer.Orders) == 0 && distance(engineer.Position, rally) < 750 {
			break
		}
	}
	if engineer == nil || len(engineer.Orders) != 0 || distance(engineer.Position, rally) >= 750 {
		t.Fatal("normally paid engineer did not reach its automatic rally", engineer)
	}
	issue(t, e, 2, Order{Kind: "surrender"})
	if !e.player(2).Defeated || e.Outcome().Finished || station.Owner != 0 {
		t.Fatal("normal surrender did not release a station in the continuing three-player match")
	}
	view, ok := e.PlayerView(p.ID)
	if !ok {
		t.Fatal("missing owned player view")
	}
	seenNeutral := false
	for _, observed := range view.Stations {
		if observed.ID == station.ID {
			if observed.Owner != 0 {
				t.Fatal("fresh public station owner is not neutral", observed)
			}
			seenNeutral = true
		}
	}
	if !seenNeutral {
		t.Fatal("released station is not in the engineer's ordinary view")
	}
	p.AI, p.Controller = "normal", "ai"
	e.aiObserve(p, view)
	start := e.Tick()
	admitted, executed, channelSeen := false, false, false
	var captureSequence uint32
	var captureIndex int32
	var restored *Engine
	for range 240 {
		e.Advance()
		if restored != nil {
			restored.Advance()
			if restored.Hash() != e.Hash() {
				t.Fatal("paid AI station capture diverged after restore", e.Tick())
			}
		}
		for _, batch := range e.state.Pending {
			for i, order := range batch.Orders {
				if batch.Player == p.ID && order.Kind == "capture" && order.Target == station.ID && len(order.Entities) == 1 && order.Entities[0] == engineer.ID {
					admitted = true
					captureSequence, captureIndex = batch.Sequence, int32(i)
				}
			}
		}
		for _, result := range e.state.Results {
			if admitted && result.Player == p.ID && result.Sequence == captureSequence && result.Index == captureIndex {
				if !result.Accepted {
					t.Fatal("AI neutral capture rejected", result)
				}
				executed = true
			}
		}
		if engineer.Channel == "capture" {
			channelSeen = true
			if engineer.ChannelDuration != seconds(6) {
				t.Fatal("capture bypassed its normal duration", engineer.ChannelDuration)
			}
			if restored == nil {
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err = Restore(e.catalog, saved)
				if err != nil {
					t.Fatal(err)
				}
				if restored.Hash() != e.Hash() {
					t.Fatal("capture save changed state")
				}
			}
		}
		if station.Owner == p.ID {
			break
		}
	}
	if !admitted || !executed || !channelSeen || restored == nil || station.Owner != p.ID || e.Tick()-start < seconds(6) {
		t.Fatalf("AI did not normally complete released station capture: admitted=%v executed=%v channel=%v owner=%d tick=%d", admitted, executed, channelSeen, station.Owner, e.Tick())
	}
	t.Logf("ordinary engineer cost=%d, surrender neutral station=%d, AI capture completed tick=%d", rule.Cost, station.ID, e.Tick())
}
