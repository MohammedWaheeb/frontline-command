package sim

import "errors"

// Starting-credit amounts use the same integer milliMoney as Player.Credits.
// A launch budget has the authored-budget bound, separate from accumulated
// balances. Service adapters restrict custom-v1 to unranked custom/private play.
const DefaultStartingCredits int64 = 6000000
const MaxStartingCredits int64 = 1000000000

// normalizeStartingCredits leaves standard saves and hashes unchanged: both an
// omitted option and an explicit standard budget retain the zero sentinel.
func normalizeStartingCredits(amount int64, ruleset string) (int64, error) {
	if amount == 0 {
		return 0, nil
	}
	if amount < Scale || amount > MaxStartingCredits || amount%Scale != 0 {
		return 0, errors.New("invalid starting credits: choose whole credits from 1 to 1000000, or 0 for the standard 6000")
	}
	if ruleset != "custom-v1" && (ruleset != "standard-v2" || amount != DefaultStartingCredits) {
		return 0, errors.New("custom starting credits require custom-v1")
	}
	if amount == DefaultStartingCredits {
		return 0, nil
	}
	return amount, nil
}

// StartingCredits reports the original ordinary opening budget in milliMoney.
// It does not infer an opening from current balances after spending or income.
// Prescribed missions and practice do not expose a selectable opening budget.
func (e *Engine) StartingCredits() (int64, bool) {
	if e.state.Mission != nil || e.state.Metadata.Ruleset != "standard-v2" && e.state.Metadata.Ruleset != "custom-v1" {
		return 0, false
	}
	amount := e.state.StartingCredits
	if amount == 0 {
		amount = DefaultStartingCredits
	}
	return amount, true
}
