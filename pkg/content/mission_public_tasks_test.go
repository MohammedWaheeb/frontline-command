package content

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

func publicTaskCanonical(t *testing.T) (Mission, Map) {
	t.Helper()
	mapBytes, err := os.ReadFile("../../content/maps/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	m, err := DecodeMap(mapBytes)
	if err != nil { t.Fatal(err) }
	missionBytes, err := os.ReadFile("../../content/missions/twin-outposts.json")
	if err != nil { t.Fatal(err) }
	v, err := DecodeMission(missionBytes, MustBase(), m)
	if err != nil { t.Fatal(err) }
	if len(v.PublicTasks) != 1 { t.Fatal("canonical public hold declaration missing") }
	return v, m
}

func TestMissionPublicTasksValidateExplicitBinding(t *testing.T) {
	for _, bad := range []string{"none", "duplicate", "empty_id", "long_id", "kind", "goal", "optional", "failure", "at_end", "region", "marker", "foreign_team", "mission_version", "map_version", "limit"} {
		t.Run(bad, func(t *testing.T) {
			v, m := publicTaskCanonical(t)
			switch bad {
			case "duplicate": v.PublicTasks = append(v.PublicTasks, v.PublicTasks[0])
			case "empty_id": v.PublicTasks[0].ID = ""
			case "long_id": v.PublicTasks[0].ID = string(bytes.Repeat([]byte("x"), 81))
			case "kind": v.PublicTasks[0].Kind = "infer_private_goal"
			case "goal": v.PublicTasks[0].Objective = "missing"
			case "optional": v.PublicTasks[0].Objective = "original-hqs"
			case "failure": v.PublicTasks[0].Objective = "western-hq-lost"
			case "at_end": for i := range v.Objectives { if v.Objectives[i].ID == v.PublicTasks[0].Objective { v.Objectives[i].AtEnd = true } }
			case "region": v.PublicTasks[0].Region = "missing"
			case "marker": v.PublicTasks[0].Marker = ""
			case "foreign_team": v.PublicTasks[0].Team = 2
			case "mission_version": v.PublicTasks[0].MissionVersion = "foreign"
			case "map_version": v.PublicTasks[0].MapVersion = "foreign"
			case "limit": for len(v.PublicTasks) <= 32 { v.PublicTasks = append(v.PublicTasks, v.PublicTasks[0]) }
			}
			err := v.Validate(MustBase(), m)
			if (err == nil) != (bad == "none") { t.Fatalf("case %s error=%v", bad, err) }
		})
	}
}

func TestMissionPublicTasksOmittedForNoTask(t *testing.T) {
	v, m := publicTaskCanonical(t)
	v.PublicTasks = nil
	data, err := json.Marshal(v)
	if err != nil || bytes.Contains(data, []byte("public_tasks")) { t.Fatal("no-task definition serialization changed", err) }
	if _, err = DecodeMission(data, MustBase(), m); err != nil { t.Fatal(err) }
}
