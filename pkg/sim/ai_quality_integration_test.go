package sim

import (
	"frontlinecommand/pkg/content"
	"reflect"
	"testing"
)

func aiQualityIntegrationAlliedEscort(t *testing.T, air bool) (*Engine, ID, ID) {
	t.Helper()
	cfg := botMatrixConfig(4, true)
	for i := range cfg.Players {
		cfg.Players[i].AI = ""
	}
	e, err := New(content.MustBase(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	e.state.Countdown = 0
	typ, targetType := "US.rifle", "SY.hauler"
	if air {
		typ, targetType = "US.fighter", "SY.scout_drone"
	}
	follower := e.spawn(typ, 1, Vec{X: 12000, Y: 12000}, true, 0)
	target := e.spawn(targetType, 3, Vec{X: 17000, Y: 12000}, true, 0)
	if air {
		follower.Home = e.spawn("US.airfield", 1, Vec{X: 12000, Y: 20000}, true, 0).ID
		target.Home = e.spawn("SY.workshop_air", 3, Vec{X: 17000, Y: 20000}, true, 0).ID
		follower.Landed, target.Landed = false, false
	}
	e.recalculate()
	e.updateFog()
	issue(t, e, 1, Order{Kind: "escort", Entities: []ID{follower.ID}, Target: target.ID})
	e.player(1).AI = "normal"
	view, _ := e.PlayerView(1)
	observed := false
	for _, v := range view.Entities {
		if v.ID == target.ID {
			observed = true
			if v.Private != nil || !aiActiveAlly(e.player(1), view, v.Owner) {
				t.Fatal("escort fixture must expose only the active ally's public state")
			}
		}
	}
	if !observed || len(follower.Orders) != 1 || follower.Orders[0].Kind != "escort" {
		t.Fatal("ordinary allied escort was not established", e.state.Results, follower.Orders)
	}
	return e, follower.ID, target.ID
}

func TestAIQualityIntegrationAlliedEscortPreservesPublicScriptWork(t *testing.T) {
	for _, air := range []bool{false, true} {
		name := "ground"
		if air {
			name = "air"
		}
		t.Run(name, func(t *testing.T) {
			e, follower, _ := aiQualityIntegrationAlliedEscort(t, air)
			if orders := e.aiEscortOrders(e.player(1), aiOwnView(e, 1)); len(orders) != 0 {
				t.Fatal("public allied escort was mistaken for an orphan", orders)
			}
			saved, err := e.Save()
			if err != nil {
				t.Fatal(err)
			}
			twin, err := Restore(e.catalog, saved)
			if err != nil {
				t.Fatal(err)
			}
			for range 85 {
				e.Advance()
				twin.Advance()
			}
			if e.Hash() != twin.Hash() || len(e.entity(follower).Orders) != 1 || e.entity(follower).Orders[0].Kind != "escort" {
				t.Fatal("allied script work or restore continuation changed")
			}
		})
	}
}

func TestAIQualityIntegrationAlliedEscortIgnoresPrivateTasks(t *testing.T) {
	for _, air := range []bool{false, true} {
		a, _, target := aiQualityIntegrationAlliedEscort(t, air)
		saved, err := a.Save()
		if err != nil {
			t.Fatal(err)
		}
		b, err := Restore(a.catalog, saved)
		if err != nil {
			t.Fatal(err)
		}
		b.player(3).Credits += 1230000
		b.entity(target).Orders = []Order{{Kind: "move", Position: Vec{X: 30000, Y: 30000}}, {Kind: "move", Position: Vec{X: 32000, Y: 32000}}}
		av, _ := a.PlayerView(1)
		bv, _ := b.PlayerView(1)
		if !reflect.DeepEqual(av, bv) {
			t.Fatal("private allied-task control changed the authorized view")
		}
		left := a.aiEscortOrders(a.player(1), aiOwnView(a, 1))
		right := b.aiEscortOrders(b.player(1), aiOwnView(b, 1))
		if !reflect.DeepEqual(left, right) || len(left) != 0 {
			t.Fatal("allied private queue/bank changed escort preservation", left, right)
		}
	}
}
