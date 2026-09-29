package server

import (
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"net/http"
)

func (s *Server) campaignProgressRoutes() {
	s.mux.HandleFunc("GET /api/v1/progress/campaign", s.getCampaignProgress)
	s.mux.HandleFunc("PUT /api/v1/progress/campaign", s.putCampaignProgress)
}
func (s *Server) getCampaignProgress(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	value, err := s.repo.GetCampaignProgress(r.Context(), profile.ID)
	if err != nil {
		fail(w, 500, "storage_error", "Could not read your campaign progress.")
		return
	}
	respond(w, 200, value)
}
func (s *Server) putCampaignProgress(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Expected int64           `json:"expected_revision"`
		Data     json.RawMessage `json:"data"`
	}
	if !decode(w, r, &body, 260<<10) {
		return
	}
	if err := storage.ValidateCampaignLedger(body.Data); err != nil {
		fail(w, 400, "progress_invalid", "Choose a supported version-1 campaign ledger of at most 256 KiB. Existing progress is unchanged.")
		return
	}
	value, err := s.repo.PutCampaignProgress(r.Context(), profile.ID, body.Data, body.Expected)
	if errors.Is(err, storage.ErrConflict) {
		fail(w, 409, "progress_conflict", "Campaign progress changed. Compare both versions again before copying.")
		return
	}
	if err != nil {
		fail(w, 400, "progress_rejected", "Campaign progress could not be stored. Existing progress is unchanged.")
		return
	}
	respond(w, 200, value)
}
