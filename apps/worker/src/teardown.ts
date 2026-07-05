import {
  deleteProject,
  getDeployment,
  getProjectById,
  updateDeployment,
} from "@mini-vercel/db";
import {
  dockerRemoveContainer,
  dockerStop,
  listProjectContainers,
  pruneProjectImages,
} from "./docker.js";
import { LogSink } from "./logsink.js";
import { removeRoute } from "./routing.js";

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
