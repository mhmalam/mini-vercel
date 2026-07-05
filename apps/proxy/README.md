# the Go proxy

This is my hand-written replacement for nginx — the part of the project I
built specifically to learn something hard. nginx got the platform working
fast (the worker generates its config and reloads it on every deploy), but a
config file I regenerate isn't the same as understanding how a reverse proxy
actually works. So this is one, from scratch, in about 400 lines of Go.

What it does:

- polls the `routes` table in Postgres every 2 seconds and swaps the route
  map atomically (readers never lock, never see a half-updated table)
- routes by Host header: `hello.localhost:8081` → first label is `hello` →
  look up its live container's port → `httputil.ReverseProxy`
- health-checks every backend every 5 seconds; a dead app gets a clean
  `503 deployment unhealthy` instead of a hang
- logs every request (method, host, status, duration, upstream)
- unknown subdomain → `404 no such deployment`
- WebSockets pass through untouched

It runs on **:8081** next to nginx on **:8080**, both reading the same routes
table, so I can compare them request-for-request. When I trust it fully, it
takes the public port and the nginx container retires. It needs no reloads —
it notices route changes on its own within 2 seconds, which is honestly the
part that made the design click for me: the proxy is just a *view* over the
database.

## Try it

Go 1.21+ and the local stack running (`npm run infra:up` from the repo root):

```sh
cd apps/proxy
go run .
# elsewhere:
curl -H "Host: hello.localhost" http://127.0.0.1:8081/
```

## Config

All env vars, all optional:

| Variable | Default | What it is |
| --- | --- | --- |
| `DATABASE_URL` | same local default as the Node side | where the routes live |
| `PROXY_HTTP_PORT` | `8081` | HTTP listener (redirects to https when TLS is on) |
| `PROXY_HTTPS_PORT` | `8443` | HTTPS listener (only with TLS) |
| `PROXY_UPSTREAM_HOST` | `127.0.0.1` | where app containers publish their ports |
| `PROXY_TLS_CERT` / `PROXY_TLS_KEY` | unset | set both → TLS on |

## Notes for the server

Set the cert/key to the wildcard cert, ports to 80/443, and give the binary
permission to bind low ports (`setcap 'cap_net_bind_service=+ep' ./proxy`,
or `AmbientCapabilities=CAP_NET_BIND_SERVICE` in the systemd unit). It holds
no state, so restarting it is always safe — and if Postgres goes down it
keeps serving the last route table it saw, which is exactly what you want.

Known gap I chose to accept: if an app dies *between* health checks, the
first request in that window gets a 502 before the checker flips it to 503.
