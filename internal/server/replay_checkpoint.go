package server

import "frontlinecommand/pkg/sim"

// Keep the replay error and ordinary persistence fallback independent. A failed
// recorder must not remove the save attempt that the actor previously made.
func recordReplayCheckpoint(replay *sim.Replay, engine *sim.Engine) ([]byte, error) {
	save, replayErr := replay.CaptureCheckpoint(engine)
	if replayErr != nil {
		save, _ = engine.Save()
	}
	return save, replayErr
}
