package server

import (
	"fmt"
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

// Friends on one connection (a household, school or carrier NAT) each keep a
// full budget for menu reads, writes and advice; one credential still cannot
// exceed its own limit, and the address keeps a shared ceiling.
func TestPlayersSharingAnAddressGetTheirOwnBudgets(t *testing.T) {
	a := &admissionControl{}
	now := time.Now()
	read := func(token string) *http.Request {
		r := httptest.NewRequest("GET", "/api/v1/lobbies", nil)
		r.RemoteAddr = "203.0.113.7:4000"
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		return r
	}
	// Six players refreshing the multiplayer menu for a minute (5 GETs / 2 s).
	for player := 0; player < 6; player++ {
		for i := 0; i < 150; i++ {
			if !a.allow(read(fmt.Sprintf("player-%d", player)), now) {
				t.Fatalf("player %d throttled at request %d by friends on the same address", player, i)
			}
		}
	}
	for i := 0; i < 450; i++ {
		a.allow(read("player-0"), now)
	}
	if a.allow(read("player-0"), now) {
		t.Fatal("one credential exceeded its own read limit")
	}
	admitted := 6*150 + 450
	for i := 0; a.allow(read(fmt.Sprintf("minted-%d", i)), now); i++ {
		if admitted++; admitted > 600*sharedAddressFactor {
			t.Fatalf("address ceiling not applied: %d reads admitted", admitted)
		}
	}
	// Unauthenticated requests still share the plain per-address budget.
	b := &admissionControl{}
	for i := 0; i < 600; i++ {
		b.allow(read(""), now)
	}
	if b.allow(read(""), now) {
		t.Fatal("anonymous per-address limit not applied")
	}
}

// Rotating IPv6 addresses inside one /64 shares that subscriber's budget.
func TestIPv6ClientsAreLimitedPerSlash64(t *testing.T) {
	a := &admissionControl{}
	now := time.Now()
	for i := 0; i < 10; i++ {
		r := httptest.NewRequest("POST", "/api/v1/profiles", nil)
		r.RemoteAddr = fmt.Sprintf("[2001:db8:1:2::%x]:4000", i+1)
		if !a.allow(r, now) {
			t.Fatalf("denied at %d", i)
		}
	}
	r := httptest.NewRequest("POST", "/api/v1/profiles", nil)
	r.RemoteAddr = "[2001:db8:1:2:ffff::1]:4000"
	if a.allow(r, now) {
		t.Fatal("a new address in the same /64 escaped the profile limit")
	}
	r.RemoteAddr = "[2001:db8:1:3::1]:4000"
	if !a.allow(r, now) {
		t.Fatal("a different /64 shared the first subscriber's budget")
	}
}

// Several thousand active players (menu, socket and advice keys each) fit in
// the window table; none is refused because the table is full.
func TestAdmissionTableHoldsThousandsOfPlayers(t *testing.T) {
	a := &admissionControl{}
	now := time.Now()
	for player := 0; player < 5000; player++ {
		ip := fmt.Sprintf("10.%d.%d.%d:4000", player>>16&255, player>>8&255, player&255)
		for _, path := range []string{"/api/v1/lobbies", "/api/v1/matches/m/socket"} {
			r := httptest.NewRequest("GET", path, nil)
			r.RemoteAddr = ip
			r.Header.Set("Authorization", fmt.Sprintf("Bearer token-%d", player))
			if !a.allow(r, now) {
				t.Fatalf("player %d refused on %s with %d table entries", player, path, len(a.windows))
			}
		}
	}
}
