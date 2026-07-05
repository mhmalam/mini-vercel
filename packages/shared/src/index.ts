export * from "./config.js";
export * from "./redis.js";

/** Name of the BullMQ queue that build jobs go through. */
export const BUILD_QUEUE = "builds";

/** Payload of a build job. Everything else is looked up from Postgres.
 *  "deploy" and "stop" act on a deployment; "remove" deletes a whole
 *  project (containers, route, images, DB rows); "rename" re-homes a
 *  project onto its new subdomain (oldName = the label/route to retire). */
export interface BuildJobData {
  deploymentId?: string;
  projectId?: string;
  oldName?: string;
  action?: "deploy" | "stop" | "remove" | "rename";
}

export const DEPLOYMENT_STATUSES = [
  "queued",
  "building",
  "deploying",
  "live",
  "failed",
  "stopped",
  "rolled_back",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

/** Statuses after which a deployment will never change again on its own. */
export const TERMINAL_STATUSES: DeploymentStatus[] = [
  "live",
  "failed",
  "stopped",
  "rolled_back",
];

/** Project names become subdomains, so keep them DNS-label safe. */
export const PROJECT_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
