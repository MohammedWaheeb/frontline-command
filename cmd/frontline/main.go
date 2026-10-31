package main

import (
	"context"
	"flag"
	"fmt"
	"frontlinecommand/internal/server"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// Body deadlines are sized for the largest payloads — 65MiB save uploads
// and 17MiB map bodies, plus save downloads of similar size — over a slow
// LAN link (~256KiB/s needs ~260s for 65MiB), while still bounding
// slowloris-style stalled connections instead of holding them forever.
const (
	httpReadTimeout  = 6 * time.Minute
	httpWriteTimeout = 6 * time.Minute
)

func newHTTPServer(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           deadlineHandler(handler, httpReadTimeout, httpWriteTimeout),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       httpReadTimeout,
		WriteTimeout:      httpWriteTimeout,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
}

// deadlineHandler applies per-request read/write deadlines (covering request
// bodies) to plain HTTP traffic. WebSocket upgrades are exempt and have any
// server-level deadline cleared, because match sockets are long-lived and
// carry their own liveness pings.
func deadlineHandler(next http.Handler, read, write time.Duration) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := http.NewResponseController(w)
		if isWebSocketUpgrade(r) {
			_ = rc.SetReadDeadline(time.Time{})
			_ = rc.SetWriteDeadline(time.Time{})
		} else {
			now := time.Now()
			_ = rc.SetReadDeadline(now.Add(read))
			_ = rc.SetWriteDeadline(now.Add(write))
		}
		next.ServeHTTP(w, r)
	})
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func main() {
	address := flag.String("addr", "127.0.0.1:8080", "listen address (localhost by default)")
	stateUpdates := flag.Int("state-updates-hz", 10, "full state updates per second: 10 or 20 (simulation and execution receipts remain 20 Hz)")
	loadProfile := flag.String("load-profile", "", "bounded local measurement profile: loopback-500 (requires a literal loopback -addr; incompatible with -lan)")
	lan := flag.Bool("lan", false, "explicitly allow non-loopback LAN hosting")
	data := flag.String("data", ".local", "local persistence directory")
	static := flag.String("static", "client/dist", "packaged browser client")
	maps := flag.String("maps", "content/maps", "validated map directory")
	missions := flag.String("missions", "content/missions", "validated mission directory")
	origins := flag.String("dev-origins", "", "comma-separated explicit development origins")
	proxies := flag.String("trusted-proxies", "", "comma-separated reverse-proxy IPs/CIDRs whose X-Forwarded-For identifies clients (required behind an HTTPS proxy so rate limits stay per player)")
	maxLobbies := flag.Int("max-lobbies", 0, "maximum forming plus live lobbies (0 = default 64); size from measured capacity")
	profileBudget := flag.Int("profile-creations-per-hour", 0, "host-wide new-profile budget per hour (0 = default 120)")
	flag.Parse()
	host, _, err := net.SplitHostPort(*address)
	if err != nil {
		log.Fatal(err)
	}
	ip := net.ParseIP(host)
	if !*lan && (ip == nil || !ip.IsLoopback()) {
		log.Fatal("non-loopback binding requires -lan")
	}
	if *loadProfile != "" && (*lan || *loadProfile != server.Loopback500LoadProfile || ip == nil || !ip.IsLoopback()) {
		log.Fatal("-load-profile accepts loopback-500 only with a literal loopback -addr and without -lan")
	}
	allowed := []string{}
	if *origins != "" {
		allowed = strings.Split(*origins, ",")
	}
	trusted, err := parseTrustedProxies(*proxies)
	if err != nil {
		log.Fatal(err)
	}
	if *maxLobbies < 0 || *profileBudget < 0 {
		log.Fatal("-max-lobbies and -profile-creations-per-hour must not be negative")
	}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	app, err := server.New(server.Config{StateUpdatesPerSecond: *stateUpdates, LoadProfile: *loadProfile, LANEnabled: *lan, ListenAddress: listener.Addr().String(), DataDir: *data, StaticDir: *static, MapDir: *maps, MissionDir: *missions, AllowedOrigins: allowed, TrustedProxies: trusted, MaxLobbies: *maxLobbies, ProfileCreationsPerHour: *profileBudget})
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()
	srv := newHTTPServer(*address, app)
	ifaces, _ := net.InterfaceAddrs()
	printJoinAddresses(os.Stdout, listener.Addr().String(), *lan, ifaces)
	if *loadProfile != "" {
		fmt.Printf("Measurement profile: %s (125 lobbies, 500 simultaneous clients; loopback only)\n", *loadProfile)
	}
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
}

// parseTrustedProxies accepts bare IPs (as single-address prefixes) or CIDRs.
func parseTrustedProxies(list string) ([]netip.Prefix, error) {
	out := []netip.Prefix{}
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if addr, err := netip.ParseAddr(item); err == nil {
			addr = addr.Unmap()
			out = append(out, netip.PrefixFrom(addr, addr.BitLen()))
			continue
		}
		prefix, err := netip.ParsePrefix(item)
		if err != nil {
			return nil, fmt.Errorf("invalid -trusted-proxies entry %q", item)
		}
		out = append(out, prefix.Masked())
	}
	return out, nil
}
