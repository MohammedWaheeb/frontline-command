package main

import (
	"net"
	"reflect"
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
