package main

import (
	"context"
	"flag"
	"fmt"
	"frontlinecommand/internal/server"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

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
	app, err := server.New(server.Config{StateUpdatesPerSecond: *stateUpdates, LoadProfile: *loadProfile, ListenAddress: *address, DataDir: *data, StaticDir: *static, MapDir: *maps, MissionDir: *missions, AllowedOrigins: allowed})
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()
	srv := &http.Server{Addr: *address, Handler: app, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Frontline Command local server: http://%s\n", listener.Addr())
	if *loadProfile != "" {
		fmt.Printf("Measurement profile: %s (125 lobbies, 500 simultaneous clients; loopback only)\n", *loadProfile)
	}
	if *lan {
		ifaces, _ := net.InterfaceAddrs()
		for _, url := range lanJoinURLs(listener.Addr().String(), ifaces) {
			fmt.Printf("LAN join address: %s\n", url)
		}
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
