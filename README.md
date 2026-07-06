# mini-vercel

My own little Vercel. I push code, it clones the repo, builds the Dockerfile,
runs the container, and routes a subdomain to it. And it's not a demo:
**[malam.me](https://malam.me) — my actual portfolio — is served by this
platform**, not by the real Vercel. Projects deploy to
`https://<name>.malam.me` from a dashboard at a URL I won't link because
it's password-protected. 

**Watch it work** — a 42-second demo, screen-recorded on the live
dashboard (the video was even edited and scored by code in this repo,
see `demo-video/`):

[![mini-vercel demo video](https://img.youtube.com/vi/vKAdaMZbPIU/maxresdefault.jpg)](https://youtu.be/vKAdaMZbPIU)

I built this because my resume was wall-to-wall JavaScript and I wanted to
actually understand the layer underneath: what happens between `git push` and
a URL that works. Turns out the answer is "a queue, a build pipeline, a
reverse proxy, and a hundred small decisions."

There's a design doc at [docs/architecture.md](./docs/architecture.md).

## How it works, in one breath

The CLI or dashboard hits the API, the API writes a deployment row to
Postgres and drops a job on a Redis queue, the worker picks it up, clones the
repo, `docker build`s it, starts the container on a random localhost port,
waits until it actually answers HTTP, then rewrites the route so nginx sends
`myapp.<domain>` to the new container — and only then stops the old one.
That last ordering is the whole zero-downtime trick.

Nothing talks to Docker except the worker. The CLI and dashboard only ever
talk to the API. I have to keep reminding myself of this and it has saved me
more than once.

## Running it

You need Node 22+, Docker Desktop, and git.

```sh
npm install
cp .env.example .env          # defaults are fine locally
npm run infra:up              # postgres + redis + nginx in Docker
npm run migrate
npm run dev:api               # terminal 1
npm run dev:worker            # terminal 2
npm run build:cli             # once, so `npx deploy` works
```

Then either use the dashboard (`npm run dev:dashboard`, open
http://dashboard.localhost:8080 — pick one of your GitHub repos, hit deploy,
watch the logs stream) or the CLI:

```sh
npx deploy projects:add my-app --repo https://github.com/mhmalam/my-app --port 3000
npx deploy push my-app        # streams the build, ends with a live URL
npx deploy list my-app
npx deploy rollback my-app    # instant — reuses the previous image, no rebuild
npx deploy stop my-app        # takes it offline; push brings it back
npx deploy remove my-app      # deletes everything: containers, images, history
```

Deployed apps land on `http://<name>.localhost:8080` locally, or
`https://<name>.malam.me` in production. The only rule for a repo is that it
has a `Dockerfile` at the root and serves HTTP on one port (the port you give
at registration). Projects can also claim extra hostnames — that's how the
apex `malam.me` itself is routed to the portfolio's container.

There's also a GitHub webhook endpoint for real push-to-deploy — set
`GITHUB_WEBHOOK_SECRET` and point a repo webhook at
`/api/webhooks/github`. It verifies the HMAC signature, so only GitHub can
trigger it. (Only useful once this is on a public server, since GitHub can't
reach my laptop.)

## What's where

```
apps/
  api/        Fastify control plane — auth, projects, deployments, webhook,
              WebSocket log streaming
  worker/     the actual machinery: clone → build → run → readiness → swap
  proxy/      reverse proxy written in Go (see its own README — this is the
              part I'm proudest of)
  dashboard/  Next.js UI
  cli/        the `deploy` command
packages/
  db/         Postgres pool + plain SQL migrations, no ORM
  shared/     config and shared types
infra/
  docker-compose.yml       local stack
  docker-compose.vps.yml   production override (real ports + TLS)
  nginx/                   routing configs (10-*.conf are generated, don't edit)
  systemd/                 unit files so everything survives a reboot
  provision.md             my runbook for setting up the server
```

## Status: live in production

As of July 2026 this runs 24/7 on an AWS EC2 box (1 GB of RAM and swap —
it's fine) and serves my real traffic:

- **malam.me is hosted here.** Deployed by the platform from the portfolio
  repo, routed via its custom-domain support, migrated off Vercel by
  changing one DNS record. Vercel's only remaining job is answering DNS.
- One wildcard Let's Encrypt cert covers everything and renews itself
  through a cron job (DNS-01 challenge against the Vercel DNS API — mildly
  ironic, fully automatic).
- The dashboard sits behind a session-cookie login page; the API behind a
  bearer token; app containers run with memory/CPU limits, bound to
  localhost, with nginx as the only thing facing the internet.
- systemd keeps the api/worker/dashboard alive across crashes and reboots.

The full rebuild-from-nothing runbook — including everything that went
wrong the first time (Amazon Linux vs Ubuntu, lego v5's new CLI, Linux
containers vs host loopback) — is in [infra/provision.md](./infra/provision.md).

Still on the list: cutting public traffic over from nginx to my Go proxy
(it runs in parallel today), per-project env vars so apps with API keys can
deploy, and least-connections load balancing across container replicas.
Single user by design — this runs *my* code on *my* box, and registration
is locked to my GitHub repos on purpose.
