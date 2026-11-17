package server

// socketErrorMessage keeps protocol reference codes separate from player copy.
func socketErrorMessage(code string) string {
	switch code {
	case "player_eliminated":
		return "Your commander was eliminated. Join an authorized observer view or wait for the final result."
	case "reconnect_expired":
		return "The reconnect window has ended. Review the result or join an authorized observer view."
	case "invalid_match_token":
		return "This match sign-in is no longer valid. Rejoin through your lobby."
	case "unknown_player":
		return "Your commander has no player slot in this match. Rejoin through your lobby."
	case "connection_closed":
		return "This connection attempt closed before it could join. Try connecting again."
	case "connection_replaced":
		return "Another game tab replaced this connection. Continue in that tab or reconnect here."
	case "match_closed", "match_not_active":
		return "This match is no longer active. Return to the lobby to view its result."
	case "control_rate_exceeded":
		return "Pause requests are arriving too quickly. Wait a moment and try again."
	case "players_disconnected":
		return "Shared pause is waiting for all active players to reconnect."
	case "waiting_for_players":
		return "The game is waiting for every commander to connect."
	case "pause_disabled":
		return "Shared pause was not enabled for this game."
	case "player_inactive":
		return "Your commander is no longer active and cannot request shared pause."
	case "invalid_control":
		return "Choose pause or resume for this game."
	default:
		return "The host could not complete this game connection request. Reconnect through your lobby."
	}
}
