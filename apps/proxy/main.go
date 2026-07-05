// Command proxy is mini-vercel's hand-written reverse proxy — phase 2 of the
// proxy story (MINI-VERCEL-PLAN.md §4). It will eventually replace nginx:
// it routes by Host header (`<project>.<domain>` → the live container's host
// port), polls the route table from Postgres, actively health-checks each
// backend, and optionally terminates TLS.
//
// The moving parts:
//
//	pollRoutes (routes.go)   every 2s: Postgres -> atomically-swapped map
//	healthChecker (health.go) every 5s: GET each backend, mark up/down
//	proxy (this file)         per request: Host -> subdomain -> port -> ReverseProxy
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	// Postgres driver choice: pgx/v5 over lib/pq. lib/pq is officially in
	// maintenance mode and its own README points at pgx; pgx is the actively
	// maintained pure-Go driver, and its pgxpool reconnects automatically —
	// a Postgres restart degrades us to "last known routes" instead of
	// killing the proxy.
	"github.com/jackc/pgx/v5/pgxpool"
)

// envOr mirrors the Node config helper in packages/shared/src/config.ts:
// empty string counts as unset so `FOO= go run .` still gets the default.
func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	var (
		databaseURL  = envOr("DATABASE_URL", "postgres://minivercel:minivercel@127.0.0.1:5432/minivercel")
		httpPort     = envOr("PROXY_HTTP_PORT", "8081")
		httpsPort    = envOr("PROXY_HTTPS_PORT", "8443")
		upstreamHost = envOr("PROXY_UPSTREAM_HOST", "127.0.0.1")
		tlsCert      = os.Getenv("PROXY_TLS_CERT")
		tlsKey       = os.Getenv("PROXY_TLS_KEY")
	)
	tlsEnabled := tlsCert != "" && tlsKey != ""

	// One context for the whole process: SIGINT/SIGTERM cancels it, which
	// stops the background pollers and triggers graceful server shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("proxy: bad DATABASE_URL: %v", err)
	}
	defer pool.Close()

	routes := newRouteTable()
	health := newHealthChecker(upstreamHost)
	go pollRoutes(ctx, pool, routes)
	go health.run(ctx, routes)

	handler := &proxy{routes: routes, health: health, upstreamHost: upstreamHost}

	// errc collects fatal listener errors; buffered so a listener that dies
	// after we've already begun shutting down doesn't block on send.
	errc := make(chan error, 2)
	var servers []*http.Server

	if tlsEnabled {
		httpsSrv := &http.Server{Addr: ":" + httpsPort, Handler: handler}
		servers = append(servers, httpsSrv)
		go func() { errc <- httpsSrv.ListenAndServeTLS(tlsCert, tlsKey) }()
		log.Printf("proxy: https listening on :%s (cert %s)", httpsPort, tlsCert)

		// With TLS on, the plain-HTTP listener only redirects to https.
		httpSrv := &http.Server{Addr: ":" + httpPort, Handler: redirectToHTTPS(httpsPort)}
		servers = append(servers, httpSrv)
		go func() { errc <- httpSrv.ListenAndServe() }()
		log.Printf("proxy: http listening on :%s (redirecting to https)", httpPort)
	} else {
		httpSrv := &http.Server{Addr: ":" + httpPort, Handler: handler}
		servers = append(servers, httpSrv)
		go func() { errc <- httpSrv.ListenAndServe() }()
		log.Printf("proxy: http listening on :%s", httpPort)
	}

	select {
	case <-ctx.Done():
		log.Printf("proxy: signal received, shutting down")
	case err := <-errc:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("proxy: listener error: %v", err)
		}
	}

	// Graceful shutdown: stop accepting, let in-flight requests finish,
	// give up after 10s so a hung client can't keep the process alive.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, s := range servers {
		if err := s.Shutdown(shutdownCtx); err != nil {
			log.Printf("proxy: shutdown: %v", err)
		}
	}
	log.Printf("proxy: bye")
}

// proxy is the per-request handler: Host header -> subdomain -> backend port.
type proxy struct {
	routes       *routeTable
	health       *healthChecker
	upstreamHost string
}

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	sw := &statusWriter{ResponseWriter: w}

	// "hello.localhost:8081" -> "hello.localhost" -> first label "hello".
	host := hostOnly(r.Host)
	subdomain, _, _ := strings.Cut(host, ".")

	port, ok := p.routes.lookup(subdomain)
	switch {
	case !ok:
		http.Error(sw, "no such deployment", http.StatusNotFound)
	case !p.health.healthy(port):
		// Fail fast with a clear message instead of letting the client
		// wait out a dial timeout to a dead backend.
		http.Error(sw, "deployment unhealthy", http.StatusServiceUnavailable)
	default:
		p.forward(sw, r, port)
	}

	log.Printf("access: %s %s%s -> :%d %d %s",
		r.Method, host, r.URL.Path, port, sw.code(), time.Since(start).Round(time.Millisecond))
}

// forward reverse-proxies one request to 127.0.0.1:<port> (or
// PROXY_UPSTREAM_HOST). A ReverseProxy value is cheap to build per request —
// the expensive part (the connection pool) lives in http.DefaultTransport,
// which every instance shares, so keep-alives to backends still work.
// WebSocket upgrades pass through automatically (stdlib handles Upgrade
// since go 1.12, and via ResponseController unwrapping since 1.20).
func (p *proxy) forward(w http.ResponseWriter, r *http.Request, port int) {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort(p.upstreamHost, strconv.Itoa(port))}
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.SetXForwarded() // X-Forwarded-For/-Host/-Proto, like the nginx block
			// SetURL points the Host header at the backend; restore the
			// public host so apps that build absolute URLs see the real one
			// (same as nginx's `proxy_set_header Host $host`).
			pr.Out.Host = pr.In.Host
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("proxy: upstream :%d: %v", port, err)
			http.Error(w, "bad gateway", http.StatusBadGateway)
		},
	}
	rp.ServeHTTP(w, r)
}

// redirectToHTTPS is the handler for the plain-HTTP listener when TLS is on.
func redirectToHTTPS(httpsPort string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		target := "https://" + hostOnly(r.Host)
		if httpsPort != "443" {
			target += ":" + httpsPort
		}
		// 308 keeps the method and body (301 would downgrade POST to GET).
		http.Redirect(w, r, target+r.RequestURI, http.StatusPermanentRedirect)
	})
}

// hostOnly strips an optional :port from a Host header value.
func hostOnly(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return hostport
}

// statusWriter records the response status for the access log.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach Flush/Hijack on the real writer.
// Without it, WebSocket upgrades and streamed responses through the
// ReverseProxy would break behind this wrapper.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusWriter) code() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}
