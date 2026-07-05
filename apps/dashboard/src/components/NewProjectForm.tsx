"use client";

import { useActionState } from "react";
import { addProject, type AddProjectState } from "@/lib/actions";

const initialState: AddProjectState = {};

export default function NewProjectForm() {
  const [state, formAction, pending] = useActionState(addProject, initialState);
  return (
    <form className="new-project" action={formAction}>
      <label>
        name
        <input
          name="name"
          required
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          title="DNS-safe label: a-z, 0-9, hyphens"
          placeholder="my-app"
        />
      </label>
      <label className="grow-field">
        repo url
        <input name="repoUrl" required placeholder="https://github.com/you/my-app" />
      </label>
      <label>
        branch
        <input name="branch" placeholder="main" size={10} />
      </label>
      <label>
        port
        <input name="port" type="number" min={1} max={65535} placeholder="3000" size={6} />
      </label>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "registering…" : "register"}
      </button>
      {state.error && <p className="form-error">error: {state.error}</p>}
    </form>
  );
}
