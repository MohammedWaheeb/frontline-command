package server

import (
	"encoding/json"
	"frontlinecommand/internal/viewproto"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"sort"
)

func snapshot(view sim.View) (*pb.PlayerSnapshot, error) {
	return viewproto.Snapshot(view), nil
}
func decodeOrders(batch *pb.OrderBatch) ([]sim.Order, error) {
	b, err := protojson.Marshal(batch)
	if err != nil {
		return nil, err
	}
	var v struct {
		Orders []sim.Order `json:"orders"`
	}
	if err = json.Unmarshal(b, &v); err != nil {
		return nil, err
	}
	return v.Orders, nil
}
func delta(previous, current *pb.PlayerSnapshot) *pb.StateDelta {
	d := &pb.StateDelta{BaselineTick: previous.Tick, State: proto.Clone(current).(*pb.PlayerSnapshot)}
	prior := map[uint32]*pb.Entity{}
	for _, v := range previous.Entities {
		prior[v.Id] = v
	}
	changed := []*pb.Entity{}
	for _, v := range current.Entities {
		if !proto.Equal(prior[v.Id], v) {
			changed = append(changed, v)
		}
		delete(prior, v.Id)
	}
	d.State.Entities = changed
	for id := range prior {
		d.RemovedEntities = append(d.RemovedEntities, id)
	}
	sort.Slice(d.RemovedEntities, func(i, j int) bool { return d.RemovedEntities[i] < d.RemovedEntities[j] })
	return d
}
