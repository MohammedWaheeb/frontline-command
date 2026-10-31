package main

import (
	"fmt"
	"frontlinecommand/internal/server"
	"io"
	"net"
)

// Advertise only addresses served by the actual listener. LAN opt-in alone
// does not make a loopback or single-interface listener bind other interfaces.
func lanJoinURLs(address string, ifaces []net.Addr) []string {
	return server.LANJoinURLs(address, ifaces)
}

func printJoinAddresses(w io.Writer, address string, lan bool, ifaces []net.Addr) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsUnspecified() {
		host = "127.0.0.1"
	}
	fmt.Fprintf(w, "Frontline Command host game page: http://%s\n", net.JoinHostPort(host, port))
	if !lan {
		fmt.Fprintln(w, "Localhost only. To invite players on your trusted network, run make lan.")
		return
	}
	urls := lanJoinURLs(address, ifaces)
	for _, url := range urls {
		fmt.Fprintf(w, "LAN join address (share this): %s\n", url)
	}
	if len(urls) == 0 {
		fmt.Fprintln(w, "No shareable LAN address. Check the network connection and bind with -addr 0.0.0.0:8080.")
	}
	fmt.Fprintln(w, "Each player: open a LAN join address in your browser, then enter the lobby invite code. Keep this host running.")
}
