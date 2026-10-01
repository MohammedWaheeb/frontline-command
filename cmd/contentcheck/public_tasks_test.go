package main

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"testing"
)

func TestPublicTaskRequiresActuallyPresentedBinding(t *testing.T) {
	mission := content.Mission{ID:"m", Version:"1", PublicTasks:[]content.MissionPublicTask{{ID:"task", Objective:"hold", Marker:"shown", Region:"public-region"}}}
	for _, bad := range []string{"none", "mission", "version", "marker", "goal", "region", "duplicate"} {
		t.Run(bad, func(t *testing.T) {
			var p publicTaskPresentation
			if err := json.Unmarshal([]byte(`{"mission_id":"m","mission_version":"1","markers":[{"id":"shown","objective":"hold","region":"public-region"}]}`), &p); err != nil { t.Fatal(err) }
			switch bad {
			case "mission": p.MissionID = "foreign"
			case "version": p.MissionVersion = "foreign"
			case "marker": p.Markers[0].ID = "unpublished"
			case "goal": p.Markers[0].Objective = "other"
			case "region": p.Markers[0].Region = "hidden"
			case "duplicate": p.Markers = append(p.Markers, p.Markers[0])
			}
			err := validatePublicTaskPresentation(mission, p)
			if (err == nil) != (bad == "none") { t.Fatalf("case %s error=%v", bad, err) }
		})
	}
}
