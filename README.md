# mini-vercel

A self-hosted deployment platform: `deploy push` → the repo is cloned, built into a
Docker image, run as a container, and (soon) routed to a live HTTPS subdomain at
`https://<project>.deploy.malam.me`.

Full project brief: [MINI-VERCEL-PLAN.md](./MINI-VERCEL-PLAN.md) ·
Design doc: [docs/architecture.md](./docs/architecture.md) ·
Decision log: [docs/decisions.md](./docs/decisions.md)

## Layout

```
apps/
  api/        Fastify control-plane API (projects, deployments, logs)
  worker/     BullMQ worker: clone → docker build → run → readiness → swap
  cli/        `deploy` command
packages/
  db/         Postgres pool, SQL migrations, typed queries
  shared/     config, queue names, shared types
infra/
  docker-compose.yml   Postgres + Redis + nginx for local dev
  nginx/conf.d/        server blocks (10-*.conf generated per deploy)
  provision.md         VPS setup runbook (DNS, wildcard cert, hardening)
```

## Prerequisites

- Node.js >= 22
- **Docker Desktop** (with the WSL 2 backend on Windows) — required for
  Postgres/Redis and for building/running deployed apps
- git

## Local dev setup

```sh
npm install
cp .env.example .env          # defaults work for local dev
npm run infra:up              # postgres + redis
npm run migrate               # create tables
npm run dev:api               # terminal 1
npm run dev:worker            # terminal 2
npm run build:cli             # once, to get the `deploy` bin
```

## Usage

```sh
# register a project (its Dockerfile is required; name becomes the subdomain)
npx deploy projects:add my-app --repo https://github.com/you/my-app --port 3000

# build + deploy the head of the configured branch, streaming logs
npx deploy push my-app

# inspect
npx deploy list my-app
npx deploy logs <deployment-id>
```

A successful push ends with the app's routed URL. Locally that is
`http://<project>.localhost:8080` — nginx (in Docker) routes by Host header
to whichever container is live, and the worker rewrites the route on every
deploy. Open it in a browser; unknown subdomains get a 404.

On the VPS the same mechanism serves `https://<project>.deploy.malam.me`
with a wildcard cert — see [infra/provision.md](./infra/provision.md).
The hand-written Go proxy that replaces nginx is the next phase (see plan §4).
