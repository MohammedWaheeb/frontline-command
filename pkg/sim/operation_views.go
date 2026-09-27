package sim

func (e *Engine) pendingVolley(id ID) bool {
	for _, op := range e.state.Operations {
		if op.Kind == "second_volley" && op.Source == id {
			return true
		}
	}
	return false
}

// Warnings persist across snapshots/reconnects. Source IDs are omitted for
// public airstrike warnings, so an unseen aircraft or launcher is not revealed.
type OperationWarning struct {
	Kind     string   `json:"kind"`
	Owner    PlayerID `json:"owner"`
	Position Vec      `json:"position"`
	At       Tick     `json:"at"`
	Source   ID       `json:"source"`
	Exits    []Vec    `json:"exits"`
}

func (e *Engine) operationWarnings(id PlayerID) []OperationWarning {
	var warnings []OperationWarning
	for _, source := range e.state.Entities {
		if source.Channel != "transit" || source.HP <= 0 || e.defeated(source.Owner) || source.ChannelUntil <= e.state.Tick || source.ChannelUntil-e.state.Tick > seconds(3) {
			continue
		}
		destination := e.entity(source.ChannelTarget)
		if destination != nil && destination.HP > 0 && destination.Owner == source.Owner && e.canSee(id, destination.Position) {
			// The warning marks only an observed destination. It must not reveal
			// the hidden source, its passengers, or private exit collision probes.
			warnings = append(warnings, OperationWarning{Kind: "transfer", Owner: source.Owner, Position: destination.Position, At: source.ChannelUntil})
		}
	}
	for _, op := range e.state.Operations {
		source := e.entity(op.Source)
		if source == nil || source.HP <= 0 || source.Owner != op.Owner {
			continue
		}
		switch op.Kind {
		case "skybreaker":
			warnings = append(warnings, OperationWarning{Kind: op.Kind, Owner: op.Owner, Position: op.Points[0], At: op.At + 1})
		case "raid":
			if e.canSee(id, source.Position) {
				warnings = append(warnings, OperationWarning{Kind: op.Kind, Owner: op.Owner, Position: source.Position, Source: source.ID, At: op.At, Exits: append([]Vec(nil), op.Points...)})
			}
		case "second_volley":
			if op.Owner == id {
				warnings = append(warnings, OperationWarning{Kind: op.Kind, Owner: op.Owner, Position: op.Points[0], Source: source.ID, At: op.At})
			}
		}
	}
	return warnings
}
