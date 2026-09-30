package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadProfileBindValidation(t *testing.T) {
	for _, address := range []string{"127.0.0.1:8097", "127.2.3.4:0", "[::1]:8097", "[::ffff:127.0.0.1]:8097"} {
		if err := validateLoadProfile(Config{LoadProfile: Loopback500LoadProfile, ListenAddress: address}); err != nil {
			t.Errorf("literal loopback %q: %v", address, err)
		}
	}
	for _, address := range []string{"", "localhost:8097", ":8097", "0.0.0.0:8097", "[::]:8097", "192.168.1.2:8097", "127.0.0.1", "garbage"} {
		if err := validateLoadProfile(Config{LoadProfile: Loopback500LoadProfile, ListenAddress: address}); err == nil {
			t.Errorf("accepted unsafe bind %q", address)
		}
	}
	if err := validateLoadProfile(Config{LoadProfile: "arbitrary", ListenAddress: "127.0.0.1:0"}); err == nil {
		t.Fatal("unknown profile accepted")
	}
	if err := validateLoadProfile(Config{ListenAddress: "0.0.0.0:0"}); err != nil {
		t.Fatal("normal configuration changed", err)
	}
}

func TestLoadProfileRemoteGuardIgnoresForwardedLoopback(t *testing.T) {
	s := &Server{cfg: Config{LoadProfile: Loopback500LoadProfile}, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /proof", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	for _, remote := range []string{"192.168.1.2:12345", "[2001:db8::1]:12345", "localhost:12345", "127.0.0.1"} {
		req := httptest.NewRequest("GET", "/proof", nil)
		req.RemoteAddr = remote
		req.Header.Set("X-Forwarded-For", "127.0.0.1")
		response := httptest.NewRecorder()
		s.ServeHTTP(response, req)
		if response.Code != 403 {
			t.Errorf("remote %q: status %d", remote, response.Code)
		}
	}
	req := httptest.NewRequest("GET", "/proof", nil)
	req.RemoteAddr = "[::1]:12345"
	response := httptest.NewRecorder()
	s.ServeHTTP(response, req)
	if response.Code != 204 {
		t.Fatal("literal loopback denied", response.Code)
	}
}

func TestLoadProfileRateLimitsKeepNormalSecurity(t *testing.T) {
	cases := []struct {
		method, path string
		normal, load int
	}{
		{"POST", "/api/v1/profiles", 10, 500},
		{"GET", "/api/v1/matches/example/socket", 16, 500},
		{"GET", "/api/v1/health", 600, 12000},
		{"POST", "/api/v1/lobbies", 120, 6000},
		{"POST", "/api/v1/matches/example/advice", 300, 3000},
		{"POST", "/api/v1/reports", 30, 30},
		{"POST", "/api/v1/admin/example", 120, 120},
	}
	for _, tc := range cases {
		for _, load := range []bool{false, true} {
			for _, remote := range []string{"127.0.0.1:12345", "192.168.1.2:12345"} {
				a := admissionControl{loadProfile: load}
				limit := tc.normal
				if load && loopbackRemote(remote) {
					limit = tc.load
				}
				r := httptest.NewRequest(tc.method, tc.path, nil)
				r.RemoteAddr = remote
				now := time.Unix(100000, 0)
				for i := 0; i < limit; i++ {
					if !a.allow(r, now) {
						t.Fatalf("%s load=%v remote=%s rejected request %d/%d", tc.path, load, remote, i+1, limit)
					}
				}
				if a.allow(r, now) {
					t.Fatalf("%s exceeded bound %d", tc.path, limit)
				}
				if !a.allow(r, now.Add(time.Minute)) {
					t.Fatal("next window denied")
				}
			}
		}
	}
}

func TestLoadProfileFiveHundredSocketBoundAndRelease(t *testing.T) {
	s := &Server{cfg: Config{LoadProfile: Loopback500LoadProfile}, loadSockets: make(chan struct{}, 500)}
	for i := 0; i < 500; i++ {
		if !s.reserveLoadSocket() {
			t.Fatalf("socket %d rejected", i+1)
		}
	}
	if s.reserveLoadSocket() {
		t.Fatal("501st socket admitted")
	}
	s.releaseLoadSocket()
	if !s.reserveLoadSocket() {
		t.Fatal("released slot unavailable")
	}
	r := httptest.NewRequest("GET", "/api/v1/matches/missing/socket", nil)
	w := httptest.NewRecorder()
	s.matchSocket(w, r)
	if w.Code != 429 {
		t.Fatalf("socket endpoint cap status %d", w.Code)
	}
	for i := 0; i < 500; i++ {
		s.releaseLoadSocket()
	}
	if len(s.loadSockets) != 0 {
		t.Fatal("socket permits leaked")
	}
	normal := &Server{}
	for i := 0; i < 501; i++ {
		if !normal.reserveLoadSocket() {
			t.Fatal("normal admission changed")
		}
		normal.releaseLoadSocket()
	}
}

func TestLoadProfileLobbyCeilingAndMetrics(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		cfg := Config{DataDir: t.TempDir(), MapDir: filepath.Join(t.TempDir(), "absent"), MissionDir: filepath.Join(t.TempDir(), "absent")}
		if enabled {
			cfg.LoadProfile = Loopback500LoadProfile
			cfg.ListenAddress = "127.0.0.1:0"
			cfg.StateUpdatesPerSecond = 20
		}
		s, err := New(cfg)
		if err != nil {
			t.Fatal(err)
		}
		h := httptest.NewServer(s)
		t.Cleanup(func() { h.Close(); s.Close() })
		a, b := profile(t, h, "Boundary A"), profile(t, h, "Boundary B")
		m := testMap()
		s.maps[m.ID] = m
		ceiling := 64
		if enabled {
			ceiling = 125
		}
		for i := 0; i < ceiling-1; i++ {
			id := fmt.Sprintf("existing-%d", i)
			s.lobbies[id] = &Lobby{ID: id, Created: time.Now().Unix()}
		}
		request(t, h, "POST", "/api/v1/lobbies", a, map[string]any{"map_id": m.ID, "mode": "custom", "private": true, "faction": "US"}, 201)
		response := request(t, h, "POST", "/api/v1/lobbies", b, map[string]any{"map_id": m.ID, "mode": "custom", "private": true, "faction": "IR"}, 429)
		var code string
		json.Unmarshal(response["code"], &code)
		if code != "lobby_limit" {
			t.Fatal("wrong ceiling rejection", code)
		}
		if len(s.lobbies) != ceiling {
			t.Fatalf("lobbies %d want %d", len(s.lobbies), ceiling)
		}
		if enabled {
			metrics := request(t, h, "GET", "/api/v1/load/metrics", "", nil, 200)
			var active int
			json.Unmarshal(metrics["active_socket_handlers"], &active)
			if active != 0 {
				t.Fatal("fake active sockets", active)
			}
			if string(metrics["state_updates_hz"]) != "20" {
				t.Fatal("configured cadence missing", metrics)
			}
			if len(metrics["heap_alloc_bytes"]) == 0 {
				t.Fatal("real heap telemetry absent")
			}
		} else {
			req, err := http.NewRequest("GET", h.URL+"/api/v1/load/metrics", nil)
			if err != nil {
				t.Fatal(err)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			resp.Body.Close()
			if resp.StatusCode != 404 {
				t.Fatal("normal host exposes load metrics", resp.StatusCode)
			}
		}
	}
}

func TestLoadProfileStateRateValidation(t *testing.T) {
	for _, rate := range []int{-1, 1, 9, 11, 21} {
		if _, err := New(Config{StateUpdatesPerSecond: rate}); err == nil {
			t.Fatalf("invalid rate %d accepted", rate)
		}
	}
}
