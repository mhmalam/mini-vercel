# Architecture

> Running design doc. Updated as the system grows; the target state is in
> MINI-VERCEL-PLAN.md. This describes what exists **now**.

## Current state (weekend 1: skeleton + local loop)

```
deploy push (CLI)
   │  POST /api/projects/:name/deployments  (bearer token)
   ▼
api (Fastify) ── insert deployments row (status=queued) ── enqueue BullMQ job
   │                                                            │
   ▼                                                            ▼
Postgres  ◄──────────── status/log updates ──────────── worker (BullMQ, concurrency 1)
                                                             │
                                                             ├─ git clone --depth 1
                                                             ├─ docker build -t <project>:<id8>
                                                             ├─ docker run -d  (512m / 1 cpu,
                                                             │    127.0.0.1:ephemeral → app port,
                                                             │    labeled minivercel.project/.deployment)
                                                             ├─ poll HTTP until the app answers
                                                             ├─ stop previous project containers
                                                             └─ prune images (keep newest 3)
```

- **State machine:** `queued → building → deploying → live | failed`; previous
  live deployments become `stopped` when a new one goes live.
- **Logs:** every stdout/stderr line from clone/build plus `system` progress
  markers land in append-only `build_logs` with a per-deployment sequence
  number. The CLI tails them by polling `GET /deployments/:id/logs?after=<seq>`.
- **Ports:** Docker assigns an ephemeral host port (`-p 127.0.0.1::<appPort>`);
  the worker reads the mapping with `docker port` and stores it on the
  deployment row. Binding to 127.0.0.1 keeps app containers unreachable from
  outside the box — only the (future) proxy will be public.
- **Cutover:** the old container is stopped only after the new one answers
  HTTP — the primitive that becomes zero-downtime deploys once the proxy
  owns routing.
- **Cleanup:** build workdirs are deleted after every run; images beyond the
  newest 3 per project are pruned after each successful deploy.

## Security posture (current)

- All API routes except `/health` require `Authorization: Bearer <token>`.
- API listens on 127.0.0.1 only (it drives the Docker socket = root).
- App containers: memory/CPU limits, no privileged flags, ports bound to
  loopback.

## Not built yet (by design, see plan)

Reverse proxy + subdomains, TLS, GitHub webhooks, WebSocket log streaming,
dashboard, rollback, health-gated zero-downtime cutover in the proxy.
