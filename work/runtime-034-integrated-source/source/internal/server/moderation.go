package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func (s *Server) initModeratorCredential() error {
	path := filepath.Join(s.cfg.DataDir, "moderator.token")
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err == nil {
		token, randomErr := storage.Token()
		if randomErr != nil {
			file.Close()
			os.Remove(path)
			return randomErr
		}
		if _, err = io.WriteString(file, token+"\n"); err == nil {
			err = file.Sync()
		}
		closeErr := file.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	} else if !errors.Is(err, os.ErrExist) {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 || info.Size() > 128 {
		return errors.New("moderator.token must be a private regular file readable only by its owner")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	token := strings.TrimSpace(string(data))
	if len(token) != 64 {
		return errors.New("invalid local moderator credential file")
	}
	if _, err = hex.DecodeString(token); err != nil {
		return errors.New("invalid local moderator credential file")
	}
	s.moderatorHash = sha256.Sum256([]byte(token))
	return nil
}
func (s *Server) authenticateModerator(w http.ResponseWriter, r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	token, bearer := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	digest := sha256.Sum256([]byte(token))
	if err != nil || ip == nil || !ip.IsLoopback() || !bearer || len(token) != 64 || subtle.ConstantTimeCompare(digest[:], s.moderatorHash[:]) != 1 {
		fail(w, 403, "local_moderator_required", "Use the local operator credential from the host computer.")
		return false
	}
	return true
}
func (s *Server) moderationRoutes() {
	s.mux.HandleFunc("POST /api/v1/reports", s.createReport)
	s.mux.HandleFunc("GET /api/v1/reports", s.ownReports)
	s.mux.HandleFunc("GET /api/v1/admin/reports", s.adminReports)
	s.mux.HandleFunc("GET /api/v1/admin/reports/{id}", s.adminReport)
	s.mux.HandleFunc("POST /api/v1/admin/reports/{id}/reviews", s.reviewReport)
	s.mux.HandleFunc("GET /api/v1/admin/reports/{id}/replay", s.adminReportReplay)
	s.mux.HandleFunc("GET /api/v1/history", s.ownHistory)
}
func (s *Server) ownHistory(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	results, err := s.repo.ListOwnResults(r.Context(), p.ID, 50)
	if err != nil {
		fail(w, 500, "storage_error", "Could not load your match history.")
		return
	}
	respond(w, 200, results)
}
func (s *Server) createReport(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		MatchID string `json:"match_id"`
		Tick    uint32 `json:"tick"`
		Reason  string `json:"reason"`
	}
	if !decode(w, r, &body, 8192) {
		return
	}
	if !storage.ValidID(body.MatchID) || body.Tick > 216000 || len(body.Reason) < 3 || len(body.Reason) > 2000 || storage.PlainText(body.Reason, 2000) != nil {
		fail(w, 400, "invalid_report", "Include a match, valid tick and 3–2000 characters of plain-text context.")
		return
	}
	member, err := s.repo.MatchMember(r.Context(), body.MatchID, p.ID)
	if err != nil {
		fail(w, 404, "report_match_unavailable", "Reports require a match you participated in.")
		return
	}
	var limit uint32
	result, resultErr := s.repo.GetResult(r.Context(), body.MatchID)
	if resultErr == nil {
		var meta struct {
			Tick          uint32 `json:"tick"`
			AvailableTick uint32 `json:"available_tick"`
			Outcome       struct {
				Tick uint32 `json:"tick"`
			} `json:"outcome"`
		}
		if json.Unmarshal(result.Payload, &meta) != nil {
			fail(w, 409, "report_context_unavailable", "The saved match reference is unavailable.")
			return
		}
		limit = max(meta.Tick, meta.AvailableTick, meta.Outcome.Tick)
	} else {
		s.mu.Lock()
		match := s.matches[body.MatchID]
		s.mu.Unlock()
		if match == nil || member.Player == 0 {
			fail(w, 409, "report_context_unavailable", "Wait for this match's saved result.")
			return
		}
		reply := match.call(r.Context(), matchRequest{kind: "view", player: sim.PlayerID(member.Player)})
		if reply.err != nil {
			fail(w, 409, "report_context_unavailable", "Wait for this match's saved result.")
			return
		}
		limit = uint32(reply.view.Tick)
	}
	if body.Tick > limit {
		fail(w, 400, "report_tick_future", "Choose a time at or before the current or final match tick.")
		return
	}
	report, err := s.repo.CreateReport(r.Context(), p.ID, body.MatchID, body.Reason, body.Tick)
	if errors.Is(err, storage.ErrReportRate) {
		fail(w, 429, "report_rate_exceeded", "Report limit reached: five per match, ten per hour and fifty per day.")
		return
	}
	if err != nil {
		fail(w, 400, "report_rejected", "The report could not be recorded.")
		return
	}
	report.Owner, report.Note = "", ""
	respond(w, 201, map[string]any{"recorded_locally": true, "report": report})
}
func reportQuery(w http.ResponseWriter, r *http.Request) (string, string, int, bool) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "all"
	}
	before := r.URL.Query().Get("before")
	limit := 50
	if value := r.URL.Query().Get("limit"); value != "" {
		var err error
		limit, err = strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			fail(w, 400, "invalid_query", "Report page size must be 1–100.")
			return "", "", 0, false
		}
	}
	if len(r.URL.RawQuery) > 512 || before != "" && !storage.ValidID(before) || (status != "all" && status != "pending" && status != "reviewed") {
		fail(w, 400, "invalid_query", "Choose a valid report filter and cursor.")
		return "", "", 0, false
	}
	return status, before, limit, true
}
func (s *Server) reportList(w http.ResponseWriter, r *http.Request, owner string) {
	status, before, limit, ok := reportQuery(w, r)
	if !ok {
		return
	}
	reports, err := s.repo.ListReports(r.Context(), owner, status, before, limit)
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "report_cursor_missing", "Reload the report list.")
		return
	}
	if err != nil {
		fail(w, 500, "storage_error", "Could not load reports.")
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
func (s *Server) ownReports(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticate(w, r)
	if ok {
		s.reportList(w, r, p.ID)
	}
}
func (s *Server) adminReports(w http.ResponseWriter, r *http.Request) {
	if s.authenticateModerator(w, r) {
		s.reportList(w, r, "")
	}
}
func (s *Server) adminReport(w http.ResponseWriter, r *http.Request) {
	if !s.authenticateModerator(w, r) {
		return
	}
	if len(r.URL.RawQuery) > 512 {
		fail(w, 400, "invalid_query", "Choose a valid review revision.")
		return
	}
	report, err := s.repo.GetReport(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, 404, "report_missing", "This report is unavailable.")
		return
	}
	before := int64(0)
	if value := r.URL.Query().Get("before_revision"); value != "" {
		before, err = strconv.ParseInt(value, 10, 64)
		if err != nil || before < 1 || before > 10001 {
			fail(w, 400, "invalid_query", "Choose a valid review revision.")
			return
		}
	}
	reviews, err := s.repo.ReportReviews(r.Context(), report.ID, before)
	if err != nil {
		fail(w, 500, "storage_error", "Could not load review history.")
		return
	}
	respond(w, 200, map[string]any{"report": report, "reviews": reviews})
}
func (s *Server) reviewReport(w http.ResponseWriter, r *http.Request) {
	if !s.authenticateModerator(w, r) {
		return
	}
	var body struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
		Expected int64  `json:"expected_revision"`
	}
	if !decode(w, r, &body, 4096) {
		return
	}
	review, err := s.repo.ReviewReport(r.Context(), r.PathValue("id"), body.Decision, body.Note, body.Expected)
	if errors.Is(err, storage.ErrConflict) {
		fail(w, 409, "review_conflict", "The report was reviewed elsewhere. Reload its history before changing the decision.")
		return
	}
	if errors.Is(err, storage.ErrNotFound) {
		fail(w, 404, "report_missing", "This report is unavailable.")
		return
	}
	if err != nil {
		fail(w, 400, "invalid_review", "Choose confirmed, dismissed or needs_context, a plain-text note and the current revision.")
		return
	}
	respond(w, 200, review)
}
func (s *Server) adminReportReplay(w http.ResponseWriter, r *http.Request) {
	if !s.authenticateModerator(w, r) {
		return
	}
	report, err := s.repo.GetReport(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, 404, "report_missing", "This report is unavailable.")
		return
	}
	s.writeCompletedReplay(w, r, report.MatchID)
}
