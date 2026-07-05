// Server-side only (like api.ts): called from server components; client
// components import only the GithubRepo type, which compiles away.
export interface GithubRepo {
  name: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string | null;
}

const OWNERS = (process.env.ALLOWED_REPO_OWNERS ?? "mhmalam")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Public repos of the allowed owner(s), for the register-a-project picker.
 * Unauthenticated GitHub API (60 req/h) is plenty for an owner-only tool,
 * and Next caches it for 5 minutes. Failures degrade to an empty list —
 * the form still accepts a manual URL.
 */
export async function listGithubRepos(): Promise<GithubRepo[]> {
  const results = await Promise.all(
    OWNERS.map(async (owner) => {
      try {
        const res = await fetch(
          `https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`,
          {
            headers: { accept: "application/vnd.github+json" },
            next: { revalidate: 300 },
          },
        );
        if (!res.ok) return [];
        const repos = (await res.json()) as Array<{
          name: string;
          clone_url: string;
          default_branch: string;
          description: string | null;
        }>;
        return repos.map((r) => ({
          name: r.name,
          cloneUrl: r.clone_url,
          defaultBranch: r.default_branch,
          description: r.description,
        }));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
