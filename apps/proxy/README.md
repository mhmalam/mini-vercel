# proxy — the hand-written Go reverse proxy (phase 2)

Routes `http://<project>.<domain>` to whichever container is live, straight
from the `routes` table in Postgres. This is phase 2 of the proxy story
(MINI-VERCEL-PLAN.md §4): it does the same job as the generated nginx config,
but with its own route polling, active health checks, per-request access logs,
and optional TLS termination.

```
request Host: hello.localhost:8081
        │  strip port, take first label -> "hello"
        ▼
route table (polled from Postgres every 2s, atomically swapped)
        │  hello -> host_port 50929
        ▼
health map (every backend GET-probed every 5s, 3s timeout)
        │  :50929 healthy?  no -> 503 "deployment unhealthy"
        ▼
httputil.ReverseProxy -> http://127.0.0.1:50929  (WebSockets pass through)
```

Unknown subdomain → `404 no such deployment`. Backend down → `503` (health
check caught it) or `502` (it died between checks).

## Run it locally

Requires Go ≥ 1.21 and the infra stack up (`npm run infra:up`).

```sh
cd apps/proxy
go run .
# in another terminal:
curl -H "Host: hello.localhost" http://127.0.0.1:8081/
```

Or build a binary: `go build .` → `./proxy` (`proxy.exe` on Windows).

## Coexistence with nginx

Nothing conflicts: nginx (phase 1) listens on **8080** inside Docker and is
reloaded by the worker; this proxy listens on **8081** on the host and needs
no reloads — it notices route changes by itself within 2s. Run both, compare
behavior, and when the Go proxy has earned trust, point the public port at it
and retire the nginx container. The worker keeps writing the `routes` row
either way — that row is the shared source of truth.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://minivercel:minivercel@127.0.0.1:5432/minivercel` | Postgres with the `routes`/`deployments` tables (same default as the Node config). |
| `PROXY_HTTP_PORT` | `8081` | HTTP listen port. With TLS enabled this listener only redirects to https. |
| `PROXY_HTTPS_PORT` | `8443` | HTTPS listen port (only used when TLS is enabled). |
| `PROXY_UPSTREAM_HOST` | `127.0.0.1` | Host the app containers publish on. On the local host it's loopback; from inside a container it would be `host.docker.internal`. |
| `PROXY_TLS_CERT` | *(unset)* | Path to a PEM cert (e.g. the `*.deploy.malam.me` wildcard). TLS turns on only when **both** cert and key are set. |
| `PROXY_TLS_KEY` | *(unset)* | Path to the matching PEM private key. |

## VPS notes

- Terminate TLS here: set `PROXY_TLS_CERT`/`PROXY_TLS_KEY` to the wildcard
  cert from lego/acme.sh, `PROXY_HTTPS_PORT=443`, `PROXY_HTTP_PORT=80`
  (the HTTP listener then 308-redirects everything to https).
- Binding :80/:443 as non-root needs
  `setcap 'cap_net_bind_service=+ep' ./proxy` (or run it behind systemd with
  `AmbientCapabilities=CAP_NET_BIND_SERVICE`).
- The proxy holds no state; restarting it is safe. On a Postgres outage it
  keeps serving the last route table it saw.
