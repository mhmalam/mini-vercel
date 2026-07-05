# Decision log

ADR-style, newest last. Each entry: context → decision → consequences.

## 001 — npm workspaces + tsx, no build step (yet)

Monorepo uses plain npm workspaces. API and worker run TypeScript directly
via `tsx`; internal packages point `main` at `src/index.ts`. Zero build
orchestration while the codebase is small. The CLI is the one exception (see
003). Revisit if we ever need compiled artifacts on the VPS.

## 002 — plain SQL migrations + `pg`, no ORM

The data model is four small tables. Numbered `.sql` files applied by a
~50-line runner (`packages/db/src/migrate.ts`) keep the schema readable in
one place, and hand-written queries with manual row types are easy to debug.
Cost: no compile-time query checking. Acceptable at this size.

## 003 — CLI is standalone and compiled

`apps/cli` imports no workspace packages and compiles with `tsc` to a real
`deploy` bin. Reason: it must eventually run from any laptop against the VPS
API, so it should not drag the server-side dependency tree (pg, bullmq) or a
TS loader with it. It only needs `DEPLOY_API_URL` + `DEPLOY_API_TOKEN`.

## 004 — Docker via CLI shell-outs, not dockerode

`spawn("docker", [...])` with argument arrays (no shell → no Windows quoting
issues). The commands are exactly what you'd run by hand, which makes
failures reproducible in a terminal. dockerode is a drop-in upgrade later if
we need the event stream API.

## 005 — projects carry a `port` column (deviation from the plan's schema)

The plan's data model had no way to know which port an app listens on inside
its container. Options were: parse `EXPOSE` from the Dockerfile (magic,
fragile) or ask at project registration. Added `projects.port` (default
3000), settable via `deploy projects:add --port`.

## 006 — ephemeral host ports from day 1

The plan allowed a fixed port for weekend 1, but `-p 127.0.0.1::<port>` +
`docker port` inspection is barely more code than a hardcoded port and
removes a throwaway step. Host port is stored on the deployment row — that's
the routing table input the proxy will read later.

## 007 — an HTTP answer is the weekend-1 health check

Readiness = the container answers *any* HTTP response on its port within
60s (a 500 still proves the server is up). Real per-project health-check
paths and health-gated proxy cutover come with the proxy phase (plan §3/§4).

## 008 — TLS terminates in one static nginx block, not per-project configs

The worker generates identical HTTP-only server blocks locally and on the
VPS. On the VPS a single static file (`infra/nginx/vps-tls.conf`, mounted
only by the compose override) terminates HTTPS for the whole `*.deploy`
wildcard and proxies back into nginx's own port 80, where per-project blocks
route by Host. Local and prod routing stay byte-identical; TLS is one file.
Cost: plain-HTTP requests are served, not redirected (exact `server_name`
matches beat any wildcard redirect block) — backlog polish.

## 009 — rollback re-runs the pipeline with a pre-filled image

`deploy rollback` creates a *new* deployment whose `image_tag`/`commit_sha`
are copied from the newest previously-live deployment of a *different
commit* (same-commit deploys would make repeated rollbacks ping-pong).
The worker skips clone+build when `image_tag` is pre-set; everything after
(run → readiness → route switch → swap) is the normal path, so rollbacks get
the same zero-downtime guarantees as pushes. Displaced deployments are
marked `rolled_back`, not `stopped`, so history shows what happened.

## 010 — the Go proxy coexists with nginx during the transition

`apps/proxy` (pgx, stdlib `httputil.ReverseProxy`) polls the `routes` table
every 2s into an atomically-swapped map, health-checks backends every 5s,
and serves on :8081 next to nginx on :8080/:80. Both read the same source of
truth, so cutover is just a port swap when trust is earned; nginx remains
the instant fallback. lib/pq was rejected (maintenance mode).
