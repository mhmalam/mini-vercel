"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the server-rendered page data on an interval. Fast while a
 * deployment is in flight; slow-but-steady when idle, so builds that start
 * elsewhere (a webhook push, another tab, the CLI) show up on their own
 * instead of waiting for a manual refresh.
 */
export default function AutoRefresh({
  active,
  intervalMs = 3000,
  idleIntervalMs = 12000,
}: {
  active: boolean;
  intervalMs?: number;
  idleIntervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(
      () => router.refresh(),
      active ? intervalMs : idleIntervalMs,
    );
    return () => clearInterval(timer);
  }, [active, intervalMs, idleIntervalMs, router]);
  return null;
}
