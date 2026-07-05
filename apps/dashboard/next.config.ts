import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Load the repo-root .env (the same file the API/worker/CLI read) so
// DEPLOY_API_URL / DEPLOY_API_TOKEN don't need duplicating into this app.
// Like `node --env-file`, this never overrides variables already set in the
// real environment. Missing file is fine — defaults cover local dev.
try {
  process.loadEnvFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env"),
  );
} catch {
  /* no .env present */
}

const nextConfig: NextConfig = {};

export default nextConfig;
