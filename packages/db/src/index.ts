import pg from "pg";
import { config } from "@mini-vercel/shared";
import type { BuildLogLine, Deployment, Project } from "./types.js";

export * from "./types.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// ---------- projects ----------

export async function createProject(input: {
  name: string;
  repoUrl: string;
  branch?: string;
  port?: number;
}): Promise<Project> {
  const { rows } = await pool.query<Project>(
    `insert into projects (name, repo_url, branch, port)
     values ($1, $2, $3, $4)
     returning *`,
    [input.name, input.repoUrl, input.branch ?? "main", input.port ?? 3000],
  );
  return rows[0]!;
}

export async function getProjectByName(name: string): Promise<Project | null> {
  const { rows } = await pool.query<Project>(
    "select * from projects where name = $1",
    [name],
  );
  return rows[0] ?? null;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const { rows } = await pool.query<Project>(
    "select * from projects where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function listProjects(): Promise<Project[]> {
  const { rows } = await pool.query<Project>(
    "select * from projects order by created_at",
  );
  return rows;
}

// ---------- deployments ----------

export async function createDeployment(projectId: string): Promise<Deployment> {
  const { rows } = await pool.query<Deployment>(
    `insert into deployments (project_id, status)
     values ($1, 'queued')
     returning *`,
    [projectId],
  );
  return rows[0]!;
}

export async function getDeployment(id: string): Promise<Deployment | null> {
  const { rows } = await pool.query<Deployment>(
    "select * from deployments where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function listDeployments(opts: {
  projectId?: string;
  limit?: number;
}): Promise<Deployment[]> {
  const limit = opts.limit ?? 20;
  if (opts.projectId) {
    const { rows } = await pool.query<Deployment>(
      `select * from deployments where project_id = $1
       order by created_at desc limit $2`,
      [opts.projectId, limit],
    );
    return rows;
  }
  const { rows } = await pool.query<Deployment>(
    "select * from deployments order by created_at desc limit $1",
    [limit],
  );
  return rows;
}

export async function updateDeployment(
  id: string,
  patch: Partial<
    Pick<
      Deployment,
      | "commit_sha"
      | "status"
      | "image_tag"
      | "container_id"
      | "host_port"
      | "error"
      | "started_at"
      | "finished_at"
    >
  >,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(`update deployments set ${sets} where id = $1`, [
    id,
    ...entries.map(([, v]) => v),
  ]);
}

/** Mark previous live deployments of a project as stopped (routing swap). */
export async function markOldDeploymentsStopped(
  projectId: string,
  exceptDeploymentId: string,
): Promise<Deployment[]> {
  const { rows } = await pool.query<Deployment>(
    `update deployments set status = 'stopped', finished_at = now()
     where project_id = $1 and status = 'live' and id != $2
     returning *`,
    [projectId, exceptDeploymentId],
  );
  return rows;
}

// ---------- build logs ----------

export async function appendBuildLog(
  deploymentId: string,
  seq: number,
  stream: BuildLogLine["stream"],
  line: string,
): Promise<void> {
  await pool.query(
    `insert into build_logs (deployment_id, seq, stream, line)
     values ($1, $2, $3, $4)`,
    [deploymentId, seq, stream, line],
  );
}

export async function getBuildLogs(
  deploymentId: string,
  afterSeq = 0,
): Promise<BuildLogLine[]> {
  const { rows } = await pool.query<BuildLogLine>(
    `select * from build_logs
     where deployment_id = $1 and seq > $2
     order by seq`,
    [deploymentId, afterSeq],
  );
  return rows;
}
