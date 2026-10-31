package server

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestLANJoinURLsRespectListenerAndSortInterfaces(t *testing.T) {
	ifaces := []net.Addr{
		&net.IPNet{IP: net.ParseIP("192.168.1.12")},
		&net.IPNet{IP: net.ParseIP("127.0.0.1")},
		&net.IPNet{IP: net.ParseIP("192.168.1.10")},
		&net.IPNet{IP: net.ParseIP("192.168.1.12")},
		&net.IPNet{IP: net.ParseIP("::1")},
		&net.IPNet{IP: net.ParseIP("0.0.0.0")},
		&net.IPNet{IP: net.ParseIP("224.0.0.1")},
		&net.IPNet{IP: net.ParseIP("169.254.1.1")},
		&net.IPAddr{IP: net.ParseIP("192.168.1.20")},
	}
	for _, tc := range []struct {
		address string
		want    []string
	}{
		{"127.0.0.1:8080", nil},
		{"[::1]:8080", nil},
		{"192.168.1.10:8080", []string{"http://192.168.1.10:8080"}},
		{"[2001:db8::10]:8080", []string{"http://[2001:db8::10]:8080"}},
		{"0.0.0.0:49152", []string{"http://192.168.1.10:49152", "http://192.168.1.12:49152"}},
		{"invalid", nil},
		{"0.0.0.0:0", nil},
		{"0.0.0.0:65536", nil},
		{"0.0.0.0:http", nil},
		{"224.0.0.1:8080", nil},
	} {
		t.Run(tc.address, func(t *testing.T) {
			if got := LANJoinURLs(tc.address, ifaces); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v; want %v", got, tc.want)
			}
		})
	}
}

func TestHostAddressesRequiresExplicitLANOptIn(t *testing.T) {
	for _, tc := range []struct {
		name, address string
		enabled       bool
		want          []string
		message       string
	}{
		{"disabled_wildcard", "0.0.0.0:8080", false, []string{}, "LAN hosting is off"},
		{"disabled_specific", "192.168.1.10:8080", false, []string{}, "LAN hosting is off"},
		{"enabled_specific", "192.168.1.10:49152", true, []string{"http://192.168.1.10:49152"}, "same trusted network"},
		{"enabled_loopback", "127.0.0.1:8080", true, []string{}, "no shareable LAN address"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: Config{ListenAddress: tc.address, LANEnabled: tc.enabled}}
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, "http://attacker.example/api/v1/host", nil)
			s.hostAddresses(w, r)
			if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("unexpected response: %d %v", w.Code, w.Header())
			}
			var got hostAddressInfo
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.LANEnabled != tc.enabled || !reflect.DeepEqual(got.JoinURLs, tc.want) || !strings.Contains(got.Message, tc.message) {
				t.Fatalf("response %+v; want enabled=%v URLs=%v message containing %q", got, tc.enabled, tc.want, tc.message)
			}
		})
	}
}

func TestHostAddressesRouteNeedsNoProfileAndRejectsForeignOrigin(t *testing.T) {
	s := &Server{cfg: Config{LANEnabled: true, ListenAddress: "192.168.1.10:8080"}, mux: http.NewServeMux()}
	s.routes()
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "http://192.168.1.10:8080/api/v1/host", nil)
	s.ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"join_urls":["http://192.168.1.10:8080"]`) {
		t.Fatalf("unauthenticated discovery route failed: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	r.Header.Set("Origin", "http://foreign.example")
	s.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden || strings.Contains(w.Body.String(), "192.168.1.10") {
		t.Fatalf("foreign origin discovered addresses: %d %s", w.Code, w.Body.String())
	}
}
