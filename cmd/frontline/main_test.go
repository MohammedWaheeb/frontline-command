package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHTTPServerTimeoutsBoundSlowClientsButFitLargeBodies(t *testing.T) {
	srv := newHTTPServer("127.0.0.1:0", http.NotFoundHandler())
	if srv.ReadHeaderTimeout <= 0 || srv.IdleTimeout <= 0 || srv.MaxHeaderBytes <= 0 {
		t.Fatal("header/idle bounds regressed", srv.ReadHeaderTimeout, srv.IdleTimeout, srv.MaxHeaderBytes)
	}
	// The largest request body is a 65MiB save upload and the largest
	// responses are 17MiB maps and save downloads; on a slow 256KiB/s LAN
	// link those need roughly 65s and 260s, so both deadlines must clear
	// five minutes while still bounding slowloris connections.
	if srv.ReadTimeout < 5*time.Minute || srv.ReadTimeout > 15*time.Minute {
		t.Fatal("ReadTimeout must bound slowloris yet fit a 65MiB save", srv.ReadTimeout)
	}
	if srv.WriteTimeout < 5*time.Minute || srv.WriteTimeout > 15*time.Minute {
		t.Fatal("WriteTimeout must bound stalled clients yet fit large downloads", srv.WriteTimeout)
	}
}

func TestDeadlineHandlerCutsSlowHTTPButExemptsWebSocketUpgrade(t *testing.T) {
	slow := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		_, _ = w.Write([]byte("late"))
	})
	srv := httptest.NewServer(deadlineHandler(slow, 50*time.Millisecond, 50*time.Millisecond))
	defer srv.Close()

	// Plain HTTP: the write deadline fires long before the handler answers,
	// so the client cannot read the late body.
	resp, err := http.Get(srv.URL)
	if err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if string(body) == "late" {
			t.Fatal("write deadline did not cut the slow HTTP response")
		}
	}

	// WebSocket upgrades (match sockets) must be exempt: the same slow
	// handler completes, proving no deadline kills the long-lived socket.
	req, _ := http.NewRequest("GET", srv.URL, nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal("websocket upgrade request failed", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "late" {
		t.Fatalf("websocket upgrade was deadline-cut: %q", body)
	}
}
