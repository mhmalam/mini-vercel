"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the VIEWER's timezone. Server components format
 * dates with the server's clock (UTC on the VPS), which reads wrong to a
 * human anywhere else — so the value is filled in after hydration, where
 * the browser knows the local zone. A dash renders until then.
 */
export default function LocalTime({
  iso,
  mode = "datetime",
}: {
  iso: string;
  mode?: "time" | "datetime";
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    setText(
      mode === "time"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString([], {
            dateStyle: "short",
            timeStyle: "short",
          }),
    );
  }, [iso, mode]);

  return <>{text ?? "—"}</>;
}
