"use client";

import { useTransition } from "react";
import { deploy } from "@/lib/actions";

/** Queues a build via the same API endpoint the CLI's `push` uses, then
 *  navigates to the new deployment's log view. */
export default function DeployButton({ project }: { project: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={() => {
        startTransition(async () => {
          await deploy(project);
        });
      }}
    >
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "queuing…" : "deploy"}
      </button>
    </form>
  );
}
