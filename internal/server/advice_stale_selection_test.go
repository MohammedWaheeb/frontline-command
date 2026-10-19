package server

import (
	"context"
	"encoding/json"
	"frontlinecommand/pkg/sim"
	"testing"
)

func TestAdviceAfterOrdinarySellCleanupIsConservative(t *testing.T) {
	s, h := testServer(t)
	e, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 33, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	for range 100 {
		e.Advance()
	}
	if err = e.Submit(1, 1, []sim.Order{{Kind: "build", Entities: []sim.ID{2}, Type: "power", Position: sim.Vec{X: 13000, Y: 13000}}}); err != nil {
		t.Fatal(err)
	}
	var built sim.ID
	for range 1500 {
		e.Advance()
		for _, entity := range e.StateCopy().Entities {
			if entity.Owner == 1 && entity.Type == "power" && entity.Complete {
				built = entity.ID
			}
		}
		if built != 0 {
			break
		}
	}
	if built == 0 {
		t.Fatal("ordinary construction never completed")
	}
	if _, err = e.CommandAffordances(1, []sim.ID{built}); err != nil {
		t.Fatal("living owned actor unavailable", err)
	}
	if err = e.Submit(1, 2, []sim.Order{{Kind: "sell", Entities: []sim.ID{built}}}); err != nil {
		t.Fatal(err)
	}
	for range 110 {
		e.Advance()
	}
	for _, entity := range e.StateCopy().Entities {
		if entity.ID == built {
			t.Fatal("sale did not reach ordinary actor cleanup")
		}
	}
	if _, err = e.CommandAffordances(1, []sim.ID{built}); err == nil || err.Error() != "not_owner" {
		t.Fatal("stale selection did not reproduce affordance rejection", err)
	}
	view, _ := e.PlayerView(1)
	for _, player := range view.Players {
		if player.ID == 1 && player.Defeated {
			t.Fatal("fixture commander eliminated")
		}
	}
	m, err := newMatch("stale-advice", e, []slot{{Player: 1, Token: "slot-one"}, {Player: 2, Token: "slot-two"}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	ctx := context.Background()
	before := m.call(ctx, matchRequest{kind: "save"})
	path := "/api/v1/matches/" + m.id + "/advice"
	for _, ids := range [][]sim.ID{{built}, {1, built}, {3}, {999999}} {
		orders := []sim.Order{{Kind: "move", Entities: ids, Position: sim.Vec{X: 15000, Y: 13000}}, {Kind: "ping", Position: sim.Vec{X: 15000, Y: 13000}}}
		got := request(t, h, "POST", path, "slot-one", adviceRequest{Entities: ids, Orders: orders}, 200)
		var response adviceResponse
		data, _ := json.Marshal(got)
		if err = json.Unmarshal(data, &response); err != nil {
			t.Fatal(err)
		}
		if response.Player != 1 || response.Tick != view.Tick || len(response.Entities) != len(ids) || response.PlayerCommands == nil || len(response.PlayerCommands) != 0 || len(response.Results) != len(orders) || len(response.Plans) != 0 {
			t.Fatalf("invalid conservative advice: %s", data)
		}
		for i, entity := range response.Entities {
			if entity.ID != ids[i] || entity.Commands == nil || entity.Abilities == nil || entity.Builds == nil || entity.Trains == nil || entity.Research == nil || len(entity.Commands)+len(entity.Abilities)+len(entity.Builds)+len(entity.Trains)+len(entity.Research)+len(entity.Production) != 0 {
				t.Fatalf("selection capabilities leaked: %s", data)
			}
		}
		for i, result := range response.Results {
			if result.Player != 1 || result.Tick != view.Tick || result.Index != int32(i) || result.Sequence != 0 || result.Accepted || result.Code != "not_owner" {
				t.Fatalf("stale selection permitted an order: %s", data)
			}
		}
		for _, key := range []string{"map", "state", "players", "rng", "save", "data", "definition"} {
			if _, exists := got[key]; exists {
				t.Fatal("private payload exposed", key)
			}
		}
	}
	request(t, h, "POST", path, "slot-one", adviceRequest{Entities: []sim.ID{1, 1}}, 400)
	request(t, h, "POST", path, "slot-one", adviceRequest{Entities: []sim.ID{0}}, 400)
	request(t, h, "POST", path, "invalid-slot", adviceRequest{Entities: []sim.ID{built}}, 401)
	after := m.call(ctx, matchRequest{kind: "save"})
	if before.err != nil || after.err != nil || string(before.data) != string(after.data) {
		t.Fatal("stale advice mutated live state", before.err, after.err)
	}
}
