package server

import (
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/content"
	"net/http"
	"strconv"
)

func (s *Server) mapPublicationRoutes() {
	s.mux.HandleFunc("GET /api/v1/maps/mine", s.ownMaps)
	s.mux.HandleFunc("PATCH /api/v1/maps/{id}/publication", s.publishMap)
	s.mux.HandleFunc("POST /api/v1/maps/{id}/reports", s.reportMap)
	s.mux.HandleFunc("GET /api/v1/map-reports", s.ownMapReports)
	s.mux.HandleFunc("GET /api/v1/admin/map-reports", s.adminMapReports)
	s.mux.HandleFunc("GET /api/v1/admin/map-reports/{id}", s.adminMapReport)
	s.mux.HandleFunc("POST /api/v1/admin/map-reports/{id}/reviews", s.reviewMapReport)
}

// Caller holds mapMu while making a new lobby/admission decision. Established
// matches retain their immutable original blueprint through a separate route.
func (s *Server) mapHostAllowed(w http.ResponseWriter, r *http.Request, id, owner string, private bool, mode string) bool {
	v, err := s.repo.GetMap(r.Context(), id)
	if err != nil || v.Removed {
		fail(w, 404, "map_missing", "The map is unavailable.")
		return false
	}
	if !v.Published && (v.Owner != owner || !private || mode != "custom") {
		fail(w, 403, "private_map", "Only its owner may host an unpublished map in a private custom lobby.")
		return false
	}
	return true
}
func (s *Server) ownMaps(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	rows, err := s.repo.ListOwnedMaps(r.Context(), p.ID)
	if err != nil {
		fail(w, 500, "storage_error", "Could not load your maps.")
		return
	}
	result := []storage.MapRecord{}
	for _, v := range rows {
		if v.Owner == p.ID {
			result = append(result, v)
		}
	}
	respond(w, 200, result)
}
func (s *Server) publishMap(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Published *bool `json:"published"`
		Expected  int64 `json:"expected_revision"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	if body.Published == nil {
		fail(w, 400, "invalid_publication", "Choose published or private explicitly.")
		return
	}
	s.mapMu.Lock()
	defer s.mapMu.Unlock()
	v, err := s.repo.PublishMap(r.Context(), r.PathValue("id"), p.ID, *body.Published, body.Expected)
	if errors.Is(err, storage.ErrUnauthorized) || errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "map_unavailable", "The map is unavailable or removed from sharing.")
		return
	}
	if errors.Is(err, storage.ErrConflict) {
		fail(w, 409, "map_conflict", "Reload the map's current revision before changing publication.")
		return
	}
	if err != nil {
		fail(w, 400, "publication_rejected", "Publication could not be changed.")
		return
	}
	respond(w, 200, v)
}

// Context is an authenticated membership assertion, not a private code or an
// arbitrary map-version download. In particular, a known match ID grants nothing.
func (s *Server) mapContext(w http.ResponseWriter, r *http.Request) bool {
	lobbyID, matchID := r.URL.Query().Get("lobby_id"), r.URL.Query().Get("match_id")
	if lobbyID == "" && matchID == "" {
		return false
	}
	if lobbyID != "" && matchID != "" || len(r.URL.RawQuery) > 512 {
		fail(w, 400, "invalid_map_context", "Choose one lobby or match context.")
		return true
	}
	p, ok := s.authenticate(w, r)
	if !ok {
		return true
	}
	id := r.PathValue("id")
	s.mu.Lock()
	var forming *content.Map
	if lobbyID != "" {
		l := s.lobbies[lobbyID]
		if l == nil || l.MapID != id || !lobbyMember(l, p.ID) {
			s.mu.Unlock()
			fail(w, 404, "map_context_missing", "Join this lobby before loading its map.")
			return true
		}
		matchID = l.MatchID
		if matchID == "" {
			forming = l.mapData
			if forming == nil {
				if m, exists := s.maps[id]; exists {
					forming = &m
				}
			}
		}
	}
	m := s.matches[matchID]
	s.mu.Unlock()
	if forming != nil {
		w.Header().Set("X-Frontline-Map-Hash", lobbyMapHash(*forming))
		respond(w, 200, forming)
		return true
	}
	if m == nil || m.mapID != id {
		fail(w, 404, "map_context_missing", "The match map is unavailable.")
		return true
	}
	reply := m.call(r.Context(), matchRequest{kind: "map_context", profile: p.ID})
	if reply.err != nil {
		fail(w, 404, "map_context_missing", "The match map is unavailable to this profile.")
		return true
	}
	var blueprint content.Map
	if json.Unmarshal(reply.data, &blueprint) != nil {
		fail(w, 500, "map_context_invalid", "Could not read the original match map.")
		return true
	}
	w.Header().Set("X-Frontline-Map-Hash", lobbyMapHash(blueprint))
	respond(w, 200, json.RawMessage(reply.data))
	return true
}

func (s *Server) reportMap(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if !decode(w, r, &body, 8192) {
		return
	}
	report, err := s.repo.CreateMapReport(r.Context(), p.ID, r.PathValue("id"), body.Reason)
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "map_missing", "Only a currently shared user map can be reported.")
		return
	}
	if errors.Is(err, storage.ErrReportRate) {
		fail(w, 429, "report_rate_exceeded", "Report limit reached: five per map, ten per hour and fifty per day.")
		return
	}
	if err != nil {
		fail(w, 400, "invalid_report", "Include 3–2000 bytes of plain-text context.")
		return
	}
	report.Owner, report.Note = "", ""
	respond(w, 201, report)
}
func (s *Server) mapReportList(w http.ResponseWriter, r *http.Request, owner string) {
	status, before, limit, ok := reportQuery(w, r)
	if !ok {
		return
	}
	reports, err := s.repo.ListMapReports(r.Context(), owner, status, before, limit)
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "report_cursor_missing", "Reload the report list.")
		return
	}
	if err != nil {
		fail(w, 500, "storage_error", "Could not load map reports.")
		return
	}
	if owner != "" {
		for i := range reports {
			reports[i].Owner, reports[i].Note = "", ""
		}
	}
	next := ""
	if len(reports) == limit {
		next = reports[len(reports)-1].ID
	}
	respond(w, 200, map[string]any{"reports": reports, "next_cursor": next})
}
func (s *Server) ownMapReports(w http.ResponseWriter, r *http.Request) {
	if p, ok := s.authenticate(w, r); ok {
		s.mapReportList(w, r, p.ID)
	}
}
func (s *Server) adminMapReports(w http.ResponseWriter, r *http.Request) {
	if s.authenticateModerator(w, r) {
		s.mapReportList(w, r, "")
	}
}
func (s *Server) adminMapReport(w http.ResponseWriter, r *http.Request) {
	if !s.authenticateModerator(w, r) {
		return
	}
	before := int64(0)
	if value := r.URL.Query().Get("before_revision"); value != "" {
		var err error
		before, err = strconv.ParseInt(value, 10, 64)
		if err != nil || before < 1 || before > 10001 {
			fail(w, 400, "invalid_query", "Choose a valid review revision.")
			return
		}
	}
	if len(r.URL.RawQuery) > 512 {
		fail(w, 400, "invalid_query", "Choose a valid review revision.")
		return
	}
	report, err := s.repo.GetMapReport(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, 404, "report_missing", "This report is unavailable.")
		return
	}
	current, err := s.repo.GetMap(r.Context(), report.MapID)
	if err != nil {
		fail(w, 404, "map_missing", "The map is unavailable.")
		return
	}
	original, err := s.repo.MapVersion(r.Context(), report.MapID, report.MapRevision)
	if err != nil {
		fail(w, 500, "map_version_missing", "The reported original is unavailable.")
		return
	}
	reviews, err := s.repo.MapReportReviews(r.Context(), report.ID, before)
	if err != nil {
		fail(w, 500, "storage_error", "Could not read map reviews.")
		return
	}
	respond(w, 200, map[string]any{"report": report, "current_map": current, "reported_map": json.RawMessage(original), "current_map_data": json.RawMessage(current.Data), "reviews": reviews})
}
func (s *Server) reviewMapReport(w http.ResponseWriter, r *http.Request) {
	if !s.authenticateModerator(w, r) {
		return
	}
	var body struct {
		Decision    string `json:"decision"`
		Note        string `json:"note"`
		Expected    int64  `json:"expected_revision"`
		ExpectedMap int64  `json:"expected_map_revision"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	s.mapMu.Lock()
	defer s.mapMu.Unlock()
	v, err := s.repo.ReviewMapReport(r.Context(), r.PathValue("id"), body.Decision, body.Note, body.Expected, body.ExpectedMap)
	if errors.Is(err, storage.ErrConflict) {
		fail(w, 409, "review_conflict", "The map or report changed. Reload both before reviewing.")
		return
	}
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "report_missing", "This report is unavailable.")
		return
	}
	if err != nil {
		fail(w, 400, "invalid_review", "Choose removed, restored, dismissed or needs_context, a plain-text note and the current revisions.")
		return
	}
	respond(w, 200, v)
}
