"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/Modal";
import { editProject, type EditProjectState } from "@/lib/actions";

const initialState: EditProjectState = {};

/** Pencil button → modal to edit name (the subdomain), branch, and port.
 *  Renames re-home the subdomain via a worker job (brief downtime);
 *  branch/port take effect on the next deploy. */
export default function EditProject({
  project,
  branch,
  port,
  customDomain,
}: {
  project: string;
  branch: string;
  port: number;
  customDomain?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const action = editProject.bind(null, project);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Edit ${project}`}
        title="edit project"
        onClick={() => setOpen(true)}
      >
        <Pencil size={13} />
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy="edit-title">
          <h3 id="edit-title">
            Edit <span className="mono">{project}</span>
          </h3>
            <p>
              The name is the subdomain — renaming moves the project to its
              new URL (a few seconds of downtime). Branch and port apply on
              the next deploy.
            </p>
            <form className="modal-form" action={formAction}>
              <label>
                name (subdomain)
                <input
                  name="name"
                  defaultValue={project}
                  required
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  title="DNS-safe label: a-z, 0-9, hyphens"
                />
              </label>
              <label>
                branch
                <input name="branch" defaultValue={branch} required />
              </label>
              <label>
                port
                <input
                  name="port"
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={port}
                  required
                />
              </label>
              <label>
                custom domains (optional, space-separated)
                <input
                  name="customDomain"
                  defaultValue={customDomain ?? ""}
                  placeholder="malam.me www.malam.me"
                />
              </label>
              {state.error && <p className="form-error">error: {state.error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                >
                  cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending ? "saving…" : "save changes"}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
