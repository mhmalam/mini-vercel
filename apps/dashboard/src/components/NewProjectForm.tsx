"use client";

import { useActionState, useState } from "react";
import { addProject, type AddProjectState } from "@/lib/actions";
import type { GithubRepo } from "@/lib/github";

const initialState: AddProjectState = {};
const MANUAL = "__manual__";

/** Project names become subdomains — squash a repo name into a DNS label. */
function toProjectName(repoName: string): string {
  return repoName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export default function NewProjectForm({ repos }: { repos: GithubRepo[] }) {
  const [state, formAction, pending] = useActionState(addProject, initialState);
  const [manual, setManual] = useState(repos.length === 0);
  const [repoUrl, setRepoUrl] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");

  const onPick = (value: string) => {
    if (value === MANUAL) {
      setManual(true);
      setRepoUrl("");
      return;
    }
    setManual(false);
    setRepoUrl(value);
    const repo = repos.find((r) => r.cloneUrl === value);
    if (repo) {
      setName(toProjectName(repo.name));
      setBranch(repo.defaultBranch);
    }
  };

  return (
    <form className="new-project" action={formAction}>
      {repos.length > 0 && (
        <label className="grow-field">
          repo
          <select
            value={manual ? MANUAL : repoUrl}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="" disabled hidden>
              pick one of your repos…
            </option>
            {repos.map((r) => (
              <option key={r.cloneUrl} value={r.cloneUrl}>
                {r.name}
                {r.description ? ` — ${r.description.slice(0, 60)}` : ""}
              </option>
            ))}
            <option value={MANUAL}>other — enter a URL manually</option>
          </select>
        </label>
      )}
      {manual ? (
        <label className="grow-field">
          repo url
          <input
            name="repoUrl"
            required
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/you/my-app"
          />
        </label>
      ) : (
        <input type="hidden" name="repoUrl" value={repoUrl} />
      )}
      <label>
        name
        <input
          name="name"
          required
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          title="DNS-safe label: a-z, 0-9, hyphens"
          placeholder="my-app"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        branch
        <input
          name="branch"
          placeholder="main"
          size={10}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
      </label>
      <label>
        port
        <input name="port" type="number" min={1} max={65535} placeholder="3000" size={6} />
      </label>
      <button type="submit" className="btn" disabled={pending || (!manual && !repoUrl)}>
        {pending ? "registering…" : "register"}
      </button>
      {state.error && <p className="form-error">error: {state.error}</p>}
    </form>
  );
}
