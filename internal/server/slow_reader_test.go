package server

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"syscall"
	"testing"
	"time"
)

// A client that requests the lobby list and then stops reading must not hold
// the host-wide lobby lock while its response waits on TCP back-pressure:
// every lobby, matchmaking and match-start request shares that lock.
func TestSlowLobbyReaderDoesNotBlockLobbies(t *testing.T) {
	s, h := testServer(t)
	m := lobbyFourMap()
	s.maps[m.ID] = m
	token := profile(t, h, "Host")
	lobby := responseLobby(t, request(t, h, "POST", "/api/v1/lobbies", token, map[string]any{"name": strings.Repeat("Slow reader ", 6), "map_id": m.ID, "mode": "ffa", "faction": "US"}, 201))
	// ~690 bytes per lobby: enough that the list exceeds the loopback socket
	// buffers (a real network path or a streaming proxy fills sooner).
	s.mu.Lock()
	original := s.lobbies[lobby.ID]
	for i := 0; i < 4000; i++ {
		clone := *original
		clone.ID = fmt.Sprintf("%s-%04d", lobby.ID, i)
		s.lobbies[clone.ID] = &clone
		noteLobbyHost(&clone, clone.Host, time.Now())
	}
	s.mu.Unlock()

	dialer := net.Dialer{Control: func(_, _ string, c syscall.RawConn) error {
		var err error
		c.Control(func(fd uintptr) { err = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_RCVBUF, 1024) })
		return err
	}}
	stalled, err := dialer.Dial("tcp", strings.TrimPrefix(h.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer stalled.Close()
	fmt.Fprintf(stalled, "GET /api/v1/lobbies HTTP/1.1\r\nHost: %s\r\nAuthorization: Bearer %s\r\n\r\n", strings.TrimPrefix(h.URL, "http://"), token)
	time.Sleep(300 * time.Millisecond)

	client := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("GET", h.URL+"/api/v1/lobbies/"+lobby.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	started := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("lobby read blocked behind a stalled reader for %v: %v", time.Since(started).Round(time.Millisecond), err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("lobby read status %d", resp.StatusCode)
	}
}
