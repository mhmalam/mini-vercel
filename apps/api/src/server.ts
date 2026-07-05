import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { config, PROJECT_NAME_RE } from "@mini-vercel/shared";
import {
  createDeployment,
  createProject,
  findRollbackTarget,
  getBuildLogs,
  getDeployment,
  getLiveDeployment,
  getProjectByName,
  listDeployments,
  listProjects,
  updateProject,
} from "@mini-vercel/db";
import { buildQueue } from "./queue.js";
import { logStreamRoutes } from "./logstream.js";
import { webhookRoutes } from "./webhooks.js";

const app = Fastify({ logger: true });

// The control plane can start containers on this box — treat it as root.
// Everything except the health check requires the bearer token. The GitHub
// webhook is also exempt: it authenticates with its own HMAC signature.
app.addHook("onRequest", async (req, reply) => {
  const route = req.url.split("?")[0] ?? req.url;
  if (route === "/health" || route === "/api/webhooks/github") return;
  if (req.headers.authorization === `Bearer ${config.apiToken}`) return;
  // Browsers can't set headers on a WebSocket handshake, so the log stream
  // also accepts the token as a ?token= query parameter.
  if (route.endsWith("/logs/stream")) {
    const token = new URL(req.url, "http://x").searchParams.get("token");
    if (token === config.apiToken) return;
  }
  return reply.code(401).send({ error: "unauthorized" });
});

app.register(websocket);
app.register(logStreamRoutes);
app.register(webhookRoutes);

app.get("/health", async () => ({ ok: true }));

/**
 * The platform runs whatever it clones, so registration is limited to repos
 * under the owner's GitHub account(s). Local paths stay allowed in local dev
 * (smoke tests); on the VPS baseDomain isn't "localhost" so they're refused.
 */
function repoAllowed(repoUrl: string): boolean {
  const m = /^(?:https:\/\/|git@)github\.com[:/]([^/]+)\//i.exec(repoUrl.trim());
  if (m) return config.allowedRepoOwners.includes(m[1]!.toLowerCase());
  return config.baseDomain === "localhost";
}

// ---------- projects ----------

app.post<{
  Body: { name?: string; repoUrl?: string; branch?: string; port?: number };
}>("/api/projects", async (req, reply) => {
  const { name, repoUrl, branch, port } = req.body ?? {};
  if (!name || !PROJECT_NAME_RE.test(name)) {
    return reply.code(400).send({
      error: "name is required and must be a DNS-safe label (a-z, 0-9, -)",
    });
  }
  if (!repoUrl) {
    return reply.code(400).send({ error: "repoUrl is required" });
  }
  if (!repoAllowed(repoUrl)) {
    return reply.code(403).send({
      error: `repo not allowed — only repos owned by ${config.allowedRepoOwners.join(", ")} can be registered (ALLOWED_REPO_OWNERS)`,
    });
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return reply.code(400).send({ error: "port must be a valid TCP port" });
  }
  if (await getProjectByName(name)) {
    return reply.code(409).send({ error: `project '${name}' already exists` });
  }
  const project = await createProject({ name, repoUrl, branch, port });
  return reply.code(201).send(project);
});

app.get("/api/projects", async () => listProjects());

// ---------- deployments ----------

app.post<{ Params: { name: string } }>(
  "/api/projects/:name/deployments",
  async (req, reply) => {
    const project = await getProjectByName(req.params.name);
    if (!project) {
      return reply.code(404).send({ error: "project not found" });
    }
    const deployment = await createDeployment(project.id);
    await buildQueue.add(
      "build",
      { deploymentId: deployment.id },
      { jobId: deployment.id },
    );
    return reply.code(201).send(deployment);
  },
);

// Rollback: re-deploy the newest previously-live image of a different commit.
// The row is created with commit_sha/image_tag pre-filled, which tells the
// worker to skip clone+build and go straight to run → readiness → swap.
app.post<{ Params: { name: string } }>(
  "/api/projects/:name/rollback",
  async (req, reply) => {
    const project = await getProjectByName(req.params.name);
    if (!project) {
      return reply.code(404).send({ error: "project not found" });
    }
    const live = await getLiveDeployment(project.id);
    const target = await findRollbackTarget(project.id, live?.commit_sha ?? null);
    if (!target) {
      return reply.code(404).send({
        error: `nothing to roll back to — '${project.name}' has no previously-live deployment of a different commit`,
      });
    }
    const deployment = await createDeployment(project.id, {
      commitSha: target.commit_sha,
      commitMessage: target.commit_message,
      imageTag: target.image_tag,
    });
    await buildQueue.add(
      "build",
      { deploymentId: deployment.id },
      { jobId: deployment.id },
    );
    return reply.code(201).send(deployment);
  },
);

// Edit a project. branch/port take effect on the next deploy. A name change
// also re-homes the subdomain: the worker retires the old route/containers
// and redeploys the current image under the new name (brief downtime).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

app.patch<{
  Params: { name: string };
  Body: { name?: string; branch?: string; port?: number; customDomain?: string };
}>("/api/projects/:name", async (req, reply) => {
  const project = await getProjectByName(req.params.name);
  if (!project) {
    return reply.code(404).send({ error: "project not found" });
  }
  const { name, branch, port, customDomain } = req.body ?? {};

  // customDomain: space/comma-separated hostnames; "" clears. Rewrites the
  // live nginx block via a reroute job so it applies without a redeploy.
  let customDomainValue: string | null | undefined;
  if (customDomain !== undefined) {
    const domains = customDomain
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    for (const d of domains) {
      if (!DOMAIN_RE.test(d)) {
        return reply.code(400).send({ error: `'${d}' is not a valid hostname` });
      }
    }
    customDomainValue = domains.length ? domains.join(" ") : null;
  }
  if (name !== undefined && !PROJECT_NAME_RE.test(name)) {
    return reply.code(400).send({
      error: "name must be a DNS-safe label (a-z, 0-9, -)",
    });
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return reply.code(400).send({ error: "port must be a valid TCP port" });
  }
  const renaming = name !== undefined && name !== project.name;
  if (renaming && (await getProjectByName(name!))) {
    return reply.code(409).send({ error: `project '${name}' already exists` });
  }
  const updated = await updateProject(project.id, {
    name,
    branch,
    port,
    custom_domain: customDomainValue,
  });
  if (renaming) {
    await buildQueue.add(
      "rename",
      { projectId: project.id, oldName: project.name, action: "rename" },
      { jobId: `rename-${project.id}-${name}` },
    );
  } else if (
    customDomainValue !== undefined &&
    customDomainValue !== project.custom_domain
  ) {
    await buildQueue.add(
      "reroute",
      { projectId: project.id, action: "reroute" },
      { jobId: `reroute-${project.id}-${Date.now()}` },
    );
  }
  return updated;
});

// Delete a project entirely: the worker removes its route, containers,
// and images, then the DB rows cascade away. Idempotent on the worker side.
app.delete<{ Params: { name: string } }>(
  "/api/projects/:name",
  async (req, reply) => {
    const project = await getProjectByName(req.params.name);
    if (!project) {
      return reply.code(404).send({ error: "project not found" });
    }
    await buildQueue.add(
      "remove",
      { projectId: project.id, action: "remove" },
      { jobId: `remove-${project.id}` },
    );
    return reply.code(202).send({ ok: true });
  },
);

// Take a project offline: the worker drops its route and stops its
// containers. `deploy push` (or the dashboard's Deploy) brings it back.
app.post<{ Params: { name: string } }>(
  "/api/projects/:name/stop",
  async (req, reply) => {
    const project = await getProjectByName(req.params.name);
    if (!project) {
      return reply.code(404).send({ error: "project not found" });
    }
    const live = await getLiveDeployment(project.id);
    if (!live) {
      return reply
        .code(409)
        .send({ error: `'${project.name}' has no live deployment to stop` });
    }
    await buildQueue.add(
      "stop",
      { deploymentId: live.id, action: "stop" },
      { jobId: `${live.id}-stop` },
    );
    return reply.code(202).send({ deploymentId: live.id });
  },
);

app.get<{ Querystring: { project?: string; limit?: string } }>(
  "/api/deployments",
  async (req, reply) => {
    let projectId: string | undefined;
    if (req.query.project) {
      const project = await getProjectByName(req.query.project);
      if (!project) {
        return reply.code(404).send({ error: "project not found" });
      }
      projectId = project.id;
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return listDeployments({ projectId, limit });
  },
);

app.get<{ Params: { id: string } }>(
  "/api/deployments/:id",
  async (req, reply) => {
    const deployment = await getDeployment(req.params.id);
    if (!deployment) {
      return reply.code(404).send({ error: "deployment not found" });
    }
    return deployment;
  },
);

app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
  "/api/deployments/:id/logs",
  async (req, reply) => {
    const deployment = await getDeployment(req.params.id);
    if (!deployment) {
      return reply.code(404).send({ error: "deployment not found" });
    }
    const after = req.query.after ? Number(req.query.after) : 0;
    const lines = await getBuildLogs(req.params.id, after);
    return { status: deployment.status, lines };
  },
);

app
  .listen({ port: config.apiPort, host: "127.0.0.1" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
