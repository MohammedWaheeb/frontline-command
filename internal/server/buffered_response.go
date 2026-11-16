package server

import (
	"bytes"
	"net/http"
	"strings"
)

// Lobby, matchmaking and scenario-lobby handlers respond while holding the
// host-wide lobby lock. None of them hijack the connection or stream.
func writesUnderLobbyLock(path string) bool {
	return strings.HasPrefix(path, "/api/v1/lobbies") || strings.HasPrefix(path, "/api/v1/matchmaking") ||
		strings.HasPrefix(path, "/api/v1/missions/") && strings.HasSuffix(path, "/lobby") ||
		strings.HasPrefix(path, "/api/v1/saves/") && strings.HasSuffix(path, "/coop-lobby")
}

// bufferedResponse holds a small JSON response in memory until the handler
// (and its deferred unlock) has returned. It shares the real header map.
type bufferedResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (b *bufferedResponse) Header() http.Header { return b.header }
func (b *bufferedResponse) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}
func (b *bufferedResponse) Write(p []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	return b.body.Write(p)
}
func (b *bufferedResponse) flushTo(w http.ResponseWriter) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	w.WriteHeader(b.status)
	_, _ = w.Write(b.body.Bytes())
}
