package sim

// Computer allies defer to unanimous active human teammates. A human's vote is
// retractable until unanimity, and never changes an opponent's private view.
func (e *Engine) teamSurrenderVotes() {
	for _, p := range e.state.Players {
		if p.Defeated || !p.SurrenderVote {
			continue
		}
		agreed := true
		for _, ally := range e.state.Players {
			if ally.Team == p.Team && !ally.Defeated && ally.Controller == "human" && !ally.SurrenderVote {
				agreed = false
			}
		}
		if agreed {
			for _, ally := range e.state.Players {
				if ally.Team == p.Team && !ally.Defeated {
					e.defeat(ally)
				}
			}
		}
	}
}
