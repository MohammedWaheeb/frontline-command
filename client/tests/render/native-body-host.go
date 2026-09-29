// Test-only host entry. The exact frozen production Server handles every game
// route; only POST advice writes are observed. No proxy or additional request.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"frontlinecommand/internal/server"
	"hash"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

type bodyWriter struct {
	http.ResponseWriter
	sum        hash.Hash
	bytes      int
	status     int
	writes     int
	writeError string
}

func (w *bodyWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *bodyWriter) WriteHeader(status int) {
	if status >= 200 && w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *bodyWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	n, err := w.ResponseWriter.Write(p)
	w.writes++
	if n >= 0 && n <= len(p) {
		_, _ = w.sum.Write(p[:n])
		w.bytes += n
	} else {
		w.writeError = "invalid native Write count"
	}
	if err != nil {
		w.writeError = err.Error()
	} else if n != len(p) {
		w.writeError = "short native Write"
	}
	return n, err
}

type bodyLog struct {
	sync.Mutex
	out      io.Writer
	ordinals map[string]int
	rows     int
	failure  error
}

func (b *bodyLog) begin(key string) int {
	b.Lock()
	defer b.Unlock()
	b.ordinals[key]++
	return b.ordinals[key]
}
func (b *bodyLog) record(row map[string]any) {
	b.Lock()
	defer b.Unlock()
	b.rows++
	if b.rows > 512 {
		if b.rows == 513 {
			b.failure = json.NewEncoder(b.out).Encode(map[string]any{"trace_overflow": true})
		}
		return
	}
	if err := json.NewEncoder(b.out).Encode(row); err != nil {
		b.failure = err
	}
}
func observeAdvice(next http.Handler, events *bodyLog) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !strings.HasPrefix(r.URL.Path, "/api/v1/matches/") || !strings.HasSuffix(r.URL.Path, "/advice") {
			next.ServeHTTP(w, r)
			return
		}
		// No request body or authorization/profile header is read or logged.
		ordinal := events.begin(r.Method + " " + r.URL.Path)
		wrapped := &bodyWriter{ResponseWriter: w, sum: sha256.New()}
		returned := false
		defer func() {
			events.record(map[string]any{"method": r.Method, "path": r.URL.Path, "query_present": r.URL.RawQuery != "", "ordinal": ordinal, "status": wrapped.status, "bytes": wrapped.bytes, "sha256": hex.EncodeToString(wrapped.sum.Sum(nil)), "writes": wrapped.writes, "write_error": wrapped.writeError, "handler_returned": returned, "request_canceled": r.Context().Err() != nil, "content_encoding": w.Header().Get("Content-Encoding")})
		}()
		next.ServeHTTP(wrapped, r)
		returned = true
	})
}

const controlBody = "Native consumed-body integrity control.\n"

func diagnosticControls(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/__diagnostics__/body-proof/") {
			next.ServeHTTP(w, r)
			return
		}
		kind := strings.TrimPrefix(r.URL.Path, "/__diagnostics__/body-proof/")
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		switch kind {
		case "valid":
			_, _ = io.WriteString(w, controlBody)
		case "wrong-hash":
			_, _ = io.WriteString(w, strings.Replace(controlBody, "Native", "NATIVE", 1))
		case "truncated":
			w.Header().Set("Content-Length", fmt.Sprint(len(controlBody)+11))
			_, _ = io.WriteString(w, controlBody[:8])
			w.(http.Flusher).Flush()
		case "network":
			connection, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				_ = connection.Close()
			}
		case "redirect":
			http.Redirect(w, r, "/__diagnostics__/body-proof/valid", http.StatusFound)
		case "cancel":
			w.Header().Set("Content-Length", fmt.Sprint(len(controlBody)))
			_, _ = io.WriteString(w, controlBody[:1])
			w.(http.Flusher).Flush()
			select {
			case <-time.After(time.Second):
				_, _ = io.WriteString(w, controlBody[1:])
			case <-r.Context().Done():
			}
		default:
			http.NotFound(w, r)
		}
	})
}
func main() {
	address := flag.String("addr", "127.0.0.1:0", "loopback address")
	data := flag.String("data", "", "isolated persistence")
	static := flag.String("static", "", "immutable product")
	maps := flag.String("maps", "", "installed maps")
	missions := flag.String("missions", "", "installed missions")
	trace := flag.String("body-trace", "", "test-only advice response hashes")
	flag.Parse()
	h, _, err := net.SplitHostPort(*address)
	if err != nil || net.ParseIP(h) == nil || !net.ParseIP(h).IsLoopback() {
		log.Fatal("loopback address required")
	}
	if *trace == "" || *data == "" {
		log.Fatal("isolated data and trace required")
	}
	output, err := os.OpenFile(*trace, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer output.Close()
	app, err := server.New(server.Config{DataDir: *data, StaticDir: *static, MapDir: *maps, MissionDir: *missions})
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()
	events := &bodyLog{out: output, ordinals: map[string]int{}}
	srv := &http.Server{Addr: *address, Handler: diagnosticControls(observeAdvice(app, events)), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Frontline Command diagnostic server: http://%s\n", listener.Addr())
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	if err = srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	events.Lock()
	defer events.Unlock()
	if events.failure != nil {
		log.Fatal(events.failure)
	}
}
