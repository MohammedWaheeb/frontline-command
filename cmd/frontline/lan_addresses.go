package main

import (
	"net"
	"sort"
)

// Advertise only addresses served by the actual listener. LAN opt-in alone
// does not make a loopback or single-interface listener bind other interfaces.
func lanJoinURLs(address string, ifaces []net.Addr) []string {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil
	}
	bound := net.ParseIP(host)
	if bound == nil || bound.IsLoopback() {
		return nil
	}
	if !bound.IsUnspecified() {
		return []string{"http://" + net.JoinHostPort(bound.String(), port)}
	}
	// Keep the existing IPv4 join-address policy for a wildcard TCP listener.
	unique := map[string]bool{}
	for _, addr := range ifaces {
		n, ok := addr.(*net.IPNet)
		if !ok || n.IP.To4() == nil || n.IP.IsLoopback() || n.IP.IsUnspecified() {
			continue
		}
		unique["http://"+net.JoinHostPort(n.IP.String(), port)] = true
	}
	var urls []string
	for url := range unique {
		urls = append(urls, url)
	}
	sort.Strings(urls)
	return urls
}
