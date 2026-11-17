package content

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Spawn.Team is an alliance label for at most four players (Map.Validate caps
// spawns at four and Mission.Validate caps player teams at four). Zero stays
// valid: the simulation treats an unset team as the player's own.
func TestSpawnTeamValidation(t *testing.T) {
	for _, team := range []uint32{0, 1, 2, 3, 4} {
		m := objectMap()
		m.Spawns[0].Team = team
		if err := m.Validate(); err != nil {
			t.Fatalf("team %d rejected: %v", team, err)
		}
	}
	for _, team := range []uint32{5, 6, 1 << 20} {
		m := objectMap()
		m.Spawns[0].Team = team
		if err := m.Validate(); err == nil {
			t.Fatalf("team %d accepted", team)
		}
	}
}

func loadAuthored(t *testing.T, mapID, missionID string) (Map, Mission) {
	t.Helper()
	mapData, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", mapID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	gameMap, err := DecodeMap(mapData)
	if err != nil {
		t.Fatal(err)
	}
	missionData, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", missionID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	mission, err := DecodeMission(missionData, MustBase(), gameMap)
	if err != nil {
		t.Fatal(err)
	}
	return gameMap, mission
}

// Twin Outposts briefing promises warned detachments on the northwestern and
// northeastern roads: the SY pressure waves enter from the east/northeast
// against base-two, so the IR north-pressure waves must genuinely enter from
// the northwest against base-one (regression: they were byte-identical east
// copies with "eastern road" warnings). Map spawn teams must also match the
// mission player teams so the layout is not a 3v1 in skirmish.
func TestTwinOutpostsNorthernPressure(t *testing.T) {
	gameMap, mission := loadAuthored(t, "twin-outposts", "twin-outposts")
	if len(gameMap.Spawns) != len(mission.Players) {
		t.Fatalf("spawn/player count mismatch: %d vs %d", len(gameMap.Spawns), len(mission.Players))
	}
	for i, player := range mission.Players {
		if gameMap.Spawns[i].Team != player.Team {
			t.Fatalf("spawn %d team %d, mission player %d team %d", i, gameMap.Spawns[i].Team, player.ID, player.Team)
		}
	}
	eastSpawns := map[Point]bool{}
	for _, trigger := range mission.Triggers {
		if strings.HasPrefix(trigger.ID, "pressure-") {
			for _, action := range trigger.Actions {
				if action.Kind == "spawn" && action.Spawn != nil {
					eastSpawns[action.Spawn.Position] = true
				}
			}
		}
	}
	found := 0
	for _, trigger := range mission.Triggers {
		if !strings.HasPrefix(trigger.ID, "north-pressure") {
			continue
		}
		for _, action := range trigger.Actions {
			switch action.Kind {
			case "spawn":
				found++
				spawn := action.Spawn
				if spawn.Owner != 3 {
					t.Fatalf("%s spawn owner %d, want IR player 3", trigger.ID, spawn.Owner)
				}
				if spawn.Position.X >= gameMap.Width*500 || spawn.Position.Y >= gameMap.Height*500 {
					t.Fatalf("%s spawn %v is not in the northwestern half", trigger.ID, spawn.Position)
				}
				if eastSpawns[spawn.Position] {
					t.Fatalf("%s spawn %v copies an eastern pressure spawn", trigger.ID, spawn.Position)
				}
				if tile := gameMap.TileAt(spawn.Position); !tile.Passable() {
					t.Fatalf("%s spawn %v on impassable %s", trigger.ID, spawn.Position, tile.Terrain)
				}
			case "attack_region":
				if action.Owner != 3 || action.Region != "base-one" {
					t.Fatalf("%s attacks %s for owner %d, want base-one for 3", trigger.ID, action.Region, action.Owner)
				}
			case "warning":
				text := strings.ToLower(action.Text)
				if !strings.Contains(text, "northwest") || strings.Contains(text, "eastern") {
					t.Fatalf("%s warning %q does not name the northwest approach", trigger.ID, action.Text)
				}
			}
		}
	}
	if found == 0 {
		t.Fatal("no north-pressure spawns found")
	}
}

// Bug-hunt P3: a map with zero authored fields is valid by design. The
// simulation's shipment economy creates a replenishing field at the shipment
// site once every field is empty (including when there are none), so income
// is delayed, not absent. Lock that contract in.
func TestZeroFieldMapValidatesForShipmentEconomy(t *testing.T) {
	m := objectMap()
	if len(m.Fields) != 0 {
		t.Fatal("fixture unexpectedly authors fields")
	}
	if err := m.Validate(); err != nil {
		t.Fatal("zero-field shipment map rejected:", err)
	}
}

// Bug-hunt P3: region reachability was judged by the center tile only, so a
// region whose center sits on impassable decoration was rejected even though
// units can enter it. Any reachable tile inside the region satisfies the
// objective-area check; a fully sealed region still fails.
func TestRegionReachabilityUsesAnyTile(t *testing.T) {
	m := objectMap()
	m.Regions = []Region{{ID: "objective", Min: Point{15000, 15000}, Max: Point{17000, 17000}}}
	m.Tiles[16*32+16].Terrain = "cliff" // the region's center tile
	if err := m.Validate(); err != nil {
		t.Fatal("region with blocked center but reachable tiles rejected:", err)
	}
	sealed := objectMap()
	sealed.Shipment = Point{8000, 24000}
	for i := 0; i < 32; i++ {
		sealed.Tiles[i*32+20].Terrain = "cliff"
		sealed.Tiles[20*32+i].Terrain = "cliff"
	}
	sealed.Regions = []Region{{ID: "sealed", Min: Point{25000, 25000}, Max: Point{28000, 28000}}}
	if err := sealed.Validate(); err == nil {
		t.Fatal("fully sealed region accepted")
	}
}

// Convoy Union pressure columns all spawn on the eastern/northeastern side of
// its map, so no warning may send players to a northwestern pass.
func TestConvoyUnionWarningDirections(t *testing.T) {
	gameMap, mission := loadAuthored(t, "convoy-union", "convoy-union")
	for _, trigger := range mission.Triggers {
		eastern := false
		for _, action := range trigger.Actions {
			if action.Kind == "spawn" && action.Spawn != nil && action.Spawn.Position.X >= gameMap.Width*500 {
				eastern = true
			}
		}
		if !eastern {
			continue
		}
		for _, action := range trigger.Actions {
			if action.Kind == "warning" && strings.Contains(strings.ToLower(action.Text), "northwest") {
				t.Fatalf("%s spawns east but warns %q", trigger.ID, action.Text)
			}
		}
	}
	// The matched warning triggers carry no spawns; check them by column pair.
	for _, trigger := range mission.Triggers {
		if trigger.ID != "pressure-warning-2" && trigger.ID != "pressure-warning-4" {
			continue
		}
		for _, action := range trigger.Actions {
			if action.Kind == "warning" && !strings.Contains(strings.ToLower(action.Text), "northeastern") {
				t.Fatalf("%s warning %q does not name the northeastern pass", trigger.ID, action.Text)
			}
		}
	}
}
