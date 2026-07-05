// Server-only client for the control-plane API. The bearer token lives here
// and must never reach the browser: pages, server actions, and the log route
// handler call these functions; client components only talk to Next.
// Same env names + defaults as packages/shared/src/config.ts.

const API_URL = process.env.DEPLOY_API_URL ?? "http://127.0.0.1:4000";
const API_TOKEN = process.env.DEPLOY_API_TOKEN ?? "dev-token-change-me";

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  port: number;
  created_at: string;
}

export interface Deployment {
  id: string;
  project_id: string;
  commit_sha: string | null;
  commit_message: string | null;
  status: string;
  image_tag: string | null;
  container_id: string | null;
  host_port: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface LogLine {
  deployment_id: string;
  seq: string; // bigint comes back from pg as a string
  stream: "stdout" | "stderr" | "system";
  line: string;
  at: string;
}

/** Statuses with a build/deploy still running — worth polling. */
export const IN_FLIGHT = new Set(["queued", "building", "deploying"]);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${API_TOKEN}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`could not reach the API at ${API_URL} — is it running?`, 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
      res.status,
    );
  }
  return data as T;
}

export const listProjects = () => api<Project[]>("GET", "/api/projects");

export const createProject = (input: {
  name: string;
  repoUrl: string;
  branch: string;
  port: number;
}) => api<Project>("POST", "/api/projects", input);

export const listDeployments = (project?: string, limit?: number) => {
  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  if (limit) qs.set("limit", String(limit));
  const s = qs.toString();
  return api<Deployment[]>("GET", `/api/deployments${s ? `?${s}` : ""}`);
};

/** Same endpoint the CLI's `push` uses. */
export const createDeployment = (project: string) =>
  api<Deployment>("POST", `/api/projects/${encodeURIComponent(project)}/deployments`);

export const rollbackProject = (project: string) =>
  api<Deployment>("POST", `/api/projects/${encodeURIComponent(project)}/rollback`);

export const stopProject = (project: string) =>
  api<{ deploymentId: string }>(
    "POST",
    `/api/projects/${encodeURIComponent(project)}/stop`,
  );

export const removeProject = (project: string) =>
  api<{ ok: boolean }>("DELETE", `/api/projects/${encodeURIComponent(project)}`);

export const getDeployment = (id: string) =>
  api<Deployment>("GET", `/api/deployments/${encodeURIComponent(id)}`);

export const getLogs = (id: string, after = 0) =>
  api<{ status: string; lines: LogLine[] }>(
    "GET",
    `/api/deployments/${encodeURIComponent(id)}/logs?after=${after}`,
  );

/** Public URL a live project is routed at, e.g. http://hello.localhost:8080.
 *  Mirrors the routing config in packages/shared/src/config.ts. */
export function publicUrl(projectName: string): string {
  const scheme = process.env.DEPLOY_PUBLIC_SCHEME ?? "http";
  const base = process.env.DEPLOY_BASE_DOMAIN ?? "localhost";
  const portSuffix = process.env.DEPLOY_PUBLIC_PORT_SUFFIX ?? ":8080";
  return `${scheme}://${projectName}.${base}${portSuffix}`;
}
