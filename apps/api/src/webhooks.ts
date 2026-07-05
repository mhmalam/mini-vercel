import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "@mini-vercel/shared";
import { createDeployment, listProjects } from "@mini-vercel/db";
import { buildQueue } from "./queue.js";

/** The parts of GitHub's push payload this endpoint reads. */
interface PushPayload {
  ref?: string;
  repository?: { clone_url?: string; html_url?: string; ssh_url?: string };
}

/** Trailing ".git", trailing slashes, and case don't matter for matching. */
function normalizeRepoUrl(url: string): string {
  return url.trim().replace(/\.git$/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * GitHub push-to-deploy webhook. No bearer auth here — GitHub can't send our
 * token; instead every request must carry an X-Hub-Signature-256 HMAC over
 * the raw body, keyed with GITHUB_WEBHOOK_SECRET (empty secret = disabled).
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // GitHub signs the raw bytes, so within this plugin JSON bodies are kept
  // as buffers and only parsed after the signature checks out.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  app.post("/api/webhooks/github", async (req, reply) => {
    if (!config.webhookSecret) {
      return reply.code(503).send({
        error:
          "webhooks are disabled — set GITHUB_WEBHOOK_SECRET (and the same secret on the GitHub webhook) to enable this endpoint",
      });
    }
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return reply.code(400).send({ error: "expected a JSON body" });
    }

    const signature = req.headers["x-hub-signature-256"];
    const expected = `sha256=${createHmac("sha256", config.webhookSecret)
      .update(raw)
      .digest("hex")}`;
    if (
      typeof signature !== "string" ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    const event = req.headers["x-github-event"];
    if (event !== "push") {
      return reply.send({ ignored: `event '${event}' — only push deploys` });
    }

    let payload: PushPayload;
    try {
      payload = JSON.parse(raw.toString("utf8")) as PushPayload;
    } catch {
      return reply.code(400).send({ error: "body is not valid JSON" });
    }

    // GitHub reports the repo under several URL styles; a project matches if
    // its repo_url equals any of them. Branch is checked per project so two
    // projects can deploy different branches of the same repo.
    const repoUrls = [
      payload.repository?.clone_url,
      payload.repository?.html_url,
      payload.repository?.ssh_url,
    ]
      .filter((u): u is string => typeof u === "string")
      .map(normalizeRepoUrl);
    const candidates = (await listProjects()).filter((p) =>
      repoUrls.includes(normalizeRepoUrl(p.repo_url)),
    );
    if (candidates.length === 0) {
      return reply.send({ ignored: "no project matches this repository" });
    }
    const project = candidates.find(
      (p) => payload.ref === `refs/heads/${p.branch}`,
    );
    if (!project) {
      return reply.send({
        ignored: `ref '${payload.ref}' does not match a configured branch`,
      });
    }

    const deployment = await createDeployment(project.id);
    await buildQueue.add(
      "build",
      { deploymentId: deployment.id },
      { jobId: deployment.id },
    );
    req.log.info(
      { project: project.name, deploymentId: deployment.id },
      "webhook push deploy queued",
    );
    return reply
      .code(202)
      .send({ deploymentId: deployment.id, project: project.name });
  });
}
