package server

import (
	"errors"
	"net"
)

// Loopback500LoadProfile is an explicit bounded capacity-measurement opt-in.
// It changes admission only, never match rules, authentication or visibility.
const Loopback500LoadProfile = "loopback-500"

func validateLoadProfile(cfg Config) error {
	if cfg.LoadProfile == "" {
		return nil
	}
	if cfg.LoadProfile != Loopback500LoadProfile {
		return errors.New("unknown local load profile")
	}
	if !loopbackRemote(cfg.ListenAddress) {
		return errors.New("loopback-500 requires a literal loopback listen address")
	}
	return nil
}

// Hostnames and forwarded headers are deliberately not trusted as bind proof.
func loopbackRemote(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) lobbyLimit() int {
	if s.cfg.LoadProfile == Loopback500LoadProfile {
		return 125
	}
	return 64
}

// Zero means no new global socket cap is applied to ordinary hosting.
func (s *Server) loadClientLimit() int {
	if s.cfg.LoadProfile == Loopback500LoadProfile {
		return 500
	}
	return 0
}

func (s *Server) reserveLoadSocket() bool {
	if s.loadSockets == nil {
		return true
	}
	select {
	case s.loadSockets <- struct{}{}:
		return true
	default:
		return false
	}
}

func (s *Server) releaseLoadSocket() {
	if s.loadSockets != nil {
		<-s.loadSockets
	}
}
