package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type requestWindow struct {
	started time.Time
	count   int
}
type admissionControl struct {
	mu      sync.Mutex
	windows map[string]requestWindow
}

func (a *admissionControl) allow(r *http.Request, now time.Time) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		return true
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	category, limit := "read", 600
	if r.Method != "GET" {
		category, limit = "write", 120
	}
	if r.URL.Path == "/api/v1/profiles" && r.Method == "POST" {
		category, limit = "profile", 10
	}
	if (r.URL.Path == "/api/v1/reports" || strings.HasPrefix(r.URL.Path, "/api/v1/maps/") && strings.HasSuffix(r.URL.Path, "/reports")) && r.Method == "POST" {
		category, limit = "report", 30
	}
	if strings.HasPrefix(r.URL.Path, "/api/v1/admin/") {
		category, limit = "moderation", 120
	}
	if strings.HasSuffix(r.URL.Path, "/advice") && r.Method == "POST" {
		category, limit = "advice", 300
	}
	if strings.HasSuffix(r.URL.Path, "/socket") {
		category, limit = "socket", 16
	}
	key := ip + ":" + category
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.windows == nil {
		a.windows = map[string]requestWindow{}
	}
	if len(a.windows) >= 8192 {
		for k, v := range a.windows {
			if now.Sub(v.started) >= time.Minute {
				delete(a.windows, k)
			}
		}
		if _, ok := a.windows[key]; !ok && len(a.windows) >= 8192 {
			return false
		}
	}
	v := a.windows[key]
	if now.Sub(v.started) >= time.Minute {
		v = requestWindow{started: now}
	}
	v.count++
	a.windows[key] = v
	return v.count <= limit
}
