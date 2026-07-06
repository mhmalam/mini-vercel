# Architecture

How the system fits together, as it runs in production today.

## The path of a deploy

```
git push ──► GitHub webhook ─┐
dashboard deploy button ─────┼──► api (Fastify, bearer auth / HMAC)
deploy CLI ──────────────────┘        │
                                      │  insert deployments row, enqueue job
                                      ▼
Postgres ◄── status + logs ─── worker (BullMQ, one job at a time)
                                      │
                                      ├─ git clone --depth 1
                                      ├─ docker build -t <project>:<id8>
                                      ├─ docker run -d (512m / 1 cpu,
                                      │    127.0.0.1:ephemeral → app port)
                                      ├─ poll HTTP until the app answers
                                      ├─ rewrite nginx route, reload
                                      ├─ stop the previous container
                                      └─ prune old images (keep 3)
```

The ordering in the last three steps is the zero-downtime story: the route
only moves after the new container answers HTTP, and the old container only
stops after the route has moved.

Nothing talks to Docker except the worker, and nothing reaches the API
except through nginx. The CLI and dashboard are both thin HTTP clients.

## Routing

nginx terminates TLS for `malam.me`, `*.malam.me`, and `*.deploy.malam.me`
with one wildcard cert (lego renews it via a daily cron). Each project gets
a generated server block (`infra/nginx/conf.d/10-<name>.conf`) mapping
`<name>.malam.me` — plus any custom domains, which is how the apex serves
the portfolio — to its container's port. Unknown or stopped subdomains fall
through to a branded offline page.

On the server nginx runs with host networking: app containers publish on
127.0.0.1 only, and on Linux a bridged container can't reach the host's
loopback. `host.docker.internal` is pinned to 127.0.0.1 so the same
generated configs work on a dev machine with Docker Desktop.

There's also a reverse proxy written in Go (`apps/proxy`) that does the same
routing straight from the `routes` table, with its own health checks. It
runs beside nginx on :8081 until it has earned the public port.

## Jobs beyond "deploy"

The queue carries five actions, all keyed off Postgres state:

- **deploy** — the pipeline above. A row that already has an `image_tag`
  skips clone+build (that's how rollback works: re-run an old image).
- **stop** — drop the route, stop containers. The URL 404s until next push.
- **remove** — delete a project completely: route, containers, images, rows.
- **rename** — retire the old subdomain and redeploy the current image under
  the new name (labels and routes carry the project name).
- **reroute** — rewrite the nginx block in place when custom domains change.

## The platform's own services

api, worker, and dashboard are Node processes under systemd on the host
(not containerized). Postgres, Redis, and nginx run in Docker via compose.
The dashboard is a Next.js app behind a session-cookie login; the session
token is derived from the password, so rotating the password logs out
everything.

## Security

- The API is bearer-token everywhere except `/health` and the GitHub
  webhook, which authenticates with an HMAC signature instead.
- Registration only accepts repos from allowed GitHub owners — the platform
  runs what it builds, so it refuses to build strangers' code.
- App containers get memory/CPU limits, no privileged flags, loopback-only
  ports. nginx is the single thing facing the internet.
- Secrets (API token, dashboard password, GitHub token, DNS API token) live
  in the server's `.env` and `~/.mv-lego.env`, never in the repo.
