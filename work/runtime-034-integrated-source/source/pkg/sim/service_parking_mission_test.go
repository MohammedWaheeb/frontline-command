package sim

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"os"
	"path/filepath"
	"testing"
)

func TestCandidateAuthoredAirStartsAndReturnService(t *testing.T) {
	for _, id := range []string{"ir-04-hold-the-network", "ir-05-the-second-volley", "ir-06-iron-signal", "us-04-broken-umbrella"} {
		for _, difficulty := range []string{"easy", "normal", "hard"} {
			t.Run(id+"/"+difficulty, func(t *testing.T) {
				bytes, err := os.ReadFile(filepath.Join("..", "..", "content", "missions", id+".json"))
				if err != nil {
					t.Fatal(err)
				}
				var header struct {
					MapID string `json:"map_id"`
				}
				if err = json.Unmarshal(bytes, &header); err != nil {
					t.Fatal(err)
				}
				mb, err := os.ReadFile(filepath.Join("..", "..", "content", "maps", header.MapID+".json"))
				if err != nil {
					t.Fatal(err)
				}
				m, err := content.DecodeMap(mb)
				if err != nil {
					t.Fatal(err)
				}
				c := content.MustBase()
				mission, err := content.DecodeMission(bytes, c, m)
				if err != nil {
					t.Fatal(err)
				}
				e, err := NewMission(c, m, mission, difficulty, 19027)
				if err != nil {
					t.Fatal(err)
				}
				owned := []ID{}
				initial := map[ID]Vec{}
				for _, v := range e.state.Entities {
					if v.Owner == 1 && e.isAircraft(v) {
						if v.Landed || v.Landing != nil {
							t.Fatal("authored airborne start relocated")
						}
						owned = append(owned, v.ID)
						initial[v.ID] = v.Position
					}
				}
				originalCount := len(owned)
				replay, err := NewReplay(e)
				if err != nil {
					t.Fatal(err)
				}
				for e.state.Countdown > 0 {
					e.Advance()
				}
				for _, id := range owned {
					if e.entity(id).Position != initial[id] {
						t.Fatal("countdown relocated airborne actor")
					}
				}
				if len(owned) == 0 {
					var home *Entity
					for _, v := range e.state.Entities {
						if v.Owner == 1 && v.Type == "IR.drone_hub" {
							home = v
							break
						}
					}
					if home == nil {
						t.Fatal("no authored service producer")
					}
					issue(t, e, 1, Order{Kind: "train", Entities: []ID{home.ID}, Type: "IR.strike"})
					for range 2200 {
						for _, v := range e.state.Entities {
							if v.Owner == 1 && e.isAircraft(v) {
								owned = []ID{v.ID}
								break
							}
						}
						if len(owned) > 0 {
							break
						}
						e.Advance()
					}
					if len(owned) != 1 {
						t.Fatal("ordinary paid authored aircraft production did not finish")
					}
					issue(t, e, 1, Order{Kind: "move", Entities: owned, Position: Vec{X: home.Position.X - 7000, Y: home.Position.Y - 7000}})
					ticks(e, 100)
				}
				issue(t, e, 1, Order{Kind: "return", Entities: owned})
				saved, err := e.Save()
				if err != nil {
					t.Fatal(err)
				}
				restored, err := Restore(c, saved)
				if err != nil {
					t.Fatal(err)
				}
				for range 1800 {
					all := true
					for _, id := range owned {
						v := e.entity(id)
						if v == nil || v.HP <= 0 {
							t.Fatal("authored aircraft lost during opening return", id)
						}
						all = all && v.Landed && v.ServiceWork == 0
					}
					if all {
						break
					}
					e.Advance()
					restored.Advance()
				}
				for _, id := range owned {
					v := e.entity(id)
					if !v.Landed || v.ServiceWork != 0 {
						t.Fatalf("authored opening aircraft did not service: %+v", v)
					}
					if !e.serviceParkingClear(v, e.entity(v.Home), v.Position, nil) {
						t.Fatal("authored parking overlap", id)
					}
				}
				if e.Hash() != restored.Hash() {
					t.Fatal("authored opening midflight restore diverged")
				}
				replay.Capture(e, false)
				played, err := replay.Seek(c, e.Tick())
				if err != nil || played.Hash() != e.Hash() {
					t.Fatal("authored opening replay", err)
				}
				t.Logf("%d aircraft (%d authored initial) completed ordinary Return/service at%d, hash%s; not mission-victory proof", len(owned), originalCount, e.Tick(), e.Hash())
			})
		}
	}
}
