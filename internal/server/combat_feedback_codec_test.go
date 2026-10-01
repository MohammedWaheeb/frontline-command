package server

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"os"
	"path/filepath"
	"testing"
)

func TestCombatFeedbackCodecPresenceAndLegacy(t *testing.T) {
	view := sim.View{Events: []sim.Event{{ID: 1, Kind: "weapon_fired", Combat: &sim.CombatFeedback{Weapon: "RIF"}}, {ID: 2, Kind: "impact", Entity: 9, Combat: &sim.CombatFeedback{Weapon: "RIF", Outcome: "hit", TargetArmor: "infantry", CoverMitigated: true}}, {ID: 3, Kind: "impact", Combat: &sim.CombatFeedback{Weapon: "RIF"}}, {ID: 4, Kind: "missile_intercepted"}}}
	first, err := snapshot(view)
	if err != nil {
		t.Fatal(err)
	}
	wire, err := proto.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	second := new(pb.PlayerSnapshot)
	if err = proto.Unmarshal(wire, second); err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(first, second) {
		t.Fatal("combat metadata changed across binary codec")
	}
	if c := second.Events[1].GetCombat(); c == nil || c.Weapon != "RIF" || c.Outcome != "hit" || c.TargetArmor != "infantry" || !c.CoverMitigated {
		t.Fatal("known hit lost metadata", c)
	}
	if c := second.Events[2].GetCombat(); c == nil || c.Outcome != "" || c.TargetArmor != "" || c.CoverMitigated {
		t.Fatal("unknown became a result", c)
	}
	if second.Events[3].Combat != nil {
		t.Fatal("unrelated event acquired combat metadata")
	}
	legacy := new(pb.Event)
	if err = proto.Unmarshal([]byte{8, 7}, legacy); err != nil || legacy.Id != 7 || legacy.Combat != nil {
		t.Fatal("legacy absence changed", legacy, err)
	}
}

func TestCombatFeedbackCodecActualAuthorizedOutputs(t *testing.T) {
	input := os.Getenv("FRONTLINE_COMBAT_INPUT")
	if input == "" {
		t.Skip("actual isolated Go output required")
	}
	records := map[string]string{}
	paths, err := filepath.Glob(filepath.Join(input, "privacy-*.json"))
	if err != nil || len(paths) != 6 {
		t.Fatal("six actual privacy outputs required", err)
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var event sim.Event
		if err = json.Unmarshal(data, &event); err != nil {
			t.Fatal(err)
		}
		wireView, err := snapshot(sim.View{Player: 1, Events: []sim.Event{event}})
		if err != nil {
			t.Fatal(err)
		}
		wire, err := proto.Marshal(wireView)
		if err != nil {
			t.Fatal(err)
		}
		decoded := new(pb.PlayerSnapshot)
		if err = proto.Unmarshal(wire, decoded); err != nil {
			t.Fatal(err)
		}
		public := decoded.Events[0]
		visible := filepath.Base(path) == "privacy-visible.json"
		if public.Combat == nil || public.Combat.Weapon == "" {
			t.Fatal("actual weapon missing")
		}
		if !visible && (public.Entity != 0 || public.Combat.Outcome != "" || public.Combat.TargetArmor != "" || public.Combat.CoverMitigated) {
			t.Fatal("codec revealed private hit", path, public)
		}
		if visible && (!public.Combat.CoverMitigated || public.Combat.Outcome != "hit") {
			t.Fatal("authorized hit lost")
		}
		sum := sha256.Sum256(wire)
		records[filepath.Base(path)] = hex.EncodeToString(sum[:])
	}
	data, err := os.ReadFile(filepath.Join(input, "ordinary.save.json"))
	if err != nil {
		t.Fatal(err)
	}
	engine, err := sim.Restore(content.MustBase(), data)
	if err != nil {
		t.Fatal(err)
	}
	for _, player := range []sim.PlayerID{1, 2} {
		view, ok := engine.PlayerView(player)
		if !ok {
			t.Fatal("player")
		}
		p, err := snapshot(view)
		if err != nil {
			t.Fatal(err)
		}
		wire, err := proto.Marshal(p)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(wire)
		name := "ordinary-player1"
		if player == 2 {
			name = "ordinary-player2"
		}
		records[name] = hex.EncodeToString(sum[:])
	}
	if output := os.Getenv("FRONTLINE_COMBAT_CODEC_OUTPUT"); output != "" {
		data, err := json.MarshalIndent(records, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(output, data, 0644); err != nil {
			t.Fatal(err)
		}
	}
}
