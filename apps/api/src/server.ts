import Fastify from "fastify";
import { config, PROJECT_NAME_RE } from "@mini-vercel/shared";
import {
  createDeployment,
  createProject,
  getBuildLogs,
  getDeployment,
  getProjectByName,
  listDeployments,
  listProjects,
} from "@mini-vercel/db";
import { buildQueue } from "./queue.js";

const app = Fastify({ logger: true });

// The control plane can start containers on this box — treat it as root.
// Everything except the health check requires the bearer token.
app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${config.apiToken}`) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/health", async () => ({ ok: true }));

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
