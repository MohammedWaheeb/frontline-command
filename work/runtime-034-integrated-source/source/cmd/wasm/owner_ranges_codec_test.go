package main

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

// Both production codecs consume exact Go saves, including actual reservation
// ticks. No hand-authored protobuf can stand in for the private projection.
func TestOwnerRangesActualCodec(t *testing.T) {
	dir := os.Getenv("FRONTLINE_RANGES_INPUT")
	if dir == "" {
		t.Skip("requires Go range fixture saves")
	}
	paths, err := filepath.Glob(filepath.Join(dir, "ranges-*.start.save.json"))
	if err != nil || len(paths) != 15 {
		t.Fatal("expected eight rate, six magazine and one assignment save", len(paths), err)
	}
	records := map[string]string{}
	for _, name := range paths {
		t.Run(filepath.Base(name), func(t *testing.T) {
			data, err := os.ReadFile(name)
			if err != nil {
				t.Fatal(err)
			}
			e, err := sim.Restore(content.MustBase(), data)
			if err != nil {
				t.Fatal(err)
			}
			before := e.Hash()
			for _, player := range []sim.PlayerID{1, 2} {
				view, ok := e.PlayerView(player)
				if !ok {
					t.Fatal("missing player")
				}
				frame, err := snapshot(view)
				if err != nil {
					t.Fatal(err)
				}
				wire, err := proto.MarshalOptions{Deterministic: true}.Marshal(frame)
				if err != nil {
					t.Fatal(err)
				}
				decoded := new(pb.PlayerSnapshot)
				if err = proto.Unmarshal(wire, decoded); err != nil || !proto.Equal(frame, decoded) {
					t.Fatal("wire roundtrip", err)
				}
				count := 0
				for _, actual := range view.Entities {
					var got *pb.Entity
					for _, entity := range decoded.Entities {
						if entity.Id == uint32(actual.ID) {
							got = entity
							break
						}
					}
					if got == nil {
						t.Fatal("missing entity", actual.ID)
					}
					if actual.Owner != player {
						if got.Private != nil {
							t.Fatal("foreign private ranges leaked")
						}
						continue
					}
					if actual.Private == nil || actual.Private.Ranges == nil {
						continue
					}
					count++
					want := actual.Private.Ranges
					ranges := got.GetPrivate().GetRanges()
					if ranges == nil || ranges.SightRadius != want.SightRadius || ranges.DetectionRadius != want.DetectionRadius || ranges.AirborneSight != want.AirborneSight || ranges.BuildRadius != want.BuildRadius {
						t.Fatal("effective range changed", want, ranges)
					}
					a, b := want.Interception, ranges.Interception
					if (a == nil) != (b == nil) {
						t.Fatal("interception presence changed")
					}
					if a == nil {
						continue
					}
					if a.Radius != b.Radius || a.Capacity != b.Capacity || a.Active != b.Active || a.Ready != b.Ready || a.RechargeRequired != b.RechargeRequired || a.RechargeRate != b.RechargeRate || uint32(a.FireReadyAt) != b.FireReadyAt || len(a.Assignments) != len(b.Assignments) {
						t.Fatal("interception values changed", a, b)
					}
					if (a.NextChargeTicks == nil) != (b.NextChargeTicks == nil) || a.NextChargeTicks != nil && *a.NextChargeTicks != *b.NextChargeTicks {
						t.Fatal("optional next charge changed")
					}
					for i, assignment := range a.Assignments {
						got := b.Assignments[i]
						if uint32(assignment.Projectile) != got.Projectile || uint32(assignment.InterceptAt) != got.InterceptAt || assignment.Impact.X != got.GetImpact().GetX() || assignment.Impact.Y != got.GetImpact().GetY() {
							t.Fatal("assignment changed", assignment, got)
						}
					}
				}
				if count == 0 {
					t.Fatal("fixture did not exercise owner ranges")
				}
				sum := sha256.Sum256(wire)
				key := filepath.Base(name) + "/player1"
				if player == 2 {
					key = filepath.Base(name) + "/player2"
				}
				records[key] = hex.EncodeToString(sum[:])
				// Absent metadata from an older runtime must remain absent, not a fake
				// zero-radius defense or zero-second deadline.
				for i := range view.Entities {
					if view.Entities[i].Private != nil {
						view.Entities[i].Private.Ranges = nil
					}
				}
				legacy, err := snapshot(view)
				if err != nil {
					t.Fatal(err)
				}
				for _, entity := range legacy.Entities {
					if entity.GetPrivate().GetRanges() != nil {
						t.Fatal("absent legacy metadata invented")
					}
				}
			}
			if before != e.Hash() {
				t.Fatal("codec mutated authoritative state")
			}
		})
	}
	if name := os.Getenv("FRONTLINE_RANGES_CODEC_OUTPUT"); name != "" {
		data, err := json.MarshalIndent(records, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(name, data, 0644); err != nil {
			t.Fatal(err)
		}
	}
}
