"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, safeEqual, sessionToken } from "./auth";
import {
  createDeployment,
  createProject,
  getDeployment,
  listProjects,
  removeProject as removeProjectApi,
  rollbackProject,
  stopProject as stopProjectApi,
  updateProject,
} from "./api";

export interface ActionResult {
  error?: string;
}

export interface LoginState {
  error?: string;
}

/** Verify the dashboard password and set the session cookie (30 days). */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) redirect("/"); // auth disabled — nothing to log into

  const supplied = String(formData.get("password") ?? "");
  if (!safeEqual(supplied, password)) {
    return { error: "wrong password" };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
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

/** Delete a project. Waits (bounded) until it's gone, then goes home. */
export async function removeProject(project: string): Promise<ActionResult> {
  try {
    await removeProjectApi(project);
    for (let i = 0; i < 20; i++) {
      const projects = await listProjects();
      if (!projects.some((p) => p.name === project)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/");
  redirect("/");
}

export interface EditProjectState {
  error?: string;
}

/** Edit name/branch/port. A rename re-homes the subdomain (worker job). */
export async function editProject(
  project: string,
  _prev: EditProjectState,
  formData: FormData,
): Promise<EditProjectState> {
  const name = String(formData.get("name") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim();
  const port = Number(String(formData.get("port") ?? "").trim());
  // always sent, "" clears the custom domains
  const customDomain = String(formData.get("customDomain") ?? "").trim();

  let updated;
  try {
    updated = await updateProject(project, {
      name: name || undefined,
      branch: branch || undefined,
      port: Number.isInteger(port) && port > 0 ? port : undefined,
      customDomain,
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/");
  redirect(`/projects/${encodeURIComponent(updated.name)}`);
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
