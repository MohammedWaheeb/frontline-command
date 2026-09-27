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
