package server

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"
)

type requestWindow struct {
	started time.Time
	count   int
}
type admissionControl struct {
	loadProfile bool
	// trusted lists reverse proxies whose X-Forwarded-For is believed. Empty
	// (the default) keys every limit on the TCP peer address.
	trusted []netip.Prefix
	mu      sync.Mutex
	windows map[string]requestWindow
}

// Socket upgrades get a generous per-IP flood bound, while only failed
// hello/token authentications consume the tight failure budget. Counting
// every attempt (the previous behavior) 429s legitimate authenticated
// reconnects inside their grace window until the match surrenders them.
const (
	socketFloodLimit   = 240
	socketFailureLimit = 16
)

func remoteIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// clientIP is the address limits and loopback-only checks apply to. Behind
// a configured trusted proxy every player shares the proxy's TCP address, so
// X-Forwarded-For is walked right to left past trusted hops and the first
// untrusted entry is the client. Entries left of it are client-supplied and
// never consulted, so a spoofed header cannot claim another address.
func (a *admissionControl) clientIP(r *http.Request) string {
	peer := remoteIP(r)
	if len(a.trusted) == 0 || !a.trustedAddr(peer) {
		return peer
	}
	hops := []string{}
	for _, header := range r.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(header, ",")...)
	}
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		addr, err := netip.ParseAddr(hop)
		if err != nil {
			// A malformed hop cannot be attributed; key it on the proxy.
			return peer
		}
		if !a.trustedAddr(hop) {
			return addr.Unmap().String()
		}
	}
	return peer
}

func (a *admissionControl) trustedAddr(ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	for _, prefix := range a.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// windowCountLocked reports the current minute-window count without
// incrementing it. Caller holds a.mu.
func (a *admissionControl) windowCountLocked(key string, now time.Time) int {
	v := a.windows[key]
	if now.Sub(v.started) >= time.Minute {
		return 0
	}
	return v.count
}

// bumpLocked records one hit against key and returns the new count, or -1
// when the window table is full of live entries. Caller holds a.mu.
func (a *admissionControl) bumpLocked(key string, now time.Time) int {
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
			return -1
		}
	}
	v := a.windows[key]
	if now.Sub(v.started) >= time.Minute {
		v = requestWindow{started: now}
	}
	v.count++
	a.windows[key] = v
	return v.count
}

// noteSocketFailure records a failed socket hello/token authentication so
// credential guessing stays rate limited without punishing reconnects that
// authenticate successfully.
func (a *admissionControl) noteSocketFailure(r *http.Request, now time.Time) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.bumpLocked(a.clientIP(r)+":socket-failed", now)
}

func (a *admissionControl) allow(r *http.Request, now time.Time) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/") {
		return true
	}
	ip := a.clientIP(r)
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
	isSocket := strings.HasSuffix(r.URL.Path, "/socket")
	if isSocket {
		category, limit = "socket", socketFloodLimit
	}
	loadLoopback := a.loadProfile && loopbackRemote(r.RemoteAddr)
	if a.loadProfile && loopbackRemote(r.RemoteAddr) {
		switch category {
		case "profile", "socket":
			limit = 500
		case "read":
			limit = 12000
		case "write":
			limit = 6000
		case "advice":
			limit = 3000
		}
	}
	key := ip + ":" + category
	a.mu.Lock()
	defer a.mu.Unlock()
	if isSocket && !loadLoopback && a.windowCountLocked(ip+":socket-failed", now) >= socketFailureLimit {
		return false
	}
	count := a.bumpLocked(key, now)
	return count >= 0 && count <= limit
}
