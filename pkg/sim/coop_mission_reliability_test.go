package sim

import (
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func coopReliabilityMission(t *testing.T, id string) *Engine {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", id+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var header struct {
		MapID string `json:"map_id"`
	}
	if err = json.Unmarshal(data, &header); err != nil {
		t.Fatal(err)
	}
	mapData, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", header.MapID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	gameMap, err := content.DecodeMap(mapData)
	if err != nil {
		t.Fatal(err)
	}
	catalog := content.MustBase()
	definition, err := content.DecodeMission(data, catalog, gameMap)
	if err != nil {
		t.Fatal(err)
	}
	e, err := NewMission(catalog, gameMap, definition, "normal", 19030)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func coopReliabilityView(t *testing.T, e *Engine, owner PlayerID) View {
	t.Helper()
	view, ok := e.PlayerView(owner)
	if !ok {
		t.Fatalf("missing public view for commander %d", owner)
	}
	return view
}

func coopReliabilityOwned(t *testing.T, view View, typ string) EntityView {
	t.Helper()
	for _, v := range view.Entities {
		if v.Owner == view.Player && v.Type == typ && v.Health > 0 && v.Complete {
			return v
		}
	}
	t.Fatalf("owner %d has no living completed %s in its public view", view.Player, typ)
	return EntityView{}
}

func coopReliabilityRestore(t *testing.T, e *Engine) *Engine {
	t.Helper()
	data, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	restored, err := Restore(e.catalog, data)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Hash() != e.Hash() {
		t.Fatal("co-op save/restore changed authoritative state")
	}
	return restored
}

func coopReliabilityCount(t *testing.T, e *Engine, typ string, owner uint32, want uint32) {
	t.Helper()
	q := content.MissionCondition{Kind: "count_type", Type: typ, Owner: owner, Count: want, Compare: "at_most"}
	done, count := e.missionCondition(q, &ConditionProgress{})
	if !done || count != want {
		t.Errorf("count_type %s owner %d = %d, want exactly %d (condition=%v)", typ, owner, count, want, done)
	}
}

// These four authored reproductions use only public construction, views,
// admitted orders and ticking. They do not edit players, entities or goals.
func TestCoopMissionReliabilitySingleCommanderSurrender(t *testing.T) {
	for _, id := range []string{"twin-outposts", "convoy-union"} {
		for _, loser := range []PlayerID{1, 2} {
			t.Run(fmt.Sprintf("%s/owner-%d", id, loser), func(t *testing.T) {
				e := coopReliabilityMission(t, id)
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				for coopReliabilityView(t, e, loser).Countdown > 0 {
					e.Advance()
				}
				if err = replay.Capture(e, true); err != nil {
					t.Fatal(err)
				}
				if e.Outcome().Finished {
					t.Fatal("authored mission ended during its public start countdown")
				}
				survivor := PlayerID(3) - loser
				loserHQ := coopReliabilityOwned(t, coopReliabilityView(t, e, loser), "hq")
				survivorView := coopReliabilityView(t, e, survivor)
				survivorHQ := coopReliabilityOwned(t, survivorView, "hq")
				var soldier EntityView
				for _, v := range survivorView.Entities {
					if v.Owner == survivor && v.Health > 0 && v.Complete && v.Enabled && strings.HasSuffix(v.Type, ".rifle") {
						soldier = v
						break
					}
				}
				if soldier.ID == 0 {
					t.Fatal("surviving commander has no original rifle for an ordinary Hold order")
				}
				// Submit in reverse player order. Execution must still admit the
				// survivor's Hold whether it runs before or after the surrender.
				for _, owner := range []PlayerID{2, 1} {
					order := Order{Kind: "surrender"}
					if owner == survivor {
						order = Order{Kind: "hold", Entities: []ID{soldier.ID}}
					}
					if err = e.Submit(owner, 1, []Order{order}); err != nil {
						t.Fatal(err)
					}
				}
				pendingRestore := coopReliabilityRestore(t, e)
				e.Advance()
				pendingRestore.Advance()
				if pendingRestore.Hash() != e.Hash() {
					t.Fatal("restored pending surrender/Hold diverged")
				}
				for _, owner := range []PlayerID{loser, survivor} {
					view := coopReliabilityView(t, e, owner)
					if len(view.Results) != 1 || !view.Results[0].Accepted || view.Results[0].Sequence != 1 {
						t.Fatalf("ordinary order for owner %d was not accepted: %+v", owner, view.Results)
					}
					for _, p := range view.Players {
						if (p.ID == loser || p.ID == survivor) && p.Defeated != (p.ID == loser) {
							t.Fatal("individual surrender changed the surviving commander", view.Players)
						}
					}
				}
				wreck := coopReliabilityOwned(t, coopReliabilityView(t, e, loser), "hq")
				if wreck.ID != loserHQ.ID || wreck.Health != loserHQ.Health || wreck.Enabled || wreck.State != "inactive" {
					t.Fatal("surrender did not preserve the original HP-positive inactive owned HQ", wreck)
				}
				remaining := coopReliabilityOwned(t, coopReliabilityView(t, e, survivor), "hq")
				if remaining.ID != survivorHQ.ID || !remaining.Enabled || remaining.Health != survivorHQ.Health {
					t.Fatal("surviving commander lost its independent HQ", remaining)
				}
				failureID := "western-hq-lost"
				if loser == 2 {
					failureID = "eastern-hq-lost"
				}
				view := coopReliabilityView(t, e, survivor)
				found := false
				for _, goal := range view.Mission.Objectives {
					if goal.ID == failureID {
						found = true
						if !goal.Failure || !goal.Complete || goal.Progress != 0 {
							t.Errorf("required commander's HQ failure did not complete: %+v", goal)
						}
					}
				}
				if !found {
					t.Fatal("authored per-owner HQ failure goal missing")
				}
				if out := e.Outcome(); !out.Finished || out.Reason != "mission_failed" || out.Draw || out.WinningTeam != 0 || out.Tick != e.Tick() {
					t.Errorf("single surrendered commander left the co-op scenario running: %+v", out)
				}
				ended := 0
				for _, event := range view.Events {
					if event.Kind == "match_ended" {
						ended++
					}
				}
				if ended != 1 {
					t.Errorf("co-op surrender published %d terminal events, want one", ended)
				}
				// Owner zero remains a wildcard over the other live commanders;
				// the surrendered owner's wreck must not add to that count.
				liveHQs := uint32(2)
				if id == "twin-outposts" {
					liveHQs = 3
				}
				coopReliabilityCount(t, e, "hq", 0, liveHQs)
				coopReliabilityCount(t, e, "hq", uint32(loser), 0)
				coopReliabilityCount(t, e, "hq", uint32(survivor), 1)
				finalRestore := coopReliabilityRestore(t, e)
				if e.Outcome().Finished {
					frozen := e.Hash()
					e.Advance()
					finalRestore.Advance()
					if e.Hash() != frozen || finalRestore.Hash() != frozen {
						t.Fatal("terminal co-op result changed after final save/advance")
					}
				}
				if err = replay.Capture(e, false); err != nil {
					t.Fatal(err)
				}
				encoded, err := replay.Encode()
				if err != nil {
					t.Fatal(err)
				}
				decoded, err := DecodeReplay(encoded)
				if err != nil {
					t.Fatal(err)
				}
				for _, useCheckpoint := range []bool{false, true} {
					copy := *decoded
					if !useCheckpoint {
						copy.Checkpoints = nil
					}
					played, err := copy.Seek(e.catalog, e.Tick())
					if err != nil || played.Hash() != e.Hash() {
						t.Fatalf("co-op replay (checkpoint=%v) diverged: %v", useCheckpoint, err)
					}
				}
			})
		}
	}
}

// Switching off the living commander's HQ and both power plants is an ordinary
// admitted control. Neither disabled power nor low power means surrender.
func TestCoopMissionReliabilityPoweredOffCommanderHQ(t *testing.T) {
	for _, id := range []string{"twin-outposts", "convoy-union"} {
		for _, owner := range []PlayerID{1, 2} {
			t.Run(fmt.Sprintf("%s/owner-%d", id, owner), func(t *testing.T) {
				e := coopReliabilityMission(t, id)
				for coopReliabilityView(t, e, owner).Countdown > 0 {
					e.Advance()
				}
				view := coopReliabilityView(t, e, owner)
				orders := []Order{}
				for _, v := range view.Entities {
					if v.Owner == owner && (v.Type == "hq" || v.Type == "power") {
						orders = append(orders, Order{Kind: "power", Entities: []ID{v.ID}, Index: 0})
					}
				}
				if len(orders) != 3 {
					t.Fatal("authored commander must begin with one HQ and two power plants")
				}
				if err := e.Submit(owner, 1, orders); err != nil {
					t.Fatal(err)
				}
				e.Advance()
				view = coopReliabilityView(t, e, owner)
				if len(view.Results) != len(orders) {
					t.Fatal("power controls did not execute", view.Results)
				}
				for _, result := range view.Results {
					if !result.Accepted {
						t.Fatal("ordinary power control rejected", result)
					}
				}
				if view.Economy.PowerCapacity >= view.Economy.PowerDemand {
					t.Fatal("power control did not produce a meaningful low-power survivor", view.Economy)
				}
				hq := coopReliabilityOwned(t, view, "hq")
				if hq.Enabled || view.Outcome.Finished {
					t.Fatal("powered-off living HQ was treated as a surrendered commander", hq, view.Outcome)
				}
				for _, p := range view.Players {
					if (p.ID == 1 || p.ID == 2) && p.Defeated {
						t.Fatal("power control eliminated a human commander", p)
					}
				}
				for _, goal := range view.Mission.Objectives {
					if goal.Failure && goal.Complete {
						t.Fatal("disabled living HQ completed a failure condition", goal)
					}
				}
				wantAll := uint32(3)
				if id == "twin-outposts" {
					wantAll = 4
				}
				coopReliabilityCount(t, e, "hq", uint32(owner), 1)
				coopReliabilityCount(t, e, "hq", 0, wantAll)
				coopReliabilityRestore(t, e)
			})
		}
	}
}

// The following isolated boundary fixtures deliberately alter one property or
// use the legal capture transfer helper. They are not authored winning routes.
func TestCoopMissionReliabilityCountTypeOwnership(t *testing.T) {
	for _, name := range []string{"active-commanders", "temporarily-disabled-hq", "unfinished-hq", "nonliving-hq", "captured-producer-conversion"} {
		t.Run(name, func(t *testing.T) {
			e := coopReliabilityMission(t, "twin-outposts")
			hq := e.entity(coopReliabilityOwned(t, coopReliabilityView(t, e, 1), "hq").ID)
			wantOwner, wantAll := uint32(1), uint32(4)
			switch name {
			case "temporarily-disabled-hq":
				hq.DisabledUntil = e.Tick() + 200
			case "unfinished-hq":
				hq.Complete = false
				wantOwner, wantAll = 0, 3
			case "nonliving-hq":
				hq.HP = 0
				wantOwner, wantAll = 0, 3
			case "captured-producer-conversion":
				oldType := content.AirProducer("IR")
				newType := content.AirProducer("US")
				producer := e.entity(coopReliabilityOwned(t, coopReliabilityView(t, e, 3), oldType).ID)
				producer.HP = producer.MaxHP / 5
				if !e.captureBuilding(1, producer) || producer.Owner != 1 || producer.Type != newType || producer.DisabledUntil <= e.Tick() {
					t.Fatal("legal hostile air producer capture did not enter conversion")
				}
				coopReliabilityCount(t, e, newType, 1, 2)
				coopReliabilityCount(t, e, newType, 2, 0)
				coopReliabilityCount(t, e, newType, 0, 2)
				coopReliabilityCount(t, e, oldType, 3, 0)
				coopReliabilityCount(t, e, oldType, 0, 0)
				if !e.captureBuilding(3, producer) || producer.Owner != 3 || producer.Type != oldType {
					t.Fatal("active enemy commander could not recapture its producer")
				}
				coopReliabilityCount(t, e, newType, 1, 1)
				coopReliabilityCount(t, e, newType, 0, 1)
				coopReliabilityCount(t, e, oldType, 3, 1)
				coopReliabilityCount(t, e, oldType, 0, 1)
			}
			coopReliabilityCount(t, e, "hq", 1, wantOwner)
			coopReliabilityCount(t, e, "hq", 2, 1)
			coopReliabilityCount(t, e, "hq", 0, wantAll)
		})
	}
}
