"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isInFlight } from "@/lib/status";

interface Line {
  seq: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
}

const POLL_MS = 2000;

/** Fetches build logs through the dashboard's own /api proxy (the control
 *  plane token never reaches the browser) and keeps polling every 2s while
 *  the deployment is queued/building/deploying. Auto-scrolls unless the
 *  user has scrolled up to read. */
export default function LogViewer({
  deploymentId,
  initialStatus,
}: {
  deploymentId: string;
  initialStatus: string;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();

  const paneRef = useRef<HTMLDivElement>(null);
  // Follow the tail only while the deployment is running. For a finished
  // deployment the story starts at the top (clone → build → ...), so jumping
  // to the bottom would hide everything but the last lines.
  const stickRef = useRef(isInFlight(initialStatus));
  const afterRef = useRef(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(
          `/api/deployments/${deploymentId}/logs?after=${afterRef.current}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { status: string; lines: Line[] };
          if (stopped) return;
          if (data.lines.length > 0) {
            for (const l of data.lines) {
              afterRef.current = Math.max(afterRef.current, Number(l.seq));
            }
            setLines((prev) => [...prev, ...data.lines]);
          }
          setStatus(data.status);
          if (!isInFlight(data.status)) {
            // Terminal: refresh the server-rendered status/meta above, stop polling.
            router.refresh();
            return;
          }
        }
      } catch {
        /* API unreachable — keep trying */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [deploymentId, router]);

  // Auto-scroll to the newest line while the user is at (or near) the bottom.
  useEffect(() => {
    const pane = paneRef.current;
    if (pane && stickRef.current) pane.scrollTop = pane.scrollHeight;
  }, [lines]);

  function onScroll() {
    const pane = paneRef.current;
    if (!pane) return;
    stickRef.current =
      pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 60;
  }

  const waiting = isInFlight(status);

  return (
    <div className="logs" ref={paneRef} onScroll={onScroll}>
      {lines.length === 0 && !waiting && (
        <div className="faint">no log output for this deployment</div>
      )}
      {lines.map((l) => (
        <div key={l.seq} className={`line ${l.stream}`}>
          {l.line}
        </div>
      ))}
      {waiting && <div className="waiting">{status} </div>}
    </div>
  );
}
