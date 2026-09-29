package main

import "frontlinecommand/pkg/sim"

func (s *Session) installLive(e *sim.Engine, local []sim.PlayerID) error {
	recorder, err := sim.NewReplay(e)
	if err != nil {
		return fail("replay_recording_failed", err.Error(), false)
	}
	s.install(e, local)
	s.recorder = recorder
	return nil
}

// LoadReplay and SeekReplay replace state only after successful validation.
// All player slots may be viewed through their own fog in a saved replay.
func (s *Session) LoadReplay(data []byte) (Info, error) {
	r, err := sim.DecodeReplay(data)
	if err != nil {
		return Info{}, fail("replay_corrupt", err.Error(), true)
	}
	_, start, err := s.Inspect(r.Initial)
	if err != nil {
		return Info{}, err
	}
	player, err := r.Open(s.catalog, start)
	if err != nil {
		return Info{}, fail("replay_invalid", err.Error(), true)
	}
	locals := []sim.PlayerID{}
	for _, p := range player.Engine().StateCopy().Players {
		locals = append(locals, p.ID)
	}
	s.install(player.Engine(), locals)
	s.replay, s.playback, s.replayStart, s.replayBytes = r, player, start, append([]byte(nil), data...)
	return s.Info(), nil
}
func (s *Session) SeekReplay(tick sim.Tick) (Info, error) {
	if s.playback == nil {
		return Info{}, fail("no_replay", "No replay is loaded.", true)
	}
	player, err := s.replay.Open(s.catalog, tick)
	if err != nil {
		return Info{}, fail("replay_seek", err.Error(), true)
	}
	r, start, data := s.replay, s.replayStart, s.replayBytes
	local := append([]sim.PlayerID(nil), s.local...)
	s.install(player.Engine(), local)
	s.replay, s.playback, s.replayStart, s.replayBytes = r, player, start, data
	return s.Info(), nil
}
func (s *Session) ExportReplay() ([]byte, error) {
	if err := s.active(); err != nil {
		return nil, err
	}
	if s.playback != nil {
		return append([]byte(nil), s.replayBytes...), nil
	}
	if err := s.recorder.Capture(s.engine, false); err != nil {
		return nil, fail("replay_recording_failed", err.Error(), false)
	}
	data, err := s.recorder.Encode()
	if err != nil {
		return nil, fail("replay_recording_failed", err.Error(), false)
	}
	return data, nil
}

type CommandPage struct {
	Commands []sim.Scheduled `json:"commands"`
	Next     uint64          `json:"next"`
}

func (s *Session) ReplayCommands(offset uint64, limit int) (CommandPage, error) {
	if s.playback == nil {
		return CommandPage{}, fail("no_replay", "Load a replay to read its full command history.", true)
	}
	commands, next, err := s.replay.CommandPage(offset, limit)
	if err != nil {
		return CommandPage{}, fail("replay_invalid", err.Error(), true)
	}
	return CommandPage{Commands: commands, Next: next}, nil
}

// ReplayInspection is a lightweight import preview. It validates the compressed
// envelope, compatibility and initial engine state, without simulating the
// entire historical battle. Each checkpoint/order is revalidated during seek.
type ReplayInspection struct {
	Lobby     *sim.ReplayLobby `json:"lobby,omitempty"`
	Metadata  sim.Metadata     `json:"metadata"`
	StartTick sim.Tick         `json:"start_tick"`
	EndTick   sim.Tick         `json:"end_tick"`
	Players   []sim.PlayerID   `json:"players"`
}

func (s *Session) InspectReplay(data []byte) (ReplayInspection, error) {
	r, err := sim.DecodeReplay(data)
	if err != nil {
		return ReplayInspection{}, fail("replay_corrupt", err.Error(), true)
	}
	metadata, start, err := s.Inspect(r.Initial)
	if err != nil {
		return ReplayInspection{}, err
	}
	player, err := r.Open(s.catalog, start)
	if err != nil {
		return ReplayInspection{}, fail("replay_invalid", err.Error(), true)
	}
	ids := []sim.PlayerID{}
	for _, p := range player.Engine().StateCopy().Players {
		ids = append(ids, p.ID)
	}
	return ReplayInspection{Lobby: r.LobbyInfo(), Metadata: metadata, StartTick: start, EndTick: r.FinalTick, Players: ids}, nil
}
