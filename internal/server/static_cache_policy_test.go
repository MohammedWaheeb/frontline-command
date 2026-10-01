package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// These tests call ServeHTTP directly. They open no host or httptest listener.
func staticCacheFixture(t *testing.T) (*Server, string) {
	t.Helper()
	root := t.TempDir()
	public := filepath.Join(root, "public")
	if err := os.MkdirAll(public, 0700); err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{
		DataDir:    filepath.Join(root, "records"),
		StaticDir:  public,
		MapDir:     filepath.Join(root, "no-maps"),
		MissionDir: filepath.Join(root, "no-missions"),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s, public
}

func staticCacheWrite(t *testing.T, root, name string, data []byte, modified time.Time) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0600); err != nil {
		t.Fatal(err)
	}
	if !modified.IsZero() {
		if err := os.Chtimes(p, modified, modified); err != nil {
			t.Fatal(err)
		}
	}
}

func staticCacheRequest(t *testing.T, s *Server, method, target, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, "http://localhost:8999"+target, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:41000"
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func staticCacheHeaders(t *testing.T, w *httptest.ResponseRecorder, status int, policy string) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status = %d, want %d; body %q", w.Code, status, w.Body.Bytes())
	}
	if got := w.Result().Header.Get("Cache-Control"); got != policy {
		t.Errorf("Cache-Control = %q, want %q", got, policy)
	}
	if got := w.Result().Header.Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := w.Result().Header.Get("Referrer-Policy"); got != "same-origin" {
		t.Errorf("Referrer-Policy = %q, want same-origin", got)
	}
}

func staticCacheExactBody(t *testing.T, w *httptest.ResponseRecorder, want []byte) {
	t.Helper()
	response := w.Result()
	defer response.Body.Close()
	got, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) || sha256.Sum256(got) != sha256.Sum256(want) {
		t.Fatalf("body differs: received %d bytes, want %d", len(got), len(want))
	}
	if response.ContentLength != int64(len(want)) {
		t.Errorf("Content-Length = %d, want %d", response.ContentLength, len(want))
	}
	var extra [1]byte
	if n, err := response.Body.Read(extra[:]); n != 0 || err != io.EOF {
		t.Errorf("body after full read = (%d, %v), want (0, EOF)", n, err)
	}
}

func TestStaticCachePolicyPublicBodies(t *testing.T) {
	s, public := staticCacheFixture(t)
	modified := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	files := []struct {
		name, target, mediaType string
		data                    []byte
	}{
		{"index.html", "/", "text/html", []byte("<!doctype html><title>Local Frontline fixture</title>\n")},
		{"runtime.js", "/runtime.js", "text/javascript", []byte("export const fixture = 'first-package';\n")},
		{"runtime.css", "/runtime.css", "text/css", []byte("body { color: #123456; }\n")},
		{"pack/base.manifest.json", "/pack/base.manifest.json", "application/json", []byte(`{"format_version":1,"fixture":"local"}`)},
		{"runtime.wasm", "/runtime.wasm", "application/wasm", []byte{0, 'a', 's', 'm', 1, 0, 0, 0}},
		{"sound.ogg", "/sound.ogg", "audio/ogg", []byte("OggS\x00\x02private-test-fixture")},
	}
	for _, file := range files {
		staticCacheWrite(t, public, file.name, file.data, modified)
		t.Run(file.name, func(t *testing.T) {
			w := staticCacheRequest(t, s, "GET", file.target, "", nil)
			staticCacheHeaders(t, w, http.StatusOK, "no-cache")
			mediaType, _, err := mime.ParseMediaType(w.Result().Header.Get("Content-Type"))
			if err != nil || mediaType != file.mediaType {
				t.Errorf("Content-Type = %q, want %s; parse error %v", w.Result().Header.Get("Content-Type"), file.mediaType, err)
			}
			if got := w.Result().Header.Get("Last-Modified"); got != modified.Format(http.TimeFormat) {
				t.Errorf("Last-Modified = %q", got)
			}
			if got := w.Result().Header.Get("Accept-Ranges"); got != "bytes" {
				t.Errorf("Accept-Ranges = %q", got)
			}
			staticCacheExactBody(t, w, file.data)
		})
	}
	t.Run("same-origin static request", func(t *testing.T) {
		w := staticCacheRequest(t, s, "GET", "/runtime.js", "", map[string]string{"Origin": "http://localhost:8999"})
		staticCacheHeaders(t, w, http.StatusOK, "no-cache")
		if got := w.Result().Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:8999" {
			t.Errorf("Access-Control-Allow-Origin = %q", got)
		}
		if got := w.Result().Header.Get("Vary"); got != "Origin" {
			t.Errorf("Vary = %q", got)
		}
		staticCacheExactBody(t, w, files[1].data)
	})
}

func TestStaticCachePolicyHeadRangeAndConditional(t *testing.T) {
	s, public := staticCacheFixture(t)
	data := []byte("0123456789abcdef")
	modified := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	staticCacheWrite(t, public, "bytes.txt", data, modified)
	lastModified := modified.Format(http.TimeFormat)
	cases := []struct {
		name, method string
		headers      map[string]string
		status       int
		body         []byte
		length       string
		contentRange string
	}{
		{"HEAD", "HEAD", nil, 200, nil, "16", ""},
		{"range", "GET", map[string]string{"Range": "bytes=2-5"}, 206, data[2:6], "4", "bytes 2-5/16"},
		{"HEAD range", "HEAD", map[string]string{"Range": "bytes=2-5"}, 206, nil, "4", "bytes 2-5/16"},
		{"modified-since GET", "GET", map[string]string{"If-Modified-Since": lastModified}, 304, nil, "", ""},
		{"modified-since HEAD", "HEAD", map[string]string{"If-Modified-Since": lastModified}, 304, nil, "", ""},
		{"older modified-since", "GET", map[string]string{"If-Modified-Since": modified.Add(-time.Minute).Format(http.TimeFormat)}, 200, data, "16", ""},
		{"if-none-match existence", "GET", map[string]string{"If-None-Match": "*"}, 304, nil, "", ""},
		{"matching if-range", "GET", map[string]string{"Range": "bytes=2-5", "If-Range": lastModified}, 206, data[2:6], "4", "bytes 2-5/16"},
		{"stale if-range", "GET", map[string]string{"Range": "bytes=2-5", "If-Range": modified.Add(-time.Minute).Format(http.TimeFormat)}, 200, data, "16", ""},
		{"failed unmodified-since", "GET", map[string]string{"If-Unmodified-Since": modified.Add(-time.Minute).Format(http.TimeFormat)}, 412, nil, "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := staticCacheRequest(t, s, tc.method, "/bytes.txt", "", tc.headers)
			staticCacheHeaders(t, w, tc.status, "no-cache")
			if !bytes.Equal(w.Body.Bytes(), tc.body) || sha256.Sum256(w.Body.Bytes()) != sha256.Sum256(tc.body) {
				t.Errorf("body = %q, want %q", w.Body.Bytes(), tc.body)
			}
			if got := w.Result().Header.Get("Content-Length"); got != tc.length {
				t.Errorf("Content-Length = %q, want %q", got, tc.length)
			}
			if got := w.Result().Header.Get("Content-Range"); got != tc.contentRange {
				t.Errorf("Content-Range = %q, want %q", got, tc.contentRange)
			}
		})
	}
	// Go's ServeContent removes cache headers from its own file errors. The
	// route wrapper must preserve this standard behavior rather than mask it.
	t.Run("invalid range retains FileServer error behavior", func(t *testing.T) {
		t.Setenv("GODEBUG", "httpservecontentkeepheaders=0")
		w := staticCacheRequest(t, s, "GET", "/bytes.txt", "", map[string]string{"Range": "bytes=99-100"})
		staticCacheHeaders(t, w, http.StatusRequestedRangeNotSatisfiable, "")
		if got := w.Result().Header.Get("Content-Range"); got != "bytes */16" {
			t.Errorf("Content-Range = %q, want bytes */16", got)
		}
	})
}

func TestStaticCachePolicyRegeneratedSamePath(t *testing.T) {
	s, public := staticCacheFixture(t)
	oldBytes := []byte("export const build = 'old';\n")
	newBytes := []byte("export const build = 'new';\n")
	if len(oldBytes) != len(newBytes) || sha256.Sum256(oldBytes) == sha256.Sum256(newBytes) {
		t.Fatal("replacement fixture must have the same size and a different hash")
	}
	modified := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	staticCacheWrite(t, public, "runtime.js", oldBytes, modified)
	before := staticCacheRequest(t, s, "GET", "/runtime.js", "", nil)
	staticCacheHeaders(t, before, http.StatusOK, "no-cache")
	staticCacheExactBody(t, before, oldBytes)
	validator := before.Result().Header.Get("Last-Modified")
	unchanged := staticCacheRequest(t, s, "GET", "/runtime.js", "", map[string]string{"If-Modified-Since": validator})
	staticCacheHeaders(t, unchanged, http.StatusNotModified, "no-cache")
	if unchanged.Body.Len() != 0 {
		t.Fatal("unchanged conditional response has a body")
	}
	staticCacheWrite(t, public, "runtime.js", newBytes, modified.Add(time.Minute))
	after := staticCacheRequest(t, s, "GET", "/runtime.js", "", map[string]string{"If-Modified-Since": validator})
	staticCacheHeaders(t, after, http.StatusOK, "no-cache")
	staticCacheExactBody(t, after, newBytes)
	if after.Result().Header.Get("Last-Modified") == validator {
		t.Fatal("replacement retained the stale Last-Modified validator")
	}
}

func TestStaticCachePolicyAPIAndRejectionsRemainNoStore(t *testing.T) {
	s, public := staticCacheFixture(t)
	staticCacheWrite(t, public, "runtime.js", []byte("export const local = true;\n"), time.Time{})
	// Overlapping public files cannot outrank registered authenticated or
	// health API routes in the existing ServeMux.
	spoof := []byte("public fixture must not replace an API response")
	staticCacheWrite(t, public, "api/v1/health", spoof, time.Time{})
	staticCacheWrite(t, public, "api/v1/profiles/me", spoof, time.Time{})
	staticCacheWrite(t, public, "api/v1/maps/missing-map", spoof, time.Time{})
	cases := []struct {
		name, method, target, body, code string
		headers                          map[string]string
		status                           int
	}{
		{"health GET", "GET", "/api/v1/health", "", "", nil, 200},
		{"health HEAD", "HEAD", "/api/v1/health", "", "", nil, 200},
		{"catalog GET", "GET", "/api/v1/content", "", "", nil, 200},
		{"profile authentication", "GET", "/api/v1/profiles/me", "", "authentication_required", nil, 401},
		{"invalid bearer", "GET", "/api/v1/profiles/me", "", "authentication_required", map[string]string{"Authorization": "Bearer invalid-fixture"}, 401},
		{"save authentication", "GET", "/api/v1/saves", "", "authentication_required", nil, 401},
		{"moderator authentication", "GET", "/api/v1/admin/reports", "", "local_moderator_required", nil, 403},
		{"API missing map", "GET", "/api/v1/maps/missing-map", "", "map_missing", nil, 404},
		{"malformed API input", "POST", "/api/v1/profiles", `{"name":"Fixture","admin":true}`, "invalid_request", nil, 400},
		{"rejected static origin", "GET", "/runtime.js", "", "origin_not_allowed", map[string]string{"Origin": "https://untrusted.example"}, 403},
		{"rejected API origin", "GET", "/api/v1/health", "", "origin_not_allowed", map[string]string{"Origin": "https://untrusted.example"}, 403},
		{"static wrong method", "POST", "/runtime.js", "", "", nil, 405},
		{"static preflight", "OPTIONS", "/runtime.js", "", "", map[string]string{"Origin": "http://localhost:8999"}, 204},
		{"API preflight", "OPTIONS", "/api/v1/health", "", "", map[string]string{"Origin": "http://localhost:8999"}, 204},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := staticCacheRequest(t, s, tc.method, tc.target, tc.body, tc.headers)
			staticCacheHeaders(t, w, tc.status, "no-store")
			if bytes.Contains(w.Body.Bytes(), spoof) {
				t.Fatal("static fixture bypassed API route")
			}
			if tc.code != "" {
				var failure struct {
					Code string `json:"code"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &failure); err != nil || failure.Code != tc.code {
					t.Errorf("API failure code = %q, want %q; parse error %v", failure.Code, tc.code, err)
				}
			}
		})
	}
	t.Run("API admission rejection", func(t *testing.T) {
		// Exercise the actual 600-request window, using a separate address so
		// the preceding API assertions cannot change the deterministic count.
		for i := 0; i < 601; i++ {
			r := httptest.NewRequest("GET", "http://localhost:8999/api/v1/health", nil)
			r.RemoteAddr = "127.0.0.2:41000"
			w := httptest.NewRecorder()
			s.ServeHTTP(w, r)
			status := http.StatusOK
			if i == 600 {
				status = http.StatusTooManyRequests
				if got := w.Result().Header.Get("Retry-After"); got != "60" {
					t.Errorf("Retry-After = %q, want 60", got)
				}
			}
			staticCacheHeaders(t, w, status, "no-store")
		}
	})
}

func TestStaticCachePolicyFilesystemConfinement(t *testing.T) {
	t.Setenv("GODEBUG", "httpservecontentkeepheaders=0")
	s, public := staticCacheFixture(t)
	secret := []byte("owned private marker outside the public root")
	staticCacheWrite(t, filepath.Dir(public), "private-marker.txt", secret, time.Time{})
	staticCacheWrite(t, s.cfg.DataDir, "objects/private-marker.txt", secret, time.Time{})
	cases := []struct {
		name, target, policy string
		status               int
	}{
		{"private sibling", "/private-marker.txt", "", 404},
		{"plain parent traversal", "/../private-marker.txt", "no-store", http.StatusTemporaryRedirect},
		{"encoded parent traversal", "/%2e%2e/private-marker.txt", "", 404},
		{"nested encoded traversal", "/assets/%2e%2e/%2e%2e/private-marker.txt", "", 404},
		{"data database", "/records/frontline.db", "", 404},
		{"operator credential", "/records/moderator.token", "", 404},
		{"private object", "/records/objects/private-marker.txt", "", 404},
		{"absent public file", "/missing.wasm", "", 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := staticCacheRequest(t, s, "GET", tc.target, "", nil)
			staticCacheHeaders(t, w, tc.status, tc.policy)
			if bytes.Contains(w.Body.Bytes(), secret) || strings.Contains(w.Body.String(), "SQLite format") {
				t.Fatal("private data escaped the configured public root")
			}
			if tc.status == http.StatusTemporaryRedirect {
				if got := w.Result().Header.Get("Location"); got != "/private-marker.txt" {
					t.Errorf("Location = %q", got)
				}
			}
		})
	}
	// Verify the actual credential bytes are not exposed; never print them.
	credential, err := os.ReadFile(filepath.Join(s.cfg.DataDir, "moderator.token"))
	if err != nil {
		t.Fatal(err)
	}
	response := staticCacheRequest(t, s, "GET", "/records/moderator.token", "", nil)
	if bytes.Contains(response.Body.Bytes(), bytes.TrimSpace(credential)) {
		t.Fatal("private operator credential appeared in a static response")
	}
}

func TestStaticCachePolicyDisabledStaticRoute(t *testing.T) {
	root := t.TempDir()
	s, err := New(Config{DataDir: filepath.Join(root, "records"), MapDir: filepath.Join(root, "no-maps"), MissionDir: filepath.Join(root, "no-missions")})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	w := staticCacheRequest(t, s, "GET", "/runtime.js", "", nil)
	staticCacheHeaders(t, w, http.StatusNotFound, "no-store")
	if got := w.Result().Header.Get("Content-Length"); got != "" {
		if length, err := strconv.Atoi(got); err != nil || length != w.Body.Len() {
			t.Errorf("disabled static route length = %q", got)
		}
	}
}
