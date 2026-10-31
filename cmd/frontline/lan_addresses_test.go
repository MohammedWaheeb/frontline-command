package main

import (
	"bytes"
	"net"
	"reflect"
	"strings"
	"testing"
)

func TestLANJoinURLs(t *testing.T) {
	interfaces := []net.Addr{
		&net.IPNet{IP: net.ParseIP("192.0.2.11")},
		&net.IPNet{IP: net.ParseIP("127.0.0.1")},
		&net.IPNet{IP: net.ParseIP("192.0.2.10")},
		&net.IPNet{IP: net.ParseIP("192.0.2.11")},
		&net.IPNet{IP: net.ParseIP("::1")},
		&net.IPNet{IP: net.ParseIP("0.0.0.0")},
	}
	for _, test := range []struct {
		name, address string
		want          []string
	}{
		{"IPv4_loopback", "127.0.0.1:8080", nil},
		{"IPv6_loopback", "[::1]:8080", nil},
		{"specific_interface", "192.0.2.10:8080", []string{"http://192.0.2.10:8080"}},
		{"IPv6_literal", "[2001:db8::10]:8080", []string{"http://[2001:db8::10]:8080"}},
		{"wildcard", "0.0.0.0:49152", []string{"http://192.0.2.10:49152", "http://192.0.2.11:49152"}},
		{"malformed", "invalid", nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := lanJoinURLs(test.address, interfaces); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("advertised %v; want %v", got, test.want)
			}
		})
	}
}

func TestPrintJoinAddressesGivesOpenableHostAndShareInstructions(t *testing.T) {
	var out bytes.Buffer
	printJoinAddresses(&out, "0.0.0.0:49152", true, []net.Addr{&net.IPNet{IP: net.ParseIP("192.168.1.10")}})
	for _, want := range []string{"host game page: http://127.0.0.1:49152", "LAN join address (share this): http://192.168.1.10:49152", "enter the lobby invite code", "Keep this host running"} {
		if !strings.Contains(out.String(), want) {
			t.Fatalf("missing %q in startup output:\n%s", want, out.String())
		}
	}
	if strings.Contains(out.String(), "http://0.0.0.0") {
		t.Fatalf("advertised wildcard as openable URL: %s", out.String())
	}
	out.Reset()
	printJoinAddresses(&out, "127.0.0.1:8080", false, []net.Addr{&net.IPNet{IP: net.ParseIP("192.168.1.10")}})
	if strings.Contains(out.String(), "192.168") || !strings.Contains(out.String(), "Localhost only") {
		t.Fatalf("localhost startup leaked LAN addresses or lost guidance: %s", out.String())
	}
}

func TestPrintJoinAddressesDoesNotAdvertiseUnboundLoopback(t *testing.T) {
	var out bytes.Buffer
	printJoinAddresses(&out, "192.168.1.10:8080", true, nil)
	if strings.Contains(out.String(), "127.0.0.1") || !strings.Contains(out.String(), "host game page: http://192.168.1.10:8080") {
		t.Fatalf("wrong host page for specific binding: %s", out.String())
	}
	out.Reset()
	printJoinAddresses(&out, "127.0.0.1:8080", true, nil)
	if !strings.Contains(out.String(), "No shareable LAN address") {
		t.Fatalf("missing explanation for loopback-only LAN opt-in: %s", out.String())
	}
}
