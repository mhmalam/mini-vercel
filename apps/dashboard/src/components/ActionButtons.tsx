"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Rocket, Trash2, Undo2 } from "lucide-react";
import Modal from "@/components/Modal";
import {
  deploy,
  removeProject,
  rollback,
  stopProject,
  type ActionResult,
} from "@/lib/actions";

type Kind = "deploy" | "rollback" | "stop" | "remove";

const LABEL: Record<Kind, [idle: string, busy: string]> = {
  deploy: ["deploy", "queuing…"],
  rollback: ["rollback", "queuing…"],
  stop: ["stop", "stopping…"],
  remove: ["delete", "deleting…"],
};

const ICON: Record<Kind, React.ReactNode> = {
  deploy: <Rocket size={13} />,
  rollback: <Undo2 size={13} />,
  stop: <Power size={13} />,
  remove: <Trash2 size={13} />,
};

const RUN: Record<Kind, (project: string) => Promise<ActionResult>> = {
  deploy,
  rollback,
  stop: stopProject,
  remove: removeProject,
};

/** Destructive kinds confirm through a modal; absent = run immediately. */
const CONFIRM: Partial<Record<Kind, { body: string; cta: string }>> = {
  stop: {
    body: "Its containers will be stopped and the URL will return 404 until the next deploy. Nothing is deleted — deploying brings it right back.",
    cta: "take offline",
  },
  remove: {
    body: "This stops its containers and permanently deletes the project, its deployment history, build logs, and images. The subdomain is freed. This cannot be undone.",
    cta: "delete project",
  },
};

/** Deploy / rollback / stop / delete buttons with inline errors instead of
 *  the Next error page. deploy and rollback navigate to the new deployment's
 *  logs; delete navigates home. */
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
  const [confirming, setConfirming] = useState<Kind | null>(null);
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
    if (CONFIRM[kind]) setConfirming(kind);
    else execute(kind);
  };

  const dialog = confirming ? CONFIRM[confirming] : undefined;

  return (
    <div className="actions">
      {confirming && dialog && (
        <Modal onClose={() => setConfirming(null)} labelledBy="confirm-title">
          <h3 id="confirm-title">
            {confirming === "stop" ? "Take " : "Delete "}
            <span className="mono">{project}</span>{" "}
            {confirming === "stop" ? "offline?" : "forever?"}
          </h3>
          <p>{dialog.body}</p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setConfirming(null)}
              autoFocus
            >
              cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                const kind = confirming;
                setConfirming(null);
                execute(kind);
              }}
            >
              <span className="icon-label">
                {ICON[confirming]}
                {dialog.cta}
              </span>
            </button>
          </div>
        </Modal>
      )}
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          className={
            kind === "stop" || kind === "remove"
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
