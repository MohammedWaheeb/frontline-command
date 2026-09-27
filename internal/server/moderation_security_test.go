package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"frontlinecommand/internal/storage"
	"frontlinecommand/pkg/sim"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func securityCall(t *testing.T, s *Server, method, path, authorization, remote, body string, want int) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = remote
	if authorization != "" {
		r.Header.Set("Authorization", authorization)
	}
	r.Header.Set("Content-Type", "application/json")
	// Untrusted proxies must not change either operator admission or IP quotas.
	r.Header.Set("X-Forwarded-For", "127.0.0.1")
	r.Header.Set("Forwarded", "for=127.0.0.1")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != want {
		t.Fatalf("%s %s got %d want %d: %s", method, path, w.Code, want, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private response may be cached")
	}
	return w
}
func moderatorToken(t *testing.T, s *Server) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "moderator.token"))
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimSpace(string(b))
}
func completedEvidence(t *testing.T, s *Server, id, owner string, public, void bool) {
	t.Helper()
	ctx := context.Background()
	if err := s.repo.StartMatchAccess(ctx, id, 0, []byte("checkpoint"), []storage.MatchMember{{Profile: owner, Player: 1}}, public); err != nil {
		t.Fatal(err)
	}
	if err := s.objects.Put(ctx, id+".replay", []byte("private replay evidence")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.repo.CommitResult(ctx, storage.Result{ID: id, Payload: []byte(`{"tick":100,"finished":true}`), Void: void}); err != nil {
		t.Fatal(err)
	}
}
func TestPrivateHistoryReplaySurviveRestartWithoutLeaking(t *testing.T) {
	cfg := Config{DataDir: t.TempDir(), MapDir: filepath.Join(t.TempDir(), "no-maps")}
	s, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	member, token, _ := s.repo.CreateProfile(ctx, "Member")
	_, other, _ := s.repo.CreateProfile(ctx, "Outsider")
	completedEvidence(t, s, "private-finished", member.ID, false, false)
	completedEvidence(t, s, "public-finished", member.ID, true, false)
	completedEvidence(t, s, "void-finished", member.ID, false, true)
	if _, err = s.repo.CommitResult(ctx, storage.Result{ID: "unknown-legacy", Payload: []byte(`{"tick":50}`)}); err != nil {
		t.Fatal(err)
	}
	if err = s.objects.Put(ctx, "unknown-legacy.replay", []byte("legacy private")); err != nil {
		t.Fatal(err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, test := range []struct {
		id, auth string
		status   int
	}{
		{"private-finished", token, 200}, {"private-finished", other, 404}, {"public-finished", other, 200},
		{"void-finished", token, 404}, {"unknown-legacy", token, 404}, {"private-finished", "", 401},
	} {
		auth := ""
		if test.auth != "" {
			auth = "Bearer " + test.auth
		}
		securityCall(t, s, "GET", "/api/v1/replays/"+test.id, auth, "127.0.0.1:11", "", test.status)
	}
	w := securityCall(t, s, "GET", "/api/v1/history", "Bearer "+token, "127.0.0.1:11", "", 200)
	var own []storage.Result
	if err = json.Unmarshal(w.Body.Bytes(), &own); err != nil || len(own) != 3 {
		t.Fatal("own history missing", len(own), err)
	}
	w = securityCall(t, s, "GET", "/api/v1/history", "Bearer "+other, "127.0.0.1:11", "", 200)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("foreign history exposed", w.Body.String())
	}
}
func TestLocalModeratorAuthorizationAndReviewPrivacy(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	member, token, _ := s.repo.CreateProfile(ctx, "Reporter")
	_, outsider, _ := s.repo.CreateProfile(ctx, "Other")
	completedEvidence(t, s, "reported-private", member.ID, false, false)
	admin := moderatorToken(t, s)
	path := "/api/v1/admin/reports"
	for _, test := range []struct {
		auth, remote string
		status       int
	}{
		{"", "127.0.0.1:1", 403}, {"Bearer " + token, "127.0.0.1:1", 403}, {admin, "127.0.0.1:1", 403},
		{"Bearer " + admin + " extra", "127.0.0.1:1", 403}, {"Bearer " + admin, "192.168.1.10:1", 403},
		{"Bearer " + admin, "localhost:1", 403}, {"Bearer " + admin, "[::1]:1", 200},
	} {
		w := securityCall(t, s, "GET", path, test.auth, test.remote, "", test.status)
		if strings.Contains(w.Body.String(), admin) || strings.Contains(w.Body.String(), token) {
			t.Fatal("credential in response")
		}
	}
	for _, auth := range []string{token, "bearer " + token, "Bearer " + token + " ", "Bearer " + admin} {
		securityCall(t, s, "GET", "/api/v1/profiles/me", auth, "127.0.0.1:1", "", 401)
	}
	w := securityCall(t, s, "POST", "/api/v1/reports", "Bearer "+token, "127.0.0.1:1", `{"match_id":"reported-private","tick":50,"reason":"Review this match event."}`, 201)
	var created struct {
		Report storage.ReportRecord `json:"report"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Report.ID == "" {
		t.Fatal("report response", err)
	}
	if created.Report.Owner != "" {
		t.Fatal("owner returned unnecessarily")
	}
	id := created.Report.ID
	securityCall(t, s, "POST", path+"/"+id+"/reviews", "Bearer "+token, "127.0.0.1:1", `{"decision":"confirmed","note":"forged","expected_revision":0}`, 403)
	securityCall(t, s, "POST", path+"/"+id+"/reviews", "Bearer "+admin, "127.0.0.1:1", `{"decision":"needs_context","note":"Private operator investigation.","expected_revision":0}`, 200)
	securityCall(t, s, "POST", path+"/"+id+"/reviews", "Bearer "+admin, "127.0.0.1:1", `{"decision":"dismissed","note":"stale","expected_revision":0}`, 409)
	securityCall(t, s, "POST", path+"/"+id+"/reviews", "Bearer "+admin, "127.0.0.1:1", `{"decision":"dismissed","note":"Resolved using evidence.","expected_revision":1}`, 200)
	w = securityCall(t, s, "GET", "/api/v1/reports", "Bearer "+token, "127.0.0.1:1", "", 200)
	if strings.Contains(w.Body.String(), "operator investigation") || strings.Contains(w.Body.String(), "Resolved using evidence") || strings.Contains(w.Body.String(), member.ID) {
		t.Fatal("internal review data exposed")
	}
	if !strings.Contains(w.Body.String(), `"decision":"dismissed"`) {
		t.Fatal("reporter cannot see resolution")
	}
	w = securityCall(t, s, "GET", "/api/v1/reports", "Bearer "+outsider, "127.0.0.1:1", "", 200)
	if strings.Contains(w.Body.String(), id) {
		t.Fatal("foreign report listed")
	}
	securityCall(t, s, "GET", "/api/v1/reports?before="+id, "Bearer "+outsider, "127.0.0.1:1", "", 404)
	w = securityCall(t, s, "GET", path+"/"+id, "Bearer "+admin, "127.0.0.1:1", "", 200)
	var detail struct {
		Reviews []storage.ReportReview `json:"reviews"`
	}
	json.Unmarshal(w.Body.Bytes(), &detail)
	if len(detail.Reviews) != 2 || detail.Reviews[0].Revision != 2 {
		t.Fatal("review history lost")
	}
	securityCall(t, s, "GET", path+"/"+id+"/replay", "Bearer "+admin, "127.0.0.1:1", "", 200)
	securityCall(t, s, "GET", path+"/"+id+"/replay", "Bearer "+outsider, "127.0.0.1:1", "", 403)
	info, err := os.Stat(filepath.Join(s.cfg.DataDir, "moderator.token"))
	if err != nil || info.Mode().Perm()&0077 != 0 {
		t.Fatal("credential file permissions", err)
	}
}
func TestReportsValidateParticipantTickQuotaAndBoundedJSON(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	member, token, _ := s.repo.CreateProfile(ctx, "Reporter")
	_, other, _ := s.repo.CreateProfile(ctx, "Other")
	completedEvidence(t, s, "report-validation", member.ID, false, false)
	path := "/api/v1/reports"
	auth := "Bearer " + token
	securityCall(t, s, "POST", path, "Bearer "+other, "127.0.0.1:1", `{"match_id":"report-validation","tick":20,"reason":"Unrelated report"}`, 404)
	for _, body := range []string{
		`{"match_id":"report-validation","tick":101,"reason":"future"}`,
		`{"match_id":"report-validation","tick":20,"reason":"markup <b>"}`,
		`{"match_id":"report-validation","tick":20,"reason":"context","owner":"forged"}`,
		`{"match_id":"report-validation","tick":20,"reason":"context"} {}`,
		`{"match_id":"report-validation","tick":-1,"reason":"context"}`,
		`{"match_id":"report-validation","tick":20,"reason":"` + strings.Repeat("x", 10000) + `"}`,
	} {
		securityCall(t, s, "POST", path, auth, "127.0.0.1:1", body, 400)
	}
	for i := 0; i < 5; i++ {
		securityCall(t, s, "POST", path, auth, "127.0.0.1:1", fmt.Sprintf(`{"match_id":"report-validation","tick":%d,"reason":"event context"}`, i), 201)
	}
	securityCall(t, s, "POST", path, auth, "127.0.0.1:1", `{"match_id":"report-validation","tick":0,"reason":"event context"}`, 201)
	securityCall(t, s, "POST", path, auth, "127.0.0.1:1", `{"match_id":"report-validation","tick":9,"reason":"new event"}`, 429)
	for _, query := range []string{"limit=101", "status=invalid", "before=../../secret", "limit=0"} {
		securityCall(t, s, "GET", path+"?"+query, auth, "127.0.0.1:1", "", 400)
	}
}
func TestActiveReportsUseAuthorizedActorTick(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	member, token, _ := s.repo.CreateProfile(ctx, "Active member")
	engine, err := sim.New(s.catalog, sim.Config{Map: testMap(), Seed: 7, Players: []sim.PlayerConfig{{ID: 1, Name: "A", Faction: "US", Team: 1}, {ID: 2, Name: "B", Faction: "IR", Team: 2}}})
	if err != nil {
		t.Fatal(err)
	}
	m, err := newMatch("active-report", engine, []slot{{Player: 1, Profile: member.ID}, {Player: 2}}, s.repo, s.objects)
	if err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.matches[m.id] = m
	s.mu.Unlock()
	securityCall(t, s, "POST", "/api/v1/reports", "Bearer "+token, "127.0.0.1:1", `{"match_id":"active-report","tick":0,"reason":"Current event context"}`, 201)
	securityCall(t, s, "POST", "/api/v1/reports", "Bearer "+token, "127.0.0.1:1", `{"match_id":"active-report","tick":10000,"reason":"Future event context"}`, 400)
}
func TestCrossAccountSaveSettingsAndMalformedBearers(t *testing.T) {
	s, _ := testServer(t)
	ctx := context.Background()
	a, token, _ := s.repo.CreateProfile(ctx, "A")
	_, other, _ := s.repo.CreateProfile(ctx, "B")
	data := []byte(`{"sensitive":"own checkpoint"}`)
	if _, err := s.repo.PutSave(ctx, storage.Save{ID: "own-save", Owner: a.ID, Name: "Private", Data: data}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.repo.PutSettings(ctx, a.ID, 0, json.RawMessage(`{"private":"preference"}`)); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/v1/saves/own-save", "/api/v1/saves/own-save/download"} {
		securityCall(t, s, "GET", path, "Bearer "+other, "127.0.0.1:1", "", 404)
	}
	securityCall(t, s, "DELETE", "/api/v1/saves/own-save", "Bearer "+other, "127.0.0.1:1", `{"revision":1}`, 409)
	for _, path := range []string{"/api/v1/settings", "/api/v1/saves"} {
		w := securityCall(t, s, "GET", path, "Bearer "+other, "127.0.0.1:1", "", 200)
		if strings.Contains(w.Body.String(), "preference") || strings.Contains(w.Body.String(), "own-save") {
			t.Fatal("private storage leaked")
		}
	}
	w := securityCall(t, s, "GET", "/api/v1/saves/own-save/download", "Bearer "+token, "127.0.0.1:1", "", 200)
	if !bytes.Equal(w.Body.Bytes(), data) {
		t.Fatal("foreign delete affected owner")
	}
}
func TestReportAdmissionLimitsIgnoreForwardedIP(t *testing.T) {
	var gate admissionControl
	now := time.Now()
	r := httptest.NewRequest("POST", "/api/v1/reports", nil)
	r.RemoteAddr = "192.168.1.20:1"
	for i := 0; i < 30; i++ {
		r.Header.Set("X-Forwarded-For", fmt.Sprintf("10.0.0.%d", i))
		if !gate.allow(r, now) {
			t.Fatal("normal report admission")
		}
	}
	if gate.allow(r, now) {
		t.Fatal("forwarded headers bypassed report rate")
	}
	r.URL.Path = "/api/v1/social"
	if !gate.allow(r, now) {
		t.Fatal("reports consumed ordinary write budget")
	}
	r.URL.Path = "/api/v1/admin/reports"
	r.Method = "GET"
	for range 120 {
		if !gate.allow(r, now) {
			t.Fatal("moderation admission")
		}
	}
	if gate.allow(r, now) {
		t.Fatal("moderation burst unbounded")
	}
	if !gate.allow(r, now.Add(time.Minute)) {
		t.Fatal("moderation quota failed to reset")
	}
}
func TestModeratorCredentialRejectsUnsafeExistingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "moderator.token")
	if err := os.WriteFile(path, []byte(strings.Repeat("a", 64)), 0644); err != nil {
		t.Fatal(err)
	}
	if s, err := New(Config{DataDir: dir, MapDir: filepath.Join(dir, "none")}); err == nil {
		s.Close()
		t.Fatal("world-readable operator credential accepted")
	}
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{DataDir: dir, MapDir: filepath.Join(dir, "none")})
	if err != nil {
		t.Fatal("failed startup retained lock", err)
	}
	s.Close()
}

type changingChatBody struct {
	data   *strings.Reader
	change func()
}

func (r *changingChatBody) Read(p []byte) (int, error) {
	if r.change != nil {
		change := r.change
		r.change = nil
		change()
	}
	return r.data.Read(p)
}
func TestChatRejectsMembershipChangesDuringBodyRead(t *testing.T) {
	for _, change := range []string{"team", "kick", "start"} {
		t.Run(change, func(t *testing.T) {
			s, _ := testServer(t)
			ctx := context.Background()
			sender, token, _ := s.repo.CreateProfile(ctx, "Sender")
			ally, _, _ := s.repo.CreateProfile(ctx, "Ally")
			s.mu.Lock()
			s.lobbies["chat-room"] = &Lobby{ID: "chat-room", Slots: []LobbySlot{{Player: 1, Profile: sender.ID, Team: 1}, {Player: 2, Profile: ally.ID, Team: 1}}}
			s.mu.Unlock()
			body := &changingChatBody{data: strings.NewReader(`{"text":"private team plan","team_only":true}`), change: func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				l := s.lobbies["chat-room"]
				switch change {
				case "team":
					l.Slots[0].Team = 2
				case "kick":
					l.Slots = l.Slots[1:]
				case "start":
					l.MatchID = "new-match"
					s.matches[l.MatchID] = &liveMatch{}
				}
			}}
			r := httptest.NewRequest("POST", "/api/v1/lobbies/chat-room/chat", body)
			r.RemoteAddr = "127.0.0.1:1"
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			// The inert actor is only an identity marker for the membership race.
			s.mu.Lock()
			delete(s.matches, "new-match")
			s.mu.Unlock()
			if w.Code != 409 {
				t.Fatal("stale membership sent chat", w.Code, w.Body.String())
			}
			messages, err := s.repo.ReadChat(ctx, ally.ID, "chat-room", 1, 0)
			if err != nil || len(messages) != 0 {
				t.Fatal("stale-team message persisted", messages, err)
			}
		})
	}
}
