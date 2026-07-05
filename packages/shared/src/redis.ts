import { config } from "./config.js";

/**
 * BullMQ connection options parsed from REDIS_URL. Kept as a plain object
 * (not an ioredis instance) so this package doesn't need to match bullmq's
 * bundled ioredis version. maxRetriesPerRequest must be null for BullMQ's
 * blocking commands to survive reconnects.
 */
export function redisConnectionOptions() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db:
      url.pathname && url.pathname !== "/"
        ? Number(url.pathname.slice(1))
        : 0,
    maxRetriesPerRequest: null,
  };
}
