import { exec, type ExecOptions } from "./exec.js";

/**
 * Thin wrappers around the docker CLI. Shell-outs were chosen over dockerode
 * for the MVP: the commands are exactly what you'd run by hand, which makes
 * failures debuggable. See docs/decisions.md.
 */

export async function dockerBuild(
  imageTag: string,
  contextDir: string,
  opts: Pick<ExecOptions, "onLine" | "timeoutMs">,
): Promise<void> {
  await exec("docker", ["build", "-t", imageTag, "."], {
    cwd: contextDir,
    ...opts,
  });
}

export interface RunOptions {
  imageTag: string;
  projectName: string;
  deploymentId: string;
  containerPort: number;
}

/**
 * Start a container with resource limits, bound to an ephemeral port on
 * 127.0.0.1 only (the proxy is the only thing that should be reachable from
 * outside). Returns the container id.
 */
export async function dockerRun(opts: RunOptions): Promise<string> {
  const out = await exec("docker", [
    "run",
    "-d",
    "--restart",
    "unless-stopped",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--label",
    `minivercel.project=${opts.projectName}`,
    "--label",
    `minivercel.deployment=${opts.deploymentId}`,
    "-p",
    `127.0.0.1::${opts.containerPort}`,
    opts.imageTag,
  ]);
  return out.trim();
}

/** Resolve the ephemeral host port Docker assigned for a container port. */
export async function dockerHostPort(
  containerId: string,
  containerPort: number,
): Promise<number> {
  const out = await exec("docker", [
    "port",
    containerId,
    `${containerPort}/tcp`,
  ]);
  // e.g. "127.0.0.1:55001" (possibly one line per address family)
  const first = out.split("\n")[0]?.trim() ?? "";
  const port = Number(first.split(":").pop());
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`could not parse host port from 'docker port': ${out}`);
  }
  return port;
}

export async function dockerStop(containerId: string): Promise<void> {
  await exec("docker", ["stop", containerId]);
}

/** List running container ids for a project. */
export async function listProjectContainers(
  projectName: string,
): Promise<string[]> {
  const out = await exec("docker", [
    "ps",
    "-q",
    "--filter",
    `label=minivercel.project=${projectName}`,
  ]);
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Keep the newest `keep` images for a project, remove the rest.
 * `docker images` lists newest first. In-use images fail to delete; that's
 * fine — they'll be caught on a later pass.
 */
export async function pruneProjectImages(
  projectName: string,
  keep: number,
): Promise<string[]> {
  const out = await exec("docker", [
    "images",
    projectName,
    "--format",
    "{{.Repository}}:{{.Tag}}",
  ]);
  const images = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const removed: string[] = [];
  for (const image of images.slice(keep)) {
    try {
      await exec("docker", ["rmi", image]);
      removed.push(image);
    } catch {
      /* in use or already gone */
    }
  }
  return removed;
}
