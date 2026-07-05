import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root, anchored to this file (packages/shared/src -> up 3). Workspace
// scripts run with cwd inside apps/*, so cwd-relative defaults would be wrong.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

// Best-effort .env loading from the repo root — npm runs workspace scripts
// with cwd inside apps/*, so a cwd-relative load would miss the file.
// Missing file is fine — defaults below cover local dev. Already-set
// environment variables win over the file.
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  /* no .env present */
}

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

export const config = {
  databaseUrl: env(
    "DATABASE_URL",
    "postgres://minivercel:minivercel@127.0.0.1:5432/minivercel",
  ),
  redisUrl: env("REDIS_URL", "redis://127.0.0.1:6379"),
  apiPort: Number(env("API_PORT", "4000")),
  apiToken: env("DEPLOY_API_TOKEN", "dev-token-change-me"),
  /** HMAC secret for GitHub push webhooks. Empty (the default) disables the
   *  webhook endpoint entirely. */
  webhookSecret: env("GITHUB_WEBHOOK_SECRET", ""),
  buildTimeoutMs: Number(env("BUILD_TIMEOUT_MS", String(10 * 60 * 1000))),
  buildRoot: env("BUILD_ROOT", path.join(os.tmpdir(), "mini-vercel-builds")),
  /** How many images to keep per project when pruning after a build. */
  keepImagesPerProject: 3,

  // ---- routing (nginx phase; see docs/architecture.md) ----
  /** Domain that project subdomains hang off: <project>.<baseDomain>.
   *  "localhost" for local dev (browsers resolve *.localhost to loopback);
   *  "deploy.malam.me" on the VPS. */
  baseDomain: env("DEPLOY_BASE_DOMAIN", "localhost"),
  /** Public scheme+port suffix for printed URLs. Local nginx listens on 8080;
   *  the VPS listens on 80/443 so these become "https" and "". */
  publicScheme: env("DEPLOY_PUBLIC_SCHEME", "http"),
  // Read directly (not via env()) so an explicitly-empty value sticks —
  // the VPS serves on the default port and needs "" here.
  publicPortSuffix: process.env.DEPLOY_PUBLIC_PORT_SUFFIX ?? ":8080",
  /** Where the worker writes generated nginx server blocks (mounted into the
   *  nginx container as /etc/nginx/conf.d). */
  nginxConfDir: env(
    "NGINX_CONF_DIR",
    path.join(repoRoot, "infra", "nginx", "conf.d"),
  ),
  /** Container name to `docker exec <name> nginx -s reload` after rewrites. */
  nginxContainer: env("NGINX_CONTAINER", "mini-vercel-nginx"),
};
