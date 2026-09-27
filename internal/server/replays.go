package server

import (
	"frontlinecommand/internal/storage"
	"net/http"
)

func (s *Server) getReplay(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !storage.ValidID(id) {
		fail(w, 400, "invalid_replay", "Invalid replay ID.")
		return
	}
	allowed, err := s.repo.MayReadReplay(r.Context(), id, p.ID)
	if err != nil || !allowed {
		fail(w, 404, "replay_unavailable", "This completed replay is unavailable for this profile.")
		return
	}
	s.writeCompletedReplay(w, r, id)
}
func (s *Server) writeCompletedReplay(w http.ResponseWriter, r *http.Request, id string) {
	result, err := s.repo.GetResult(r.Context(), id)
	if err != nil || result.Void {
		fail(w, 404, "replay_unavailable", "A completed match replay is not available.")
		return
	}
	b, err := s.objects.Get(r.Context(), id+".replay")
	if err != nil {
		fail(w, 404, "replay_unavailable", "The replay file is unavailable; the result is preserved.")
		return
	}
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+id+`.fcr"`)
	w.Write(b)
}
