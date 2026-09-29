package server

import (
	"encoding/json"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"net/http"
	"strconv"
)

func (s *Server) listSaves(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	v, err := s.repo.ListSaves(r.Context(), p.ID)
	if err != nil {
		fail(w, 500, "storage_error", "Could not list saves.")
		return
	}
	respond(w, 200, v)
}
func (s *Server) getSave(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	v, err := s.repo.GetSave(r.Context(), p.ID, r.PathValue("id"))
	if err != nil {
		fail(w, 404, "save_missing", "This save is unavailable for this profile.")
		return
	}
	respond(w, 200, map[string]any{"save": v, "data": json.RawMessage(v.Data)})
}
func (s *Server) putSave(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Name             string          `json:"name"`
		ExpectedRevision int64           `json:"expected_revision"`
		Data             json.RawMessage `json:"data"`
	}
	if !decode(w, r, &body, 65<<20) {
		return
	}
	if _, err := sim.Restore(s.catalog, body.Data); err != nil {
		fail(w, 400, "incompatible_or_corrupt_save", err.Error())
		return
	}
	v, err := s.repo.PutSave(r.Context(), storage.Save{ID: r.PathValue("id"), Owner: p.ID, Name: body.Name, Data: body.Data}, body.ExpectedRevision)
	if err != nil {
		fail(w, 409, "save_conflict", "The save changed or could not be stored. Keep both versions and retry explicitly.")
		return
	}
	respond(w, 200, v)
}
func (s *Server) deleteSave(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Revision int64 `json:"revision"`
	}
	if !decode(w, r, &body, 1024) {
		return
	}
	if err := s.repo.DeleteSave(r.Context(), p.ID, r.PathValue("id"), body.Revision); err != nil {
		fail(w, 409, "save_conflict", "The save changed; reload before deleting.")
		return
	}
	w.WriteHeader(204)
}

// Download preserves uint64 random state and the exact checksummed JSON bytes.
// Parsing/re-stringifying an engine save in JavaScript can round those values.
func (s *Server) downloadSave(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	v, err := s.repo.GetSave(r.Context(), p.ID, r.PathValue("id"))
	if err != nil {
		fail(w, 404, "save_missing", "This save is unavailable for this profile.")
		return
	}
	w.Header().Set("Content-Type", "application/vnd.frontline.save+json")
	w.Header().Set("Content-Disposition", `attachment; filename="`+v.ID+`.frontline-save.json"`)
	w.Header().Set("X-Save-Revision", strconv.FormatInt(v.Revision, 10))
	w.Write(v.Data)
}
