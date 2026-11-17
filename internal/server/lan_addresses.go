package server

import (
	"net"
	"net/http"
	"sort"
	"strconv"
)

// LANJoinURLs advertises only addresses served by the actual listener. LAN
// opt-in alone does not make a loopback or single-interface listener bind other
// interfaces. Wildcard listeners advertise IPv4 addresses for easy LAN sharing.
func LANJoinURLs(address string, ifaces []net.Addr) []string {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil
	}
	bound := net.ParseIP(host)
	if bound == nil || bound.IsLoopback() {
		return nil
	}
	if !bound.IsUnspecified() {
		if !bound.IsGlobalUnicast() {
			return nil
		}
		return []string{"http://" + net.JoinHostPort(bound.String(), port)}
	}
	unique := map[string]bool{}
	for _, addr := range ifaces {
		n, ok := addr.(*net.IPNet)
		if !ok || n.IP.To4() == nil || !n.IP.IsGlobalUnicast() || n.IP.IsLoopback() {
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

type hostAddressInfo struct {
	LANEnabled bool     `json:"lan_enabled"`
	JoinURLs   []string `json:"join_urls"`
	Message    string   `json:"message"`
}

// hostAddresses deliberately does not infer LAN opt-in from a browser's Host
// header. The command's explicit configuration controls address discovery.
func (s *Server) hostAddresses(w http.ResponseWriter, r *http.Request) {
	info := hostAddressInfo{
		LANEnabled: s.cfg.LANEnabled,
		JoinURLs:   []string{},
		Message:    "LAN hosting is off. Run make lan to let other computers join.",
	}
	if info.LANEnabled {
		ifaces, _ := net.InterfaceAddrs()
		info.JoinURLs = append(info.JoinURLs, LANJoinURLs(s.cfg.ListenAddress, ifaces)...)
		info.Message = "Share a LAN join address with players on the same trusted network. Open that address in each player's browser, then enter the lobby invite code. Keep the host running."
		if len(info.JoinURLs) == 0 {
			info.Message = "LAN hosting is enabled, but this listener has no shareable LAN address. Check the network connection and use -addr 0.0.0.0:8080."
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	respond(w, http.StatusOK, info)
}
