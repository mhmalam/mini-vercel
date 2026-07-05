"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, createDeployment, createProject } from "./api";

/** Queue a build for a project and jump to its log view. */
export async function deploy(project: string): Promise<void> {
  const deployment = await createDeployment(project);
  redirect(`/deployments/${deployment.id}`);
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
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/");
  redirect(`/projects/${encodeURIComponent(name)}`);
}
