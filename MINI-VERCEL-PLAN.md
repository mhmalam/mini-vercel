# Mini-Vercel: Personal Deployment Platform — Project Brief

> Handoff document for a fresh Claude Code session. Read this fully before writing any code.
> The owner of this project is Mohammed (mhmalam) — Columbia CS '27, comfortable with
> Node.js/TypeScript, React/Next.js, Redis, Bull.js/BullMQ, MongoDB, PostgreSQL, Docker, AWS.
> New-ish to: Go, systems-level networking, TLS internals. This project is deliberately
> chosen to stretch into platform/infra engineering.

## What this is

A self-hosted deployment platform: `git push` (or a CLI command) → the system builds the
repo into a Docker image → runs it as a container → routes a live HTTPS subdomain to it.
2
```
deploy push
  → build job queued
  → docker build (logs streamed)
  → container starts on a dynamic port
  → reverse proxy routes projectname.<domain> → container
  → https://projectname.<domain> is live
```

**This is a real tool, not a demo.** Success = the owner's actual projects (portfolio site,
client apps, bots' web dashboards) run on this platform daily. That's the end state that
makes it resume-worthy: "built and operate the platform that serves my own production apps."

## Why it exists (resume context)

The owner's resume is strong but 100% JavaScript/web (Node, React, Redis, Mongo). A reviewer
flagged the lack of systems/infrastructure work. This project converts "used Docker/AWS"
into "built a multi-tenant container orchestration + CI/CD + routing system." Target roles:
backend / infra / platform engineering internships.

Target resume bullets (write code that makes these honestly true):

- "Built a self-hosted deployment platform that builds, containerizes, and deploys
  applications from Git pushes, serving my production projects"
- "Implemented a reverse proxy in Go with dynamic subdomain routing, health checks, and
  zero-downtime deploys across concurrent containers"
- "Orchestrated build pipelines with Redis-backed job queues, streaming build logs live
  over WebSockets"

Note: the resume follows a unique-first-verb rule (no two bullets share a leading verb).
Verbs already taken: Designed, Leading, Containerized, Shipped, Won, Built (Headstarter),
Delivered, Developed, Launched, Reduced, Processed, Independently, Engineered, Integrated,
Created, Trained, Deployed. Free: Implemented, Architected, Orchestrated, Constructed, etc.

## Architecture (6 components)

### 1. Trigger layer
- **MVP: CLI first, webhooks later.** A `deploy` CLI (Node.js, published locally) with
  `deploy push`, `deploy list`, `deploy logs <id>`, `deploy rollback <project>`.
- Phase 2: GitHub webhook receiver (verify HMAC signature) that creates deployment jobs
  on push to a configured branch.
- Either path produces a **deployment job** written to Postgres and enqueued in BullMQ.

### 2. Build system
- Worker (Node.js + BullMQ on Redis) pulls the job:
  1. `git clone --depth 1` the repo at the pushed commit into a temp workdir
  2. `docker build` — projects supply their own Dockerfile (MVP requirement;
     buildpack-style auto-detection of Node projects is a later upgrade)
  3. Tag image `<project>:<deployment-id>`
  4. Stream stdout/stderr to Postgres (append-only build_logs) and over WebSocket
- Build timeout (e.g. 10 min) and disk cleanup of workdirs/old images are REQUIRED early —
  a single VPS fills up fast. `docker image prune` policy: keep last 3 images per project.

### 3. Container runtime manager
- Each successful build → run container with:
  - dynamically allocated host port (track in DB; or use Docker's ephemeral ports and
    inspect the mapping)
  - resource limits: `--memory`, `--cpus` (multi-tenant box — one runaway app must not
    kill the platform)
  - `--restart unless-stopped`, labeled with project/deployment IDs for discovery
- Lifecycle: starting → healthy (passes HTTP health check) → live; keep the previous
  container running until the new one is healthy, then swap routing and stop the old one
  (**this is the zero-downtime story — build it, it's the best interview material here**)
- Rollback = re-point routing at the previous deployment's container/image.

### 4. Reverse proxy — the crown jewel
- **Phase 1 (training wheels): nginx** with config templates regenerated on deploy +
  `nginx -s reload`. Gets the platform working end-to-end fast.
- **Phase 2 (the differentiator): replace nginx with a hand-written Go reverse proxy**:
  - reads routing table from Postgres (or in-memory, updated via a control channel)
  - Host-header based routing: `projecta.<domain>` → `127.0.0.1:<port>`
  - health checks, per-project request logging, graceful config swaps without dropping
    connections
  - later: least-connections balancing when a project runs >1 container
- Do NOT skip phase 2. nginx-only keeps this a "glue project"; the Go proxy is what makes
  it a systems project.

### 5. Domains + TLS
- **DECIDED: use `*.deploy.malam.me`** — the owner owns `malam.me` (it also hosts their
  portfolio, so never touch the apex or `www` records; only add the `*.deploy` wildcard).
  Deploy URLs look like `https://projectname.deploy.malam.me`.
- **Use ONE wildcard cert via Let's Encrypt DNS-01 challenge for `*.deploy.malam.me`.**
  Per-deploy cert issuance is complexity with zero learning value; wildcard sidesteps it.
  DNS-01 requires API access to the DNS provider — confirm where malam.me's DNS is hosted
  (Cloudflare, registrar, etc.) as the FIRST task of the build day, since DNS propagation
  and cert issuance take time and can run while coding.
- acme.sh or lego (Go) for issuance + renewal cron. Proxy terminates TLS with the wildcard.
- Wildcard DNS record `*.deploy.malam.me → VPS IP`.

### 6. Dashboard (deliberately thin)
- Next.js app (can itself be deployed on the platform — great dogfooding demo):
  - project list with status (live / building / failed / stopped)
  - deployment history per project with rollback button
  - live build log viewer (WebSocket tail)
- Do not overbuild. No teams, no billing, no settings sprawl. Owner is the only user.

## Stack (decided — don't relitigate without reason)

| Layer | Choice | Why |
|---|---|---|
| API + workers | Node.js + TypeScript | owner's strength; velocity |
| Queue | BullMQ on Redis | owner knows Bull.js; reinforces resume |
| Database | PostgreSQL (in Docker) | on the resume; SQLite acceptable fallback if ops pain |
| Containers | Docker via dockerode (or CLI shell-outs first) | core of the project |
| Proxy | nginx → then custom Go proxy | learning arc, see §4 |
| Dashboard | Next.js | owner's strength |
| Host | single VPS — owner wants $0: prefer **Oracle Cloud Always Free** (4 ARM cores / 24 GB RAM, free forever; note ARM images), fallback AWS EC2 free plan (~6 months of credits, 1 GB RAM — add swap + a $1 billing alarm) | one box is enough; build/test fully on localhost first, VPS last |

## Data model (starting point)

```sql
projects(
  id uuid pk, name text unique,          -- becomes the subdomain
  repo_url text, branch text default 'main',
  created_at timestamptz
)
deployments(
  id uuid pk, project_id fk, commit_sha text,
  status text,                            -- queued|building|deploying|live|failed|stopped|rolled_back
  image_tag text, container_id text, host_port int,
  created_at, started_at, finished_at timestamptz
)
build_logs(
  deployment_id fk, seq bigint, stream text,  -- stdout|stderr
  line text, at timestamptz,
  primary key (deployment_id, seq)
)
routes(
  subdomain text pk, deployment_id fk, updated_at timestamptz
)
```

## Suggested repo structure (monorepo)

```
mini-vercel/            # pick a real name early; naming it matters for motivation
  apps/
    api/                # Fastify/Express control-plane API + webhook receiver
    worker/             # BullMQ build + deploy workers
    proxy/              # Go reverse proxy (phase 2)
    dashboard/          # Next.js UI
    cli/                # `deploy` command (Node, commander/clipanion)
  packages/
    db/                 # schema, migrations (drizzle or knex), shared types
    shared/             # deployment state machine, config
  infra/
    docker-compose.yml  # postgres, redis, api, worker for local dev
    provision.md        # VPS setup runbook (docker, firewall, DNS, certs)
  docs/
    architecture.md     # keep a running design doc — interview gold
    decisions.md        # ADR-style log of choices and why
```

## Build plan: ONE-DAY SPRINT to a live MVP, then a backlog

The owner wants the working core built in a single day (pair-programming with Claude Code).
That is achievable for the MVP below. Everything in the backlog is REQUIRED before the
resume bullets are honest — day one earns "it works," the backlog earns "platform engineering."

### Day-one MVP — definition: `deploy push` on the laptop → live HTTPS URL

Suggested order for the day (roughly sequential; VPS steps can run in parallel with coding):

1. **VPS + DNS first** (lets DNS/cert issuance propagate while coding):
   provision the VPS, install Docker, firewall (80/443/SSH only),
   add `*.deploy.malam.me` A record, issue the wildcard cert via DNS-01 (acme.sh or lego).
2. **Skeleton:** monorepo, docker-compose for Postgres + Redis, DB schema/migrations.
3. **API:** create project, create deployment, get status/logs. Bearer-token auth from the start.
4. **Worker:** BullMQ consumer — `git clone` → `docker build` → run container on a dynamic
   `127.0.0.1` port with memory/CPU limits → record port/status/logs in Postgres.
5. **Routing:** nginx with a config template regenerated on each deploy + `nginx -s reload`,
   TLS terminated with the wildcard cert.
6. **CLI:** `deploy push`, `deploy list`, `deploy logs`. Thin HTTP client over the API.
7. **End-to-end test:** deploy one real app; fix what breaks. Ship state: live URL by midnight.

Day-one scope cuts (deliberate): no dashboard, no webhooks, no rollback, no Go proxy,
no zero-downtime cutover (brief downtime between old/new container is acceptable today).
Non-negotiables even on day one: auth on the API, container resource limits, app ports
bound to 127.0.0.1 only, and Docker socket never exposed.

### Backlog (do in this order; the resume story depends on these)

1. **Go reverse proxy replaces nginx** — host-based routing, health checks, graceful
   route-table swaps. The single most valuable piece; do not skip.
2. **Zero-downtime deploys + rollback** — health-gated cutover; `deploy rollback`.
3. **Dashboard (Next.js)** — projects, deployment history, log viewer; deploy it ON the platform.
4. **GitHub webhooks + WebSocket live log streaming** — true push-to-deploy.
5. **Hardening** — image/workdir GC (urgent: single VPS fills its disk fast), build
   timeouts, provision runbook, `docs/architecture.md`.

### Architecture clarification (owner asked; keep this mental model)

Nothing ever talks to Docker directly — not the CLI, not the dashboard, not GitHub.
The chain is: CLI/dashboard/webhook → **API** (auth, writes to Postgres, enqueues job)
→ **worker** (dequeues, drives Docker over its local socket) → **Docker** (builds and
runs containers, all on the VPS). Docker is a local tool the worker commands; it is
never network-exposed. The platform code IS the middleman — that's the project.

## Security constraints (non-negotiable)

- Single-user system. The only person deploying code is the owner. Do NOT build
  multi-user/public signup — running strangers' containers safely is a different,
  much harder project.
- Containers run with memory/CPU limits, no `--privileged`, no docker socket mounted
  into tenant containers.
- API + dashboard behind auth (even simple bearer token / basic auth) — this box has
  the Docker socket, treat its control plane as root.
- Webhook endpoint verifies GitHub HMAC signatures.
- VPS firewall: only 80/443/SSH exposed. App container ports bound to 127.0.0.1 only.

## Known traps (learned from planning, avoid these)

- **Disk exhaustion:** every deploy leaves images + build dirs. GC from week 2, not week 8.
- **Per-deploy TLS certs:** don't. Wildcard cert, one renewal cron.
- **Buildpack auto-detection:** tempting, endless. Require a Dockerfile; revisit later.
- **Dashboard gold-plating:** the platform is the product; UI is a viewport.
- **Kubernetes envy:** one VPS, raw Docker. k8s would delete the learning value AND the
  shipping speed.
- **Abandonment risk:** the one-day MVP ends with something live; the danger is stopping
  there. The backlog (especially the Go proxy) is what makes this a systems project —
  schedule it immediately while momentum is high.

## Definition of done (v1)

- [ ] `deploy push` from a laptop → live HTTPS URL in < 3 minutes
- [ ] Owner's portfolio (or another real project) served by the platform in production
- [ ] Hand-written Go proxy in front, nginx retired
- [ ] Rollback works and has been exercised
- [ ] A failed build shows readable logs in CLI and dashboard
- [ ] `docs/architecture.md` explains the system well enough to drive an interview
