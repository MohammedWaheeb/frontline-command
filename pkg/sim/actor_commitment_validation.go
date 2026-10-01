package sim

import "fmt"

// Commitment records an earned point and the one pending payload. Flight and
// terminal damage belong to the exact Shahed aircraft/combat lifecycle.
func (e *Engine) validateShahedCommitment(v *Entity) error {
	if !v.ShahedCommitted {
		return nil
	}
	if v.Type != "IR.shahed" || v.Building || v.HP <= 0 || v.Container != 0 || v.Target != 0 || v.AimUntil != 0 || v.Channel != "" || v.ChannelDuration != 0 || v.ChannelUntil != 0 || v.Ammo != 0 || v.Landed || v.Landing != nil || v.ServiceWork != 0 || v.RepeatSortie || !e.state.Map.InBounds(v.LastTarget) || !e.explored(v.Owner, v.LastTarget) {
		return fmt.Errorf("invalid saved Shahed commitment %d", v.ID)
	}
	// Genuine defeat revokes task state but keeps the original living actor
	// inactive. It never reactivates that actor or releases another payload.
	if e.defeated(v.Owner) {
		if len(v.Orders) != 0 {
			return fmt.Errorf("invalid inactive Shahed commitment %d", v.ID)
		}
		return nil
	}
	if len(v.Orders) != 1 || v.Orders[0].Kind != "move" || v.Orders[0].Target != 0 || v.Orders[0].Position != v.LastTarget || v.Orders[0].Queued {
		return fmt.Errorf("invalid saved Shahed flight order %d", v.ID)
	}
	return nil
}

// Observe retains no new position: ordinary Hold anchors the recon at its
// actual location throughout the channel and completed stationary stance.
func (e *Engine) validateReconObserve(v *Entity) error {
	if !v.ReconObserve && v.Channel != "observe" {
		return nil
	}
	if v.Building || e.role(v) != "recon" || e.isAircraft(v) || v.HP <= 0 || v.Container != 0 || v.Anchor != v.Position || v.LastPosition != v.Position || len(v.Orders) != 0 || v.Stance != "hold" {
		return fmt.Errorf("invalid saved recon observe stance %d", v.ID)
	}
	if v.ReconObserve {
		if v.Channel != "" || v.ChannelDuration != 0 || v.ChannelUntil != 0 {
			return fmt.Errorf("invalid active recon observe state %d", v.ID)
		}
		return nil
	}
	if e.defeated(v.Owner) || v.ChannelTarget != 0 || v.ChannelDuration != seconds(2) || v.ChannelUntil <= e.state.Tick {
		return fmt.Errorf("invalid pending recon observe state %d", v.ID)
	}
	return nil
}
