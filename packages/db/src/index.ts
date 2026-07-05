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

/**
 * Create a queued deployment. A rollback pre-fills commit_sha and image_tag
 * from the deployment it re-deploys — the worker skips clone+build whenever
 * image_tag is already set.
 */
export async function createDeployment(
  projectId: string,
  prefill: {
    commitSha?: string | null;
    commitMessage?: string | null;
    imageTag?: string | null;
  } = {},
): Promise<Deployment> {
  const { rows } = await pool.query<Deployment>(
    `insert into deployments (project_id, status, commit_sha, commit_message, image_tag)
     values ($1, 'queued', $2, $3, $4)
     returning *`,
    [
      projectId,
      prefill.commitSha ?? null,
      prefill.commitMessage ?? null,
      prefill.imageTag ?? null,
    ],
  );
  return rows[0]!;
}

export async function getLiveDeployment(
  projectId: string,
): Promise<Deployment | null> {
  const { rows } = await pool.query<Deployment>(
    `select * from deployments
     where project_id = $1 and status = 'live'
     order by created_at desc limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

/**
 * The deployment a rollback would re-deploy: the newest previously-live
 * deployment whose commit differs from the currently-live one. Same-commit
 * deployments are skipped — their images are identical, so "rolling back"
 * to one would change nothing (and repeated rollbacks would ping-pong
 * between the last two tags without ever reaching an older version).
 */
export async function findRollbackTarget(
  projectId: string,
  liveCommitSha: string | null,
): Promise<Deployment | null> {
  const { rows } = await pool.query<Deployment>(
    `select * from deployments
     where project_id = $1
       and status in ('stopped', 'rolled_back')
       and image_tag is not null
       and commit_sha is distinct from $2
     order by created_at desc
     limit 1`,
    [projectId, liveCommitSha],
  );
  return rows[0] ?? null;
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
      | "commit_message"
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

/** Mark previous live deployments of a project as stopped (routing swap).
 *  A rollback passes 'rolled_back' instead, so history distinguishes
 *  "superseded by a newer push" from "undone by a rollback". */
export async function markOldDeploymentsStopped(
  projectId: string,
  exceptDeploymentId: string,
  status: "stopped" | "rolled_back" = "stopped",
): Promise<Deployment[]> {
  const { rows } = await pool.query<Deployment>(
    `update deployments set status = $3, finished_at = now()
     where project_id = $1 and status = 'live' and id != $2
     returning *`,
    [projectId, exceptDeploymentId, status],
  );
  return rows;
}

// ---------- routes ----------

/** Point a subdomain at a deployment (insert or move). */
export async function upsertRoute(
  subdomain: string,
  deploymentId: string,
): Promise<void> {
  await pool.query(
    `insert into routes (subdomain, deployment_id, updated_at)
     values ($1, $2, now())
     on conflict (subdomain)
     do update set deployment_id = excluded.deployment_id, updated_at = now()`,
    [subdomain, deploymentId],
  );
}

export async function deleteRoute(subdomain: string): Promise<void> {
  await pool.query("delete from routes where subdomain = $1", [subdomain]);
}

// ---------- build logs ----------

/** Append a log line, letting Postgres pick the next seq — a deployment can
 *  be logged to again after finishing (e.g. a later stop/teardown), so the
 *  writer can't assume it starts from zero. Safe because writes to one
 *  deployment are serialized (single worker, chained LogSink inserts). */
export async function appendBuildLog(
  deploymentId: string,
  stream: BuildLogLine["stream"],
  line: string,
): Promise<void> {
  await pool.query(
    `insert into build_logs (deployment_id, seq, stream, line)
     values ($1,
             (select coalesce(max(seq), 0) + 1 from build_logs
              where deployment_id = $1),
             $2, $3)`,
    [deploymentId, stream, line],
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
