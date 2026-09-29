package server

import (
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
	"testing"
)

func TestTacticalOptionalWirePresence(t *testing.T) {
	zero := int32(0)
	view := sim.View{Projectiles: []sim.ProjectileView{{ID: 1, Weapon: "TANK", Splash: 0, PositionVisible: false}, {ID: 2, Weapon: "SKYBREAKER", Splash: 2000, PositionVisible: true}}, Warnings: []sim.OperationWarning{{Kind: "transfer"}, {Kind: "skybreaker", Splash: &zero}}, Entities: []sim.EntityView{{ID: 1, Effects: []sim.StatusEffect{{Kind: "hull_down"}, {Kind: "disperse", Until: 400}}, Private: &sim.EntityPrivate{EmergencyTakeoffUntil: 40}}, {ID: 2}}}
	first, err := snapshot(view)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := proto.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	second := new(pb.PlayerSnapshot)
	if err = proto.Unmarshal(raw, second); err != nil {
		t.Fatal(err)
	}
	if !proto.Equal(first, second) {
		t.Fatal("snapshot binary roundtrip lost fields")
	}
	for _, p := range second.Projectiles {
		if p.Splash == nil || p.PositionVisible == nil {
			t.Fatal("explicit zero/false lost protobuf presence")
		}
	}
	if *second.Projectiles[0].Splash != 0 || *second.Projectiles[0].PositionVisible || *second.Projectiles[1].Splash != 2000 || !*second.Projectiles[1].PositionVisible {
		t.Fatal("projectile fields changed")
	}
	if second.Warnings[0].Splash != nil || second.Warnings[1].Splash == nil || *second.Warnings[1].Splash != 0 {
		t.Fatal("unknown radius conflated with zero")
	}
	if second.Entities[0].Private.GetEmergencyTakeoffUntil() != 40 || second.Entities[1].Private != nil {
		t.Fatal("private deadline leakage or loss")
	}
	if len(second.Entities[0].Effects) != 2 || second.Entities[0].Effects[0].Kind != "hull_down" || second.Entities[0].Effects[0].Until != 0 || second.Entities[0].Effects[1].Until != 400 || len(second.Entities[1].Effects) != 0 {
		t.Fatal("public effects or indefinite expiry lost during codec roundtrip")
	}
	old := new(pb.Projectile)
	if err = proto.Unmarshal([]byte{8, 7}, old); err != nil {
		t.Fatal(err)
	}
	if old.Id != 7 || old.Splash != nil || old.PositionVisible != nil {
		t.Fatal("legacy absent fields became authoritative values")
	}
}
