package sim

import (
	"bytes"
	"encoding/json"
	"fmt"
	"frontlinecommand/pkg/content"
	"testing"
)

func originFixture(t *testing.T) *Engine {
	t.Helper()
	definition := longMission()
	definition.Initial = []content.MissionSpawn{
		{Tag: "home-haulers", Type: "US.hauler", Owner: 1, Position: Vec{X: 18000, Y: 8000}, Count: 1},
		{Tag: "marked-trucks", Type: "US.hauler", Owner: 1, Position: Vec{X: 18000, Y: 14000}, Count: 2},
		{Tag: "marked-trucks", Type: "US.hauler", Owner: 1, Position: Vec{X: 24000, Y: 14000}, Count: 1},
		{Tag: "marked-trucks", Type: "US.rifle", Owner: 1, Position: Vec{X: 24000, Y: 20000}, Count: 1},
		{Tag: "secret-opponent-group", Type: "IR.rifle", Owner: 2, Position: Vec{X: 45000, Y: 45000}, Count: 1},
	}
	return extendedMission(t, definition, fixtureMap())
}
func originEntity(t *testing.T, view View, id ID) *EntityView {
	t.Helper()
	for i := range view.Entities {
		if view.Entities[i].ID == id {
			return &view.Entities[i]
		}
	}
	return nil
}
func TestMissionOriginCanonicalGroupsAndReadOnlySave(t *testing.T) {
	e := originFixture(t)
	before, err := e.Save()
	if err != nil {
		t.Fatal(err)
	}
	hash := e.Hash()
	for repetition := 0; repetition < 3; repetition++ {
		view, _ := e.PlayerView(1)
		marked := 0
		for _, actor := range e.state.Entities {
			item := originEntity(t, view, actor.ID)
			if actor.Owner != 1 {
				if item != nil && item.Private != nil {
					t.Fatal("enemy private data")
				}
				continue
			}
			expected := ""
			switch {
			case actor.Tag == "home-haulers":
				expected = "initial:0"
			case actor.Tag == "marked-trucks" && actor.Type == "US.hauler":
				expected = "initial:1"
				marked++
			case actor.Tag == "marked-trucks" && actor.Type == "US.rifle":
				expected = "initial:3"
			}
			if item == nil || item.Private == nil || item.Private.MissionOrigin != expected {
				t.Fatalf("actor %d origin %+v, want %q", actor.ID, item, expected)
			}
		}
		if marked != 3 {
			t.Fatalf("duplicate definition group actors %d", marked)
		}
		raw, _ := json.Marshal(view)
		for _, tag := range []string{"home-haulers", "marked-trucks", "secret-opponent-group"} {
			if bytes.Contains(raw, []byte(tag)) {
				t.Fatalf("raw mission tag leaked: %s", tag)
			}
		}
	}
	after, _ := e.Save()
	if !bytes.Equal(before, after) || e.Hash() != hash {
		t.Fatal("view changed authoritative state/save")
	}
	restored, err := Restore(e.catalog, before)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := e.PlayerView(1)
	b, _ := restored.PlayerView(1)
	aj, _ := json.Marshal(a)
	bj, _ := json.Marshal(b)
	if !bytes.Equal(aj, bj) || restored.Hash() != hash {
		t.Fatal("origin/save restore mismatch")
	}
}
func TestMissionOriginOwnershipFogAndNoReplacementIdentity(t *testing.T) {
	e := originFixture(t)
	original := tagged(e, "home-haulers")
	enemy := tagged(e, "secret-opponent-group")
	view, _ := e.PlayerView(1)
	if originEntity(t, view, enemy.ID) != nil {
		t.Fatal("unseen enemy emitted")
	}
	enemy.Position = Vec{X: 19000, Y: 11000}
	e.updateFog()
	view, _ = e.PlayerView(1)
	if item := originEntity(t, view, enemy.ID); item == nil || item.Private != nil {
		t.Fatal("visible enemy gained private group")
	}
	e.player(2).Team = e.player(1).Team
	e.updateFog()
	ally, _ := e.PlayerView(2)
	if item := originEntity(t, ally, original.ID); item == nil || item.Private != nil {
		t.Fatal("allied original gained private group")
	}
	// Model completed capture/recovery: current ownership, not declared ownership,
	// decides who may see the existing actor's original group identity.
	original.Owner = 2
	e.recalculate()
	e.updateFog()
	owned, _ := e.PlayerView(2)
	if item := originEntity(t, owned, original.ID); item == nil || item.Private == nil || item.Private.MissionOrigin != "initial:0" {
		t.Fatal("ownership transfer lost original group")
	}
	former, _ := e.PlayerView(1)
	if item := originEntity(t, former, original.ID); item == nil || item.Private != nil {
		t.Fatal("former owner retained private origin")
	}
	// Fixture actors model paid replacements and later authored reinforcement.
	// A later spawn with the same tag still must not pretend it was initial.
	e.state.Tick = 1
	replacement := e.spawn("US.hauler", 1, Vec{X: 30000, Y: 8000}, true, 800000)
	if !e.spawnScenario(content.MissionSpawn{Tag: "marked-trucks", Type: "US.hauler", Owner: 1, Position: Vec{X: 30000, Y: 14000}, Count: 1}) {
		t.Fatal("reinforcement fixture failed")
	}
	e.updateFog()
	view, _ = e.PlayerView(1)
	if item := originEntity(t, view, replacement.ID); item == nil || item.Private.MissionOrigin != "" {
		t.Fatal("replacement gained mission origin")
	}
	for _, actor := range e.state.Entities {
		if actor.Created > 0 {
			if item := originEntity(t, view, actor.ID); item != nil && item.Private != nil && item.Private.MissionOrigin != "" {
				t.Fatal("later reinforcement gained initial identity")
			}
		}
	}
	enemy.HP = 0
	view, _ = e.PlayerView(2)
	if originEntity(t, view, enemy.ID) != nil {
		t.Fatal("dead origin actor emitted")
	}
	e.player(2).Team = 2
	original.Position = Vec{X: 55000, Y: 50000}
	e.updateFog()
	view, _ = e.PlayerView(1)
	if originEntity(t, view, original.ID) != nil {
		t.Fatal("fogged transferred original emitted")
	}
}
func TestMissionOriginBoundedCanonicalKey(t *testing.T) {
	e := fixture(t)
	if len(e.initialMissionOrigins()) != 0 {
		t.Fatal("skirmish has mission groups")
	}
	def := content.Mission{}
	for i := 0; i < 256; i++ {
		def.Initial = append(def.Initial, content.MissionSpawn{Tag: fmt.Sprintf("group-%d", i), Type: "US.rifle"})
	}
	e.state.Mission = &MissionState{Definition: def}
	origins := e.initialMissionOrigins()
	if got := origins[missionOriginKey{"group-255", "US.rifle"}]; got != "initial:255" || len(got) != 11 {
		t.Fatal("maximum bounded origin", got)
	}
	for _, key := range origins {
		if len(key) > 11 {
			t.Fatal("unbounded key", key)
		}
	}
}
