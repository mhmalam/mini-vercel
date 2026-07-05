"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Square, Undo2 } from "lucide-react";
import { deploy, rollback, stopProject, type ActionResult } from "@/lib/actions";

type Kind = "deploy" | "rollback" | "stop";

const LABEL: Record<Kind, [idle: string, busy: string]> = {
  deploy: ["deploy", "queuing…"],
  rollback: ["rollback", "queuing…"],
  stop: ["stop", "stopping…"],
};

const ICON: Record<Kind, React.ReactNode> = {
  deploy: <Rocket size={13} />,
  rollback: <Undo2 size={13} />,
  stop: <Square size={11} fill="currentColor" />,
};

const RUN: Record<Kind, (project: string) => Promise<ActionResult>> = {
  deploy,
  rollback,
  stop: stopProject,
};

/** Deploy / rollback / stop buttons with inline errors instead of the Next
 *  error page. deploy and rollback navigate to the new deployment's logs. */
export default function ActionButtons({
  project,
  kinds = ["deploy"],
}: {
  project: string;
  kinds?: Kind[];
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const router = useRouter();

  const execute = (kind: Kind) => {
    setBusy(kind);
    setError(null);
    startTransition(async () => {
      const result = await RUN[kind](project);
      if (result?.error) setError(result.error);
      else if (kind === "stop") router.refresh();
      setBusy(null);
    });
  };

  const run = (kind: Kind) => {
    if (kind === "stop") setConfirmingStop(true);
    else execute(kind);
  };

  return (
    <div className="actions">
      {confirmingStop && (
        <div
          className="modal-overlay"
          onClick={() => setConfirmingStop(false)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="stop-title">
              Take <span className="mono">{project}</span> offline?
            </h3>
            <p>
              Its containers will be stopped and the URL will return 404 until
              the next deploy. Nothing is deleted — deploying brings it right
              back.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmingStop(false)}
                autoFocus
              >
                cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmingStop(false);
                  execute("stop");
                }}
              >
                <span className="icon-label">
                  <Square size={11} fill="currentColor" /> take offline
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          className={
            kind === "stop"
              ? "btn btn-danger"
              : kind === "deploy"
                ? "btn btn-primary"
                : "btn"
          }
          disabled={pending}
          onClick={() => run(kind)}
        >
          <span className="icon-label">
            {ICON[kind]}
            {busy === kind ? LABEL[kind][1] : LABEL[kind][0]}
          </span>
        </button>
      ))}
      {error && <span className="error-text">error: {error}</span>}
    </div>
  );
}
