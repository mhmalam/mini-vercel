# Server provisioning runbook (as built)

This is how the production box was actually set up on 2026-07-05 — kept
accurate so the server can be rebuilt from nothing. The original plan said
Ubuntu + Cloudflare DNS; reality turned out to be Amazon Linux + Vercel DNS,
and the differences bit hard enough to document.

The box: AWS EC2 in us-east-1, Amazon Linux 2023, 1 GB RAM (t3.micro class)
+ 2 GB swap, 30 GB gp3, an Elastic IP, default user `ec2-user`. Security
Group inbound: 22 (my IP only), 80, 443. That SG *is* the firewall — AL2023
ships no ufw and doesn't need one here.

## 0. Accounts / DNS (one-time)

- malam.me's nameservers are Vercel's (`ns1/ns2.vercel-dns.com`), so cert
  issuance goes through the Vercel DNS API: create an API token, and note
  the **team ID** (`v2/teams` endpoint) — API calls without `teamId` get 403
  because the domain lives under the default team.
- DNS records (Vercel dashboard or API): `A deploy -> <elastic-ip>`,
  `A *.deploy -> <elastic-ip>`, `A * -> <elastic-ip>` (projects live at
  `<name>.malam.me`), and — after the portfolio migration — `A @` and
  `A www` to the same IP.
- Billing alarm in AWS. Do it. It's two clicks.

## 1. Base system (AL2023, run as root)

```sh
dnf update -y
dnf install -y docker git cronie          # cronie: AL2023 has no cron!
systemctl enable --now docker crond
usermod -aG docker ec2-user
# docker compose v2 plugin (not in AL2023's docker package)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose && chmod +x $_
# 2G swap — mandatory on 1GB or Next.js builds OOM
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Node 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && dnf install -y nodejs
# lego (ACME client; v5 — the CLI changed a lot from v4)
# grab latest linux_amd64 tar from https://github.com/go-acme/lego/releases into /usr/local/bin
```

## 2. Wildcard cert (lego v5 + Vercel DNS)

Token + team id live in `~/.mv-lego.env` (chmod 600, sourced by the renew
script — never in the repo):

```sh
export VERCEL_API_TOKEN=...
export VERCEL_TEAM_ID=team_...
```

Issue (v5 syntax: flags live under `run`, data dir via `LEGO_PATH`; note
Let's Encrypt rejects `deploy.malam.me` alongside `*.malam.me` — the
wildcard already covers it):

```sh
source ~/.mv-lego.env
LEGO_PATH=~/.lego lego run --accept-tos -m info@lionstack.org --dns vercel \
  -d "malam.me" -d "*.malam.me" -d "*.deploy.malam.me"
cp ~/.lego/certificates/malam.me.crt ~/mini-vercel/infra/nginx/certs/deploy.malam.me.pem
cp ~/.lego/certificates/malam.me.key ~/mini-vercel/infra/nginx/certs/deploy.malam.me.key
```

Renewal: `~/renew-cert.sh` runs the same `lego run` (v5 renews only when
due), re-copies, reloads nginx; daily crontab at 03:14. The CAA record
`0 issue "letsencrypt.org"` in the DNS must stay or issuance breaks.

## 3. The platform

```sh
git clone https://github.com/mhmalam/mini-vercel ~/mini-vercel && cd ~/mini-vercel
npm install && npm run build:cli && npm run build -w apps/dashboard
cp .env.example .env   # then set:
#   DEPLOY_API_TOKEN=<long random — this is root on the box>
#   DASHBOARD_PASSWORD=<the login page checks this>
#   GITHUB_WEBHOOK_SECRET=<random>
#   ALLOWED_REPO_OWNERS=mhmalam
#   DEPLOY_BASE_DOMAIN=malam.me
#   DEPLOY_PUBLIC_SCHEME=https
#   DEPLOY_PUBLIC_PORT_SUFFIX=
cp infra/nginx/vps-tls.conf infra/nginx/conf.d/99-tls.conf   # can't file-mount into an :ro dir mount
docker compose -f infra/docker-compose.yml -f infra/docker-compose.vps.yml up -d
npm run migrate
sudo cp infra/systemd/*.service /etc/systemd/system/
sudo sed -i 's/User=ubuntu/User=ec2-user/; s|/home/ubuntu|/home/ec2-user|g' /etc/systemd/system/minivercel-*.service
sudo systemctl daemon-reload
sudo systemctl enable --now minivercel-api minivercel-worker minivercel-dashboard
```

Two Linux lessons baked into the compose override: nginx runs with
`network_mode: host` because a bridged container cannot reach services bound
to the host's 127.0.0.1 (which is where the API and every app container
deliberately live — Docker Desktop hides this, real Linux doesn't), with
`host.docker.internal` pinned to 127.0.0.1 so the generated configs work
unchanged. And the TLS include is copied, not mounted (see above).

## 4. Smoke test

```sh
curl https://api.deploy.malam.me/health          # {"ok":true}
# register + deploy something via the dashboard at https://deploy.malam.me
# then: curl https://<project>.malam.me
```

Updating the platform after a code change: `git pull`, `npm install` if deps
changed, `npm run build -w apps/dashboard` if the dashboard changed,
`sudo systemctl restart minivercel-api minivercel-worker minivercel-dashboard`.
(tsx watch reloads api/worker on pull by itself; the dashboard is a compiled
build and needs the rebuild+restart.)
