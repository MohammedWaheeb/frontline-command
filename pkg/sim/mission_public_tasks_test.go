package sim

import (
	"frontlinecommand/pkg/content"
	"os"
	"reflect"
	"testing"
)

func TestCanonicalPublicHoldProjectionSharedByHumanAndAI(t *testing.T) {
	for _, ally := range []string{"", "normal"} {
		t.Run("ally-"+ally, func(t *testing.T) {
			mapBytes, err := os.ReadFile("../../content/maps/twin-outposts.json")
			if err != nil { t.Fatal(err) }
			m, err := content.DecodeMap(mapBytes)
			if err != nil { t.Fatal(err) }
			missionBytes, err := os.ReadFile("../../content/missions/twin-outposts.json")
			if err != nil { t.Fatal(err) }
			definition, err := content.DecodeMission(missionBytes, content.MustBase(), m)
			if err != nil { t.Fatal(err) }
			if ally != "" { definition.Players[1].Controller, definition.Players[1].AI = "ai", ally }
			e, err := NewMission(content.MustBase(), m, definition, "normal", 19027)
			if err != nil { t.Fatal(err) }
			one, _ := e.PlayerView(1); two, _ := e.PlayerView(2)
			want := []MissionTaskView{{ID:"central-reconnection-hold",Objective:"reconnection",Kind:"hold_region",Marker:"central-connection",Region:"central-connection",Team:1,Min:Vec{X:56000,Y:61000},Max:Vec{X:73999,Y:73999}}}
			if !reflect.DeepEqual(one.Mission.PublicTasks, want) || !reflect.DeepEqual(two.Mission.PublicTasks, want) { t.Fatal("human/ally explicit public binding mismatch") }
			for _, owner := range []PlayerID{3,4} { view, ok := e.PlayerView(owner); if !ok || len(view.Mission.PublicTasks) != 0 { t.Fatal("opponent received an allied task", owner) } }
			before := e.Hash()
			one.Mission.PublicTasks[0].Min.X = 0
			again, _ := e.PlayerView(1)
			if e.Hash() != before || !reflect.DeepEqual(again.Mission.PublicTasks, want) || !reflect.DeepEqual(two.Mission.PublicTasks, want) { t.Fatal("projected task aliased definition, map or another view") }
			for _, actor := range again.Entities { if actor.Owner != 1 && actor.Private != nil { t.Fatal("task projection widened actor private state") } }
			data, err := e.Save()
			if err != nil { t.Fatal(err) }
			restored, err := Restore(e.catalog, data)
			if err != nil || restored.Hash() != before { t.Fatal("public embedded declaration failed Save/Restore", err) }
			view, _ := restored.PlayerView(1)
			if !reflect.DeepEqual(view.Mission.PublicTasks, want) { t.Fatal("public task missing after Restore") }
		})
	}
}
