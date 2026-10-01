package viewproto

import (
	"frontlinecommand/pkg/sim"
	"frontlinecommand/pkg/content"
	"encoding/json"
	"os"
	"path/filepath"
	"fmt"
	pb "frontlinecommand/protocol"
	"reflect"
	"testing"

	"google.golang.org/protobuf/proto"
)

// This test requires root's matching generated Go binding and converter. A sim
// JSON-only task cannot pass it or establish availability to a human client.
func TestMissionPublicTaskSnapshotWireRoundTrip(t *testing.T) {
	view := sim.View{Player:1, Mission:&sim.MissionView{ID:"twin-outposts", Version:"1", PublicTasks:[]sim.MissionTaskView{{ID:"central-reconnection-hold", Objective:"reconnection", Kind:"hold_region", Marker:"central-connection", Region:"central-connection", Team:1, Min:sim.Vec{X:56000,Y:61000}, Max:sim.Vec{X:73999,Y:73999}}}}, KnownFields:[]sim.FieldObservation{{ID:7,Position:sim.Vec{X:500,Y:500},Remaining:123,Seen:11}}}
	encoded, err := proto.Marshal(Snapshot(view))
	if err != nil { t.Fatal(err) }
	var decoded pb.PlayerSnapshot
	if err = proto.Unmarshal(encoded, &decoded); err != nil { t.Fatal(err) }
	if len(decoded.GetMission().GetPublicTasks()) != 1 { t.Fatal("team-public task lost on native wire") }
	task := decoded.GetMission().GetPublicTasks()[0]
	if task.GetObjective() != "reconnection" || task.GetMarker() != "central-connection" || task.GetRegion() != "central-connection" || task.GetTeam() != 1 || task.GetMin().GetX() != 56000 || task.GetMax().GetY() != 73999 { t.Fatal("public binding/geometry changed", task) }
	if !reflect.DeepEqual(wire(t, Snapshot(view)), wire(t, jsonSnapshot(t, view))) { t.Fatal("native task conversion differs from authorized JSON view") }
	if len(decoded.GetKnownFields()) != 1 || decoded.GetKnownFields()[0].GetRemaining() != 123 { t.Fatal("known-field contract lost") }
}

// Root can retain these real authorized native snapshots for the generated TS
// decode/delta test. An absent evidence directory never substitutes synthetic
// wire bytes for that cross-language acceptance gate.
func TestCanonicalMissionPublicTaskAuthorizedNativeSnapshots(t *testing.T) {
	mapBytes, err := os.ReadFile("../../content/maps/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	m, err := content.DecodeMap(mapBytes)
	if err != nil { t.Fatal(err) }
	missionBytes, err := os.ReadFile("../../content/missions/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	for _, ally := range []string{"human", "normal"} {
		t.Run(ally, func(t *testing.T) {
			definition, err := content.DecodeMission(missionBytes, content.MustBase(), m)
			if err != nil { t.Fatal(err) }
			if ally == "normal" { definition.Players[1].Controller, definition.Players[1].AI = "ai", "normal" }
			engine, err := sim.NewMission(content.MustBase(), m, definition, "normal", 19027)
			if err != nil { t.Fatal(err) }
			for i := 0; i < 100; i++ { engine.Advance() }
			for _, owner := range []sim.PlayerID{1,2} {
				view, ok := engine.PlayerView(owner)
				if !ok || view.Mission == nil || len(view.Mission.PublicTasks) != 1 { t.Fatal("actual authorized public task missing",owner) }
				native := Snapshot(view)
				if len(native.GetMission().GetPublicTasks()) != 1 || len(native.GetKnownFields()) != len(view.KnownFields) || !reflect.DeepEqual(wire(t,native),wire(t,jsonSnapshot(t,view))) { t.Fatal("actual native task/known fields differ from authorized view",owner) }
				for _, actor := range native.GetEntities() { if actor.GetOwner() != uint32(owner) && actor.GetPrivate() != nil { t.Fatal("native task widened owner-private state",owner,actor.GetId()) } }
				if directory := os.Getenv("FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE"); directory != "" {
					if !filepath.IsAbs(directory) { t.Fatal("explicit absolute native wire evidence namespace required") }
					if err = os.MkdirAll(directory,0755); err != nil { t.Fatal(err) }
					name := fmt.Sprintf("%s-%d.player-snapshot",ally,owner)
					if err = os.WriteFile(filepath.Join(directory,name+".pb"),wire(t,native),0644); err != nil { t.Fatal(err) }
					data, err := json.MarshalIndent(view,"","  ")
					if err != nil { t.Fatal(err) }
					if err = os.WriteFile(filepath.Join(directory,name+".view.json"),append(data,'\n'),0644); err != nil { t.Fatal(err) }
				}
			}
		})
	}
}
