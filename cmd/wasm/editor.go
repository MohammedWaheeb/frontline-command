package main

import (
	"encoding/json"
	"frontlinecommand/pkg/content"
	"frontlinecommand/pkg/sim"
	pb "frontlinecommand/protocol"
	"google.golang.org/protobuf/proto"
)

// Editor helpers validate imported data with the same bounded Go schemas used
// by local hosting. They do not mutate a running match or author map layouts.
func (s *Session) ValidateMap(data []byte) (content.Map, error) {
	m, err := content.DecodeMap(data)
	if err != nil {
		return m, fail("map_invalid", err.Error(), true)
	}
	return m, nil
}
func (s *Session) ValidateMission(mapData, missionData []byte) (content.Mission, error) {
	m, err := s.ValidateMap(mapData)
	if err != nil {
		return content.Mission{}, err
	}
	mission, err := content.DecodeMission(missionData, s.catalog, m)
	if err != nil {
		return mission, fail("mission_invalid", err.Error(), true)
	}
	return mission, nil
}
func (s *Session) Content() json.RawMessage { return json.RawMessage(s.catalog.PresentationJSON()) }

func (s *Session) Affordances(player sim.PlayerID, ids []sim.ID) (sim.CommandAffordances, error) {
	if err := s.active(); err != nil {
		return sim.CommandAffordances{}, err
	}
	if s.playback != nil {
		return sim.CommandAffordances{}, fail("replay_read_only", "Replay playback does not accept commands.", true)
	}
	if !s.isLocal(player) {
		return sim.CommandAffordances{}, fail("unauthorized_player", "Command advice is available only to a local commander.", true)
	}
	result, err := s.engine.CommandAffordances(player, ids)
	if err != nil {
		return result, fail(err.Error(), "Command advice could not use this selection.", true)
	}
	return result, nil
}

type PreviewResult struct {
	Tick    sim.Tick          `json:"tick"`
	Results []sim.OrderResult `json:"results"`
}

func (s *Session) PreviewOrders(player sim.PlayerID, data []byte) (PreviewResult, error) {
	return s.preview(player, data, false)
}
func (s *Session) PreviewCandidates(player sim.PlayerID, data []byte) (PreviewResult, error) {
	return s.preview(player, data, true)
}
func (s *Session) preview(player sim.PlayerID, data []byte, independent bool) (PreviewResult, error) {
	if err := s.active(); err != nil {
		return PreviewResult{}, err
	}
	if s.playback != nil {
		return PreviewResult{}, fail("replay_read_only", "Replay playback does not accept orders.", true)
	}
	if !s.isLocal(player) {
		return PreviewResult{}, fail("unauthorized_player", "Preview is only available to a local commander.", true)
	}
	if len(data) > maxOrderBatchLen {
		return PreviewResult{}, fail("invalid_order", "Order batch is too large.", true)
	}
	msg := new(pb.OrderBatch)
	if err := proto.Unmarshal(data, msg); err != nil {
		return PreviewResult{}, fail("invalid_order", "Malformed order batch.", true)
	}
	orders, err := decodeOrders(msg)
	if err != nil {
		return PreviewResult{}, fail("invalid_order", err.Error(), true)
	}
	var results []sim.OrderResult
	if independent {
		results, err = s.engine.PreviewCandidates(player, orders)
	} else {
		results, err = s.engine.PreviewOrders(player, orders)
	}
	if err != nil {
		return PreviewResult{}, fail(err.Error(), "The proposed orders are not currently legal.", true)
	}
	return PreviewResult{Tick: s.engine.Tick(), Results: results}, nil
}
