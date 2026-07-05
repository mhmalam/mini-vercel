"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createDeployment,
  createProject,
  getDeployment,
  rollbackProject,
  stopProject as stopProjectApi,
} from "./api";

export interface ActionResult {
  error?: string;
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/** Queue a build for a project and jump to its log view. */
export async function deploy(project: string): Promise<ActionResult> {
  let deployment;
  try {
    deployment = await createDeployment(project);
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/deployments/${deployment.id}`);
}

/** Re-deploy the previous version's image and jump to its log view. */
export async function rollback(project: string): Promise<ActionResult> {
  let deployment;
  try {
    deployment = await rollbackProject(project);
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/deployments/${deployment.id}`);
}

/**
 * Take a project offline. The worker does the teardown async; wait (bounded)
 * for the status flip so the refreshed page shows reality, not a race.
 */
export async function stopProject(project: string): Promise<ActionResult> {
  try {
    const { deploymentId } = await stopProjectApi(project);
    for (let i = 0; i < 15; i++) {
      const d = await getDeployment(deploymentId);
      if (d.status !== "live") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/");
  revalidatePath(`/projects/${encodeURIComponent(project)}`);
  return {};
}

export interface AddProjectState {
  error?: string;
}

/** Register a new project (form on the index page). */
export async function addProject(
  _prev: AddProjectState,
  formData: FormData,
): Promise<AddProjectState> {
  const name = String(formData.get("name") ?? "").trim();
  const repoUrl = String(formData.get("repoUrl") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim() || "main";
  const port = Number(String(formData.get("port") ?? "").trim() || "3000");

  try {
    await createProject({ name, repoUrl, branch, port });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/");
  redirect(`/projects/${encodeURIComponent(name)}`);
}
