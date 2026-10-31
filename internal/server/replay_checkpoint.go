package server

import "frontlinecommand/pkg/sim"

// Keep the replay error and ordinary persistence fallback independent. A failed
// recorder must not remove the save attempt that the actor previously made.
// On success the caller owns an independent snapshot to pack off the actor
// loop (sim.PackCheckpoint + Replay.AppendCheckpoint).
func beginReplayCheckpoint(replay *sim.Replay, engine *sim.Engine) (snapshot *sim.State, fallback []byte, replayErr error) {
	state, replayErr := replay.BeginCheckpoint(engine)
	if replayErr != nil {
		fallback, _ = engine.Save()
		return nil, fallback, replayErr
	}
	return &state, nil, nil
}
