# VPS provisioning runbook

Goal: the same stack that runs on the laptop, on a VPS, with
`https://<project>.deploy.malam.me` in front of it. Everything below the
"one-time account setup" section can be done in one sitting.

## 0. One-time account setup (only you can do these)

1. **VPS** — two free-ish options; the platform runs 24/7 on either:
   - [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/): **Ampere A1**
     instance (up to 4 ARM cores / 24 GB RAM, free forever). Ubuntu 24.04.
     Note: ARM — Docker images must be arm64 (Node base images are).
   - **AWS EC2**: launch Ubuntu 24.04 on a t3.small (2 GB RAM) if you can spend
     ~$15/mo, or the free-plan t3.micro/t4g.small (1-2 GB) with 2 GB swap.
     EC2 specifics:
     - Security Group inbound: 22 (your IP only), 80, 443. Nothing else —
       the API/dashboard are reached through nginx, not their own ports.
     - Allocate an **Elastic IP** and associate it, or your IP changes on
       every stop/start and DNS breaks.
     - Set a $1 billing alarm + swap on day one:
       `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
       (persist in /etc/fstab: `/swapfile none swap sw 0 0`).
2. **DNS**: find where `malam.me`'s DNS is hosted (whoever answers
   `nslookup -type=NS malam.me`). You need API access for the DNS-01 cert
   challenge — if it's not Cloudflare, consider delegating just DNS to
   Cloudflare's free tier (registrar stays put; only nameservers change).
   **Do not touch apex/`www` records — the portfolio lives there.**
3. Add DNS records once the VPS has a public IP:
   - `A  deploy.malam.me      -> <VPS IP>`
   - `A  *.deploy.malam.me    -> <VPS IP>`

## 1. Base box hardening (ssh in as ubuntu/opc)

```sh
sudo apt update && sudo apt upgrade -y
# firewall: SSH + HTTP + HTTPS only
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Docker (official convenience script is fine for a single box)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # re-login after this
# Node 22 (runs api/worker; they are NOT containerized in v1)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
```

Oracle gotcha: their images also run iptables rules managed by cloud-init, and
the subnet has a Security List — open 80/443 in **both** the VCN Security List
and ufw or nothing gets through.

## 2. Wildcard cert (Let's Encrypt DNS-01, one cert, one renewal cron)

With Cloudflare-hosted DNS (recommended path):

```sh
curl https://get.acme.sh | sh -s email=info@lionstack.org
export CF_Token="<cloudflare api token with DNS edit on malam.me>"
~/.acme.sh/acme.sh --issue --dns dns_cf -d 'deploy.malam.me' -d '*.deploy.malam.me'
# install to a stable path nginx can mount
mkdir -p ~/mini-vercel/infra/nginx/certs
~/.acme.sh/acme.sh --install-cert -d deploy.malam.me \
  --key-file       ~/mini-vercel/infra/nginx/certs/deploy.malam.me.key \
  --fullchain-file ~/mini-vercel/infra/nginx/certs/deploy.malam.me.pem \
  --reloadcmd      "docker exec mini-vercel-nginx nginx -s reload"
```

acme.sh installs its own renewal cron; the `--reloadcmd` makes renewals
hot-reload nginx. Done — never think about certs again.

## 3. Deploy the platform itself

```sh
git clone https://github.com/mhmalam/mini-vercel ~/mini-vercel && cd ~/mini-vercel
npm install && npm run build:cli
cp .env.example .env
# edit .env:
#   DEPLOY_API_TOKEN=<long random string — this is root on the box>
#   DASHBOARD_PASSWORD=<required: the dashboard can deploy code, lock it>
#   DEPLOY_BASE_DOMAIN=deploy.malam.me
#   DEPLOY_PUBLIC_SCHEME=https
#   DEPLOY_PUBLIC_PORT_SUFFIX=
# VPS compose stack: nginx on real 80/443 with the cert dir mounted
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vps.yml up -d
npm run migrate
```

TLS works without touching the worker: `infra/nginx/vps-tls.conf` (mounted only
by the VPS override) terminates HTTPS for the whole wildcard and hands requests
back to the same nginx's HTTP vhosts. Local and VPS routing stay identical.

Run api + worker + dashboard under systemd so they start on boot and restart
on crash (this is what makes the platform 24/7). Unit files are in
`infra/systemd/`:

```sh
npm run build -w apps/dashboard
sudo cp infra/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now minivercel-api minivercel-worker minivercel-dashboard
```

(The units run `npm run dev:*` / `next start` — tsx-in-prod is acceptable v1;
compiled `node dist` start scripts are a backlog item. Edit the `User=` and
`WorkingDirectory=` lines if your username/path differ.)

## 4. Smoke test

From the laptop, with `DEPLOY_API_URL=https://deploy.malam.me` (route the API
through nginx too — backlog) or `http://<VPS IP>:4000` temporarily:

```sh
npx deploy projects:add portfolio --repo https://github.com/mhmalam/<repo> --port 3000
npx deploy push portfolio
# → https://portfolio.deploy.malam.me
```

Success = the plan's MVP: `deploy push` on the laptop → live HTTPS URL.
