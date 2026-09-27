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
	lan := flag.Bool("lan", false, "explicitly allow non-loopback LAN hosting")
	data := flag.String("data", ".local", "local persistence directory")
	static := flag.String("static", "client/dist", "packaged browser client")
	maps := flag.String("maps", "content/maps", "validated map directory")
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
	allowed := []string{}
	if *origins != "" {
		allowed = strings.Split(*origins, ",")
	}
	app, err := server.New(server.Config{DataDir: *data, StaticDir: *static, MapDir: *maps, AllowedOrigins: allowed})
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
	if *lan {
		ifaces, _ := net.InterfaceAddrs()
		_, port, _ := net.SplitHostPort(listener.Addr().String())
		for _, addr := range ifaces {
			if n, ok := addr.(*net.IPNet); ok && n.IP.To4() != nil && !n.IP.IsLoopback() {
				fmt.Printf("LAN join address: http://%s:%s\n", n.IP, port)
			}
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
