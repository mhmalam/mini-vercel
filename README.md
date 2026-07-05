# mini-vercel

My own little Vercel. I push code, it clones the repo, builds the Dockerfile,
runs the container, and routes a subdomain to it. Eventually every project I
own — including [malam.me](https://malam.me) itself — will be served by this
instead of the real Vercel.

I built this because my resume was wall-to-wall JavaScript and I wanted to
actually understand the layer underneath: what happens between `git push` and
a URL that works. Turns out the answer is "a queue, a build pipeline, a
reverse proxy, and a hundred small decisions" — the interesting ones are
written down in [docs/decisions.md](./docs/decisions.md).

The original plan I'm building against is [MINI-VERCEL-PLAN.md](./MINI-VERCEL-PLAN.md),
and there's a design doc at [docs/architecture.md](./docs/architecture.md).

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

Deployed apps land on `http://<name>.localhost:8080` locally. The only rule
for a repo is that it has a `Dockerfile` at the root and serves HTTP on one
port (the port you give at registration).

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

## Status

Everything above works locally, end to end. What's left is going live:
a VPS, the `*.deploy.malam.me` wildcard DNS + cert, and then custom domains
so malam.me itself can move over. After that, cutting traffic from nginx to
my Go proxy for good. Single user by design — this runs *my* code on *my*
box, and registration is locked to my GitHub repos on purpose.
