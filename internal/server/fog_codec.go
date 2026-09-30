package server

import (
	"frontlinecommand/internal/fogcodec"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
)

// compactSnapshot packs only the exact already-permitted masks produced by the
// ordinary converter. It does not read world state or alter snapshot(view), so
// existing native/generated conversion equivalence controls remain meaningful.
// Empty planes (non-map diagnostic views) retain their legacy representation.
func compactSnapshot(view sim.View) (*pb.PlayerSnapshot, error) {
	current, err := snapshot(view)
	if err != nil {
		return nil, err
	}
	if len(current.Explored) == 0 && len(current.Visible) == 0 {
		return current, nil
	}
	if len(current.Explored) != len(current.Visible) {
		return nil, fogcodec.ErrCardinality
	}
	tiles := uint32(len(current.Visible))
	explored, err := fogcodec.Pack(current.Explored, tiles)
	if err != nil {
		return nil, err
	}
	visible, err := fogcodec.Pack(current.Visible, tiles)
	if err != nil {
		return nil, err
	}
	current.FogTiles, current.ExploredBits, current.VisibleBits = tiles, explored, visible
	current.Explored, current.Visible = nil, nil
	return current, nil
}
