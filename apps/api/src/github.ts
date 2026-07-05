import { config } from "@mini-vercel/shared";

/**
 * Auto-attach the platform's push webhook to a project's GitHub repo, so a
 * `git push` deploys without any manual setup. Best-effort by design: a
 * missing token, a non-GitHub repo, or an API error must never block
 * registration — the project still works with manual deploys.
 */
export async function attachGithubWebhook(
  repoUrl: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<void> {
  if (!config.githubToken || !config.webhookUrl || !config.webhookSecret) return;
  const m = /github\.com[:/]([^/]+\/[^/.]+)/i.exec(repoUrl);
  if (!m) return;
  const slug = m[1]!;

  const headers = {
    authorization: `Bearer ${config.githubToken}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
  };

  try {
    const listRes = await fetch(`https://api.github.com/repos/${slug}/hooks`, {
      headers,
    });
    const hooks = (await listRes.json()) as
      | Array<{ config?: { url?: string } }>
      | { message?: string };
    if (!Array.isArray(hooks)) {
      log.warn(`webhook auto-attach: cannot list hooks on ${slug}: ${hooks.message}`);
      return;
    }
    if (hooks.some((h) => h.config?.url === config.webhookUrl)) {
      log.info(`webhook already attached to ${slug}`);
      return;
    }
    const res = await fetch(`https://api.github.com/repos/${slug}/hooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: config.webhookUrl,
          content_type: "json",
          secret: config.webhookSecret,
        },
      }),
    });
    if (res.status === 201) {
      log.info(`webhook attached to ${slug} — pushes now auto-deploy`);
    } else {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      log.warn(`webhook auto-attach failed on ${slug}: ${res.status} ${body.message ?? ""}`);
    }
  } catch (err) {
    log.warn(
      `webhook auto-attach errored on ${slug}: ${err instanceof Error ? err.message : err}`,
    );
  }
}
