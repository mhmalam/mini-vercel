import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { config } from "@mini-vercel/shared";
import {
  getDeployment,
  getProjectById,
  markOldDeploymentsStopped,
  updateDeployment,
  type Deployment,
  type Project,
} from "@mini-vercel/db";
import { exec } from "./exec.js";
import {
  dockerBuild,
  dockerHostPort,
  dockerRun,
  dockerStop,
  listProjectContainers,
  pruneProjectImages,
} from "./docker.js";
import { LogSink } from "./logsink.js";
import { publicUrl, switchRoute } from "./routing.js";

const READINESS_TIMEOUT_MS = 60_000;
const READINESS_INTERVAL_MS = 1_000;

/**
 * The whole build-and-deploy pipeline for one deployment:
 * clone → docker build → run → wait until it answers HTTP → swap traffic
 * (stop the previous container) → prune old images.
 */
export async function runDeployment(deploymentId: string): Promise<void> {
  const deployment = await getDeployment(deploymentId);
  if (!deployment) throw new Error(`deployment ${deploymentId} not found`);
  const project = await getProjectById(deployment.project_id);
  if (!project) throw new Error(`project ${deployment.project_id} not found`);

  const log = new LogSink(deploymentId);
  const workdir = path.join(config.buildRoot, deploymentId);
  let containerId: string | null = null;

  try {
    // ---- clone ----
    await updateDeployment(deploymentId, {
      status: "building",
      started_at: new Date(),
    });
    log.system(`cloning ${project.repo_url} (branch ${project.branch})`);
    await mkdir(config.buildRoot, { recursive: true });
    await exec(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        project.branch,
        project.repo_url,
        workdir,
      ],
      { onLine: (s, l) => log.write(s, l), timeoutMs: config.buildTimeoutMs },
    );
    const sha = (await exec("git", ["-C", workdir, "rev-parse", "HEAD"])).trim();
    await updateDeployment(deploymentId, { commit_sha: sha });
    log.system(`checked out ${sha.slice(0, 12)}`);

    // ---- build ----
    const imageTag = `${project.name}:${deploymentId.slice(0, 8)}`;
    log.system(`building image ${imageTag}`);
    await dockerBuild(imageTag, workdir, {
      onLine: (s, l) => log.write(s, l),
      timeoutMs: config.buildTimeoutMs,
    });
    await updateDeployment(deploymentId, { image_tag: imageTag });

    // ---- run ----
    await updateDeployment(deploymentId, { status: "deploying" });
    log.system(`starting container (app port ${project.port})`);
    containerId = await dockerRun({
      imageTag,
      projectName: project.name,
      deploymentId,
      containerPort: project.port,
    });
    const hostPort = await dockerHostPort(containerId, project.port);
    await updateDeployment(deploymentId, {
      container_id: containerId,
      host_port: hostPort,
    });
    log.system(`container ${containerId.slice(0, 12)} on 127.0.0.1:${hostPort}`);

    // ---- readiness ----
    log.system("waiting for the app to answer HTTP...");
    await waitForHttp(hostPort, project.name);
    log.system("app is answering");

    // ---- route: point <project>.<domain> at the new container ----
    log.system(`routing ${project.name}.${config.baseDomain} -> 127.0.0.1:${hostPort}`);
    await switchRoute({
      projectName: project.name,
      deploymentId,
      hostPort,
      onWarning: (msg) => log.system(`warning: ${msg}`),
    });

    // ---- swap: stop previous containers only after the new one is up ----
    const oldContainers = (await listProjectContainers(project.name)).filter(
      (id) => !containerId!.startsWith(id) && !id.startsWith(containerId!),
    );
    for (const old of oldContainers) {
      log.system(`stopping previous container ${old}`);
      await dockerStop(old).catch((err) =>
        log.system(`warning: failed to stop ${old}: ${err.message}`),
      );
    }
    await markOldDeploymentsStopped(project.id, deploymentId);

    await updateDeployment(deploymentId, {
      status: "live",
      finished_at: new Date(),
    });
    log.system(`deployment live at ${publicUrl(project.name)}`);

    // ---- housekeeping ----
    const removed = await pruneProjectImages(
      project.name,
      config.keepImagesPerProject,
    ).catch(() => [] as string[]);
    if (removed.length) log.system(`pruned old images: ${removed.join(", ")}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.system(`FAILED: ${message}`);
    if (containerId) {
      await dockerStop(containerId).catch(() => {});
    }
    await updateDeployment(deploymentId, {
      status: "failed",
      error: message,
      finished_at: new Date(),
    });
    throw err;
  } finally {
    await log.flush();
    // Windows sometimes holds locks on fresh git objects; retry a few times.
    await rm(workdir, { recursive: true, force: true, maxRetries: 5 }).catch(
      (err) => console.error(`workdir cleanup failed for ${workdir}:`, err),
    );
  }
}

/** Any HTTP response (even a 500) counts as "the server is up". */
async function waitForHttp(port: number, host: string): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(3_000),
        headers: { Host: host },
      });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await sleep(READINESS_INTERVAL_MS);
    }
  }
  throw new Error(
    `app never answered on port ${port} within ${READINESS_TIMEOUT_MS / 1000}s (${lastError})`,
  );
}
