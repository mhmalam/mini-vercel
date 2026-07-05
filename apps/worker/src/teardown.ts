import {
  createDeployment,
  deleteProject,
  getDeployment,
  getLiveDeployment,
  getProjectById,
  updateDeployment,
} from "@mini-vercel/db";
import { runDeployment } from "./pipeline.js";
import {
  dockerRemoveContainer,
  dockerStop,
  listProjectContainers,
  pruneProjectImages,
} from "./docker.js";
import { LogSink } from "./logsink.js";
import { removeRoute, switchRoute } from "./routing.js";

/**
 * Take a project offline: drop its route (nginx returns 404 for the
 * subdomain), stop every container it has running, and mark the deployment
 * stopped. `deploy push` brings it back.
 */
export async function stopDeployment(deploymentId: string): Promise<void> {
  const deployment = await getDeployment(deploymentId);
  if (!deployment) throw new Error(`deployment ${deploymentId} not found`);
  const project = await getProjectById(deployment.project_id);
  if (!project) throw new Error(`project ${deployment.project_id} not found`);

  const log = new LogSink(deploymentId);
  try {
    log.system(`taking '${project.name}' down: removing route`);
    await removeRoute(project.name, (msg) => log.system(`warning: ${msg}`));

    for (const id of await listProjectContainers(project.name)) {
      log.system(`stopping container ${id}`);
      await dockerStop(id).catch((err) =>
        log.system(`warning: failed to stop ${id}: ${err.message}`),
      );
    }

    await updateDeployment(deploymentId, {
      status: "stopped",
      finished_at: new Date(),
    });
    log.system("project is offline — push to bring it back");
  } finally {
    await log.flush();
  }
}

/**
 * Delete a project outright: route, every container (running or not), all
 * its images, then the DB rows (deployments/logs/routes cascade). There is
 * no deployment to log to once this finishes, so progress goes to stdout.
 */
/**
 * Finish a rename (the API already updated the project row): retire the old
 * subdomain's route and old-labeled containers, then — if the project was
 * live — redeploy its current image so everything (labels, route, URL) is
 * reborn under the new name. Brief downtime is acceptable for a rename.
 */
export async function renameProject(
  projectId: string,
  oldName: string,
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) return;

  console.log(`[worker] renaming '${oldName}' -> '${project.name}'`);
  const live = await getLiveDeployment(projectId);

  await removeRoute(oldName, (msg) => console.warn(`[worker] warning: ${msg}`));
  for (const id of await listProjectContainers(oldName, { all: true })) {
    await dockerRemoveContainer(id).catch((err) =>
      console.warn(`[worker] warning: failed to remove ${id}: ${err.message}`),
    );
  }

  if (live?.image_tag) {
    // Same trick as rollback: pre-filled image_tag skips clone+build.
    const redeploy = await createDeployment(projectId, {
      commitSha: live.commit_sha,
      commitMessage: live.commit_message,
      imageTag: live.image_tag,
    });
    await updateDeployment(live.id, { status: "stopped", finished_at: new Date() });
    await runDeployment(redeploy.id);
  }
  console.log(`[worker] rename to '${project.name}' complete`);
}

/**
 * Rewrite a live project's nginx block without touching its container —
 * used when custom domains change. No live deployment = nothing to route.
 */
export async function rerouteProject(projectId: string): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) return;
  const live = await getLiveDeployment(projectId);
  if (!live?.host_port) return;
  console.log(`[worker] rerouting '${project.name}' (custom domains changed)`);
  await switchRoute({
    project,
    deploymentId: live.id,
    hostPort: live.host_port,
    onWarning: (msg) => console.warn(`[worker] warning: ${msg}`),
  });
}

export async function removeProject(projectId: string): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) return; // already gone — removal is idempotent

  console.log(`[worker] removing project '${project.name}'`);
  await removeRoute(project.name, (msg) =>
    console.warn(`[worker] warning: ${msg}`),
  );
  for (const id of await listProjectContainers(project.name, { all: true })) {
    await dockerRemoveContainer(id).catch((err) =>
      console.warn(`[worker] warning: failed to remove ${id}: ${err.message}`),
    );
  }
  await pruneProjectImages(project.name, 0).catch(() => []);
  await deleteProject(projectId);
  console.log(`[worker] project '${project.name}' removed`);
}
