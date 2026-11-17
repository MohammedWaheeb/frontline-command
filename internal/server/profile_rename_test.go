package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"frontlinecommand/internal/storage"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type renameProfileFunc func(context.Context, string, string) (storage.Profile, error)

func (f renameProfileFunc) RenameProfile(ctx context.Context, id, name string) (storage.Profile, error) {
	return f(ctx, id, name)
}

func renameRequest(t *testing.T, s *Server, repo profileRenamer, token, name string) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(map[string]string{"name": name})
	r := httptest.NewRequest("PATCH", "/api/v1/profiles/me", bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	s.renameProfileUsing(w, r, repo)
	return w
}

func TestNet2ProfileRenameValidationAndRoster(t *testing.T) {
	s, h := testServer(t)
	token := profile(t, h, "Original")
	otherToken := profile(t, h, "Other")
	p, _ := s.repo.Authenticate(context.Background(), token)
	other, _ := s.repo.Authenticate(context.Background(), otherToken)
	m := testMap()
	s.maps[m.ID] = m
	l := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", token, map[string]any{"map_id": m.ID, "mode": "custom", "faction": "US"}, 201))
	s.mu.Lock()
	s.lobbies[l.ID].Slots[0].Ready = true
	s.lobbies[l.ID].Slots[0].AssetsReady = true
	s.invites = map[string]*LobbyInvite{"pending": {Sender: p.ID, SenderName: p.Name}, "other": {Sender: other.ID, SenderName: other.Name}}
	s.queue = map[string]*queueEntry{p.ID: {Profile: p}}
	s.mu.Unlock()
	calls := 0
	repo := renameProfileFunc(func(_ context.Context, id, name string) (storage.Profile, error) {
		calls++
		if id != p.ID {
			t.Fatalf("wrong target %q", id)
		}
		v := p
		v.Name = name
		return v, nil
	})
	for _, name := range []string{"", " \t\n", strings.Repeat("界", 33), "A\x00B", "A\nB", "A\u200dB", "<Commander>", "A>B"} {
		w := renameRequest(t, s, repo, token, name)
		if w.Code != 400 || !strings.Contains(w.Body.String(), "invalid_profile") {
			t.Fatalf("invalid %q: %d %s", name, w.Code, w.Body.String())
		}
	}
	if calls != 0 {
		t.Fatal("invalid name reached persistence")
	}
	// Duplicate display names are allowed at creation and rename alike.
	for _, name := range []string{"  Other  ", strings.Repeat("界", 32), "قائد - 7_!"} {
		w := renameRequest(t, s, repo, token, name)
		if w.Code != 200 {
			t.Fatalf("rename %q: %d %s", name, w.Code, w.Body.String())
		}
		var renamed storage.Profile
		if err := json.Unmarshal(w.Body.Bytes(), &renamed); err != nil {
			t.Fatal(err)
		}
		if renamed.ID != p.ID || renamed.Created != p.Created || renamed.Name != strings.TrimSpace(name) || !renamed.Local {
			t.Fatal("identity changed", renamed)
		}
		got := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, token, nil, 200))
		if got.Slots[0].Name != renamed.Name || got.Revision != l.Revision || !got.Slots[0].Ready || !got.Slots[0].AssetsReady {
			t.Fatal("cosmetic rename changed readiness or was not reflected", got)
		}
		s.mu.Lock()
		if s.invites["pending"].SenderName != renamed.Name || s.invites["other"].SenderName != other.Name || s.queue[p.ID].Profile.Name != renamed.Name {
			t.Fatal("stale cached names")
		}
		s.mu.Unlock()
	}
	before := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, token, nil, 200))
	failure := renameProfileFunc(func(context.Context, string, string) (storage.Profile, error) {
		return storage.Profile{}, errors.New("private database detail")
	})
	w := renameRequest(t, s, failure, token, "Failed name")
	if w.Code != 500 || strings.Contains(w.Body.String(), "private database detail") {
		t.Fatal(w.Code, w.Body.String())
	}
	after := responseLobby(t, request(t, h, "GET", "/api/v1/lobbies/"+l.ID, token, nil, 200))
	if after.Slots[0].Name != before.Slots[0].Name {
		t.Fatal("failed persistence changed roster")
	}
	if w = renameRequest(t, s, repo, "", "Name"); w.Code != 401 {
		t.Fatal("unauthenticated rename", w.Code)
	}
}

func TestNet2ProfileRenameStorageCapability(t *testing.T) {
	s, h := testServer(t)
	token := profile(t, h, "Before")
	before, _ := s.repo.Authenticate(context.Background(), token)
	if _, ok := any(s.repo).(profileRenamer); !ok {
		request(t, h, "PATCH", "/api/v1/profiles/me", token, map[string]any{"name": "After"}, 501)
		request(t, h, "PATCH", "/api/v1/profiles/me", token, map[string]any{"name": "<invalid>"}, 400)
		t.Log("persistent rename unavailable: internal/storage.SQLite lacks RenameProfile; explicit 501 verified")
		return
	}
	request(t, h, "PATCH", "/api/v1/profiles/me", token, map[string]any{"name": "After"}, 200)
	after, err := s.repo.Authenticate(context.Background(), token)
	if err != nil || after.ID != before.ID || after.Created != before.Created || after.Name != "After" {
		t.Fatal("persistent rename lost identity/token", after, err)
	}
	request(t, h, "PATCH", "/api/v1/profiles/me", token, map[string]any{"name": ""}, 400)
	after, err = s.repo.Authenticate(context.Background(), token)
	if err != nil || after.Name != "After" {
		t.Fatal("invalid rename altered row", after, err)
	}
}

var _ http.Handler = (*Server)(nil)
