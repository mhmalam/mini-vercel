import os from "node:os";
import path from "node:path";

// Best-effort .env loading from the current working directory (run services
// from the repo root). Missing file is fine — defaults below cover local dev.
try {
  process.loadEnvFile();
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
  buildTimeoutMs: Number(env("BUILD_TIMEOUT_MS", String(10 * 60 * 1000))),
  buildRoot: env("BUILD_ROOT", path.join(os.tmpdir(), "mini-vercel-builds")),
  /** How many images to keep per project when pruning after a build. */
  keepImagesPerProject: 3,
};
