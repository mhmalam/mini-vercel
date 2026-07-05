package main

import (
	"context"
	"log"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Same source of truth the nginx phase uses: the worker upserts `routes` on
// every successful deploy (apps/worker/src/routing.ts). We only follow
// deployments that are live AND have a host port, so a route pointing at a
// crashed/failed deployment simply disappears from the table.
const routesQuery = `
	select r.subdomain, d.host_port
	from routes r
	join deployments d on d.id = r.deployment_id
	where d.status = 'live' and d.host_port is not null`

// routeTable maps project subdomain -> host port of its live container.
//
// Concurrency choice: every single request reads this map, but it is only
// replaced once per poll (2s). So instead of taking a lock on the hot path we
// use copy-on-write — the poller builds a brand-new map and atomically swaps
// the pointer. Readers Load() an immutable snapshot: no locks, no torn reads,
// and an in-flight request keeps using the snapshot it started with even if
// a swap happens mid-request.
type routeTable struct {
	m atomic.Pointer[map[string]int]
}

func newRouteTable() *routeTable {
	t := &routeTable{}
	empty := map[string]int{}
	t.m.Store(&empty)
	return t
}

func (t *routeTable) lookup(subdomain string) (port int, ok bool) {
	port, ok = (*t.m.Load())[subdomain]
	return
}

// snapshot returns the current map. Callers must treat it as read-only —
// that immutability is the whole basis of the lock-free scheme above.
func (t *routeTable) snapshot() map[string]int {
	return *t.m.Load()
}

// replace swaps in the new table, logging every difference so the journal
// tells the deploy story: `routes: + hello -> :50929` etc.
func (t *routeTable) replace(next map[string]int) {
	prev := t.snapshot()
	for sub, port := range next {
		old, existed := prev[sub]
		switch {
		case !existed:
			log.Printf("routes: + %s -> :%d", sub, port)
		case old != port:
			log.Printf("routes: ~ %s -> :%d (was :%d)", sub, port, old)
		}
	}
	for sub, old := range prev {
		if _, still := next[sub]; !still {
			log.Printf("routes: - %s (was :%d)", sub, old)
		}
	}
	t.m.Store(&next)
}

// pollRoutes refreshes the table from Postgres every 2 seconds until ctx is
// cancelled. Polling (vs LISTEN/NOTIFY) is deliberate for now: dead simple,
// self-healing, and 1 tiny query every 2s is nothing. On query failure we
// keep serving the last-known-good table — a Postgres blip should degrade
// route *freshness*, never take down routing itself.
func pollRoutes(ctx context.Context, pool *pgxpool.Pool, t *routeTable) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	first := true
	for {
		next, err := fetchRoutes(ctx, pool)
		switch {
		case err != nil:
			if ctx.Err() != nil {
				return // shutting down; the error is just the cancelled ctx
			}
			log.Printf("routes: poll failed (%v), keeping %d known routes", err, len(t.snapshot()))
		default:
			if first {
				log.Printf("routes: loaded %d route(s) from postgres", len(next))
				first = false
			}
			t.replace(next)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func fetchRoutes(ctx context.Context, pool *pgxpool.Pool) (map[string]int, error) {
	rows, err := pool.Query(ctx, routesQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	next := make(map[string]int)
	for rows.Next() {
		var subdomain string
		var hostPort int
		if err := rows.Scan(&subdomain, &hostPort); err != nil {
			return nil, err
		}
		next[subdomain] = hostPort
	}
	return next, rows.Err()
}
