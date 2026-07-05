#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Command } from "commander";

// The CLI is intentionally standalone (no workspace imports): it will run
// from any laptop against the API, so it only needs an URL and a token.
const API_URL = process.env.DEPLOY_API_URL ?? "http://127.0.0.1:4000";
const API_TOKEN = process.env.DEPLOY_API_TOKEN ?? "dev-token-change-me";

const TERMINAL = new Set(["live", "failed", "stopped", "rolled_back"]);

interface Deployment {
  id: string;
  project_id: string;
  commit_sha: string | null;
  status: string;
  host_port: number | null;
  error: string | null;
  created_at: string;
}

interface LogLine {
  seq: string | number; // bigint arrives as a string over REST, a number over WS
  stream: string;
  line: string;
}

async function api<T>(
  method: string,
  route: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${API_TOKEN}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail(`could not reach the API at ${API_URL} — is it running?`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    fail(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
  }
  return data as T;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Project name from arg, or from a deploy.json in the current directory. */
function resolveProject(arg?: string): string {
  if (arg) return arg;
  try {
    const raw = readFileSync(path.join(process.cwd(), "deploy.json"), "utf8");
    const parsed = JSON.parse(raw) as { project?: string };
    if (parsed.project) return parsed.project;
  } catch {
    /* fall through */
  }
  fail(
    "no project given — pass a name (deploy push <project>) or add a deploy.json with {\"project\": \"name\"}",
  );
}

/**
 * Follow a deployment's logs until it reaches a terminal state: prefer the
 * API's live WebSocket stream, fall back to 1s polling if the stream is
 * unavailable (older API, proxy in the way, ...).
 */
async function follow(deploymentId: string): Promise<void> {
  // Highest seq printed so far — shared between stream and poll so a
  // fallback mid-stream doesn't reprint lines.
  const seen = { after: 0 };
  const print = (l: LogLine) => {
    if (Number(l.seq) <= seen.after) return;
    const prefix = l.stream === "system" ? "==> " : "    ";
    console.log(`${prefix}${l.line}`);
    seen.after = Number(l.seq);
  };

  let status: string;
  try {
    status = await followStream(deploymentId, print);
  } catch {
    status = await followPoll(deploymentId, print, seen);
  }

  const d = await api<Deployment>("GET", `/api/deployments/${deploymentId}`);
  if (status === "failed") {
    fail(`deployment failed: ${d.error ?? "see logs above"}`);
  }
  console.log(`\ndeployment ${status}`);
  if (status === "live" && d.host_port) {
    console.log(`serving on http://127.0.0.1:${d.host_port}`);
  }
}

/**
 * Stream logs over the API's WebSocket endpoint (Node >= 22 ships a global
 * WebSocket). Resolves with the final status from the server's {done, status}
 * message; rejects if the stream drops first so the caller can fall back.
 */
function followStream(
  deploymentId: string,
  onLine: (l: LogLine) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url =
      `${API_URL.replace(/^http/, "ws")}/api/deployments/${deploymentId}` +
      `/logs/stream?token=${encodeURIComponent(API_TOKEN)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      return reject(err);
    }
    let settled = false;
    ws.addEventListener("message", (ev) => {
      let msg: Partial<LogLine> & { done?: boolean; status?: string };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.done && msg.status) {
        settled = true;
        ws.close();
        resolve(msg.status);
      } else if (msg.seq !== undefined) {
        onLine(msg as LogLine);
      }
    });
    ws.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        reject(new Error("log stream unavailable"));
      }
    });
    ws.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        reject(new Error("log stream closed before the deployment finished"));
      }
    });
  });
}

/** Poll status + logs every second until a terminal state (WS fallback). */
async function followPoll(
  deploymentId: string,
  onLine: (l: LogLine) => void,
  seen: { after: number },
): Promise<string> {
  for (;;) {
    const { status, lines } = await api<{ status: string; lines: LogLine[] }>(
      "GET",
      `/api/deployments/${deploymentId}/logs?after=${seen.after}`,
    );
    for (const l of lines) onLine(l);
    if (TERMINAL.has(status)) return status;
    await sleep(1000);
  }
}

const program = new Command("deploy").description(
  "mini-vercel — deploy your projects from the terminal",
);

program
  .command("projects:add <name>")
  .description("register a project (name becomes its subdomain)")
  .requiredOption("--repo <url>", "git repository URL")
  .option("--branch <branch>", "branch to deploy", "main")
  .option("--port <port>", "port the app listens on in its container", "3000")
  .action(async (name: string, opts: { repo: string; branch: string; port: string }) => {
    const project = await api<{ name: string }>("POST", "/api/projects", {
      name,
      repoUrl: opts.repo,
      branch: opts.branch,
      port: Number(opts.port),
    });
    console.log(`project '${project.name}' registered`);
  });

program
  .command("projects")
  .description("list registered projects")
  .action(async () => {
    const projects = await api<
      { name: string; repo_url: string; branch: string; port: number }[]
    >("GET", "/api/projects");
    if (!projects.length) return console.log("no projects yet");
    for (const p of projects) {
      console.log(`${p.name}  ${p.repo_url} (${p.branch})  port ${p.port}`);
    }
  });

program
  .command("push [project]")
  .description("build and deploy the latest commit of a project's branch")
  .action(async (projectArg?: string) => {
    const name = resolveProject(projectArg);
    const deployment = await api<Deployment>(
      "POST",
      `/api/projects/${name}/deployments`,
    );
    console.log(`deployment ${deployment.id} queued for '${name}'\n`);
    await follow(deployment.id);
  });

program
  .command("rollback [project]")
  .description("re-deploy the previous version of a project")
  .action(async (projectArg?: string) => {
    const name = resolveProject(projectArg);
    const deployment = await api<Deployment>(
      "POST",
      `/api/projects/${name}/rollback`,
    );
    console.log(`rollback deployment ${deployment.id} queued for '${name}'\n`);
    await follow(deployment.id);
  });

program
  .command("list [project]")
  .description("list recent deployments (optionally for one project)")
  .action(async (projectArg?: string) => {
    const qs = projectArg ? `?project=${encodeURIComponent(projectArg)}` : "";
    const deployments = await api<Deployment[]>("GET", `/api/deployments${qs}`);
    if (!deployments.length) return console.log("no deployments yet");
    for (const d of deployments) {
      const sha = d.commit_sha ? d.commit_sha.slice(0, 8) : "--------";
      const url = d.host_port ? `http://127.0.0.1:${d.host_port}` : "";
      console.log(
        `${d.id}  ${d.status.padEnd(11)}  ${sha}  ${new Date(d.created_at).toLocaleString()}  ${url}`,
      );
    }
  });

program
  .command("logs <deploymentId>")
  .description("print build logs for a deployment (follows if still running)")
  .action(async (deploymentId: string) => {
    await follow(deploymentId);
  });

program.parseAsync().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
