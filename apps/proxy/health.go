package main

import (
	"context"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// healthChecker actively probes every distinct backend port every 5 seconds.
//
// Policy (deliberately simple):
//   - GET http://<upstream>:<port>/ with a 3s timeout.
//   - ANY http response — even a 500 — counts as healthy. We only want to
//     catch "nothing listening / connection hangs"; an app's own errors are
//     the app's business and should reach the client unmodified.
//   - A port we have not probed yet counts as healthy, so a route that just
//     appeared isn't 503'd for up to 5s while waiting for its first check.
type healthChecker struct {
	upstreamHost string
	client       *http.Client
	// Same copy-on-write pattern as routeTable: request handlers read this
	// on every request, the checker replaces it every 5s — swap a fresh
	// immutable map instead of locking the hot path.
	m atomic.Pointer[map[int]bool]
}

func newHealthChecker(upstreamHost string) *healthChecker {
	h := &healthChecker{
		upstreamHost: upstreamHost,
		client:       &http.Client{Timeout: 3 * time.Second},
	}
	empty := map[int]bool{}
	h.m.Store(&empty)
	return h
}

// healthy reports whether requests may be forwarded to this port.
func (h *healthChecker) healthy(port int) bool {
	up, seen := (*h.m.Load())[port]
	return !seen || up // unknown = not probed yet = give it the benefit of the doubt
}

// run probes all current backends every 5s until ctx is cancelled.
func (h *healthChecker) run(ctx context.Context, routes *routeTable) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		h.checkAll(routes.snapshot())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (h *healthChecker) checkAll(routes map[string]int) {
	// Distinct ports: several subdomains could share a backend some day.
	ports := make(map[int]struct{}, len(routes))
	for _, port := range routes {
		ports[port] = struct{}{}
	}

	// Probe concurrently: sequentially, one hung backend would delay every
	// other check by its 3s timeout. The mutex only guards the scratch map
	// being built — readers never see it until the atomic swap below.
	next := make(map[int]bool, len(ports))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for port := range ports {
		wg.Add(1)
		go func() {
			defer wg.Done()
			up := h.probe(port)
			mu.Lock()
			next[port] = up
			mu.Unlock()
		}()
	}
	wg.Wait()

	// Log transitions only, so steady state stays quiet.
	prev := *h.m.Load()
	for port, up := range next {
		if was, seen := prev[port]; !seen || was != up {
			state := "healthy"
			if !up {
				state = "UNHEALTHY"
			}
			log.Printf("health: backend :%d is %s", port, state)
		}
	}
	h.m.Store(&next)
}

func (h *healthChecker) probe(port int) bool {
	url := "http://" + net.JoinHostPort(h.upstreamHost, strconv.Itoa(port)) + "/"
	resp, err := h.client.Get(url)
	if err != nil {
		return false
	}
	// Drain (bounded) so the keep-alive connection can be reused.
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10))
	resp.Body.Close()
	return true
}
