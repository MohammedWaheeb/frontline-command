package server

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestClientIPTrustsOnlyConfiguredProxies(t *testing.T) {
	a := &admissionControl{trusted: []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32"), netip.MustParsePrefix("10.0.0.0/8")}}
	cases := []struct {
		remote, forwarded, want string
	}{
		// No proxy configured for this peer: the header is ignored.
		{"203.0.113.9:4000", "198.51.100.1", "203.0.113.9"},
		// Trusted proxy without a header keys on the proxy itself.
		{"127.0.0.1:4000", "", "127.0.0.1"},
		{"127.0.0.1:4000", "198.51.100.1", "198.51.100.1"},
		// A client-supplied left entry cannot impersonate loopback.
		{"127.0.0.1:4000", "127.0.0.1, 198.51.100.1", "198.51.100.1"},
		// Chained trusted hops are skipped right to left.
		{"127.0.0.1:4000", "198.51.100.1, 10.1.2.3", "198.51.100.1"},
		{"127.0.0.1:4000", "::ffff:198.51.100.7", "198.51.100.7"},
		// Every hop trusted: the leftmost real address is still a proxy.
		{"127.0.0.1:4000", "10.0.0.5", "127.0.0.1"},
		{"127.0.0.1:4000", "garbage", "127.0.0.1"},
	}
	for _, c := range cases {
		r := httptest.NewRequest("GET", "/api/v1/health", nil)
		r.RemoteAddr = c.remote
		if c.forwarded != "" {
			r.Header.Set("X-Forwarded-For", c.forwarded)
		}
		if got := a.clientIP(r); got != c.want {
			t.Errorf("remote %s XFF %q: got %s want %s", c.remote, c.forwarded, got, c.want)
		}
	}
	untrusting := &admissionControl{}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "127.0.0.1:4000"
	r.Header.Set("X-Forwarded-For", "198.51.100.1")
	if got := untrusting.clientIP(r); got != "127.0.0.1" {
		t.Fatalf("default configuration trusted a forwarded header: %s", got)
	}
}

func TestTrustedProxyRateLimitsPerClient(t *testing.T) {
	a := &admissionControl{trusted: []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}}
	now := time.Now()
	request := func(client string) *http.Request {
		r := httptest.NewRequest("POST", "/api/v1/profiles", nil)
		r.RemoteAddr = "127.0.0.1:5000"
		r.Header.Set("X-Forwarded-For", client)
		return r
	}
	for i := 0; i < 10; i++ {
		if !a.allow(request("198.51.100.1"), now) {
			t.Fatalf("first client denied at %d", i)
		}
	}
	if a.allow(request("198.51.100.1"), now) {
		t.Fatal("per-client profile limit not applied")
	}
	if !a.allow(request("198.51.100.2"), now) {
		t.Fatal("a second player behind the same proxy shared the first player's budget")
	}
}

func TestModeratorLoopbackUsesForwardedClient(t *testing.T) {
	s := &Server{}
	s.admission.trusted = []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}
	r := httptest.NewRequest("GET", "/api/v1/admin/reports", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	r.Header.Set("X-Forwarded-For", "198.51.100.1")
	w := httptest.NewRecorder()
	if s.authenticateModerator(w, r) || w.Code != 403 {
		t.Fatal("remote client reached loopback-only moderation through the proxy")
	}
}

func TestConfiguredHostLimits(t *testing.T) {
	s := &Server{cfg: Config{MaxLobbies: 300, ProfileCreationsPerHour: 5000}}
	if s.lobbyLimit() != 300 || s.profileCreationLimit() != 5000 {
		t.Fatalf("configured limits ignored: %d %d", s.lobbyLimit(), s.profileCreationLimit())
	}
	defaults := &Server{}
	if defaults.lobbyLimit() != 64 || defaults.profileCreationLimit() != maxProfileCreationsPerWindow {
		t.Fatal("default limits changed")
	}
	load := &Server{cfg: Config{LoadProfile: Loopback500LoadProfile, MaxLobbies: 3}}
	if load.lobbyLimit() != 125 {
		t.Fatal("load profile limit overridden")
	}
}
