import {
  getDeployment,
  getProjectById,
  updateDeployment,
} from "@mini-vercel/db";
import { dockerStop, listProjectContainers } from "./docker.js";
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
